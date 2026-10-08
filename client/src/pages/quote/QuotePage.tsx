import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Check,
  CopyPlus,
  Star,
  ChevronDown,
  ChevronLeft,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  FolderOpen,
  Info,
  LayoutPanelTop,
  Link2,
  Receipt,
  RotateCcw,
  ShoppingBasket,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { FullQuote } from '../../lib/types';
import { inr } from '../../lib/format';
import { useConfirm, useToast } from '../../components/feedback';
import { Button, Checkbox, Empty, Field, Input, PageLoading } from '../../components/ui';
import { Menu, Modal, Popover } from '../../components/overlay';
import { MaintenanceBanner, TopbarActions } from '../../layout/AppShell';
import { LostDialog } from '../opportunity/LostDialog';
import { DocumentsTab } from './DocumentsTab';
import { DesignTab } from './DesignTab';
import { PricingTab } from './pricing/PricingTab';
import { ReportTab } from './report/ReportTab';
import { Configurator } from '../../configurator/Configurator';

type QuoteTab = 'documents' | 'design' | 'pricing' | 'report';
const TABS: { value: QuoteTab; label: string; icon: React.ReactNode }[] = [
  { value: 'documents', label: 'Documents', icon: <FolderOpen size={14} /> },
  { value: 'design', label: 'Design', icon: <LayoutPanelTop size={14} /> },
  { value: 'pricing', label: 'Pricing', icon: <Receipt size={14} /> },
  { value: 'report', label: 'Report', icon: <FileText size={14} /> },
];

export default function QuotePage() {
  const { id } = useParams();
  const quoteId = Number(id);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<FullQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [cfgSession, setCfgSession] = useState(0);
  const cartRef = useRef<HTMLButtonElement | null>(null);

  const tab = (TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'design') as QuoteTab;
  const cfg = params.get('cfg');

  const reload = useCallback(async () => {
    try {
      const q = await api.get<FullQuote>(`/api/quotes/${quoteId}`);
      setData(q);
      setError(null);
      return q;
    } catch (e) {
      setError(errorMessage(e));
      return null;
    }
  }, [quoteId]);

  useEffect(() => {
    if (!Number.isFinite(quoteId)) {
      setError('Invalid quote');
      return;
    }
    void reload();
  }, [quoteId, reload]);

  useEffect(() => {
    if (data) document.title = `${data.quote.projectName} · ${data.quote.quoteNo} | EvA ERP`;
    return () => {
      document.title = 'EvA ERP | Titans Windows';
    };
  }, [data]);

  const setTab = (t: QuoteTab) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    next.delete('cfg');
    setParams(next, { replace: true });
  };

  const openConfigurator = (designId: number | 'new') => {
    setCfgSession((n) => n + 1);
    const next = new URLSearchParams(params);
    next.set('tab', 'design');
    next.set('cfg', String(designId));
    setParams(next);
  };
  const closeConfigurator = () => {
    const next = new URLSearchParams(params);
    next.delete('cfg');
    setParams(next, { replace: true });
  };

  const smartQuote = async (copyOnly = false) => {
    if (!data) return;
    if (!data.designs.length) {
      toast.warning('Add at least one design before generating a smart quote');
      return;
    }
    setBusy(true);
    try {
      const r = await api.post<{ token: string }>(`/api/quotes/${quoteId}/smart-quote`);
      const url = `${window.location.origin}/sq/${r.token}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success('Smart quote link copied to clipboard');
      } catch {
        toast.info(url, 8000);
      }
      if (!copyOnly) window.open(url, '_blank', 'noopener');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status: 'won' | 'active') => {
    if (!data) return;
    try {
      await api.post(`/api/opportunities/${data.quote.opportunityId}/status`, { status });
      toast.success(status === 'won' ? 'Opportunity marked as won' : 'Opportunity reopened');
      void reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  if (error && !data) {
    return (
      <div className="shell">
        <div className="page">
          <Empty title={error}>
            <Button variant="primary" onClick={() => navigate('/opportunity')}>
              Back to opportunities
            </Button>
          </Empty>
        </div>
      </div>
    );
  }
  if (!data) return <div style={{ height: '100vh' }}><PageLoading /></div>;

  const q = data.quote;
  const status = q.opportunity.status;
  const setDefaultQuote = async () => {
    try {
      await api.post(`/api/quotes/${quoteId}/set-default`);
      toast.success(`${q.quoteNo} is now the default quote`);
      void reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const quickItems = [
    { label: 'View quotation', icon: <ExternalLink size={15} />, onClick: () => window.open(`/report/${quoteId}/quotation`, '_blank') },
    { label: 'Generate smart quote link', icon: <Link2 size={15} />, onClick: () => void smartQuote(false), disabled: busy },
    { label: 'Copy smart quote link', icon: <Copy size={15} />, onClick: () => void smartQuote(true), disabled: busy },
    { label: 'Download reports', icon: <Download size={15} />, onClick: () => setTab('report') },
    { separator: true },
    { label: 'Create revision', icon: <CopyPlus size={15} />, onClick: () => setReviseOpen(true) },
    { label: 'Edit opportunity', icon: <Edit3 size={15} />, onClick: () => navigate(`/opportunity/${q.opportunityId}/edit`) },
    ...(status === 'active'
      ? [
          { label: 'Mark as won', icon: <ThumbsUp size={15} />, onClick: () => void setStatus('won') },
          { label: 'Mark as lost', icon: <ThumbsDown size={15} />, onClick: () => setLostOpen(true) },
        ]
      : [
          {
            label: 'Reopen opportunity',
            icon: <RotateCcw size={15} />,
            onClick: async () => {
              if (await confirm({ title: 'Reopen opportunity', message: `${q.projectName} is currently ${status}. Reopen it as an active opportunity?`, confirmText: 'Reopen' })) void setStatus('active');
            },
          },
        ]),
  ];

  return (
    <div className="shell">
      <MaintenanceBanner />
      <header className="quote-header">
        <button className="btn btn-ghost btn-sm" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/opportunity'))}>
          <ChevronLeft size={15} /> Back
        </button>
        <div className="quote-title" onClick={() => navigate(`/opportunity/${q.opportunityId}/edit`)} title="Edit opportunity">
          <div className="quote-project">
            {q.projectName}
            {status !== 'active' && <span className={`badge ${status === 'won' ? 'badge-success' : 'badge-danger'}`} style={{ marginLeft: 8 }}>{status === 'won' ? 'Won' : 'Lost'}</span>}
          </div>
          <div className="quote-code">
            {q.projectCode} · {q.quoteNo}
          </div>
        </div>
        <Menu
          placement="bottom-start"
          trigger={({ ref, onClick }) => (
            <button ref={ref} className="rev-chip" onClick={onClick} title="Quote revisions">
              Rev {q.revisionNo}
              {q.revisionTitle ? ` · ${q.revisionTitle}` : ''}
              {q.isDefault && <span className="rev-default">Default</span>}
              <ChevronDown size={13} />
            </button>
          )}
          items={[
            { heading: `${q.revisions.length} quote${q.revisions.length === 1 ? '' : 's'} for this opportunity` },
            ...q.revisions.map((r) => ({
              label: (
                <span className="row gap-8" style={{ width: 300 }}>
                  <span className="fw-600">Rev {r.revisionNo}</span>
                  <span className="grow ellipsis">{r.title || r.quoteNo}</span>
                  {r.isDefault && <span className="badge badge-success">Default</span>}
                  <span className="muted fs-11">{inr(r.grandTotal)}</span>
                </span>
              ),
              icon: r.id === q.id ? <Check size={14} /> : <span style={{ width: 14 }} />,
              onClick: () => r.id !== q.id && navigate(`/quote/${r.id}?tab=${tab}`),
            })),
            { separator: true },
            { label: 'Create revision', icon: <CopyPlus size={15} />, onClick: () => setReviseOpen(true) },
            { label: 'Set as default quote', icon: <Star size={15} />, disabled: q.isDefault, onClick: () => void setDefaultQuote() },
          ]}
        />
        <div className="grow" />
        <button ref={cartRef} className="quote-cart" onClick={() => setCartOpen((o) => !o)} aria-label="Quote summary">
          <ShoppingBasket size={18} />
          <span className="col" style={{ gap: 0, alignItems: 'flex-start' }}>
            <b>{inr(data.summary.grand)}</b>
            <span className="row gap-4 fs-11 muted">
              Qty : {data.summary.qty} <Info size={11} />
            </span>
          </span>
        </button>
        <Popover open={cartOpen} onClose={() => setCartOpen(false)} anchor={cartRef} placement="bottom-end">
          <div style={{ width: 380, padding: 14 }}>
            <div className="fw-600 mb-8">Quote summary</div>
            {data.designs.length === 0 ? (
              <div className="muted fs-12">No designs yet.</div>
            ) : (
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th>Design</th>
                    <th className="num">Qty</th>
                    <th className="num">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {data.designs.map((d) => (
                    <tr key={d.id}>
                      <td>
                        {d.ref} <span className="muted">{d.name}</span>
                      </td>
                      <td className="num">{d.qty}</td>
                      <td className="num">{inr(d.totalPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="col gap-4 mt-12 fs-12">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="muted">Total area</span>
                <span>{data.summary.areaSqft.toFixed(3)} sqft</span>
              </div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="muted">Basic value</span>
                <span>{inr(data.summary.basic)}</span>
              </div>
              <div className="row fw-600" style={{ justifyContent: 'space-between' }}>
                <span>Grand total</span>
                <span>{inr(data.summary.grand)}</span>
              </div>
            </div>
          </div>
        </Popover>
        <div className="split-btn">
          <Button variant="success" size="sm" onClick={() => window.open(`/report/${quoteId}/quotation`, '_blank')} disabled={!data.designs.length}>
            Quick quote
          </Button>
          <Menu
            trigger={({ ref, onClick }) => (
              <Button ref={ref} variant="success" size="sm" onClick={onClick} aria-label="More quote actions">
                <ChevronDown size={14} />
              </Button>
            )}
            items={quickItems}
          />
        </div>
        <TopbarActions />
      </header>
      <nav className="quote-tabs">
        {TABS.map((t) => (
          <button key={t.value} className={`quote-tab ${tab === t.value ? 'active' : ''}`} onClick={() => setTab(t.value)}>
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>
      <main className="quote-body">
        {tab === 'documents' && <DocumentsTab quoteId={quoteId} />}
        {tab === 'design' && <DesignTab data={data} reload={reload} onOpenConfigurator={openConfigurator} />}
        {tab === 'pricing' && <PricingTab quoteId={quoteId} summary={data.summary} reloadQuote={reload} />}
        {tab === 'report' && <ReportTab quoteId={quoteId} onOpenPricing={() => setTab('pricing')} />}
      </main>
      {cfg && (
        <Configurator
          key={cfgSession}
          quote={data}
          designId={cfg === 'new' ? null : Number(cfg)}
          onClose={closeConfigurator}
          onSaved={async (designId, close) => {
            await reload();
            if (close) closeConfigurator();
            else if (cfg === 'new') {
              const next = new URLSearchParams(params);
              next.set('cfg', String(designId));
              setParams(next, { replace: true });
            }
          }}
        />
      )}
      <ReviseDialog
        open={reviseOpen}
        quoteNo={q.quoteNo}
        onClose={() => setReviseOpen(false)}
        onCreate={async (title, makeDefault) => {
          try {
            const r = await api.post<{ id: number }>(`/api/quotes/${quoteId}/revise`, { title, makeDefault });
            toast.success('Revision created');
            setReviseOpen(false);
            navigate(`/quote/${r.id}?tab=design`);
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
      <LostDialog
        opportunity={lostOpen ? { id: q.opportunityId, projectName: q.projectName } : null}
        onClose={() => setLostOpen(false)}
        onDone={() => {
          setLostOpen(false);
          void reload();
        }}
      />
    </div>
  );
}

function ReviseDialog({ open, quoteNo, onClose, onCreate }: { open: boolean; quoteNo: string; onClose: () => void; onCreate: (title: string, makeDefault: boolean) => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [makeDefault, setMakeDefault] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setTitle('');
      setMakeDefault(true);
      setError(null);
    }
  }, [open]);
  const submit = async () => {
    if (!title.trim()) {
      setError('Revision title is required');
      return;
    }
    setSaving(true);
    try {
      await onCreate(title.trim(), makeDefault);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create revision"
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={submit}>
            Create revision
          </Button>
        </>
      }
    >
      <div className="col gap-12">
        <p className="muted fs-12">A copy of {quoteNo} with all designs and pricing is created as a new revision. The original quote is kept unchanged.</p>
        <Field label="Revision title" required error={error}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Colour change, Without mesh" autoFocus onKeyDown={(e) => e.key === 'Enter' && void submit()} maxLength={120} />
        </Field>
        <Checkbox checked={makeDefault} onChange={setMakeDefault} label="Make this the default quote of the opportunity" />
      </div>
    </Modal>
  );
}
