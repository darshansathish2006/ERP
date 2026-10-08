import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileDown, FileSpreadsheet, Lock, Printer, RotateCw } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import type { ReportData } from '../lib/types';
import { Button, Empty, IconButton, PageLoading } from '../components/ui';
import { useToast } from '../components/feedback';
import { useAuth } from '../context/AuthContext';
import { canViewReport, getReportDef, isReportKey, type ReportKey } from './registry';
import { ReportDocument } from './ReportDocument';
import { ReportCanvas, ZoomControls, useZoom } from './ViewerChrome';

export default function ReportViewerPage() {
  const { quoteId: quoteParam, reportKey } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const quoteId = Number(quoteParam);
  const def = getReportDef(reportKey);
  const { user } = useAuth();
  const allowed = canViewReport(def, !!user?.permissions?.['reports.costing']);
  const key: ReportKey | null = isReportKey(reportKey) ? reportKey : null;

  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'pdf' | 'excel' | null>(null);
  const zoomState = useZoom(1);

  const load = useCallback(async () => {
    if (!Number.isFinite(quoteId) || quoteId <= 0) {
      setError('Invalid quote.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setData(await api.get<ReportData>(`/api/quotes/${quoteId}/report-data`));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [quoteId]);

  useEffect(() => {
    if (key && allowed) void load();
    else setLoading(false);
  }, [key, allowed, load]);

  useEffect(() => {
    const prev = document.title;
    const parts = [def?.title ?? 'Report', data?.quote.quoteNo].filter(Boolean);
    document.title = `${parts.join(' · ')} | Titans ERP`;
    return () => {
      document.title = prev;
    };
  }, [def, data]);

  const close = () => {
    if (window.opener && !window.opener.closed) {
      window.close();
      return;
    }
    if (window.history.length > 1) navigate(-1);
    else navigate(Number.isFinite(quoteId) && quoteId > 0 ? `/quote/${quoteId}` : '/quotes');
  };

  const downloadPdf = async () => {
    if (!data || !key) return;
    setBusy('pdf');
    try {
      const { downloadReportPdf } = await import('./pdf');
      await downloadReportPdf(key, data);
      toast.success('Report downloaded');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const downloadExcel = async () => {
    if (!data || !key) return;
    setBusy('excel');
    try {
      const { downloadReportExcel } = await import('./excel');
      downloadReportExcel(key, data);
      toast.success('Report downloaded');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const ready = !!data && !!key && allowed && !loading && !error;

  return (
    <div className="report-viewer">
      <header className="rv-toolbar">
        <IconButton tip={window.opener ? 'Close' : 'Back'} tipPos="bottom" onClick={close}>
          <ArrowLeft size={17} />
        </IconButton>
        <div className="rv-title">
          <div className="rv-title-main">{def?.title ?? 'Report'}</div>
          {data && (
            <div className="rv-title-sub">
              {data.quote.projectName} · {data.quote.quoteNo}
            </div>
          )}
        </div>
        <div className="grow" />
        {ready && <ZoomControls {...zoomState} />}
        <div className="rv-sep" />
        <Button size="sm" variant="outline" icon={<Printer size={15} />} onClick={() => window.print()} disabled={!ready}>
          Print
        </Button>
        <Button size="sm" variant="primary" icon={<FileDown size={15} />} onClick={downloadPdf} loading={busy === 'pdf'} disabled={!ready || busy !== null}>
          Download PDF
        </Button>
        {def?.tabular && (
          <Button size="sm" variant="success" icon={<FileSpreadsheet size={15} />} onClick={downloadExcel} loading={busy === 'excel'} disabled={!ready || busy !== null}>
            Download Excel
          </Button>
        )}
      </header>

      {!key ? (
        <div className="rv-state">
          <div className="card rv-state-card">
            <Empty title="Report not found">
              <div className="muted">The report “{reportKey}” does not exist.</div>
              <Button variant="outline" size="sm" onClick={close}>
                Go back
              </Button>
            </Empty>
          </div>
        </div>
      ) : !allowed ? (
        <div className="rv-state">
          <div className="card rv-state-card">
            <Empty title="You do not have access" icon={<Lock size={28} />}>
              <div className="muted">The {def?.title ?? 'report'} contains internal costing details. Ask an administrator for the “View costing reports” permission.</div>
              <Button variant="outline" size="sm" onClick={close}>
                Go back
              </Button>
            </Empty>
          </div>
        </div>
      ) : loading ? (
        <div className="rv-state">
          <PageLoading />
        </div>
      ) : error || !data ? (
        <div className="rv-state">
          <div className="card rv-state-card">
            <Empty title="Unable to load the report">
              <div className="muted">{error ?? 'No data was returned.'}</div>
              <Button variant="primary" size="sm" icon={<RotateCw size={14} />} onClick={() => void load()}>
                Retry
              </Button>
            </Empty>
          </div>
        </div>
      ) : (
        <ReportCanvas zoom={zoomState.zoom}>
          <ReportDocument reportKey={key} data={data} />
        </ReportCanvas>
      )}
    </div>
  );
}
