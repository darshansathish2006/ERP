import { useMemo, useState, type FormEvent } from 'react';
import { Edit3, Lock, Palette, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { ColorDef } from '../../lib/types';
import { Badge, Button, Empty, Field, IconButton, Input, Select, Switch } from '../../components/ui';
import { Modal } from '../../components/overlay';
import { useConfirm, useToast } from '../../components/feedback';
import { useMasters } from '../../context/MastersContext';
import { ColorSwatch, SearchBox, useMasterUsage, usageText } from './shared';

const HEX_RE = /^#[0-9a-f]{6}$/i;

export function ColorsTab({ readOnly = false }: { readOnly?: boolean }) {
  const { masters, refresh } = useMasters();
  const toast = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ColorDef | null>(null);
  const { usage, refresh: refreshUsage } = useMasterUsage();

  async function remove(c: ColorDef) {
    const ok = await confirm({
      title: 'Delete colour?',
      message: (
        <>
          <b>{c.name}</b> will no longer be offered for designs{c.suffix ? `, and its ${c.suffix} profile prices are removed from the price levels` : ''}.
        </>
      ),
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/api/masters/colors/${encodeURIComponent(c.id)}`);
      await refresh();
      await refreshUsage();
      toast.success(`Colour ${c.name} deleted`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  const colors = masters.colors;
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? colors.filter((c) => c.name.toLowerCase().includes(q) || c.suffix.toLowerCase().includes(q)) : colors;
  }, [colors, search]);

  return (
    <div className="list-card">
      <div className="toolbar adm-toolbar">
        <SearchBox value={search} onChange={setSearch} placeholder="Search colour or suffix" />
        <span className="adm-toolbar-note">{visible.length === colors.length ? `${colors.length} colours` : `${visible.length} of ${colors.length} colours`}</span>
        <div className="adm-toolbar-spacer" />
        {!readOnly && (
          <Button size="sm" variant="outline-primary" icon={<Plus size={14} />} onClick={() => setAdding(true)} data-tour="masters-add-colour">
            Add colour
          </Button>
        )}
      </div>
      <div className="adm-scroll">
        {visible.length ? (
          <div className="adm-color-grid">
            {visible.map((c) => (
              <ColorCard
                key={c.id}
                color={c}
                actions={
                  readOnly ? null : (
                    <span className="row gap-4" style={{ flexWrap: 'nowrap', alignSelf: 'flex-start' }}>
                      <IconButton size="sm" tip="Edit colour" tipPos="left" onClick={() => setEditing(c)} data-tour="masters-colour-edit">
                        <Edit3 size={13} />
                      </IconButton>
                      {usage?.colors[c.id] ? (
                        <IconButton size="sm" tip={`${usageText(usage.colors[c.id])} – cannot be deleted`} tipPos="left" aria-label={`${c.name} is in use`} disabled>
                          <Lock size={13} />
                        </IconButton>
                      ) : (
                        <IconButton size="sm" tip="Delete colour" tipPos="left" onClick={() => void remove(c)} disabled={!usage}>
                          <Trash2 size={13} />
                        </IconButton>
                      )}
                    </span>
                  )
                }
              />
            ))}
          </div>
        ) : (
          <Empty title={colors.length ? 'No colours match your search' : 'No colours added yet'} icon={<Palette size={30} strokeWidth={1.4} />} />
        )}
      </div>
      {adding && <AddColorModal onClose={() => setAdding(false)} />}
      {editing && <EditColorModal color={editing} onClose={() => setEditing(null)} onSaved={() => void refreshUsage()} />}
    </div>
  );
}

function ColorCard({ color, actions }: { color: ColorDef; actions?: React.ReactNode }) {
  const dual = color.inside !== color.outside || color.hex_in.toLowerCase() !== color.hex_out.toLowerCase();
  return (
    <div className="adm-color-card">
      <ColorSwatch color={color} size={52} />
      <div className="grow">
        <div className="adm-color-name">{color.name}</div>
        {dual && (
          <div className="adm-cell-sub">
            In: {color.inside} · Out: {color.outside}
          </div>
        )}
        <div className="adm-color-meta">
          {color.suffix ? <span className="color-chip">{color.suffix}</span> : <span className="adm-cell-sub">No suffix</span>}
          {color.laminated ? <Badge tone="primary">Laminated</Badge> : <Badge tone="grey">Non-laminated</Badge>}
          {color.hw_color && <span className="adm-cell-sub">{color.hw_color.charAt(0) + color.hw_color.slice(1).toLowerCase()} hardware</span>}
        </div>
      </div>
      {actions}
    </div>
  );
}

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function AddColorModal({ onClose }: { onClose: () => void }) {
  const { masters, refresh } = useMasters();
  const toast = useToast();
  const [name, setName] = useState('');
  const [hex, setHex] = useState('#8b5a2b');
  const [suffix, setSuffix] = useState('');
  const [laminated, setLaminated] = useState(true);
  const [errors, setErrors] = useState<{ name?: string; hex?: string; suffix?: string }>({});
  const [saving, setSaving] = useState(false);

  const validHex = HEX_RE.test(hex);

  function validate() {
    const e: typeof errors = {};
    const n = name.trim();
    if (!n) e.name = 'Colour name is required';
    else if (masters.colors.some((c) => c.id === slug(n) || c.name.toUpperCase() === n.toUpperCase())) e.name = 'This colour already exists';
    if (!validHex) e.hex = 'Enter a hex colour like #5B3A21';
    const s = suffix.trim().toUpperCase();
    if (s && !/^[A-Z0-9]{1,4}$/.test(s)) e.suffix = 'Up to 4 letters or numbers';
    else if (s && masters.colors.some((c) => c.suffix.toUpperCase() === s)) e.suffix = 'Another colour already uses this suffix';
    return e;
  }

  async function submit(ev?: FormEvent) {
    ev?.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const created = await api.post<ColorDef>('/api/masters/colors', { name: name.trim(), hex, suffix: suffix.trim().toUpperCase(), laminated });
      await refresh();
      toast.success(`Colour ${created.name} added`);
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
      title="Add colour"
      closeOnBackdrop={false}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="adm-add-color" loading={saving}>
            Add colour
          </Button>
        </>
      }
    >
      <form id="adm-add-color" className="col gap-16" onSubmit={(e) => void submit(e)} noValidate>
        <div className="adm-color-preview">
          <ColorSwatch color={{ hex_in: validHex ? hex : '#ffffff', hex_out: validHex ? hex : '#ffffff' }} size={56} />
          <div>
            <div className="fw-600">{name.trim().toUpperCase() || 'NEW COLOUR'}</div>
            <div className="adm-color-meta">
              {suffix.trim() && <span className="color-chip">{suffix.trim().toUpperCase()}</span>}
              {laminated ? <Badge tone="primary">Laminated</Badge> : <Badge tone="grey">Non-laminated</Badge>}
            </div>
          </div>
        </div>
        <Field label="Colour name" required error={errors.name} htmlFor="ac-name">
          <Input
            id="ac-name"
            value={name}
            autoFocus
            maxLength={80}
            placeholder="e.g. GOLDEN OAK"
            invalid={!!errors.name}
            onChange={(e) => {
              setName(e.target.value);
              if (errors.name) setErrors((p) => ({ ...p, name: undefined }));
            }}
          />
        </Field>
        <div className="adm-form-grid">
          <Field label="Colour" required error={errors.hex} htmlFor="ac-hex">
            <div className="adm-color-input">
              <input type="color" value={validHex ? hex : '#ffffff'} onChange={(e) => setHex(e.target.value)} aria-label="Pick colour" />
              <Input
                id="ac-hex"
                value={hex}
                maxLength={7}
                invalid={!!errors.hex}
                className="adm-mono"
                onChange={(e) => {
                  const v = e.target.value.trim();
                  setHex(v.startsWith('#') ? v : `#${v}`);
                  if (errors.hex) setErrors((p) => ({ ...p, hex: undefined }));
                }}
              />
            </div>
          </Field>
          <Field label="Code suffix" error={errors.suffix} hint="Added to laminated profile codes. Blank uses the first 2 letters." htmlFor="ac-suffix">
            <Input
              id="ac-suffix"
              value={suffix}
              maxLength={4}
              placeholder="e.g. GO"
              invalid={!!errors.suffix}
              style={{ textTransform: 'uppercase' }}
              onChange={(e) => {
                setSuffix(e.target.value);
                if (errors.suffix) setErrors((p) => ({ ...p, suffix: undefined }));
              }}
            />
          </Field>
        </div>
        <Switch checked={laminated} onChange={setLaminated} label="Laminated colour (uses the laminated profile rate)" />
      </form>
    </Modal>
  );
}

const HW_COLOURS = ['WHITE', 'BROWN', 'BLACK'];

/** Edit a colour: names, inside / outside swatches, code suffix, lamination and hardware colour. */
function EditColorModal({ color, onClose, onSaved }: { color: ColorDef; onClose: () => void; onSaved?: () => void }) {
  const { masters, refresh } = useMasters();
  const toast = useToast();
  const [f, setF] = useState({
    name: color.name,
    inside: color.inside,
    outside: color.outside,
    hexIn: color.hex_in,
    hexOut: color.hex_out,
    suffix: color.suffix,
    laminated: !!color.laminated,
    hwColor: color.hw_color || 'BROWN',
  });
  const [errors, setErrors] = useState<Partial<Record<'name' | 'hexIn' | 'hexOut' | 'suffix', string>>>({});
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    if (k in errors) setErrors((p) => ({ ...p, [k]: undefined }));
  };
  const suffixLocked = !color.suffix;

  function validate() {
    const e: typeof errors = {};
    const n = f.name.trim();
    if (!n) e.name = 'Colour name is required';
    else if (masters.colors.some((c) => c.id !== color.id && c.name.toUpperCase() === n.toUpperCase())) e.name = 'Another colour has this name';
    if (!HEX_RE.test(f.hexIn)) e.hexIn = 'Enter a hex colour like #FFFFFF';
    if (!HEX_RE.test(f.hexOut)) e.hexOut = 'Enter a hex colour like #5B3A21';
    const s = f.suffix.trim().toUpperCase();
    if (!suffixLocked) {
      if (!/^[A-Z0-9]{1,4}$/.test(s)) e.suffix = '1 to 4 letters or numbers';
      else if (masters.colors.some((c) => c.id !== color.id && c.suffix.toUpperCase() === s)) e.suffix = 'Another colour already uses this suffix';
    }
    return e;
  }

  async function submit(ev?: FormEvent) {
    ev?.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const saved = await api.put<ColorDef>(`/api/masters/colors/${encodeURIComponent(color.id)}`, {
        name: f.name.trim(),
        inside: f.inside.trim(),
        outside: f.outside.trim(),
        hexIn: f.hexIn,
        hexOut: f.hexOut,
        suffix: suffixLocked ? undefined : f.suffix.trim().toUpperCase(),
        laminated: f.laminated,
        hwColor: f.hwColor,
      });
      await refresh();
      onSaved?.();
      toast.success(`Colour ${saved.name} updated`);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
      setSaving(false);
    }
  }

  const hexInput = (key: 'hexIn' | 'hexOut', label: string) => (
    <Field label={label} required error={errors[key]} htmlFor={`ec-${key}`}>
      <div className="adm-color-input">
        <input type="color" value={HEX_RE.test(f[key]) ? f[key] : '#ffffff'} onChange={(e) => set(key, e.target.value)} aria-label={`Pick ${label.toLowerCase()}`} />
        <Input
          id={`ec-${key}`}
          value={f[key]}
          maxLength={7}
          invalid={!!errors[key]}
          className="adm-mono"
          onChange={(e) => {
            const v = e.target.value.trim();
            set(key, v.startsWith('#') ? v : `#${v}`);
          }}
        />
      </div>
    </Field>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit colour · ${color.name}`}
      closeOnBackdrop={false}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="adm-edit-color" loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <form id="adm-edit-color" className="col gap-16" onSubmit={(e) => void submit(e)} noValidate>
        <div className="adm-color-preview">
          <ColorSwatch color={{ hex_in: HEX_RE.test(f.hexIn) ? f.hexIn : '#ffffff', hex_out: HEX_RE.test(f.hexOut) ? f.hexOut : '#ffffff' }} size={56} />
          <div>
            <div className="fw-600">{f.name.trim().toUpperCase() || 'COLOUR'}</div>
            <div className="adm-cell-sub">
              In: {f.inside.trim().toUpperCase() || '—'} · Out: {f.outside.trim().toUpperCase() || '—'}
            </div>
          </div>
        </div>
        <Field label="Colour name" required error={errors.name} htmlFor="ec-name">
          <Input id="ec-name" value={f.name} autoFocus maxLength={80} invalid={!!errors.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <div className="adm-form-grid">
          <Field label="Inside name" htmlFor="ec-in">
            <Input id="ec-in" value={f.inside} maxLength={80} onChange={(e) => set('inside', e.target.value)} />
          </Field>
          <Field label="Outside name" htmlFor="ec-out">
            <Input id="ec-out" value={f.outside} maxLength={80} onChange={(e) => set('outside', e.target.value)} />
          </Field>
          {hexInput('hexIn', 'Inside colour')}
          {hexInput('hexOut', 'Outside colour')}
          <Field
            label="Code suffix"
            error={errors.suffix}
            hint={suffixLocked ? 'This colour uses the base profile codes' : 'Laminated profile codes end with it; their price-level rates move with it'}
            htmlFor="ec-suffix"
          >
            <Input id="ec-suffix" value={f.suffix} maxLength={4} disabled={suffixLocked} invalid={!!errors.suffix} style={{ textTransform: 'uppercase' }} onChange={(e) => set('suffix', e.target.value)} />
          </Field>
          <Field label="Hardware colour" htmlFor="ec-hw" hint="Handles, locks and keeps used with this colour">
            <Select id="ec-hw" value={f.hwColor} onChange={(e) => set('hwColor', e.target.value)}>
              {HW_COLOURS.map((h) => (
                <option key={h} value={h}>
                  {h.charAt(0) + h.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Switch checked={f.laminated} onChange={(v) => set('laminated', v)} label="Laminated colour (uses the laminated profile rate)" />
      </form>
    </Modal>
  );
}
