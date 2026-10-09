import { useEffect, useState, type ReactNode } from 'react';
import { Info, Minus, Plus } from 'lucide-react';
import type { ColorDef, DesignData, GlassDef, LeafNode, SystemDef } from '../lib/types';
import { useMasters } from '../context/MastersContext';
import { Button, Field, Input, Select, Switch, Textarea } from '../components/ui';
import { allLeaves, sashCount } from './model';
import { LOUVER_TYPES } from './typologies';

export interface DesignMeta {
  ref: string;
  qty: number;
  name: string;
  location: string;
  floor: string;
  note: string;
}

export interface PreviewProfile {
  role: string;
  code: string;
  name: string;
}

export const FLOORS = ['Basement', 'Ground floor', 'First floor', 'Second floor', 'Third floor', 'Fourth floor', 'Fifth floor', 'Sixth floor', 'Seventh floor', 'Eighth floor', 'Terrace'];

function Section({ title, info, open, onToggle, children }: { title: string; info: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section className={`cfg-acc ${open ? 'open' : ''}`} data-tour={`cfg-sec-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
      <button className="cfg-acc-head" onClick={onToggle} aria-expanded={open}>
        <span className="row gap-4">
          {title}
          <span data-tip={info} data-tip-pos="right" className="cfg-acc-info" onClick={(e) => e.stopPropagation()}>
            <Info size={12} />
          </span>
        </span>
        <span className="cfg-acc-toggle">{open ? <Minus size={13} /> : <Plus size={13} />}</span>
      </button>
      {open && <div className="cfg-acc-body">{children}</div>}
    </section>
  );
}

function ProfileRow({ label, p }: { label: string; p?: PreviewProfile }) {
  if (!p) return null;
  return (
    <div className="cfg-prof">
      <span className="muted fs-11">{label}</span>
      <span className="fs-12 fw-600">{p.name}</span>
      <span className="fs-11 muted">{p.code}</span>
    </div>
  );
}

export function LeftPanel({
  meta,
  onMeta,
  data,
  onSize,
  onFloorAperture,
  system,
  systems,
  onSystem,
  color,
  onOpenColors,
  glassId,
  glasses,
  onGlass,
  selectedLeaf,
  onLeafPatch,
  profiles,
  hwColor,
  errors,
}: {
  meta: DesignMeta;
  onMeta: (m: DesignMeta) => void;
  data: DesignData;
  onSize: (w: number, h: number) => void;
  onFloorAperture: (v: number) => void;
  system: SystemDef;
  systems: SystemDef[];
  onSystem: (id: string) => void;
  color: ColorDef;
  onOpenColors: () => void;
  glassId: string;
  glasses: GlassDef[];
  onGlass: (glassId: string, scope: 'all' | 'selected') => void;
  selectedLeaf: LeafNode | null;
  onLeafPatch: (patch: Partial<LeafNode>) => void;
  profiles: PreviewProfile[];
  hwColor: string;
  errors: { ref?: string; qty?: string };
}) {
  const { masters } = useMasters();
  const [open, setOpen] = useState<Record<string, boolean>>({ basic: true });
  const [w, setW] = useState(String(data.width));
  const [h, setH] = useState(String(data.height));
  const [fa, setFa] = useState(String(data.floorAperture));
  useEffect(() => setW(String(data.width)), [data.width]);
  useEffect(() => setH(String(data.height)), [data.height]);
  useEffect(() => setFa(String(data.floorAperture)), [data.floorAperture]);

  const leaves = allLeaves(data.root);
  const hasSash = leaves.some((l) => sashCount(l) > 0);
  const hasGlass = leaves.some((l) => l.panel !== 'louver' && l.panel !== 'mesh' && l.panel !== 'fan');
  const hasBead = hasGlass;
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const commitSize = () => {
    const nw = Math.round(Number(w));
    const nh = Math.round(Number(h));
    if (!(nw >= 200 && nw <= 12000) || !(nh >= 200 && nh <= 12000)) {
      setW(String(data.width));
      setH(String(data.height));
      return;
    }
    if (nw !== data.width || nh !== data.height) onSize(nw, nh);
  };
  const byRole = (role: string) => profiles.find((p) => p.role === role);
  const brand = system.brand;
  const sameBrand = systems.filter((s) => s.brand === brand);
  const louverLeaf = selectedLeaf?.panel === 'louver' ? selectedLeaf : null;
  const leafGlass = selectedLeaf?.glassId;

  return (
    <div className="cfg-left-scroll">
      <Section title="Basic info" info="Reference, quantity, location and size of this design" open={!!open.basic} onToggle={() => toggle('basic')}>
        <Field label="Design ref." required error={errors.ref}>
          <Input sm value={meta.ref} onChange={(e) => onMeta({ ...meta, ref: e.target.value.toUpperCase() })} invalid={!!errors.ref} maxLength={30} />
        </Field>
        <Field label="Design quantity" required error={errors.qty}>
          <Input sm type="number" min={1} max={9999} value={meta.qty || ''} onChange={(e) => onMeta({ ...meta, qty: Math.round(Number(e.target.value)) })} invalid={!!errors.qty} />
        </Field>
        <Field label="Design name">
          <Input sm list="cfg-design-names" value={meta.name} onChange={(e) => onMeta({ ...meta, name: e.target.value.toUpperCase() })} maxLength={80} />
          <datalist id="cfg-design-names">
            {masters.designNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </Field>
        <Field label="Location">
          <Input sm value={meta.location} onChange={(e) => onMeta({ ...meta, location: e.target.value })} maxLength={120} />
        </Field>
        <Field label="Floor number">
          <Select sm value={meta.floor} onChange={(e) => onMeta({ ...meta, floor: e.target.value })} placeholder="Select">
            {[...new Set([...FLOORS, ...(meta.floor && !FLOORS.includes(meta.floor) ? [meta.floor] : [])])].map((f) => (
              <option key={f}>{f}</option>
            ))}
          </Select>
        </Field>
        <div className="field" data-tour="cfg-size">
          <label>Size (mm)</label>
          <div className="cfg-size">
            <span className="cfg-size-tag">W</span>
            <Input sm type="number" value={w} onChange={(e) => setW(e.target.value)} onBlur={commitSize} onKeyDown={(e) => e.key === 'Enter' && commitSize()} aria-label="Width" />
            <span className="cfg-size-tag">H</span>
            <Input sm type="number" value={h} onChange={(e) => setH(e.target.value)} onBlur={commitSize} onKeyDown={(e) => e.key === 'Enter' && commitSize()} aria-label="Height" />
          </div>
          <span className="field-hint">
            {system.name}: {system.limits.minWidth}–{system.limits.maxWidth} × {system.limits.minHeight}–{system.limits.maxHeight}
          </span>
        </div>
        <Field label="Floor aperture distance (mm)">
          <Input
            sm
            type="number"
            min={0}
            max={5000}
            value={fa}
            onChange={(e) => setFa(e.target.value)}
            onBlur={() => {
              const v = Math.round(Number(fa));
              if (v >= 0 && v <= 5000 && v !== data.floorAperture) onFloorAperture(v);
              else setFa(String(data.floorAperture));
            }}
          />
        </Field>
        <Field label="Note">
          <Textarea value={meta.note} onChange={(e) => onMeta({ ...meta, note: e.target.value })} rows={2} maxLength={1000} />
        </Field>
      </Section>

      <Section title="Surface finish" info="Profile colour (inside / outside) and hardware colour" open={!!open.finish} onToggle={() => toggle('finish')}>
        <button className="cfg-finish" onClick={onOpenColors}>
          <svg viewBox="0 0 40 40" width={40} height={40}>
            <path d="M0 0H40L0 40Z" fill={color.hex_in} />
            <path d="M40 0V40H0Z" fill={color.hex_out} />
            <rect x="0.5" y="0.5" width="39" height="39" fill="none" stroke="#d1d5db" />
          </svg>
          <span className="col" style={{ gap: 1, alignItems: 'flex-start' }}>
            <span className="fs-12">
              In – <b>{color.inside}</b>
            </span>
            <span className="fs-12">
              Out – <b>{color.outside}</b>
            </span>
          </span>
          <span className="btn btn-link btn-xs" style={{ marginLeft: 'auto' }}>
            Change
          </span>
        </button>
        <div className="row fs-12" style={{ justifyContent: 'space-between' }}>
          <span className="muted">Hardware colour</span>
          <b>{hwColor}</b>
        </div>
        <div className="row fs-12" style={{ justifyContent: 'space-between' }}>
          <span className="muted">Finish</span>
          <b>{color.laminated ? 'Laminated' : 'Plain'}</b>
        </div>
      </Section>

      <Section title="Framing" info="Profile system and outer frame" open={!!open.framing} onToggle={() => toggle('framing')}>
        <Field label="Brand">
          <Select sm value={brand} disabled>
            <option>{brand}</option>
          </Select>
        </Field>
        <Field label="System">
          <Select sm value={system.id} onChange={(e) => onSystem(e.target.value)}>
            {sameBrand.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Frame shape">
          <Select sm value="rect" disabled>
            <option value="rect">Rectangle</option>
          </Select>
        </Field>
        <ProfileRow label="Frame" p={byRole('frame3') || byRole('frame')} />
        <ProfileRow label="Mullion" p={byRole('mullion')} />
        <ProfileRow label="Guide rail" p={byRole('guideRail')} />
      </Section>

      {hasSash && (
        <Section title="Sash" info="Sash profiles and hardware of the openable panels" open={!!open.sash} onToggle={() => toggle('sash')}>
          <ProfileRow label="Sash" p={byRole('sash')} />
          <ProfileRow label="Interlock" p={byRole('interlock')} />
          <ProfileRow label="Mesh sash" p={byRole('meshSash')} />
          <div className="row fs-12" style={{ justifyContent: 'space-between' }}>
            <span className="muted">Handle colour</span>
            <b>{hwColor}</b>
          </div>
          {selectedLeaf && sashCount(selectedLeaf) > 0 && ['casement', 'tiltturn', 'twin', 'sliding', 'tophung'].includes(selectedLeaf.panel) && (
            <Switch checked={!!selectedLeaf.mesh} onChange={(v) => onLeafPatch({ mesh: v, ...(selectedLeaf.panel === 'sliding' && !v ? { tracks: 2 } : {}) })} label="Insect mesh sash on selected panel" />
          )}
        </Section>
      )}

      {hasGlass && (
        <Section title="Glazing Item" info="Glass of all panels, or of the selected panel" open={!!open.glazing} onToggle={() => toggle('glazing')}>
          <Field label="Glass (all panels)">
            <Select sm value={glassId} onChange={(e) => onGlass(e.target.value, 'all')}>
              {glasses
                .filter((g) => g.kind === 'glass')
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
            </Select>
          </Field>
          {selectedLeaf && selectedLeaf.panel !== 'louver' && selectedLeaf.panel !== 'mesh' && selectedLeaf.panel !== 'fan' && (
            <Field label="Selected panel glass">
              <Select sm value={leafGlass || ''} onChange={(e) => onGlass(e.target.value || glassId, e.target.value ? 'selected' : 'all')}>
                <option value="">Same as design</option>
                {glasses
                  .filter((g) => g.kind === 'glass')
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
              </Select>
            </Field>
          )}
          <span className="field-hint">Note: This is not applied to louver glass.</span>
        </Section>
      )}

      {louverLeaf && (
        <Section title="Louver" info="Louver blade type of the selected panel" open onToggle={() => undefined}>
          <Field label="Louver type">
            <Select sm value={louverLeaf.louverType || 'fixed-glass'} onChange={(e) => onLeafPatch({ louverType: e.target.value as LeafNode['louverType'] })}>
              {LOUVER_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
        </Section>
      )}

      {hasBead && (
        <Section title="Bead" info="Glazing bead holding the glass" open={!!open.bead} onToggle={() => toggle('bead')}>
          <ProfileRow label="Glass bead" p={byRole('bead')} />
          <div className="field-hint">Bead is selected automatically from the system for {glasses.find((g) => g.id === glassId)?.thickness ?? 4} mm glass.</div>
        </Section>
      )}

      {selectedLeaf && (selectedLeaf.georgian || selectedLeaf.grill || selectedLeaf.pleated) && (
        <Section title="Add-ons" info="Add-ons applied to the selected panel" open onToggle={() => undefined}>
          {selectedLeaf.georgian && (
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="fs-12">
                Georgian bars {selectedLeaf.georgian.rows + 1} × {selectedLeaf.georgian.cols + 1}
              </span>
              <Button size="xs" variant="ghost" onClick={() => onLeafPatch({ georgian: undefined })}>
                Remove
              </Button>
            </div>
          )}
          {selectedLeaf.grill && (
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="fs-12">MS safety grill</span>
              <Button size="xs" variant="ghost" onClick={() => onLeafPatch({ grill: undefined })}>
                Remove
              </Button>
            </div>
          )}
          {selectedLeaf.pleated && (
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="fs-12">{selectedLeaf.pleated === 'pulldown' ? 'Pull-down roller mesh' : `Pleated mesh (${selectedLeaf.pleated})`}</span>
              <Button size="xs" variant="ghost" onClick={() => onLeafPatch({ pleated: undefined })}>
                Remove
              </Button>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
