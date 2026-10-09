import { useMemo, useState, type FormEvent } from 'react';
import { Edit3, Plus, Trash2, UserCog, UsersRound } from 'lucide-react';
import { Badge, Button, Checkbox, Empty, Field, IconButton, Input } from '../../components/ui';
import { Modal } from '../../components/overlay';
import { useConfirm, useToast } from '../../components/feedback';
import { useMasters } from '../../context/MastersContext';
import { api, errorMessage } from '../../lib/api';
import { initials } from '../../lib/format';
import type { User } from '../../lib/types';
import { SearchBox } from '../masters/shared';
import { SubPage, useSettingsNav, usePerms } from './common';
import { RoleBadge } from './UsersPage';

const NO_TEAM = '__none__';

/** Teams are derived from each user's "team" field. */
export function TeamsPage() {
  const { masters, refresh } = useMasters();
  const nav = useSettingsNav();
  const toast = useToast();
  const confirm = useConfirm();
  const canEdit = usePerms().settings;
  const [editing, setEditing] = useState<{ name: string; members: User[] } | 'new' | null>(null);
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();

  const teams = useMemo(() => {
    const map = new Map<string, User[]>();
    for (const u of masters.users) {
      const key = u.team?.trim() || NO_TEAM;
      const list = map.get(key);
      if (list) list.push(u);
      else map.set(key, [u]);
    }
    return [...map]
      .map(([name, members]) => ({ name, members: [...members].sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => (a.name === NO_TEAM ? 1 : b.name === NO_TEAM ? -1 : a.name.localeCompare(b.name)));
  }, [masters.users]);

  const visible = useMemo(() => {
    if (!q) return teams;
    return teams
      .map((t) => {
        const teamHit = t.name !== NO_TEAM && t.name.toLowerCase().includes(q);
        return { ...t, members: teamHit ? t.members : t.members.filter((m) => `${m.name} ${m.email}`.toLowerCase().includes(q)) };
      })
      .filter((t) => t.members.length);
  }, [teams, q]);

  const named = teams.filter((t) => t.name !== NO_TEAM).length;

  async function removeTeam(t: { name: string; members: User[] }) {
    const ok = await confirm({
      title: 'Delete team?',
      message: (
        <>
          <b>{t.name}</b> will be removed. Its {t.members.length} member{t.members.length === 1 ? '' : 's'} stay as users without a team.
        </>
      ),
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/api/teams/${encodeURIComponent(t.name)}`);
      await refresh();
      toast.success(`Team ${t.name} deleted`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <SubPage
      actions={
        <>
          <Button icon={<UserCog size={15} />} onClick={() => nav.open('users')}>
            Manage users
          </Button>
          {canEdit && masters.users.length > 0 && (
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditing('new')} data-tour="teams-add">
              Add team
            </Button>
          )}
        </>
      }
    >
      <div className="row mb-12 wrap">
        <SearchBox value={search} onChange={setSearch} placeholder="Search team or member" />
        <span className="adm-toolbar-note">
          {named} team{named === 1 ? '' : 's'} · {masters.users.length} users. Assign a team when adding or editing a user.
        </span>
      </div>
      {visible.length ? (
        <div className="adm-teams">
          {visible.map((t) => (
            <div key={t.name} className="card adm-team-card">
              <div className="adm-team-head">
                <span className="adm-team-icon">
                  <UsersRound size={16} />
                </span>
                <div className="grow">
                  <div className="adm-cell-main">{t.name === NO_TEAM ? 'Not in a team' : t.name}</div>
                  <div className="adm-cell-sub">
                    {t.members.length} member{t.members.length === 1 ? '' : 's'}
                  </div>
                </div>
                {canEdit && t.name !== NO_TEAM && (
                  <span className="adm-team-actions">
                    <IconButton size="sm" tip="Edit team" tipPos="left" onClick={() => setEditing({ name: t.name, members: teams.find((x) => x.name === t.name)?.members ?? t.members })} data-tour="teams-edit">
                      <Edit3 size={13} />
                    </IconButton>
                    <IconButton size="sm" tip="Delete team" tipPos="left" onClick={() => void removeTeam(t)}>
                      <Trash2 size={13} />
                    </IconButton>
                  </span>
                )}
              </div>
              <div className="adm-team-members">
                {t.members.map((m) => (
                  <div key={m.id} className="adm-team-member">
                    <span className="avatar">{initials(m.name)}</span>
                    <div className="grow">
                      <div className="adm-cell-main ellipsis">{m.name}</div>
                      <div className="adm-cell-sub ellipsis">{m.email}</div>
                    </div>
                    <RoleBadge role={m.role} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <Empty title={q ? 'No team or member matches your search' : 'No users yet'} icon={<UsersRound size={30} strokeWidth={1.4} />}>
            {!q && <Badge tone="grey">Add users to see teams</Badge>}
          </Empty>
        </div>
      )}
      {editing && (
        <TeamModal
          team={editing === 'new' ? null : editing}
          users={masters.users}
          existing={teams.filter((t) => t.name !== NO_TEAM).map((t) => t.name)}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
    </SubPage>
  );
}

/** Add a team (its name plus the users in it) or rename / change the members of one. */
function TeamModal({
  team,
  users,
  existing,
  onClose,
  onSaved,
}: {
  team: { name: string; members: User[] } | null;
  users: User[];
  existing: string[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [name, setName] = useState(team?.name ?? '');
  const [members, setMembers] = useState<number[]>(team?.members.map((m) => m.id) ?? []);
  const [errors, setErrors] = useState<{ name?: string; members?: string }>({});
  const [saving, setSaving] = useState(false);

  async function submit(ev?: FormEvent) {
    ev?.preventDefault();
    const e: typeof errors = {};
    const n = name.trim();
    if (!n) e.name = 'Team name is required';
    else if (existing.some((x) => x.toLowerCase() === n.toLowerCase() && x !== team?.name)) e.name = 'A team with this name already exists';
    if (!members.length) e.members = 'Choose at least one member';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      if (team) await api.put(`/api/teams/${encodeURIComponent(team.name)}`, { name: n, members });
      else await api.post('/api/teams', { name: n, members });
      await onSaved();
      toast.success(team ? `Team ${n} updated` : `Team ${n} added`);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={team ? `Edit team · ${team.name}` : 'Add team'}
      closeOnBackdrop={false}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="team-form" loading={saving}>
            {team ? 'Save' : 'Add team'}
          </Button>
        </>
      }
    >
      <form id="team-form" className="col gap-12" onSubmit={(e) => void submit(e)} noValidate>
        <Field label="Team name" required error={errors.name} htmlFor="tm-name">
          <Input
            id="tm-name"
            value={name}
            maxLength={80}
            autoFocus
            invalid={!!errors.name}
            onChange={(e) => {
              setName(e.target.value);
              setErrors((p) => ({ ...p, name: undefined }));
            }}
            placeholder="e.g. Chennai Sales"
          />
        </Field>
        <Field label={`Members (${members.length})`} required error={errors.members} hint="A user belongs to one team; choosing someone moves them from their current team.">
          <div className="team-member-pick">
            {users.map((u) => (
              <Checkbox
                key={u.id}
                checked={members.includes(u.id)}
                onChange={(v) => {
                  setMembers((m) => (v ? [...m, u.id] : m.filter((x) => x !== u.id)));
                  setErrors((p) => ({ ...p, members: undefined }));
                }}
                label={
                  <span className="ellipsis">
                    {u.name}
                    {u.team && u.team !== team?.name ? <span className="muted fs-11"> · {u.team}</span> : null}
                  </span>
                }
              />
            ))}
          </div>
        </Field>
      </form>
    </Modal>
  );
}
