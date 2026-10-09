import { useMemo, useRef, useState, type FormEvent } from 'react';
import { ImagePlus, RotateCcw, Save, Trash2, Upload } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { Company } from '../../lib/types';
import { Button, Field, Input, Textarea } from '../../components/ui';
import { useToast } from '../../components/feedback';
import { useMasters } from '../../context/MastersContext';
import { fileSize } from '../../lib/format';
import { ReadOnlyNote, SubPage, UnsavedNote, useDirty, usePerms, useSettingsNav } from './common';
import { EMAIL_RE, IMAGE_TYPES, MAX_IMAGE_BYTES, readFileAsDataUrl } from './shared';

interface CompanyForm {
  name: string;
  tagline: string;
  partnerBrand: string;
  partnerTagline: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  gstin: string;
  quotePrefix: string;
  projectPrefix: string;
  quoteValidityDays: string;
  defaultFloorAperture: string;
  notes: string;
  logo: string;
  partnerLogo: string;
  headerImage: string;
}

type Key = keyof CompanyForm;
type Errors = Partial<Record<Key, string>>;

const s = (v: unknown) => (v == null ? '' : String(v));

function toForm(c: Company): CompanyForm {
  return {
    name: s(c.name),
    tagline: s(c.tagline),
    partnerBrand: s(c.partnerBrand),
    partnerTagline: s(c.partnerTagline),
    address: s(c.address),
    phone: s(c.phone),
    email: s(c.email),
    website: s(c.website),
    gstin: s(c.gstin),
    quotePrefix: s(c.quotePrefix),
    projectPrefix: s(c.projectPrefix),
    quoteValidityDays: s(c.quoteValidityDays),
    defaultFloorAperture: s(c.defaultFloorAperture),
    notes: s(c.notes),
    logo: s(c.logo),
    partnerLogo: s(c.partnerLogo),
    headerImage: s(c.headerImage),
  };
}

function validate(f: CompanyForm): Errors {
  const e: Errors = {};
  if (!f.name.trim()) e.name = 'Company name is required';
  if (f.email.trim() && !EMAIL_RE.test(f.email.trim())) e.email = 'Enter a valid email address';
  if (f.website.trim() && !/^(https?:\/\/)?[\w-]+(\.[\w-]+)+([/?#].*)?$/i.test(f.website.trim())) e.website = 'Enter a web address like www.example.com';
  const gst = f.gstin.trim();
  if (gst && !/^[0-9A-Z]{15}$/i.test(gst)) e.gstin = 'GSTIN must be exactly 15 letters and numbers';
  if (!f.quotePrefix.trim()) e.quotePrefix = 'Quote prefix is required';
  if (!f.projectPrefix.trim()) e.projectPrefix = 'Project prefix is required';
  const days = Number(f.quoteValidityDays);
  if (!f.quoteValidityDays.trim() || !Number.isInteger(days) || days < 1 || days > 365) e.quoteValidityDays = 'Enter a whole number of days (1–365)';
  const fa = Number(f.defaultFloorAperture);
  if (!f.defaultFloorAperture.trim() || !Number.isInteger(fa) || fa < 0 || fa > 5000) e.defaultFloorAperture = 'Enter a whole number between 0 and 5000 mm';
  return e;
}

export function CompanyProfilePage() {
  const { masters, refresh } = useMasters();
  const toast = useToast();
  const nav = useSettingsNav();
  const canEdit = usePerms().settings;
  const base = useMemo(() => toForm(masters.company), [masters.company]);
  const [form, setForm] = useState<CompanyForm>(base);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const changed = (Object.keys(base) as Key[]).filter((k) => base[k] !== form[k]).length;
  useDirty(changed > 0);

  const set = (key: Key, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  async function submit(ev?: FormEvent) {
    ev?.preventDefault();
    const e = validate(form);
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error('Please correct the highlighted fields.');
      return;
    }
    const t = (v: string) => v.trim();
    setSaving(true);
    try {
      const saved = await api.put<Company>('/api/settings/company', {
        ...masters.company,
        name: t(form.name),
        tagline: t(form.tagline),
        partnerBrand: t(form.partnerBrand),
        partnerTagline: t(form.partnerTagline),
        address: t(form.address),
        phone: t(form.phone),
        email: t(form.email),
        website: t(form.website),
        gstin: t(form.gstin).toUpperCase(),
        quotePrefix: t(form.quotePrefix),
        projectPrefix: t(form.projectPrefix),
        quoteValidityDays: Number(form.quoteValidityDays),
        defaultFloorAperture: Number(form.defaultFloorAperture),
        notes: t(form.notes),
        logo: form.logo,
        partnerLogo: form.partnerLogo,
        headerImage: form.headerImage,
      });
      await refresh();
      setForm(toForm(saved));
      toast.success('Company profile saved');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const text = (key: Key, label: string, opts: { required?: boolean; placeholder?: string; className?: string; hint?: string; type?: string; upper?: boolean; maxLength?: number } = {}) => (
    <Field label={label} required={opts.required} error={errors[key]} hint={opts.hint} className={opts.className} htmlFor={`co-${key}`}>
      <Input
        id={`co-${key}`}
        type={opts.type || 'text'}
        value={form[key]}
        placeholder={opts.placeholder}
        maxLength={opts.maxLength}
        invalid={!!errors[key]}
        style={opts.upper ? { textTransform: 'uppercase' } : undefined}
        onChange={(e) => set(key, e.target.value)}
      />
    </Field>
  );

  return (
    <SubPage
      footer={
        canEdit && (
          <>
            <UnsavedNote count={changed} />
            <Button
              variant="ghost"
              icon={<RotateCcw size={14} />}
              disabled={!changed || saving}
              onClick={() => {
                setForm(base);
                setErrors({});
              }}
            >
              Reset
            </Button>
            <Button variant="primary" icon={<Save size={14} />} onClick={() => void submit()} loading={saving} disabled={!changed}>
              Save
            </Button>
          </>
        )
      }
    >
      {!canEdit && <ReadOnlyNote />}
      <form className="card card-pad adm-narrow" onSubmit={(e) => void submit(e)} noValidate>
        <fieldset className="adm-fieldset" disabled={!canEdit || saving}>
          <div className="adm-form-section" data-tour="settings-company-images">
            <div className="adm-section-title">Logos & quotation header</div>
            <div className="adm-img-grid">
              <ImageField label="Company logo" hint="Printed at the top-left of the quotation." value={form.logo} onChange={(v) => set('logo', v)} />
              <ImageField label="Partner brand logo" hint="Printed at the top-right, e.g. the profile brand." value={form.partnerLogo} onChange={(v) => set('partnerLogo', v)} />
              <ImageField label="Quotation header image" hint="Optional full-width banner printed at the top of the quotation." value={form.headerImage} onChange={(v) => set('headerImage', v)} />
            </div>
          </div>
          <div className="adm-form-section">
            <div className="adm-section-title">Business details</div>
            <div className="adm-form-grid">
              {text('name', 'Company name', { required: true, maxLength: 120 })}
              {text('tagline', 'Tagline', { placeholder: 'e.g. AUTHORISED PARTNER' })}
              {text('partnerBrand', 'Partner brand', { placeholder: 'e.g. PROMINANCE' })}
              {text('partnerTagline', 'Partner tagline', { placeholder: 'e.g. uPVC WINDOW SYSTEMS' })}
              <Field label="Address" className="adm-span-2" htmlFor="co-address">
                <Textarea id="co-address" rows={3} value={form.address} onChange={(e) => set('address', e.target.value)} />
              </Field>
              {text('phone', 'Phone', { type: 'tel', maxLength: 40 })}
              {text('email', 'Email', { type: 'email', maxLength: 200 })}
              {text('website', 'Website', { maxLength: 200, placeholder: 'e.g. www.titanswindows.com' })}
              {text('gstin', 'GSTIN', { upper: true, maxLength: 15, placeholder: '15-character GST number' })}
            </div>
          </div>
          <div className="adm-form-section">
            <div className="adm-section-title">Numbering & defaults</div>
            <div className="adm-form-grid">
              {text('quotePrefix', 'Quote number prefix', { required: true, maxLength: 20, hint: 'e.g. TIT-QT- gives TIT-QT-0001' })}
              {text('projectPrefix', 'Project code prefix', { required: true, maxLength: 20, hint: 'Used for new opportunity codes' })}
              {text('quoteValidityDays', 'Quote validity (days)', { required: true, type: 'number' })}
              {text('defaultFloorAperture', 'Default floor aperture (mm)', { required: true, type: 'number', hint: 'Height from floor to window sill for new designs' })}
            </div>
          </div>
          <div className="adm-form-section">
            <div className="adm-section-title">Notes</div>
            <Field hint="Shown at the end of the quotation." htmlFor="co-notes">
              <Textarea id="co-notes" rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </Field>
          </div>
        </fieldset>
        <div className="adm-cell-sub mt-16">
          Bank details are managed in{' '}
          <button type="button" className="adm-linkbtn" onClick={() => nav.open('bank-accounts')}>
            Payment → Organization bank accounts
          </button>
          .
        </div>
        <button type="submit" hidden />
      </form>
    </SubPage>
  );
}

function ImageField({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [reading, setReading] = useState(false);
  // data:image/png;base64,… → approximate decoded size for display
  const approxBytes = value ? Math.round(((value.length - value.indexOf(',') - 1) * 3) / 4) : 0;

  async function pick(file: File | undefined) {
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      toast.error('Choose a PNG, JPG, WEBP or SVG image.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(`The image is ${fileSize(file.size)}. Choose one smaller than 2 MB.`);
      return;
    }
    setReading(true);
    try {
      onChange(await readFileAsDataUrl(file));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="adm-img">
      <div className="adm-img-label">{label}</div>
      <div className="adm-img-preview">{value ? <img src={value} alt={`${label} preview`} /> : <ImagePlus size={26} strokeWidth={1.4} className="muted" />}</div>
      <div className="adm-cell-sub">{value ? `Image set · about ${fileSize(approxBytes)}` : hint}</div>
      <div className="row">
        <Button size="sm" variant="outline" icon={<Upload size={13} />} loading={reading} onClick={() => inputRef.current?.click()}>
          {value ? 'Replace' : 'Upload'}
        </Button>
        {value && (
          <Button size="sm" variant="ghost" className="adm-icon-danger" icon={<Trash2 size={13} />} onClick={() => onChange('')}>
            Remove
          </Button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => void pick(e.target.files?.[0])} />
    </div>
  );
}
