import type { ReactNode } from 'react';
import type { BomLine, ReportData } from '../../lib/types';
import { type Col, PageBuilder, headHeight, rowHeight } from '../engine';
import { EmptyRow, RTable, SECTION_H, SectionTitle, VGroupCell, alignCls, ceilQty, colourName, unitShort, vGroupNeed } from '../parts';
import { addDesignRemarks, addEvaHead, addProjectsBlock, internalBuilder } from './common';

const TITLE = 'Accessories BOQ';

export const INSTALLATION_GROUP = 'Installation Hardware';

/** Columns after the narrow vertical group column. */
export const ACC_COLS: Col[] = [
  { label: '', w: 30 },
  { label: 'Sl No.', w: 38, align: 'center' },
  { label: 'Accessories Name', w: 238 },
  { label: 'Code', w: 104 },
  { label: 'Color', w: 64 },
  { label: 'Qty', w: 50, align: 'right' },
  { label: 'Unit', w: 46, align: 'center' },
  { label: 'Package Qty', w: 82, align: 'right' },
  { label: 'Package Unit', w: 70, align: 'center' },
];
const DATA_COLS = ACC_COLS.slice(1);

/** One printed accessory line. */
export interface AccRow {
  sl: number;
  grp: string;
  line: BomLine;
  qty: number;
  unit: string;
  pkgQty: number;
  pkgUnit: string;
  color: string;
}

export function hardwareLines(data: ReportData): BomLine[] {
  return data.lines.filter((l) => l.category === 'hardware');
}

export function reinforcementLines(data: ReportData): BomLine[] {
  return data.lines.filter((l) => l.category === 'reinforcement');
}

export function installationLines(data: ReportData): BomLine[] {
  return hardwareLines(data).filter((l) => l.grp === INSTALLATION_GROUP);
}

/** Purchase rows grouped alphabetically by BOM group (as EvA prints them), quantities rounded up. */
export function accRows(lines: BomLine[]): AccRow[] {
  const groups = new Map<string, BomLine[]>();
  for (const l of lines) {
    const g = l.grp || 'Other';
    groups.set(g, [...(groups.get(g) ?? []), l]);
  }
  const out: AccRow[] = [];
  let sl = 0;
  for (const grp of [...groups.keys()].sort((a, b) => a.localeCompare(b))) {
    const items = [...(groups.get(grp) ?? [])].sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
    for (const line of items) {
      const qty = ceilQty(line.qty);
      const unit = unitShort(line.unit);
      // reinforcement is galvanised steel – the profile colour on its line is meaningless
      const color = line.category === 'reinforcement' ? '—' : colourName(line.color);
      out.push({ sl: ++sl, grp, line, qty, unit, pkgQty: qty, pkgUnit: unit === 'Mtr' ? 'Mtr' : 'Pkg', color });
    }
  }
  return out;
}

export function accCells(r: AccRow): string[] {
  return [String(r.sl), r.line.name, r.line.code, r.color, String(r.qty), r.unit, String(r.pkgQty), r.pkgUnit];
}

interface Item {
  row: AccRow;
  h: number;
  /** extra height on the last row of a short group so the vertical label fits */
  extra: number;
}

function items(rows: AccRow[]): Item[] {
  const out: Item[] = rows.map((row) => ({ row, h: rowHeight(DATA_COLS, accCells(row)), extra: 0 }));
  let i = 0;
  while (i < out.length) {
    let j = i;
    let h = 0;
    while (j < out.length && out[j].row.grp === out[i].row.grp) h += out[j++].h;
    const need = vGroupNeed(out[i].row.grp);
    if (need > h) out[j - 1].extra = need - h;
    i = j;
  }
  return out;
}

function AccTable({ chunk }: { chunk: Item[] }) {
  // contiguous runs of a group inside this chunk get one rowSpan label cell
  const runs = new Map<number, { span: number; height: number }>();
  let i = 0;
  while (i < chunk.length) {
    let j = i;
    let h = 0;
    while (j < chunk.length && chunk[j].row.grp === chunk[i].row.grp) {
      h += chunk[j].h + chunk[j].extra;
      j++;
    }
    runs.set(i, { span: j - i, height: h });
    i = j;
  }
  return (
    <RTable cols={ACC_COLS} className="rp-acc">
      {chunk.length === 0 && <EmptyRow span={ACC_COLS.length} text="No items" />}
      {chunk.map((it, k) => {
        const run = runs.get(k);
        return (
          <tr key={`${it.row.line.code}-${it.row.sl}`} style={it.extra ? { height: it.h + it.extra } : undefined}>
            {run && <VGroupCell grp={it.row.grp} span={run.span} height={run.height} />}
            {accCells(it.row).map((c, j) => (
              <td key={j} className={alignCls(DATA_COLS[j].align)}>
                {c}
              </td>
            ))}
          </tr>
        );
      })}
    </RTable>
  );
}

function addAccTable(b: PageBuilder, title: string, lines: BomLine[]): void {
  b.table({
    items: items(accRows(lines)),
    rowH: (it) => it.h + it.extra,
    headH: headHeight(ACC_COLS),
    minRows: 2,
    title: (cont) => <SectionTitle sub={cont ? '(contd.)' : undefined}>{title}</SectionTitle>,
    titleH: SECTION_H,
    render: (chunk) => <AccTable chunk={chunk} />,
  });
}

export function buildAccessoriesBoqPages(data: ReportData): ReactNode[][] {
  const b = internalBuilder(data, TITLE);
  addEvaHead(b, data, TITLE);
  addProjectsBlock(b, data);
  addDesignRemarks(b, data);
  const hw = hardwareLines(data);
  addAccTable(
    b,
    'Fabrication Hardware',
    hw.filter((l) => l.grp !== INSTALLATION_GROUP),
  );
  addAccTable(b, 'Installation Hardware', installationLines(data));
  const ri = reinforcementLines(data);
  if (ri.length) addAccTable(b, 'Reinforcement', ri);
  return b.done();
}
