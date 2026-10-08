import type { CSSProperties, ReactNode } from 'react';
import type { BomLine, Company, CutLine, Design, QuoteHeader, QuoteSummary, SashInfo } from '../../lib/types';
import { fixed2, grouped2 } from '../../lib/format';
import { layout } from '../../configurator/model';
import { CONTENT_W, PageBuilder, estLines, rowHeight, textWidth } from '../engine';
import { DesignFigure, RichText, istDate, pct, plainText, subPoint, titleCase } from '../parts';
import { type PrintCompany, printCompany } from '../companyDefaults';
import { addressLines } from './common';

/** A BOM line as available to the quotation (the public smart-quote carries no rates or colours). */
export type QuoteBomLine = Pick<BomLine, 'code' | 'baseCode' | 'name' | 'grp' | 'category' | 'unit'> & { color?: string };

/** A design as needed by the quotation – the public smart-quote only carries a partial BOM. */
export interface QuotationDesign extends Design {
  bom?: {
    lines?: QuoteBomLine[];
    cuts?: Pick<CutLine, 'code' | 'role'>[];
    sashes?: SashInfo[];
    areaSqft?: number;
    areaSqm?: number;
  };
}

export interface QuotationSource {
  company: Company;
  quote: QuoteHeader;
  designs: QuotationDesign[];
  summary: QuoteSummary;
  generatedAt?: string;
}

// ---------------------------------------------------------------- metrics (see reports.css)

/** Usable body height for the quotation (A4 body is 1037px; estimates below are conservative). */
const Q_BUDGET = 1020;
/** Right header block width. */
const HEAD_RIGHT_W = 300;
const LOGO_H = 60;
const HEADER_IMG_H = 110;
/** rule (6 + 1 + 6) + quote line 18 + gap 10 */
const QUOTELINE_H = 41;

const FIG_H = 164;
const CAP_H = 16;
/** compact row inside item blocks – `.q-item .rt td` uses 2px vertical padding */
const KV = 19;
const ITEM_GAP = 6;
const ITEM_MARGIN = 14;
const LEFT_W = 270;
const RIGHT_W = 440;
const INFO_COLS = [{ w: 330 }, { w: 392 }];
const COMP_COLS = [{ w: 118 }, { w: 96 }, { w: 56 }];
const SPEC_COLS = [{ w: 70 }, { w: 152 }, { w: 72 }, { w: 146 }];
const REM_COLS = [{ w: CONTENT_W }];

const TEXT_LINE = 16;
const LETTER_LINE = 18;

// ---------------------------------------------------------------- derivations

type KV = [string, string];

const ROLE_LABEL: Record<string, (sliding: boolean) => string | null> = {
  frame: (s) => (s ? 'Track' : 'Frame'),
  frame3: (s) => (s ? 'Track' : 'Frame'),
  sash: (s) => (s ? 'Sliding Sash' : 'Sash'),
  mullion: () => 'Mullion',
  floatingMullion: () => 'Floating Mullion',
  meshSash: () => 'Mesh Sash',
  guideRail: () => 'Guide Rail',
  monorail: () => 'Monorail Track',
  louverHolder: () => 'Louver Holder',
  bead: () => null,
  interlock: () => null,
};

function profileRows(d: QuotationDesign): KV[] {
  const lines = d.bom?.lines;
  if (!lines) return [];
  const roleByCode = new Map<string, string>();
  for (const c of d.bom?.cuts ?? []) if (!roleByCode.has(c.code)) roleByCode.set(c.code, c.role);
  const sliding = d.systemType === 'sliding';
  const out: KV[] = [];
  const seen = new Set<string>();
  for (const l of lines) {
    if (l.category !== 'profile' && l.category !== 'aluminium') continue;
    const role = roleByCode.get(l.code) ?? '';
    const labelFn = ROLE_LABEL[role];
    const label = labelFn ? labelFn(sliding) : 'Profile';
    if (!label) continue;
    const key = `${label}|${l.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([label, titleCase(l.name)]);
  }
  return out.slice(0, 6);
}

function leafPanels(d: Pick<Design, 'data'>): Map<number, string> {
  const map = new Map<number, string>();
  try {
    if (d.data?.root) for (const l of layout(d.data).leaves) map.set(l.no, l.node.panel);
  } catch {
    /* malformed design data – no panel info */
  }
  return map;
}

export function hasMesh(d: Pick<Design, 'data'>): boolean {
  let mesh = false;
  try {
    if (d.data?.root) mesh = layout(d.data).leaves.some((l) => !!l.node.mesh || l.node.panel === 'mesh');
  } catch {
    mesh = false;
  }
  return mesh;
}

/** "S1-Sliding Touch Lock Left, S2-Sliding Touch Lock Right" */
function touchLockText(sashes: SashInfo[], panels: Map<number, string>): string {
  const byLeaf = new Map<number, SashInfo[]>();
  for (const s of sashes) {
    if (panels.get(s.leafNo) !== 'sliding') continue;
    byLeaf.set(s.leafNo, [...(byLeaf.get(s.leafNo) ?? []), s]);
  }
  const parts: string[] = [];
  for (const group of byLeaf.values()) {
    const left = Math.ceil(group.length / 2);
    group.forEach((s, i) => parts.push(`${s.label}-Sliding Touch Lock ${i < left ? 'Left' : 'Right'}`));
  }
  return parts.join(', ');
}

const TOUCH_LOCK = /^PR-STL[LR]/;

/** Hardware colour of a design: WHITE for white windows, BROWN for walnut / laminated … */
export function hardwareColour(d: QuotationDesign): string {
  if (d.hwColor && d.hwColor.trim()) return d.hwColor.trim().toUpperCase();
  const lines = d.bom?.lines ?? [];
  const lock = lines.find((l) => TOUCH_LOCK.test(l.baseCode || '') || TOUCH_LOCK.test(l.code || ''));
  if (lock?.color && lock.color.trim()) return lock.color.trim().toUpperCase();
  // brown variant codes (PR-STLLB / PR-STLRB) without a colour on the line
  if (lock && /^PR-STL[LR]B$/.test(lock.baseCode || '')) return 'BROWN';
  // no colour information on the lines (public smart quote): white profiles use white hardware
  const inside = (d.colorInside || d.colorName || '').toUpperCase();
  const outside = (d.colorOutside || inside).toUpperCase();
  return inside.includes('WHITE') && outside.includes('WHITE') ? 'WHITE' : 'BROWN';
}

function accessoryRows(d: QuotationDesign): KV[] {
  const panels = leafPanels(d);
  const kinds = new Set(panels.values());
  const hw = d.bom?.lines?.filter((l) => l.category === 'hardware');
  const has = (re: RegExp, fallback: boolean) => (hw ? hw.some((l) => re.test(l.baseCode || '') || re.test(l.code || '')) : fallback);
  const lineName = (re: RegExp, fallback: string) => titleCase(hw?.find((l) => re.test(l.baseCode || '') || re.test(l.code || ''))?.name ?? fallback);
  const sashes = d.sashes?.length ? d.sashes : d.bom?.sashes ?? [];

  const sliding = has(TOUCH_LOCK, kinds.has('sliding'));
  const casementish = ['casement', 'twin', 'tophung', 'bottomhung'].some((k) => kinds.has(k));
  const tilt = kinds.has('tiltturn');
  const monorail = kinds.has('monorail');
  const bifold = kinds.has('bifold');
  const meshHandle = has(/^PR-MSH/, kinds.has('mesh'));
  const multipoint = has(/^PR-MPL/, false);

  const locking: string[] = [];
  const handleType: string[] = [];
  if (sliding) {
    locking.push('Sliding Touch Lock');
    handleType.push(touchLockText(sashes, panels) || 'Sliding Touch Lock');
  }
  if (tilt) {
    locking.push('Tilt & Turn Multi Point Locking');
    handleType.push('Tilt & Turn Handle');
  }
  if (casementish) {
    locking.push(multipoint ? 'Multi Point Locking Gear' : 'Casement Handle With Locking Keep');
    handleType.push('Casement Handle');
  }
  if (monorail) {
    locking.push('Monorail Lock');
    handleType.push('Monorail Handle');
  }
  if (bifold) {
    locking.push('Bifold Hardware Kit');
    handleType.push('Bifold Handle');
  }
  if (meshHandle) handleType.push(lineName(/^PR-MSH/, 'Mesh Sash Handle'));

  const rollers: string[] = [];
  if (has(/^PR-SWG/, kinds.has('sliding'))) rollers.push(lineName(/^PR-SWG/, 'Single Wheel With Groove'));
  if (has(/^PR-MRR/, monorail)) rollers.push(lineName(/^PR-MRR/, 'Monorail Roller Set'));

  const openable = locking.length > 0 || handleType.length > 0;
  return [
    ['Locking', locking.join(', ') || 'Not Applicable'],
    ['Handle color', openable ? hardwareColour(d) : 'Not Applicable'],
    ['Roller', rollers.join(', ') || 'Not Applicable'],
    ['Handle Type', handleType.join(', ') || 'Not Applicable'],
  ];
}

interface ItemSpec {
  info: [KV, KV][];
  infoH: number[];
  computed: [string, string, string][];
  spec: [string, string, string, string][];
  specH: number[];
  remarks: string;
  remH: number;
  height: number;
}

const kvRowH = (cols: { w: number }[], cells: string[]) => rowHeight(cols, cells, 10.5, KV, KV);

function itemSpec(d: QuotationDesign): ItemSpec {
  const area = Number(d.areaSqft) || 0;
  const unit = Number(d.unitBasic) || 0;
  const glass = d.glassLabels?.length ? d.glassLabels.join('\n') : d.glassName || '';
  const info: [KV, KV][] = [
    [
      ['Code', d.ref || ''],
      ['Size', `W = ${fixed2(d.data?.width)}; H = ${fixed2(d.data?.height)}`],
    ],
    [
      ['Name', d.name || ''],
      ['Profile System', d.systemName || ''],
    ],
    [
      ['Location', d.location || ''],
      ['Glass', glass],
    ],
  ];
  const infoH = info.map(([a, b]) => kvRowH(INFO_COLS, [`${a[0]} : ${a[1]}`, `${b[0]} : ${b[1]}`]));
  const computed: [string, string, string][] = [
    ['Sq.Ft. per window', fixed2(area), 'Sq.Ft.'],
    ['Value per Sq.Ft.', grouped2(area ? unit / area : 0), 'Rs.'],
    ['Unit Price', grouped2(unit), 'Rs.'],
    ['Quantity', String(d.qty), 'Pcs'],
    ['Value', grouped2(unit * d.qty), 'Rs.'],
  ];
  const prof: KV[] = [['Profile Color', d.colorName || '—'], ['MeshType', hasMesh(d) ? 'Yes' : 'No'], ...profileRows(d)];
  const acc = accessoryRows(d);
  const n = Math.max(prof.length, acc.length);
  const spec: [string, string, string, string][] = Array.from({ length: n }, (_, i) => [prof[i]?.[0] ?? '', prof[i]?.[1] ?? '', acc[i]?.[0] ?? '', acc[i]?.[1] ?? '']);
  const specH = spec.map((r) => kvRowH(SPEC_COLS, r));
  const remarks = String(d.note || '').trim();
  const remH = kvRowH(REM_COLS, [`Remarks : ${remarks}`]);

  const leftH = FIG_H + CAP_H + 6 + KV * (computed.length + 1);
  const rightH = KV + specH.reduce((s, h) => s + h, 0);
  const height = infoH.reduce((s, h) => s + h, 0) + ITEM_GAP + Math.max(leftH, rightH) + ITEM_GAP + remH + ITEM_MARGIN;
  return { info, infoH, computed, spec, specH, remarks, remH, height };
}

// ---------------------------------------------------------------- header

interface HeadMetrics {
  topH: number;
  total: number;
}

function headMetrics(c: PrintCompany): HeadMetrics {
  const addr = c.address ? estLines(c.address, HEAD_RIGHT_W, 10) : 0;
  const contact = [c.phone, c.email, c.gstin].filter(Boolean).length;
  const rightH = (c.logo ? LOGO_H + 4 : 0) + 14 + 18 + addr * 13 + contact * 13;
  const leftH = Math.max(c.headerImage ? HEADER_IMG_H : 0, c.partnerLogo ? 70 : 52);
  const topH = Math.ceil(Math.max(leftH, rightH)) + 2;
  return { topH, total: topH + QUOTELINE_H };
}

function QuoteHead({ c, quote, date, m }: { c: PrintCompany; quote: QuoteHeader; date: string; m: HeadMetrics }) {
  return (
    <div className="qh" style={{ height: m.total }}>
      <div className="qh-top" style={{ height: m.topH }}>
        <div className="qh-left">
          {c.headerImage && <img className="qh-himg" src={c.headerImage} alt="" style={{ maxWidth: c.partnerLogo ? 220 : 185 }} />}
          {c.partnerLogo ? (
            <img className="qh-plogo" src={c.partnerLogo} alt="" />
          ) : (
            <div className="qh-wm">
              <div className="qh-wm-brand">{c.partnerBrand}</div>
              <div className="qh-wm-tag">WINDOW SYSTEMS</div>
            </div>
          )}
        </div>
        <div className="qh-right" style={{ width: HEAD_RIGHT_W }}>
          {c.logo && <img className="qh-logo" src={c.logo} alt="" />}
          <div className="qh-tag">{c.tagline || 'AUTHORISED PARTNER'}</div>
          <div className="qh-name">{c.name}</div>
          {c.address && <div className="qh-addr">{c.address}</div>}
          {c.phone && <div className="qh-line">Contact No. : {c.phone}</div>}
          {c.email && <div className="qh-line">Email : {c.email}</div>}
          {c.gstin && <div className="qh-line">GSTIN : {c.gstin}</div>}
        </div>
      </div>
      <div className="qh-rule" />
      <div className="qh-quoteline">{`Quote No. : ${quote.quoteNo || ''} / Project : ${quote.projectName || ''}  / Date :${date}`}</div>
    </div>
  );
}

// ---------------------------------------------------------------- item block

function Lbl({ k, v }: { k: string; v: string }) {
  return (
    <>
      <span className="q-lbl">{k} :</span> {v}
    </>
  );
}

function ItemBlock({ d, spec }: { d: QuotationDesign; spec: ItemSpec }) {
  return (
    <div className="q-item">
      <table className="rt q-info">
        <colgroup>
          {INFO_COLS.map((c, i) => (
            <col key={i} style={{ width: c.w }} />
          ))}
        </colgroup>
        <tbody>
          {spec.info.map(([a, b], i) => (
            <tr key={i}>
              <td>
                <Lbl k={a[0]} v={a[1]} />
              </td>
              <td className="q-v">
                <Lbl k={b[0]} v={b[1]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="q-item-body">
        <div className="q-item-left" style={{ width: LEFT_W }}>
          <DesignFigure design={d} height={FIG_H} showDims showLabels />
          <div className="q-cap">View From Inside</div>
          <table className="rt q-computed">
            <colgroup>
              {COMP_COLS.map((c, i) => (
                <col key={i} style={{ width: c.w }} />
              ))}
            </colgroup>
            <tbody>
              <tr className="rt-sub">
                <td colSpan={3}>Computed Values</td>
              </tr>
              {spec.computed.map(([k, v, u]) => (
                <tr key={k} className={k === 'Value' ? 'rt-strong' : undefined}>
                  <td className="q-k">{k}</td>
                  <td className="num">{v}</td>
                  <td>{u}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="q-item-right" style={{ width: RIGHT_W }}>
          <table className="rt q-kv">
            <colgroup>
              {SPEC_COLS.map((c, i) => (
                <col key={i} style={{ width: c.w }} />
              ))}
            </colgroup>
            <tbody>
              <tr className="rt-sub">
                <td colSpan={2}>Profile</td>
                <td colSpan={2}>Accessories</td>
              </tr>
              {spec.spec.map((r, i) => (
                <tr key={i}>
                  <td className="q-k">{r[0]}</td>
                  <td className="q-v">{r[1]}</td>
                  <td className="q-k">{r[2]}</td>
                  <td className="q-v">{r[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <table className="rt q-rem">
        <tbody>
          <tr>
            <td className="q-v">
              <Lbl k="Remarks" v={spec.remarks} />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- quote total

interface TotalRow {
  k: string;
  v: string;
  unit: string;
  bold?: boolean;
}

const ALWAYS_SHOW = [/^basic\s*value$/i, /^total\s*project\s*cost$/i, /^gst\b/i, /^grand\s*total$/i];
const BOLD_HEADS = [/^basic\s*value$/i, /^sub\s*total$/i, /^total\s*project\s*cost$/i, /^grand\s*total$/i];
const TOTAL_COLS = [{ w: 430 }, { w: 190 }, { w: 102 }];

function quoteTotalRows(summary: QuoteSummary): TotalRow[] {
  const rows: TotalRow[] = [
    { k: 'No. of Components', v: String(summary.qty ?? 0), unit: 'Pcs' },
    { k: 'Total Area', v: fixed2(summary.areaSqft), unit: 'Sq.Ft.' },
  ];
  const heads = (summary.heads ?? []).filter((h) => h.visibility === 'summary');
  heads.forEach((h, i) => {
    const name = String(h.name || '').trim();
    const last = i === heads.length - 1;
    const value = Number(h.value) || 0;
    if (!last && !ALWAYS_SHOW.some((r) => r.test(name)) && Math.abs(value) < 0.005) return;
    const label = h.calcType === 'Percentage' && Number(h.rate) > 0 ? `${name} (${pct(h.rate)})` : name;
    rows.push({ k: label, v: grouped2(value), unit: 'Rs.', bold: last || BOLD_HEADS.some((r) => r.test(name)) });
  });
  rows.push({ k: 'Average Price per Sq.Ft. without GST', v: grouped2(summary.sqftRate), unit: 'Rs.' });
  rows.push({ k: 'Average Price per Sq.Ft.', v: grouped2(summary.sqftRateWithTax), unit: 'Rs.' });
  return rows;
}

function QuoteTotal({ rows }: { rows: TotalRow[] }) {
  return (
    <div className="q-total">
      <table className="rt q-total-t">
        <colgroup>
          {TOTAL_COLS.map((c, i) => (
            <col key={i} style={{ width: c.w }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th colSpan={3}>Quote Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={r.bold ? 'rt-strong' : undefined}>
              <td>{r.k}</td>
              <td className="num">{r.v}</td>
              <td>{r.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- brand details

interface BrandStyle {
  color: string;
  fill?: boolean;
  italic?: boolean;
  spacing?: number;
}

const BRAND_STYLES: Record<string, BrandStyle> = {
  PROMINANCE: { color: '#0b7aa8', spacing: 0.1 },
  'JSW STEEL': { color: '#c62828', italic: true },
  'KIN LONG': { color: '#c62828', fill: true },
  KINLONG: { color: '#c62828', fill: true },
  SIEGENIA: { color: '#1f2937', spacing: 0.06 },
  DEKA: { color: '#0d47a1', fill: true },
  DNV: { color: '#00695c' },
  PTA: { color: '#4527a0', italic: true },
  BOSS: { color: '#e65100', fill: true },
  'MCCOY SOUDAL': { color: '#ad1457' },
  'SAINT-GOBAIN': { color: '#1565c0', spacing: 0.04 },
  AIS: { color: '#2e7d32', fill: true },
  RAMSARA: { color: '#6a1b9a' },
};
const PALETTE = ['#0d47a1', '#c62828', '#2e7d32', '#6a1b9a', '#e65100', '#00695c', '#ad1457', '#1f2937'];

function brandStyle(name: string): CSSProperties {
  const key = name.trim().toUpperCase();
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const s = BRAND_STYLES[key] ?? { color: PALETTE[hash % PALETTE.length] };
  const base: CSSProperties = { borderColor: s.color, fontStyle: s.italic ? 'italic' : undefined, letterSpacing: s.spacing ? `${s.spacing}em` : undefined };
  return s.fill ? { ...base, background: s.color, color: '#ffffff' } : { ...base, color: s.color };
}

const BRAND_ROW = 36;
const BRAND_HALF = (CONTENT_W - 12) / 2;

interface BrandGroup {
  label: string;
  names: string[];
  wide: boolean;
  lines: number;
}

function brandGroups(c: PrintCompany): BrandGroup[] {
  return c.brands
    .map((g) => ({ label: String(g.label || '').trim(), names: (g.names ?? []).map((n) => String(n).trim()).filter(Boolean) }))
    .filter((g) => g.label || g.names.length)
    .map((g) => {
      const w = textWidth(`${g.label} :`, 10.5, true) + 12 + g.names.reduce((s, n) => s + textWidth(n, 11, true) * 1.12 + 26, 0);
      return { ...g, wide: w > BRAND_HALF - 6, lines: w > CONTENT_W - 6 ? 2 : 1 };
    });
}

function brandsH(groups: BrandGroup[]): number {
  let h = 0;
  let open = false;
  for (const g of groups) {
    if (g.wide) {
      open = false;
      h += g.lines * BRAND_ROW;
    } else if (open) open = false;
    else {
      open = true;
      h += BRAND_ROW;
    }
  }
  return h;
}

function BrandDetails({ groups }: { groups: BrandGroup[] }) {
  return (
    <div className="q-brands">
      {groups.map((g, i) => (
        <div key={i} className="q-brand-cell" style={g.wide ? { gridColumn: 'span 2' } : undefined}>
          {g.label && <span className="q-brand-label">{g.label} :</span>}
          {g.names.map((n) => (
            <span key={n} className="q-badge" style={brandStyle(n)}>
              {n}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- text blocks

function Heading({ children, underline = true }: { children: ReactNode; underline?: boolean }) {
  return <div className={`q-h ${underline ? 'q-h-u' : ''}`}>{children}</div>;
}
const HEADING_H = 26;

const LI_INDENT = [12, 40];
const LI_MARKER = 24;

function Li({ marker, text, level = 0 }: { marker: string; text: string; level?: 0 | 1 }) {
  return (
    <div className="q-li" style={{ paddingLeft: LI_INDENT[level] }}>
      <span className="q-li-marker">{marker}</span>
      <span className="q-li-text">
        <RichText text={text} />
      </span>
    </div>
  );
}
const liH = (text: string, level: 0 | 1 = 0) => estLines(plainText(text), CONTENT_W - LI_INDENT[level] - LI_MARKER - 6, 11) * TEXT_LINE + 4;

function Para({ text, bold, indent = 0 }: { text: string; bold?: boolean; indent?: number }) {
  return (
    <p className={`q-text ${bold ? 'q-bold' : ''}`} style={indent ? { paddingLeft: indent } : undefined}>
      <RichText text={text} />
    </p>
  );
}
const paraH = (text: string, indent = 0, bold = false) => estLines(plainText(text), CONTENT_W - indent, 11, bold) * TEXT_LINE + 6;

const BANK_H = 18 + 5 * 17 + 12;

function BankDetails({ company }: { company: PrintCompany }) {
  const b = company.bank;
  const v = (s: string | undefined) => (s && s.trim() ? s.trim() : '—');
  const rows: KV[] = [
    ['Account Name', v(b.accountName)],
    ['Accont Number', v(b.accountNo)],
    ['Bank Name', v(b.bankName)],
    ['IFSC', v(b.ifsc)],
    ['Branch', v(b.branch)],
  ];
  return (
    <div className="q-bank">
      <div className="q-bank-title">Bank Details :</div>
      {rows.map(([k, val]) => (
        <div key={k} className="q-bank-row">
          <span className="q-bank-k">{k}</span>
          <span className="q-bank-sep">:</span>
          <span className="q-bank-v">{val}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- maintenance page (explicit colours – html2canvas renders SVG as images)

const GREEN = '#1e8e3e';
const RED = '#d32f2f';

function TipIcon({ color, children, cross }: { color: string; children: ReactNode; cross?: boolean }) {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" className="mt-icon" aria-hidden="true">
      <circle cx="20" cy="20" r="18.5" fill="#ffffff" stroke={color} strokeWidth="2" />
      <g fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
      {cross && (
        <g>
          <circle cx="31" cy="9" r="7" fill={color} />
          <path d="M28.2 6.2l5.6 5.6M33.8 6.2l-5.6 5.6" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}

const DO_TIPS: { text: string; icon: ReactNode }[] = [
  {
    text: 'USE A SOFT MICROFIBER CLOTH.',
    icon: (
      <>
        <path d="M11 15c3-2 6 2 9 0s6 2 9 0v12c-3 2-6-2-9 0s-6-2-9 0z" />
        <path d="M14 19c2-1 4 1 6 0M20 23c2-1 4 1 6 0" />
      </>
    ),
  },
  {
    text: 'CLEAN WITH MILD SOAP & WATER.',
    icon: (
      <>
        <path d="M12 17h16l-2 13H14z" />
        <path d="M12 17c0-2 2-3 4-3M17 11a2 2 0 1 0 0.1 0M23 9a1.5 1.5 0 1 0 0.1 0M26 13a1.2 1.2 0 1 0 0.1 0" />
      </>
    ),
  },
  {
    text: 'CLEAN THE SLIDING TRACKS AND THE DRAINAGE SLOT HOLES REGULARLY.',
    icon: (
      <>
        <path d="M9 14h22M9 26h22M9 14v12M31 14v12" />
        <path d="M13 20h4M19 20h4M25 20h2" />
        <path d="M15 29l-1 3M21 29l-1 3M27 29l-1 3" />
      </>
    ),
  },
];

const DONT_TIPS: { text: string; icon: ReactNode }[] = [
  {
    text: 'DO NOT USE ABRASIVE PADS OR STEEL WOOL.',
    icon: (
      <>
        <path d="M12 22c0-5 4-8 8-8s8 3 8 8-4 6-8 6-8-1-8-6z" />
        <path d="M15 20c2 2 4-2 6 0s4-2 5 1M15 24c2 1 4-2 6 0s3-1 5 0" />
      </>
    ),
  },
  {
    text: 'DO NOT USE STRONG CHEMICALS, THINNERS OR SOLVENTS.',
    icon: (
      <>
        <path d="M17 9h6v4l3 3v14H14V16l3-3z" />
        <path d="M14 21h12M18 25h4" />
      </>
    ),
  },
  {
    text: 'DO NOT USE SHARP TOOLS TO REMOVE DIRT.',
    icon: (
      <>
        <path d="M10 29l12-12 3 3-12 12z" />
        <path d="M22 17l5-6 3 3-6 5" />
      </>
    ),
  },
  {
    text: 'DO NOT ALLOW CEMENT, PAINT OR CONSTRUCTION DUST TO REMAIN ON THE SURFACE.',
    icon: (
      <>
        <path d="M12 16h16v12a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2z" />
        <path d="M12 16c0-3 16-3 16 0M28 19c3 0 3 6 0 7" />
        <path d="M17 22v3M22 21v5" />
      </>
    ),
  },
];

function Tick({ color = GREEN }: { color?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="mt-tick">
      <circle cx="7" cy="7" r="7" fill={color} />
      <path d="M3.8 7.2l2.1 2.1 4.3-4.4" fill="none" stroke="#ffffff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Cross() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="mt-tick">
      <circle cx="7" cy="7" r="7" fill="#ffffff" />
      <path d="M4.5 4.5l5 5M9.5 4.5l-5 5" stroke={RED} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function MaintenancePanel({ height, company }: { height: number; company: PrintCompany }) {
  return (
    <div className="mt" style={{ height }}>
      <div className="mt-brand">
        <div className="mt-brand-name">{company.partnerBrand}</div>
        <div className="mt-brand-tag">uPVC WINDOW SYSTEMS</div>
      </div>
      <div className="mt-head">
        <div className="mt-title">MAINTENANCE TIPS!</div>
        <div className="mt-sub">uPVC WINDOWS CLEANING</div>
        <div className="mt-intro">Follow these simple Do&apos;s &amp; Don&apos;ts to keep your uPVC windows clean and long lasting.</div>
      </div>
      <div className="mt-sec mt-sec-do">
        <div className="mt-pill mt-pill-do">
          <Tick color="#ffffff" />
          <span>DO&apos;S</span>
        </div>
        {DO_TIPS.map((t) => (
          <div key={t.text} className="mt-item">
            <TipIcon color={GREEN}>{t.icon}</TipIcon>
            <span>{t.text}</span>
          </div>
        ))}
      </div>
      <div className="mt-sec mt-sec-dont">
        <div className="mt-pill mt-pill-dont">
          <Cross />
          <span>DON&apos;TS</span>
        </div>
        {DONT_TIPS.map((t) => (
          <div key={t.text} className="mt-item">
            <TipIcon color={RED} cross>
              {t.icon}
            </TipIcon>
            <span>{t.text}</span>
          </div>
        ))}
      </div>
      <div className="mt-foot">
        <span>
          <Tick /> CLEAN REGULARLY
        </span>
        <span>
          <Tick /> HANDLE GENTLY
        </span>
        <span>
          <Tick /> ENJOY LONG LASTING uPVC WINDOWS
        </span>
      </div>
    </div>
  );
}
/** Minimum height the panel content needs (see .mt in reports.css). */
const MT_MIN_H = 700;

// ---------------------------------------------------------------- builder

function addLetter(b: PageBuilder, src: QuotationSource, company: PrintCompany): void {
  const quote = src.quote;
  const o = quote.opportunity;
  const contact = o?.contactName || [o?.firstName, o?.lastName].filter(Boolean).join(' ');
  const toName = [o?.salutation, contact].filter(Boolean).join(' ').trim() || quote.projectName || '';
  const addr = addressLines(quote);
  const addrH = addr.reduce((s, a) => s + estLines(a, CONTENT_W, 11.5) * LETTER_LINE, 0);
  b.add(
    <div className="q-to">
      <div className="q-bold">To</div>
      <div className="q-bold">{toName}</div>
      {addr.map((a, i) => (
        <div key={i}>{a}</div>
      ))}
    </div>,
    2 * LETTER_LINE + addrH + 44,
  );
  b.add(<p className="q-lt">Dear Customer,</p>, LETTER_LINE + 10);
  for (const raw of company.letter) {
    const t = String(raw ?? '').trim();
    if (!t) continue;
    const sp = subPoint(t);
    b.add(
      sp ? (
        <p className="q-lt q-lt-sub">
          <span className="q-lt-marker">{sp.marker}</span>
          <RichText text={sp.text} />
        </p>
      ) : (
        <p className="q-lt">
          <RichText text={t} />
        </p>
      ),
      estLines(plainText(sp ? sp.text : t), CONTENT_W - (sp ? 60 : 0), 11.5) * LETTER_LINE + 10,
    );
  }
  b.add(
    <div className="q-sig">
      <p className="q-lt">
        For <b>{company.name}</b> ,
      </p>
      <div className="q-sig-gap" />
      <p className="q-lt">Authorized Signatory</p>
    </div>,
    2 * (LETTER_LINE + 10) + 50,
  );
}

export function buildQuotationPages(src: QuotationSource): ReactNode[][] {
  const company = printCompany(src.company);
  const { quote, summary } = src;
  const date = istDate(src.generatedAt);
  const m = headMetrics(company);
  const b = new PageBuilder(Q_BUDGET, { render: () => <QuoteHead c={company} quote={quote} date={date} m={m} />, h: m.total, onFirst: true });

  // ---- page 1: covering letter only
  addLetter(b, src, company);
  b.newPage();

  // ---- items, at most two per page
  if (!src.designs.length) b.add(<div className="rp-nodata">No designs have been added to this quote yet.</div>, 120);
  let onPage = 0;
  let lastPage = -1;
  src.designs.forEach((d) => {
    const spec = itemSpec(d);
    if (b.pageIndex === lastPage && onPage >= 2) b.newPage();
    b.add(<ItemBlock d={d} spec={spec} />, spec.height);
    if (b.pageIndex !== lastPage) {
      lastPage = b.pageIndex;
      onPage = 0;
    }
    onPage += 1;
  });

  // ---- quote total + notes
  const totalRows = quoteTotalRows(summary);
  const totalH = (totalRows.length + 1) * 21 + 14;
  const notes = (company.notes || '').trim();
  const notesH = estLines(`Notes : ${notes}`, CONTENT_W, 11) * TEXT_LINE + 10;
  b.add(<QuoteTotal rows={totalRows} />, totalH, notesH);
  b.add(
    <p className="q-text q-notes">
      <b>Notes :</b> {notes}
    </p>,
    notesH,
  );

  // ---- brand details & terms
  b.breakPage();
  const groups = brandGroups(company);
  if (groups.length) {
    b.add(<Heading underline={false}>BRAND DETAILS:</Heading>, HEADING_H, brandsH(groups));
    b.add(<BrandDetails groups={groups} />, brandsH(groups) + 10);
  }

  b.add(<Heading>Terms and Conditions:-</Heading>, HEADING_H, liH('Payments terms: -') + 40);
  const payment = company.paymentTerms.map((t) => String(t ?? '').trim()).filter(Boolean);
  b.add(<Li marker="1." text="Payments terms: -" />, liH('Payments terms: -'), payment.length ? liH(payment[0], 1) : 0);
  payment.forEach((t, i) => b.add(<Li marker={`${String.fromCharCode(97 + (i % 26))}.`} text={t} level={1} />, liH(t, 1)));

  const terms = company.terms.map((t) => String(t ?? '').trim()).filter(Boolean);
  const bankAt = Math.min(Math.max(-1, Math.floor(company.bankDetailsAfter)), terms.length - 1);
  if (bankAt < 0) b.add(<BankDetails company={company} />, BANK_H);
  terms.forEach((t, i) => {
    b.add(<Li marker={`${i + 2}.`} text={t} />, liH(t));
    if (i === bankAt) b.add(<BankDetails company={company} />, BANK_H);
  });

  const wTitle = company.warrantyTitle.trim();
  const warranty = (company.warranty || '').trim();
  const points = company.warrantyPoints.map((p) => String(p ?? '').trim()).filter(Boolean);
  if (wTitle || warranty || points.length) {
    b.add(<Heading>Warranty Clarification:</Heading>, HEADING_H, wTitle ? paraH(wTitle, 0, true) : warranty ? Math.min(paraH(warranty), 100) : 0);
    if (wTitle) b.add(<Para text={wTitle} bold />, paraH(wTitle, 0, true));
    if (warranty) b.add(<Para text={warranty} />, paraH(warranty));
    points.forEach((p) => b.add(<Para text={p} indent={30} />, paraH(p, 30)));
  }

  // ---- warranty note, prerequisites & acceptance
  b.breakPage();
  const note = company.warrantyNote.trim();
  if (note) b.add(<Para text={note} bold />, paraH(note, 0, true) + 6);
  const prereq = company.prerequisites.map((p) => String(p ?? '').trim()).filter(Boolean);
  if (prereq.length) {
    b.add(<Heading>Pre-Requisites for installation of Windows:-</Heading>, HEADING_H, liH(prereq[0]));
    let n = 0;
    for (const p of prereq) {
      const sp = subPoint(p);
      if (sp) b.add(<Li marker={sp.marker} text={sp.text} level={1} />, liH(sp.text, 1));
      else b.add(<Li marker={`${++n}.`} text={p} />, liH(p));
    }
  }
  const acceptance = company.acceptance.trim();
  if (acceptance) {
    b.add(
      <div className="q-accept">
        <Para text={acceptance} />
      </div>,
      paraH(acceptance) + 12,
      90,
    );
  }
  b.add(
    <div className="q-signs">
      <span>Authorized Signatory</span>
      <span>Signature of Customer</span>
    </div>,
    90,
  );

  // ---- maintenance tips
  b.breakPage();
  const panelH = Math.max(MT_MIN_H, Math.min(880, b.remaining - 6));
  b.add(<MaintenancePanel company={company} height={panelH} />, panelH);

  return b.done();
}
