import type { ReactNode } from 'react';
import type { ReportData, ReportDesign } from '../../lib/types';
import { fixed2 } from '../../lib/format';
import { type Col, estLines } from '../engine';
import { DesignFigure, EmptyRow, RTable, alignCls, dash, mm } from '../parts';
import { addEvaHead, internalBuilder, sumBy } from './common';

const TITLE = 'Window Schedule';

export const WS_COLS: Col[] = [
  { label: 'Sl No', w: 26, align: 'center' },
  { label: 'Design Ref', w: 66 },
  { label: 'Name', w: 64 },
  { label: 'Location', w: 62 },
  { label: 'Floor', w: 38 },
  { label: 'W (mm)', w: 40, align: 'right' },
  { label: 'H (mm)', w: 40, align: 'right' },
  { label: 'Qty', w: 28, align: 'right' },
  { label: 'Area/pc (Sqft)', w: 48, align: 'right' },
  { label: 'Total Area', w: 52, align: 'right' },
  { label: 'System', w: 92 },
  { label: 'Colour', w: 58 },
  { label: 'Glass', w: 108 },
];

/** `.rt-sm` metrics: 9.5px text on a 12px line, 3px/4px padding. */
const SM_LINE = 12;
const THUMB_H = 38;
const MIN_ROW = SM_LINE + 2 + THUMB_H + 8;

function smRowH(cells: string[], min = 0, bold = false): number {
  let lines = 1;
  cells.forEach((c, i) => {
    lines = Math.max(lines, estLines(c, (WS_COLS[i]?.w ?? 60) - 8, 9.5, bold));
  });
  return Math.max(min, lines * SM_LINE + 9);
}

export function glassText(d: Pick<ReportDesign, 'glassLabels' | 'glassName'>): string {
  return d.glassLabels?.length ? d.glassLabels.join('\n') : d.glassName || '—';
}

export function scheduleCells(d: ReportDesign, i: number): string[] {
  return [
    String(i + 1),
    d.ref,
    dash(d.name),
    dash(d.location),
    dash(d.floor),
    mm(d.data?.width),
    mm(d.data?.height),
    String(d.qty),
    fixed2(d.areaSqft),
    fixed2((Number(d.areaSqft) || 0) * d.qty),
    dash(d.systemName),
    dash(d.colorName),
    glassText(d),
  ];
}

export function buildWindowSchedulePages(data: ReportData): ReactNode[][] {
  const b = internalBuilder(data, TITLE);
  addEvaHead(b, data, TITLE);

  const rows = data.designs.map((d, i) => ({ d, i }));
  const totalQty = sumBy(data.designs, (d) => d.qty);
  const totalArea = sumBy(data.designs, (d) => (Number(d.areaSqft) || 0) * d.qty);

  b.table({
    items: rows,
    rowH: ({ d, i }) => smRowH(scheduleCells(d, i), MIN_ROW),
    headH: smRowH(
      WS_COLS.map((c) => String(c.label)),
      0,
      true,
    ),
    footH: SM_LINE + 10,
    minRows: 3,
    render: (chunk, info) => (
      <RTable
        cols={WS_COLS}
        className="rt-sm rp-ws"
        foot={
          info.last && rows.length > 0 ? (
            <tr className="rt-total">
              <td colSpan={7} className="num">
                Total
              </td>
              <td className="num">{totalQty}</td>
              <td />
              <td className="num">{fixed2(totalArea)}</td>
              <td colSpan={3} />
            </tr>
          ) : undefined
        }
      >
        {chunk.length === 0 && <EmptyRow span={WS_COLS.length} text="No designs have been added to this quote yet." />}
        {chunk.map(({ d, i }) => (
          <tr key={d.id}>
            {scheduleCells(d, i).map((c, j) => (
              <td key={j} className={alignCls(WS_COLS[j].align)}>
                {j === 1 ? (
                  <>
                    <div className="rp-ws-ref">{c}</div>
                    <DesignFigure design={d} height={THUMB_H} showDims={false} showNumbers={false} className="rp-ws-thumb" />
                  </>
                ) : (
                  c
                )}
              </td>
            ))}
          </tr>
        ))}
      </RTable>
    ),
  });
  return b.done();
}
