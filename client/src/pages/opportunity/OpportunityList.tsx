import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowDownUp,
  CalendarDays,
  Check,
  ChevronDown,
  Columns3,
  Edit3,
  FileText,
  Filter,
  LayoutGrid,
  List,
  MoreVertical,
  PhoneCall,
  Plus,
  RotateCcw,
  Search,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from 'lucide-react';
import { api, errorMessage, qs } from '../../lib/api';
import type { Opportunity, Paged } from '../../lib/types';
import { dateFmt, dateTimeFmt, inr, initials } from '../../lib/format';
import { useMasters } from '../../context/MastersContext';
import { useAuth } from '../../context/AuthContext';
import { useConfirm, useToast } from '../../components/feedback';
import { Badge, Button, Checkbox, Empty, Field, IconButton, Input, Pagination, Spinner, StatusBadge, Tabs } from '../../components/ui';
import { Drawer, Menu, Popover } from '../../components/overlay';
import { Combobox } from '../../components/Combobox';
import { LostDialog } from './LostDialog';
import { TouchpointsDrawer } from './TouchpointsDrawer';
import { SavedViews } from '../../components/SavedViews';

interface OppViewConfig {
  tab: 'active' | 'won' | 'lost' | 'all';
  range: string;
  sort: string;
  filters: Partial<Record<'city' | 'source' | 'stage' | 'managedBy' | 'category', string[]>>;
  columns: ColumnKey[];
  baseView: string;
}

type Tab = 'active' | 'won' | 'lost' | 'all';
type ColumnKey = 'contact' | 'phone' | 'location' | 'account' | 'managedBy' | 'category' | 'value' | 'stage' | 'touchpoint' | 'lastContacted' | 'source' | 'created' | 'code';

const COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: 'contact', label: 'Contact' },
  { key: 'phone', label: 'Contact Number' },
  { key: 'location', label: 'Location' },
  { key: 'account', label: 'Account' },
  { key: 'managedBy', label: 'Managed By' },
  { key: 'category', label: 'Opportunity Category' },
  { key: 'value', label: 'Opportunity Value' },
  { key: 'stage', label: 'Deal Stage' },
  { key: 'touchpoint', label: 'Touchpoint' },
  { key: 'lastContacted', label: 'Last Contacted On' },
  { key: 'source', label: 'Source' },
  { key: 'code', label: 'Project code' },
  { key: 'created', label: 'Created on' },
];
const DEFAULT_COLUMNS: ColumnKey[] = ['contact', 'phone', 'location', 'account', 'managedBy', 'category', 'value', 'stage', 'touchpoint', 'lastContacted'];
const COLS_KEY = 'titans.oppColumns.v2';

const RANGES = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom range' },
];
const VIEWS = [
  { value: 'default', label: 'Default View' },
  { value: 'mine', label: 'My opportunities' },
  { value: 'quoted', label: 'Quoted opportunities' },
  { value: 'unquoted', label: 'Not yet quoted' },
];
const SORTS = [
  { value: 'created_desc', label: 'Newest first' },
  { value: 'created_asc', label: 'Oldest first' },
  { value: 'updated_desc', label: 'Recently updated' },
  { value: 'name_asc', label: 'Name (A–Z)' },
  { value: 'name_desc', label: 'Name (Z–A)' },
  { value: 'value_desc', label: 'Value (high–low)' },
  { value: 'value_asc', label: 'Value (low–high)' },
];

interface Filters {
  city: string[];
  source: string[];
  stage: string[];
  managedBy: string[];
  category: string[];
}
const EMPTY_FILTERS: Filters = { city: [], source: [], stage: [], managedBy: [], category: [] };

function loadColumns(): ColumnKey[] {
  try {
    const raw = localStorage.getItem(COLS_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as ColumnKey[];
      if (Array.isArray(arr)) return arr.filter((c) => COLUMNS.some((x) => x.key === c));
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_COLUMNS;
}

export default function OpportunityListPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { masters } = useMasters();
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const [tab, setTab] = useState<Tab>('active');
  const [view, setView] = useState('default');
  const [touchFor, setTouchFor] = useState<Opportunity | null>(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [range, setRange] = useState('90d');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [filters, setFilters] = useState<Filters>(() => ({ ...EMPTY_FILTERS, stage: params.get('stage') ? [params.get('stage') as string] : [] }));
  const [draftFilters, setDraftFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sort, setSort] = useState('created_desc');
  const [layout, setLayout] = useState<'list' | 'grid'>('list');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [columns, setColumns] = useState<ColumnKey[]>(loadColumns);
  const [data, setData] = useState<(Paged<Opportunity> & { counts: Record<string, number> }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [lostFor, setLostFor] = useState<Opportunity | null>(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [colsOpen, setColsOpen] = useState(false);
  const rangeRef = useRef<HTMLButtonElement | null>(null);
  const colsRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => setPage(1), [tab, view, debounced, range, custom, filters, sort, pageSize]);

  useEffect(() => {
    try {
      localStorage.setItem(COLS_KEY, JSON.stringify(columns));
    } catch {
      /* ignore */
    }
  }, [columns]);

  const reqSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++reqSeq.current;
    setLoading(true);
    try {
      const res = await api.get<Paged<Opportunity> & { counts: Record<string, number> }>(
        `/api/opportunities${qs({
          tab,
          q: debounced,
          range,
          from: range === 'custom' ? custom.from : '',
          to: range === 'custom' ? custom.to : '',
          view: view === 'default' || view.startsWith('custom:') ? '' : view,
          sort,
          page,
          pageSize,
          ...filters,
        })}`,
      );
      if (seq === reqSeq.current) setData(res);
    } catch (e) {
      if (seq === reqSeq.current) toast.error(errorMessage(e));
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }, [tab, debounced, range, custom, view, sort, page, pageSize, filters, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeFilterCount = Object.values(filters).reduce((s, v) => s + v.length, 0);
  const counts = data?.counts || {};
  const tabs = [
    { value: 'active' as Tab, label: 'Active', count: counts.active ?? 0 },
    { value: 'won' as Tab, label: 'Won', count: counts.won ?? 0 },
    { value: 'lost' as Tab, label: 'Lost', count: counts.lost ?? 0 },
    { value: 'all' as Tab, label: 'All', count: (counts.active ?? 0) + (counts.won ?? 0) + (counts.lost ?? 0) },
  ];
  // nothing at all in range and no search/filter: guide the user to create their first opportunity
  const firstRun = !search && activeFilterCount === 0 && tabs[3].count === 0;
  const emptyState = firstRun ? (
    <Empty title="No opportunities yet">
      <span className="muted">Click “Create opportunity” to add your first enquiry. Older enquiries may be outside the selected date range.</span>
      <Button variant="primary" icon={<Plus size={15} />} onClick={() => navigate('/opportunity/create')} style={{ marginTop: 12 }}>
        Create opportunity
      </Button>
    </Empty>
  ) : (
    <Empty title="No opportunities found">
      <span className="muted">Try a different search, date range or filter.</span>
    </Empty>
  );

  const openQuote = (o: Opportunity) => {
    if (o.quoteId) navigate(`/quote/${o.quoteId}`);
    else navigate(`/opportunity/${o.id}/edit`);
  };

  const setStatus = async (o: Opportunity, status: 'won' | 'active') => {
    try {
      await api.post(`/api/opportunities/${o.id}/status`, { status });
      toast.success(status === 'won' ? `${o.projectName} marked as won` : `${o.projectName} reopened`);
      void load();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const remove = async (o: Opportunity) => {
    const ok = await confirm({
      title: 'Delete opportunity',
      message: `Delete "${o.projectName}" (${o.code})? Its quotes, designs and documents will also be deleted. This cannot be undone.`,
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/api/opportunities/${o.id}`);
      toast.success('Opportunity deleted');
      void load();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const rowMenu = (o: Opportunity) => [
    { label: 'Open quote', icon: <FileText size={15} />, onClick: () => openQuote(o) },
    { label: 'Log touchpoint', icon: <PhoneCall size={15} />, onClick: () => setTouchFor(o) },
    { label: 'Edit opportunity', icon: <Edit3 size={15} />, onClick: () => navigate(`/opportunity/${o.id}/edit`) },
    { separator: true },
    ...(o.status === 'active'
      ? [
          { label: 'Mark as won', icon: <ThumbsUp size={15} />, onClick: () => void setStatus(o, 'won') },
          { label: 'Mark as lost', icon: <ThumbsDown size={15} />, onClick: () => setLostFor(o) },
        ]
      : [{ label: 'Reopen opportunity', icon: <RotateCcw size={15} />, onClick: () => void setStatus(o, 'active') }]),
    { separator: true },
    { label: 'Delete', icon: <Trash2 size={15} />, danger: true, onClick: () => void remove(o) },
  ];

  const cityOptions = useMemo(() => masters.cities.map((c) => ({ value: c.name, label: c.name })), [masters.cities]);
  const optionList = (arr: string[]) => arr.map((x) => ({ value: x, label: x }));
  const rangeLabel = range === 'custom' && custom.from && custom.to ? `${dateFmt(custom.from)} – ${dateFmt(custom.to)}` : RANGES.find((r) => r.value === range)?.label;

  const cell = (o: Opportunity, key: ColumnKey) => {
    switch (key) {
      case 'contact':
        return o.contactName;
      case 'phone':
        return `${o.phoneCode} ${o.phone}`;
      case 'location':
        return o.city;
      case 'code':
        return <span className="muted">{o.code}</span>;
      case 'stage':
        return <span className={`stage-chip ${o.status}`}>{o.stage}</span>;
      case 'account':
        return o.account || '';
      case 'category':
        return o.category || '';
      case 'touchpoint':
        return (
          <span
            className={`touch-circle ${o.touchpoints ? '' : 'zero'}`}
            data-tour="opp-touchpoint"
            title="Touchpoints – click to view or log"
            onClick={(e) => {
              e.stopPropagation();
              setTouchFor(o);
            }}
          >
            {o.touchpoints}
          </span>
        );
      case 'lastContacted':
        return o.lastContactedAt ? dateTimeFmt(o.lastContactedAt) : '';
      case 'source':
        return o.source;
      case 'managedBy':
        return o.managedBy;
      case 'value':
        return o.quoteValue ? inr(o.quoteValue) : o.estValue ? <span className="muted">{inr(o.estValue)} (est.)</span> : inr(0);
      case 'created':
        return dateFmt(o.createdAt);
    }
  };

  return (
    <div className="opp-page">
      <div className="page-head">
        <div className="page-title">Opportunity</div>
        <Button variant="primary" icon={<Plus size={15} />} onClick={() => navigate('/opportunity/create')} data-tour="opp-create">
          Create opportunity
        </Button>
      </div>
      <div className="opp-tabs" data-tour="opp-tabs">
        <Tabs tabs={tabs} value={tab} onChange={setTab} className="" />
      </div>
      <div className="list-card" style={{ flex: 1, minHeight: 0 }}>
        <div className="toolbar">
          <SavedViews<OppViewConfig>
            page="opportunity"
            builtIns={VIEWS}
            value={view}
            onSelectBuiltIn={(v) => {
              setView(v);
              setFilters(EMPTY_FILTERS);
              setColumns(DEFAULT_COLUMNS);
            }}
            onApplyCustom={(c, v) => {
              setView(`custom:${v.id}`);
              setTab(c.tab || 'active');
              setRange(c.range || '90d');
              setSort(c.sort || 'created_desc');
              setFilters({ ...EMPTY_FILTERS, ...(c.filters || {}) });
              if (c.columns?.length) setColumns(c.columns);
            }}
            currentConfig={() => ({ tab, range, sort, filters, columns, baseView: view.startsWith('custom:') ? 'default' : view })}
          />
          <div className="grow" />
          <div className="toolbar-search" data-tour="opp-search">
            <Search size={14} />
            <input className="input" placeholder="Search by name, phone, code, city" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search opportunities" />
          </div>
          <Button ref={rangeRef} size="sm" icon={<CalendarDays size={13} />} data-tour="opp-range" onClick={() => setRangeOpen((o) => !o)}>
            {rangeLabel}
            <ChevronDown size={13} />
          </Button>
          <Popover open={rangeOpen} onClose={() => setRangeOpen(false)} anchor={rangeRef} placement="bottom-end">
            <div style={{ padding: 6, width: 240 }}>
              {RANGES.filter((r) => r.value !== 'custom').map((r) => (
                <button
                  key={r.value}
                  className="menu-item"
                  onClick={() => {
                    setRange(r.value);
                    setRangeOpen(false);
                  }}
                >
                  {r.value === range ? <Check size={14} /> : <span style={{ width: 14 }} />}
                  {r.label}
                </button>
              ))}
              <div className="menu-sep" />
              <div className="col" style={{ padding: '6px 10px 10px' }}>
                <span className="fs-12 fw-600">Custom range</span>
                <Input type="date" sm value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} aria-label="From date" />
                <Input type="date" sm value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} aria-label="To date" />
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!custom.from || !custom.to || custom.to < custom.from}
                  onClick={() => {
                    setRange('custom');
                    setRangeOpen(false);
                  }}
                >
                  Apply
                </Button>
              </div>
            </div>
          </Popover>
          <button
            className="avatar-btn"
            data-tour="opp-mine"
            title={view === 'mine' ? 'Showing my opportunities' : 'Show only my opportunities'}
            onClick={() => setView((v) => (v === 'mine' ? 'default' : 'mine'))}
            style={view === 'mine' ? { boxShadow: '0 0 0 2px var(--primary)' } : undefined}
          >
            <span className="avatar avatar-teal" style={{ width: 26, height: 26, fontSize: 12 }}>
              {initials(user?.name)}
            </span>
          </button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Filter size={13} />}
            data-tour="opp-filter"
            onClick={() => {
              setDraftFilters(filters);
              setFilterOpen(true);
            }}
          >
            Filter{activeFilterCount ? ` (${activeFilterCount})` : ''}
          </Button>
          <Menu
            trigger={({ ref, onClick }) => (
              <Button ref={ref} size="sm" variant="ghost" icon={<ArrowDownUp size={13} />} onClick={onClick} data-tour="opp-sort">
                Sort by
                <ChevronDown size={13} />
              </Button>
            )}
            items={SORTS.map((s) => ({ label: s.label, icon: s.value === sort ? <Check size={14} /> : <span style={{ width: 14 }} />, onClick: () => setSort(s.value) }))}
          />
          <div className="seg" data-tour="opp-layout">
            <button className={layout === 'list' ? 'active' : ''} onClick={() => setLayout('list')} aria-label="List view" title="List view">
              <List size={14} />
            </button>
            <button className={layout === 'grid' ? 'active' : ''} onClick={() => setLayout('grid')} aria-label="Grid view" title="Grid view">
              <LayoutGrid size={14} />
            </button>
          </div>
        </div>

        {layout === 'list' ? (
          <div className="table-wrap" style={{ flex: 1 }}>
            <table className="table">
              <thead>
                <tr>
                  <th className="kebab-cell" />
                  <th>Opportunity</th>
                  {COLUMNS.filter((c) => columns.includes(c.key)).map((c) => (
                    <th key={c.key}>{c.label}</th>
                  ))}
                  <th style={{ width: 40 }}>
                    <IconButton ref={colsRef} size="sm" tip="Columns" tipPos="left" data-tour="opp-columns" onClick={() => setColsOpen((o) => !o)}>
                      <Columns3 size={14} />
                    </IconButton>
                    <Popover open={colsOpen} onClose={() => setColsOpen(false)} anchor={colsRef} placement="bottom-end">
                      <div className="col-settings">
                        <span className="fs-12 fw-600">Show columns</span>
                        {COLUMNS.map((c) => (
                          <Checkbox
                            key={c.key}
                            checked={columns.includes(c.key)}
                            onChange={(v) => setColumns((cols) => (v ? COLUMNS.map((x) => x.key).filter((k) => k === c.key || cols.includes(k)) : cols.filter((k) => k !== c.key)))}
                            label={c.label}
                          />
                        ))}
                        <Button size="xs" onClick={() => setColumns(DEFAULT_COLUMNS)}>
                          Reset to default
                        </Button>
                      </div>
                    </Popover>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data?.rows.map((o) => (
                  <tr key={o.id} className="clickable" onClick={() => openQuote(o)} data-tour="opp-row">
                    <td className="kebab-cell" onClick={(e) => e.stopPropagation()} data-tour="opp-row-actions">
                      <Menu
                        placement="bottom-start"
                        trigger={({ ref, onClick }) => (
                          <IconButton ref={ref} size="sm" onClick={onClick} aria-label="Actions">
                            <MoreVertical size={15} />
                          </IconButton>
                        )}
                        items={rowMenu(o)}
                      />
                    </td>
                    <td>
                      <span className="opp-name">{o.projectName}</span>
                      {tab === 'all' && o.status !== 'active' && (
                        <span style={{ marginLeft: 8 }}>
                          <StatusBadge status={o.status} />
                        </span>
                      )}
                    </td>
                    {COLUMNS.filter((c) => columns.includes(c.key)).map((c) => (
                      <td key={c.key}>{cell(o, c.key)}</td>
                    ))}
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && data && data.rows.length === 0 && emptyState}
            {loading && (
              <div className="loading-overlay">
                <Spinner size="lg" />
              </div>
            )}
          </div>
        ) : (
          <div className="opp-grid" style={{ flex: 1, position: 'relative' }}>
            {data?.rows.map((o) => (
              <div key={o.id} className="opp-card" onClick={() => openQuote(o)}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="opp-name ellipsis">{o.projectName}</span>
                  <span onClick={(e) => e.stopPropagation()}>
                    <Menu
                      trigger={({ ref, onClick }) => (
                        <IconButton ref={ref} size="sm" onClick={onClick} aria-label="Actions">
                          <MoreVertical size={15} />
                        </IconButton>
                      )}
                      items={rowMenu(o)}
                    />
                  </span>
                </div>
                <span className="muted fs-12">{o.code}</span>
                <span className="fs-12">
                  {o.contactName} · {o.phoneCode} {o.phone}
                </span>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <Badge tone={o.status === 'won' ? 'success' : o.status === 'lost' ? 'danger' : 'primary'}>{o.stage}</Badge>
                  <span className="fs-12 fw-600">{o.quoteValue ? inr(o.quoteValue) : '—'}</span>
                </div>
                <span className="muted fs-11">
                  {o.city} · {dateFmt(o.createdAt)}
                </span>
              </div>
            ))}
            {!loading && data && data.rows.length === 0 && emptyState}
            {loading && (
              <div className="loading-overlay">
                <Spinner size="lg" />
              </div>
            )}
          </div>
        )}
        {data && <Pagination total={data.total} page={page} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} />}
      </div>

      <Drawer
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filter opportunities"
        footer={
          <>
            <Button onClick={() => setDraftFilters(EMPTY_FILTERS)}>Clear all</Button>
            <Button
              variant="primary"
              onClick={() => {
                setFilters(draftFilters);
                setFilterOpen(false);
              }}
            >
              Apply
            </Button>
          </>
        }
      >
        <div className="filter-section">
          <Field label="City">
            <Combobox multiple options={cityOptions} value={draftFilters.city} onChange={(v) => setDraftFilters((f) => ({ ...f, city: v }))} placeholder="All cities" />
          </Field>
        </div>
        <div className="filter-section">
          <Field label="Opportunity stage">
            <Combobox multiple searchable={false} options={optionList(masters.stages)} value={draftFilters.stage} onChange={(v) => setDraftFilters((f) => ({ ...f, stage: v }))} placeholder="All stages" />
          </Field>
        </div>
        <div className="filter-section">
          <Field label="Opportunity source">
            <Combobox multiple options={optionList(masters.sources)} value={draftFilters.source} onChange={(v) => setDraftFilters((f) => ({ ...f, source: v }))} placeholder="All sources" />
          </Field>
        </div>
        <div className="filter-section">
          <Field label="Managed by">
            <Combobox multiple options={masters.users.map((u) => ({ value: u.name, label: u.name }))} value={draftFilters.managedBy} onChange={(v) => setDraftFilters((f) => ({ ...f, managedBy: v }))} placeholder="Everyone" />
          </Field>
        </div>
        <div className="filter-section">
          <Field label="Opportunity category">
            <Combobox multiple searchable={false} options={optionList(masters.categories)} value={draftFilters.category} onChange={(v) => setDraftFilters((f) => ({ ...f, category: v }))} placeholder="All categories" />
          </Field>
        </div>
      </Drawer>

      <TouchpointsDrawer
        opportunity={touchFor}
        onClose={() => setTouchFor(null)}
        onChanged={() => void load()}
      />
      <LostDialog
        opportunity={lostFor}
        onClose={() => setLostFor(null)}
        onDone={() => {
          setLostFor(null);
          void load();
        }}
      />
    </div>
  );
}
