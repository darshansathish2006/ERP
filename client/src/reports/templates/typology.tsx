import { Fragment, type ReactNode } from 'react';
import type { BomLine, ReportData, ReportDesign } from '../../lib/types';
import { fixed2, qtyFmt } from '../../lib/format';
import { type Col, headHeight, rowHeight, textWidth } from '../engine';
import { BAR_H, DesignFigure, RTable, ROW_H, SECTION_H, SectionTitle, TitleBar, alignCls, dash, f3, kvRowsH } from '../parts';
import { addEvaHead, designTitle, internalBuilder, orderedGroups, sumBy } from './common';
import { addHeadsTable, designAdjustment, headRows } from './costSummary';
import { hasMesh } from './quotation';

const TITLE = 'Typology Cost Breakup Report';

const TECH_COLS = [{ w: 150 }, { w: 300 }];
const FIG_W = 260;
const FIG_H = 300;

export const BOM_COLS: Col[] = [
  { label: 'Group', w: 62, align: 'center' },
  { label: 'Item name', w: 272 },
  { label: 'Code', w: 116 },
  { label: 'Qty', w: 62, align: 'right' },
  { label: 'Unit', w: 50 },
  { label: 'Rate', w: 70, align: 'right' },
  { label: 'Amount', w: 90, align: 'right' },
];

export function technicals(d: ReportDesign): [string, string][] {
  const glass = d.glassLabels?.length ? d.glassLabels.join('\n') : d.glassName || '—';
  const sashes = d.sashes?.length ? d.sashes : d.bom?.sashes ?? [];
  return [
    ['Design Ref', dash(d.ref)],
    ['Typology Location', dash(d.location)],
    ['Dimension', `W=${fixed2(d.data?.width)}; H=${fixed2(d.data?.height)}`],
    ['Quantity', String(d.qty)],
    ['Typology type', dash(d.name)],
    ['Brand', dash(d.brand)],
    ['Series', dash(d.systemName)],
    ['Profile Finish', dash(d.colorName)],
    ['Glass', glass],
    ['Mesh', hasMesh(d) ? 'Yes' : 'No'],
    ['Shutter weight (Kg)', sashes.length ? sashes.map((s) => `${s.label}-${f3(s.weight)}`).join(';') : '—'],
    ['Area', `${f3(d.areaSqm)} Sqmt / ${f3(d.areaSqft)} Sqft`],
    ['Remarks', dash(d.note)],
  ];
}

/** One BOM line; the group total row travels with the last line of its group. */
interface BomRow {
  grp: string;
  line: BomLine;
  total?: number;
}

export function bomRows(lines: BomLine[]): BomRow[] {
  const rows: BomRow[] = [];
  for (const g of orderedGroups(lines, (l) => l.grp)) {
    const amount = sumBy(g.items, (l) => l.amount);
    g.items.forEach((line, i) => rows.push({ grp: g.grp, line, total: i === g.items.length - 1 ? amount : undefined }));
  }
  return rows;
}

function bomCells(l: BomLine): string[] {
  return ['', l.name, l.code, qtyFmt(l.qty, l.unit), l.unit, fixed2(l.rate), fixed2(l.amount)];
}

const bomRowH = (r: BomRow) => rowHeight(BOM_COLS, bomCells(r.line)) + (r.total != null ? ROW_H : 0);

function GroupCell({ grp, span, height }: { grp: string; span: number; height: number }) {
  const vertical = height >= textWidth(grp, 10, true) + 14;
  return (
    <td rowSpan={span} className={`rp-grp ${vertical ? 'rp-grp-vert' : ''}`}>
      {vertical ? (
        <div className="rp-grp-v" style={{ width: height - 8 }}>
          {grp}
        </div>
      ) : (
        <div className="rp-grp-h">{grp}</div>
      )}
    </td>
  );
}

function BomTable({ rows, last, grand }: { rows: BomRow[]; last: boolean; grand: number }) {
  // rowspans (in <tr>s) for contiguous runs of the same group inside this chunk
  const spans = new Map<number, { span: number; height: number }>();
  let i = 0;
  while (i < rows.length) {
    let j = i;
    let h = 0;
    let trs = 0;
    while (j < rows.length && rows[j].grp === rows[i].grp) {
      h += bomRowH(rows[j]);
      trs += rows[j].total != null ? 2 : 1;
      j++;
    }
    spans.set(i, { span: trs, height: h });
    i = j;
  }
  return (
    <RTable
      cols={BOM_COLS}
      foot={
        last ? (
          <tr className="rt-total">
            <td colSpan={6}>Total Material Cost (per unit)</td>
            <td className="num">{fixed2(grand)}</td>
          </tr>
        ) : undefined
      }
    >
      {rows.length === 0 && (
        <tr>
          <td colSpan={BOM_COLS.length} className="ctr rt-empty">
            No bill of materials
          </td>
        </tr>
      )}
      {rows.map((r, k) => {
        const sp = spans.get(k);
        const cells = bomCells(r.line);
        return (
          <Fragment key={`${r.line.code}-${k}`}>
            <tr>
              {sp && <GroupCell grp={r.grp} span={sp.span} height={sp.height} />}
              {cells.slice(1).map((c, j) => (
                <td key={j} className={alignCls(BOM_COLS[j + 1].align)}>
                  {c}
                </td>
              ))}
            </tr>
            {r.total != null && (
              <tr className="rt-subtotal">
                <td colSpan={5}>{r.grp} Total</td>
                <td className="num">{fixed2(r.total)}</td>
              </tr>
            )}
          </Fragment>
        );
      })}
    </RTable>
  );
}

function TechBlock({ d }: { d: ReportDesign }) {
  const rows = technicals(d);
  return (
    <div className="rp-tech">
      <table className="rt q-kv" style={{ width: TECH_COLS[0].w + TECH_COLS[1].w }}>
        <colgroup>
          <col style={{ width: TECH_COLS[0].w }} />
          <col style={{ width: TECH_COLS[1].w }} />
        </colgroup>
        <tbody>
          <tr className="rt-sub">
            <td colSpan={2}>Technicals</td>
          </tr>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td className="q-k">{k}</td>
              <td className="q-v">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="rp-tech-fig" style={{ width: FIG_W }}>
        <div className="rp-elev-cap">View From Inside</div>
        <DesignFigure design={d} height={FIG_H - 28} showDims showLabels />
      </div>
    </div>
  );
}

export function buildTypologyPages(data: ReportData): ReactNode[][] {
  const b = internalBuilder(data, TITLE);
  addEvaHead(b, data, TITLE, {
    extra: [
      <>
        Price Structure : <b>{data.quote.priceStructureName || '—'}</b>&nbsp;&nbsp;&nbsp; Designs : <b>{data.designs.length}</b>
      </>,
    ],
  });
  if (!data.designs.length) {
    b.add(<div className="rp-nodata">No designs have been added to this quote yet.</div>, 120);
    return b.done();
  }

  data.designs.forEach((d, idx) => {
    if (idx > 0) b.breakPage();
    b.add(<TitleBar left={`${idx + 1}. ${designTitle(d)}`} right={`Qty: ${d.qty}`} />, BAR_H);
    const techH = Math.max(ROW_H + kvRowsH(TECH_COLS, technicals(d)), FIG_H) + 12;
    b.add(<TechBlock d={d} />, techH);

    const lines = d.bom?.lines ?? [];
    const rows = bomRows(lines);
    const grand = sumBy(lines, (l) => l.amount);
    b.table({
      items: rows,
      rowH: bomRowH,
      headH: headHeight(BOM_COLS),
      footH: ROW_H,
      minRows: 3,
      title: (cont) => <SectionTitle sub={cont ? `${d.ref} (contd.)` : `${d.ref} · per unit`}>Bill of Materials</SectionTitle>,
      titleH: SECTION_H,
      render: (chunk, info) => <BomTable rows={chunk} last={info.last} grand={grand} />,
    });

    const manual = d.calcType === 'manual' && d.price?.manualBasic != null;
    addHeadsTable(
      b,
      headRows(d.price?.heads ?? [], manual ? designAdjustment(d) : null),
      (cont) => <SectionTitle sub={cont ? `${d.ref} (contd.)` : `${d.ref} · per unit`}>Cost Summary</SectionTitle>,
      SECTION_H,
    );
  });
  return b.done();
}
