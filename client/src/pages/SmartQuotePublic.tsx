import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FileDown, LinkIcon, Printer, RotateCw } from 'lucide-react';
import { ApiError, api, errorMessage } from '../lib/api';
import type { Company, QuoteHeader, QuoteSummary } from '../lib/types';
import { Button, PageLoading } from '../components/ui';
import { useToast } from '../components/feedback';
import { QuotationDocument } from '../reports/ReportDocument';
import type { QuotationDesign } from '../reports/templates/quotation';
import { ReportCanvas, ZoomControls, useZoom } from '../reports/ViewerChrome';
import { reportFileName } from '../reports/registry';

/**
 * Shape of GET /api/public/smart-quote/:token – a whitelisted subset: designs carry only a partial
 * BOM (line names/groups and cut roles, no rates) and the summary only the customer-facing heads.
 */
export interface SmartQuoteData {
  company: Company;
  quote: QuoteHeader;
  designs: QuotationDesign[];
  summary: QuoteSummary;
  generatedAt: string;
}

export default function SmartQuotePublicPage() {
  const { token = '' } = useParams();
  const toast = useToast();
  const [data, setData] = useState<SmartQuoteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ invalid: boolean; message: string } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const zoomState = useZoom(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!/^[A-Za-z0-9_-]{6,80}$/.test(token)) throw new ApiError(404, 'Quote link not found');
      setData(await api.get<SmartQuoteData>(`/api/public/smart-quote/${encodeURIComponent(token)}`));
    } catch (e) {
      const invalid = e instanceof ApiError && (e.status === 404 || e.status === 400 || e.status === 410);
      setError({ invalid, message: errorMessage(e) });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const prev = document.title;
    if (data) document.title = `Quotation ${data.quote.quoteNo} · ${data.company.name}`;
    return () => {
      document.title = prev;
    };
  }, [data]);

  const download = async () => {
    if (!data) return;
    setDownloading(true);
    try {
      const { downloadNodePdf } = await import('../reports/pdf');
      await downloadNodePdf(<QuotationDocument src={data} />, reportFileName('quotation', data.quote.quoteNo, 'pdf'));
      toast.success('Quotation downloaded');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="sq-page sq-center">
        <PageLoading />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="sq-page sq-center">
        <div className="card sq-error">
          <div className="sq-error-icon">
            <LinkIcon size={26} />
          </div>
          <h2>{error?.invalid !== false ? 'Link not available' : 'Unable to load the quotation'}</h2>
          <p className="muted">{error?.invalid !== false ? 'This quotation link is invalid or has expired.' : error.message}</p>
          {error && !error.invalid && (
            <Button variant="primary" size="sm" icon={<RotateCw size={14} />} onClick={() => void load()}>
              Try again
            </Button>
          )}
          {error?.invalid !== false && <p className="fs-12 muted">Please contact the sender for an updated link.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="report-viewer sq-viewer">
      <header className="rv-toolbar sq-toolbar">
        <div className="rv-title">
          <div className="rv-title-main">{data.company.name}</div>
          <div className="rv-title-sub">
            Quotation {data.quote.quoteNo} · {data.quote.projectName}
          </div>
        </div>
        <div className="grow" />
        <ZoomControls {...zoomState} />
        <div className="rv-sep" />
        <Button size="sm" variant="outline" icon={<Printer size={15} />} onClick={() => window.print()}>
          Print
        </Button>
        <Button size="sm" variant="primary" icon={<FileDown size={15} />} onClick={download} loading={downloading}>
          Download PDF
        </Button>
      </header>
      <ReportCanvas zoom={zoomState.zoom}>
        <QuotationDocument src={data} />
      </ReportCanvas>
    </div>
  );
}
