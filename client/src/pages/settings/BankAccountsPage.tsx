import { useMemo, useState, type FormEvent } from 'react';
import { Landmark, RotateCcw, Save } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { Company } from '../../lib/types';
import { Button, Field, Input } from '../../components/ui';
import { useToast } from '../../components/feedback';
import { useMasters } from '../../context/MastersContext';
import { ReadOnlyNote, SubPage, UnsavedNote, useDirty, usePerms } from './common';

type Bank = Company['bank'];
type Key = keyof Bank;

const EMPTY: Bank = { accountName: '', accountNo: '', bankName: '', ifsc: '', branch: '' };

const FIELDS: { key: Key; label: string; required?: boolean; placeholder?: string; upper?: boolean; max: number }[] = [
  { key: 'accountName', label: 'Account name', required: true, placeholder: 'e.g. TITANS WINDOWS', max: 120 },
  { key: 'accountNo', label: 'Account number', required: true, placeholder: 'e.g. 55522266674', max: 30 },
  { key: 'bankName', label: 'Bank name', required: true, placeholder: 'e.g. IDFC FIRST', max: 120 },
  { key: 'ifsc', label: 'IFSC', required: true, placeholder: 'e.g. IDFB0081831', upper: true, max: 11 },
  { key: 'branch', label: 'Branch', placeholder: 'e.g. IYYAPPANTHANGAL', max: 120 },
];

function validate(b: Bank): Partial<Record<Key, string>> {
  const e: Partial<Record<Key, string>> = {};
  if (!b.accountName.trim()) e.accountName = 'Account name is required';
  if (!b.accountNo.trim()) e.accountNo = 'Account number is required';
  else if (!/^[0-9A-Za-z]{6,20}$/.test(b.accountNo.trim())) e.accountNo = 'Use 6–20 letters or digits without spaces';
  if (!b.bankName.trim()) e.bankName = 'Bank name is required';
  if (!b.ifsc.trim()) e.ifsc = 'IFSC is required';
  else if (!/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(b.ifsc.trim())) e.ifsc = 'IFSC is 11 characters, e.g. IDFB0081831';
  return e;
}

export function BankAccountsPage() {
  const { masters, refresh } = useMasters();
  const toast = useToast();
  const canEdit = usePerms().settings;
  const base = useMemo<Bank>(() => ({ ...EMPTY, ...(masters.company.bank || {}) }), [masters.company.bank]);
  const [form, setForm] = useState<Bank>(base);
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({});
  const [saving, setSaving] = useState(false);
  const changedCount = (Object.keys(EMPTY) as Key[]).filter((k) => form[k] !== base[k]).length;
  useDirty(changedCount > 0);

  async function submit(ev?: FormEvent) {
    ev?.preventDefault();
    const e = validate(form);
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error('Please correct the highlighted fields.');
      return;
    }
    setSaving(true);
    try {
      const bank: Bank = {
        accountName: form.accountName.trim(),
        accountNo: form.accountNo.trim(),
        bankName: form.bankName.trim(),
        ifsc: form.ifsc.trim().toUpperCase(),
        branch: form.branch.trim(),
      };
      const saved = await api.put<Company>('/api/settings/company', { ...masters.company, bank });
      await refresh();
      setForm({ ...EMPTY, ...saved.bank });
      toast.success('Bank account saved');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SubPage
      footer={
        canEdit && (
          <>
            <UnsavedNote count={changedCount} />
            <Button
              variant="ghost"
              icon={<RotateCcw size={14} />}
              disabled={!changedCount || saving}
              onClick={() => {
                setForm(base);
                setErrors({});
              }}
            >
              Reset
            </Button>
            <Button variant="primary" icon={<Save size={14} />} onClick={() => void submit()} loading={saving} disabled={!changedCount}>
              Save
            </Button>
          </>
        )
      }
    >
      {!canEdit && <ReadOnlyNote />}
      <div className="adm-bank">
        <form className="card card-pad" onSubmit={(e) => void submit(e)} noValidate>
          <div className="adm-section-title">Primary account</div>
          <fieldset className="adm-fieldset adm-form-grid" disabled={!canEdit || saving}>
            {FIELDS.map((f) => (
              <Field key={f.key} label={f.label} required={f.required} error={errors[f.key]} htmlFor={`bk-${f.key}`} className={f.key === 'accountName' ? 'adm-span-2' : undefined}>
                <Input
                  id={`bk-${f.key}`}
                  value={form[f.key]}
                  maxLength={f.max}
                  placeholder={f.placeholder}
                  invalid={!!errors[f.key]}
                  style={f.upper ? { textTransform: 'uppercase' } : undefined}
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm((p) => ({ ...p, [f.key]: v }));
                    if (errors[f.key]) setErrors((p) => ({ ...p, [f.key]: undefined }));
                  }}
                />
              </Field>
            ))}
          </fieldset>
          <button type="submit" hidden />
        </form>
        <div className="card card-pad adm-bank-preview">
          <div className="row mb-12">
            <Landmark size={18} className="text-primary" />
            <div className="fw-600">As printed on the quotation</div>
          </div>
          <table className="table table-compact">
            <tbody>
              <tr>
                <td className="muted">Account Name</td>
                <td className="adm-cell-main">{form.accountName || '—'}</td>
              </tr>
              <tr>
                <td className="muted">Account No</td>
                <td className="adm-cell-main">{form.accountNo || '—'}</td>
              </tr>
              <tr>
                <td className="muted">Bank</td>
                <td className="adm-cell-main">{form.bankName || '—'}</td>
              </tr>
              <tr>
                <td className="muted">IFSC</td>
                <td className="adm-cell-main">{form.ifsc.toUpperCase() || '—'}</td>
              </tr>
              <tr>
                <td className="muted">Branch</td>
                <td className="adm-cell-main">{form.branch || '—'}</td>
              </tr>
            </tbody>
          </table>
          <div className="adm-cell-sub mt-12">The bank block position within the terms is set in Other → Quotation terms.</div>
        </div>
      </div>
    </SubPage>
  );
}
