import { useMemo, useState } from 'react';
import { UserCog, UsersRound } from 'lucide-react';
import { Badge, Button, Empty } from '../../components/ui';
import { useMasters } from '../../context/MastersContext';
import { initials } from '../../lib/format';
import type { User } from '../../lib/types';
import { SearchBox } from '../masters/shared';
import { SubPage, useSettingsNav } from './common';
import { RoleBadge } from './UsersPage';

const NO_TEAM = '__none__';

/** Teams are derived from each user's "team" field. */
export function TeamsPage() {
  const { masters } = useMasters();
  const nav = useSettingsNav();
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

  return (
    <SubPage
      actions={
        <Button variant="primary" icon={<UserCog size={15} />} onClick={() => nav.open('users')}>
          Manage users
        </Button>
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
    </SubPage>
  );
}
