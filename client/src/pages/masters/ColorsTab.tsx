import { useMemo, useState, type FormEvent } from 'react';
import { Palette, Plus } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { ColorDef } from '../../lib/types';
import { Badge, Button, Empty, Field, Input, Switch } from '../../components/ui';
import { Modal } from '../../components/overlay';
import { useToast } from '../../components/feedback';
import { useMasters } from '../../context/MastersContext';
import { ColorSwatch, SearchBox } from './shared';

const HEX_RE = /^#[0-9a-f]{6}$/i;

export function ColorsTab({ readOnly = false }: { readOnly?: boolean }) {
  const { masters } = useMasters();
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
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
          <Button size="sm" variant="outline-primary" icon={<Plus size={14} />} onClick={() => setAdding(true)}>
            Add colour
          </Button>
        )}
      </div>
      <div className="adm-scroll">
        {visible.length ? (
          <div className="adm-color-grid">
            {visible.map((c) => (
              <ColorCard key={c.id} color={c} />
            ))}
          </div>
        ) : (
          <Empty title={colors.length ? 'No colours match your search' : 'No colours added yet'} icon={<Palette size={30} strokeWidth={1.4} />} />
        )}
      </div>
      {adding && <AddColorModal onClose={() => setAdding(false)} />}
    </div>
  );
}

function ColorCard({ color }: { color: ColorDef }) {
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
        </div>
      </div>
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
