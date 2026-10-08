import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Mail, User as UserIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api, errorMessage } from '../../lib/api';
import { Button, Checkbox, Field, Input, PasswordInput } from '../../components/ui';
import { Modal } from '../../components/overlay';
import { EvaBrand, WindowCarriers } from '../../layout/EvaLogo';

function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-bg">
      <div className="auth-wrap">
        <EvaBrand />
        {children}
      </div>
      <div className="auth-illustration">
        <WindowCarriers width={120} />
      </div>
    </div>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!email.trim()) errs.email = 'Login ID is required';
    else if (!EMAIL_RE.test(email.trim())) errs.email = 'Enter a valid email address';
    if (!password) errs.password = 'Password is required';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    try {
      await login(email.trim(), password, remember);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/login' ? from : '/dashboard', { replace: true });
    } catch (err) {
      setErrors({ form: errorMessage(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <form className="auth-card" onSubmit={submit} noValidate>
        <h1>Login</h1>
        <div className="col gap-12">
          {errors.form && <div className="alert alert-error">{errors.form}</div>}
          <Field label="Login ID" error={errors.email} htmlFor="login-email">
            <div className="input-icon">
              <Mail size={14} />
              <Input id="login-email" type="email" autoComplete="username" placeholder="Enter your email here" value={email} invalid={!!errors.email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            </div>
          </Field>
          <Field label="Password" error={errors.password} htmlFor="login-password">
            <div className="input-icon">
              <Lock size={14} />
              <PasswordInput id="login-password" autoComplete="current-password" placeholder="Enter your password here" value={password} invalid={!!errors.password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </Field>
          <div className="auth-links">
            <Checkbox checked={remember} onChange={setRemember} label={<span className="fs-12">Keep me signed in</span>} />
            <button type="button" className="btn-link btn" onClick={() => setForgotOpen(true)} style={{ fontSize: 12 }}>
              Forgot your password?
            </button>
          </div>
          <Button type="submit" variant="primary" size="lg" loading={loading} style={{ width: '100%', marginTop: 8 }}>
            Login
          </Button>
          <div className="auth-foot">
            Not registered yet? <Link to="/register">Create an account</Link>
          </div>
          <div className="auth-foot">
            <a href="#privacy" onClick={(e) => { e.preventDefault(); setPrivacyOpen(true); }}>Privacy Policy</a>
          </div>
        </div>
      </form>
      <ForgotPasswordModal open={forgotOpen} onClose={() => setForgotOpen(false)} initialEmail={email} />
      <PrivacyModal open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
    </AuthLayout>
  );
}

function PrivacyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Privacy Policy" footer={<Button variant="primary" onClick={onClose}>Close</Button>}>
      <div className="col gap-12" style={{ color: 'var(--text-2)' }}>
        <p>Titans ERP stores customer, opportunity and quotation data locally on the server where it is installed. Data is used only to prepare quotations, reports and analytics for TITANS WINDOWS.</p>
        <p>Passwords are stored as salted hashes. Smart quote links are only accessible to people who receive the link.</p>
        <p>To remove customer data, delete the opportunity from the Opportunity list. Contact titanswindows1@gmail.com for any privacy request.</p>
      </div>
    </Modal>
  );
}

function ForgotPasswordModal({ open, onClose, initialEmail }: { open: boolean; onClose: () => void; initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ resetPath: string | null; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const close = () => {
    setResult(null);
    setError(null);
    onClose();
  };
  const submit = async () => {
    if (!EMAIL_RE.test(email.trim())) {
      setError('Enter a valid email address');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await api.post<{ resetPath: string | null; message: string }>('/api/auth/forgot', { email: email.trim() });
      setResult(r);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title="Forgot password"
      size="sm"
      footer={
        result ? (
          <>
            <Button onClick={close}>Close</Button>
            {result.resetPath && (
              <Button variant="primary" onClick={() => navigate(result.resetPath!)}>
                Reset password now
              </Button>
            )}
          </>
        ) : (
          <>
            <Button onClick={close}>Cancel</Button>
            <Button variant="primary" loading={loading} onClick={submit}>
              Send reset link
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="col gap-12">
          <div className={`alert ${result.resetPath ? 'alert-success' : 'alert-info'}`}>{result.message}</div>
          <p className="muted fs-12">
            {result.resetPath
              ? 'Email delivery is not configured on this installation, so you can open the reset page directly from here. The link is also printed in the server console.'
              : 'For security, reset links are only shown on the computer running Titans ERP. Please ask your administrator for the link (it is printed in the server console).'}
          </p>
        </div>
      ) : (
        <Field label="Login ID" required error={error}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email here" autoFocus onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </Field>
      )}
    </Modal>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (!EMAIL_RE.test(form.email.trim())) errs.email = 'Enter a valid email address';
    if (form.password.length < 6) errs.password = 'Use at least 6 characters';
    if (form.confirm !== form.password) errs.confirm = 'Passwords do not match';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    try {
      await register({ name: form.name.trim(), email: form.email.trim(), password: form.password, phone: form.phone.trim() || undefined });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setErrors({ form: errorMessage(err) });
    } finally {
      setLoading(false);
    }
  };
  return (
    <AuthLayout>
      <form className="auth-card" onSubmit={submit} noValidate>
        <h1>Create an account</h1>
        <div className="col gap-12">
          {errors.form && <div className="alert alert-error">{errors.form}</div>}
          <Field label="Full name" required error={errors.name}>
            <div className="input-icon">
              <UserIcon size={14} />
              <Input value={form.name} onChange={set('name')} invalid={!!errors.name} placeholder="Your name" autoFocus />
            </div>
          </Field>
          <Field label="Email" required error={errors.email}>
            <div className="input-icon">
              <Mail size={14} />
              <Input type="email" value={form.email} onChange={set('email')} invalid={!!errors.email} placeholder="name@company.com" />
            </div>
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={set('phone')} placeholder="+91" />
          </Field>
          <Field label="Password" required error={errors.password}>
            <PasswordInput value={form.password} onChange={set('password')} invalid={!!errors.password} autoComplete="new-password" />
          </Field>
          <Field label="Confirm password" required error={errors.confirm}>
            <PasswordInput value={form.confirm} onChange={set('confirm')} invalid={!!errors.confirm} autoComplete="new-password" />
          </Field>
          <Button type="submit" variant="primary" size="lg" loading={loading} style={{ width: '100%', marginTop: 6 }}>
            Create account
          </Button>
          <div className="auth-foot">
            Already registered? <Link to="/login">Login</Link>
          </div>
        </div>
      </form>
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return setError('Use at least 6 characters');
    if (password !== confirm) return setError('Passwords do not match');
    setLoading(true);
    setError(null);
    try {
      await api.post('/api/auth/reset', { token, password });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };
  return (
    <AuthLayout>
      <form className="auth-card" onSubmit={submit} noValidate>
        <h1>Reset password</h1>
        {done ? (
          <div className="col gap-12">
            <div className="alert alert-success">Your password has been updated. Please log in with the new password.</div>
            <Button variant="primary" onClick={() => navigate('/login')}>
              Go to login
            </Button>
          </div>
        ) : !token ? (
          <div className="col gap-12">
            <div className="alert alert-error">This reset link is invalid. Request a new one from the login page.</div>
            <Link to="/login">Back to login</Link>
          </div>
        ) : (
          <div className="col gap-12">
            {error && <div className="alert alert-error">{error}</div>}
            <Field label="New password" required>
              <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus />
            </Field>
            <Field label="Confirm password" required>
              <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </Field>
            <Button type="submit" variant="primary" size="lg" loading={loading}>
              Update password
            </Button>
          </div>
        )}
      </form>
    </AuthLayout>
  );
}
