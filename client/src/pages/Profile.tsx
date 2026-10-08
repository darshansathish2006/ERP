import { useState, type FormEvent } from 'react';
import { KeyRound, Mail, Phone, Save, ShieldCheck, Users } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import type { User } from '../lib/types';
import { initials } from '../lib/format';
import { Badge, Button, Field, Input, PageLoading, PasswordInput } from '../components/ui';
import { useToast } from '../components/feedback';
import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MastersContext';

export default function ProfilePage() {
  const { user } = useAuth();
  if (!user) return <PageLoading />;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-title">My profile</div>
          <div className="adm-sub">Update your contact details and password.</div>
        </div>
      </div>
      <div className="adm-profile">
        <div className="card adm-profile-card">
          <span className="avatar adm-profile-avatar">{initials(user.name)}</span>
          <div className="adm-profile-name">{user.name}</div>
          {user.role === 'admin' ? <Badge tone="primary">Administrator</Badge> : <Badge tone="grey">Sales</Badge>}
          <div className="adm-profile-facts">
            <div className="adm-profile-fact">
              <Mail size={15} />
              <span className="ellipsis" title={user.email}>
                {user.email}
              </span>
            </div>
            <div className="adm-profile-fact">
              <Phone size={15} />
              {user.phone || <span className="muted">No phone number</span>}
            </div>
            <div className="adm-profile-fact">
              <Users size={15} />
              {user.team || <span className="muted">No team</span>}
            </div>
            <div className="adm-profile-fact">
              <ShieldCheck size={15} />
              {user.role === 'admin' ? 'Full access to settings and users' : 'Sales access'}
            </div>
          </div>
        </div>
        <div className="col gap-16">
          <DetailsForm user={user} />
          <PasswordForm user={user} />
        </div>
      </div>
    </div>
  );
}

function DetailsForm({ user }: { user: User }) {
  const { setUser } = useAuth();
  const { refresh } = useMasters();
  const toast = useToast();
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone || '');
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [saving, setSaving] = useState(false);
  const dirty = name !== user.name || phone !== (user.phone || '');

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const e: typeof errors = {};
    if (!name.trim()) e.name = 'Name is required';
    if (phone.trim() && !/^[+\d][\d\s-]{5,}$/.test(phone.trim())) e.phone = 'Enter a valid phone number';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const res = await api.put<{ user: User }>('/api/auth/me', { name: name.trim(), phone: phone.trim() });
      setUser(res.user);
      setName(res.user.name);
      setPhone(res.user.phone || '');
      await refresh();
      toast.success('Profile updated');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card" onSubmit={(e) => void submit(e)} noValidate>
      <div className="card-header">
        <div className="card-title">Personal details</div>
      </div>
      <div className="card-body">
        <div className="adm-form-grid">
          <Field label="Full name" required error={errors.name} htmlFor="pf-name">
            <Input
              id="pf-name"
              value={name}
              maxLength={120}
              invalid={!!errors.name}
              onChange={(e) => {
                setName(e.target.value);
                setErrors((p) => ({ ...p, name: undefined }));
              }}
            />
          </Field>
          <Field label="Phone" error={errors.phone} htmlFor="pf-phone">
            <Input
              id="pf-phone"
              type="tel"
              value={phone}
              maxLength={30}
              invalid={!!errors.phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setErrors((p) => ({ ...p, phone: undefined }));
              }}
            />
          </Field>
          <Field label="Email (login ID)" hint="Contact an administrator to change your login ID" className="adm-span-2" htmlFor="pf-email">
            <Input id="pf-email" value={user.email} disabled />
          </Field>
        </div>
      </div>
      <div className="adm-form-actions">
        <Button variant="primary" type="submit" icon={<Save size={14} />} loading={saving} disabled={!dirty}>
          Save details
        </Button>
      </div>
    </form>
  );
}

function PasswordForm({ user }: { user: User }) {
  const { setUser } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const [saving, setSaving] = useState(false);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const e: typeof errors = {};
    if (!current) e.current = 'Enter your current password';
    if (next.length < 6) e.next = 'New password must be at least 6 characters';
    else if (next === current) e.next = 'New password must be different from the current one';
    if (!confirmPw) e.confirm = 'Re-enter the new password';
    else if (confirmPw !== next) e.confirm = 'Passwords do not match';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      // The endpoint also updates name/phone, so send the current values unchanged.
      const res = await api.put<{ user: User }>('/api/auth/me', { name: user.name, phone: user.phone || '', currentPassword: current, newPassword: next });
      setUser(res.user);
      setCurrent('');
      setNext('');
      setConfirmPw('');
      toast.success('Password changed');
    } catch (err) {
      const msg = errorMessage(err);
      if (/current password/i.test(msg)) setErrors({ current: msg });
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card" onSubmit={(e) => void submit(e)} noValidate autoComplete="off">
      <div className="card-header">
        <div className="row">
          <KeyRound size={16} color="var(--primary)" />
          <div className="card-title">Change password</div>
        </div>
      </div>
      <div className="card-body">
        <div className="adm-form-grid adm-form-grid-3">
          <Field label="Current password" required error={errors.current} htmlFor="pw-current">
            <PasswordInput
              id="pw-current"
              value={current}
              autoComplete="current-password"
              invalid={!!errors.current}
              onChange={(e) => {
                setCurrent(e.target.value);
                setErrors((p) => ({ ...p, current: undefined }));
              }}
            />
          </Field>
          <Field label="New password" required error={errors.next} hint="At least 6 characters" htmlFor="pw-new">
            <PasswordInput
              id="pw-new"
              value={next}
              autoComplete="new-password"
              invalid={!!errors.next}
              onChange={(e) => {
                setNext(e.target.value);
                setErrors((p) => ({ ...p, next: undefined }));
              }}
            />
          </Field>
          <Field label="Confirm new password" required error={errors.confirm} htmlFor="pw-confirm">
            <PasswordInput
              id="pw-confirm"
              value={confirmPw}
              autoComplete="new-password"
              invalid={!!errors.confirm}
              onChange={(e) => {
                setConfirmPw(e.target.value);
                setErrors((p) => ({ ...p, confirm: undefined }));
              }}
            />
          </Field>
        </div>
      </div>
      <div className="adm-form-actions">
        <Button variant="primary" type="submit" icon={<KeyRound size={14} />} loading={saving} disabled={!current && !next && !confirmPw}>
          Change password
        </Button>
      </div>
    </form>
  );
}
