import { useState } from 'react';
import { Edit3, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../../lib/api';
import type { Addon } from '../../../lib/types';
import { inr } from '../../../lib/format';
import { useToast } from '../../../components/feedback';
import { Button, Empty, IconButton, Input, Select } from '../../../components/ui';
import { Modal } from '../../../components/overlay';
import type { PricingDesign } from './PricingTab';

const PRESETS = ['Grill work', 'Installation at height', 'Scaffolding', 'Custom colour charges', 'Arch / special shape', 'Child safety lock'];

const perUnit = (d: PricingDesign, addons: Addon[]) => addons.reduce((s, a) => s + (a.basis === 'sqft' ? a.amount * d.areaSqft : a.amount), 0);

export function AddonPage({ designs, onSaved }: { designs: PricingDesign[]; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [editing, setEditing] = useState<{ design: PricingDesign; rows: { name: string; amount: string; basis: 'unit' | 'sqft' }[] } | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!editing) return;
    for (const r of editing.rows) {
      if (!r.name.trim()) return toast.error('Every add-on needs a name');
      if (r.amount === '' || !Number.isFinite(Number(r.amount))) return toast.error(`Enter an amount for ${r.name}`);
    }
    setSaving(true);
    try {
      await api.put(`/api/designs/${editing.design.id}/addons`, { addons: editing.rows.map((r) => ({ name: r.name.trim(), amount: Number(r.amount), basis: r.basis })) });
      await onSaved();
      toast.success(`Add-on cost heads saved for ${editing.design.ref}`);
      setEditing(null);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const total = designs.reduce((s, d) => s + perUnit(d, d.addons) * d.qty, 0);

  return (
    <div className="col gap-8" style={{ minHeight: 0, flex: 1 }}>
      <div className="pricing-title">Design Add On Cost Heads</div>
      <div className="alert alert-info">Add-on costs are added per design and flow into the DESIGN OVERHEAD cost head, which is added to the Basic Value after profit.</div>
      <div className="list-card" style={{ flex: 1, minHeight: 0 }}>
        {designs.length === 0 ? (
          <Empty title="No designs in this quote yet" />
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
                      <IconButton size="sm" tip="Edit add-ons" tipPos="left" onClick={() => setEditing({ design: d, rows: d.addons.map((a) => ({ name: a.name, amount: String(a.amount), basis: a.basis })) })}>
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
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `Add-on cost heads · ${editing.design.ref} ${editing.design.name}` : ''}
        size="lg"
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={save}>
              Save
            </Button>
          </>
        }
      >
        {editing && (
          <div className="col gap-8">
            {editing.rows.length === 0 && <div className="muted">No add-ons yet. Add one below.</div>}
            {editing.rows.map((r, i) => (
              <div key={i} className="row">
                <Input
                  value={r.name}
                  list="addon-presets"
                  placeholder="Add-on name"
                  onChange={(e) => setEditing({ ...editing, rows: editing.rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
                  style={{ flex: 2 }}
                />
                <div className="input-rupee" style={{ flex: 1 }}>
                  <Input type="number" step="0.01" value={r.amount} onChange={(e) => setEditing({ ...editing, rows: editing.rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)) })} />
                </div>
                <Select value={r.basis} onChange={(e) => setEditing({ ...editing, rows: editing.rows.map((x, j) => (j === i ? { ...x, basis: e.target.value as 'unit' | 'sqft' } : x)) })} style={{ width: 130 }}>
                  <option value="unit">Per unit</option>
                  <option value="sqft">Per SQFT</option>
                </Select>
                <IconButton tip="Remove" onClick={() => setEditing({ ...editing, rows: editing.rows.filter((_, j) => j !== i) })}>
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
              <Button size="sm" icon={<Plus size={13} />} onClick={() => setEditing({ ...editing, rows: [...editing.rows, { name: '', amount: '', basis: 'unit' }] })}>
                Add add-on
              </Button>
            </div>
            <div className="muted fs-12 text-right">
              Per unit:{' '}
              <b>
                {inr(
                  perUnit(
                    editing.design,
                    editing.rows.map((r) => ({ name: r.name, amount: Number(r.amount) || 0, basis: r.basis })),
                  ),
                )}
              </b>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
