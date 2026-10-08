import { useMemo, useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2, Users } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { User } from '../../lib/types';
import { Badge, Button, Empty, Field, IconButton, Input, PasswordInput, Select, Spinner } from '../../components/ui';
import { Modal } from '../../components/overlay';
import { useConfirm, useToast } from '../../components/feedback';
import { useMasters } from '../../context/MastersContext';
import { useAuth } from '../../context/AuthContext';
import { initials } from '../../lib/format';
import { SearchBox } from '../masters/shared';
import { ReadOnlyNote, SubPage, usePerms } from './common';
import { EMAIL_RE, roleLabel } from './shared';

export function RoleBadge({ role }: { role: string }) {
  return <Badge tone={role === 'admin' ? 'primary' : 'grey'}>{roleLabel(role)}</Badge>;
}

export function UsersPage() {
  const { masters, refresh } = useMasters();
  const { user: me, setUser } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const canEdit = usePerms().settings;
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const users = masters.users;
  const teams = useMemo(() => [...new Set(users.map((u) => u.team).filter((t): t is string => !!t))].sort(), [users]);
  const q = search.trim().toLowerCase();
  const visible = useMemo(
    () => users.filter((u) => (!role || u.role === role) && (!q || `${u.name} ${u.email} ${u.team ?? ''} ${u.phone ?? ''}`.toLowerCase().includes(q))),
    [users, role, q],
  );

  async function remove(u: User) {
    const ok = await confirm({
      title: 'Remove user?',
      message: (
        <>
          <b>{u.name}</b> ({u.email}) will no longer be able to sign in. Opportunities they manage are kept.
        </>
      ),
      confirmText: 'Remove user',
      danger: true,
    });
    if (!ok) return;
    setRemoving(u.id);
    try {
      await api.del(`/api/users/${u.id}`);
      await refresh();
      toast.success(`${u.name} removed`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setRemoving(null);
    }
  }

  return (
    <SubPage
      fill
      actions={
        canEdit && (
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditing('new')}>
            Add user
          </Button>
        )
      }
    >
      {!canEdit && <ReadOnlyNote>Only users with the “Manage settings” permission can add, edit or remove users.</ReadOnlyNote>}
      <div className="list-card">
        <div className="toolbar adm-toolbar">
          <SearchBox value={search} onChange={setSearch} placeholder="Search name, email or team" />
          <Select sm value={role} onChange={(e) => setRole(e.target.value)} style={{ width: 170 }} aria-label="Role">
            <option value="">All roles</option>
            {masters.roles.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </Select>
          <span className="adm-toolbar-note">{visible.length === users.length ? `${users.length} users` : `${visible.length} of ${users.length} users`}</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Team</th>
                <th>Phone</th>
                {canEdit && <th className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="adm-name-cell">
                      <span className="avatar">{initials(u.name)}</span>
                      <span className="adm-cell-main">{u.name}</span>
                      {u.id === me?.id && <Badge tone="grey">You</Badge>}
                    </div>
                  </td>
                  <td>{u.email}</td>
                  <td>
                    <RoleBadge role={u.role} />
                  </td>
                  <td>{u.team || <span className="muted">—</span>}</td>
                  <td className="nowrap">{u.phone || <span className="muted">—</span>}</td>
                  {canEdit && (
                    <td className="text-right nowrap">
                      <IconButton size="sm" tip="Edit" onClick={() => setEditing(u)}>
                        <Pencil size={14} />
                      </IconButton>
                      <IconButton
                        size="sm"
                        tip={u.id === me?.id ? 'You cannot remove yourself' : 'Remove'}
                        tipPos="left"
                        className="adm-icon-danger"
                        disabled={u.id === me?.id || removing === u.id}
                        onClick={() => void remove(u)}
                      >
                        {removing === u.id ? <Spinner /> : <Trash2 size={14} />}
                      </IconButton>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!visible.length && <Empty title={users.length ? 'No users match your search' : 'No users'} icon={<Users size={30} strokeWidth={1.4} />} />}
        </div>
      </div>
      {editing && (
        <UserModal
          user={editing === 'new' ? null : editing}
          isSelf={editing !== 'new' && editing.id === me?.id}
          roles={masters.roles}
          teams={teams}
          existingEmails={users.map((u) => u.email.toLowerCase())}
          onClose={() => setEditing(null)}
          onSaved={async (saved, isNew) => {
            await refresh();
            // The users API returns the public user only – keep the session's permissions.
            if (me && saved.id === me.id) setUser({ ...me, ...saved, permissions: me.permissions });
            toast.success(isNew ? `${saved.name} added` : `${saved.name} updated`);
            setEditing(null);
          }}
        />
      )}
    </SubPage>
  );
}

interface UserForm {
  name: string;
  email: string;
  password: string;
  role: string;
  team: string;
  phone: string;
}

function UserModal({
  user,
  isSelf,
  roles,
  teams,
  existingEmails,
  onClose,
  onSaved,
}: {
  user: User | null;
  isSelf: boolean;
  roles: string[];
  teams: string[];
  existingEmails: string[];
  onClose: () => void;
  onSaved: (u: User, isNew: boolean) => Promise<void>;
}) {
  const toast = useToast();
  const isNew = !user;
  const [f, setF] = useState<UserForm>({
    name: user?.name || '',
    email: user?.email || '',
    password: '',
    role: user?.role || (roles.includes('sales') ? 'sales' : roles[0] || 'sales'),
    team: user?.team || '',
    phone: user?.phone || '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof UserForm, string>>>({});
  const [saving, setSaving] = useState(false);
  const roleOptions = roles.includes(f.role) ? roles : [...roles, f.role];

  const set = <K extends keyof UserForm>(key: K, value: UserForm[K]) => {
    setF((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  function validate() {
    const e: Partial<Record<keyof UserForm, string>> = {};
    if (!f.name.trim()) e.name = 'Name is required';
    if (isNew) {
      const email = f.email.trim();
      if (!email) e.email = 'Email is required';
      else if (!EMAIL_RE.test(email)) e.email = 'Enter a valid email address';
      else if (existingEmails.includes(email.toLowerCase())) e.email = 'An account with this email already exists';
      if (f.password.length < 6) e.password = 'Password must be at least 6 characters';
    }
    if (f.phone.trim() && !/^[+\d][\d\s-]{5,}$/.test(f.phone.trim())) e.phone = 'Enter a valid phone number';
    return e;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const body = { name: f.name.trim(), role: f.role, team: f.team.trim(), phone: f.phone.trim() };
      const saved = isNew ? await api.post<User>('/api/users', { ...body, email: f.email.trim(), password: f.password }) : await api.put<User>(`/api/users/${user.id}`, body);
      await onSaved(saved, isNew);
    } catch (err) {
      toast.error(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Add user' : `Edit ${user.name}`}
      closeOnBackdrop={false}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="adm-user-form" loading={saving}>
            {isNew ? 'Add user' : 'Save changes'}
          </Button>
        </>
      }
    >
      <form id="adm-user-form" className="adm-form-grid" onSubmit={(e) => void submit(e)} noValidate>
        <Field label="Full name" required error={errors.name} className="adm-span-2" htmlFor="uf-name">
          <Input id="uf-name" value={f.name} onChange={(e) => set('name', e.target.value)} invalid={!!errors.name} autoFocus maxLength={120} />
        </Field>
        <Field label="Email (login ID)" required={isNew} error={errors.email} hint={isNew ? undefined : 'The login ID cannot be changed'} className="adm-span-2" htmlFor="uf-email">
          <Input id="uf-email" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} invalid={!!errors.email} disabled={!isNew} maxLength={200} autoComplete="off" />
        </Field>
        {isNew && (
          <Field label="Password" required error={errors.password} hint="At least 6 characters" className="adm-span-2" htmlFor="uf-password">
            <PasswordInput id="uf-password" value={f.password} onChange={(e) => set('password', e.target.value)} invalid={!!errors.password} autoComplete="new-password" />
          </Field>
        )}
        <Field label="Role" required hint={isSelf ? 'You cannot change your own role' : 'Roles are managed in Roles & Permissions'} htmlFor="uf-role">
          <Select id="uf-role" value={f.role} onChange={(e) => set('role', e.target.value)} disabled={isSelf}>
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Team / business unit" htmlFor="uf-team">
          <Input id="uf-team" value={f.team} onChange={(e) => set('team', e.target.value)} list="adm-team-list" maxLength={80} placeholder="e.g. Chennai" />
          <datalist id="adm-team-list">
            {teams.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        <Field label="Phone" error={errors.phone} className="adm-span-2" htmlFor="uf-phone">
          <Input id="uf-phone" type="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} invalid={!!errors.phone} maxLength={30} />
        </Field>
      </form>
    </Modal>
  );
}
