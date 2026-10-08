import type { ReactNode } from 'react';
import type { CostHead, ReportData, ReportDesign } from '../../lib/types';
import { fixed2, grouped2 } from '../../lib/format';
import { type Col, PageBuilder, ROW_H, headHeight, rowHeight } from '../engine';
import { EmptyRow, RTable, alignCls, f3 } from '../parts';
import { addEvaHead, internalBuilder, sumBy } from './common';

const TITLE = 'Quote Cost Summary Report';

export const HEAD_COLS: Col[] = [
  { label: 'Price Element Name', w: 172 },
  { label: 'Calculation Type', w: 142 },
  { label: 'Formula', w: 236 },
  { label: 'Rate', w: 74, align: 'right' },
  { label: 'Value', w: 98, align: 'right' },
];

/** A cost head row as printed (summary heads, per-design heads or the synthetic adjustment row). */
export interface HeadRow {
  name: string;
  calcType: string;
  formula: string;
  rate: number;
  value: number;
  bold: boolean;
}

/** EvA shows formulas with resolved references: `[Head]` → `@Head.value`, `#AREASQFT` → `#AreaSqftFg` … */
export function evaFormula(formula: string | null | undefined): string {
  return String(formula ?? '')
    .replace(/\[([^\]]+)\]/g, (_m, name: string) => `@${name.trim()}.value`)
    .replace(/#([A-Za-z0-9_]+)/g, (m: string, v: string) => {
      const u = v.toUpperCase();
      if (u === 'AREASQFT') return '#AreaSqftFg';
      if (u === 'AREASQM') return '#AreaSqmFg';
      if (u === 'LUMPSUM') return '1';
      if (u === 'DESIGNADDON' || u === 'MANUALADJUSTMENT') return '0';
      return m;
    });
}

/** Heads that sum other heads (Total Raw Material Cost, Basic Value, Grand Total …) are bold. */
export function isSumHead(h: Pick<CostHead, 'calcType' | 'formula'>): boolean {
  return h.calcType === 'CustomFormula' && /\[[^\]]+\]/.test(String(h.formula ?? ''));
}

/** Manual-rate adjustment of one design per unit (manual basic − auto basic). */
export function designAdjustment(d: Pick<ReportDesign, 'calcType' | 'price'>): number {
  const p = d.price;
  if (d.calcType !== 'manual' || !p || p.manualBasic == null) return 0;
  return (Number(p.manualBasic) || 0) - (Number(p.autoBasic) || 0);
}

/**
 * Printed rows for a list of heads. When `adjustment` is set (a design priced with a manual
 * rate), a "DesignAutoAdjustment" row is inserted just before the FREEZE RATE head.
 */
export function headRows(heads: (CostHead & { value: number })[], adjustment: number | null): HeadRow[] {
  const rows: HeadRow[] = [];
  let inserted = adjustment == null;
  const adjRow = (): HeadRow => ({ name: 'DesignAutoAdjustment', calcType: 'ManualPriceAutoAdjustment', formula: '1', rate: adjustment ?? 0, value: adjustment ?? 0, bold: false });
  for (const h of heads) {
    if (!inserted && h.calcType === 'ManualPriceAutoAdjustment') {
      rows.push(adjRow());
      inserted = true;
    }
    rows.push({ name: h.name, calcType: h.calcType, formula: evaFormula(h.formula), rate: Number(h.rate) || 0, value: Number(h.value) || 0, bold: isSumHead(h) });
  }
  if (!inserted) {
    // no FREEZE RATE head – print the adjustment before the first summary head
    const at = rows.findIndex((_r, i) => heads[i]?.visibility === 'summary');
    rows.splice(at < 0 ? rows.length : at, 0, adjRow());
  }
  return rows;
}

export function headCells(h: HeadRow): string[] {
  return [h.name, h.calcType, h.formula, h.rate.toFixed(4), fixed2(h.value)];
}

/** Adds a "Name | Calculation type | Formula | Rate | Value" table; shared with the typology report. */
export function addHeadsTable(b: PageBuilder, rows: HeadRow[], title?: (cont: boolean) => ReactNode, titleH = 0, cols: Col[] = HEAD_COLS): void {
  b.table({
    items: rows,
    rowH: (h) => rowHeight(cols, headCells(h), h.bold ? 10.5 * 1.06 : 10.5),
    headH: headHeight(cols),
    title,
    titleH,
    render: (chunk) => (
      <RTable cols={cols} className="rt-heads">
        {chunk.length === 0 && <EmptyRow span={cols.length} text="No price elements" />}
        {chunk.map((h, i) => (
          <tr key={`${h.name}-${i}`} className={h.bold ? 'rt-strong' : undefined}>
            {headCells(h).map((c, j) => (
              <td key={j} className={alignCls(cols[j].align)}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </RTable>
    ),
  });
}

/** Total manual-rate adjustment of the quote (all designs × qty), or null when no design uses a manual rate. */
export function quoteAdjustment(data: ReportData): number | null {
  const manual = data.designs.filter((d) => d.calcType === 'manual' && d.price?.manualBasic != null);
  return manual.length ? sumBy(manual, (d) => designAdjustment(d) * d.qty) : null;
}

export const SUM_COLS: Col[] = [
  { label: '', w: 150 },
  { label: '', w: 211 },
  { label: '', w: 150 },
  { label: '', w: 211 },
];

export function summaryFooter(data: ReportData): [string, string, string, string][] {
  const s = data.summary;
  return [
    ['Total Qty', String(s.qty), 'Total Area', `${f3(s.areaSqft)} Sqft.   ${f3(s.areaSqm)} Sqmt.`],
    ['Price per Sqft', `INR ${grouped2(s.sqftRateWithTax)}`, 'Price per Sqmt', `INR ${grouped2(s.sqmRateWithTax)}`],
  ];
}

export function buildCostSummaryPages(data: ReportData): ReactNode[][] {
  const b = internalBuilder(data, TITLE);
  addEvaHead(b, data, TITLE, {
    extra: [
      <>
        Price Structure : <b>{data.quote.priceStructureName || '—'}</b>
      </>,
    ],
  });
  addHeadsTable(b, headRows(data.summary.heads, quoteAdjustment(data)));

  const foot = summaryFooter(data);
  b.add(
    <table className="rt rp-sumtable">
      <colgroup>
        {SUM_COLS.map((c, i) => (
          <col key={i} style={{ width: c.w }} />
        ))}
      </colgroup>
      <tbody>
        {foot.map((r, i) => (
          <tr key={i}>
            <td className="rp-sum-k">{r[0]}</td>
            <td>{r[1]}</td>
            <td className="rp-sum-k">{r[2]}</td>
            <td>{r[3]}</td>
          </tr>
        ))}
      </tbody>
    </table>,
    foot.length * ROW_H + 14,
  );
  return b.done();
}
