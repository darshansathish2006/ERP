import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../../../lib/api';
import type { QuoteItem, QuoteItemCategory, QuoteSummary } from '../../../lib/types';
import { inr } from '../../../lib/format';
import { useToast } from '../../../components/feedback';
import { Button, Field, Input, Select } from '../../../components/ui';
import { Modal } from '../../../components/overlay';

export const ITEM_CATEGORY_LABEL: Record<QuoteItemCategory, string> = {
  profile: 'uPVC profile',
  aluminium: 'Aluminium profile',
  reinforcement: 'Reinforcement',
  hardware: 'Hardware',
  glass: 'Glass',
  mesh: 'Mesh',
};

/** The cost head (in the standard price structures) each kind of entry is counted in. */
export const ITEM_COST_HEAD: Record<QuoteItemCategory, string> = {
  profile: 'uPVC Profile Cost',
  aluminium: 'Aluminium Profile Cost',
  reinforcement: 'RI Cost',
  hardware: 'Hardware Cost',
  glass: 'Glass Cost',
  mesh: 'Hardware Cost',
};

const UNITS = ['Meter', 'Pcs', 'Set', 'SQMT', 'Kg', 'CAN', 'Nos', 'Lump sum'];
const DEFAULT_UNIT: Record<QuoteItemCategory, string> = { profile: 'Meter', aluminium: 'Meter', reinforcement: 'Meter', hardware: 'Pcs', glass: 'SQMT', mesh: 'SQMT' };

interface Form {
  category: QuoteItemCategory;
  name: string;
  code: string;
  color: string;
  unit: string;
  qty: string;
  rate: string;
}
type Errors = Partial<Record<keyof Form, string>>;

/** Add or edit a custom entry on a rate page. `categories` limits the type choice (profile page: uPVC + aluminium). */
export function QuoteItemDialog({
  quoteId,
  item,
  categories,
  onClose,
  onSaved,
}: {
  quoteId: number;
  item: QuoteItem | null;
  categories: QuoteItemCategory[];
  onClose: () => void;
  onSaved: (summary: QuoteSummary) => Promise<void> | void;
}) {
  const toast = useToast();
  const first = item?.category ?? categories[0];
  const [f, setF] = useState<Form>({
    category: first,
    name: item?.name ?? '',
    code: item?.code ?? '',
    color: item?.color ?? '',
    unit: item?.unit ?? DEFAULT_UNIT[first],
    qty: item ? String(item.qty) : '1',
    rate: item ? String(item.rate) : '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const units = UNITS.includes(f.unit) ? UNITS : [f.unit, ...UNITS];

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((p) => ({ ...p, [k]: undefined }));
  };

  const qty = Number(f.qty);
  const rate = Number(f.rate);
  const amount = Number.isFinite(qty) && Number.isFinite(rate) ? qty * rate : 0;

  function validate(): Errors {
    const e: Errors = {};
    if (!f.name.trim()) e.name = 'Item name is required';
    if (f.qty.trim() === '' || !Number.isFinite(qty) || qty <= 0) e.qty = 'Enter a quantity greater than 0';
    if (f.rate.trim() === '' || !Number.isFinite(rate) || rate < 0) e.rate = 'Enter a rate of 0 or more';
    if (!f.unit.trim()) e.unit = 'Unit is required';
    return e;
  }

  async function submit(ev?: FormEvent) {
    ev?.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    const body = { category: f.category, name: f.name.trim(), code: f.code.trim(), color: f.color.trim(), unit: f.unit, qty, rate };
    try {
      const res = item
        ? await api.put<{ item: QuoteItem; summary: QuoteSummary }>(`/api/quote-items/${item.id}`, body)
        : await api.post<{ item: QuoteItem; summary: QuoteSummary }>(`/api/quotes/${quoteId}/items`, body);
      await onSaved(res.summary);
      toast.success(item ? `${res.item.name} updated` : `${res.item.name} added to the quote`);
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
      title={item ? `Edit entry · ${item.name}` : `Add ${ITEM_CATEGORY_LABEL[categories[0]].toLowerCase()} entry`}
      closeOnBackdrop={false}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="quote-item-form" loading={saving} data-tour="rate-entry-save">
            {item ? 'Save' : 'Add entry'}
          </Button>
        </>
      }
    >
      <form id="quote-item-form" className="col gap-12" onSubmit={(e) => void submit(e)} noValidate>
        <div className="adm-form-grid">
          {categories.length > 1 && (
            <Field label="Type" required htmlFor="qi-cat" className="adm-span-2">
              <Select
                id="qi-cat"
                value={f.category}
                onChange={(e) => {
                  const c = e.target.value as QuoteItemCategory;
                  setF((p) => ({ ...p, category: c, unit: p.unit === DEFAULT_UNIT[p.category] ? DEFAULT_UNIT[c] : p.unit }));
                }}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {ITEM_CATEGORY_LABEL[c]}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Item name" required error={errors.name} className="adm-span-2" htmlFor="qi-name">
            <Input id="qi-name" value={f.name} maxLength={200} autoFocus invalid={!!errors.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Extra mullion profile" />
          </Field>
          <Field label="RM code" hint="Optional" htmlFor="qi-code">
            <Input id="qi-code" value={f.code} maxLength={60} onChange={(e) => set('code', e.target.value)} placeholder="e.g. PS62-UM-04" style={{ textTransform: 'uppercase' }} />
          </Field>
          <Field label="Colour / description" hint="Optional" htmlFor="qi-color">
            <Input id="qi-color" value={f.color} maxLength={80} onChange={(e) => set('color', e.target.value)} placeholder="e.g. WHITE" />
          </Field>
          <Field label="Unit" required error={errors.unit} htmlFor="qi-unit">
            <Select id="qi-unit" value={f.unit} onChange={(e) => set('unit', e.target.value)}>
              {units.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Quantity" required error={errors.qty} htmlFor="qi-qty">
            <Input id="qi-qty" type="number" min={0} step="any" inputMode="decimal" value={f.qty} invalid={!!errors.qty} onChange={(e) => set('qty', e.target.value)} />
          </Field>
          <Field label={`Rate (₹ per ${f.unit})`} required error={errors.rate} htmlFor="qi-rate">
            <div className="input-rupee">
              <Input id="qi-rate" type="number" min={0} step="0.01" inputMode="decimal" value={f.rate} invalid={!!errors.rate} onChange={(e) => set('rate', e.target.value)} placeholder="0.00" />
            </div>
          </Field>
          <Field label="Amount">
            <div className="qi-amount">{inr(amount)}</div>
          </Field>
        </div>
        <div className="muted fs-12">
          Counted in <b>{ITEM_COST_HEAD[f.category]}</b>, so wastage, profit and GST apply as for the designs' own materials. The amount is shared across the quote's designs by area.
        </div>
      </form>
    </Modal>
  );
}
