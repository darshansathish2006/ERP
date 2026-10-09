import { useMemo, useState, type FormEvent } from 'react';
import { api, errorMessage } from '../../lib/api';
import type { SystemDef } from '../../lib/types';
import { Button, Field, Input, Select } from '../../components/ui';
import { Modal } from '../../components/overlay';
import { Combobox } from '../../components/Combobox';
import { useToast } from '../../components/feedback';
import { useMasters } from '../../context/MastersContext';

/** Profile roles the BOM engine uses, in display order. */
export const SYSTEM_ROLES: { key: string; label: string; optional?: boolean; ri?: boolean }[] = [
  { key: 'frame', label: 'Outer frame' },
  { key: 'frame3', label: 'Outer frame (3 track)' },
  { key: 'sash', label: 'Sash' },
  { key: 'bead', label: 'Glass bead' },
  { key: 'interlock', label: 'Interlock' },
  { key: 'mullion', label: 'Mullion' },
  { key: 'floatingMullion', label: 'Floating mullion', optional: true },
  { key: 'meshSash', label: 'Mesh sash' },
  { key: 'guideRail', label: 'Guide rail' },
  { key: 'monorail', label: 'Monorail track' },
  { key: 'louverHolder', label: 'Louver blade holder' },
  { key: 'riFrame', label: 'Reinforcement – frame', ri: true },
  { key: 'riSash', label: 'Reinforcement – sash', ri: true },
  { key: 'riMullion', label: 'Reinforcement – mullion', ri: true },
];

const LIMITS: { key: keyof SystemDef['limits']; label: string }[] = [
  { key: 'minWidth', label: 'Min width' },
  { key: 'maxWidth', label: 'Max width' },
  { key: 'minHeight', label: 'Min height' },
  { key: 'maxHeight', label: 'Max height' },
  { key: 'maxSashWidth', label: 'Max sash width' },
  { key: 'maxSashHeight', label: 'Max sash height' },
];

interface Form {
  name: string;
  brand: string;
  type: 'sliding' | 'casement';
  roles: Record<string, string>;
  limits: Record<string, string>;
}

const formOf = (s: SystemDef | undefined): Form => ({
  name: s?.name || '',
  brand: s?.brand || 'PROMINANCE',
  type: s?.type || 'sliding',
  roles: { ...(s?.roles || {}) },
  limits: Object.fromEntries(LIMITS.map((l) => [l.key, s?.limits?.[l.key] != null ? String(s.limits[l.key]) : ''])),
});

/** Add a profile system (optionally copying another one) or edit one. */
export function SystemModal({ system, onClose, onSaved }: { system?: SystemDef; onClose: () => void; onSaved?: () => void }) {
  const { masters, refresh } = useMasters();
  const toast = useToast();
  const [f, setF] = useState<Form>(() => (system ? formOf(system) : { ...formOf(masters.systems[0]), name: '' }));
  const [copyFrom, setCopyFrom] = useState(system ? '' : masters.systems[0]?.id || '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const profileOptions = useMemo(
    () => masters.items.filter((i) => i.category === 'profile' || i.category === 'aluminium').map((i) => ({ value: i.code, label: `${i.code} – ${i.name}` })),
    [masters.items],
  );
  const riOptions = useMemo(() => masters.items.filter((i) => i.category === 'reinforcement').map((i) => ({ value: i.code, label: `${i.code} – ${i.name}` })), [masters.items]);

  const setRole = (key: string, code: string) => {
    setF((p) => ({ ...p, roles: { ...p.roles, [key]: code } }));
    if (errors[`role.${key}`]) setErrors((p) => ({ ...p, [`role.${key}`]: '' }));
  };
  const setLimit = (key: string, v: string) => {
    setF((p) => ({ ...p, limits: { ...p.limits, [key]: v } }));
    if (errors.limits) setErrors((p) => ({ ...p, limits: '' }));
  };

  function validate() {
    const e: Record<string, string> = {};
    const name = f.name.trim();
    if (!name) e.name = 'System name is required';
    else if (masters.systems.some((s) => s.id !== system?.id && s.name.toUpperCase() === name.toUpperCase())) e.name = 'A system with this name already exists';
    for (const r of SYSTEM_ROLES) if (!r.optional && !f.roles[r.key]) e[`role.${r.key}`] = 'Choose an item';
    const lim = Object.fromEntries(LIMITS.map((l) => [l.key, Number(f.limits[l.key])]));
    if (LIMITS.some((l) => !(lim[l.key] >= 100 && lim[l.key] <= 12000))) e.limits = 'Every size limit must be between 100 and 12000 mm';
    else if (lim.minWidth > lim.maxWidth || lim.minHeight > lim.maxHeight) e.limits = 'Minimum sizes must not be larger than the maximum sizes';
    return e;
  }

  async function submit(ev?: FormEvent) {
    ev?.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.values(e).some(Boolean)) {
      toast.error('Please complete the highlighted fields');
      return;
    }
    setSaving(true);
    const body = {
      name: f.name.trim(),
      brand: f.brand.trim(),
      type: f.type,
      roles: Object.fromEntries(Object.entries(f.roles).filter(([, v]) => v)),
      limits: Object.fromEntries(LIMITS.map((l) => [l.key, Math.round(Number(f.limits[l.key]))])),
    };
    try {
      const saved = system ? await api.put<SystemDef>(`/api/masters/systems/${encodeURIComponent(system.id)}`, body) : await api.post<SystemDef>('/api/masters/systems', body);
      await refresh();
      onSaved?.();
      toast.success(system ? `${saved.name} updated` : `${saved.name} added`);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
      setSaving(false);
    }
  }

  const roleField = (r: (typeof SYSTEM_ROLES)[number]) => (
    <Field key={r.key} label={r.label} required={!r.optional} error={errors[`role.${r.key}`] || null}>
      <Combobox
        options={r.ri ? riOptions : profileOptions}
        value={f.roles[r.key] || ''}
        onChange={(v) => setRole(r.key, v)}
        placeholder={r.optional ? 'Not used' : 'Select item'}
        invalid={!!errors[`role.${r.key}`]}
        clearable={r.optional}
        sm
      />
    </Field>
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      closeOnBackdrop={false}
      title={system ? `Edit system · ${system.name}` : 'Add profile system'}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="adm-system-form" loading={saving} data-tour="masters-system-save">
            {system ? 'Save' : 'Add system'}
          </Button>
        </>
      }
    >
      <form id="adm-system-form" className="col gap-16" onSubmit={(e) => void submit(e)} noValidate>
        <div className="system-form-top">
          <Field label="System name" required error={errors.name || null} htmlFor="sy-name">
            <Input id="sy-name" value={f.name} maxLength={120} autoFocus invalid={!!errors.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. PROMINANCE ELITE SLIDING SERIES" style={{ textTransform: 'uppercase' }} />
          </Field>
          <Field label="Brand" htmlFor="sy-brand">
            <Input id="sy-brand" value={f.brand} maxLength={60} onChange={(e) => setF((p) => ({ ...p, brand: e.target.value }))} style={{ textTransform: 'uppercase' }} />
          </Field>
          <Field label="Type" required htmlFor="sy-type">
            <Select id="sy-type" value={f.type} onChange={(e) => setF((p) => ({ ...p, type: e.target.value as Form['type'] }))}>
              <option value="sliding">Sliding</option>
              <option value="casement">Casement</option>
            </Select>
          </Field>
          {!system && (
            <Field label="Copy profiles and limits from" htmlFor="sy-copy">
              <Select
                id="sy-copy"
                value={copyFrom}
                onChange={(e) => {
                  setCopyFrom(e.target.value);
                  const src = masters.systems.find((s) => s.id === e.target.value);
                  if (src) setF((p) => ({ ...formOf(src), name: p.name, brand: p.brand }));
                  setErrors({});
                }}
              >
                {masters.systems.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        <div>
          <div className="adm-section-title">Size limits (mm)</div>
          {errors.limits && <div className="field-error mb-8">{errors.limits}</div>}
          <div className="system-limits">
            {LIMITS.map((l) => (
              <Field key={l.key} label={l.label} htmlFor={`sy-${l.key}`}>
                <Input id={`sy-${l.key}`} type="number" min={100} max={12000} step={10} value={f.limits[l.key]} invalid={!!errors.limits} onChange={(e) => setLimit(l.key, e.target.value)} />
              </Field>
            ))}
          </div>
        </div>
        <div>
          <div className="adm-section-title">Profiles used by the bill of materials</div>
          <div className="system-roles">{SYSTEM_ROLES.filter((r) => !r.ri).map(roleField)}</div>
        </div>
        <div>
          <div className="adm-section-title">Reinforcement</div>
          <div className="system-roles">{SYSTEM_ROLES.filter((r) => r.ri).map(roleField)}</div>
        </div>
      </form>
    </Modal>
  );
}
