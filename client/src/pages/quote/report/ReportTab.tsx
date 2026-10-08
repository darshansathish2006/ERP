import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Calculator,
  ClipboardList,
  CloudDownload,
  Download,
  Eye,
  Factory,
  FileSpreadsheet,
  Link2,
  MoreVertical,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Star,
  StarOff,
  Truck,
  X,
} from 'lucide-react';
import { api, errorMessage } from '../../../lib/api';
import type { ReportData } from '../../../lib/types';
import { inr } from '../../../lib/format';
import { Button, Checkbox, Empty, Field, IconButton, Select, Spinner } from '../../../components/ui';
import { Drawer, Menu, Modal, type MenuItem } from '../../../components/overlay';
import { useToast } from '../../../components/feedback';
import { useAuth } from '../../../context/AuthContext';
import { REPORTS, REPORT_CATEGORIES, canViewReport, getReportDef, isReportKey, type ReportCategory, type ReportDef, type ReportKey } from '../../../reports/registry';

type Format = 'pdf' | 'excel';
type CategoryKey = 'favourites' | ReportCategory;

interface Pending {
  keys: ReportKey[];
  format: Format;
  data: ReportData;
}

const CATEGORY_ICONS: Record<CategoryKey, ReactNode> = {
  favourites: <Star size={16} />,
  basic: <ClipboardList size={16} />,
  quotation: <Calculator size={16} />,
  purchase: <ShoppingCart size={16} />,
  production: <Factory size={16} />,
  dispatch: <Truck size={16} />,
};

const CATEGORIES: { key: CategoryKey; label: string }[] = [{ key: 'favourites', label: 'Favourite Reports' }, ...REPORT_CATEGORIES];

function hasWarnings(d: ReportData): boolean {
  return d.zeroRate.profile.length + d.zeroRate.hardware.length + d.zeroRate.glass.length + d.manualDesigns.length > 0;
}

/** Generate the given reports one after another from already fetched data. */
async function generate(keys: ReportKey[], format: Format, data: ReportData): Promise<number> {
  let count = 0;
  if (format === 'excel') {
    const { downloadReportExcel } = await import('../../../reports/excel');
    for (const k of keys) {
      if (!getReportDef(k)?.tabular) continue;
      downloadReportExcel(k, data);
      count++;
    }
  } else {
    const { downloadReportPdf } = await import('../../../reports/pdf');
    for (const k of keys) {
      await downloadReportPdf(k, data);
      count++;
    }
  }
  return count;
}

export function ReportTab({ quoteId, onOpenPricing }: { quoteId: number; onOpenPricing?: () => void }) {
  const toast = useToast();
  const { user } = useAuth();
  const canCosting = !!user?.permissions?.['reports.costing'];
  const visible = useMemo(() => REPORTS.filter((r) => canViewReport(r, canCosting)), [canCosting]);

  const [favs, setFavs] = useState<ReportKey[] | null>(null);
  const [category, setCategory] = useState<CategoryKey>('favourites');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<ReportKey>>(() => new Set());
  const [busy, setBusy] = useState<{ keys: ReportKey[]; format: Format } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [proceeding, setProceeding] = useState(false);
  const [favBusy, setFavBusy] = useState<ReportKey | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerFormat, setDrawerFormat] = useState<Format>('pdf');
  const [drawerKey, setDrawerKey] = useState<ReportKey>('quotation');

  const working = busy !== null || proceeding;

  useEffect(() => {
    let alive = true;
    api
      .get<string[]>('/api/reports/favourites')
      .then((keys) => {
        if (alive) setFavs(keys.filter(isReportKey));
      })
      .catch((e: unknown) => {
        if (!alive) return;
        toast.error(errorMessage(e));
        setFavs(REPORTS.map((r) => r.key));
      });
    return () => {
      alive = false;
    };
  }, [toast]);

  const start = useCallback(
    async (keys: ReportKey[], format: Format) => {
      const allowedKeys = keys.filter((k) => canViewReport(getReportDef(k), canCosting));
      if (!allowedKeys.length || busy || proceeding) return;
      setBusy({ keys: allowedKeys, format });
      try {
        const data = await api.get<ReportData>(`/api/quotes/${quoteId}/report-data`);
        if (hasWarnings(data)) {
          setPending({ keys: allowedKeys, format, data });
          return;
        }
        const n = await generate(allowedKeys, format, data);
        toast.success(n > 1 ? `${n} reports downloaded` : 'Report downloaded');
        if (allowedKeys.length > 1) setSelected(new Set());
      } catch (e) {
        toast.error(errorMessage(e));
      } finally {
        setBusy(null);
      }
    },
    [busy, proceeding, quoteId, toast, canCosting],
  );

  const proceed = async () => {
    if (!pending) return;
    setProceeding(true);
    try {
      const n = await generate(pending.keys, pending.format, pending.data);
      toast.success(n > 1 ? `${n} reports downloaded` : 'Report downloaded');
      if (pending.keys.length > 1) setSelected(new Set());
      setPending(null);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setProceeding(false);
    }
  };

  const view = (key: ReportKey) => {
    window.open(`/report/${quoteId}/${key}`, '_blank');
  };

  const toggleFav = async (key: ReportKey) => {
    if (!favs || favBusy) return;
    const fav = favs.includes(key);
    setFavBusy(key);
    try {
      const next = await api.put<string[]>(`/api/reports/favourites/${key}`, { favourite: !fav });
      setFavs(next.filter(isReportKey));
      toast.success(fav ? 'Removed from favourites' : 'Added to favourites');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setFavBusy(null);
    }
  };

  const copyLink = async (key: ReportKey) => {
    const url = `${window.location.origin}/report/${quoteId}/${key}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard');
    } catch (e) {
      toast.error(errorMessage(e) || 'Could not copy the link');
    }
  };

  const toggleSelect = (key: ReportKey, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const q = query.trim().toLowerCase();
  const matches = useCallback((r: ReportDef) => !q || r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q), [q]);
  const favSet = useMemo(() => new Set(favs ?? []), [favs]);
  const inCategory = useCallback((r: ReportDef, c: CategoryKey) => (c === 'favourites' ? favSet.has(r.key) : r.category === c), [favSet]);
  const shown = q ? visible.filter(matches) : visible.filter((r) => inCategory(r, category));
  const counts = useMemo(() => {
    const out = {} as Record<CategoryKey, number>;
    for (const c of CATEGORIES) out[c.key] = visible.filter((r) => inCategory(r, c.key)).length;
    return out;
  }, [visible, inCategory]);
  const selectedDefs = visible.filter((r) => selected.has(r.key));
  const selectedKeys = selectedDefs.map((r) => r.key);
  const selectedTabular = selectedDefs.filter((r) => r.tabular).map((r) => r.key);
  const bulkBusy = !!busy && busy.keys.length > 1;
  const heading = q ? 'Search results' : CATEGORIES.find((c) => c.key === category)?.label ?? 'Reports';

  const drawerOptions = visible.filter((r) => drawerFormat === 'pdf' || r.tabular);
  const drawerValue = drawerOptions.some((r) => r.key === drawerKey) ? drawerKey : drawerOptions[0]?.key ?? 'quotation';
  const setFormat = (f: Format) => {
    setDrawerFormat(f);
    if (f === 'excel' && !getReportDef(drawerKey)?.tabular) setDrawerKey(visible.find((r) => r.tabular)?.key ?? 'profile-boq');
  };

  const card = (def: ReportDef) => {
    const fav = favSet.has(def.key);
    const downloading = !!busy && busy.keys.length === 1 && busy.keys[0] === def.key;
    const items: MenuItem[] = [
      {
        label: fav ? 'Remove from favourites' : 'Add to favourites',
        icon: fav ? <StarOff size={15} /> : <Star size={15} />,
        onClick: () => void toggleFav(def.key),
        disabled: favBusy !== null || favs === null,
      },
    ];
    if (def.tabular) items.push({ label: 'Download as Excel', icon: <FileSpreadsheet size={15} />, onClick: () => void start([def.key], 'excel'), disabled: working });
    items.push({ label: 'Copy link', icon: <Link2 size={15} />, onClick: () => void copyLink(def.key) });
    return (
      <div key={def.key} className={`rcard ${selected.has(def.key) ? 'selected' : ''}`}>
        <div className="rcard-top">
          <Checkbox checked={selected.has(def.key)} onChange={(v) => toggleSelect(def.key, v)} title="Select report" />
          {fav && (
            <span className="rcard-fav" title="Favourite report">
              <Star size={13} />
            </span>
          )}
          <div className="grow" />
          <IconButton size="sm" tip="Download report" onClick={() => void start([def.key], 'pdf')} disabled={working}>
            {downloading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <CloudDownload size={16} />}
          </IconButton>
          <IconButton size="sm" tip="View report" onClick={() => view(def.key)}>
            <Eye size={16} />
          </IconButton>
          <Menu
            items={items}
            trigger={({ ref, onClick, open }) => (
              <IconButton ref={ref} size="sm" tip={open ? undefined : 'More'} active={open} onClick={onClick}>
                <MoreVertical size={16} />
              </IconButton>
            )}
          />
        </div>
        <button type="button" className="rcard-body" onClick={() => toggleSelect(def.key, !selected.has(def.key))}>
          <span className="rcard-title">{def.title}</span>
          <span className="rcard-desc">{def.description}</span>
          {q && <span className="rcard-cat">{REPORT_CATEGORIES.find((c) => c.key === def.category)?.label}</span>}
        </button>
      </div>
    );
  };

  const favLoading = !q && category === 'favourites' && favs === null;

  return (
    <div className="rtab">
      <nav className="rtab-side" aria-label="Report categories">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`rtab-cat ${!q && category === c.key ? 'active' : ''}`}
            onClick={() => {
              setCategory(c.key);
              setQuery('');
            }}
          >
            <span className="rtab-cat-icon">{CATEGORY_ICONS[c.key]}</span>
            <span className="rtab-cat-label">{c.label}</span>
            {!(c.key === 'favourites' && favs === null) && <span className="rtab-cat-count">{counts[c.key]}</span>}
          </button>
        ))}
      </nav>

      <div className="rtab-main">
        <div className="rtab-top">
          <div className="rtab-heading">{heading}</div>
          <div className="grow" />
          <div className="toolbar-search">
            <Search size={14} />
            <input className="input" placeholder="Search reports" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search reports" />
          </div>
        </div>

        {selectedKeys.length > 0 && (
          <div className="rtab-selbar">
            <span>
              <b>{selectedKeys.length}</b> selected
            </span>
            <span className="rtab-dot">·</span>
            <Button size="sm" variant="primary" icon={<Download size={14} />} loading={bulkBusy && busy?.format === 'pdf'} disabled={working && !bulkBusy} onClick={() => void start(selectedKeys, 'pdf')}>
              Download selected (PDF)
            </Button>
            {selectedTabular.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                icon={<FileSpreadsheet size={14} />}
                loading={bulkBusy && busy?.format === 'excel'}
                disabled={working && !bulkBusy}
                onClick={() => void start(selectedTabular, 'excel')}
              >
                Excel ({selectedTabular.length})
              </Button>
            )}
            <div className="grow" />
            <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => setSelected(new Set())} disabled={bulkBusy}>
              Clear selection
            </Button>
          </div>
        )}

        {favLoading ? (
          <div className="rtab-loading">
            <Spinner />
          </div>
        ) : shown.length === 0 ? (
          q ? (
            <Empty title={`No reports match “${query.trim()}”`} />
          ) : category === 'favourites' ? (
            <div className="rtab-hint">No favourite reports yet. Use the ⋮ menu on a report to add it here.</div>
          ) : (
            <div className="rtab-hint">No reports available in this category.</div>
          )
        ) : (
          <div className="rtab-grid">{shown.map(card)}</div>
        )}
      </div>

      <button type="button" className="rtab-edge no-print" onClick={() => setDrawerOpen(true)} aria-label="Filter report">
        <SlidersHorizontal size={14} />
        <span>Filter report</span>
      </button>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Filter report"
        footer={
          <>
            <Button variant="outline" icon={<Eye size={15} />} onClick={() => view(drawerValue)}>
              View
            </Button>
            <Button
              variant="primary"
              icon={<Download size={15} />}
              disabled={working}
              onClick={() => {
                setDrawerOpen(false);
                void start([drawerValue], drawerFormat);
              }}
            >
              Download
            </Button>
          </>
        }
      >
        <Field label="Select format">
          <div className="rtab-radios" role="radiogroup" aria-label="Format">
            {(['pdf', 'excel'] as Format[]).map((f) => (
              <label key={f} className={`rtab-radio ${drawerFormat === f ? 'active' : ''}`}>
                <input type="radio" name="rtab-format" checked={drawerFormat === f} onChange={() => setFormat(f)} />
                {f === 'pdf' ? 'PDF' : 'Excel'}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Report" className="mt-12">
          <Select value={drawerValue} onChange={(e) => isReportKey(e.target.value) && setDrawerKey(e.target.value)}>
            {REPORT_CATEGORIES.map((c) => {
              const opts = drawerOptions.filter((r) => r.category === c.key);
              return opts.length ? (
                <optgroup key={c.key} label={c.label}>
                  {opts.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.title}
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}
          </Select>
        </Field>
        {drawerFormat === 'excel' && <div className="fs-12 muted mt-8">Excel export is available for tabular reports only.</div>}
      </Drawer>

      <DownloadWarningModal
        pending={pending}
        proceeding={proceeding}
        onCancel={() => {
          if (!proceeding) setPending(null);
        }}
        onProceed={() => void proceed()}
        onOpenPricing={
          onOpenPricing
            ? () => {
                setPending(null);
                onOpenPricing();
              }
            : undefined
        }
      />
    </div>
  );
}

function DownloadWarningModal({
  pending,
  proceeding,
  onCancel,
  onProceed,
  onOpenPricing,
}: {
  pending: Pending | null;
  proceeding: boolean;
  onCancel: () => void;
  onProceed: () => void;
  onOpenPricing?: () => void;
}) {
  const data = pending?.data;
  const zeroGroups = data
    ? ([
        ['Profile', data.zeroRate.profile],
        ['Hardware', data.zeroRate.hardware],
        ['Glass', data.zeroRate.glass],
      ] as const).filter(([, items]) => items.length > 0)
    : [];
  const manual = data?.manualDesigns ?? [];
  const what =
    pending && pending.keys.length === 1
      ? `${getReportDef(pending.keys[0])?.title ?? 'Report'} (${pending.format === 'pdf' ? 'PDF' : 'Excel'})`
      : `${pending?.keys.length ?? 0} reports (${pending?.format === 'excel' ? 'Excel' : 'PDF'})`;

  return (
    <Modal
      open={!!pending}
      onClose={onCancel}
      title="Download report"
      size="lg"
      closeOnBackdrop={!proceeding}
      footer={
        <>
          {onOpenPricing && (
            <Button variant="link" className="rdl-update" onClick={onOpenPricing} disabled={proceeding}>
              Update prices
            </Button>
          )}
          <div className="grow" />
          <Button variant="outline" onClick={onCancel} disabled={proceeding}>
            Cancel
          </Button>
          <Button variant="primary" icon={<Download size={15} />} loading={proceeding} onClick={onProceed}>
            Proceed &amp; download
          </Button>
        </>
      }
    >
      <div className="rdl">
        <div className="rdl-what">
          Downloading: <b>{what}</b>
        </div>
        {zeroGroups.length > 0 && (
          <>
            <div className="rdl-warn">
              <AlertTriangle size={18} />
              <div>
                <b>Are you sure?</b> You are about to leave this prices without adding. You will not see below prices in your reports.
              </div>
            </div>
            <div className="rdl-lists">
              {zeroGroups.map(([title, items]) => (
                <div key={title} className="rdl-list">
                  <div className="rdl-list-title">
                    {title} <span className="rdl-count">{items.length}</span>
                  </div>
                  <ul>
                    {items.map((it) => (
                      <li key={it.code}>
                        <span className="rdl-name">{it.name}</span>
                        <span className="rdl-code">{it.code}</span>
                        <span className="rdl-amt">₹0</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}
        {manual.length > 0 && (
          <>
            <div className="rdl-warn rdl-warn-info">
              <AlertTriangle size={18} />
              <div>
                <b>Quotation Generated With Manual Rate</b>
              </div>
            </div>
            <ul className="rdl-manual">
              {manual.map((m) => (
                <li key={m.ref}>
                  <span className="rdl-name">
                    <b>{m.ref}</b> {m.name}
                  </span>
                  <span className="rdl-amt">{inr(m.basic)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}
