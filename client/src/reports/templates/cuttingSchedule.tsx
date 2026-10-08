import type { ReactNode } from 'react';
import type { ProfileBar, ReportData } from '../../lib/types';
import { type Col, ROW_H, headHeight, rowHeight } from '../engine';
import { RTable, SectionTitle, alignCls, colourName, f3, mm } from '../parts';
import { addEvaHead, addProjectsBlock, internalBuilder, sumBy } from './common';

const TITLE = 'Cutting Schedule Report';
const CUT_CATEGORIES = ['profile', 'aluminium', 'reinforcement'];

export const CUT_COLS: Col[] = [
  { label: 'Design Ref', w: 92 },
  { label: 'Member', w: 250 },
  { label: 'Cut length (mm)', w: 120, align: 'right' },
  { label: 'Angle', w: 120, align: 'center' },
  { label: 'Qty', w: 140, align: 'right' },
];

export const BAR_OPT_COLS: Col[] = [
  { label: 'Bar #', w: 56, align: 'center' },
  { label: 'Cuts in bar (mm)', w: 430 },
  { label: 'Used (mm)', w: 118, align: 'right' },
  { label: 'Offcut (mm)', w: 118, align: 'right' },
];

export interface CutRow {
  ref: string;
  member: string;
  length: number;
  angle: string;
  qty: number;
}

export interface CutGroup {
  code: string;
  name: string;
  category: string;
  color: string;
  rows: CutRow[];
  bar?: ProfileBar;
}

/** Cuts of every design grouped by profile code (quantities multiplied by design qty). */
export function cutGroups(data: ReportData): CutGroup[] {
  const groups = new Map<string, CutGroup>();
  const barByCode = new Map((data.bars ?? []).map((b) => [b.code, b]));
  for (const d of data.designs) {
    for (const c of d.bom?.cuts ?? []) {
      if (!CUT_CATEGORIES.includes(c.category)) continue;
      let g = groups.get(c.code);
      if (!g) {
        const bar = barByCode.get(c.code);
        const color =
          bar?.color ?? (c.category === 'reinforcement' ? '—' : c.category === 'aluminium' ? 'WHITE' : `Inside-${d.colorInside || d.colorName}, Outside-${d.colorOutside || d.colorName}`);
        g = { code: c.code, name: c.name, category: c.category, color: colourName(color), rows: [], bar };
        groups.set(c.code, g);
      }
      const qty = c.qty * d.qty;
      const same = g.rows.find((r) => r.ref === d.ref && r.member === c.member && r.length === c.length && r.angle === c.angle);
      if (same) same.qty += qty;
      else g.rows.push({ ref: d.ref, member: c.member, length: c.length, angle: c.angle, qty });
    }
  }
  return [...groups.values()].sort((a, b) => CUT_CATEGORIES.indexOf(a.category) - CUT_CATEGORIES.indexOf(b.category));
}

export function cutCells(r: CutRow): string[] {
  return [r.ref, r.member, mm(r.length), r.angle, String(r.qty)];
}

/** "1505 × 2, 1455" */
export function barCutsText(cuts: number[]): string {
  const counts = new Map<number, number>();
  for (const c of cuts) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts.entries()].map(([len, n]) => (n > 1 ? `${mm(len)} × ${n}` : mm(len))).join(', ');
}

function barCells(bar: { cuts: number[]; used: number; offcut: number }, i: number): string[] {
  return [String(i + 1), barCutsText(bar.cuts), mm(bar.used), mm(bar.offcut)];
}

function GroupHead({ g, cont }: { g: CutGroup; cont: boolean }) {
  return (
    <div className="rp-cut-head">
      <span className="rp-cut-name">
        {g.name}
        {cont ? ' (contd.)' : ''}
      </span>
      <span>
        Code: <b>{g.code}</b>
      </span>
      <span className="rp-cut-color">
        Colour: <b>{g.color}</b>
      </span>
    </div>
  );
}
const GROUP_HEAD_H = 32;

export function buildCuttingSchedulePages(data: ReportData): ReactNode[][] {
  const b = internalBuilder(data, TITLE);
  addEvaHead(b, data, TITLE);
  addProjectsBlock(b, data);

  const groups = cutGroups(data);
  if (!groups.length) {
    b.add(<div className="rp-nodata">No profile cuts in this quote.</div>, 120);
    return b.done();
  }

  for (const g of groups) {
    const pcs = sumBy(g.rows, (r) => r.qty);
    const length = sumBy(g.rows, (r) => r.qty * r.length) / 1000;
    b.table({
      items: g.rows,
      rowH: (r) => rowHeight(CUT_COLS, cutCells(r)),
      headH: headHeight(CUT_COLS),
      footH: ROW_H,
      minRows: 3,
      title: (cont) => <GroupHead g={g} cont={cont} />,
      titleH: GROUP_HEAD_H,
      gap: g.bar ? 10 : 14,
      render: (chunk, info) => (
        <RTable
          cols={CUT_COLS}
          foot={
            info.last ? (
              <tr className="rt-total">
                <td colSpan={2} className="num">
                  Total
                </td>
                <td className="num">{f3(length)} m</td>
                <td />
                <td className="num">{pcs} Pcs</td>
              </tr>
            ) : undefined
          }
        >
          {chunk.map((r, i) => (
            <tr key={`${r.ref}-${r.member}-${r.length}-${i}`}>
              {cutCells(r).map((c, j) => (
                <td key={j} className={alignCls(CUT_COLS[j].align)}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </RTable>
      ),
    });

    const bar = g.bar;
    if (bar && bar.bars.length) {
      const items = bar.bars.map((x, i) => ({ x, i }));
      b.table({
        items,
        rowH: ({ x, i }) => rowHeight(BAR_OPT_COLS, barCells(x, i)),
        headH: headHeight(BAR_OPT_COLS),
        gap: 16,
        title: (cont) => (
          <SectionTitle sub={`${bar.pcs} bars · used ${f3(bar.usedQty)} m · wastage ${f3(bar.wastage)} m (${bar.wastagePct}%)`}>
            Bar optimisation – {bar.barLength.toFixed(2)} m bars{cont ? ' (contd.)' : ''}
          </SectionTitle>
        ),
        titleH: 30,
        render: (chunk) => (
          <RTable cols={BAR_OPT_COLS} className="rt-light">
            {chunk.map(({ x, i }) => (
              <tr key={i}>
                {barCells(x, i).map((c, j) => (
                  <td key={j} className={alignCls(BAR_OPT_COLS[j].align)}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </RTable>
        ),
      });
    }
  }
  return b.done();
}

export { barCells as barOptimisationCells };
