import type { ReactNode } from 'react';
import type { BomLine, CutLine, ReportData, ReportDesign } from '../../lib/types';
import { qtyFmt } from '../../lib/format';
import { type Col, ROW_H, headHeight, rowHeight } from '../engine';
import { BAR_H, DesignFigure, RTable, SECTION_H, SectionTitle, TitleBar, alignCls, dash, f3, kvRowsH, mm, sizeText } from '../parts';
import { addEvaHead, designTitle, internalBuilder } from './common';

const TITLE = 'Design Assembly Report';
const FIG_W = 400;
const FIG_H = 360;
const SIDE_W = 310;
const INFO_COLS = [{ w: 96 }, { w: SIDE_W - 96 }];
const SASH_COLS: Col[] = [
  { label: 'Sash', w: 56, align: 'center' },
  { label: 'Size (W × H) mm', w: 150 },
  { label: 'Weight (kg)', w: 104, align: 'right' },
];

export const ASM_CUT_COLS: Col[] = [
  { label: 'Member', w: 178 },
  { label: 'Profile', w: 206 },
  { label: 'Code', w: 110 },
  { label: 'Length (mm)', w: 70, align: 'right' },
  { label: 'Angle', w: 66, align: 'center' },
  { label: 'Qty/unit', w: 44, align: 'right' },
  { label: 'Total', w: 48, align: 'right' },
];

export const CHECK_COLS: Col[] = [
  { label: '✓', w: 34, align: 'center', text: 'OK' },
  { label: 'Code', w: 122 },
  { label: 'Item', w: 312 },
  { label: 'Qty/unit', w: 74, align: 'right' },
  { label: 'Total Qty', w: 100, align: 'right' },
  { label: 'Unit', w: 80, align: 'center' },
];

function infoRows(d: ReportDesign): [string, string][] {
  return [
    ['Design Ref', dash(d.ref)],
    ['Name', dash(d.name)],
    ['Location', dash(d.location)],
    ['Floor', dash(d.floor)],
    ['Size', sizeText(d)],
    ['Quantity', `${d.qty} Pcs`],
    ['System', dash(d.systemName)],
    ['Colour', dash(d.colorName)],
    ['Glass', d.glassLabels?.length ? d.glassLabels.join('\n') : dash(d.glassName)],
  ];
}

export function cutListCells(c: CutLine, qty: number): string[] {
  return [c.member, c.name, c.code, mm(c.length), c.angle, String(c.qty), String(c.qty * qty)];
}

export function checklistCells(l: BomLine, qty: number): string[] {
  return ['', l.code, l.name, qtyFmt(l.qty, l.unit), qtyFmt(l.qty * qty, l.unit), l.unit];
}

const CUT_ORDER = ['profile', 'aluminium', 'reinforcement'];

function sortedCuts(d: ReportDesign): CutLine[] {
  return [...(d.bom?.cuts ?? [])].sort((a, b) => CUT_ORDER.indexOf(a.category) - CUT_ORDER.indexOf(b.category));
}

function Overview({ d }: { d: ReportDesign }) {
  const sashes = d.sashes?.length ? d.sashes : d.bom?.sashes ?? [];
  return (
    <div className="rp-asm">
      <div className="rp-asm-fig" style={{ width: FIG_W }}>
        <div className="rp-elev-cap">View From Inside</div>
        <DesignFigure design={d} height={FIG_H - 28} showDims showLabels showNumbers />
      </div>
      <div className="rp-asm-side" style={{ width: SIDE_W }}>
        <table className="rt q-kv">
          <colgroup>
            <col style={{ width: INFO_COLS[0].w }} />
            <col style={{ width: INFO_COLS[1].w }} />
          </colgroup>
          <tbody>
            <tr className="rt-sub">
              <td colSpan={2}>Design</td>
            </tr>
            {infoRows(d).map(([k, v]) => (
              <tr key={k}>
                <td className="q-k">{k}</td>
                <td className="q-v">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ height: 8 }} />
        <RTable cols={SASH_COLS}>
          {sashes.length === 0 && (
            <tr>
              <td colSpan={3} className="ctr rt-empty">
                Fixed glazing – no sashes
              </td>
            </tr>
          )}
          {sashes.map((s) => (
            <tr key={s.label}>
              <td className="ctr">{s.label}</td>
              <td>
                {mm(s.w)} × {mm(s.h)}
              </td>
              <td className="num">{f3(s.weight)}</td>
            </tr>
          ))}
        </RTable>
      </div>
    </div>
  );
}

function overviewH(d: ReportDesign): number {
  const sashes = d.sashes?.length ? d.sashes : d.bom?.sashes ?? [];
  const side = ROW_H + kvRowsH(INFO_COLS, infoRows(d)) + 8 + headHeight(SASH_COLS) + Math.max(1, sashes.length) * ROW_H;
  return Math.max(FIG_H, side) + 12;
}

export function buildDesignAssemblyPages(data: ReportData): ReactNode[][] {
  const b = internalBuilder(data, TITLE);
  addEvaHead(b, data, TITLE);
  if (!data.designs.length) {
    b.add(<div className="rp-nodata">No designs have been added to this quote yet.</div>, 120);
    return b.done();
  }

  data.designs.forEach((d, idx) => {
    if (idx > 0) b.breakPage();
    b.add(<TitleBar left={`${idx + 1}. ${designTitle(d)}`} right={`${d.location || ''}${d.location ? ' · ' : ''}Qty: ${d.qty}`} />, BAR_H);
    b.add(<Overview d={d} />, overviewH(d));

    const cuts = sortedCuts(d);
    b.table({
      items: cuts,
      rowH: (c) => rowHeight(ASM_CUT_COLS, cutListCells(c, d.qty)),
      headH: headHeight(ASM_CUT_COLS),
      minRows: 3,
      title: (cont) => <SectionTitle sub={cont ? `${d.ref} (contd.)` : `${d.ref} · for ${d.qty} unit(s)`}>Cut List – Frame / Sash / Bead</SectionTitle>,
      titleH: SECTION_H,
      render: (chunk) => (
        <RTable cols={ASM_CUT_COLS}>
          {chunk.length === 0 && (
            <tr>
              <td colSpan={ASM_CUT_COLS.length} className="ctr rt-empty">
                No cuts
              </td>
            </tr>
          )}
          {chunk.map((c, i) => (
            <tr key={`${c.code}-${c.member}-${i}`}>
              {cutListCells(c, d.qty).map((v, j) => (
                <td key={j} className={alignCls(ASM_CUT_COLS[j].align)}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </RTable>
      ),
    });

    const hw = (d.bom?.lines ?? []).filter((l) => l.category === 'hardware');
    b.table({
      items: hw,
      rowH: (l) => rowHeight(CHECK_COLS, checklistCells(l, d.qty)),
      headH: headHeight(CHECK_COLS),
      minRows: 3,
      title: (cont) => <SectionTitle sub={cont ? `${d.ref} (contd.)` : 'tick when issued / fitted'}>Hardware Checklist</SectionTitle>,
      titleH: SECTION_H,
      render: (chunk) => (
        <RTable cols={CHECK_COLS}>
          {chunk.length === 0 && (
            <tr>
              <td colSpan={CHECK_COLS.length} className="ctr rt-empty">
                No hardware
              </td>
            </tr>
          )}
          {chunk.map((l) => (
            <tr key={l.code}>
              {checklistCells(l, d.qty).map((v, j) => (
                <td key={j} className={alignCls(CHECK_COLS[j].align)}>
                  {j === 0 ? <span className="rp-checkbox" /> : v}
                </td>
              ))}
            </tr>
          ))}
        </RTable>
      ),
    });
  });
  return b.done();
}
