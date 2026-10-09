import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs } from '../../components/ui';
import { useConfirm } from '../../components/feedback';
import { useMasters } from '../../context/MastersContext';
import { usePerms } from '../settings/common';
import { ItemsTab, type ItemCategory } from './ItemsTab';
import { GlassTab } from './GlassTab';
import { ColorsTab } from './ColorsTab';
import { SystemsTab } from './SystemsTab';
import { LibraryTab } from './LibraryTab';

export type RateTabKey = ItemCategory | 'glass' | 'colors' | 'systems' | 'library';

export const ALL_RATE_TABS: RateTabKey[] = ['profile', 'aluminium', 'reinforcement', 'hardware', 'glass', 'colors', 'systems', 'library'];
const ITEM_TABS: ItemCategory[] = ['profile', 'aluminium', 'reinforcement', 'hardware'];

function isItemTab(t: RateTabKey): t is ItemCategory {
  return (ITEM_TABS as string[]).includes(t);
}

/**
 * Raw material settings (rate master): items, glass, colours, systems and library designs.
 * Used by Settings → Raw Material Settings and by the /masters route. The tab lives in `?tab=`.
 */
export function RateMasterView({ tabs = ALL_RATE_TABS, onDirtyChange }: { tabs?: RateTabKey[]; /** Must be a stable callback. */ onDirtyChange: (dirty: boolean) => void }) {
  const { masters } = useMasters();
  const confirm = useConfirm();
  const readOnly = !usePerms().rates;
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: RateTabKey = raw && (tabs as string[]).includes(raw) ? (raw as RateTabKey) : tabs[0];
  const [dirty, setDirty] = useState(false);

  // Must be stable: the tabs report through effects that re-run when this identity changes.
  const report = useCallback(
    (d: boolean) => {
      setDirty(d);
      onDirtyChange(d);
    },
    [onDirtyChange],
  );

  const counts = useMemo(() => {
    const c: Record<ItemCategory, number> = { profile: 0, aluminium: 0, reinforcement: 0, hardware: 0 };
    for (const i of masters.items) if (i.category in c) c[i.category]++;
    return c;
  }, [masters.items]);

  const labels: Record<RateTabKey, { label: string; count?: number }> = {
    profile: { label: 'Profiles', count: counts.profile },
    aluminium: { label: 'Aluminium', count: counts.aluminium },
    reinforcement: { label: 'Reinforcement', count: counts.reinforcement },
    hardware: { label: 'Hardware', count: counts.hardware },
    glass: { label: 'Glass & Mesh', count: masters.glasses.length },
    colors: { label: 'Colours', count: masters.colors.length },
    systems: { label: 'Systems', count: masters.systems.length },
    library: { label: 'Library designs' },
  };

  const changeTab = async (next: RateTabKey) => {
    if (next === tab) return;
    if (dirty) {
      const ok = await confirm({
        title: 'Discard unsaved rates?',
        message: 'You have rate changes on this tab that have not been saved. Switch tabs and discard them?',
        confirmText: 'Discard changes',
        danger: true,
      });
      if (!ok) return;
    }
    report(false);
    setParams(
      (prev) => {
        const sp = new URLSearchParams(prev);
        sp.set('tab', next);
        return sp;
      },
      { replace: true },
    );
  };

  return (
    <div className="adm-fill adm-rm">
      {tabs.length > 1 && <Tabs className="adm-tabs" tabs={tabs.map((t) => ({ value: t, ...labels[t] }))} value={tab} onChange={(t) => void changeTab(t)} />}
      <div className="adm-fill">
        {isItemTab(tab) ? (
          <ItemsTab key={tab} category={tab} onDirtyChange={report} readOnly={readOnly} />
        ) : tab === 'glass' ? (
          <GlassTab onDirtyChange={report} readOnly={readOnly} />
        ) : tab === 'colors' ? (
          <ColorsTab readOnly={readOnly} />
        ) : tab === 'systems' ? (
          <SystemsTab readOnly={readOnly} />
        ) : (
          <LibraryTab readOnly={readOnly} />
        )}
      </div>
    </div>
  );
}
