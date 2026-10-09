import { useMemo, useState, type ReactNode } from 'react';
import { Edit3, Layers, Lock, Plus, Trash2 } from 'lucide-react';
import type { ItemDef, SystemDef } from '../../lib/types';
import { api, errorMessage } from '../../lib/api';
import { Badge, Button, Empty, IconButton } from '../../components/ui';
import { useConfirm, useToast } from '../../components/feedback';
import { useMasters } from '../../context/MastersContext';
import { inr } from '../../lib/format';
import { SystemModal } from './SystemModal';
import { useMasterUsage, usageText } from './shared';

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

export function SystemsTab({ readOnly = false }: { readOnly?: boolean }) {
  const { masters, refresh } = useMasters();
  const toast = useToast();
  const confirm = useConfirm();
  const [modal, setModal] = useState<{ system?: SystemDef } | null>(null);
  const { usage, refresh: refreshUsage } = useMasterUsage();
  const itemsByCode = useMemo(() => new Map(masters.items.map((i) => [i.code, i])), [masters.items]);

  async function remove(s: SystemDef) {
    const ok = await confirm({
      title: 'Delete profile system?',
      message: (
        <>
          <b>{s.name}</b> will no longer be offered for designs.
        </>
      ),
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/api/masters/systems/${encodeURIComponent(s.id)}`);
      await refresh();
      await refreshUsage();
      toast.success(`${s.name} deleted`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const addButton = (
    <Button size="sm" variant="outline-primary" icon={<Plus size={14} />} onClick={() => setModal({})} data-tour="masters-add-system">
      Add system
    </Button>
  );

  return (
    <div className="list-card">
      <div className="toolbar adm-toolbar">
        <span className="adm-toolbar-note">
          {masters.systems.length} system{masters.systems.length === 1 ? '' : 's'} · the profiles each role uses and the size limits checked in the configurator
        </span>
        <div className="adm-toolbar-spacer" />
        {readOnly ? <span className="adm-toolbar-note">View only</span> : addButton}
      </div>
      <div className="adm-scroll" data-tour="masters-systems">
        {!masters.systems.length ? (
          <Empty title="No profile systems configured" icon={<Layers size={30} strokeWidth={1.4} />}>
            {!readOnly && addButton}
          </Empty>
        ) : (
          <div className="adm-systems">
            {masters.systems.map((s) => (
              <SystemCard
                key={s.id}
                system={s}
                itemsByCode={itemsByCode}
                actions={
                  readOnly ? null : (
                    <span className="row gap-4" style={{ flexWrap: 'nowrap' }}>
                      <IconButton size="sm" tip="Edit system" tipPos="left" onClick={() => setModal({ system: s })} data-tour="masters-system-edit">
                        <Edit3 size={13} />
                      </IconButton>
                      {usage?.systems[s.id] ? (
                        <IconButton size="sm" tip={`${usageText(usage.systems[s.id])} – cannot be deleted`} tipPos="left" aria-label={`${s.name} is in use`} disabled>
                          <Lock size={13} />
                        </IconButton>
                      ) : (
                        <IconButton size="sm" tip="Delete system" tipPos="left" onClick={() => void remove(s)} disabled={!usage}>
                          <Trash2 size={13} />
                        </IconButton>
                      )}
                    </span>
                  )
                }
              />
            ))}
          </div>
        )}
      </div>
      {modal && <SystemModal system={modal.system} onClose={() => setModal(null)} onSaved={() => void refreshUsage()} />}
    </div>
  );
}

function SystemCard({ system: s, itemsByCode, actions }: { system: SystemDef; itemsByCode: Map<string, ItemDef>; actions?: ReactNode }) {
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
          {actions}
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
