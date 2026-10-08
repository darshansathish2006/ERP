import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Columns3, Pencil, Plus, RotateCcw, Save, Tags, Trash2 } from 'lucide-react';
import { api, errorMessage, qs } from '../../lib/api';
import type { PriceLevel } from '../../lib/types';
import { inr } from '../../lib/format';
import { Badge, Button, Checkbox, Empty, Field, IconButton, Input, Pagination, Select } from '../../components/ui';
import { Modal, Popover } from '../../components/overlay';
import { useConfirm, useToast } from '../../components/feedback';
import { useMasters } from '../../context/MastersContext';
import { RateInput, SearchBox, isValidRate, numStr, parseNum, useDebounced } from '../masters/shared';
import { Kebab, ReadOnlyNote, SkeletonRows, SubPage, UnsavedNote, useDirty, usePerms } from './common';

export type LevelCategory = PriceLevel['category'];

export const CATEGORY_LABEL: Record<LevelCategory, string> = { profile: 'Profile', reinforcement: 'Reinforcement', hardware: 'Hardware', glass: 'Glazing' };

export interface LevelRow {
  code: string;
  baseCode: string;
  name: string;
  brand: string;
  rmCategory: string;
  reportingCategory: string;
  color: string;
  unit: string;
  defaultRate: number;
  rate: number;
  overridden: boolean;
  status: string;
  rmsStatus: string;
}

export interface LevelPricesResponse {
  level: { id: number; name: string; category: LevelCategory; isDefault: boolean };
  rows: LevelRow[];
  total: number;
  page: number;
  pageSize: number;
}

type ColKey = 'brand' | 'rmCategory' | 'reportingCategory' | 'color' | 'unit' | 'rmsStatus' | 'status';
const OPTIONAL_COLS: { key: ColKey; label: string }[] = [
  { key: 'brand', label: 'Brand' },
  { key: 'rmCategory', label: 'RM Category' },
  { key: 'reportingCategory', label: 'Reporting Category' },
  { key: 'color', label: 'Color' },
  { key: 'unit', label: 'Unit' },
  { key: 'rmsStatus', label: 'RMS Status' },
  { key: 'status', label: 'Status' },
];
const COLS_KEY = 'titans.priceLevel.hiddenCols';

const SORTS = [
  { value: '', label: 'Default order' },
  { value: 'code:asc', label: 'RM Code (A–Z)' },
  { value: 'code:desc', label: 'RM Code (Z–A)' },
  { value: 'name:asc', label: 'Item name (A–Z)' },
  { value: 'name:desc', label: 'Item name (Z–A)' },
  { value: 'rate:asc', label: 'Price (low to high)' },
  { value: 'rate:desc', label: 'Price (high to low)' },
];

function readHiddenCols(): ColKey[] {
  try {
    const v = JSON.parse(localStorage.getItem(COLS_KEY) || '[]') as unknown;
    return Array.isArray(v) ? (v.filter((x) => OPTIONAL_COLS.some((c) => c.key === x)) as ColKey[]) : [];
  } catch {
    return [];
  }
}

function writeHiddenCols(cols: ColKey[]) {
  try {
    localStorage.setItem(COLS_KEY, JSON.stringify(cols));
  } catch {
    /* storage unavailable – preference lasts for this visit only */
  }
}

/** Fetches every row of a level (the API pages at most 500 rows). */
export async function fetchAllLevelRows(levelId: number): Promise<LevelPricesResponse> {
  let page = 1;
  const first = await api.get<LevelPricesResponse>(`/api/price-levels/${levelId}/prices${qs({ page, pageSize: 500 })}`);
  const rows = [...first.rows];
  while (rows.length < first.total) {
    page++;
    const next = await api.get<LevelPricesResponse>(`/api/price-levels/${levelId}/prices${qs({ page, pageSize: 500 })}`);
    if (!next.rows.length) break;
    rows.push(...next.rows);
  }
  return { ...first, rows };
}

interface Edit {
  value: string;
  orig: number;
}

export function PriceLevelPage({ category }: { category: LevelCategory }) {
  const { masters, refresh } = useMasters();
  const toast = useToast();
  const confirm = useConfirm();
  const canEdit = usePerms().rates;

  const [levels, setLevels] = useState<PriceLevel[] | null>(null);
  const [levelsError, setLevelsError] = useState<string | null>(null);
  const [levelId, setLevelId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 350);
  const [group, setGroup] = useState('');
  const [sort, setSort] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [data, setData] = useState<LevelPricesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<{ kind: 'add' } | { kind: 'rename'; level: PriceLevel } | null>(null);
  const [hidden, setHidden] = useState<ColKey[]>(readHiddenCols);
  const [colsOpen, setColsOpen] = useState(false);
  const colsBtn = useRef<HTMLButtonElement | null>(null);
  const seq = useRef(0);

  // Reset to page 1 when the debounced search changes.
  const [prevQ, setPrevQ] = useState(q);
  if (prevQ !== q) {
    setPrevQ(q);
    setPage(1);
  }

  const loadLevels = useCallback(
    async (select?: number) => {
      try {
        const rows = await api.get<PriceLevel[]>(`/api/price-levels${qs({ category })}`);
        rows.sort((a, b) => (a.isDefault === b.isDefault ? a.name.localeCompare(b.name) : a.isDefault ? -1 : 1));
        setLevels(rows);
        setLevelsError(null);
        setLevelId((cur) => {
          const want = select ?? cur;
          return want != null && rows.some((l) => l.id === want) ? want : (rows[0]?.id ?? null);
        });
      } catch (e) {
        setLevelsError(errorMessage(e));
        toast.error(errorMessage(e));
      }
    },
    [category, toast],
  );

  useEffect(() => {
    void loadLevels();
  }, [loadLevels]);

  useEffect(() => {
    if (levelId == null) {
      setLoading(false);
      return;
    }
    const id = ++seq.current;
    setLoading(true);
    void (async () => {
      try {
        const res = await api.get<LevelPricesResponse>(`/api/price-levels/${levelId}/prices${qs({ q, group, sort, page, pageSize })}`);
        if (id !== seq.current) return;
        if (!res.rows.length && res.total > 0 && page > 1) {
          setPage(Math.max(1, Math.ceil(res.total / pageSize)));
          return;
        }
        setData(res);
        setRowsError(null);
      } catch (e) {
        if (id !== seq.current) return;
        setRowsError(errorMessage(e));
        toast.error(errorMessage(e));
      } finally {
        if (id === seq.current) setLoading(false);
      }
    })();
  }, [levelId, q, group, sort, page, pageSize, reloadKey, toast]);

  const groups = useMemo(() => {
    if (category === 'glass') return [...new Set(masters.glasses.map((g) => (g.kind === 'mesh' ? 'Mesh' : 'Glazing')))];
    const cats: string[] = category === 'profile' ? ['profile', 'aluminium'] : [category];
    return [...new Set(masters.items.filter((i) => cats.includes(i.category)).map((i) => (i.category === 'aluminium' ? 'Aluminium Profiles' : i.grp)))];
  }, [category, masters.glasses, masters.items]);

  const changed = useMemo(() => Object.entries(edits).filter(([, e]) => parseNum(e.value) !== e.orig), [edits]);
  const invalid = changed.filter(([, e]) => !isValidRate(e.value));
  const dirty = changed.length > 0;
  useDirty(dirty);

  const level = levels?.find((l) => l.id === levelId) ?? null;
  const show = (c: ColKey) => !hidden.includes(c);
  const colCount = 3 + OPTIONAL_COLS.filter((c) => show(c.key)).length;
  const current = data && data.level.id === levelId ? data : null;
  const showSkeleton = levelId != null && (loading || (!current && !rowsError));

  const setEdit = (row: LevelRow, value: string) => setEdits((prev) => ({ ...prev, [row.code]: { value, orig: prev[row.code]?.orig ?? row.rate } }));

  async function guardDiscard(): Promise<boolean> {
    if (!dirty) return true;
    return confirm({
      title: 'Discard unsaved prices?',
      message: `You have ${changed.length} price change${changed.length > 1 ? 's' : ''} that have not been saved. Discard them?`,
      confirmText: 'Discard changes',
      danger: true,
    });
  }

  async function selectLevel(id: number) {
    if (id === levelId) return;
    if (!(await guardDiscard())) return;
    setEdits({});
    setPage(1);
    setLevelId(id);
  }

  async function save() {
    if (!level || !dirty) return;
    if (invalid.length) {
      toast.error(`Enter a valid price (0 or more) for ${invalid.map(([c]) => c).slice(0, 5).join(', ')}${invalid.length > 5 ? '…' : ''}`);
      return;
    }
    setSaving(true);
    try {
      await api.put(`/api/price-levels/${level.id}/prices`, { rates: Object.fromEntries(changed.map(([code, e]) => [code, parseNum(e.value) ?? 0])) });
      setEdits({});
      setReloadKey((k) => k + 1);
      toast.success('Price level updated');
      await refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function removeLevel(l: PriceLevel) {
    const ok = await confirm({
      title: 'Delete price level?',
      message: (
        <>
          <b>{l.name}</b> and its prices will be deleted. Quotes that use it fall back to the default {CATEGORY_LABEL[category].toLowerCase()} price level.
        </>
      ),
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/api/price-levels/${l.id}`);
      if (l.id === levelId) setEdits({});
      // The active level falls back to the default when it was the one deleted.
      await loadLevels();
      await refresh();
      toast.success(`${l.name} deleted`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const toggleCol = (c: ColKey, on: boolean) => {
    const next = on ? hidden.filter((h) => h !== c) : [...hidden, c];
    setHidden(next);
    writeHiddenCols(next);
  };

  const rows = current?.rows ?? [];

  return (
    <SubPage
      fill
      actions={
        canEdit && (
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => setModal({ kind: 'add' })} disabled={!levels}>
            Add price level
          </Button>
        )
      }
      footer={
        canEdit &&
        level && (
          <>
            <UnsavedNote count={changed.length} noun="price change" />
            <Button variant="ghost" icon={<RotateCcw size={14} />} onClick={() => setEdits({})} disabled={!dirty || saving}>
              Reset
            </Button>
            <Button variant="primary" icon={<Save size={14} />} onClick={() => void save()} loading={saving} disabled={!dirty}>
              Save
            </Button>
          </>
        )
      }
    >
      {!canEdit && <ReadOnlyNote>You can view prices. Ask an administrator for the “Edit raw material and glass price levels” permission to change them.</ReadOnlyNote>}
      <div className="adm-pl">
        <aside className="card adm-pl-levels" aria-label="Price levels">
          <div className="adm-pl-levels-head">
            Price levels
            {levels && <span className="tab-count">{levels.length}</span>}
          </div>
          <div className="adm-pl-list">
            {!levels && !levelsError && Array.from({ length: 3 }, (_, i) => <span key={i} className="skeleton adm-skel adm-pl-skel" />)}
            {levelsError && !levels && (
              <div className="adm-cell-sub" style={{ padding: 8 }}>
                Could not load levels.{' '}
                <button type="button" className="adm-linkbtn" onClick={() => void loadLevels()}>
                  Retry
                </button>
              </div>
            )}
            {levels?.map((l) => (
              <div key={l.id} className={`adm-pl-level ${l.id === levelId ? 'active' : ''}`}>
                <button type="button" className="adm-pl-level-name" onClick={() => void selectLevel(l.id)} aria-current={l.id === levelId ? 'true' : undefined} title={l.name}>
                  {l.name}
                </button>
                {l.isDefault ? (
                  <Badge tone="primary">Default</Badge>
                ) : (
                  canEdit && (
                    <Kebab
                      label={`Actions for ${l.name}`}
                      items={[
                        { label: 'Rename', icon: <Pencil size={14} />, onClick: () => setModal({ kind: 'rename', level: l }) },
                        { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => void removeLevel(l) },
                      ]}
                    />
                  )
                )}
              </div>
            ))}
            {levels && !levels.length && <div className="adm-cell-sub" style={{ padding: 8 }}>No price levels yet.</div>}
          </div>
        </aside>
        <section className="list-card adm-pl-main">
          <div className="adm-pl-heading">
            <h2 className="ellipsis">{level?.name ?? (levels ? 'No price level' : ' ')}</h2>
            {level?.isDefault && <Badge tone="primary">Default</Badge>}
            {current && <span className="adm-toolbar-note">{current.total} raw materials</span>}
          </div>
          <div className="toolbar adm-toolbar">
            <SearchBox value={search} onChange={setSearch} placeholder="Search code, name or colour" />
            <Select
              sm
              value={group}
              onChange={(e) => {
                setGroup(e.target.value);
                setPage(1);
              }}
              style={{ width: 200 }}
              aria-label="Filter by reporting category"
            >
              <option value="">All reporting categories</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
            <Select
              sm
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
              style={{ width: 175 }}
              aria-label="Sort by"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.value ? `Sort: ${s.label}` : 'Sort by: Default'}
                </option>
              ))}
            </Select>
            <div className="adm-toolbar-spacer" />
            <IconButton ref={colsBtn} tip="Column settings" tipPos="left" active={colsOpen} onClick={() => setColsOpen((o) => !o)}>
              <Columns3 size={16} />
            </IconButton>
            <Popover open={colsOpen} onClose={() => setColsOpen(false)} anchor={colsBtn} placement="bottom-end" className="adm-cols-pop">
              <div className="adm-cols-title">Show columns</div>
              {OPTIONAL_COLS.map((c) => (
                <Checkbox key={c.key} checked={show(c.key)} onChange={(v) => toggleCol(c.key, v)} label={c.label} />
              ))}
              <div className="adm-cell-sub" style={{ marginTop: 6 }}>
                RM Code, Item Name and Price Level are always shown.
              </div>
            </Popover>
          </div>
          <div className="table-wrap">
            <table className="table adm-rate-table adm-pl-table">
              <thead>
                <tr>
                  {show('brand') && <th>Brand</th>}
                  {show('rmCategory') && <th>RM Category</th>}
                  {show('reportingCategory') && <th>Reporting Category</th>}
                  <th>RM Code</th>
                  <th>Item Name</th>
                  {show('color') && <th>Color</th>}
                  {show('unit') && <th>Unit</th>}
                  <th className="num" style={{ width: 150 }}>
                    Price Level (₹)
                  </th>
                  {show('rmsStatus') && <th>RMS Status</th>}
                  {show('status') && <th>Status</th>}
                </tr>
              </thead>
              <tbody>
                {showSkeleton && <SkeletonRows rows={10} cols={colCount} />}
                {!showSkeleton &&
                  rows.map((r) => {
                    const e = edits[r.code];
                    const rowDirty = !!e && parseNum(e.value) !== e.orig;
                    return (
                      <tr key={r.code} className={rowDirty ? 'adm-dirty' : ''}>
                        {show('brand') && <td className="nowrap">{r.brand}</td>}
                        {show('rmCategory') && <td className="nowrap">{r.rmCategory}</td>}
                        {show('reportingCategory') && <td className="nowrap muted">{r.reportingCategory}</td>}
                        <td className="adm-mono nowrap">{r.code}</td>
                        <td>
                          <span className="adm-cell-main">{r.name}</span>
                          {!level?.isDefault && r.rate !== r.defaultRate && !rowDirty && <div className="adm-cell-sub">Default {inr(r.defaultRate)}</div>}
                        </td>
                        {show('color') && <td className="fs-12">{r.color || <span className="muted">—</span>}</td>}
                        {show('unit') && <td className="nowrap">{r.unit}</td>}
                        <td className="num">
                          <RateInput value={e?.value ?? numStr(r.rate)} onChange={(v) => setEdit(r, v)} dirty={rowDirty} label={`Price for ${r.code}`} disabled={!canEdit || saving} />
                        </td>
                        {show('rmsStatus') && <td>{r.rmsStatus || 'Active'}</td>}
                        {show('status') && <td>{rowDirty ? <span className="adm-chip adm-chip-edited">Edited</span> : <span className="adm-chip adm-chip-saved">Saved</span>}</td>}
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            {!showSkeleton && rowsError && (
              <Empty title="Could not load prices">
                <Button size="sm" onClick={() => setReloadKey((k) => k + 1)}>
                  Retry
                </Button>
              </Empty>
            )}
            {!showSkeleton && !rowsError && current && rows.length === 0 && (
              <Empty title={q || group ? 'No raw materials match your filters' : 'No raw materials in this category'} icon={<Tags size={30} strokeWidth={1.4} />} />
            )}
            {levels && !levels.length && <Empty title="No price levels" />}
          </div>
          {current && current.total > 0 && (
            <Pagination
              total={current.total}
              page={page}
              pageSize={pageSize}
              sizes={[25, 50, 100, 200]}
              onPage={setPage}
              onPageSize={(s) => {
                setPageSize(s);
                setPage(1);
              }}
            />
          )}
        </section>
      </div>
      {modal?.kind === 'add' && levels && (
        <AddLevelModal
          category={category}
          existing={levels.map((l) => l.name.toLowerCase())}
          onClose={() => setModal(null)}
          onCreated={async (created) => {
            setModal(null);
            // Open the new level unless the user wants to keep unsaved edits on the current one.
            const openNew = await guardDiscard();
            if (openNew) {
              setEdits({});
              setPage(1);
            }
            await loadLevels(openNew ? created.id : undefined);
            await refresh();
            toast.success(`${created.name} created`);
          }}
        />
      )}
      {modal?.kind === 'rename' && levels && (
        <RenameLevelModal
          level={modal.level}
          existing={levels.filter((l) => l.id !== modal.level.id).map((l) => l.name.toLowerCase())}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            await loadLevels();
            await refresh();
            setReloadKey((k) => k + 1);
            toast.success('Price level renamed');
          }}
        />
      )}
    </SubPage>
  );
}

function AddLevelModal({
  category,
  existing,
  onClose,
  onCreated,
}: {
  category: LevelCategory;
  existing: string[];
  onClose: () => void;
  onCreated: (l: PriceLevel) => Promise<void>;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [adjust, setAdjust] = useState('0');
  const [errors, setErrors] = useState<{ name?: string; adjust?: string }>({});
  const [saving, setSaving] = useState(false);
  const pct = parseNum(adjust);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const e: typeof errors = {};
    const n = name.trim();
    if (!n) e.name = 'Price level name is required';
    else if (existing.includes(n.toLowerCase())) e.name = 'A price level with this name already exists';
    if (pct === null || pct < -100 || pct > 500) e.adjust = 'Enter a percentage between -100 and 500';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const created = await api.post<PriceLevel>('/api/price-levels', { category, name: n, adjustPct: pct });
      await onCreated(created);
    } catch (err) {
      toast.error(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Add price level"
      closeOnBackdrop={false}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="adm-level-form" loading={saving}>
            Add price level
          </Button>
        </>
      }
    >
      <form id="adm-level-form" className="col gap-12" onSubmit={(e) => void submit(e)} noValidate>
        <Field label="Price level name" required error={errors.name} htmlFor="pl-name">
          <Input
            id="pl-name"
            value={name}
            autoFocus
            maxLength={80}
            invalid={!!errors.name}
            placeholder="e.g. 25% Discounted Price"
            onChange={(e) => {
              setName(e.target.value);
              setErrors((p) => ({ ...p, name: undefined }));
            }}
          />
        </Field>
        <Field
          label="Start from the default prices adjusted by (%)"
          required
          error={errors.adjust}
          hint={pct === null || pct === 0 ? 'Use a negative number for a discount, e.g. -25 creates prices 25% below the default level.' : pct < 0 ? `Prices start ${Math.abs(pct)}% below the default level.` : `Prices start ${pct}% above the default level.`}
          htmlFor="pl-adjust"
        >
          <Input
            id="pl-adjust"
            type="number"
            step="0.5"
            min={-100}
            max={500}
            value={adjust}
            invalid={!!errors.adjust}
            onWheel={(e) => e.currentTarget.blur()}
            onChange={(e) => {
              setAdjust(e.target.value);
              setErrors((p) => ({ ...p, adjust: undefined }));
            }}
          />
        </Field>
        <div className="adm-cell-sub">Every {CATEGORY_LABEL[category].toLowerCase()} raw material gets a price in the new level. You can edit individual prices afterwards.</div>
      </form>
    </Modal>
  );
}

function RenameLevelModal({ level, existing, onClose, onSaved }: { level: PriceLevel; existing: string[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [name, setName] = useState(level.name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const n = name.trim();
    if (!n) return setError('Name is required');
    if (existing.includes(n.toLowerCase())) return setError('A price level with this name already exists');
    if (n === level.name) return onClose();
    setSaving(true);
    try {
      await api.put(`/api/price-levels/${level.id}`, { name: n });
      await onSaved();
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
      title="Rename price level"
      closeOnBackdrop={false}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="adm-level-rename" loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <form id="adm-level-rename" onSubmit={(e) => void submit(e)} noValidate>
        <Field label="Price level name" required error={error} htmlFor="pl-rename">
          <Input
            id="pl-rename"
            value={name}
            autoFocus
            maxLength={80}
            invalid={!!error}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
          />
        </Field>
      </form>
    </Modal>
  );
}
