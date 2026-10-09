import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Edit3, Lock, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { GlassDef } from '../../lib/types';
import { Badge, Button, Empty, Field, IconButton, Input, Select } from '../../components/ui';
import { Modal } from '../../components/overlay';
import { useConfirm, useToast } from '../../components/feedback';
import { useMasters } from '../../context/MastersContext';
import { CODE_RE, RateInput, SearchBox, isValidRate, numStr, parseNum, useMasterUsage, usageText } from './shared';

type Kind = GlassDef['kind'];

const KIND_LABEL: Record<Kind, string> = { glass: 'Glass', louver: 'Louver', mesh: 'Mesh' };
const KIND_TONE: Record<Kind, 'primary' | 'warning' | 'grey'> = { glass: 'primary', louver: 'warning', mesh: 'grey' };

export function GlassTab({ onDirtyChange, readOnly = false }: { onDirtyChange: (dirty: boolean) => void; readOnly?: boolean }) {
  const { masters, refresh } = useMasters();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'' | Kind>('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<GlassDef | null>(null);
  const confirm = useConfirm();
  const { usage, refresh: refreshUsage } = useMasterUsage();

  const glasses = masters.glasses;

  async function remove(g: GlassDef) {
    const ok = await confirm({
      title: `Delete ${KIND_LABEL[g.kind].toLowerCase()}?`,
      message: (
        <>
          <b>{g.code}</b> {g.name} will be removed from the rate master and the glazing price levels.
        </>
      ),
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/api/masters/glasses/${encodeURIComponent(g.id)}`);
      await refresh();
      await refreshUsage();
      toast.success(`${g.name} deleted`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return glasses.filter((g) => (!kind || g.kind === kind) && (!q || g.code.toLowerCase().includes(q) || g.name.toLowerCase().includes(q)));
  }, [glasses, kind, search]);

  const changed = useMemo(() => glasses.filter((g) => drafts[g.id] !== undefined && parseNum(drafts[g.id]) !== g.rate), [glasses, drafts]);
  const invalidCount = changed.filter((g) => !isValidRate(drafts[g.id])).length;
  const dirty = changed.length > 0;

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  async function save() {
    if (!dirty) return;
    if (invalidCount) {
      toast.error('Please enter a valid rate (0 or more) for the highlighted rows.');
      return;
    }
    setSaving(true);
    const saved: string[] = [];
    const failed: string[] = [];
    let firstError = '';
    for (const g of changed) {
      try {
        await api.put<GlassDef>(`/api/masters/glasses/${encodeURIComponent(g.id)}`, { rate: parseNum(drafts[g.id]) });
        saved.push(g.id);
      } catch (e) {
        failed.push(g.code);
        if (!firstError) firstError = errorMessage(e);
      }
    }
    if (saved.length) await refresh();
    setDrafts((prev) => {
      const next = { ...prev };
      for (const id of saved) delete next[id];
      return next;
    });
    setSaving(false);
    if (saved.length) toast.success(saved.length === 1 ? 'Rates updated' : `Rates updated for ${saved.length} items`);
    if (failed.length) toast.error(`Could not update ${failed.join(', ')}: ${firstError}`);
  }

  return (
    <div className="list-card">
      <div className="toolbar adm-toolbar">
        <SearchBox value={search} onChange={setSearch} placeholder="Search code or name" />
        <Select sm value={kind} onChange={(e) => setKind(e.target.value as '' | Kind)} style={{ width: 140 }} aria-label="Kind">
          <option value="">All kinds</option>
          <option value="glass">Glass</option>
          <option value="louver">Louver</option>
          <option value="mesh">Mesh</option>
        </Select>
        <span className="adm-toolbar-note">{visible.length === glasses.length ? `${glasses.length} items` : `${visible.length} of ${glasses.length} items`}</span>
        <div className="adm-toolbar-spacer" />
        {dirty && (
          <>
            <span className="adm-toolbar-note warn">
              {changed.length} unsaved change{changed.length > 1 ? 's' : ''}
            </span>
            <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={() => setDrafts({})} disabled={saving}>
              Discard
            </Button>
          </>
        )}
        {!readOnly && (
          <>
            <Button size="sm" variant="primary" icon={<Save size={14} />} onClick={() => void save()} disabled={!dirty} loading={saving}>
              Save changes
            </Button>
            <Button size="sm" variant="outline-primary" icon={<Plus size={14} />} onClick={() => setAdding(true)} data-tour="masters-add-glass">
              Add glass
            </Button>
          </>
        )}
        {readOnly && <span className="adm-toolbar-note">View only</span>}
      </div>
      <div className="table-wrap">
        <table className="table adm-rate-table">
          <thead>
            <tr>
              <th style={{ width: 150 }}>Code</th>
              <th>Name</th>
              <th>Kind</th>
              <th className="num">Thickness (mm)</th>
              <th className="num" style={{ width: 160 }}>
                Rate per sqm (₹)
              </th>
              {!readOnly && <th style={{ width: 70 }} />}
            </tr>
          </thead>
          <tbody>
            {visible.map((g) => {
              const rowDirty = drafts[g.id] !== undefined && parseNum(drafts[g.id]) !== g.rate;
              return (
                <tr key={g.id} className={rowDirty ? 'adm-dirty' : ''}>
                  <td className="adm-mono nowrap">{g.code}</td>
                  <td className="adm-cell-main">{g.name}</td>
                  <td>
                    <Badge tone={KIND_TONE[g.kind]}>{KIND_LABEL[g.kind]}</Badge>
                  </td>
                  <td className="num">{g.thickness ? g.thickness : '—'}</td>
                  <td className="num">
                    <RateInput
                      value={drafts[g.id] ?? numStr(g.rate)}
                      onChange={(v) => setDrafts((prev) => ({ ...prev, [g.id]: v }))}
                      dirty={rowDirty}
                      label={`Rate per sqm for ${g.code}`}
                      disabled={saving || readOnly}
                    />
                  </td>
                  {!readOnly && (
                    <td className="nowrap">
                      <span className="row gap-4" style={{ flexWrap: 'nowrap' }}>
                        <IconButton size="sm" tip="Edit" tipPos="left" onClick={() => setEditing(g)} disabled={saving} data-tour="masters-glass-edit">
                          <Edit3 size={13} />
                        </IconButton>
                        {usage?.glasses[g.id] ? (
                          <IconButton size="sm" tip={`${usageText(usage.glasses[g.id])} – cannot be deleted`} tipPos="left" aria-label={`${g.code} is in use`} disabled>
                            <Lock size={13} />
                          </IconButton>
                        ) : (
                          <IconButton size="sm" tip="Delete" tipPos="left" onClick={() => void remove(g)} disabled={saving || !usage}>
                            <Trash2 size={13} />
                          </IconButton>
                        )}
                      </span>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length === 0 && <Empty title={glasses.length ? 'Nothing matches your search' : 'No glass or mesh added yet'} />}
      </div>
      {adding && <AddGlassModal onClose={() => setAdding(false)} onSaved={() => void refreshUsage()} />}
      {editing && <AddGlassModal glass={editing} kindLocked={!!usage?.glasses[editing.id]} onClose={() => setEditing(null)} onSaved={() => void refreshUsage()} />}
    </div>
  );
}

interface GlassForm {
  code: string;
  name: string;
  kind: Kind;
  thickness: string;
  rate: string;
  supplier: string;
}

/** Add glass / mesh, or edit it when `glass` is given (the code cannot change). */
function AddGlassModal({ onClose, glass, kindLocked, onSaved }: { onClose: () => void; glass?: GlassDef; kindLocked?: boolean; onSaved?: () => void }) {
  const { masters, refresh } = useMasters();
  const toast = useToast();
  const [f, setF] = useState<GlassForm>(
    glass
      ? { code: glass.code, name: glass.name, kind: glass.kind, thickness: String(glass.thickness ?? ''), rate: String(glass.rate), supplier: glass.supplier || '' }
      : { code: '', name: '', kind: 'glass', thickness: '4', rate: '', supplier: '' },
  );
  const [errors, setErrors] = useState<Partial<Record<keyof GlassForm, string>>>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof GlassForm>(key: K, value: GlassForm[K]) => {
    setF((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  function validate() {
    const e: Partial<Record<keyof GlassForm, string>> = {};
    const code = f.code.trim();
    const id = `${f.kind}-${code.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    if (glass) {
      // code is fixed when editing
    } else if (!code) e.code = 'Code is required';
    else if (!CODE_RE.test(code)) e.code = 'Use letters, numbers, dot, dash or underscore only';
    else if (masters.glasses.some((g) => g.code.toUpperCase() === code.toUpperCase() || g.id === id)) e.code = 'This glass already exists';
    if (!f.name.trim()) e.name = 'Name is required';
    if (f.kind !== 'mesh') {
      const t = parseNum(f.thickness);
      if (t === null || t <= 0 || t > 60) e.thickness = 'Enter a thickness between 1 and 60 mm';
    }
    if (!isValidRate(f.rate)) e.rate = 'Enter a rate of 0 or more';
    return e;
  }

  async function submit(ev?: FormEvent) {
    ev?.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    if (glass) {
      try {
        const saved = await api.put<GlassDef>(`/api/masters/glasses/${encodeURIComponent(glass.id)}`, {
          name: f.name.trim(),
          ...(kindLocked ? {} : { kind: f.kind }),
          thickness: f.kind === 'mesh' ? 0 : parseNum(f.thickness),
          rate: parseNum(f.rate),
          supplier: f.supplier.trim(),
        });
        await refresh();
        onSaved?.();
        toast.success(`${saved.name} updated`);
        onClose();
      } catch (err) {
        toast.error(errorMessage(err));
        setSaving(false);
      }
      return;
    }
    try {
      const created = await api.post<GlassDef>('/api/masters/glasses', {
        code: f.code.trim().toUpperCase(),
        name: f.name.trim(),
        kind: f.kind,
        thickness: f.kind === 'mesh' ? 0 : parseNum(f.thickness),
        rate: parseNum(f.rate),
        supplier: f.supplier.trim() || undefined,
      });
      await refresh();
      onSaved?.();
      toast.success(`${created.name} added`);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={glass ? `Edit ${glass.code}` : 'Add glass / mesh'}
      closeOnBackdrop={false}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="adm-add-glass" loading={saving}>
            {glass ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <form id="adm-add-glass" className="adm-form-grid" onSubmit={(e) => void submit(e)} noValidate>
        <Field label="Code" required error={errors.code} htmlFor="ag-code">
          <Input id="ag-code" value={f.code} onChange={(e) => set('code', e.target.value)} invalid={!!errors.code} autoFocus={!glass} disabled={!!glass} maxLength={40} placeholder="e.g. CG0005PL" style={{ textTransform: 'uppercase' }} />
        </Field>
        <Field label="Kind" required htmlFor="ag-kind" hint={glass && kindLocked ? 'Used by designs – the kind cannot change' : undefined}>
          <Select id="ag-kind" value={f.kind} onChange={(e) => set('kind', e.target.value as Kind)} disabled={!!glass && kindLocked}>
            <option value="glass">Glass</option>
            <option value="louver">Louver glass</option>
            <option value="mesh">Insect mesh</option>
          </Select>
        </Field>
        <Field label="Name" required error={errors.name} className="adm-span-2" htmlFor="ag-name">
          <Input id="ag-name" value={f.name} onChange={(e) => set('name', e.target.value)} invalid={!!errors.name} maxLength={120} placeholder="e.g. 5MM PLAIN GLASS" />
        </Field>
        <Field label="Thickness (mm)" required={f.kind !== 'mesh'} error={errors.thickness} htmlFor="ag-thk" hint={f.kind === 'mesh' ? 'Not applicable for mesh' : undefined}>
          <Input
            id="ag-thk"
            type="number"
            min={0}
            step="0.5"
            value={f.kind === 'mesh' ? '' : f.thickness}
            disabled={f.kind === 'mesh'}
            onChange={(e) => set('thickness', e.target.value)}
            invalid={!!errors.thickness}
          />
        </Field>
        <Field label="Rate per sqm (₹)" required error={errors.rate} htmlFor="ag-rate">
          <div className="input-rupee">
            <Input id="ag-rate" type="number" min={0} step="0.01" inputMode="decimal" value={f.rate} onChange={(e) => set('rate', e.target.value)} invalid={!!errors.rate} placeholder="0.00" />
          </div>
        </Field>
        <Field label="Supplier" hint="Optional" htmlFor="ag-sup" className="adm-span-2">
          <Input id="ag-sup" value={f.supplier} list="ag-suppliers" maxLength={80} onChange={(e) => set('supplier', e.target.value)} placeholder="e.g. Saint-Gobain" />
          <datalist id="ag-suppliers">
            {masters.glazingSuppliers.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
      </form>
    </Modal>
  );
}
