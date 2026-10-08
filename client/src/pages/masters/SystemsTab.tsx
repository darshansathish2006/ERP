import { useMemo } from 'react';
import { Layers } from 'lucide-react';
import type { ItemDef, SystemDef } from '../../lib/types';
import { Badge, Empty } from '../../components/ui';
import { useMasters } from '../../context/MastersContext';
import { inr } from '../../lib/format';

const ROLE_LABELS: Record<string, string> = {
  frame: 'Outer frame',
  frame3: 'Outer frame (3 track)',
  sash: 'Sash',
  bead: 'Glass bead',
  interlock: 'Interlock',
  mullion: 'Mullion',
  floatingMullion: 'Floating mullion',
  meshSash: 'Mesh sash',
  guideRail: 'Guide rail',
  monorail: 'Monorail track',
  louverHolder: 'Louver blade holder',
  riFrame: 'Reinforcement – frame',
  riSash: 'Reinforcement – sash',
  riMullion: 'Reinforcement – mullion',
};

function roleLabel(role: string) {
  if (ROLE_LABELS[role]) return ROLE_LABELS[role];
  const words = role.replace(/([a-z])([A-Z0-9])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function SystemsTab() {
  const { masters } = useMasters();
  const itemsByCode = useMemo(() => new Map(masters.items.map((i) => [i.code, i])), [masters.items]);
  if (!masters.systems.length) {
    return (
      <div className="list-card">
        <Empty title="No profile systems configured" icon={<Layers size={30} strokeWidth={1.4} />} />
      </div>
    );
  }
  return (
    <div className="adm-scroll">
      <div className="adm-systems">
        {masters.systems.map((s) => (
          <SystemCard key={s.id} system={s} itemsByCode={itemsByCode} />
        ))}
      </div>
    </div>
  );
}

function SystemCard({ system: s, itemsByCode }: { system: SystemDef; itemsByCode: Map<string, ItemDef> }) {
  const roles = Object.entries(s.roles || {});
  const l = s.limits;
  return (
    <div className="adm-system-card">
      <div className="adm-system-head">
        <div className="row">
          <div className="grow">
            <div className="adm-system-brand">{s.brand}</div>
            <div className="adm-system-name">{s.name}</div>
          </div>
          <Badge tone={s.type === 'sliding' ? 'primary' : 'success'}>{s.type === 'sliding' ? 'Sliding' : 'Casement'}</Badge>
        </div>
        {l && (
          <div className="adm-limits">
            <div className="adm-limit">
              <div className="adm-limit-label">Width (mm)</div>
              <div className="adm-limit-value">
                {l.minWidth} – {l.maxWidth}
              </div>
            </div>
            <div className="adm-limit">
              <div className="adm-limit-label">Height (mm)</div>
              <div className="adm-limit-value">
                {l.minHeight} – {l.maxHeight}
              </div>
            </div>
            <div className="adm-limit">
              <div className="adm-limit-label">Max sash W × H (mm)</div>
              <div className="adm-limit-value">
                {l.maxSashWidth} × {l.maxSashHeight}
              </div>
            </div>
          </div>
        )}
      </div>
      <table className="table table-compact">
        <thead>
          <tr>
            <th>Role</th>
            <th>Item code</th>
            <th>Item name</th>
            <th className="num">Rate</th>
          </tr>
        </thead>
        <tbody>
          {roles.map(([role, code]) => {
            const item = itemsByCode.get(code);
            return (
              <tr key={role}>
                <td className="nowrap">{roleLabel(role)}</td>
                <td className="adm-mono nowrap">{code}</td>
                <td>{item ? item.name : <span className="text-danger">Not in rate master</span>}</td>
                <td className="num nowrap">{item ? `${inr(item.rate)}/${item.unit === 'Meter' ? 'm' : item.unit}` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
