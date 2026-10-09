import type { ReactNode } from 'react';
import type { BomLine, ProfileBar, ReportData } from '../../lib/types';
import { type Col, headHeight, rowHeight } from '../engine';
import { EVA_LABEL_H, EmptyRow, EvaLabel, RTable, alignCls, colourName, f3, unitShort } from '../parts';
import { addEvaHead, addProjectsBlock, internalBuilder, sumBy } from './common';

const TITLE = 'Profiles BOQ';

export const BAR_COLS: Col[] = [
  { label: 'Sl No.', w: 38, align: 'center' },
  { label: 'Profile Name', w: 180 },
  { label: 'Code', w: 104 },
  { label: 'Cross-Section', w: 76, align: 'center' },
  { label: 'Color', w: 98 },
  { label: 'Length (Mtr.)', w: 62, align: 'right' },
  { label: 'Pcs', w: 40, align: 'right' },
  { label: 'Billing Qty', w: 74, align: 'right' },
  { label: 'Unit', w: 50, align: 'center' },
];

/** Profiles added as entries on the quote's Profile rate page (not bar-optimised). */
export function addedProfileLines(data: ReportData): BomLine[] {
  return (data.lines ?? []).filter((l) => l.added && (l.category === 'profile' || l.category === 'aluminium'));
}

export const ADDED_COLS: Col[] = [
  { label: 'Sl No.', w: 38, align: 'center' },
  { label: 'Profile Name', w: 254 },
  { label: 'Code', w: 104 },
  { label: 'Color', w: 98 },
  { label: 'Qty', w: 74, align: 'right' },
  { label: 'Unit', w: 54, align: 'center' },
];

export function addedCells(l: BomLine, i: number): string[] {
  return [String(i + 1), l.name, l.code || '—', l.color || '—', f3(l.qty), unitShort(l.unit)];
}

export function profileBars(data: ReportData): ProfileBar[] {
  return (data.bars ?? []).filter((b) => b.category === 'profile' || b.category === 'aluminium');
}

/** Profile colour as printed on purchase documents (WHITE, WALNUT, WHITE / WALNUT). */
export function barColour(b: Pick<ProfileBar, 'color'>): string {
  return colourName(b.color);
}

function barCells(b: ProfileBar, i: number): string[] {
  return [String(i + 1), b.name, b.code, '', barColour(b), b.barLength.toFixed(2), String(b.pcs), f3(b.billingQty), 'Mtr'];
}

/** A generic multi-chamber profile section (uPVC) or an open channel (aluminium). Explicit colours for html2canvas. */
export function CrossSectionIcon({ category, seed = 0 }: { category: string; seed?: number }) {
  if (category === 'aluminium') {
    return (
      <svg width="54" height="28" viewBox="0 0 54 28" aria-hidden="true">
        <path d="M6 4h42v20h-8V12H14v12H6z" fill="#d7dde3" stroke="#4b5563" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M14 12h26" stroke="#4b5563" strokeWidth="0.8" />
      </svg>
    );
  }
  const chambers = 3 + (seed % 3);
  const w = 44 / chambers;
  return (
    <svg width="54" height="28" viewBox="0 0 54 28" aria-hidden="true">
      <path d="M5 6h44v16H5z" fill="#f4f6f8" stroke="#374151" strokeWidth="1.3" />
      <path d="M5 6l5-3h34l5 3" fill="none" stroke="#374151" strokeWidth="1" />
      {Array.from({ length: chambers - 1 }, (_, i) => (
        <line key={i} x1={5 + w * (i + 1)} y1={6} x2={5 + w * (i + 1)} y2={22} stroke="#6b7280" strokeWidth="0.9" />
      ))}
      <path d="M8 22v3M46 22v3" stroke="#374151" strokeWidth="1.2" />
    </svg>
  );
}

const barRowH = (b: ProfileBar, i: number) => rowHeight(BAR_COLS, barCells(b, i), 10.5, 38);

export function buildProfileBoqPages(data: ReportData): ReactNode[][] {
  const b = internalBuilder(data, TITLE);
  addEvaHead(b, data, TITLE);
  addProjectsBlock(b, data, 'Report includes the data from projects:');

  const bars = profileBars(data);
  const indexed = bars.map((bar, i) => ({ bar, i }));
  const totalPcs = sumBy(bars, (x) => x.pcs);
  const totalQty = sumBy(bars, (x) => x.billingQty);

  b.table({
    items: indexed,
    rowH: ({ bar, i }) => barRowH(bar, i),
    headH: headHeight(BAR_COLS),
    footH: 22,
    title: (cont) => <EvaLabel>Standard Bars:{cont ? ' (contd.)' : ''}</EvaLabel>,
    titleH: EVA_LABEL_H,
    render: (rows, info) => (
      <RTable
        cols={BAR_COLS}
        className="rp-bars"
        foot={
          info.last ? (
            <tr className="rt-total">
              <td colSpan={6} className="num">
                Total :
              </td>
              <td className="num">{totalPcs}</td>
              <td className="num">{f3(totalQty)}</td>
              <td className="ctr">Mtr</td>
            </tr>
          ) : undefined
        }
      >
        {rows.length === 0 && <EmptyRow span={BAR_COLS.length} text="No profiles in this quote" />}
        {rows.map(({ bar, i }) => (
          <tr key={bar.code}>
            {barCells(bar, i).map((c, j) => (
              <td key={j} className={alignCls(BAR_COLS[j].align)}>
                {j === 3 ? <CrossSectionIcon category={bar.category} seed={i} /> : c}
              </td>
            ))}
          </tr>
        ))}
      </RTable>
    ),
  });

  const added = addedProfileLines(data).map((l, i) => ({ l, i }));
  if (added.length) {
    b.table({
      items: added,
      rowH: ({ l, i }) => rowHeight(ADDED_COLS, addedCells(l, i)),
      headH: headHeight(ADDED_COLS),
      title: (cont) => <EvaLabel>Added profiles (entries added in Pricing):{cont ? ' (contd.)' : ''}</EvaLabel>,
      titleH: EVA_LABEL_H,
      render: (rows) => (
        <RTable cols={ADDED_COLS} className="rp-bars">
          {rows.map(({ l, i }) => (
            <tr key={`added-${l.id ?? i}`}>
              {addedCells(l, i).map((c, j) => (
                <td key={j} className={alignCls(ADDED_COLS[j].align)}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </RTable>
      ),
    });
  }
  return b.done();
}
