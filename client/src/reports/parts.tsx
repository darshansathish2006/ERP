import { Component, Fragment, type ReactNode } from 'react';
import type { Company, Design, QuoteHeader, QuoteSummary, ReportDesign } from '../lib/types';
import { DesignSvg } from '../configurator/DesignSvg';
import { fixed2 } from '../lib/format';
import { type Col, ROW_H, TABLE_GAP, headHeight, rowHeight, textWidth } from './engine';
import { printCompany } from './companyDefaults';

// ---------------------------------------------------------------- formatting

/** 24.219 */
export const f3 = (v: number | null | undefined): string => (Number(v) || 0).toFixed(3);

/** Millimetres: integers stay integers, otherwise 1dp. */
export function mm(v: number | null | undefined): string {
  const n = Math.round((Number(v) || 0) * 10) / 10;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function dash(v: string | number | null | undefined): string {
  if (v == null) return '—';
  const s = String(v).trim();
  return s ? s : '—';
}

const SMALL_WORDS = new Set(['AND', 'FOR', 'THE', 'OF', 'WITH', 'IN', 'ON', 'TO', 'BY', 'PER']);

/** "62MM 2 TRACK SLIDING FRAME" -> "62MM 2 Track Sliding Frame" (acronyms and codes are kept). */
export function titleCase(s: string | null | undefined): string {
  return String(s || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      if (/\d/.test(w)) return w;
      const up = w.toUpperCase();
      if (w.length <= 3 && w === up && !SMALL_WORDS.has(up)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

/** "W = 1500.00, H = 1500.00" */
export function sizeText(d: Pick<Design, 'data'>, sep = ', '): string {
  return `W = ${fixed2(d.data?.width)}${sep}H = ${fixed2(d.data?.height)}`;
}

export function pct(rate: number): string {
  const n = Math.round((Number(rate) || 0) * 100) / 100;
  return `${n}%`;
}

export function alignCls(a?: 'left' | 'right' | 'center'): string | undefined {
  return a === 'right' ? 'num' : a === 'center' ? 'ctr' : undefined;
}

/** Whole number, rounded up (BOQ purchase quantities). */
export function ceilQty(v: number | null | undefined): number {
  const n = Number(v) || 0;
  return Math.max(0, Math.ceil(n - 1e-6));
}

/** Short unit used on purchase documents: Meter -> Mtr. */
export function unitShort(unit: string | null | undefined): string {
  const u = String(unit || '').trim();
  if (/^(meter|metre|mtr|m)$/i.test(u)) return 'Mtr';
  if (/^pcs?$/i.test(u)) return 'Pcs';
  return u || '—';
}

/** "Inside-WALNUT, Outside-WALNUT" -> "WALNUT"; "Inside-WHITE, Outside-WALNUT" -> "WHITE / WALNUT". */
export function colourName(c: string | null | undefined): string {
  const s = String(c || '').trim();
  const m = /^Inside-(.*?),\s*Outside-(.*)$/i.exec(s);
  if (!m) return s || '—';
  const a = m[1].trim();
  const b = m[2].trim();
  return !b || a.toUpperCase() === b.toUpperCase() ? a : `${a} / ${b}`;
}

// ---------------------------------------------------------------- dates (always India time, as printed by EvA)

const IST_OFFSET_MIN = 330;
const pad2 = (n: number) => String(n).padStart(2, '0');

function istParts(iso?: string | null) {
  const t = iso ? new Date(iso).getTime() : NaN;
  const d = new Date((Number.isFinite(t) ? t : Date.now()) + IST_OFFSET_MIN * 60000);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds() };
}

/** 08-10-2026 */
export function istDate(iso?: string | null): string {
  const p = istParts(iso);
  return `${pad2(p.d)}-${pad2(p.mo)}-${p.y}`;
}

/** 08-10-2026 15:04:05 +05:30 */
export function istDateTime(iso?: string | null): string {
  const p = istParts(iso);
  return `${pad2(p.d)}-${pad2(p.mo)}-${p.y} ${pad2(p.h)}:${pad2(p.mi)}:${pad2(p.s)} +05:30`;
}

/** 10/8/2026 3:04:05 PM +05:30 */
export function istUsDateTime(iso?: string | null): string {
  const p = istParts(iso);
  const h12 = p.h % 12 || 12;
  return `${p.mo}/${p.d}/${p.y} ${h12}:${pad2(p.mi)}:${pad2(p.s)} ${p.h >= 12 ? 'PM' : 'AM'} +05:30`;
}

// ---------------------------------------------------------------- rich text (`**bold**`)

export function plainText(s: string | null | undefined): string {
  return String(s ?? '').replace(/\*\*/g, '');
}

export function RichText({ text }: { text: string }) {
  const parts = String(text ?? '').split('**');
  return (
    <>
      {parts.map((p, i) => (i % 2 ? <b key={i}>{p}</b> : <Fragment key={i}>{p}</Fragment>))}
    </>
  );
}

/** "a. text" / "b. text" sub-point marker. */
export function subPoint(s: string): { marker: string; text: string } | null {
  const m = /^([a-z])\.\s+(.*)$/s.exec(String(s ?? '').trim());
  return m ? { marker: `${m[1]}.`, text: m[2] } : null;
}

// ---------------------------------------------------------------- brand

export function BrandWordmark({ company, size = 'sm', sub }: { company: Pick<Company, 'partnerBrand' | 'partnerTagline'>; size?: 'sm' | 'lg'; sub?: string }) {
  return (
    <div className={`rp-wm rp-wm-${size}`}>
      <div className="rp-wm-brand">{company.partnerBrand || 'PROMINANCE'}</div>
      <div className="rp-wm-tag">{sub ?? (company.partnerTagline || 'uPVC WINDOW SYSTEMS')}</div>
    </div>
  );
}

// ---------------------------------------------------------------- page frame

/** `quote` = customer quotation footer, `internal` = every other report. */
export type PageVariant = 'quote' | 'internal';

function PageFooter({ index, total, company, variant }: { index: number; total: number; company: Company; variant: PageVariant }) {
  const c = printCompany(company);
  if (variant === 'quote') {
    return (
      <footer className="a4-footer">
        <div className="a4-footer-left">
          {c.partnerLogo ? <img className="a4-flogo" src={c.partnerLogo} alt="" /> : <BrandWordmark company={c} />}
        </div>
        <div className="a4-footer-page">
          {index + 1} of {total}
        </div>
        <div className="a4-footer-powered">
          powered by <b className="a4-eva">EvA WinOptimize</b> Software
        </div>
      </footer>
    );
  }
  return (
    <footer className="a4-footer">
      <div className="a4-footer-left">
        <BrandWordmark company={c} sub={c.name} />
      </div>
      <div className="a4-footer-page">
        Page {index + 1} of {total}
      </div>
      <div className="a4-footer-site">{c.website}</div>
    </footer>
  );
}

export function A4Page({ index, total, company, variant, children }: { index: number; total: number; company: Company; variant: PageVariant; children: ReactNode }) {
  return (
    <section className="a4-page" data-page={index + 1}>
      <div className="a4-body">{children}</div>
      <PageFooter index={index} total={total} company={company} variant={variant} />
    </section>
  );
}

/** Renders pre-paginated page bodies as A4 sheets. */
export function PagedDocument({ pages, company, variant = 'internal' }: { pages: ReactNode[][]; company: Company; variant?: PageVariant }) {
  return (
    <div className="report-doc">
      {pages.map((nodes, i) => (
        <A4Page key={i} index={i} total={pages.length} company={company} variant={variant}>
          {nodes}
        </A4Page>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- headers

/** Company letterhead header (delivery challan, installation checklist). */
export function ReportHead({ company, title, date, meta }: { company: Company; title: string; date: string; meta: [string, ReactNode][] }) {
  const contact = [company.phone && `Ph: ${company.phone}`, company.email, company.gstin && `GSTIN: ${company.gstin}`].filter(Boolean).join('   |   ');
  return (
    <div className="rp-headwrap">
      <div className="rp-head">
        <div className="rp-head-left">
          <div className="rp-head-co">{company.name}</div>
          {company.address && <div className="rp-head-line">{company.address}</div>}
          {contact && <div className="rp-head-line">{contact}</div>}
        </div>
        <div className="rp-head-right">
          <div className="rp-head-title">{title}</div>
          <div className="rp-head-date">Date: {date}</div>
        </div>
      </div>
      {meta.length > 0 && (
        <div className="rp-meta">
          {meta.map(([k, v]) => (
            <div key={k} className="rp-meta-item">
              <span className="rp-meta-k">{k}:</span> <b>{v}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Height of <ReportHead/> with `metaCount` items (matches reports.css). */
export function reportHeadH(metaCount: number): number {
  return 66 + (metaCount ? 8 + Math.ceil(metaCount / 3) * 18 : 0) + 12;
}

/** EvA report header: big title left, date right, project lines and a blue rule. */
export function EvaHead({ title, date, lines }: { title: string; date: string; lines: ReactNode[] }) {
  return (
    <div className="eh">
      <div className="eh-top">
        <div className="eh-title">{title}</div>
        <div className="eh-date">{date}</div>
      </div>
      {lines.map((l, i) => (
        <div key={i} className="eh-line">
          {l}
        </div>
      ))}
      <div className="eh-rule" />
    </div>
  );
}
/** .eh-top 30 + lines × 17 + rule (5 + 2) + margin 12 */
export const evaHeadH = (lines: number): number => 49 + lines * 17;

/** Bold caption above an EvA table ("Report includes the data from projects :"). */
export function EvaLabel({ children }: { children: ReactNode }) {
  return <div className="eh-label">{children}</div>;
}
export const EVA_LABEL_H = 22;

export function RunningHead({ title, quote }: { title: string; quote: Pick<QuoteHeader, 'quoteNo' | 'projectName'> }) {
  return (
    <div className="rp-run">
      <span>
        <b>{title}</b> (contd.)
      </span>
      <span>
        {quote.quoteNo} · {quote.projectName}
      </span>
    </div>
  );
}
export const RUN_H = 34;

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rp-sec">
      <span>{children}</span>
      {sub && <span className="rp-sec-sub">{sub}</span>}
    </div>
  );
}
export const SECTION_H = 30;

export function TitleBar({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <div className="rp-bar">
      <span>{left}</span>
      {right && <span className="rp-bar-right">{right}</span>}
    </div>
  );
}
export const BAR_H = 36;

// ---------------------------------------------------------------- tables

export function RTable({ cols, children, foot, className = '', head = true }: { cols: Col[]; children?: ReactNode; foot?: ReactNode; className?: string; head?: boolean }) {
  return (
    <table className={`rt ${className}`}>
      <colgroup>
        {cols.map((c, i) => (
          <col key={i} style={{ width: c.w }} />
        ))}
      </colgroup>
      {head && (
        <thead>
          <tr>
            {cols.map((c, i) => (
              <th key={i} className={alignCls(c.align)}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>{children}</tbody>
      {foot && <tfoot>{foot}</tfoot>}
    </table>
  );
}

export function EmptyRow({ span, text = 'No items' }: { span: number; text?: string }) {
  return (
    <tr>
      <td colSpan={span} className="ctr rt-empty">
        {text}
      </td>
    </tr>
  );
}

/** A table row of plain cells aligned per column. */
export function CellsRow({ cols, cells, className }: { cols: Col[]; cells: ReactNode[]; className?: string }) {
  return (
    <tr className={className}>
      {cells.map((c, j) => (
        <td key={j} className={alignCls(cols[j]?.align)}>
          {c}
        </td>
      ))}
    </tr>
  );
}

const PROJECT_COLS: Col[] = [
  { label: 'Sl No.', w: 52, align: 'center' },
  { label: 'Project Name', w: 280 },
  { label: 'Project Code', w: 150 },
  { label: 'Qty', w: 60, align: 'right' },
  { label: 'Quote Alias', w: 180 },
];

function projectCells(quote: QuoteHeader, summary: Pick<QuoteSummary, 'qty'>): string[] {
  return ['1', quote.projectName || '—', quote.quoteNo || quote.projectCode || '—', String(summary.qty ?? 0), quote.alias || quote.quoteNo || '—'];
}

/** "Report includes the data from projects" table. */
export function ProjectTable({ quote, summary }: { quote: QuoteHeader; summary: Pick<QuoteSummary, 'qty'> }) {
  return (
    <div className="rp-gap">
      <RTable cols={PROJECT_COLS}>
        <CellsRow cols={PROJECT_COLS} cells={projectCells(quote, summary)} />
      </RTable>
    </div>
  );
}

export function projectTableH(quote: QuoteHeader, summary: Pick<QuoteSummary, 'qty'>): number {
  return headHeight(PROJECT_COLS) + rowHeight(PROJECT_COLS, projectCells(quote, summary)) + TABLE_GAP;
}

export const REMARK_COLS: Col[] = [
  { label: 'Design Ref', w: 90 },
  { label: 'Remark Date', w: 100 },
  { label: 'Remarks', w: 532 },
];

export function remarkCells(d: Pick<ReportDesign, 'ref' | 'note' | 'updatedAt' | 'createdAt'>): string[] {
  return [d.ref, istDate(d.updatedAt || d.createdAt), String(d.note || '').trim()];
}

// ---------------------------------------------------------------- vertical group label column

/** Height a vertical group label needs (wrapped over up to two lines). */
export function vGroupNeed(grp: string): number {
  const words = String(grp || '').split(/\s+/).filter(Boolean);
  const longest = Math.max(0, ...words.map((w) => textWidth(w, 9, true)));
  return Math.ceil(Math.max(longest, textWidth(grp, 9, true) / 2) + 18);
}

/** A rowSpan cell with the group name written bottom-to-top. Falls back to small horizontal text when too short. */
export function VGroupCell({ grp, span, height }: { grp: string; span: number; height: number }) {
  const vertical = height >= vGroupNeed(grp);
  return (
    <td rowSpan={span} className="rp-vg">
      {vertical ? (
        <div className="rp-vg-v" style={{ width: Math.max(10, height - 8) }}>
          {grp}
        </div>
      ) : (
        <div className="rp-vg-h">{grp}</div>
      )}
    </td>
  );
}

// ---------------------------------------------------------------- misc

/** An empty tick box (rendered with CSS so it survives html2canvas). */
export function TickBox() {
  return <span className="rp-checkbox" />;
}

export function SignatureRow({ labels, height = 96 }: { labels: string[]; height?: number }) {
  return (
    <div className="rp-signs" style={{ height }}>
      {labels.map((l) => (
        <div key={l} className="rp-sign">
          <div className="rp-sign-space" />
          <div className="rp-sign-label">{l}</div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- drawings

class DrawingBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <div className="rp-fig-missing">Drawing unavailable</div>;
    return this.props.children;
  }
}

export function DesignFigure({
  design,
  height,
  showDims = true,
  showLabels = false,
  showNumbers = true,
  className = '',
}: {
  design: Pick<Design, 'data' | 'colorHex'>;
  height: number;
  showDims?: boolean;
  showLabels?: boolean;
  showNumbers?: boolean;
  className?: string;
}) {
  const valid = !!design.data && !!design.data.root && Number(design.data.width) > 0 && Number(design.data.height) > 0;
  return (
    <div className={`rp-fig ${className}`} style={{ height }}>
      {valid ? (
        <DrawingBoundary>
          <DesignSvg
            data={design.data}
            frameColor={design.colorHex || '#f4f4f2'}
            view="inside"
            showDims={showDims}
            showFloor={false}
            showPlan={false}
            showLabels={showLabels}
            showNumbers={showNumbers}
            style={{ width: '100%', height: '100%', display: 'block' }}
          />
        </DrawingBoundary>
      ) : (
        <div className="rp-fig-missing">Drawing unavailable</div>
      )}
    </div>
  );
}

/** Small key/value table rows height helper. */
export function kvRowsH(cols: { w: number }[], rows: [string, string][]): number {
  return rows.reduce((s, [k, v]) => s + rowHeight(cols, [k, v]), 0);
}

export { ROW_H };
