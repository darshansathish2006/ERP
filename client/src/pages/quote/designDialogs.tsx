import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, Plus } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { BomLine, CutLine, Design, FullQuote, HeadValue, PaneLine } from '../../lib/types';
import { fixed2, inr, qtyFmt } from '../../lib/format';
import { useMasters } from '../../context/MastersContext';
import { useToast } from '../../components/feedback';
import { Button, Field, IconButton, Input, Select, Spinner, Tabs } from '../../components/ui';
import { Drawer, Modal } from '../../components/overlay';
import { Combobox } from '../../components/Combobox';
import { DesignSvg } from '../../configurator/DesignSvg';
import { DesignAddonDialog } from './pricing/AddonPage';

export type GlobalField = 'colorId' | 'glassId' | 'systemId' | 'qty' | 'location';
const FIELD_LABEL: Record<GlobalField, string> = {
  colorId: 'Profile colour',
  glassId: 'Glass',
  systemId: 'Profile system',
  qty: 'Quantity',
  location: 'Location',
};

export function GlobalEditDialog({
  open,
  field,
  quoteId,
  selectedIds,
  onClose,
  onDone,
}: {
  open: boolean;
  field: GlobalField;
  quoteId: number;
  selectedIds: number[];
  onClose: () => void;
  onDone: (q: FullQuote) => void;
}) {
  const { masters } = useMasters();
  const toast = useToast();
  const [value, setValue] = useState('');
  const [scope, setScope] = useState<'all' | 'selected'>('all');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setValue('');
      setScope(selectedIds.length ? 'selected' : 'all');
    }
  }, [open, selectedIds.length]);

  const options =
    field === 'colorId'
      ? masters.colors.map((c) => ({ value: c.id, label: c.name, icon: <span className="dash-swatch" style={{ background: c.hex_out, border: '1px solid #ccc' }} /> }))
      : field === 'glassId'
        ? masters.glasses.filter((g) => g.kind === 'glass').map((g) => ({ value: g.id, label: g.name }))
        : field === 'systemId'
          ? masters.systems.map((s) => ({ value: s.id, label: s.name }))
          : [];

  const apply = async () => {
    if (!value.trim()) {
      toast.error(`Select a ${FIELD_LABEL[field].toLowerCase()}`);
      return;
    }
    if (field === 'qty' && !(Number(value) >= 1)) {
      toast.error('Quantity must be at least 1');
      return;
    }
    setSaving(true);
    try {
      const r = await api.post<FullQuote & { affected: number }>(`/api/quotes/${quoteId}/global-edit`, {
        field,
        value: field === 'qty' ? Number(value) : value,
        ids: scope === 'selected' ? selectedIds : [],
      });
      toast.success(`${FIELD_LABEL[field]} updated for ${r.affected} design${r.affected === 1 ? '' : 's'}`);
      onDone(r);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Global edit · ${FIELD_LABEL[field]}`}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={apply}>
            Apply
          </Button>
        </>
      }
    >
      <div className="col gap-12">
        <Field label={FIELD_LABEL[field]} required>
          {field === 'qty' ? (
            <Input type="number" min={1} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          ) : field === 'location' ? (
            <Input value={value} onChange={(e) => setValue(e.target.value)} autoFocus placeholder="e.g. BEDROOM" />
          ) : (
            <Combobox options={options} value={value} onChange={setValue} placeholder="Select" />
          )}
        </Field>
        <Field label="Apply to">
          <Select value={scope} onChange={(e) => setScope(e.target.value as 'all' | 'selected')}>
            <option value="all">All designs in this quote</option>
            <option value="selected" disabled={!selectedIds.length}>
              Selected designs ({selectedIds.length})
            </option>
          </Select>
        </Field>
        {field === 'systemId' && <div className="alert alert-warning">Changing the profile system re-prices every affected design with that system's profiles.</div>}
      </div>
    </Modal>
  );
}

export function ProjectDefaultsDialog({ open, quote, onClose, onDone }: { open: boolean; quote: FullQuote['quote']; onClose: () => void; onDone: (q: FullQuote) => void }) {
  const { masters } = useMasters();
  const toast = useToast();
  const [form, setForm] = useState({ systemId: '', colorId: '', glassId: '', floorAperture: '900' });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open)
      setForm({
        systemId: quote.defaults.systemId || 'inventa-sliding',
        colorId: quote.defaults.colorId || 'white',
        glassId: quote.defaults.glassId || 'g4-pinhead',
        floorAperture: String(quote.defaults.floorAperture ?? masters.company.defaultFloorAperture ?? 900),
      });
  }, [open, quote.defaults, masters.company.defaultFloorAperture]);
  const save = async () => {
    const fa = Number(form.floorAperture);
    if (!(fa >= 0 && fa <= 5000)) {
      toast.error('Floor aperture distance must be between 0 and 5000 mm');
      return;
    }
    setSaving(true);
    try {
      const r = await api.put<FullQuote>(`/api/quotes/${quote.id}`, { defaults: { ...form, floorAperture: fa } });
      toast.success('Project defaults saved');
      onDone(r);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Project defaults"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="col gap-12">
        <p className="muted fs-12">New designs created in this quote start with these settings. Existing designs are not changed – use Global edits for that.</p>
        <Field label="Profile system">
          <Select value={form.systemId} onChange={(e) => setForm((f) => ({ ...f, systemId: e.target.value }))}>
            {masters.systems.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Profile colour">
          <Combobox
            options={masters.colors.map((c) => ({ value: c.id, label: c.name, icon: <span className="dash-swatch" style={{ background: c.hex_out, border: '1px solid #ccc' }} /> }))}
            value={form.colorId}
            onChange={(v) => setForm((f) => ({ ...f, colorId: v }))}
          />
        </Field>
        <Field label="Glass">
          <Combobox options={masters.glasses.filter((g) => g.kind === 'glass').map((g) => ({ value: g.id, label: g.name }))} value={form.glassId} onChange={(v) => setForm((f) => ({ ...f, glassId: v }))} />
        </Field>
        <Field label="Floor aperture distance (mm)">
          <Input type="number" min={0} max={5000} value={form.floorAperture} onChange={(e) => setForm((f) => ({ ...f, floorAperture: e.target.value }))} />
        </Field>
      </div>
    </Modal>
  );
}

export function DesignOrderDialog({ open, quoteId, designs, onClose, onDone }: { open: boolean; quoteId: number; designs: Design[]; onClose: () => void; onDone: (q: FullQuote) => void }) {
  const toast = useToast();
  const [order, setOrder] = useState<Design[]>([]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setOrder(designs);
  }, [open, designs]);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    setOrder(next);
  };
  const save = async () => {
    setSaving(true);
    try {
      const r = await api.put<FullQuote>(`/api/quotes/${quoteId}/design-order`, { ids: order.map((d) => d.id) });
      toast.success('Design order saved');
      onDone(r);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Design orders"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={save}>
            Save order
          </Button>
        </>
      }
    >
      <p className="muted fs-12 mb-12">Drag designs or use the arrows. This order is used in the quotation and all reports.</p>
      <div className="col gap-4">
        {order.map((d, i) => (
          <div
            key={d.id}
            className={`order-row ${dragIdx === i ? 'dragging' : ''}`}
            draggable
            onDragStart={() => setDragIdx(i)}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragIdx !== null && dragIdx !== i) {
                move(dragIdx, i);
                setDragIdx(i);
              }
            }}
            onDragEnd={() => setDragIdx(null)}
          >
            <GripVertical size={15} color="var(--muted)" />
            <span className="fw-600" style={{ width: 44 }}>
              {d.ref}
            </span>
            <span className="grow ellipsis">
              {d.name} <span className="muted">{d.location}</span>
            </span>
            <span className="muted fs-12">
              {d.data.width} × {d.data.height}
            </span>
            <IconButton size="sm" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label="Move up">
              <ArrowUp size={14} />
            </IconButton>
            <IconButton size="sm" disabled={i === order.length - 1} onClick={() => move(i, i + 1)} aria-label="Move down">
              <ArrowDown size={14} />
            </IconButton>
          </div>
        ))}
      </div>
    </Modal>
  );
}

interface DesignDetail {
  design: Design;
  bom: { lines: BomLine[]; cuts: CutLine[]; panes: PaneLine[]; sashes: Design['sashes']; warnings: string[]; frameCode: string };
  price: { heads: HeadValue[]; basic: number; grand: number; sqftRate: number; autoBasic: number };
}

export function DesignDetailsDrawer({
  designId,
  onClose,
  onEdit,
  onChanged,
}: {
  designId: number | null;
  onClose: () => void;
  onEdit: (id: number) => void;
  /** Called after the design's extra costs change (so the quote can reload its totals). */
  onChanged?: () => void;
}) {
  const toast = useToast();
  const [data, setData] = useState<DesignDetail | null>(null);
  const [tab, setTab] = useState<'summary' | 'bom' | 'cuts'>('summary');
  const [addonOpen, setAddonOpen] = useState(false);
  const refresh = async (id: number) => {
    try {
      setData(await api.get<DesignDetail>(`/api/designs/${id}`));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  useEffect(() => {
    if (designId == null) return;
    setData(null);
    setTab('summary');
    api
      .get<DesignDetail>(`/api/designs/${designId}`)
      .then(setData)
      .catch((e) => toast.error(errorMessage(e)));
  }, [designId, toast]);

  const d = data?.design;
  const groups = data ? [...new Set(data.bom.lines.map((l) => l.grp))] : [];
  return (
    <Drawer
      open={designId != null}
      onClose={onClose}
      width="wide"
      title={d ? `${d.ref} · ${d.name || 'Design'}` : 'Design details'}
      footer={
        d && (
          <>
            <Button onClick={onClose}>Close</Button>
            <Button variant="primary" onClick={() => onEdit(d.id)}>
              Edit design
            </Button>
          </>
        )
      }
    >
      {!data || !d ? (
        <div className="page-loading">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="col gap-16">
          <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
            <div style={{ width: 240, height: 240, background: '#f7f9fb', borderRadius: 8, flex: 'none' }}>
              <DesignSvg data={d.data} frameColor={d.colorHexIn || d.colorHex} showLabels showNumbers style={{ width: '100%', height: '100%' }} />
            </div>
            <table className="table table-compact grow">
              <tbody>
                <tr><td className="muted">Size</td><td>W = {fixed2(d.data.width)}, H = {fixed2(d.data.height)}</td></tr>
                <tr><td className="muted">Area</td><td>{d.areaSqm.toFixed(3)} Sqmt / {d.areaSqft.toFixed(3)} Sqft</td></tr>
                <tr><td className="muted">Quantity</td><td>{d.qty}</td></tr>
                <tr><td className="muted">Location</td><td>{d.location || '—'} {d.floor ? `· Floor ${d.floor}` : ''}</td></tr>
                <tr><td className="muted">System</td><td>{d.systemName}</td></tr>
                <tr><td className="muted">Colour</td><td>Inside {d.colorInside} / Outside {d.colorOutside}</td></tr>
                <tr><td className="muted">Glass</td><td>{d.glassLabels.join(', ')}</td></tr>
                <tr><td className="muted">Shutter weight</td><td>{d.sashes.map((s) => `${s.label}-${s.weight}`).join('; ') || '—'} {d.sashes.length ? 'kg' : ''}</td></tr>
                <tr><td className="muted">Unit price</td><td className="fw-600">{inr(d.unitPrice)} <span className="muted fs-12">({inr(d.sqftRate)}/sqft basic)</span></td></tr>
                <tr><td className="muted">Total</td><td className="fw-600">{inr(d.totalPrice)}</td></tr>
                <tr>
                  <td className="muted">Extra costs</td>
                  <td>
                    <div className="row wrap gap-4">
                      {d.addons.map((a, i) => (
                        <span key={i} className="badge badge-primary">
                          {a.name}: {inr(a.amount)}
                          {a.basis === 'sqft' ? '/sqft' : '/unit'}
                        </span>
                      ))}
                      <Button size="xs" variant="outline-primary" icon={<Plus size={12} />} onClick={() => setAddonOpen(true)} data-tour="design-addon-edit">
                        {d.addons.length ? 'Edit extra costs' : 'Add extra cost'}
                      </Button>
                    </div>
                  </td>
                </tr>
                {(d.addedShare ?? 0) > 0.005 && (
                  <tr>
                    <td className="muted">Added entries</td>
                    <td className="fs-12">
                      {inr(d.addedShare)} per unit <span className="muted">· share of the entries added on the Pricing rate pages</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {data.bom.warnings.length > 0 && (
            <div className="alert alert-warning">
              <div>
                {data.bom.warnings.map((w) => (
                  <div key={w}>{w}</div>
                ))}
              </div>
            </div>
          )}
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'summary', label: 'Cost summary' },
              { value: 'bom', label: 'Bill of materials', count: data.bom.lines.length },
              { value: 'cuts', label: 'Cutting list', count: data.bom.cuts.length },
            ]}
          />
          {tab === 'summary' && (
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>Cost head</th>
                  <th>Calculation type</th>
                  <th className="num">Rate</th>
                  <th className="num">Value (per unit)</th>
                </tr>
              </thead>
              <tbody>
                {data.price.heads.map((h) => (
                  <tr key={h.name} className={h.visibility === 'summary' ? 'highlight' : ''}>
                    <td>{h.name}</td>
                    <td className="muted">{h.calcType}</td>
                    <td className="num">{h.rate}</td>
                    <td className="num">{fixed2(h.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === 'bom' && (
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Code</th>
                  <th className="num">Qty</th>
                  <th>Unit</th>
                  <th className="num">Rate</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <GroupRows key={g} title={g} lines={data.bom.lines.filter((l) => l.grp === g)} />
                ))}
              </tbody>
            </table>
          )}
          {tab === 'cuts' && (
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>Profile</th>
                  <th>Member</th>
                  <th className="num">Length (mm)</th>
                  <th>Angle</th>
                  <th className="num">Qty</th>
                </tr>
              </thead>
              <tbody>
                {data.bom.cuts.map((c, i) => (
                  <tr key={i}>
                    <td>
                      {c.name}
                      <div className="muted fs-11">{c.code}</div>
                    </td>
                    <td>{c.member}</td>
                    <td className="num">{c.length}</td>
                    <td>{c.angle}</td>
                    <td className="num">{c.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {addonOpen && d && (
        <DetailsAddonDialog
          design={d}
          onClose={() => setAddonOpen(false)}
          onSaved={async () => {
            await refresh(d.id);
            onChanged?.();
          }}
        />
      )}
    </Drawer>
  );
}

/** Opened from the design details drawer: the design's add-on cost heads. */
function DetailsAddonDialog({ design, onClose, onSaved }: { design: Design; onClose: () => void; onSaved: () => Promise<void> }) {
  return <DesignAddonDialog design={{ id: design.id, ref: design.ref, name: design.name, areaSqft: design.areaSqft, addons: design.addons }} onClose={onClose} onSaved={onSaved} />;
}

function GroupRows({ title, lines }: { title: string; lines: BomLine[] }) {
  const total = lines.reduce((s, l) => s + l.amount, 0);
  return (
    <>
      <tr>
        <td colSpan={6} className="fw-600" style={{ background: '#f3f6fa' }}>
          {title}
        </td>
      </tr>
      {lines.map((l) => (
        <tr key={l.code}>
          <td>{l.name}</td>
          <td className="muted">{l.code}</td>
          <td className="num">{qtyFmt(l.qty, l.unit)}</td>
          <td>{l.unit}</td>
          <td className="num">{fixed2(l.rate)}</td>
          <td className="num">{fixed2(l.amount)}</td>
        </tr>
      ))}
      <tr>
        <td colSpan={5} className="text-right muted">
          {title} Total
        </td>
        <td className="num fw-600">{fixed2(total)}</td>
      </tr>
    </>
  );
}
