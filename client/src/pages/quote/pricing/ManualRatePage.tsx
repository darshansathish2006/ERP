import { useEffect, useMemo, useState } from 'react';
import { Pencil, RotateCcw } from 'lucide-react';
import { api, errorMessage } from '../../../lib/api';
import { inr } from '../../../lib/format';
import { useMasters } from '../../../context/MastersContext';
import { useToast } from '../../../components/feedback';
import { Button, Checkbox, Field, IconButton, Input } from '../../../components/ui';
import { Modal } from '../../../components/overlay';
import { Combobox } from '../../../components/Combobox';
import type { PricingDesign } from './PricingTab';

interface Row {
  id: number;
  calcType: 'auto' | 'manual';
  sqft: string;
  basic: string;
}

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export function ManualRatePage({ quoteId, designs, onSaved, canEdit = true }: { quoteId: number; designs: PricingDesign[]; onSaved: () => Promise<void>; canEdit?: boolean }) {
  const { masters } = useMasters();
  const toast = useToast();
  const initial = useMemo(
    () =>
      designs.map<Row>((d) => {
        const sqft = d.calcType === 'manual' && d.manualSqftRate ? d.manualSqftRate : r2(d.autoSqftRate);
        return { id: d.id, calcType: d.calcType, sqft: String(r2(sqft)), basic: String(r2(sqft * d.areaSqft)) };
      }),
    [designs],
  );
  const [rows, setRows] = useState<Row[]>(initial);
  const [saving, setSaving] = useState(false);
  const [single, setSingle] = useState<{ types: string[]; systems: string[]; all: boolean; value: string } | null>(null);
  const [singleError, setSingleError] = useState<string | null>(null);

  useEffect(() => setRows(initial), [initial]);

  const design = (id: number) => designs.find((d) => d.id === id)!;
  const update = (id: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const setSqft = (id: number, v: string) => {
    const d = design(id);
    const n = Number(v);
    update(id, { sqft: v, basic: v !== '' && Number.isFinite(n) ? String(r2(n * d.areaSqft)) : '', calcType: 'manual' });
  };
  const setBasic = (id: number, v: string) => {
    const d = design(id);
    const n = Number(v);
    update(id, { basic: v, sqft: v !== '' && Number.isFinite(n) && d.areaSqft ? String(Math.round((n / d.areaSqft) * 10000) / 10000) : '', calcType: 'manual' });
  };
  const resetRow = (id: number) => {
    const d = design(id);
    update(id, { calcType: 'auto', sqft: String(r2(d.autoSqftRate)), basic: String(r2(d.autoBasic)) });
  };

  const save = async () => {
    for (const r of rows) {
      if (r.calcType === 'manual' && !(Number(r.sqft) > 0)) {
        toast.error(`Enter a valid SQFT rate for ${design(r.id).ref}`);
        return;
      }
    }
    setSaving(true);
    try {
      await api.put(`/api/quotes/${quoteId}/manual-rates`, {
        designs: rows.map((r) => ({ id: r.id, calcType: r.calcType, manualSqftRate: r.calcType === 'manual' ? Number(r.sqft) : null })),
      });
      await onSaved();
      toast.success('Data saved successfully');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const systemType = (name: string) => masters.systems.find((s) => s.name === name)?.type.toUpperCase() || '';
  const applySingle = () => {
    if (!single) return;
    const n = Number(single.value);
    if (single.value === '' || !(n > 0)) return setSingleError('SQFT value is required');
    if (!single.all && !single.types.length && !single.systems.length) return setSingleError('Select a system type or system name, or apply to all');
    let count = 0;
    const next = rows.map((r) => {
      const d = design(r.id);
      const match = single.all || ((!single.types.length || single.types.includes(systemType(d.systemName))) && (!single.systems.length || single.systems.includes(d.systemName)));
      if (!match) return r;
      count += 1;
      return { ...r, calcType: 'manual' as const, sqft: String(n), basic: String(r2(n * d.areaSqft)) };
    });
    setRows(next);
    setSingle(null);
    setSingleError(null);
    toast.info(`SQFT rate applied to ${count} design${count === 1 ? '' : 's'}. Click Save to update the quote.`);
  };

  const totals = rows.reduce(
    (acc, r) => {
      const d = design(r.id);
      acc.actual += d.autoBasic * d.qty;
      acc.manual += (r.calcType === 'manual' ? Number(r.basic) || 0 : d.autoBasic) * d.qty;
      acc.area += d.areaSqft * d.qty;
      return acc;
    },
    { actual: 0, manual: 0, area: 0 },
  );

  return (
    <div className="col gap-8" style={{ minHeight: 0, flex: 1 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="pricing-title">Design Manual Rate</div>
      </div>
      <div className="list-card" style={{ flex: 1, minHeight: 0 }}>
        {designs.length === 0 ? (
          <div className="empty">No designs in this quote yet.</div>
        ) : (
          <div className="table-wrap" style={{ flex: 1 }}>
            <table className="table manual-table">
              <thead>
                <tr>
                  <th rowSpan={2}>Design ref</th>
                  <th rowSpan={2}>System Name</th>
                  <th rowSpan={2}>Location</th>
                  <th rowSpan={2} className="num">
                    Design area (SQFT)
                  </th>
                  <th colSpan={3} className="group-head">
                    Actual cost
                  </th>
                  <th rowSpan={2}>Calculation type</th>
                  <th colSpan={2} className="group-head">
                    <span className="row gap-4" style={{ justifyContent: 'center' }}>
                      Manual cost
                      <IconButton
                        size="sm"
                        tip="Apply single rate SQFT"
                        tipPos="left"
                        onClick={() => {
                          setSingleError(null);
                          setSingle({ types: [], systems: [], all: false, value: '' });
                        }}
                      >
                        <Pencil size={13} />
                      </IconButton>
                    </span>
                  </th>
                </tr>
                <tr>
                  <th className="num">Qty</th>
                  <th className="num">Basic price</th>
                  <th className="num">SQFT rate</th>
                  <th>Basic price</th>
                  <th>SQFT rate</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const d = design(r.id);
                  const manual = r.calcType === 'manual';
                  return (
                    <tr key={r.id}>
                      <td className="fw-600">{d.ref}</td>
                      <td className="fs-12">{d.systemName}</td>
                      <td>{d.location || '—'}</td>
                      <td className="num">{d.areaSqft.toFixed(3)}</td>
                      <td className="num">{d.qty}</td>
                      <td className="num">{inr(d.autoBasic)}</td>
                      <td className="num">{inr(d.autoSqftRate)}</td>
                      <td>
                        <span className="row gap-4">
                          <select
                            className={`select select-sm calc-select ${manual ? 'manual' : 'actual'}`}
                            disabled={!canEdit}
                            value={r.calcType}
                            onChange={(e) => (e.target.value === 'auto' ? resetRow(r.id) : update(r.id, { calcType: 'manual' }))}
                            aria-label={`Calculation type for ${d.ref}`}
                          >
                            <option value="auto">Actual</option>
                            <option value="manual">Manual</option>
                          </select>
                          <IconButton size="sm" tip="Reset to auto" onClick={() => resetRow(r.id)}>
                            <RotateCcw size={13} />
                          </IconButton>
                        </span>
                      </td>
                      <td>
                        <div className="row gap-4">
                          <div className="input-rupee" style={{ width: 130 }}>
                            <Input sm type="number" min={0} step="0.01" value={r.basic} onChange={(e) => setBasic(r.id, e.target.value)} disabled={!manual} aria-label={`Manual basic price for ${d.ref}`} />
                          </div>
                          <span className="muted fs-11">x{d.qty}</span>
                        </div>
                      </td>
                      <td>
                        <div className="input-rupee" style={{ width: 110 }}>
                          <Input sm type="number" min={0} step="0.01" value={r.sqft} onChange={(e) => setSqft(r.id, e.target.value)} disabled={!manual} aria-label={`Manual SQFT rate for ${d.ref}`} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="fw-600">
                    Total
                  </td>
                  <td className="num fw-600">{totals.area.toFixed(3)}</td>
                  <td />
                  <td className="num fw-600">{inr(totals.actual)}</td>
                  <td className="num">{totals.area ? inr(totals.actual / totals.area) : '—'}</td>
                  <td />
                  <td className="fw-600">{inr(totals.manual)}</td>
                  <td>{totals.area ? inr(totals.manual / totals.area) : '—'}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <div className="row" style={{ justifyContent: 'flex-end', padding: 12, borderTop: '1px solid var(--border)' }}>
          <Button onClick={() => setRows(initial)}>Reset</Button>
          <Button variant="primary" loading={saving} onClick={save} disabled={!designs.length}>
            Save
          </Button>
        </div>
      </div>

      <Modal
        open={!!single}
        onClose={() => setSingle(null)}
        title="Update SQFT value"
        size="sm"
        footer={
          <>
            <Button onClick={() => setSingle(null)}>Cancel</Button>
            <Button variant="primary" onClick={applySingle}>
              Update
            </Button>
          </>
        }
      >
        {single && (
          <div className="col gap-12">
            {singleError && <div className="alert alert-error">{singleError}</div>}
            <Field label="System type" required={!single.all}>
              <Combobox
                multiple
                searchable={false}
                disabled={single.all}
                options={[...new Set(designs.map((d) => systemType(d.systemName)))].filter(Boolean).map((t) => ({ value: t, label: t }))}
                value={single.types}
                onChange={(v) => setSingle({ ...single, types: v })}
                placeholder="Select system type"
              />
            </Field>
            <Field label="System name" required={!single.all}>
              <Combobox
                multiple
                disabled={single.all}
                options={[...new Set(designs.map((d) => d.systemName))].map((n) => ({ value: n, label: n }))}
                value={single.systems}
                onChange={(v) => setSingle({ ...single, systems: v })}
                placeholder="Select system name"
              />
            </Field>
            <Checkbox checked={single.all} onChange={(v) => setSingle({ ...single, all: v })} label="Apply to all system type and system name" />
            <Field label="SQFT value" required error={singleError === 'SQFT value is required' ? singleError : null}>
              <div className="input-rupee">
                <Input type="number" min={0} step="0.01" value={single.value} onChange={(e) => setSingle({ ...single, value: e.target.value })} autoFocus />
              </div>
            </Field>
            <p className="muted fs-12">Basic price = SQFT value × design area. The difference from the auto price is posted to the FREEZE RATE cost head.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

