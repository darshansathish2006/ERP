import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Truck } from 'lucide-react';
import { api, errorMessage } from '../../../lib/api';
import type { CostHead, QuoteSummary } from '../../../lib/types';
import { inr } from '../../../lib/format';
import { useToast } from '../../../components/feedback';
import { Button, Field, Input, Select, Switch, Textarea } from '../../../components/ui';
import { Modal } from '../../../components/overlay';

export type ChargeKind = 'fixed' | 'unit' | 'sqft' | 'percent';

const KINDS: { value: ChargeKind; label: string; amountLabel: string }[] = [
  { value: 'fixed', label: 'Fixed amount for this quote', amountLabel: 'Amount (₹)' },
  { value: 'unit', label: 'Amount per window', amountLabel: 'Amount per window (₹)' },
  { value: 'sqft', label: 'Amount per sqft', amountLabel: 'Rate per sqft (₹)' },
  { value: 'percent', label: 'Percentage of a cost head', amountLabel: 'Percentage (%)' },
];
const CALC_TO_KIND: Record<string, ChargeKind> = { LumpSumDivideByArea: 'fixed', LumpSumPerDesign: 'unit', AreaSqftFg: 'sqft', Percentage: 'percent' };
const PRESETS = ['Packing & forwarding', 'Scaffolding', 'Crane / lifting charges', 'Site cleaning', 'Installation at height', 'Courier charges', 'Old window removal'];

export function chargeKindOf(h: CostHead): ChargeKind {
  return CALC_TO_KIND[h.calcType] || 'fixed';
}

interface Vehicle {
  value: string;
  rate: number;
}

/** Vehicles from Settings → Transportation with their charge per trip. */
function useVehicles(): Vehicle[] | null {
  const [list, setList] = useState<Vehicle[] | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .get<Record<string, { value: string; meta: Record<string, unknown> }[]>>('/api/lookups')
      .then((r) => {
        if (alive) setList((r.transport_vehicle || []).map((v) => ({ value: v.value, rate: Number(v.meta?.rate) || 0 })));
      })
      .catch(() => alive && setList([]));
    return () => {
      alive = false;
    };
  }, []);
  return list;
}

/** "Vehicle × trips" helper that fills a transport amount from the Transportation settings. */
export function VehiclePicker({ onUse }: { onUse: (amount: number, label: string) => void }) {
  const vehicles = useVehicles();
  const [vehicle, setVehicle] = useState('');
  const [trips, setTrips] = useState('1');
  if (!vehicles) return null;
  const priced = vehicles.filter((v) => v.rate > 0);
  if (!priced.length) {
    return (
      <div className="charge-vehicle muted fs-12">
        <Truck size={14} /> Add vehicles with their charge per trip in Settings → Transportation → Vehicles to calculate transport here.
      </div>
    );
  }
  const v = priced.find((x) => x.value === vehicle) || priced[0];
  const n = Math.round(Number(trips));
  const valid = n >= 1 && n <= 999;
  return (
    <div className="charge-vehicle">
      <Truck size={14} />
      <span className="fs-12">Transport:</span>
      <Select sm value={v.value} onChange={(e) => setVehicle(e.target.value)} style={{ width: 190 }} aria-label="Vehicle">
        {priced.map((x) => (
          <option key={x.value} value={x.value}>
            {x.value} · {inr(x.rate, 0)}/trip
          </option>
        ))}
      </Select>
      <span className="fs-12">×</span>
      <Input sm type="number" min={1} step={1} value={trips} onChange={(e) => setTrips(e.target.value)} style={{ width: 64 }} aria-label="Trips" />
      <span className="fs-12">trips</span>
      <Button size="xs" variant="outline-primary" disabled={!valid} onClick={() => onUse(v.rate * n, `${v.value} × ${n} trip${n > 1 ? 's' : ''}`)}>
        Use {valid ? inr(v.rate * n, 0) : ''}
      </Button>
    </div>
  );
}

interface Form {
  name: string;
  kind: ChargeKind;
  amount: string;
  base: string;
  addTo: string;
  visibility: CostHead['visibility'];
  remark: string;
}

/** Add or edit a charge on this quote's price structure. */
export function ChargeDialog({
  quoteId,
  heads,
  summary,
  targets,
  defaultTarget,
  charge,
  onClose,
  onSaved,
  onAdvanced,
}: {
  quoteId: number;
  heads: CostHead[];
  summary: QuoteSummary;
  targets: string[];
  defaultTarget: string | null;
  /** The added head being edited, or null to add a new charge. */
  charge: CostHead | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  /** Opens the formula editor (users who may edit cost heads). */
  onAdvanced?: () => void;
}) {
  const toast = useToast();
  const initialBase = charge && chargeKindOf(charge) === 'percent' ? /\[([^\]]+)\]/.exec(charge.formula)?.[1] || '' : '';
  const [f, setF] = useState<Form>({
    name: charge?.name ?? '',
    kind: charge ? chargeKindOf(charge) : 'fixed',
    amount: charge ? String(charge.rate) : '',
    base: initialBase,
    addTo: charge?.addedTo || defaultTarget || targets[targets.length - 1] || '',
    visibility: charge?.visibility ?? 'summary',
    remark: charge?.remark ?? '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((p) => ({ ...p, [k]: undefined }));
  };

  // Heads that may be used as the percentage base: before the target, excluding this charge.
  const baseOptions = useMemo(() => {
    const ti = heads.findIndex((h) => h.name === f.addTo);
    return heads.slice(0, ti < 0 ? heads.length : ti).filter((h) => h.name !== charge?.name);
  }, [heads, f.addTo, charge]);
  const base = f.base && baseOptions.some((h) => h.name === f.base) ? f.base : '';

  const amount = Number(f.amount);
  const kindDef = KINDS.find((k) => k.value === f.kind)!;
  const estimate = useMemo(() => {
    if (!Number.isFinite(amount) || f.amount.trim() === '') return null;
    if (f.kind === 'fixed') return amount;
    if (f.kind === 'unit') return amount * summary.qty;
    if (f.kind === 'sqft') return amount * summary.areaSqft;
    const bv = summary.heads.find((h) => h.name === base)?.value;
    return bv == null ? null : (bv * amount) / 100;
  }, [amount, f.amount, f.kind, base, summary]);

  function validate() {
    const e: Partial<Record<keyof Form, string>> = {};
    const name = f.name.trim();
    if (!name) e.name = 'Charge name is required';
    else if (/[[\]]/.test(name)) e.name = 'The name cannot contain [ or ]';
    else if (heads.some((h) => h.name !== charge?.name && h.name.toLowerCase() === name.toLowerCase())) e.name = 'Another cost head already uses this name';
    if (f.amount.trim() === '' || !Number.isFinite(amount)) e.amount = f.kind === 'percent' ? 'Enter the percentage' : 'Enter the amount';
    else if (amount < 0) e.amount = 'Cannot be negative';
    else if (f.kind === 'percent' && amount > 1000) e.amount = 'Percentage must be 1000 or less';
    if (f.kind === 'percent' && !base) e.base = 'Choose the cost head the percentage applies to';
    if (!f.addTo) e.addTo = 'Choose where the charge is added';
    return e;
  }

  async function submit(ev?: FormEvent) {
    ev?.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    const body = { name: f.name.trim(), kind: f.kind, amount, base: f.kind === 'percent' ? base : undefined, addTo: f.addTo, visibility: f.visibility, remark: f.remark.trim() };
    try {
      if (charge) await api.put(`/api/quotes/${quoteId}/charges/${encodeURIComponent(charge.name)}`, body);
      else await api.post(`/api/quotes/${quoteId}/charges`, body);
      await onSaved();
      toast.success(charge ? `${body.name} updated` : `${body.name} added to the price structure`);
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
      title={charge ? `Edit charge · ${charge.name}` : 'Add cost head'}
      closeOnBackdrop={false}
      footer={
        <>
          {onAdvanced && !charge && (
            <Button variant="link" onClick={onAdvanced} style={{ marginRight: 'auto' }}>
              Advanced: write a formula
            </Button>
          )}
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="charge-form" loading={saving} data-tour="costhead-save">
            {charge ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <form id="charge-form" className="col gap-12" onSubmit={(e) => void submit(e)} noValidate>
        <div className="adm-form-grid">
          <Field label="Cost head name" required error={errors.name} className="adm-span-2" htmlFor="ch-name">
            <Input id="ch-name" value={f.name} list="charge-presets" maxLength={80} autoFocus invalid={!!errors.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Packing & forwarding" />
            <datalist id="charge-presets">
              {PRESETS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </Field>
          <Field label="Calculation" required htmlFor="ch-kind">
            <Select id="ch-kind" value={f.kind} onChange={(e) => set('kind', e.target.value as ChargeKind)}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={kindDef.amountLabel} required error={errors.amount} htmlFor="ch-amount">
            <div className={f.kind === 'percent' ? '' : 'input-rupee'}>
              <Input id="ch-amount" type="number" min={0} step="0.01" inputMode="decimal" value={f.amount} invalid={!!errors.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0.00" />
            </div>
          </Field>
          {f.kind === 'percent' && (
            <Field label="Percentage of" required error={errors.base} className="adm-span-2" htmlFor="ch-base">
              <Select id="ch-base" value={base} onChange={(e) => set('base', e.target.value)} invalid={!!errors.base}>
                <option value="">Select a cost head</option>
                {baseOptions.map((h) => (
                  <option key={h.name} value={h.name}>
                    {h.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Add into" required error={errors.addTo} hint="Into Total Project Cost the charge is taxed; into Grand Total it is not." htmlFor="ch-target">
            <Select id="ch-target" value={f.addTo} onChange={(e) => set('addTo', e.target.value)}>
              {targets.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Quote summary">
            <div style={{ paddingTop: 6 }}>
              <Switch checked={f.visibility === 'summary'} onChange={(v) => set('visibility', v ? 'summary' : 'hidden')} label="Show in quote summary" />
            </div>
          </Field>
          <Field label="Remark" className="adm-span-2" htmlFor="ch-remark">
            <Textarea id="ch-remark" value={f.remark} rows={2} maxLength={500} onChange={(e) => set('remark', e.target.value)} />
          </Field>
        </div>
        {f.kind === 'fixed' && (
          <VehiclePicker
            onUse={(amt, label) => {
              setF((p) => ({ ...p, amount: String(amt), name: p.name.trim() ? p.name : 'Transport charges', remark: p.remark.trim() ? p.remark : label }));
              setErrors({});
            }}
          />
        )}
        <div className="charge-estimate">
          {estimate == null ? (
            <span className="muted">Enter the {f.kind === 'percent' ? 'percentage and base' : 'amount'} to see the effect.</span>
          ) : (
            <>
              <span className="muted">This charge adds</span> <b>{inr(estimate)}</b>{' '}
              <span className="muted">
                {f.kind === 'unit' ? `(${summary.qty} window${summary.qty === 1 ? '' : 's'}) ` : f.kind === 'sqft' ? `(${summary.areaSqft.toFixed(3)} sqft) ` : ''}
                to {f.addTo || 'the total'}
                {f.kind === 'fixed' && summary.count > 1 ? ', shared across the designs by area' : ''}.
              </span>
            </>
          )}
        </div>
      </form>
    </Modal>
  );
}
