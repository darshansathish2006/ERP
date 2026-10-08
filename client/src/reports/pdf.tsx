import type { ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import type { ReportData } from '../lib/types';
import { ReportDocument } from './ReportDocument';
import { reportFileName, type ReportKey } from './registry';

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

let hostSeq = 0;

/**
 * Render `node` (which must produce `.a4-page` sections) off-screen, rasterise every page
 * with html2canvas and save the result as an A4 PDF. Works without any viewer being open.
 */
export async function downloadNodePdf(node: ReactNode, filename: string): Promise<void> {
  const host = document.createElement('div');
  host.className = 'report-offscreen';
  host.setAttribute('aria-hidden', 'true');
  host.style.position = 'absolute';
  host.style.left = '-10000px';
  host.style.top = '0';
  host.style.width = '794px';
  host.style.pointerEvents = 'none';
  document.body.appendChild(host);
  const root = createRoot(host, { identifierPrefix: `rpt${++hostSeq}-` });
  try {
    flushSync(() => root.render(node));
    await nextFrame();
    await nextFrame();
    if (document.fonts?.ready) await document.fonts.ready;

    const pages = Array.from(host.querySelectorAll<HTMLElement>('.a4-page'));
    if (!pages.length) throw new Error('The report has no pages to export.');

    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const canvas = await html2canvas(page, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        scrollX: 0,
        scrollY: 0,
        // html2canvas clones the whole document for every capture; skip the app and the other
        // pages so long reports stay linear (never ignore an ancestor of `page`).
        ignoreElements: (el) => (el.parentElement === document.body && el !== host) || (el !== page && el.classList.contains('a4-page')),
      });
      const img = canvas.toDataURL('image/jpeg', 0.9);
      if (i > 0) pdf.addPage('a4', 'p');
      pdf.addImage(img, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
      // release the bitmap early – long reports can hold many large canvases
      canvas.width = 0;
      canvas.height = 0;
    }
    pdf.save(filename);
  } finally {
    root.unmount();
    host.remove();
  }
}

/** Generate and download a report as PDF, e.g. `Quotation_TIT-QT-00003593.pdf`. */
export async function downloadReportPdf(reportKey: ReportKey, data: ReportData, filename?: string): Promise<void> {
  await downloadNodePdf(<ReportDocument reportKey={reportKey} data={data} />, filename || reportFileName(reportKey, data.quote.quoteNo, 'pdf'));
}
