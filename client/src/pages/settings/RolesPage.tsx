import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Lock, Plus, RotateCcw, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { PermissionKey, User } from '../../lib/types';
import { Badge, Button, Empty, Field, IconButton, Input, Select, Spinner } from '../../components/ui';
import { Modal } from '../../components/overlay';
import { useConfirm, useToast } from '../../components/feedback';
import { useMasters } from '../../context/MastersContext';
import { useAuth } from '../../context/AuthContext';
import { ReadOnlyNote, SkeletonRows, SubPage, UnsavedNote, useDirty, usePerms } from './common';
import { roleLabel } from './shared';

type PermMap = Partial<Record<PermissionKey, boolean>>;

interface RoleRow {
  name: string;
  permissions: PermMap;
  users: number;
  locked: boolean;
}

interface RolesResponse {
  permissions: { key: PermissionKey; label: string }[];
  roles: RoleRow[];
}

const BUILT_IN = ['admin', 'sales'];

export function RolesPage() {
  const { refresh } = useMasters();
  const { user: me, setUser } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const canEdit = usePerms().settings;
  const [data, setData] = useState<RolesResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, PermMap>>({});
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<RolesResponse>('/api/roles');
      // Administrator first, then built-in sales, then custom roles A–Z.
      res.roles.sort((a, b) => (a.locked ? -1 : b.locked ? 1 : a.name === 'sales' ? -1 : b.name === 'sales' ? 1 : a.name.localeCompare(b.name)));
      setData(res);
      setLoadError(null);
    } catch (e) {
      setLoadError(errorMessage(e));
      toast.error(errorMessage(e));
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const permValue = (role: RoleRow, key: PermissionKey) => (role.locked ? true : (drafts[role.name]?.[key] ?? !!role.permissions[key]));

  const changedRoles = useMemo(
    () => (data?.roles ?? []).filter((r) => !r.locked && drafts[r.name] && data!.permissions.some((p) => (drafts[r.name][p.key] ?? !!r.permissions[p.key]) !== !!r.permissions[p.key])),
    [data, drafts],
  );
  useDirty(changedRoles.length > 0);

  const toggle = (role: RoleRow, key: PermissionKey, value: boolean) => setDrafts((prev) => ({ ...prev, [role.name]: { ...prev[role.name], [key]: value } }));

  /** Re-read the signed-in user so permission changes to their own role apply immediately. */
  const reloadMe = async () => {
    try {
      const r = await api.get<{ user: User }>('/api/auth/me');
      setUser(r.user);
    } catch {
      /* keep the current session user */
    }
  };

  async function save() {
    if (!data || !changedRoles.length) return;
    setSaving(true);
    const failed: string[] = [];
    let firstError = '';
    for (const role of changedRoles) {
      const permissions = Object.fromEntries(data.permissions.map((p) => [p.key, permValue(role, p.key)]));
      try {
        await api.put(`/api/roles/${encodeURIComponent(role.name)}`, { permissions });
      } catch (e) {
        failed.push(roleLabel(role.name));
        if (!firstError) firstError = errorMessage(e);
      }
    }
    const savedCount = changedRoles.length - failed.length;
    setDrafts((prev) => {
      const next: Record<string, PermMap> = {};
      for (const role of changedRoles) if (failed.includes(roleLabel(role.name)) && prev[role.name]) next[role.name] = prev[role.name];
      return next;
    });
    await load();
    if (savedCount) {
      await refresh();
      if (me && changedRoles.some((r) => r.name === me.role)) await reloadMe();
      toast.success(savedCount === 1 ? 'Permissions updated' : `Permissions updated for ${savedCount} roles`);
    }
    if (failed.length) toast.error(`Could not update ${failed.join(', ')}: ${firstError}`);
    setSaving(false);
  }

  async function remove(role: RoleRow) {
    const ok = await confirm({
      title: 'Delete role?',
      message: (
        <>
          The <b>{roleLabel(role.name)}</b> role will be deleted.
        </>
      ),
      confirmText: 'Delete role',
      danger: true,
    });
    if (!ok) return;
    setDeleting(role.name);
    try {
      await api.del(`/api/roles/${encodeURIComponent(role.name)}`);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[role.name];
        return next;
      });
      await load();
      await refresh();
      toast.success(`${roleLabel(role.name)} deleted`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDeleting(null);
    }
  }

  const changedSet = new Set(changedRoles.map((r) => r.name));

  return (
    <SubPage
      actions={
        canEdit && (
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => setAdding(true)} disabled={!data}>
            Add role
          </Button>
        )
      }
      footer={
        canEdit && (
          <>
            <UnsavedNote count={changedRoles.length} noun="role change" />
            <Button variant="ghost" icon={<RotateCcw size={14} />} onClick={() => setDrafts({})} disabled={!changedRoles.length || saving}>
              Reset
            </Button>
            <Button variant="primary" icon={<Save size={14} />} onClick={() => void save()} loading={saving} disabled={!changedRoles.length}>
              Save
            </Button>
          </>
        )
      }
    >
      {!canEdit && <ReadOnlyNote />}
      {loadError && !data ? (
        <div className="card">
          <Empty title="Could not load roles">
            <Button size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </Empty>
        </div>
      ) : (
        <div className="adm-roles">
          <div className="card">
            <div className="card-header">
              <div className="card-title">Roles</div>
              {data && <span className="adm-toolbar-note">{data.roles.length} roles</span>}
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th className="num">Users</th>
                    {canEdit && <th style={{ width: 44 }} aria-label="Actions" />}
                  </tr>
                </thead>
                <tbody>
                  {!data && <SkeletonRows rows={3} cols={canEdit ? 3 : 2} />}
                  {data?.roles.map((r) => {
                    const builtIn = BUILT_IN.includes(r.name);
                    const why = builtIn ? 'Built-in roles cannot be deleted' : r.users ? `Move the ${r.users} user${r.users > 1 ? 's' : ''} in this role to another role first` : 'Delete role';
                    return (
                      <tr key={r.name}>
                        <td>
                          <div className="row gap-4">
                            <span className="adm-cell-main">{roleLabel(r.name)}</span>
                            {r.locked && <Lock size={12} className="muted" aria-label="All permissions" />}
                            {builtIn && <Badge tone="grey">Built-in</Badge>}
                            {me?.role === r.name && <Badge tone="primary">Your role</Badge>}
                          </div>
                        </td>
                        <td className="num">{r.users}</td>
                        {canEdit && (
                          <td className="text-right">
                            <IconButton size="sm" tip={why} tipPos="left" className="adm-icon-danger" disabled={builtIn || r.users > 0 || deleting === r.name} onClick={() => void remove(r)}>
                              {deleting === r.name ? <Spinner /> : <Trash2 size={14} />}
                            </IconButton>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Permissions</div>
                <div className="adm-card-desc">Tick what each role is allowed to do. The Administrator role always has every permission.</div>
              </div>
            </div>
            <div className="table-wrap" data-tour="settings-roles">
              <table className="table adm-matrix">
                <thead>
                  <tr>
                    <th>Permission</th>
                    {data?.roles.map((r) => (
                      <th key={r.name} className="adm-matrix-role">
                        <div className="row gap-4" style={{ justifyContent: 'center' }}>
                          {r.locked && <Lock size={12} aria-hidden="true" />}
                          {roleLabel(r.name)}
                        </div>
                        <div className="adm-cell-sub">
                          {changedSet.has(r.name) ? (
                            <span className="adm-chip adm-chip-edited">Edited</span>
                          ) : (
                            `${r.users} user${r.users === 1 ? '' : 's'}`
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {!data && <SkeletonRows rows={5} cols={3} />}
                  {data?.permissions.map((p) => (
                    <tr key={p.key}>
                      <td>
                        <div className="adm-cell-main">{p.label}</div>
                        <div className="adm-cell-sub adm-mono">{p.key}</div>
                      </td>
                      {data.roles.map((r) => (
                        <td key={r.name} className="adm-matrix-cell">
                          <input
                            type="checkbox"
                            className="adm-matrix-check"
                            checked={permValue(r, p.key)}
                            disabled={r.locked || !canEdit || saving}
                            title={r.locked ? 'The Administrator role always has every permission' : undefined}
                            aria-label={`${roleLabel(r.name)}: ${p.label}`}
                            onChange={(e) => toggle(r, p.key, e.target.checked)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {data && !data.roles.length && <Empty title="No roles" icon={<ShieldCheck size={30} strokeWidth={1.4} />} />}
            </div>
          </div>
        </div>
      )}
      {adding && data && (
        <AddRoleModal
          roles={data.roles}
          permissionKeys={data.permissions.map((p) => p.key)}
          onClose={() => setAdding(false)}
          onCreated={async (name) => {
            setAdding(false);
            await load();
            await refresh();
            toast.success(`${roleLabel(name)} role created. Tick its permissions and save.`);
          }}
        />
      )}
    </SubPage>
  );
}

function AddRoleModal({
  roles,
  permissionKeys,
  onClose,
  onCreated,
}: {
  roles: RoleRow[];
  permissionKeys: PermissionKey[];
  onClose: () => void;
  onCreated: (name: string) => Promise<void>;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [copyFrom, setCopyFrom] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const cleaned = name.trim().toLowerCase().replace(/[^a-z0-9 _-]/g, '');

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!cleaned) return setError('Enter a role name using letters or numbers');
    if (roles.some((r) => r.name === cleaned)) return setError('This role already exists');
    const source = roles.find((r) => r.name === copyFrom);
    setSaving(true);
    try {
      const permissions = Object.fromEntries(permissionKeys.map((k) => [k, source ? source.locked || !!source.permissions[k] : false]));
      const res = await api.post<{ name: string }>('/api/roles', { name: cleaned, permissions });
      await onCreated(res.name || cleaned);
    } catch (e) {
      toast.error(errorMessage(e));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Add role"
      closeOnBackdrop={false}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="adm-role-form" loading={saving}>
            Add role
          </Button>
        </>
      }
    >
      <form id="adm-role-form" className="col gap-12" onSubmit={(e) => void submit(e)} noValidate>
        <Field label="Role name" required error={error} hint={cleaned && cleaned !== name.trim() ? `Will be saved as “${cleaned}”` : 'Letters, numbers, spaces, - and _'} htmlFor="role-name">
          <Input
            id="role-name"
            value={name}
            autoFocus
            maxLength={40}
            invalid={!!error}
            placeholder="e.g. sales manager"
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
          />
        </Field>
        <Field label="Start with permissions of" htmlFor="role-copy">
          <Select id="role-copy" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
            <option value="">No permissions</option>
            {roles.map((r) => (
              <option key={r.name} value={r.name}>
                {roleLabel(r.name)}
              </option>
            ))}
          </Select>
        </Field>
      </form>
    </Modal>
  );
}
