import { useState } from 'react';
import type { CostHead } from '../../../lib/types';
import { useMasters } from '../../../context/MastersContext';
import { Button, Field, Input, Select, Textarea } from '../../../components/ui';
import { Modal } from '../../../components/overlay';

const NEEDS_FORMULA = ['CustomFormula', 'Percentage'];

export function CostHeadDialog({
  head,
  isNew,
  existingNames,
  onClose,
  onSave,
}: {
  head: CostHead;
  isNew: boolean;
  existingNames: string[];
  onClose: () => void;
  onSave: (h: CostHead) => Promise<void>;
}) {
  const { masters } = useMasters();
  const [form, setForm] = useState({ ...head, rate: String(head.rate) });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const name = form.name.trim();
    if (!name) return setError('Name is required');
    if (existingNames.includes(name)) return setError('Another cost head already uses this name');
    if (!Number.isFinite(Number(form.rate))) return setError('Rate must be a number');
    if (NEEDS_FORMULA.includes(form.calcType) && !form.formula.trim()) return setError('Formula is required for this calculation type');
    setError(null);
    setSaving(true);
    try {
      await onSave({ ...form, name, rate: Number(form.rate), formula: form.formula.trim() });
    } finally {
      setSaving(false);
    }
  };

  const insertToken = (t: string) => setForm((f) => ({ ...f, formula: `${f.formula}${f.formula && !f.formula.endsWith(' ') ? ' ' : ''}${t}` }));

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Add cost head' : `Edit cost head · ${head.name}`}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={submit}>
            Save
          </Button>
        </>
      }
    >
      <div className="col gap-12">
        {error && <div className="alert alert-error">{error}</div>}
        <div className="form-grid">
          <Field label="Cost head name" required>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus />
          </Field>
          <Field label="Calculation type" required>
            <Select value={form.calcType} onChange={(e) => setForm((f) => ({ ...f, calcType: e.target.value }))}>
              {masters.calcTypes.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label={form.calcType === 'Percentage' ? 'Rate (%)' : form.calcType.startsWith('LumpSum') ? 'Lump sum amount (₹)' : form.calcType.startsWith('Area') ? 'Rate per area unit (₹)' : 'Rate / multiplier'} required>
            <Input type="number" step="any" value={form.rate} onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))} />
          </Field>
          <Field label="Visibility">
            <Select value={form.visibility} onChange={(e) => setForm((f) => ({ ...f, visibility: e.target.value as CostHead['visibility'] }))}>
              <option value="hidden">Do not show in Quote</option>
              <option value="summary">Show in Quote Summary</option>
            </Select>
          </Field>
          <Field
            label={form.calcType === 'Percentage' ? 'Base formula (percentage is applied to this)' : 'Formula'}
            required={NEEDS_FORMULA.includes(form.calcType)}
            className="span-2"
            hint="Use #VARIABLES, [Cost Head Name] references, numbers and + − × ÷ ( )"
          >
            <Textarea value={form.formula} onChange={(e) => setForm((f) => ({ ...f, formula: e.target.value }))} rows={3} className="mono" />
          </Field>
        </div>
        <div>
          <div className="field-label mb-8">Insert variable</div>
          <div className="row wrap gap-4">
            {Object.entries(masters.formulaVariables).map(([k, desc]) => (
              <button key={k} className="token-chip" title={desc} onClick={() => insertToken(`#${k}`)}>
                #{k}
              </button>
            ))}
          </div>
          <div className="field-label mb-8 mt-12">Insert cost head</div>
          <div className="row wrap gap-4">
            {existingNames.map((n) => (
              <button key={n} className="token-chip head" onClick={() => insertToken(`[${n}]`)}>
                [{n}]
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
