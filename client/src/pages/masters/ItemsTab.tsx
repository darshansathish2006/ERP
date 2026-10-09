import { Fragment, useEffect, useMemo, useState } from 'react';
import { Edit3, Lock, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { ItemDef } from '../../lib/types';
import { Badge, Button, Empty, IconButton, Select } from '../../components/ui';
import { useConfirm, useToast } from '../../components/feedback';
import { useMasters } from '../../context/MastersContext';
import { AddItemModal } from './AddItemModal';
import { RateInput, SearchBox, isValidRate, numStr, parseNum, useMasterUsage, usageText } from './shared';

export type ItemCategory = ItemDef['category'];

interface Draft {
  rate?: string;
  rate_lam?: string;
}

const BAR_CATEGORIES: ItemCategory[] = ['profile', 'aluminium', 'reinforcement'];

function isChanged(it: ItemDef, d: Draft | undefined): boolean {
  if (!d) return false;
  if (d.rate !== undefined && parseNum(d.rate) !== it.rate) return true;
  if (it.color_variant && d.rate_lam !== undefined && parseNum(d.rate_lam) !== it.rate_lam) return true;
  return false;
}

function isDraftValid(it: ItemDef, d: Draft | undefined): boolean {
  if (!d) return true;
  if (d.rate !== undefined && !isValidRate(d.rate)) return false;
  if (it.color_variant && d.rate_lam !== undefined && !isValidRate(d.rate_lam)) return false;
  return true;
}

export function ItemsTab({ category, onDirtyChange, readOnly = false }: { category: ItemCategory; onDirtyChange: (dirty: boolean) => void; readOnly?: boolean }) {
  const { masters, refresh } = useMasters();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ItemDef | null>(null);
  const confirm = useConfirm();
  const { usage, refresh: refreshUsage } = useMasterUsage();

  const items = useMemo(() => masters.items.filter((i) => i.category === category), [masters.items, category]);
  const groups = useMemo(() => [...new Set(items.map((i) => i.grp))], [items]);
  const showLam = category === 'profile' && items.some((i) => i.color_variant);
  const showBar = BAR_CATEGORIES.includes(category);
  const showGroupFilter = category === 'hardware' && groups.length > 1;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => (!group || i.grp === group) && (!q || i.code.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)));
  }, [items, group, search]);

  // Hardware is listed under group headings (Fabrication Hardware, Screws, Gasket…).
  const sections = useMemo(() => {
    if (category !== 'hardware') return [{ grp: null as string | null, rows: visible }];
    const map = new Map<string, ItemDef[]>();
    for (const it of visible) {
      const rows = map.get(it.grp);
      if (rows) rows.push(it);
      else map.set(it.grp, [it]);
    }
    return [...map].map(([grp, rows]) => ({ grp: grp as string | null, rows }));
  }, [category, visible]);
  const colCount = 5 + (showBar ? 1 : 0) + (showLam ? 1 : 0) + (readOnly ? 0 : 1);

  async function remove(it: ItemDef) {
    if (drafts[it.code]) {
      toast.error('Save or discard the unsaved rate of this item first');
      return;
    }
    const ok = await confirm({
      title: 'Delete item?',
      message: (
        <>
          <b>{it.code}</b> {it.name} will be removed from the rate master and from every price level.
        </>
      ),
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/api/masters/items/${encodeURIComponent(it.code)}`);
      await refresh();
      await refreshUsage();
      toast.success(`Item ${it.code} deleted`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const changed = useMemo(() => items.filter((it) => isChanged(it, drafts[it.code])), [items, drafts]);
  const changedCodes = useMemo(() => new Set(changed.map((c) => c.code)), [changed]);
  const invalidCount = changed.filter((it) => !isDraftValid(it, drafts[it.code])).length;
  const dirty = changed.length > 0;

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const setDraft = (code: string, field: keyof Draft, value: string) => setDrafts((prev) => ({ ...prev, [code]: { ...prev[code], [field]: value } }));
  const valueOf = (it: ItemDef, field: keyof Draft) => drafts[it.code]?.[field] ?? numStr(it[field]);

  async function save() {
    if (!dirty) return;
    if (invalidCount) {
      toast.error('Please enter a valid rate (0 or more) for the highlighted rows.');
      return;
    }
    setSaving(true);
    const saved: string[] = [];
    const failed: string[] = [];
    let firstError = '';
    for (const it of changed) {
      const d = drafts[it.code] ?? {};
      const body = {
        rate: parseNum(d.rate ?? numStr(it.rate)),
        rate_lam: it.color_variant ? parseNum(d.rate_lam ?? numStr(it.rate_lam)) : null,
      };
      try {
        await api.put<ItemDef>(`/api/masters/items/${encodeURIComponent(it.code)}`, body);
        saved.push(it.code);
      } catch (e) {
        failed.push(it.code);
        if (!firstError) firstError = errorMessage(e);
      }
    }
    if (saved.length) await refresh();
    setDrafts((prev) => {
      const next = { ...prev };
      for (const code of saved) delete next[code];
      return next;
    });
    setSaving(false);
    if (saved.length) toast.success(saved.length === 1 ? 'Rates updated' : `Rates updated for ${saved.length} items`);
    if (failed.length) toast.error(`Could not update ${failed.join(', ')}: ${firstError}`);
  }

  const renderRow = (it: ItemDef) => {
    const d = drafts[it.code];
    const rowDirty = changedCodes.has(it.code);
    return (
      <tr key={it.code} className={rowDirty ? 'adm-dirty' : ''}>
        <td className="adm-mono nowrap">{it.code}</td>
        <td>
          <span className="adm-cell-main">{it.name}</span>
          {it.rate === 0 && !rowDirty && (
            <span style={{ marginLeft: 8 }}>
              <Badge tone="warning">Zero rate</Badge>
            </span>
          )}
        </td>
        <td className="muted nowrap">{it.grp}</td>
        <td className="nowrap">{it.unit}</td>
        {showBar && <td className="num">{it.bar_length ?? '—'}</td>}
        <td className="num">
          <RateInput
            value={valueOf(it, 'rate')}
            onChange={(v) => setDraft(it.code, 'rate', v)}
            dirty={d?.rate !== undefined && parseNum(d.rate) !== it.rate}
            label={`Rate for ${it.code}`}
            disabled={saving || readOnly}
          />
        </td>
        {showLam && (
          <td className="num">
            {it.color_variant ? (
              <RateInput
                value={valueOf(it, 'rate_lam')}
                onChange={(v) => setDraft(it.code, 'rate_lam', v)}
                dirty={d?.rate_lam !== undefined && parseNum(d.rate_lam) !== it.rate_lam}
                label={`Laminated rate for ${it.code}`}
                disabled={saving || readOnly}
              />
            ) : (
              <span className="muted">—</span>
            )}
          </td>
        )}
        {!readOnly && (
          <td className="nowrap">
            <span className="row gap-4" style={{ flexWrap: 'nowrap' }}>
              <IconButton size="sm" tip="Edit item" tipPos="left" onClick={() => setEditing(it)} disabled={saving} data-tour="masters-item-edit">
                <Edit3 size={13} />
              </IconButton>
              {usage?.items[it.code] ? (
                <IconButton size="sm" tip={`${usageText(usage.items[it.code])} – cannot be deleted`} tipPos="left" aria-label={`${it.code} is in use`} disabled>
                  <Lock size={13} />
                </IconButton>
              ) : (
                <IconButton size="sm" tip="Delete item" tipPos="left" onClick={() => void remove(it)} disabled={saving || !usage}>
                  <Trash2 size={13} />
                </IconButton>
              )}
            </span>
          </td>
        )}
      </tr>
    );
  };

  return (
    <div className="list-card" data-tour="masters-items">
      <div className="toolbar adm-toolbar">
        <SearchBox value={search} onChange={setSearch} placeholder="Search code or item name" />
        {showGroupFilter && (
          <Select sm value={group} onChange={(e) => setGroup(e.target.value)} style={{ width: 200 }} aria-label="Group">
            <option value="">All groups</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
        )}
        <span className="adm-toolbar-note">
          {visible.length === items.length ? `${items.length} items` : `${visible.length} of ${items.length} items`}
        </span>
        <div className="adm-toolbar-spacer" />
        {dirty && (
          <>
            <span className="adm-toolbar-note warn">
              {changed.length} unsaved change{changed.length > 1 ? 's' : ''}
            </span>
            <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={() => setDrafts({})} disabled={saving}>
              Discard
            </Button>
          </>
        )}
        {!readOnly && (
          <>
            <Button size="sm" variant="primary" icon={<Save size={14} />} onClick={() => void save()} disabled={!dirty} loading={saving}>
              Save changes
            </Button>
            <Button size="sm" variant="outline-primary" icon={<Plus size={14} />} onClick={() => setAdding(true)} data-tour="masters-add-item">
              Add item
            </Button>
          </>
        )}
        {readOnly && <span className="adm-toolbar-note">View only</span>}
      </div>
      <div className="table-wrap">
        <table className="table adm-rate-table">
          <thead>
            <tr>
              <th style={{ width: 150 }}>RM Code</th>
              <th>Item Name</th>
              <th>Group</th>
              <th>Unit</th>
              {showBar && <th className="num">Bar Length (m)</th>}
              <th className="num" style={{ width: 150 }}>
                Rate (₹)
              </th>
              {showLam && (
                <th className="num" style={{ width: 160 }}>
                  Laminated Rate (₹)
                </th>
              )}
              {!readOnly && <th style={{ width: 70 }} />}
            </tr>
          </thead>
          <tbody>
            {sections.map((sec) => (
              <Fragment key={sec.grp ?? 'all'}>
                {sec.grp && (
                  <tr className="adm-group-row">
                    <td colSpan={colCount}>
                      {sec.grp}
                      <span className="tab-count">{sec.rows.length}</span>
                    </td>
                  </tr>
                )}
                {sec.rows.map(renderRow)}
              </Fragment>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <Empty title={items.length ? 'No items match your search' : 'No items in this category yet'}>
            {!items.length && !readOnly && (
              <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setAdding(true)}>
                Add item
              </Button>
            )}
          </Empty>
        )}
      </div>
      {adding && <AddItemModal category={category} onClose={() => setAdding(false)} onSaved={() => void refreshUsage()} />}
      {editing && <AddItemModal category={category} item={editing} locked={usage?.items[editing.code]} onClose={() => setEditing(null)} onSaved={() => void refreshUsage()} />}
    </div>
  );
}
