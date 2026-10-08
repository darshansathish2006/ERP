import type { ReactNode } from 'react';
import type { BomLine, ReportData } from '../../lib/types';
import { fixed2 } from '../../lib/format';
import { type Col, ROW_H, headHeight, rowHeight } from '../engine';
import { RTable, SECTION_H, SectionTitle, alignCls, f3, mm } from '../parts';
import { addEvaHead, addProjectsBlock, internalBuilder, sumBy } from './common';

const TITLE = 'Glass BOQ';

export const PANE_COLS: Col[] = [
  { label: 'Design Ref', w: 70 },
  { label: 'Pane', w: 58, align: 'center' },
  { label: 'Glass', w: 214 },
  { label: 'Width (mm)', w: 70, align: 'right' },
  { label: 'Height (mm)', w: 70, align: 'right' },
  { label: 'Qty', w: 46, align: 'right' },
  { label: 'Area/pc (Sqm)', w: 94, align: 'right' },
  { label: 'Total Area (Sqm)', w: 100, align: 'right' },
];

export const GLASS_SUM_COLS: Col[] = [
  { label: 'Glass', w: 270 },
  { label: 'Code', w: 120 },
  { label: 'Total Area (Sqm)', w: 110, align: 'right' },
  { label: 'Rate', w: 100, align: 'right' },
  { label: 'Amount', w: 122, align: 'right' },
];

export interface PaneRow {
  ref: string;
  label: string;
  glass: string;
  w: number;
  h: number;
  qty: number;
  area: number;
}

export function glassPaneRows(data: ReportData): { glass: PaneRow[]; mesh: PaneRow[] } {
  const glass: PaneRow[] = [];
  const mesh: PaneRow[] = [];
  for (const d of data.designs) {
    for (const p of d.bom?.panes ?? []) glass.push({ ref: d.ref, label: p.label, glass: p.name, w: p.w, h: p.h, qty: d.qty, area: p.area });
    for (const p of d.bom?.meshPanes ?? []) mesh.push({ ref: d.ref, label: p.label, glass: p.name, w: p.w, h: p.h, qty: d.qty, area: p.area });
  }
  return { glass, mesh };
}

export function paneCells(r: PaneRow): string[] {
  return [r.ref, r.label, r.glass, mm(r.w), mm(r.h), String(r.qty), f3(r.area), f3(r.area * r.qty)];
}

export function glassSummaryLines(data: ReportData): BomLine[] {
  return data.lines.filter((l) => l.category === 'glass' || l.category === 'mesh');
}

function summaryCells(l: BomLine): string[] {
  return [l.name, l.code, f3(l.qty), fixed2(l.rate), fixed2(l.amount)];
}

function addPaneTable(b: ReturnType<typeof internalBuilder>, title: string, rows: PaneRow[], emptyText: string): void {
  const totQty = sumBy(rows, (r) => r.qty);
  const totArea = sumBy(rows, (r) => r.area * r.qty);
  b.table({
    items: rows,
    rowH: (r) => rowHeight(PANE_COLS, paneCells(r)),
    headH: headHeight(PANE_COLS),
    footH: ROW_H,
    title: (cont) => <SectionTitle sub={cont ? '(contd.)' : undefined}>{title}</SectionTitle>,
    titleH: SECTION_H,
    render: (chunk, info) => (
      <RTable
        cols={PANE_COLS}
        foot={
          info.last && rows.length > 0 ? (
            <tr className="rt-total">
              <td colSpan={5} className="num">
                Total
              </td>
              <td className="num">{totQty}</td>
              <td />
              <td className="num">{f3(totArea)}</td>
            </tr>
          ) : undefined
        }
      >
        {chunk.length === 0 && (
          <tr>
            <td colSpan={PANE_COLS.length} className="ctr rt-empty">
              {emptyText}
            </td>
          </tr>
        )}
        {chunk.map((r, i) => (
          <tr key={`${r.ref}-${r.label}-${i}`}>
            {paneCells(r).map((c, j) => (
              <td key={j} className={alignCls(PANE_COLS[j].align)}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </RTable>
    ),
  });
}

export function buildGlassBoqPages(data: ReportData): ReactNode[][] {
  const b = internalBuilder(data, TITLE);
  addEvaHead(b, data, TITLE);
  addProjectsBlock(b, data);

  const { glass, mesh } = glassPaneRows(data);
  addPaneTable(b, 'Glass Panes', glass, 'No glass panes in this quote');
  if (mesh.length) addPaneTable(b, 'Mesh Panes', mesh, 'No mesh panes');

  const lines = glassSummaryLines(data);
  const totalArea = sumBy(lines, (l) => l.qty);
  const totalAmt = sumBy(lines, (l) => l.amount);
  b.table({
    items: lines,
    rowH: (l) => rowHeight(GLASS_SUM_COLS, summaryCells(l)),
    headH: headHeight(GLASS_SUM_COLS),
    footH: ROW_H,
    title: (cont) => <SectionTitle sub={cont ? '(contd.)' : undefined}>Summary by Glass</SectionTitle>,
    titleH: SECTION_H,
    render: (chunk, info) => (
      <RTable
        cols={GLASS_SUM_COLS}
        foot={
          info.last && lines.length > 0 ? (
            <tr className="rt-total">
              <td colSpan={2} className="num">
                Total
              </td>
              <td className="num">{f3(totalArea)}</td>
              <td />
              <td className="num">{fixed2(totalAmt)}</td>
            </tr>
          ) : undefined
        }
      >
        {chunk.length === 0 && (
          <tr>
            <td colSpan={GLASS_SUM_COLS.length} className="ctr rt-empty">
              No glass in this quote
            </td>
          </tr>
        )}
        {chunk.map((l) => (
          <tr key={l.code}>
            {summaryCells(l).map((c, j) => (
              <td key={j} className={alignCls(GLASS_SUM_COLS[j].align)}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </RTable>
    ),
  });
  return b.done();
}
