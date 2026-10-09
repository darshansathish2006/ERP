import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Boxes,
  Calculator,
  ChevronDown,
  Edit3,
  Grid2x2,
  Hammer,
  MoreVertical,
  PanelRightOpen,
  Plus,
  RefreshCw,
  Ruler,
  SquareStack,
  Trash2,
  Wrench,
} from 'lucide-react';
import { api, errorMessage } from '../../../lib/api';
import type { CostHead, FullQuote, QuoteSummary } from '../../../lib/types';
import { fixed2, inr } from '../../../lib/format';
import { useMasters } from '../../../context/MastersContext';
import { useConfirm, useToast } from '../../../components/feedback';
import { Badge, Button, Field, IconButton, Input, PageLoading, Select, Switch, Textarea } from '../../../components/ui';
import { Menu, Modal } from '../../../components/overlay';
import { useAuth } from '../../../context/AuthContext';
import { CostHeadDialog } from './CostHeadDialog';
import { RatePage, type RateCategory } from './RatePage';
import { ManualRatePage } from './ManualRatePage';
import { AddonPage } from './AddonPage';
import { ChargeDialog, VehiclePicker } from './ChargeDialog';

export interface PricingDesign {
  id: number;
  ref: string;
  name: string;
  location: string;
  systemName: string;
  qty: number;
  areaSqft: number;
  calcType: 'auto' | 'manual';
  manualSqftRate: number | null;
  autoBasic: number;
  autoSqftRate: number;
  basic: number;
  sqftRate: number;
  grand: number;
  addons: { name: string; amount: number; basis: 'unit' | 'sqft' }[];
}
export interface PricingData {
  priceStructureId: number;
  priceStructureName: string;
  heads: CostHead[];
  summary: QuoteSummary;
  designs: PricingDesign[];
  /** Subtotal heads a charge can be added into, and the default one. */
  chargeTargets?: string[];
  defaultChargeTarget?: string | null;
}

type View = 'structure' | RateCategory | 'addons' | 'manual';

const MENU: { view: View; label: string; icon: React.ReactNode }[] = [
  { view: 'profile', label: 'Profile Rate', icon: <Ruler size={15} /> },
  { view: 'reinforcement', label: 'Reinforcement Rate', icon: <SquareStack size={15} /> },
  { view: 'hardware', label: 'Hardware Rate', icon: <Wrench size={15} /> },
  { view: 'glass', label: 'Glass Rate', icon: <Grid2x2 size={15} /> },
  { view: 'mesh', label: 'Mesh Rate', icon: <Boxes size={15} /> },
  { view: 'addons', label: 'Design Add On Cost Heads', icon: <Hammer size={15} /> },
  { view: 'manual', label: 'Design Manual Rate', icon: <Calculator size={15} /> },
];

export function PricingTab({ quoteId, summary, reloadQuote }: { quoteId: number; summary: QuoteSummary; reloadQuote: () => Promise<FullQuote | null> }) {
  const { masters } = useMasters();
  const toast = useToast();
  const confirm = useConfirm();
  const [view, setView] = useState<View>('structure');
  const [data, setData] = useState<PricingData | null>(null);
  const [showFormula, setShowFormula] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [editing, setEditing] = useState<{ index: number; head: CostHead; isNew: boolean } | null>(null);
  const [modify, setModify] = useState<{ index: number; head: CostHead } | null>(null);
  const [charge, setCharge] = useState<{ head: CostHead | null } | null>(null);
  const { user } = useAuth();
  const canManual = !!user?.permissions?.['quote.manualRate'];

  const load = useCallback(async () => {
    try {
      setData(await api.get<PricingData>(`/api/quotes/${quoteId}/pricing`));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }, [quoteId, toast]);

  useEffect(() => {
    void load();
  }, [load, summary.grand]);

  const afterChange = async () => {
    await Promise.all([load(), reloadQuote()]);
  };

  const updatePricing = async () => {
    setUpdating(true);
    try {
      await api.post(`/api/quotes/${quoteId}/update-pricing`);
      await afterChange();
      toast.success('Pricing updated successfully');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUpdating(false);
    }
  };

  const switchStructure = async (id: number, name: string) => {
    if (!data || id === data.priceStructureId) return;
    const ok = await confirm({
      title: 'Change price structure',
      message: `Switch this quote to "${name}"? The cost heads of this quote will be replaced with the ones from ${name}. Charges you added to this quote are kept.`,
      confirmText: 'Switch',
    });
    if (!ok) return;
    try {
      const r = await api.post<{ keptCharges?: string[]; droppedCharges?: string[] }>(`/api/quotes/${quoteId}/price-structure`, { priceStructureId: id });
      await afterChange();
      toast.success(`Price structure changed to ${name}${r.keptCharges?.length ? ` · ${r.keptCharges.length} added charge${r.keptCharges.length > 1 ? 's' : ''} kept` : ''}`);
      if (r.droppedCharges?.length) toast.warning(`Could not carry over: ${r.droppedCharges.join(', ')}. Add ${r.droppedCharges.length > 1 ? 'them' : 'it'} again if needed.`, 6000);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const saveHeads = async (heads: CostHead[], message: string) => {
    try {
      await api.put(`/api/quotes/${quoteId}/cost-heads`, { costHeads: heads });
      await afterChange();
      toast.success(message);
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    }
  };

  const moveHead = (i: number, dir: -1 | 1) => {
    if (!data) return;
    const heads = [...data.heads];
    const j = i + dir;
    if (j < 0 || j >= heads.length) return;
    [heads[i], heads[j]] = [heads[j], heads[i]];
    void saveHeads(heads, 'Cost head order updated');
  };

  const deleteCharge = async (h: CostHead) => {
    const value = data?.summary.heads.find((x) => x.name === h.name)?.value ?? 0;
    const ok = await confirm({
      title: 'Delete added charge',
      message: (
        <>
          Remove <b>{h.name}</b> ({inr(value)}) from this quote? It is also taken out of {h.addedTo || 'the total'}.
        </>
      ),
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/api/quotes/${quoteId}/charges/${encodeURIComponent(h.name)}`);
      await afterChange();
      toast.success(`${h.name} deleted`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const deleteHead = async (i: number) => {
    if (!data) return;
    const h = data.heads[i];
    if (!(await confirm({ title: 'Delete cost head', message: `Delete "${h.name}"? Formulas that reference it will need to be updated.`, confirmText: 'Delete', danger: true }))) return;
    void saveHeads(
      data.heads.filter((_, j) => j !== i),
      'Cost head deleted',
    );
  };

  if (!data) return <PageLoading />;

  const nav = (
    <aside className="pricing-nav" data-tour="pricing-nav">
      <button className={`pricing-nav-item ${view === 'structure' ? 'active' : ''}`} onClick={() => setView('structure')} data-tour="pricing-nav-structure">
        <PanelRightOpen size={15} /> Project Price Structure
      </button>
      {MENU.map((m) => (
        <button key={m.view} className={`pricing-nav-item ${view === m.view ? 'active' : ''}`} onClick={() => setView(m.view)} data-tour={`pricing-nav-${m.view}`}>
          {m.icon}
          {m.label}
        </button>
      ))}
    </aside>
  );

  if (view !== 'structure') {
    return (
      <div className="pricing-layout">
        {nav}
        <div className="pricing-main">
          {view === 'manual' ? (
            <ManualRatePage quoteId={quoteId} designs={data.designs} onSaved={afterChange} canEdit={canManual} />
          ) : view === 'addons' ? (
            <AddonPage designs={data.designs} onSaved={afterChange} />
          ) : (
            <RatePage key={view} quoteId={quoteId} category={view} onSaved={afterChange} />
          )}
        </div>
      </div>
    );
  }

  const summaryHeads = data.summary.heads.filter((h) => h.visibility === 'summary' && !/grand total/i.test(h.name));
  const grandHead = data.summary.heads.find((h) => /grand total/i.test(h.name)) || data.summary.heads[data.summary.heads.length - 1];
  const isSubtotal = (h: CostHead) => (/\[[^\]]+\]\s*[+-]/.test(h.formula || '') && h.calcType === 'CustomFormula') || h.calcType === 'UserDefinedFGOverhead' || h.calcType === 'ManualPriceAutoAdjustment';

  return (
    <div className="pricing-layout">
      {nav}
      <div className="pricing-main">
        <div className="pricing-title">Project price structure</div>
        {data.summary.errors.length > 0 && (
          <div className="alert alert-error mb-12">
            <div>
              {data.summary.errors.map((e) => (
                <div key={e}>{e}</div>
              ))}
            </div>
          </div>
        )}
        <div className="list-card" style={{ flex: 1, minHeight: 0 }}>
          <div className="toolbar">
            <Menu
              placement="bottom-start"
              trigger={({ ref, onClick }) => (
                <Button ref={ref} size="sm" variant="dark" onClick={onClick} disabled={!canManual} data-tour="pricing-structure">
                  {data.priceStructureName}
                  <ChevronDown size={13} />
                </Button>
              )}
              items={masters.priceStructures.map((p) => ({ label: p.name + (p.id === data.priceStructureId ? '  ✓' : ''), onClick: () => void switchStructure(p.id, p.name) }))}
            />
            <div className="grow" />
            <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => setCharge({ head: null })} data-tour="costhead-add">
              Add cost head
            </Button>
            <Button size="sm" variant="outline-primary" icon={<RefreshCw size={13} />} loading={updating} onClick={updatePricing} data-tour="pricing-update">
              Update Pricing
            </Button>
          </div>
          <div className="table-wrap" style={{ flex: 1 }} data-tour="pricing-table">
            <table className="table cost-table">
              <thead>
                <tr>
                  <th className="kebab-cell" />
                  <th style={{ width: 60 }}>Sl. No</th>
                  <th>Cost Heads</th>
                  <th>
                    <span className="row gap-8">
                      {showFormula ? 'Calculation Formula' : 'Calculation Type'}
                      <Switch checked={showFormula} onChange={setShowFormula} />
                    </span>
                  </th>
                  <th className="num" style={{ width: 90 }}>
                    Rate
                  </th>
                  <th className="num" style={{ width: 120 }}>
                    Value
                  </th>
                  <th style={{ width: 190 }}>Visibility</th>
                </tr>
              </thead>
              <tbody>
                {data.heads.map((h, i) => {
                  const value = data.summary.heads.find((x) => x.name === h.name)?.value ?? 0;
                  return (
                    <tr key={h.name} className={h.added ? 'added-head-row' : isSubtotal(h) ? 'highlight' : ''}>
                      <td className="kebab-cell" data-tour="pricing-head-actions">
                        {h.added ? (
                          <Menu
                            placement="bottom-start"
                            trigger={({ ref, onClick }) => (
                              <IconButton ref={ref} size="sm" onClick={onClick} aria-label="Charge actions" data-tour="costhead-actions">
                                <MoreVertical size={15} />
                              </IconButton>
                            )}
                            items={[
                              { label: `Edit ${h.name}`, icon: <Edit3 size={15} />, onClick: () => setCharge({ head: h }), dataTour: 'costhead-edit' },
                              { separator: true },
                              { label: 'Delete', icon: <Trash2 size={15} />, danger: true, onClick: () => void deleteCharge(h) },
                            ]}
                          />
                        ) : canManual && (
                          <Menu
                            placement="bottom-start"
                            trigger={({ ref, onClick }) => (
                              <IconButton ref={ref} size="sm" onClick={onClick} aria-label="Cost head actions">
                                <MoreVertical size={15} />
                              </IconButton>
                            )}
                            items={[
                              { label: `Modify ${h.name}`, icon: <Edit3 size={15} />, onClick: () => setModify({ index: i, head: h }) },
                              { label: 'Edit formula', icon: <Calculator size={15} />, onClick: () => setEditing({ index: i, head: h, isNew: false }) },
                              { label: 'Move up', icon: <ArrowUp size={15} />, disabled: i === 0, onClick: () => moveHead(i, -1) },
                              { label: 'Move down', icon: <ArrowDown size={15} />, disabled: i === data.heads.length - 1, onClick: () => moveHead(i, 1) },
                              { separator: true },
                              { label: 'Delete', icon: <Trash2 size={15} />, danger: true, onClick: () => void deleteHead(i) },
                            ]}
                          />
                        )}
                      </td>
                      <td>{h.sl}</td>
                      <td>
                        <span className="row gap-8">
                          <span className="cost-icon">₹</span>
                          {h.name}
                          {h.added && <Badge tone="primary">Added</Badge>}
                        </span>
                        {h.remark && <div className="muted fs-11">{h.remark}</div>}
                      </td>
                      <td className={showFormula ? 'mono fs-12' : ''}>{showFormula ? evaFormula(h.formula) || '—' : h.calcType}</td>
                      <td className="num">{h.rate}</td>
                      <td className="num">{fixed2(value)}</td>
                      <td>
                        <span className={`vis-chip ${h.visibility === 'summary' ? 'show' : ''}`}>{h.visibility === 'summary' ? 'Show in Quote Summary' : 'Do not show in Quote'}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <aside className="price-summary-card" data-tour="pricing-summary">
        <div className="price-summary-title">Price Summary</div>
        {data.designs.length === 0 && !data.summary.addedItems?.count && !data.summary.grand ? (
          <div className="price-summary-empty">No data found</div>
        ) : (
          <>
            {summaryHeads.map((h) => (
              <div key={h.name} className="price-summary-line">
                <span>{h.name}</span>
                <span>{inr(h.value)}</span>
              </div>
            ))}
            {grandHead && (
              <div className="price-summary-line grand">
                <span>{grandHead.name}</span>
                <span>{inr(grandHead.value)}</span>
              </div>
            )}
            <div className="price-summary-foot">
              {data.summary.areaSqft.toFixed(3)} Sqft · {inr(data.summary.sqftRateWithTax)}/Sqft
            </div>
          </>
        )}
      </aside>
      {editing && (
        <CostHeadDialog
          head={editing.head}
          isNew={editing.isNew}
          existingNames={data.heads.filter((_, j) => j !== editing.index || editing.isNew).map((h) => h.name)}
          onClose={() => setEditing(null)}
          onSave={async (h) => {
            const heads = [...data.heads];
            if (editing.isNew) heads.splice(Math.max(0, heads.length - 3), 0, h);
            else {
              const oldName = heads[editing.index].name;
              heads[editing.index] = h;
              if (oldName !== h.name) {
                for (let k = 0; k < heads.length; k++) heads[k] = { ...heads[k], formula: (heads[k].formula || '').split(`[${oldName}]`).join(`[${h.name}]`) };
              }
            }
            const ok = await saveHeads(heads, editing.isNew ? 'Cost head added' : 'Cost head updated');
            if (ok) setEditing(null);
          }}
        />
      )}
      {charge && (
        <ChargeDialog
          quoteId={quoteId}
          heads={data.heads}
          summary={data.summary}
          targets={data.chargeTargets ?? []}
          defaultTarget={data.defaultChargeTarget ?? null}
          charge={charge.head}
          onClose={() => setCharge(null)}
          onSaved={afterChange}
          onAdvanced={
            canManual
              ? () => {
                  setCharge(null);
                  setEditing({ index: data.heads.length - 1, isNew: true, head: { sl: data.heads.length, name: '', calcType: 'LumpSumDivideByArea', formula: '#LUMPSUM', rate: 0, visibility: 'summary' } });
                }
              : undefined
          }
        />
      )}
      {modify && (
        <ModifyHeadDialog
          head={modify.head}
          onClose={() => setModify(null)}
          onSave={async (patch) => {
            const heads = data.heads.map((h, j) => (j === modify.index ? { ...h, ...patch } : h));
            const ok = await saveHeads(heads, 'Data saved successfully');
            if (ok) setModify(null);
          }}
        />
      )}
    </div>
  );
}

/** EvA-style formula text: [Head] → @Head.value, #AREASQFT → #AreaSqftFg, lump sums → 1. */
export function evaFormula(f: string): string {
  return (f || '')
    .replace(/\[([^\]]+)\]/g, '@$1.value')
    .replace(/#AREASQFT/g, '#AreaSqftFg')
    .replace(/#AREASQM/g, '#AreaSqmFg')
    .replace(/#LUMPSUM/g, '1')
    .replace(/#DESIGNADDON|#MANUALADJUSTMENT/g, '0');
}

function ModifyHeadDialog({ head, onClose, onSave }: { head: CostHead; onClose: () => void; onSave: (patch: Partial<CostHead>) => Promise<void> }) {
  const [rate, setRate] = useState(String(head.rate));
  const [visibility, setVisibility] = useState(head.visibility);
  const [remark, setRemark] = useState(head.remark || '');
  const [saving, setSaving] = useState(false);
  const changed = rate !== String(head.rate) || visibility !== head.visibility || remark !== (head.remark || '');
  const valid = rate.trim() !== '' && Number.isFinite(Number(rate));
  return (
    <Modal
      open
      onClose={onClose}
      title={`Modify ${head.name}`}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!changed || !valid}
            loading={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave({ rate: Number(rate), visibility, remark: remark.trim() });
              } finally {
                setSaving(false);
              }
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="col gap-12">
        <div>
          <div className="field-label">Calculation type</div>
          <div className="fw-600 fs-12 mt-8">{head.calcType}</div>
        </div>
        <Field label="Rate" required error={valid ? null : 'Enter a number'}>
          <Input type="number" step="any" value={rate} onChange={(e) => setRate(e.target.value)} autoFocus />
        </Field>
        {/transport/i.test(head.name) && head.calcType.startsWith('LumpSum') && (
          <VehiclePicker
            onUse={(amount, label) => {
              setRate(String(amount));
              if (!remark.trim()) setRemark(label);
            }}
          />
        )}
        <Field label="Show in quote report">
          <Select value={visibility} onChange={(e) => setVisibility(e.target.value as CostHead['visibility'])}>
            <option value="summary">Show in Quote Summary</option>
            <option value="hidden">Do not show in Quote</option>
          </Select>
        </Field>
        <Field label="Remark">
          <Textarea value={remark} onChange={(e) => setRemark(e.target.value)} rows={3} maxLength={500} />
        </Field>
      </div>
    </Modal>
  );
}
