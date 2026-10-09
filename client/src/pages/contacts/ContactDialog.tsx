import { useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage } from '../../lib/api';
import type { ContactRow } from '../../lib/types';
import { useMasters } from '../../context/MastersContext';
import { useToast } from '../../components/feedback';
import { Button, Checkbox, Field, Input, Select, Textarea } from '../../components/ui';
import { Modal } from '../../components/overlay';

const SALUTATIONS = ['Mr.', 'Ms.', 'Mrs.', 'Dr.', 'M/s.'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Form {
  salutation: string;
  firstName: string;
  lastName: string;
  phoneCode: string;
  phone: string;
  email: string;
  company: string;
  designation: string;
  city: string;
  state: string;
  address: string;
  note: string;
}
type Errors = Partial<Record<keyof Form, string>>;

function formOf(c: ContactRow | null): Form {
  return {
    salutation: c?.salutation || 'Mr.',
    firstName: c?.firstName || '',
    lastName: c?.lastName || '',
    phoneCode: c?.phoneCode || '+91',
    phone: c?.phone || '',
    email: c?.email || '',
    company: c?.company || '',
    designation: c?.designation || '',
    city: c?.city || '',
    state: c?.state || '',
    address: c?.address || '',
    note: c?.note || '',
  };
}

/**
 * Add a contact, edit a standalone contact, or edit a contact that lives on opportunities
 * (which updates the contact details on those opportunities).
 */
export function ContactDialog({ contact, onClose, onSaved }: { contact: ContactRow | null; onClose: () => void; onSaved: () => Promise<void> | void }) {
  const { masters } = useMasters();
  const toast = useToast();
  const fromOpp = contact?.source === 'opportunity';
  const [f, setF] = useState<Form>(() => formOf(contact));
  const [errors, setErrors] = useState<Errors>({});
  const [syncOpps, setSyncOpps] = useState(true);
  const [saving, setSaving] = useState(false);
  const [designations, setDesignations] = useState<string[]>([]);

  useEffect(() => {
    if (fromOpp) return;
    let alive = true;
    api
      .get<Record<string, { value: string }[]>>('/api/lookups')
      .then((r) => alive && setDesignations((r.contact_designation || []).map((x) => x.value)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [fromOpp]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((p) => ({ ...p, [k]: undefined }));
  };

  function validate(): Errors {
    const e: Errors = {};
    if (!f.firstName.trim()) e.firstName = 'First name is required';
    const phone = f.phone.replace(/[\s-]+/g, '');
    if (!phone) e.phone = 'Phone number is required';
    else if (!/^[0-9]{6,15}$/.test(phone)) e.phone = 'Enter 6 to 15 digits';
    if (!/^\+?[0-9]{1,4}$/.test(f.phoneCode.trim())) e.phoneCode = 'Invalid code';
    if (f.email.trim() && !EMAIL_RE.test(f.email.trim())) e.email = 'Email address is not valid';
    return e;
  }

  async function submit(ev?: FormEvent) {
    ev?.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    const body: Record<string, string> = {
      ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim()])),
      phone: f.phone.replace(/[\s-]+/g, ''),
    };
    try {
      if (fromOpp && contact) {
        const r = await api.put<{ updatedOpportunities: number }>('/api/contacts/opportunity-contact', { ...body, opportunityIds: contact.opportunityIds });
        toast.success(`Contact updated on ${r.updatedOpportunities} opportunit${r.updatedOpportunities === 1 ? 'y' : 'ies'}`);
      } else if (contact?.id) {
        const r = await api.put<{ updatedOpportunities?: number }>(`/api/contacts/${contact.id}`, { ...body, updateOpportunities: syncOpps });
        toast.success(r.updatedOpportunities ? `Contact updated (and ${r.updatedOpportunities} linked opportunit${r.updatedOpportunities === 1 ? 'y' : 'ies'})` : 'Contact updated');
      } else {
        await api.post('/api/contacts', body);
        toast.success(`${body.firstName} added to contacts`);
      }
      await onSaved();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
      setSaving(false);
    }
  }

  const linked = contact?.opportunities || 0;
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      closeOnBackdrop={false}
      title={!contact ? 'Add contact' : `Edit contact · ${contact.name}`}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="contact-form" loading={saving} data-tour="contacts-save">
            {contact ? 'Save' : 'Add contact'}
          </Button>
        </>
      }
    >
      <form id="contact-form" className="col gap-12" onSubmit={(e) => void submit(e)} noValidate>
        {fromOpp && (
          <div className="alert alert-info">
            This contact comes from {linked} opportunit{linked === 1 ? 'y' : 'ies'}. Saving updates the customer details on {linked === 1 ? 'it' : 'all of them'}.
          </div>
        )}
        <div className="contact-grid">
          <Field label="Salutation" htmlFor="ct-sal">
            <Select id="ct-sal" value={f.salutation} onChange={(e) => set('salutation', e.target.value)}>
              {(SALUTATIONS.includes(f.salutation) ? SALUTATIONS : [f.salutation, ...SALUTATIONS]).map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="First name" required error={errors.firstName} htmlFor="ct-first">
            <Input id="ct-first" value={f.firstName} maxLength={80} autoFocus invalid={!!errors.firstName} onChange={(e) => set('firstName', e.target.value)} />
          </Field>
          <Field label="Last name" htmlFor="ct-last">
            <Input id="ct-last" value={f.lastName} maxLength={80} onChange={(e) => set('lastName', e.target.value)} />
          </Field>
          <Field label="Code" error={errors.phoneCode} htmlFor="ct-code">
            <Input id="ct-code" value={f.phoneCode} maxLength={5} invalid={!!errors.phoneCode} onChange={(e) => set('phoneCode', e.target.value)} />
          </Field>
          <Field label="Phone number" required error={errors.phone} htmlFor="ct-phone">
            <Input id="ct-phone" value={f.phone} maxLength={20} inputMode="tel" invalid={!!errors.phone} onChange={(e) => set('phone', e.target.value)} placeholder="e.g. 9876543210" />
          </Field>
          <Field label="Email" error={errors.email} htmlFor="ct-email">
            <Input id="ct-email" type="email" value={f.email} maxLength={150} invalid={!!errors.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
          {!fromOpp && (
            <>
              <Field label="Company / account" htmlFor="ct-company">
                <Input id="ct-company" value={f.company} maxLength={150} onChange={(e) => set('company', e.target.value)} />
              </Field>
              <Field label="Designation" htmlFor="ct-desig">
                <Input id="ct-desig" value={f.designation} list="ct-designations" maxLength={80} onChange={(e) => set('designation', e.target.value)} />
                <datalist id="ct-designations">
                  {designations.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </Field>
              <Field label="City" htmlFor="ct-city">
                <Input
                  id="ct-city"
                  value={f.city}
                  list="ct-cities"
                  maxLength={80}
                  onChange={(e) => {
                    const v = e.target.value;
                    const c = masters.cities.find((x) => x.name.toLowerCase() === v.trim().toLowerCase());
                    setF((p) => ({ ...p, city: v, state: c ? c.state : p.state }));
                  }}
                />
                <datalist id="ct-cities">
                  {masters.cities.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </Field>
              <Field label="State" htmlFor="ct-state">
                <Input id="ct-state" value={f.state} maxLength={80} onChange={(e) => set('state', e.target.value)} />
              </Field>
              <Field label="Address" className="contact-span-2" htmlFor="ct-addr">
                <Input id="ct-addr" value={f.address} maxLength={300} onChange={(e) => set('address', e.target.value)} />
              </Field>
              <Field label="Note" className="contact-span-3" htmlFor="ct-note">
                <Textarea id="ct-note" value={f.note} rows={2} maxLength={2000} onChange={(e) => set('note', e.target.value)} />
              </Field>
            </>
          )}
        </div>
        {!fromOpp && contact && linked > 0 && (
          <Checkbox checked={syncOpps} onChange={setSyncOpps} label={`Also update the customer details on ${linked} linked opportunit${linked === 1 ? 'y' : 'ies'} (matched by phone number)`} />
        )}
      </form>
    </Modal>
  );
}
