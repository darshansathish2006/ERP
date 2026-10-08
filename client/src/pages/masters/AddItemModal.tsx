import { useMemo, useState, type FormEvent } from 'react';
import { api, errorMessage } from '../../lib/api';
import type { ItemDef } from '../../lib/types';
import { Button, Field, Input, Select } from '../../components/ui';
import { Modal } from '../../components/overlay';
import { useToast } from '../../components/feedback';
import { useMasters } from '../../context/MastersContext';
import { CODE_RE, UNITS, isValidRate, parseNum } from './shared';

type ItemCategory = ItemDef['category'];

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  profile: 'uPVC Profile',
  aluminium: 'Aluminium',
  reinforcement: 'Reinforcement',
  hardware: 'Hardware',
};

const DEFAULT_BAR: Record<ItemCategory, string> = { profile: '5.8', aluminium: '3', reinforcement: '6', hardware: '' };

const hasBar = (c: ItemCategory) => c !== 'hardware';
const defaultUnit = (c: ItemCategory) => (c === 'hardware' ? 'Pcs' : 'Meter');

interface Form {
  code: string;
  name: string;
  category: ItemCategory;
  grp: string;
  unit: string;
  rate: string;
  rate_lam: string;
  bar_length: string;
}

type Errors = Partial<Record<keyof Form, string>>;

export function AddItemModal({ category, onClose }: { category: ItemCategory; onClose: () => void }) {
  const { masters, refresh } = useMasters();
  const toast = useToast();
  const hardwareGroups = useMemo(() => {
    const set = new Set(masters.items.filter((i) => i.category === 'hardware').map((i) => i.grp));
    if (!set.size) set.add('Fabrication Hardware');
    return [...set];
  }, [masters.items]);
  const [f, setF] = useState<Form>({
    code: '',
    name: '',
    category,
    grp: hardwareGroups[0],
    unit: defaultUnit(category),
    rate: '',
    rate_lam: '',
    bar_length: DEFAULT_BAR[category],
  });
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setF((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const changeCategory = (c: ItemCategory) => {
    setF((prev) => ({ ...prev, category: c, unit: defaultUnit(c), bar_length: DEFAULT_BAR[c], rate_lam: c === 'profile' ? prev.rate_lam : '' }));
    setErrors({});
  };

  function validate(): Errors {
    const e: Errors = {};
    const code = f.code.trim();
    if (!code) e.code = 'RM code is required';
    else if (!CODE_RE.test(code)) e.code = 'Use letters, numbers, dot, dash or underscore only';
    else if (masters.items.some((i) => i.code.toUpperCase() === code.toUpperCase())) e.code = 'An item with this code already exists';
    if (!f.name.trim()) e.name = 'Item name is required';
    if (!isValidRate(f.rate)) e.rate = 'Enter a rate of 0 or more';
    if (f.category === 'profile' && f.rate_lam.trim() && !isValidRate(f.rate_lam)) e.rate_lam = 'Enter a rate of 0 or more';
    if (hasBar(f.category)) {
      const bar = parseNum(f.bar_length);
      if (bar === null || bar <= 0 || bar > 12) e.bar_length = 'Enter a bar length between 0 and 12 m';
    }
    return e;
  }

  async function submit(ev?: FormEvent) {
    ev?.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const created = await api.post<ItemDef>('/api/masters/items', {
        code: f.code.trim().toUpperCase(),
        name: f.name.trim(),
        category: f.category,
        grp: f.category === 'hardware' ? f.grp : undefined,
        unit: f.unit,
        rate: parseNum(f.rate),
        rate_lam: f.category === 'profile' && f.rate_lam.trim() ? parseNum(f.rate_lam) : undefined,
        bar_length: hasBar(f.category) ? parseNum(f.bar_length) : undefined,
      });
      await refresh();
      toast.success(`Item ${created.code} added to ${CATEGORY_LABELS[f.category]}`);
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
      title="Add item"
      closeOnBackdrop={false}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="adm-add-item" loading={saving}>
            Add item
          </Button>
        </>
      }
    >
      <form id="adm-add-item" className="adm-form-grid" onSubmit={(e) => void submit(e)} noValidate>
        <Field label="RM code" required error={errors.code} htmlFor="ai-code">
          <Input id="ai-code" value={f.code} onChange={(e) => set('code', e.target.value)} invalid={!!errors.code} autoFocus maxLength={60} style={{ textTransform: 'uppercase' }} placeholder="e.g. PS62-UF-01" />
        </Field>
        <Field label="Category" required htmlFor="ai-cat">
          <Select id="ai-cat" value={f.category} onChange={(e) => changeCategory(e.target.value as ItemCategory)}>
            {(Object.keys(CATEGORY_LABELS) as ItemCategory[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Item name" required error={errors.name} className="adm-span-2" htmlFor="ai-name">
          <Input id="ai-name" value={f.name} onChange={(e) => set('name', e.target.value)} invalid={!!errors.name} maxLength={200} placeholder="e.g. 62MM 2 TRACK SLIDING FRAME" />
        </Field>
        {f.category === 'hardware' && (
          <Field label="Group" htmlFor="ai-grp" hint="Used to group lines in the cost breakup reports">
            <Select id="ai-grp" value={f.grp} onChange={(e) => set('grp', e.target.value)}>
              {hardwareGroups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Unit" required htmlFor="ai-unit">
          <Select id="ai-unit" value={f.unit} onChange={(e) => set('unit', e.target.value)}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={`Rate (₹ per ${f.unit})`} required error={errors.rate} htmlFor="ai-rate">
          <div className="input-rupee">
            <Input id="ai-rate" type="number" min={0} step="0.01" inputMode="decimal" value={f.rate} onChange={(e) => set('rate', e.target.value)} invalid={!!errors.rate} placeholder="0.00" />
          </div>
        </Field>
        {f.category === 'profile' && (
          <Field label="Laminated rate (₹)" error={errors.rate_lam} hint="Leave blank to use the standard rate" htmlFor="ai-lam">
            <div className="input-rupee">
              <Input id="ai-lam" type="number" min={0} step="0.01" inputMode="decimal" value={f.rate_lam} onChange={(e) => set('rate_lam', e.target.value)} invalid={!!errors.rate_lam} placeholder="0.00" />
            </div>
          </Field>
        )}
        {hasBar(f.category) && (
          <Field label="Bar length (m)" required error={errors.bar_length} hint="Stock length used for bar optimisation" htmlFor="ai-bar">
            <Input id="ai-bar" type="number" min={0} step="0.1" inputMode="decimal" value={f.bar_length} onChange={(e) => set('bar_length', e.target.value)} invalid={!!errors.bar_length} />
          </Field>
        )}
      </form>
    </Modal>
  );
}
