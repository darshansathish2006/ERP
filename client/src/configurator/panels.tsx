import { useEffect, useMemo, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import type { ColorDef, DesignData, GlassDef, SystemDef } from '../lib/types';
import { Button, Field, Select } from '../components/ui';
import { Drawer } from '../components/overlay';
import { DesignSvg } from './DesignSvg';
import { DIVIDERS, TYPOLOGIES, TYPOLOGY_GROUPS, type DividerOption, type Typology } from './typologies';
import { leaf, split, type Equalization } from './model';

const ICON_FRAME = '#c3ccd6';

function iconData(root: DesignData['root']): DesignData {
  return { width: 1000, height: 1000, floorAperture: 0, root };
}

/** Grid of typology presets grouped like the EvA design panel. */
export function TypologyPanel({ onPick, systemType, onClose }: { onPick: (t: Typology) => void; systemType: string; onClose?: () => void }) {
  const [q, setQ] = useState('');
  const previews = useMemo(() => new Map(TYPOLOGIES.map((t) => [t.id, iconData(t.build(1000, 1000))])), []);
  const shown = TYPOLOGIES.filter((t) => !q.trim() || t.label.toLowerCase().includes(q.trim().toLowerCase()) || t.group.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="cfg-flyout cfg-typology">
      <div className="cfg-flyout-head">
        <span className="fw-600">Designs</span>
        {onClose && (
          <button className="icon-btn icon-btn-sm" onClick={onClose} aria-label="Close designs">
            <X size={14} />
          </button>
        )}
      </div>
      <div className="cfg-flyout-search">
        <Search size={13} />
        <input placeholder="Search designs" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      <div className="cfg-flyout-scroll">
        {TYPOLOGY_GROUPS.map((g) => {
          const items = shown.filter((t) => t.group === g);
          if (!items.length) return null;
          return (
            <div key={g} className="cfg-group">
              <div className="cfg-group-title">{g}</div>
              <div className="cfg-icon-grid">
                {items.map((t) => (
                  <button key={t.id} className={`cfg-icon ${t.systemType && t.systemType !== systemType ? 'other-system' : ''}`} onClick={() => onPick(t)} data-tip={t.label} title={t.label}>
                    <DesignSvg data={previews.get(t.id)!} frameColor={ICON_FRAME} showDims={false} showLabels={false} showNumbers={false} strokeScale={7} style={{ width: '100%', height: '100%' }} />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {!shown.length && <div className="muted fs-12" style={{ padding: 12 }}>No designs match "{q}"</div>}
      </div>
    </div>
  );
}

export function DividerPanel({ onPick }: { onPick: (d: DividerOption) => void }) {
  const previews = useMemo(() => new Map(DIVIDERS.map((d) => [d.id, iconData(split(d.dir, d.ratios.map((r) => (r / d.ratios.reduce((a, b) => a + b, 0)) * 1000), d.ratios.map(() => leaf('fixed'))))])), []);
  return (
    <div className="cfg-flyout cfg-divider">
      <div className="cfg-group-title" style={{ padding: '10px 12px 6px' }}>
        Divider
      </div>
      <div className="cfg-icon-grid" style={{ padding: '0 10px 10px', gridTemplateColumns: 'repeat(4, 46px)' }}>
        {DIVIDERS.map((d) => (
          <button key={d.id} className="cfg-icon" onClick={() => onPick(d)} title={d.label} data-tip={d.label}>
            <DesignSvg data={previews.get(d.id)!} frameColor={ICON_FRAME} showDims={false} showLabels={false} showNumbers={false} strokeScale={7} style={{ width: '100%', height: '100%' }} />
          </button>
        ))}
      </div>
    </div>
  );
}

export function SystemDrawer({
  open,
  systems,
  value,
  requiredType,
  onClose,
  onConfirm,
}: {
  open: boolean;
  systems: SystemDef[];
  value: string;
  requiredType?: string | null;
  onClose: () => void;
  onConfirm: (systemId: string) => void;
}) {
  const brands = [...new Set(systems.map((s) => s.brand))];
  const [brand, setBrand] = useState(brands[0] || '');
  const [system, setSystem] = useState(value);
  useEffect(() => {
    if (!open) return;
    const current = systems.find((s) => s.id === value);
    const preferred = requiredType && current?.type !== requiredType ? systems.find((s) => s.type === requiredType) : current;
    setSystem(preferred?.id || value);
    setBrand(preferred?.brand || brands[0] || '');
  }, [open, value, requiredType]);
  const options = systems.filter((s) => s.brand === brand);
  const chosen = systems.find((s) => s.id === system);
  const mismatch = !!requiredType && chosen?.type !== requiredType;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Select System"
      footer={
        <Button variant="primary" style={{ width: '100%' }} disabled={!chosen} onClick={() => chosen && onConfirm(chosen.id)}>
          Confirm
        </Button>
      }
    >
      <div className="col gap-16">
        <Field label="Brand">
          <Select
            value={brand}
            onChange={(e) => {
              setBrand(e.target.value);
              setSystem(systems.find((s) => s.brand === e.target.value)?.id || '');
            }}
          >
            {brands.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </Select>
        </Field>
        <Field label="Select system">
          <Select value={system} onChange={(e) => setSystem(e.target.value)}>
            {options.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        {chosen && (
          <div className="cfg-system-info">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="fw-600">{chosen.name}</span>
              <span className="badge badge-primary">{chosen.type.toUpperCase()}</span>
            </div>
            <div className="fs-12 muted mt-8">
              Size range {chosen.limits.minWidth}–{chosen.limits.maxWidth} × {chosen.limits.minHeight}–{chosen.limits.maxHeight} mm · max sash {chosen.limits.maxSashWidth} × {chosen.limits.maxSashHeight} mm
            </div>
          </div>
        )}
        {mismatch && <div className="alert alert-warning">The selected design needs a {requiredType} system. Pricing will flag a validation warning with this system.</div>}
      </div>
    </Drawer>
  );
}

export function ColorDrawer({ open, colors, value, onClose, onConfirm }: { open: boolean; colors: ColorDef[]; value: string; onClose: () => void; onConfirm: (id: string) => void }) {
  const [sel, setSel] = useState(value);
  const [q, setQ] = useState('');
  useEffect(() => {
    if (open) {
      setSel(value);
      setQ('');
    }
  }, [open, value]);
  const shown = colors.filter((c) => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Select Color"
      footer={
        <Button variant="primary" style={{ width: '100%' }} onClick={() => onConfirm(sel)}>
          Confirm
        </Button>
      }
    >
      <div className="input-icon mb-12">
        <Search size={14} />
        <input className="input" placeholder="Search..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="cfg-colors">
        {shown.map((c) => (
          <button key={c.id} className={`cfg-color ${sel === c.id ? 'selected' : ''}`} onClick={() => setSel(c.id)} onDoubleClick={() => onConfirm(c.id)}>
            <svg viewBox="0 0 60 60" className="cfg-swatch">
              <path d="M0 0H60L0 60Z" fill={c.hex_in} />
              <path d="M60 0V60H0Z" fill={c.hex_out} />
              <line x1="60" y1="0" x2="0" y2="60" stroke="#fff" strokeWidth="1.5" />
              <rect x="0.5" y="0.5" width="59" height="59" fill="none" stroke="#d1d5db" />
            </svg>
            {sel === c.id && (
              <span className="cfg-color-check">
                <Check size={12} />
              </span>
            )}
            {c.inside === c.outside && c.id === 'white' ? (
              <span className="cfg-color-name">{c.name}</span>
            ) : (
              <span className="cfg-color-name">
                In - {c.inside}
                <br />
                Out - {c.outside}
              </span>
            )}
          </button>
        ))}
      </div>
    </Drawer>
  );
}

export function GlassDrawer({
  open,
  glasses,
  value,
  hasSelection,
  onClose,
  onConfirm,
}: {
  open: boolean;
  glasses: GlassDef[];
  value: string;
  hasSelection: boolean;
  onClose: () => void;
  onConfirm: (glassId: string, scope: 'all' | 'selected') => void;
}) {
  const [sel, setSel] = useState(value);
  const [scope, setScope] = useState<'all' | 'selected'>('all');
  const [q, setQ] = useState('');
  useEffect(() => {
    if (open) {
      setSel(value);
      setScope(hasSelection ? 'selected' : 'all');
      setQ('');
    }
  }, [open, value, hasSelection]);
  const shown = glasses.filter((g) => g.kind !== 'mesh' && (!q.trim() || g.name.toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Select Glass"
      footer={
        <Button variant="primary" style={{ width: '100%' }} onClick={() => onConfirm(sel, scope)}>
          Confirm
        </Button>
      }
    >
      <div className="col gap-12">
        <Field label="Apply to">
          <Select value={scope} onChange={(e) => setScope(e.target.value as 'all' | 'selected')}>
            <option value="all">All panels of this design</option>
            <option value="selected" disabled={!hasSelection}>
              Selected panel only
            </option>
          </Select>
        </Field>
        <div className="input-icon">
          <Search size={14} />
          <input className="input" placeholder="Search..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="col gap-4">
          {shown.map((g) => (
            <label key={g.id} className={`cfg-glass ${sel === g.id ? 'selected' : ''}`}>
              <input type="radio" name="glass" checked={sel === g.id} onChange={() => setSel(g.id)} />
              <span className="cfg-glass-swatch" style={{ background: g.kind === 'louver' ? '#e2e8ee' : /GREEN/.test(g.name) ? '#a8d8b9' : /COLOUR/.test(g.name) ? '#c9b8e8' : /FROST/.test(g.name) ? '#eef3f6' : '#b8e2f4' }} />
              <span className="grow">
                {g.name}
                <div className="muted fs-11">
                  {g.code} · {g.thickness} mm {g.kind === 'louver' ? '· louver' : ''}
                </div>
              </span>
            </label>
          ))}
        </div>
        <div className="field-hint">Note: Louver panels always use louver glass.</div>
      </div>
    </Drawer>
  );
}

export function MullionDrawer({ open, onClose, onConfirm, value }: { open: boolean; onClose: () => void; onConfirm: (mode: Equalization) => void; value?: Equalization }) {
  const [mode, setMode] = useState<Equalization>(value || 'mullion');
  useEffect(() => {
    if (open) setMode(value || 'mullion');
  }, [open, value]);
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Select Mullion Specification"
      footer={
        <Button variant="primary" style={{ width: '100%' }} onClick={() => onConfirm(mode)}>
          Confirm
        </Button>
      }
    >
      <div className="col gap-12">
        <Field label="Type of Equalization">
          <Select value={mode} onChange={(e) => setMode(e.target.value as Equalization)}>
            <option value="mullion">Mullion Equalization</option>
            <option value="glass">Glass Equalization</option>
          </Select>
        </Field>
        <p className="muted fs-12">
          {mode === 'mullion'
            ? 'Mullion centre lines are spaced equally across the opening.'
            : 'Mullions are positioned so every panel shows the same visible glass width, compensating for the wider outer frame.'}
        </p>
      </div>
    </Drawer>
  );
}
