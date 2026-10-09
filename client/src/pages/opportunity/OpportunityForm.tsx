import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Check, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { Opportunity, Personnel } from '../../lib/types';
import { useMasters } from '../../context/MastersContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/feedback';
import { Button, Field, IconButton, Input, PageLoading, Select, Textarea } from '../../components/ui';
import { Modal } from '../../components/overlay';
import { Combobox } from '../../components/Combobox';
import { SiteMap } from './SiteMap';

interface FormState {
  projectName: string;
  salutation: string;
  firstName: string;
  lastName: string;
  phoneCode: string;
  phone: string;
  email: string;
  note: string;
  address1: string;
  address2: string;
  pincode: string;
  city: string;
  state: string;
  country: string;
  siteLocation: string;
  lat: number | null;
  lng: number | null;
  billTo: string;
  marketingPartner: string;
  managedBy: string;
  stage: string;
  source: string;
  estValue: string;
  category: string;
  closureDate: string;
  supplyStart: string;
  supplyEnd: string;
  personnel: Personnel[];
  account: string;
  tags: string[];
}

const EMPTY: FormState = {
  projectName: '',
  salutation: 'Mr.',
  firstName: '',
  lastName: '',
  phoneCode: '+91',
  phone: '',
  email: '',
  note: '',
  address1: '',
  address2: '',
  pincode: '',
  city: '',
  state: '',
  country: '',
  siteLocation: '',
  lat: null,
  lng: null,
  billTo: '',
  marketingPartner: '',
  managedBy: '',
  stage: 'Enquiry',
  source: '',
  estValue: '',
  category: '',
  closureDate: '',
  supplyStart: '',
  supplyEnd: '',
  personnel: [],
  account: '',
  tags: [],
};

const SALUTATIONS = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'M/s.'];
const PHONE_CODES = ['+91', '+971', '+974', '+965', '+968', '+966', '+65', '+44', '+1'];
const STATES = ['TAMILNADU', 'PUDUCHERRY', 'KARNATAKA', 'KERALA', 'ANDHRA PRADESH', 'TELANGANA', 'MAHARASHTRA', 'DELHI', 'GUJARAT'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Errors = Partial<Record<keyof FormState, string>>;

function validateStep1(f: FormState): Errors {
  const e: Errors = {};
  if (!f.projectName.trim()) e.projectName = 'Project name is required';
  if (!f.firstName.trim()) e.firstName = 'First name is required';
  if (!f.phone.trim()) e.phone = 'Phone number is required';
  else if (!/^[0-9]{6,15}$/.test(f.phone.replace(/\s+/g, ''))) e.phone = 'Enter 6 to 15 digits';
  if (f.email.trim() && !EMAIL_RE.test(f.email.trim())) e.email = 'Enter a valid email address';
  if (!f.city) e.city = 'City is required';
  if (!f.state) e.state = 'State is required';
  if (f.pincode && !/^[0-9]{6}$/.test(f.pincode)) e.pincode = 'Pin code must be 6 digits';
  return e;
}

function validateStep2(f: FormState): Errors {
  const e: Errors = {};
  if (!f.managedBy) e.managedBy = 'Managed by is required';
  if (!f.stage) e.stage = 'Opportunity stage is required';
  if (!f.source) e.source = 'Opportunity source is required';
  if (f.estValue && !(Number(f.estValue) >= 0)) e.estValue = 'Enter a valid amount';
  if (f.supplyStart && f.supplyEnd && f.supplyEnd < f.supplyStart) e.supplyEnd = 'End date cannot be before the start date';
  return e;
}

export default function OpportunityFormPage() {
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const { masters, refresh } = useMasters();
  const { user } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState<FormState>({ ...EMPTY, managedBy: user?.name || '' });
  const [step, setStep] = useState<1 | 2>(1);
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [quoteId, setQuoteId] = useState<number | null>(null);
  const [cityDialog, setCityDialog] = useState<{ name: string; state: string; country: string } | null>(null);
  const [cityError, setCityError] = useState<string | null>(null);
  const [extraOptions, setExtraOptions] = useState<{ billTo: string[]; partner: string[] }>({ billTo: [], partner: [] });

  useEffect(() => {
    if (!editing) return;
    api
      .get<Opportunity>(`/api/opportunities/${id}`)
      .then((o) => {
        setForm({
          projectName: o.projectName,
          salutation: o.salutation,
          firstName: o.firstName,
          lastName: o.lastName,
          phoneCode: o.phoneCode,
          phone: o.phone,
          email: o.email,
          note: o.note,
          address1: o.address1,
          address2: o.address2,
          pincode: o.pincode,
          city: o.city,
          state: o.state,
          country: o.country,
          siteLocation: o.siteLocation,
          lat: o.lat,
          lng: o.lng,
          billTo: o.billTo,
          marketingPartner: o.marketingPartner,
          managedBy: o.managedBy,
          stage: o.stage,
          source: o.source,
          estValue: o.estValue != null ? String(o.estValue) : '',
          category: o.category,
          closureDate: o.closureDate,
          supplyStart: o.supplyStart,
          supplyEnd: o.supplyEnd,
          personnel: o.personnel,
          account: o.account,
          tags: o.tags,
        });
        setQuoteId(o.quoteId);
        setExtraOptions({ billTo: o.billTo ? [o.billTo] : [], partner: o.marketingPartner ? [o.marketingPartner] : [] });
      })
      .catch((e) => toast.error(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [editing, id, toast]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const cityOptions = useMemo(() => masters.cities.map((c) => ({ value: c.name, label: c.name })), [masters.cities]);
  const contactName = [form.salutation, form.firstName, form.lastName].filter(Boolean).join(' ').trim();
  const billToOptions = useMemo(
    () => [...new Set([...(form.firstName ? [contactName] : []), ...extraOptions.billTo])].filter(Boolean).map((v) => ({ value: v, label: v })),
    [contactName, extraOptions.billTo, form.firstName],
  );
  const partnerOptions = useMemo(() => [...new Set(['TITANS WINDOWS', ...extraOptions.partner])].map((v) => ({ value: v, label: v })), [extraOptions.partner]);

  const selectCity = (name: string) => {
    const c = masters.cities.find((x) => x.name === name);
    setForm((f) => ({ ...f, city: name, state: c?.state || f.state, country: c?.country || f.country || 'INDIA' }));
    setErrors((e) => ({ ...e, city: undefined, state: c?.state ? undefined : e.state }));
  };

  const createCity = async () => {
    if (!cityDialog?.name.trim()) {
      setCityError('City name is required');
      return;
    }
    try {
      const c = await api.post<{ name: string; state: string; country: string }>('/api/masters/cities', cityDialog);
      await refresh();
      setForm((f) => ({ ...f, city: c.name, state: c.state, country: c.country }));
      setErrors((e) => ({ ...e, city: undefined, state: undefined }));
      setCityDialog(null);
      toast.success(`City ${c.name} created`);
    } catch (e) {
      setCityError(errorMessage(e));
    }
  };

  const next = () => {
    const e = validateStep1(form);
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error('Please fill the mandatory fields');
      return;
    }
    setStep(2);
    window.scrollTo({ top: 0 });
  };

  const save = async () => {
    const e1 = validateStep1(form);
    if (Object.keys(e1).length) {
      setErrors(e1);
      setStep(1);
      return;
    }
    const e2 = validateStep2(form);
    setErrors(e2);
    if (Object.keys(e2).length) {
      toast.error('Please fill the mandatory fields');
      return;
    }
    setSaving(true);
    const body = { ...form, phone: form.phone.replace(/\s+/g, ''), estValue: form.estValue === '' ? null : Number(form.estValue), personnel: form.personnel.filter((p) => p.name?.trim()) };
    try {
      if (editing) {
        await api.put(`/api/opportunities/${id}`, body);
        toast.success('Data saved successfully');
        navigate(quoteId ? `/quote/${quoteId}` : '/opportunity');
      } else {
        const r = await api.post<{ opportunity: Opportunity; quoteId: number }>('/api/opportunities', body);
        toast.success('Data saved successfully');
        navigate(`/quote/${r.quoteId}?tab=design`);
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageLoading />;

  const stepOneErrors = Object.keys(validateStep1(form)).length;
  return (
    <div className="page">
      <div className="form-page">
        <div className="breadcrumb">
          <Link to="/opportunity">Opportunity</Link> / <span>{editing ? 'Edit opportunity' : 'Create opportunity'}</span>
        </div>
        <div className="page-head">
          <div className="page-title">{editing ? `Edit Opportunity · ${form.projectName}` : 'Create Opportunity'}</div>
        </div>
        <div className="form-card">
          <div className="form-card-steps">
            <div className="stepper" style={{ maxWidth: 620 }} data-tour="oppform-steps">
              <div className={`step ${step === 1 ? 'active' : 'done'}`} onClick={() => setStep(1)} style={{ cursor: 'pointer' }}>
                <span className="step-num">{step === 2 && !stepOneErrors ? <Check size={14} /> : 1}</span>
                <span>
                  <div className="step-title">Basic info</div>
                  <div className="step-sub">5 mandatory fields</div>
                </span>
              </div>
              <div className={`step ${step === 2 ? 'active' : ''}`} onClick={() => (step === 1 ? next() : undefined)} style={{ cursor: 'pointer' }}>
                <span className="step-num">2</span>
                <span>
                  <div className="step-title">Official info</div>
                  <div className="step-sub">3 mandatory fields</div>
                </span>
              </div>
            </div>
          </div>

          {step === 1 ? (
            <>
              <div className="form-section" data-tour="oppform-basic">
                <h3>Basic details</h3>
                <div className="form-grid">
                  <Field label="Project name" required error={errors.projectName} className="span-2">
                    <Input value={form.projectName} onChange={(e) => set('projectName', e.target.value)} invalid={!!errors.projectName} maxLength={150} autoFocus />
                  </Field>
                  <Field label="First name" required error={errors.firstName}>
                    <div className="input-group">
                      <Select value={form.salutation} onChange={(e) => set('salutation', e.target.value)} style={{ width: 86 }} aria-label="Salutation">
                        {SALUTATIONS.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </Select>
                      <Input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} invalid={!!errors.firstName} maxLength={80} />
                    </div>
                  </Field>
                  <Field label="Last name">
                    <Input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} maxLength={80} />
                  </Field>
                  <Field label="Phone number" required error={errors.phone}>
                    <div className="input-group">
                      <Select value={form.phoneCode} onChange={(e) => set('phoneCode', e.target.value)} style={{ width: 86 }} aria-label="Country code">
                        {PHONE_CODES.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </Select>
                      <Input value={form.phone} onChange={(e) => set('phone', e.target.value.replace(/[^0-9 ]/g, ''))} invalid={!!errors.phone} inputMode="numeric" maxLength={18} />
                    </div>
                  </Field>
                  <Field label="Email" error={errors.email}>
                    <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} invalid={!!errors.email} />
                  </Field>
                  <Field label="Note" className="span-2">
                    <Textarea value={form.note} onChange={(e) => set('note', e.target.value)} rows={3} maxLength={2000} />
                  </Field>
                </div>
              </div>
              <div className="form-section" data-tour="oppform-address">
                <h3>Site address</h3>
                <div className="form-grid">
                  <Field label="Address 1">
                    <Input value={form.address1} onChange={(e) => set('address1', e.target.value)} />
                  </Field>
                  <Field label="Address 2">
                    <Input value={form.address2} onChange={(e) => set('address2', e.target.value)} />
                  </Field>
                  <Field label="Pin code" error={errors.pincode}>
                    <Input value={form.pincode} onChange={(e) => set('pincode', e.target.value.replace(/[^0-9]/g, ''))} maxLength={6} inputMode="numeric" invalid={!!errors.pincode} />
                  </Field>
                  <Field label="City" required error={errors.city}>
                    <Combobox
                      options={cityOptions}
                      value={form.city}
                      onChange={selectCity}
                      invalid={!!errors.city}
                      placeholder="Select city"
                      createLabel="Create City"
                      onCreate={(q) => {
                        setCityError(null);
                        setCityDialog({ name: q.toUpperCase(), state: form.state || 'TAMILNADU', country: form.country || 'INDIA' });
                      }}
                    />
                  </Field>
                  <Field label="State" required error={errors.state}>
                    <Combobox
                      options={[...new Set([...STATES, ...masters.cities.map((c) => c.state)])].map((s) => ({ value: s, label: s }))}
                      value={form.state}
                      onChange={(v) => set('state', v)}
                      invalid={!!errors.state}
                      placeholder="Select state"
                    />
                  </Field>
                  <Field label="Country">
                    <Select value={form.country} onChange={(e) => set('country', e.target.value)} placeholder="Select country">
                      {['INDIA', 'UAE', 'QATAR', 'OMAN', 'SRI LANKA'].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </div>
              <div className="form-section" data-tour="oppform-map">
                <h3>Site location</h3>
                <Field label="Enter site location">
                  <SiteMap lat={form.lat} lng={form.lng} label={form.siteLocation} onChange={(v) => setForm((f) => ({ ...f, lat: v.lat, lng: v.lng, siteLocation: v.label }))} />
                </Field>
              </div>
              <div className="form-actions">
                <div className="grow" />
                <Button variant="ghost" onClick={() => navigate(-1)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={next} data-tour="oppform-next">
                  Next
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="form-section">
                <h3>Official info</h3>
                <div className="form-grid form-grid-3">
                  <Field label="Bill to">
                    <Combobox
                      options={billToOptions}
                      value={form.billTo}
                      onChange={(v) => set('billTo', v)}
                      placeholder="Select"
                      clearable
                      createLabel="Add bill to"
                      onCreate={(q) => {
                        if (!q) return;
                        setExtraOptions((o) => ({ ...o, billTo: [...o.billTo, q] }));
                        set('billTo', q);
                      }}
                    />
                  </Field>
                  <Field label="Marketing Partner">
                    <Combobox
                      options={partnerOptions}
                      value={form.marketingPartner}
                      onChange={(v) => set('marketingPartner', v)}
                      placeholder="Select"
                      clearable
                      createLabel="Add partner"
                      onCreate={(q) => {
                        if (!q) return;
                        setExtraOptions((o) => ({ ...o, partner: [...o.partner, q] }));
                        set('marketingPartner', q);
                      }}
                    />
                  </Field>
                  <Field label="Managed By" required error={errors.managedBy}>
                    <Combobox options={masters.users.map((u) => ({ value: u.name, label: u.name, hint: u.team || undefined }))} value={form.managedBy} onChange={(v) => set('managedBy', v)} invalid={!!errors.managedBy} />
                  </Field>
                  <Field label="Opportunity stage" required error={errors.stage}>
                    <Combobox searchable={false} options={masters.stages.map((s) => ({ value: s, label: s }))} value={form.stage} onChange={(v) => set('stage', v)} invalid={!!errors.stage} />
                  </Field>
                  <Field label="Opportunity source" required error={errors.source}>
                    <Combobox options={masters.sources.map((s) => ({ value: s, label: s }))} value={form.source} onChange={(v) => set('source', v)} invalid={!!errors.source} placeholder="Select" />
                  </Field>
                  <Field label="Estimated opportunity value" error={errors.estValue}>
                    <div className="input-rupee">
                      <Input type="number" min={0} step="0.01" value={form.estValue} onChange={(e) => set('estValue', e.target.value)} invalid={!!errors.estValue} />
                    </div>
                  </Field>
                  <Field label="Opportunity Category">
                    <Select value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="Select">
                      {masters.categories.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Expected closure date">
                    <Input type="date" value={form.closureDate} onChange={(e) => set('closureDate', e.target.value)} />
                  </Field>
                  <Field label="Expected supply start date">
                    <Input type="date" value={form.supplyStart} onChange={(e) => set('supplyStart', e.target.value)} />
                  </Field>
                  <Field label="Expected supply end date" error={errors.supplyEnd}>
                    <Input type="date" value={form.supplyEnd} min={form.supplyStart || undefined} onChange={(e) => set('supplyEnd', e.target.value)} invalid={!!errors.supplyEnd} />
                  </Field>
                  <Field label="Account" hint="Customer company / builder this opportunity belongs to">
                    <Combobox
                      options={[...new Set([...(form.account ? [form.account] : []), ...extraOptions.billTo])].map((v) => ({ value: v, label: v }))}
                      value={form.account}
                      onChange={(v) => set('account', v)}
                      placeholder="Select or create"
                      clearable
                      createLabel="Create account"
                      onCreate={(q) => {
                        if (!q) return;
                        setExtraOptions((o) => ({ ...o, billTo: [...o.billTo, q] }));
                        set('account', q);
                      }}
                    />
                  </Field>
                  <Field label="Tags">
                    <Combobox multiple options={masters.tags.map((t) => ({ value: t, label: t }))} value={form.tags} onChange={(v) => set('tags', v)} placeholder="Add tags" />
                  </Field>
                </div>
              </div>
              <div className="form-section">
                <h3>Opportunity personnel</h3>
                {form.personnel.map((p, i) => (
                  <div key={i} className="personnel-row">
                    <Field label={i === 0 ? 'Name' : undefined}>
                      <Input value={p.name} onChange={(e) => set('personnel', form.personnel.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Name" />
                    </Field>
                    <Field label={i === 0 ? 'Role' : undefined}>
                      <Select value={p.role || ''} onChange={(e) => set('personnel', form.personnel.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))} placeholder="Select role">
                        {['Architect', 'Site Engineer', 'Contractor', 'Interior Designer', 'Owner', 'Consultant'].map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={i === 0 ? 'Phone' : undefined}>
                      <Input value={p.phone || ''} onChange={(e) => set('personnel', form.personnel.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} placeholder="Phone" />
                    </Field>
                    <IconButton tip="Remove" onClick={() => set('personnel', form.personnel.filter((_, j) => j !== i))}>
                      <Trash2 size={15} />
                    </IconButton>
                  </div>
                ))}
                <Button size="sm" icon={<Plus size={13} />} onClick={() => set('personnel', [...form.personnel, { name: '', role: '', phone: '' }])}>
                  Add personnel
                </Button>
              </div>
              <div className="form-actions">
                <Button variant="primary" onClick={() => setStep(1)}>
                  Back
                </Button>
                <div className="grow" />
                <Button variant="ghost" onClick={() => navigate(-1)}>
                  Cancel
                </Button>
                <Button variant="primary" loading={saving} onClick={save}>
                  {editing ? 'Save changes' : 'Save and create quote'}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      <Modal
        open={!!cityDialog}
        onClose={() => setCityDialog(null)}
        title="Create City"
        size="sm"
        footer={
          <>
            <Button onClick={() => setCityDialog(null)}>Cancel</Button>
            <Button variant="primary" onClick={createCity}>
              Create
            </Button>
          </>
        }
      >
        {cityDialog && (
          <div className="col gap-12">
            {cityError && <div className="alert alert-error">{cityError}</div>}
            <Field label="City name" required>
              <Input value={cityDialog.name} onChange={(e) => setCityDialog({ ...cityDialog, name: e.target.value.toUpperCase() })} autoFocus />
            </Field>
            <Field label="State" required>
              <Select value={cityDialog.state} onChange={(e) => setCityDialog({ ...cityDialog, state: e.target.value })}>
                {[...new Set([...STATES, ...masters.cities.map((c) => c.state)])].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </Field>
            <Field label="Country">
              <Input value={cityDialog.country} onChange={(e) => setCityDialog({ ...cityDialog, country: e.target.value.toUpperCase() })} />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
