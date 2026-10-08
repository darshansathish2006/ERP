import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Filter, RefreshCw, RotateCcw, Search } from 'lucide-react';
import { api, errorMessage } from '../../../lib/api';
import { fixed2, qtyFmt } from '../../../lib/format';
import { useAuth } from '../../../context/AuthContext';
import { useConfirm, useToast } from '../../../components/feedback';
import { Badge, Button, Empty, IconButton, Input, Select } from '../../../components/ui';
import { Menu } from '../../../components/overlay';

export type RateCategory = 'profile' | 'reinforcement' | 'hardware' | 'glass' | 'mesh';

const TITLES: Record<RateCategory, string> = {
  profile: 'Profile rate',
  reinforcement: 'Reinforcement rate',
  hardware: 'Hardware rate',
  glass: 'Glass rate',
  mesh: 'Mesh rate',
};

interface RateRow {
  code: string;
  name: string;
  unit: string;
  group: string;
  category: string;
  qty: number;
  defaultRate: number;
  rate: number;
  overridden: boolean;
  amount: number;
  color: string;
}

interface RatesResponse {
  rows: RateRow[];
  levels: { id: number; name: string; isDefault: boolean }[];
  levelId: number | null;
  levelCategory: string;
}

const UNIT_LABEL: Record<string, string> = { Pcs: 'Pieces', SQMT: 'Square Meter', Set: 'Set', CAN: 'CAN', Meter: 'Meter' };

export function RatePage({ quoteId, category, onSaved }: { quoteId: number; category: RateCategory; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const canEdit = !!user?.permissions?.['quote.manualRate'];
  const [res, setRes] = useState<RatesResponse | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('');
  const [sort, setSort] = useState<{ key: 'code' | 'name' | 'unit' | 'rate'; dir: 1 | -1 } | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get<RatesResponse>(`/api/quotes/${quoteId}/rates?category=${category}`);
      setRes(r);
      setEdits({});
      setSelected([]);
    } catch (e) {
      toast.error(errorMessage(e));
      setRes({ rows: [], levels: [], levelId: null, levelCategory: category });
    }
  }, [quoteId, category, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = res?.rows;
  const groups = useMemo(() => [...new Set((rows || []).map((r) => r.group))], [rows]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (rows || []).filter((r) => (!group || r.group === group) && (!q || r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)));
    if (sort) list.sort((a, b) => (sort.key === 'rate' ? a.rate - b.rate : String(a[sort.key]).localeCompare(String(b[sort.key]))) * sort.dir);
    return list;
  }, [rows, search, group, sort]);
  const dirty = Object.keys(edits).length > 0;
  const valueOf = (r: RateRow) => (edits[r.code] !== undefined ? edits[r.code] : String(r.rate));
  const levelName = res?.levels.find((l) => l.id === res.levelId)?.name || res?.levels.find((l) => l.isDefault)?.name || 'Default';

  const save = async () => {
    const rates: Record<string, number | null> = {};
    for (const [code, v] of Object.entries(edits)) {
      const row = rows?.find((r) => r.code === code);
      if (v.trim() === '') return toast.error(`Enter a rate for ${code}`);
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) return toast.error(`Rate for ${code} must be a positive number`);
      rates[code] = row && n === row.defaultRate ? null : n;
    }
    if (!Object.keys(rates).length) return toast.info('No rate changes to save');
    setSaving(true);
    try {
      await api.put(`/api/quotes/${quoteId}/rates`, { rates });
      await Promise.all([load(), onSaved()]);
      toast.success('Data saved successfully');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const changeLevel = async (levelId: number) => {
    if (!res) return;
    if (dirty && !(await confirm({ title: 'Discard changes?', message: 'Switching the price level discards the rates you have not saved.', confirmText: 'Switch' }))) return;
    try {
      await api.put(`/api/quotes/${quoteId}/price-levels`, { category: res.levelCategory, levelId });
      await Promise.all([load(), onSaved()]);
      toast.success(`Using ${res.levels.find((l) => l.id === levelId)?.name}`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  /** Re-apply the selected price level: removes quote-specific rate edits. */
  const updatePricing = async () => {
    const overridden = (rows || []).filter((r) => r.overridden);
    if (!overridden.length) {
      toast.info(`All rates already follow ${levelName}`);
      return;
    }
    if (!(await confirm({ title: 'Update pricing', message: `Replace ${overridden.length} edited rate${overridden.length > 1 ? 's' : ''} in this quote with the ${levelName} prices?`, confirmText: 'Update' }))) return;
    setSyncing(true);
    try {
      await api.put(`/api/quotes/${quoteId}/rates`, { rates: Object.fromEntries(overridden.map((r) => [r.code, null])) });
      await Promise.all([load(), onSaved()]);
      toast.success('Pricing updated successfully');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSyncing(false);
    }
  };

  const sortHead = (key: 'code' | 'name' | 'unit' | 'rate', label: string) => (
    <span className="th-sort" onClick={() => setSort((s) => (s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }))}>
      {label}
      <span className="muted">{sort?.key === key ? (sort.dir === 1 ? '▲' : '▼') : '⇅'}</span>
    </span>
  );

  if (!res) {
    return (
      <div className="col" style={{ flex: 1, minHeight: 0 }}>
        <div className="pricing-title">{TITLES[category]}</div>
        <div className="list-card" style={{ flex: 1 }}>
          <div className="col gap-8" style={{ padding: 14 }}>
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="skeleton" style={{ height: 22 }} />
            ))}
          </div>
        </div>
      </div>
    );
  }
  const allSelected = shown.length > 0 && shown.every((r) => selected.includes(r.code));

  return (
    <div className="col" style={{ flex: 1, minHeight: 0, gap: 0 }}>
      <div className="pricing-title">{TITLES[category]}</div>
      <div className="list-card" style={{ flex: 1, minHeight: 0 }}>
        <div className="toolbar">
          {res.levels.length > 0 && (
            <Menu
              placement="bottom-start"
              trigger={({ ref, onClick }) => (
                <Button ref={ref} size="sm" variant="dark" onClick={onClick}>
                  {levelName}
                  <ChevronDown size={13} />
                </Button>
              )}
              items={res.levels.map((l) => ({
                label: l.name,
                icon: l.id === res.levelId ? <Check size={14} /> : <span style={{ width: 14 }} />,
                onClick: () => void changeLevel(l.id),
              }))}
            />
          )}
          {selected.length > 0 && canEdit && (
            <BulkRate
              count={selected.length}
              onApply={(v) => setEdits((e) => ({ ...e, ...Object.fromEntries(selected.map((c) => [c, v])) }))}
            />
          )}
          <div className="grow" />
          <div className="toolbar-search">
            <Search size={14} />
            <input className="input" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button size="sm" variant="outline-primary" icon={<RefreshCw size={13} />} loading={syncing} onClick={updatePricing} disabled={!canEdit || !rows?.some((r) => r.overridden)}>
            Update Pricing
          </Button>
          {groups.length > 1 && (
            <span className="row gap-4">
              <Filter size={13} color="var(--muted)" />
              <Select sm value={group} onChange={(e) => setGroup(e.target.value)} style={{ width: 180 }} aria-label="Filter by group">
                <option value="">Filter</option>
                {groups.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </Select>
            </span>
          )}
        </div>
        {rows && rows.length === 0 ? (
          <Empty title="Price level not selected">
            <span className="muted">No {TITLES[category].replace(' rate', '').toLowerCase()} items are used in this quote yet. Add designs in the Design tab.</span>
          </Empty>
        ) : (
          <div className="table-wrap" style={{ flex: 1 }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 34 }}>
                    <input type="checkbox" style={{ accentColor: 'var(--primary)' }} checked={allSelected} onChange={(e) => setSelected(e.target.checked ? shown.map((r) => r.code) : [])} aria-label="Select all" />
                  </th>
                  <th>{sortHead('code', 'RM Code')}</th>
                  <th>{sortHead('name', 'Item Name')}</th>
                  {category === 'hardware' && <th>Color</th>}
                  <th>{sortHead('unit', 'Unit')}</th>
                  <th className="num">Qty in quote</th>
                  <th style={{ width: 170 }}>{sortHead('rate', 'Price Level')}</th>
                  <th className="num">Amount</th>
                  <th style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const v = valueOf(r);
                  const changed = edits[r.code] !== undefined && Number(edits[r.code]) !== r.rate;
                  return (
                    <tr key={r.code} className={selected.includes(r.code) ? 'selected' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          style={{ accentColor: 'var(--primary)' }}
                          checked={selected.includes(r.code)}
                          onChange={(e) => setSelected((s) => (e.target.checked ? [...s, r.code] : s.filter((x) => x !== r.code)))}
                          aria-label={`Select ${r.code}`}
                        />
                      </td>
                      <td>{r.code}</td>
                      <td>
                        {r.name}
                        {r.overridden && !changed && (
                          <span style={{ marginLeft: 6 }}>
                            <Badge tone="warning">Edited · {levelName} ₹{fixed2(r.defaultRate)}</Badge>
                          </span>
                        )}
                      </td>
                      {category === 'hardware' && <td className="fs-12">{r.color}</td>}
                      <td>{UNIT_LABEL[r.unit] || r.unit}</td>
                      <td className="num">{qtyFmt(r.qty, r.unit)}</td>
                      <td>
                        <div className="input-rupee">
                          <Input
                            sm
                            type="number"
                            min={0}
                            step="0.01"
                            value={v}
                            disabled={!canEdit}
                            onChange={(e) => setEdits((ed) => ({ ...ed, [r.code]: e.target.value }))}
                            style={changed ? { borderColor: 'var(--warning)', background: '#fffaf2' } : undefined}
                            aria-label={`Rate for ${r.code}`}
                          />
                        </div>
                      </td>
                      <td className="num">{fixed2(r.qty * Number(v || 0))}</td>
                      <td>
                        {(r.overridden || changed) && canEdit && (
                          <IconButton size="sm" tip={`Use ${levelName}`} tipPos="left" onClick={() => setEdits((ed) => ({ ...ed, [r.code]: String(r.defaultRate) }))}>
                            <RotateCcw size={13} />
                          </IconButton>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="pricing-footer">
          <span className="muted fs-12">
            {shown.length} item{shown.length === 1 ? '' : 's'} · Total {fixed2(shown.reduce((s, r) => s + r.qty * Number(valueOf(r) || 0), 0))}
          </span>
          <div className="grow" />
          <Button variant="ghost" onClick={() => setEdits({})} disabled={!dirty}>
            Reset
          </Button>
          <Button variant="primary" loading={saving} onClick={save} disabled={!dirty || !canEdit}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function BulkRate({ count, onApply }: { count: number; onApply: (v: string) => void }) {
  const [v, setV] = useState('');
  return (
    <span className="row gap-4 bulk-bar">
      <span className="fs-12">Set rate for {count}</span>
      <div className="input-rupee" style={{ width: 100 }}>
        <Input sm type="number" min={0} step="0.01" value={v} onChange={(e) => setV(e.target.value)} aria-label="Bulk rate" />
      </div>
      <Button size="xs" variant="primary" disabled={v === '' || !(Number(v) >= 0)} onClick={() => onApply(v)}>
        Apply
      </Button>
    </span>
  );
}
