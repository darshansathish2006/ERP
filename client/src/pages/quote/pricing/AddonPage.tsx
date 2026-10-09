import { useState } from 'react';
import { Edit3, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../../lib/api';
import type { Addon } from '../../../lib/types';
import { inr } from '../../../lib/format';
import { useConfirm, useToast } from '../../../components/feedback';
import { Button, Empty, IconButton, Input, Select } from '../../../components/ui';
import { Modal } from '../../../components/overlay';
import type { PricingDesign } from './PricingTab';

const PRESETS = ['Grill work', 'Installation at height', 'Scaffolding', 'Custom colour charges', 'Arch / special shape', 'Child safety lock'];

/** What the add-on dialog needs to know about a design. */
export interface AddonDesign {
  id: number;
  ref: string;
  name: string;
  areaSqft: number;
  addons: Addon[];
}

const perUnit = (d: Pick<AddonDesign, 'areaSqft'>, addons: Addon[]) => addons.reduce((s, a) => s + (a.basis === 'sqft' ? a.amount * d.areaSqft : a.amount), 0);

export function AddonPage({ designs, onSaved }: { designs: PricingDesign[]; onSaved: () => Promise<void> }) {
  const [editing, setEditing] = useState<PricingDesign | null>(null);

  const total = designs.reduce((s, d) => s + perUnit(d, d.addons) * d.qty, 0);

  return (
    <div className="col gap-8" style={{ minHeight: 0, flex: 1 }}>
      <div className="pricing-title">Design Add On Cost Heads</div>
      <div className="alert alert-info">Add-on costs are added per design and flow into the DESIGN OVERHEAD cost head, which is added to the Basic Value after profit.</div>
      <div className="list-card" style={{ flex: 1, minHeight: 0 }} data-tour="addon-table">
        {designs.length === 0 ? (
          <Empty title="No designs in this quote yet">
            <span className="muted">Add designs in the Design tab, then add extra costs (grill work, scaffolding …) to each design here.</span>
          </Empty>
        ) : (
          <div className="table-wrap" style={{ flex: 1 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Design ref</th>
                  <th>Name</th>
                  <th>Location</th>
                  <th className="num">Area (SQFT)</th>
                  <th className="num">Qty</th>
                  <th>Add-on cost heads</th>
                  <th className="num">Per unit</th>
                  <th className="num">Total</th>
                  <th style={{ width: 44 }} />
                </tr>
              </thead>
              <tbody>
                {designs.map((d) => (
                  <tr key={d.id}>
                    <td className="fw-600">{d.ref}</td>
                    <td>{d.name}</td>
                    <td>{d.location || '—'}</td>
                    <td className="num">{d.areaSqft.toFixed(3)}</td>
                    <td className="num">{d.qty}</td>
                    <td>
                      {d.addons.length ? (
                        <div className="row wrap gap-4">
                          {d.addons.map((a, i) => (
                            <span key={i} className="badge badge-primary">
                              {a.name}: {inr(a.amount)}
                              {a.basis === 'sqft' ? '/sqft' : ''}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="num">{inr(perUnit(d, d.addons))}</td>
                    <td className="num fw-600">{inr(perUnit(d, d.addons) * d.qty)}</td>
                    <td>
                      <IconButton size="sm" tip="Edit add-ons" tipPos="left" onClick={() => setEditing(d)} data-tour="addon-edit">
                        <Edit3 size={14} />
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={7} className="text-right fw-600">
                    Total design overhead
                  </td>
                  <td className="num fw-600">{inr(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
      {editing && <DesignAddonDialog design={editing} onClose={() => setEditing(null)} onSaved={onSaved} />}
    </div>
  );
}

type AddonRow = { name: string; amount: string; basis: 'unit' | 'sqft' };

/** Add, edit or remove the add-on cost heads (extra costs) of one design. Used by Pricing and the design details drawer. */
export function DesignAddonDialog({ design, onClose, onSaved }: { design: AddonDesign; onClose: () => void; onSaved: () => Promise<void> | void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<AddonRow[]>(() =>
    design.addons.length ? design.addons.map((a) => ({ name: a.name, amount: String(a.amount), basis: a.basis })) : [{ name: '', amount: '', basis: 'unit' }],
  );
  const [saving, setSaving] = useState(false);
  const update = (i: number, patch: Partial<AddonRow>) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const remove = async (i: number) => {
    const r = rows[i];
    if (r.name.trim() || r.amount.trim()) {
      const ok = await confirm({ title: 'Remove add-on', message: `Remove "${r.name.trim() || 'this add-on'}" from ${design.ref}? It is removed from the quote when you save.`, confirmText: 'Remove', danger: true });
      if (!ok) return;
    }
    setRows((rs) => rs.filter((_, j) => j !== i));
  };

  const save = async () => {
    const filled = rows.filter((r) => r.name.trim() || r.amount.trim());
    for (const r of filled) {
      if (!r.name.trim()) return toast.error('Every add-on needs a name');
      if (r.amount.trim() === '' || !Number.isFinite(Number(r.amount))) return toast.error(`Enter an amount for ${r.name}`);
    }
    setSaving(true);
    try {
      await api.put(`/api/designs/${design.id}/addons`, { addons: filled.map((r) => ({ name: r.name.trim(), amount: Number(r.amount), basis: r.basis })) });
      await onSaved();
      toast.success(`Add-on cost heads saved for ${design.ref}`);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Add-on cost heads · ${design.ref} ${design.name}`}
      size="lg"
      closeOnBackdrop={false}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={save} data-tour="addon-save">
            Save
          </Button>
        </>
      }
    >
      <div className="col gap-8">
        <div className="muted fs-12">Extra costs for this design (per window or per sqft). They are added in the DESIGN OVERHEAD cost head, after profit.</div>
        {rows.length === 0 && <div className="muted">No add-ons. Add one below.</div>}
        {rows.map((r, i) => (
          <div key={i} className="row">
            <Input value={r.name} list="addon-presets" placeholder="Add-on name" aria-label={`Add-on ${i + 1} name`} onChange={(e) => update(i, { name: e.target.value })} style={{ flex: 2 }} autoFocus={i === rows.length - 1 && !r.name} />
            <div className="input-rupee" style={{ flex: 1 }}>
              <Input type="number" step="0.01" value={r.amount} placeholder="0.00" aria-label={`Add-on ${i + 1} amount`} onChange={(e) => update(i, { amount: e.target.value })} />
            </div>
            <Select value={r.basis} onChange={(e) => update(i, { basis: e.target.value as 'unit' | 'sqft' })} style={{ width: 130 }} aria-label={`Add-on ${i + 1} basis`}>
              <option value="unit">Per unit</option>
              <option value="sqft">Per SQFT</option>
            </Select>
            <IconButton tip="Remove" onClick={() => void remove(i)}>
              <Trash2 size={14} />
            </IconButton>
          </div>
        ))}
        <datalist id="addon-presets">
          {PRESETS.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <div>
          <Button size="sm" icon={<Plus size={13} />} onClick={() => setRows((rs) => [...rs, { name: '', amount: '', basis: 'unit' }])} data-tour="addon-add-row">
            Add add-on
          </Button>
        </div>
        <div className="muted fs-12 text-right">
          Per unit: <b>{inr(perUnit(design, rows.map((r) => ({ name: r.name, amount: Number(r.amount) || 0, basis: r.basis }))))}</b>
        </div>
      </div>
    </Modal>
  );
}
