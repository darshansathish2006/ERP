import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDown, FileText, Filter, Lightbulb, LightbulbOff, RefreshCw, ThumbsUp } from 'lucide-react';
import { api, errorMessage, qs } from '../lib/api';
import { dateFmt, grouped2, inr, initials, relativeTime } from '../lib/format';
import { useMasters } from '../context/MastersContext';
import { useToast } from '../components/feedback';
import { BoxTabs, Button, Empty, Field, IconButton, Input, PageLoading, Select } from '../components/ui';
import { Popover } from '../components/overlay';

interface DashboardData {
  range: { start: string | null; end: string | null };
  kpis: Record<'created' | 'quoted' | 'won' | 'lost', { count: number; value: number }>;
  salesAnalytics: { label: string; created: number; won: number; lost: number; quoted: number }[];
  salesLocation: { location: string; qty: number; value: number }[];
  lostReasons: { total: number; rows: { reason: string; count: number; value: number }[] };
  sources: { source: string; count: number; value: number }[];
  funnel: { label: string; count: number; value: number; pct: number }[];
  stages: { stage: string; count: number; value: number }[];
  teamsOfMonth: { team: string; topDeal: string | null; topDealValue: number; members: number; topMember: string; count: number; value: number }[];
  teamsPerformance: { executive: string; created: number; createdValue: number; won: number; wonValue: number; lost: number; lostValue: number }[];
  smartQuotes: {
    generated: number;
    active: number;
    won: number;
    lost: number;
    recentlyGenerated: SmartRow[];
    recentlyViewed: SmartRow[];
    topViews: SmartRow[];
  };
}
interface SmartRow {
  quoteId: number;
  opportunity: string;
  value: number;
  generatedAt: string;
  lastViewedAt: string | null;
  views: number;
  status: string;
}

// Validated categorical palette (legend + gaps + tooltip provide secondary encoding).
const SERIES = { created: '#4c8df6', won: '#1f8a5b', lost: '#f2849a', quoted: '#39b3b6' };
const SERIES_ORDER = ['Opportunities Created', 'Opportunities Won', 'Opportunities Lost', 'Newly Quoted'];
const seriesRank = (item: { value?: unknown; name?: unknown }) => SERIES_ORDER.indexOf(String(item.value ?? item.name ?? ''));
const SOURCE_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#9aa3ad'];
const FUNNEL_COLORS = ['#5598e7', '#2a78d6', '#1c5cab'];

const RANGES = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'month', label: 'This month' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'year', label: 'This year' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom range' },
];

const compactInr = (v: number) => {
  if (Math.abs(v) >= 1e7) return `₹${(v / 1e7).toFixed(1)}Cr`;
  if (Math.abs(v) >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`;
  if (Math.abs(v) >= 1e3) return `₹${(v / 1e3).toFixed(0)}K`;
  return `₹${v}`;
};

function Kpi({ count, label, value, icon, tone }: { count: number; label: string; value?: number; icon: React.ReactNode; tone: string }) {
  return (
    <div className="card dash-kpi">
      <div>
        <div className="dash-kpi-count">{count}</div>
        <div className="dash-kpi-label">{label}</div>
        {value !== undefined && value > 0 && <div className="dash-kpi-value">{inr(value)}</div>}
      </div>
      <div className={`dash-kpi-icon tone-${tone}`}>{icon}</div>
    </div>
  );
}

function Panel({ title, action, children, className = '' }: { title: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card dash-panel ${className}`}>
      <div className="card-header">
        <div className="card-title">{title}</div>
        {action}
      </div>
      <div className="dash-panel-body">{children}</div>
    </section>
  );
}

export default function DashboardPage() {
  const { masters } = useMasters();
  const toast = useToast();
  const navigate = useNavigate();
  const [range, setRange] = useState('30d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [managedBy, setManagedBy] = useState('');
  const [period, setPeriod] = useState<'weekly' | 'monthly' | 'yearly'>('weekly');
  const [locBy, setLocBy] = useState<'city' | 'state'>('city');
  const [smartTab, setSmartTab] = useState<'recentlyGenerated' | 'recentlyViewed' | 'topViews'>('recentlyGenerated');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLButtonElement | null>(null);
  const [draft, setDraft] = useState({ range, from, to, managedBy });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<DashboardData>(`/api/dashboard${qs({ range, from: range === 'custom' ? from : '', to: range === 'custom' ? to : '', managedBy, period, locBy })}`);
      setData(d);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [range, from, to, managedBy, period, locBy, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const sourceData = useMemo(() => {
    if (!data) return [];
    const top = data.sources.slice(0, 5);
    const rest = data.sources.slice(5);
    const out = top.map((s) => ({ name: s.source, count: s.count, value: s.value }));
    if (rest.length) out.push({ name: 'Other', count: rest.reduce((a, b) => a + b.count, 0), value: rest.reduce((a, b) => a + b.value, 0) });
    return out;
  }, [data]);

  const rangeLabel = RANGES.find((r) => r.value === range)?.label ?? '';

  if (!data && loading) return <PageLoading />;
  if (!data) {
    return (
      <div className="page">
        <Empty title="Dashboard could not be loaded">
          <Button variant="primary" onClick={() => void load()}>
            Retry
          </Button>
        </Empty>
      </div>
    );
  }

  const funnelMax = Math.max(1, ...data.funnel.map((f) => f.count));
  const smartRows = data.smartQuotes[smartTab];

  return (
    <div className="page dash">
      <div className="page-head">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="muted fs-12">
            {range === 'custom' ? `${dateFmt(from)} – ${dateFmt(to)}` : rangeLabel}
            {managedBy ? ` · ${managedBy}` : ' · All executives'}
          </div>
        </div>
        <div className="row">
          {loading && <span className="spinner" />}
          <IconButton tip="Refresh" onClick={() => void load()}>
            <RefreshCw size={15} />
          </IconButton>
          <span className="avatar avatar-teal" title={managedBy || 'All executives'}>
            {managedBy ? initials(managedBy) : 'A'}
          </span>
          <Button
            ref={filterRef}
            data-tour="dash-filter"
            size="sm"
            icon={<Filter size={13} />}
            onClick={() => {
              setDraft({ range, from, to, managedBy });
              setFilterOpen((o) => !o);
            }}
          >
            Filter
          </Button>
          <Popover open={filterOpen} onClose={() => setFilterOpen(false)} anchor={filterRef} placement="bottom-end">
            <div className="col gap-12" style={{ padding: 16, width: 300 }}>
              <Field label="Date range">
                <Select value={draft.range} onChange={(e) => setDraft((d) => ({ ...d, range: e.target.value }))}>
                  {RANGES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              </Field>
              {draft.range === 'custom' && (
                <div className="row">
                  <Field label="From" className="grow">
                    <Input type="date" value={draft.from} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} />
                  </Field>
                  <Field label="To" className="grow">
                    <Input type="date" value={draft.to} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} />
                  </Field>
                </div>
              )}
              <Field label="Managed by">
                <Select value={draft.managedBy} onChange={(e) => setDraft((d) => ({ ...d, managedBy: e.target.value }))}>
                  <option value="">All executives</option>
                  {masters.users.map((u) => (
                    <option key={u.id} value={u.name}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <Button
                  size="sm"
                  onClick={() => {
                    setDraft({ range: '30d', from: '', to: '', managedBy: '' });
                  }}
                >
                  Reset
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={draft.range === 'custom' && (!draft.from || !draft.to || draft.to < draft.from)}
                  onClick={() => {
                    setRange(draft.range);
                    setFrom(draft.from);
                    setTo(draft.to);
                    setManagedBy(draft.managedBy);
                    setFilterOpen(false);
                  }}
                >
                  Apply
                </Button>
              </div>
            </div>
          </Popover>
        </div>
      </div>

      <div className="dash-kpis" data-tour="dash-kpis">
        <Kpi count={data.kpis.created.count} label="Created opportunity" value={data.kpis.created.value} icon={<Lightbulb size={20} />} tone="blue" />
        <Kpi count={data.kpis.quoted.count} label="Newly quoted" value={data.kpis.quoted.value} icon={<FileText size={20} />} tone="teal" />
        <Kpi count={data.kpis.won.count} label="Won opportunity" value={data.kpis.won.value} icon={<ThumbsUp size={20} />} tone="green" />
        <Kpi count={data.kpis.lost.count} label="Lost opportunity" value={data.kpis.lost.value} icon={<LightbulbOff size={20} />} tone="red" />
      </div>

      <div className="dash-grid dash-grid-2-1" data-tour="dash-analytics">
        <Panel
          title="Sales analytics"
          action={
            <Select sm style={{ width: 120 }} value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} aria-label="Period">
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </Select>
          }
        >
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.salesAnalytics} margin={{ top: 8, right: 8, left: 12, bottom: 4 }} barGap={2} barCategoryGap="22%">
                <CartesianGrid vertical={false} stroke="#eceff3" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={{ stroke: '#d1d5db' }} interval="preserveStartEnd" />
                <YAxis tickFormatter={compactInr} tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} width={64} />
                <Tooltip formatter={(v) => inr(Number(v))} itemSorter={(item) => SERIES_ORDER.indexOf(String(item.name))} cursor={{ fill: 'rgba(21,101,192,0.06)' }} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                <Legend itemSorter={seriesRank} iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11.5, paddingTop: 4 }} verticalAlign="top" height={28} />
                <Bar dataKey="created" name="Opportunities Created" fill={SERIES.created} radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar dataKey="won" name="Opportunities Won" fill={SERIES.won} radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar dataKey="lost" name="Opportunities Lost" fill={SERIES.lost} radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar dataKey="quoted" name="Newly Quoted" fill={SERIES.quoted} radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel
          title="Sales location"
          action={
            <Select sm style={{ width: 100 }} value={locBy} onChange={(e) => setLocBy(e.target.value as 'city' | 'state')} aria-label="Group by">
              <option value="city">City</option>
              <option value="state">State</option>
            </Select>
          }
        >
          {data.salesLocation.length === 0 ? (
            <Empty />
          ) : (
            <div className="table-wrap" style={{ maxHeight: 300 }}>
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th>Opportunity location</th>
                    <th className="num">Quantity</th>
                    <th className="num">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {data.salesLocation.map((r) => (
                    <tr key={r.location}>
                      <td>{r.location}</td>
                      <td className="num">{r.qty}</td>
                      <td className="num">{inr(r.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <div className="dash-grid dash-grid-3" data-tour="dash-insights">
        <Panel
          title={
            <span>
              Lost opportunity reasons
              <span className="dash-sub text-danger">
                <ArrowDown size={12} /> {inr(data.lostReasons.total)}
              </span>
            </span>
          }
        >
          {data.lostReasons.rows.length === 0 ? (
            <Empty />
          ) : (
            <div className="col gap-12">
              {data.lostReasons.rows.map((r) => {
                const pct = data.lostReasons.total ? (r.value / data.lostReasons.total) * 100 : 0;
                return (
                  <div key={r.reason} title={`${r.reason}: ${r.count} · ${inr(r.value)}`}>
                    <div className="row fs-12" style={{ justifyContent: 'space-between' }}>
                      <span>{r.reason}</span>
                      <span className="muted">
                        {r.count} · {inr(r.value, 0)}
                      </span>
                    </div>
                    <div className="dash-meter">
                      <span style={{ width: `${Math.max(2, pct)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
        <Panel title="Opportunity source">
          {sourceData.length === 0 ? (
            <Empty />
          ) : (
            <div className="row" style={{ alignItems: 'center' }}>
              <div style={{ width: 170, height: 170, flex: 'none' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={sourceData} dataKey="count" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={sourceData.length > 1 ? 2 : 0} stroke="#fff" strokeWidth={2} isAnimationActive={false}>
                      {sourceData.map((s, i) => (
                        <Cell key={s.name} fill={SOURCE_COLORS[i]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v, _n, p) => [`${v} (${inr((p?.payload as { value: number }).value, 0)})`, (p?.payload as { name: string }).name]} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="col gap-4 grow">
                {sourceData.map((s, i) => (
                  <div key={s.name} className="row fs-12" style={{ justifyContent: 'space-between' }}>
                    <span className="row gap-4">
                      <span className="dash-swatch" style={{ background: SOURCE_COLORS[i] }} />
                      {s.name}
                    </span>
                    <span className="muted">{s.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
        <Panel title="Opportunity Conversion Analytics">
          <div className="dash-funnel">
            {data.funnel.map((f, i) => (
              <div key={f.label} className="dash-funnel-row" title={`${f.label}: ${f.count} (${f.pct}%) · ${inr(f.value)}`}>
                <span className="dash-funnel-label">{f.label}</span>
                <div className="dash-funnel-track">
                  <div className="dash-funnel-bar" style={{ width: `${Math.max(12, (f.count / funnelMax) * 100)}%`, background: FUNNEL_COLORS[i] }}>
                    {f.count} - {f.pct}%
                  </div>
                </div>
                <span className="dash-funnel-value">{inr(f.value, 0)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="dash-grid dash-grid-2" data-tour="dash-stages">
        <Panel title="All active opportunities in various stages">
          {data.stages.length === 0 ? (
            <Empty />
          ) : (
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>Opportunity stage</th>
                  <th className="num">Quantity</th>
                  <th className="num">Value</th>
                </tr>
              </thead>
              <tbody>
                {data.stages.map((s) => (
                  <tr key={s.stage} className="clickable" onClick={() => navigate(`/opportunity?stage=${encodeURIComponent(s.stage)}`)}>
                    <td>{s.stage}</td>
                    <td className="num">{s.count}</td>
                    <td className="num">{inr(s.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel title="Teams of the month">
          <table className="table table-compact">
            <thead>
              <tr>
                <th>Team</th>
                <th>Top deal</th>
                <th className="num">Members</th>
                <th>Top member</th>
                <th className="num">Count</th>
                <th className="num">Value</th>
              </tr>
            </thead>
            <tbody>
              {data.teamsOfMonth.map((t) => (
                <tr key={t.team}>
                  <td>{t.team}</td>
                  <td>
                    {t.topDeal}
                    <div className="muted fs-11">{inr(t.topDealValue, 0)}</div>
                  </td>
                  <td className="num">{t.members}</td>
                  <td>{t.topMember}</td>
                  <td className="num">{t.count}</td>
                  <td className="num">{inr(t.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.teamsOfMonth.length === 0 && <Empty />}
        </Panel>
      </div>

      <div className="dash-grid dash-grid-2" data-tour="dash-teams">
        <Panel title="Teams Performance">
          {data.teamsPerformance.length === 0 ? (
            <Empty />
          ) : (
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>Executive name</th>
                  <th>Created opportunity</th>
                  <th>Won opportunity</th>
                  <th>Lost opportunity</th>
                </tr>
              </thead>
              <tbody>
                {data.teamsPerformance.map((p) => (
                  <tr key={p.executive}>
                    <td>{p.executive}</td>
                    <td>
                      {p.created}
                      <div className="muted fs-11">{inr(p.createdValue)}</div>
                    </td>
                    <td>
                      {p.won}
                      {p.won > 0 && <div className="muted fs-11">{inr(p.wonValue)}</div>}
                    </td>
                    <td>
                      {p.lost}
                      {p.lost > 0 && <div className="muted fs-11">{inr(p.lostValue)}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel title="Smart quote analytics">
          <div className="dash-smart-counts">
            <span>
              Generated <b>{data.smartQuotes.generated}</b>
            </span>
            <span className="text-primary">
              Active <b>{data.smartQuotes.active}</b>
            </span>
            <span className="text-success">
              Won <b>{data.smartQuotes.won}</b>
            </span>
            <span className="text-danger">
              Lost <b>{data.smartQuotes.lost}</b>
            </span>
          </div>
          <div className="row mb-8" style={{ justifyContent: 'center' }}>
            <BoxTabs
              value={smartTab}
              onChange={setSmartTab}
              tabs={[
                { value: 'recentlyGenerated', label: 'Recently generated' },
                { value: 'recentlyViewed', label: 'Recently viewed' },
                { value: 'topViews', label: 'Top Views' },
              ]}
            />
          </div>
          <table className="table table-compact">
            <thead>
              <tr>
                <th>Opportunity name</th>
                <th className="num">Value</th>
                <th>Generated date</th>
                <th>Last viewed</th>
                <th className="num">No of Views</th>
              </tr>
            </thead>
            <tbody>
              {smartRows.map((r) => (
                <tr key={`${r.quoteId}-${r.generatedAt}`} className="clickable" onClick={() => navigate(`/quote/${r.quoteId}`)}>
                  <td>{r.opportunity}</td>
                  <td className="num">{grouped2(r.value)}</td>
                  <td>{dateFmt(r.generatedAt)}</td>
                  <td>{r.lastViewedAt ? relativeTime(r.lastViewedAt) : '—'}</td>
                  <td className="num">{r.views}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {smartRows.length === 0 && <Empty />}
        </Panel>
      </div>
    </div>
  );
}
