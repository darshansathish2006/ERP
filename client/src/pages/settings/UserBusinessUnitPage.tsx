import { useCallback, useEffect, useMemo, useState } from 'react';
import { RotateCcw, Save, Settings2, Users } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { User } from '../../lib/types';
import { Button, Empty, Select } from '../../components/ui';
import { useToast } from '../../components/feedback';
import { useMasters } from '../../context/MastersContext';
import { useAuth } from '../../context/AuthContext';
import { initials } from '../../lib/format';
import { SearchBox } from '../masters/shared';
import { ReadOnlyNote, SubPage, UnsavedNote, useDirty, usePerms, useSettingsNav } from './common';
import type { LookupEntry } from './registry';
import { RoleBadge } from './UsersPage';

/** Assigns a business unit to each user; stored in the user's "team" field. */
export function UserBusinessUnitPage() {
  const { masters, refresh } = useMasters();
  const { user: me, setUser } = useAuth();
  const nav = useSettingsNav();
  const toast = useToast();
  const canEdit = usePerms().settings;
  const [units, setUnits] = useState<string[] | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const loadUnits = useCallback(async () => {
    try {
      const res = await api.get<Record<string, LookupEntry[]>>('/api/lookups');
      setUnits((res.business_unit ?? []).map((e) => e.value));
    } catch (e) {
      setUnits([]);
      toast.error(errorMessage(e));
    }
  }, [toast]);

  useEffect(() => {
    void loadUnits();
  }, [loadUnits]);

  const users = masters.users;
  const valueOf = (u: User) => drafts[u.id] ?? (u.team || '');
  const changed = useMemo(() => users.filter((u) => drafts[u.id] !== undefined && drafts[u.id] !== (u.team || '')), [users, drafts]);
  useDirty(changed.length > 0);

  const q = search.trim().toLowerCase();
  const visible = users.filter((u) => !q || `${u.name} ${u.email} ${valueOf(u)}`.toLowerCase().includes(q));

  async function save() {
    setSaving(true);
    const failed: string[] = [];
    let firstError = '';
    let self: User | null = null;
    for (const u of changed) {
      try {
        const saved = await api.put<User>(`/api/users/${u.id}`, { name: u.name, role: u.role, phone: u.phone || '', team: drafts[u.id] });
        if (me && saved.id === me.id) self = saved;
      } catch (e) {
        failed.push(u.name);
        if (!firstError) firstError = errorMessage(e);
      }
    }
    await refresh();
    if (self && me) setUser({ ...me, ...self, permissions: me.permissions });
    setDrafts((prev) => {
      const next: Record<number, string> = {};
      for (const u of changed) if (failed.includes(u.name)) next[u.id] = prev[u.id];
      return next;
    });
    setSaving(false);
    const ok = changed.length - failed.length;
    if (ok) toast.success(ok === 1 ? 'Business unit updated' : `Business units updated for ${ok} users`);
    if (failed.length) toast.error(`Could not update ${failed.join(', ')}: ${firstError}`);
  }

  return (
    <SubPage
      fill
      actions={
        <Button variant="outline" icon={<Settings2 size={15} />} onClick={() => nav.open('business-unit')}>
          Manage business units
        </Button>
      }
      footer={
        canEdit && (
          <>
            <UnsavedNote count={changed.length} />
            <Button variant="ghost" icon={<RotateCcw size={14} />} onClick={() => setDrafts({})} disabled={!changed.length || saving}>
              Reset
            </Button>
            <Button variant="primary" icon={<Save size={14} />} onClick={() => void save()} loading={saving} disabled={!changed.length}>
              Save
            </Button>
          </>
        )
      }
    >
      {!canEdit && <ReadOnlyNote />}
      {units && units.length === 0 && <div className="alert alert-warning mb-12">No business units yet. Add them under Payment → Business unit first.</div>}
      <div className="list-card">
        <div className="toolbar adm-toolbar">
          <SearchBox value={search} onChange={setSearch} placeholder="Search user or business unit" />
          <span className="adm-toolbar-note">{users.length} users</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Role</th>
                <th style={{ width: 280 }}>Business unit</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((u) => {
                const value = valueOf(u);
                const rowDirty = drafts[u.id] !== undefined && drafts[u.id] !== (u.team || '');
                const options = units ?? [];
                return (
                  <tr key={u.id} className={rowDirty ? 'adm-dirty' : ''}>
                    <td>
                      <div className="adm-name-cell">
                        <span className="avatar">{initials(u.name)}</span>
                        <span className="adm-cell-main">{u.name}</span>
                      </div>
                    </td>
                    <td>{u.email}</td>
                    <td>
                      <RoleBadge role={u.role} />
                    </td>
                    <td>
                      <Select sm value={value} disabled={!canEdit || saving || !units} onChange={(e) => setDrafts((prev) => ({ ...prev, [u.id]: e.target.value }))} aria-label={`Business unit for ${u.name}`}>
                        <option value="">Not assigned</option>
                        {options.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                        {value && !options.includes(value) && <option value={value}>{value} (not in the business unit list)</option>}
                      </Select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!visible.length && <Empty title={users.length ? 'No users match your search' : 'No users'} icon={<Users size={30} strokeWidth={1.4} />} />}
        </div>
      </div>
    </SubPage>
  );
}
