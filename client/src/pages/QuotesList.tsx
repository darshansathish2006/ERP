import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownUp, CalendarDays, Check, ChevronDown, ChevronRight, Columns3, CopyPlus, ExternalLink, FileText, Filter, MoreVertical, Search, Star } from 'lucide-react';
import { api, errorMessage, qs } from '../lib/api';
import type { Paged, QuoteListRow } from '../lib/types';
import { dateFmt, inr, initials } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MastersContext';
import { useToast } from '../components/feedback';
import { Badge, Button, Checkbox, Empty, Field, IconButton, Input, Pagination, Tabs } from '../components/ui';
import { Drawer, Menu, Modal, Popover } from '../components/overlay';
import { Combobox } from '../components/Combobox';
import { SavedViews } from '../components/SavedViews';

type Tab = 'active' | 'won' | 'lost' | 'all';
type Col = 'defaultQuote' | 'revisionNo' | 'revisionTitle' | 'parent' | 'area' | 'qty' | 'value' | 'stage' | 'managedBy' | 'category' | 'contact' | 'created';
const COLUMNS: { key: Col; label: string; num?: boolean }[] = [
  { key: 'defaultQuote', label: 'Default Quote' },
  { key: 'revisionNo', label: 'Revision No.' },
  { key: 'revisionTitle', label: 'Revision Title' },
  { key: 'parent', label: 'Parent Quote ID' },
  { key: 'area', label: 'Area', num: true },
  { key: 'qty', label: 'Qty', num: true },
  { key: 'value', label: 'Opportunity Value', num: true },
  { key: 'stage', label: 'Deal Stage' },
  { key: 'managedBy', label: 'Managed By' },
  { key: 'category', label: 'Opportunity Category' },
  { key: 'contact', label: 'Contact' },
  { key: 'created', label: 'Created On' },
];
const DEFAULT_COLS: Col[] = ['defaultQuote', 'revisionNo', 'revisionTitle', 'parent', 'area', 'qty', 'value', 'stage', 'managedBy', 'category', 'contact'];
const RANGES = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'year', label: 'This year' },
  { value: 'all', label: 'All time' },
];
const SORTS = [
  { value: 'created_desc', label: 'Newest first' },
  { value: 'updated_desc', label: 'Recently updated' },
  { value: 'value_desc', label: 'Value (high–low)' },
  { value: 'value_asc', label: 'Value (low–high)' },
  { value: 'area_desc', label: 'Area (largest first)' },
  { value: 'name_asc', label: 'Project name (A–Z)' },
];
interface Filters {
  managedBy: string[];
  stage: string[];
  category: string[];
  city: string[];
}
const NO_FILTERS: Filters = { managedBy: [], stage: [], category: [], city: [] };
interface ViewConfig {
  tab: Tab;
  range: string;
  sort: string;
  filters: Filters;
  columns: Col[];
  mine: boolean;
}

export default function QuotesListPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const { masters } = useMasters();
  const [tab, setTab] = useState<Tab>('active');
  const [view, setView] = useState('default');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [range, setRange] = useState('90d');
  const [sort, setSort] = useState('created_desc');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [draft, setDraft] = useState<Filters>(NO_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [columns, setColumns] = useState<Col[]>(DEFAULT_COLS);
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [data, setData] = useState<(Paged<QuoteListRow> & { counts: Record<string, number> }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<number, QuoteListRow[] | 'loading'>>({});
  const [rangeOpen, setRangeOpen] = useState(false);
  const [colsOpen, setColsOpen] = useState(false);
  const [revise, setRevise] = useState<QuoteListRow | null>(null);
  const [reviseTitle, setReviseTitle] = useState('');
  const rangeRef = useRef<HTMLButtonElement | null>(null);
  const colsRef = useRef<HTMLButtonElement | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [tab, debounced, range, sort, filters, pageSize, mine]);

  const load = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const r = await api.get<Paged<QuoteListRow> & { counts: Record<string, number> }>(
        `/api/quotes${qs({ tab, q: debounced, range, sort, page, pageSize, view: mine ? 'mine' : '', ...filters })}`,
      );
      if (my === seq.current) {
        setData(r);
        setExpanded({});
      }
    } catch (e) {
      if (my === seq.current) toast.error(errorMessage(e));
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [tab, debounced, range, sort, page, pageSize, filters, mine, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleExpand = async (row: QuoteListRow) => {
    if (expanded[row.opportunityId]) {
      setExpanded((e) => {
        const next = { ...e };
        delete next[row.opportunityId];
        return next;
      });
      return;
    }
    setExpanded((e) => ({ ...e, [row.opportunityId]: 'loading' }));
    try {
      const list = await api.get<QuoteListRow[]>(`/api/opportunities/${row.opportunityId}/quotes`);
      setExpanded((e) => ({ ...e, [row.opportunityId]: list.filter((q) => q.id !== row.id) }));
    } catch (e) {
      toast.error(errorMessage(e));
      setExpanded((x) => {
        const next = { ...x };
        delete next[row.opportunityId];
        return next;
      });
    }
  };

  const createRevision = async () => {
    if (!revise) return;
    if (!reviseTitle.trim()) return toast.error('Revision title is required');
    try {
      const r = await api.post<{ id: number }>(`/api/quotes/${revise.id}/revise`, { title: reviseTitle.trim(), makeDefault: true });
      toast.success('Revision created');
      setRevise(null);
      navigate(`/quote/${r.id}?tab=design`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const setDefault = async (row: QuoteListRow) => {
    try {
      await api.post(`/api/quotes/${row.id}/set-default`);
      toast.success(`${row.quoteNo} is now the default quote`);
      void load();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const counts = data?.counts || {};
  const visible = COLUMNS.filter((c) => columns.includes(c.key));
  const cell = (r: QuoteListRow, key: Col) => {
    switch (key) {
      case 'defaultQuote':
        return r.quoteNo;
      case 'revisionNo':
        return r.revisionCount > 1 ? <span className="rev-circle">{r.revisionNo}</span> : '';
      case 'revisionTitle':
        return <span className="ellipsis" style={{ maxWidth: 160, display: 'inline-block' }}>{r.revisionTitle}</span>;
      case 'parent':
        return r.parentQuoteNo || '';
      case 'area':
        return `${(r.totalArea || 0).toFixed(3)} Sqft`;
      case 'qty':
        return r.totalQty || 0;
      case 'value':
        return inr(r.grandTotal);
      case 'stage':
        return <span className={`stage-chip ${r.status}`}>{r.stage}</span>;
      case 'managedBy':
        return r.managedBy;
      case 'category':
        return r.category;
      case 'contact':
        return r.contact;
      case 'created':
        return dateFmt(r.createdAt);
    }
  };
  const rowMenu = (r: QuoteListRow) => [
    { label: 'Open quote', icon: <FileText size={15} />, onClick: () => navigate(`/quote/${r.id}`) },
    { label: 'View quotation', icon: <ExternalLink size={15} />, onClick: () => window.open(`/report/${r.id}/quotation`, '_blank') },
    { label: 'Create revision', icon: <CopyPlus size={15} />, onClick: () => { setRevise(r); setReviseTitle(''); } },
    { label: 'Set as default quote', icon: <Star size={15} />, disabled: r.isDefault, onClick: () => void setDefault(r) },
  ];
  const rangeLabel = RANGES.find((r) => r.value === range)?.label;
  const filterCount = Object.values(filters).reduce((s, v) => s + v.length, 0);
  const renderRow = (r: QuoteListRow, child = false) => (
    <tr key={r.id} className={`clickable ${child ? 'child-row' : ''}`} onClick={() => navigate(`/quote/${r.id}`)}>
      <td className="kebab-cell" onClick={(e) => e.stopPropagation()}>
        {!child && r.revisionCount > 1 ? (
          <button className={`expand-btn ${expanded[r.opportunityId] ? 'open' : ''}`} onClick={() => void toggleExpand(r)} aria-label="Show revisions">
            <ChevronRight size={14} />
          </button>
        ) : (
          <span className="expand-spacer" />
        )}
      </td>
      <td className="kebab-cell" onClick={(e) => e.stopPropagation()}>
        <Menu
          placement="bottom-start"
          trigger={({ ref, onClick }) => (
            <IconButton ref={ref} size="sm" onClick={onClick} aria-label="Actions">
              <MoreVertical size={15} />
            </IconButton>
          )}
          items={rowMenu(r)}
        />
      </td>
      <td className="fw-600">
        {child ? <span className="muted fs-12">↳ Rev {r.revisionNo}</span> : r.projectName}
        {r.isDefault && child && <Badge tone="success">Default</Badge>}
      </td>
      {visible.map((c) => (
        <td key={c.key} className={c.num ? 'num' : ''}>
          {cell(r, c.key)}
        </td>
      ))}
      <td />
    </tr>
  );

  return (
    <div className="opp-page">
      <div className="page-head">
        <div className="page-title">Quote</div>
        <Button variant="primary" onClick={() => navigate('/opportunity/create')}>
          Create quote
        </Button>
      </div>
      <div className="opp-tabs">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'active', label: 'Active', count: counts.active ?? 0 },
            { value: 'won', label: 'Won', count: counts.won ?? 0 },
            { value: 'lost', label: 'Lost', count: counts.lost ?? 0 },
            { value: 'all', label: 'All' },
          ]}
        />
      </div>
      <div className="list-card" style={{ flex: 1, minHeight: 0 }}>
        <div className="toolbar">
          <SavedViews<ViewConfig>
            page="quotes"
            builtIns={[{ value: 'default', label: 'Default View' }]}
            value={view}
            onSelectBuiltIn={(v) => {
              setView(v);
              setTab('active');
              setRange('90d');
              setSort('created_desc');
              setFilters(NO_FILTERS);
              setColumns(DEFAULT_COLS);
              setMine(false);
            }}
            onApplyCustom={(c, v) => {
              setView(`custom:${v.id}`);
              setTab(c.tab || 'active');
              setRange(c.range || '90d');
              setSort(c.sort || 'created_desc');
              setFilters({ ...NO_FILTERS, ...(c.filters || {}) });
              setColumns(c.columns?.length ? c.columns : DEFAULT_COLS);
              setMine(!!c.mine);
            }}
            currentConfig={() => ({ tab, range, sort, filters, columns, mine })}
          />
          <div className="grow" />
          <div className="toolbar-search">
            <Search size={14} />
            <input className="input" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search quotes" />
          </div>
          <Button ref={rangeRef} size="sm" icon={<CalendarDays size={13} />} onClick={() => setRangeOpen((o) => !o)}>
            {rangeLabel}
            <ChevronDown size={13} />
          </Button>
          <Popover open={rangeOpen} onClose={() => setRangeOpen(false)} anchor={rangeRef} placement="bottom-end">
            <div style={{ padding: 6, width: 200 }}>
              {RANGES.map((r) => (
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
            </div>
          </Popover>
          <button className="avatar-btn" title={mine ? 'Showing my quotes' : 'Show only my quotes'} onClick={() => setMine((m) => !m)} style={mine ? { boxShadow: '0 0 0 2px var(--primary)' } : undefined}>
            <span className="avatar avatar-teal" style={{ width: 26, height: 26, fontSize: 12 }}>
              {initials(user?.name)}
            </span>
          </button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Filter size={13} />}
            onClick={() => {
              setDraft(filters);
              setFilterOpen(true);
            }}
          >
            Filter{filterCount ? ` (${filterCount})` : ''}
          </Button>
          <Menu
            trigger={({ ref, onClick }) => (
              <Button ref={ref} size="sm" variant="ghost" icon={<ArrowDownUp size={13} />} onClick={onClick}>
                Sort by
                <ChevronDown size={13} />
              </Button>
            )}
            items={SORTS.map((s) => ({ label: s.label, icon: s.value === sort ? <Check size={14} /> : <span style={{ width: 14 }} />, onClick: () => setSort(s.value) }))}
          />
        </div>
        <div className="table-wrap" style={{ flex: 1, position: 'relative' }}>
          <table className="table quote-list-table">
            <thead>
              <tr>
                <th className="kebab-cell" />
                <th className="kebab-cell" />
                <th>Project Name</th>
                {visible.map((c) => (
                  <th key={c.key} className={c.num ? 'num' : ''}>
                    {c.label}
                  </th>
                ))}
                <th style={{ width: 40 }}>
                  <IconButton ref={colsRef} size="sm" tip="Columns" tipPos="left" onClick={() => setColsOpen((o) => !o)}>
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
                      <Button size="xs" onClick={() => setColumns(DEFAULT_COLS)}>
                        Reset to default
                      </Button>
                    </div>
                  </Popover>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && !data
                ? Array.from({ length: 12 }, (_, i) => (
                    <tr key={i}>
                      <td colSpan={visible.length + 4}>
                        <div className="skeleton" style={{ height: 16 }} />
                      </td>
                    </tr>
                  ))
                : data?.rows.map((r) => (
                    <Fragment key={r.id}>
                      {renderRow(r)}
                      {expanded[r.opportunityId] === 'loading' && (
                        <tr className="child-row">
                          <td colSpan={visible.length + 4}>
                            <div className="skeleton" style={{ height: 14 }} />
                          </td>
                        </tr>
                      )}
                      {Array.isArray(expanded[r.opportunityId]) && (expanded[r.opportunityId] as QuoteListRow[]).map((c) => renderRow(c, true))}
                    </Fragment>
                  ))}
            </tbody>
          </table>
          {!loading && data && data.rows.length === 0 && <Empty title="No quotes found" />}
          {loading && data && <div className="loading-overlay" />}
        </div>
        {data && <Pagination total={data.total} page={page} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} />}
      </div>

      <Drawer
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filter quotes"
        footer={
          <>
            <Button onClick={() => setDraft(NO_FILTERS)}>Clear all</Button>
            <Button
              variant="primary"
              onClick={() => {
                setFilters(draft);
                setFilterOpen(false);
              }}
            >
              Apply
            </Button>
          </>
        }
      >
        <div className="col gap-16">
          <Field label="Managed by">
            <Combobox multiple options={masters.users.map((u) => ({ value: u.name, label: u.name }))} value={draft.managedBy} onChange={(v) => setDraft((d) => ({ ...d, managedBy: v }))} placeholder="Everyone" />
          </Field>
          <Field label="Deal stage">
            <Combobox multiple searchable={false} options={masters.stages.map((s) => ({ value: s, label: s }))} value={draft.stage} onChange={(v) => setDraft((d) => ({ ...d, stage: v }))} placeholder="All stages" />
          </Field>
          <Field label="Opportunity category">
            <Combobox multiple searchable={false} options={masters.categories.map((s) => ({ value: s, label: s }))} value={draft.category} onChange={(v) => setDraft((d) => ({ ...d, category: v }))} placeholder="All categories" />
          </Field>
          <Field label="City">
            <Combobox multiple options={masters.cities.map((c) => ({ value: c.name, label: c.name }))} value={draft.city} onChange={(v) => setDraft((d) => ({ ...d, city: v }))} placeholder="All cities" />
          </Field>
        </div>
      </Drawer>
      <Modal
        open={!!revise}
        onClose={() => setRevise(null)}
        title={`Create revision of ${revise?.quoteNo || ''}`}
        size="sm"
        footer={
          <>
            <Button onClick={() => setRevise(null)}>Cancel</Button>
            <Button variant="primary" onClick={createRevision}>
              Create revision
            </Button>
          </>
        }
      >
        <Field label="Revision title" required>
          <Input value={reviseTitle} onChange={(e) => setReviseTitle(e.target.value)} autoFocus placeholder="e.g. Colour change" onKeyDown={(e) => e.key === 'Enter' && void createRevision()} />
        </Field>
      </Modal>
    </div>
  );
}
