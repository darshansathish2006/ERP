import type { ReactNode } from 'react';
import type { BomLine, ReportData, ReportDesign } from '../../lib/types';
import { type Col, ROW_H, estLines, headHeight, rowHeight } from '../engine';
import { CellsRow, EmptyRow, RTable, SECTION_H, SectionTitle, SignatureRow, ceilQty, mm, unitShort } from '../parts';
import { addReportHead, addressLines, customerName, internalBuilder, reportDate, sumBy } from './common';
import { installationLines } from './accessoriesBoq';

const TITLE = 'Delivery Challan';

export const DC_COLS: Col[] = [
  { label: 'Sl No', w: 40, align: 'center' },
  { label: 'Design Ref', w: 80 },
  { label: 'Description', w: 340 },
  { label: 'Qty', w: 60, align: 'right' },
  { label: 'Remarks', w: 202 },
];

export const LOOSE_COLS: Col[] = [
  { label: 'Sl No', w: 40, align: 'center' },
  { label: 'Item', w: 300 },
  { label: 'Code', w: 130 },
  { label: 'Qty', w: 60, align: 'right' },
  { label: 'Unit', w: 60, align: 'center' },
  { label: 'Remarks', w: 132 },
];

export function challanNo(data: Pick<ReportData, 'quote'>): string {
  return `${data.quote.quoteNo || 'QT'}-DC`;
}

export function dcDescription(d: ReportDesign): string {
  return `${d.name || 'Window'} - ${mm(d.data?.width)} x ${mm(d.data?.height)} mm`;
}

export function dcCells(d: ReportDesign, i: number): string[] {
  return [String(i + 1), d.ref, dcDescription(d), String(d.qty), ''];
}

/** Loose site materials (fasteners, packers, silicone …) with whole quantities. */
export function looseMaterials(data: ReportData): BomLine[] {
  return [...installationLines(data)].sort((a, b) => a.name.localeCompare(b.name));
}

export function looseCells(l: BomLine, i: number): string[] {
  return [String(i + 1), l.name, l.code, String(ceilQty(l.qty)), unitShort(l.unit), ''];
}

const INFO_ROW = 20;
const ADDR_LINE = 15;
const INFO_HALF = 345;

function InfoRow({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="dc-row">
      <span className="dc-k">{k}</span>
      <span className="dc-sep">:</span>
      <span className="dc-v">{children}</span>
    </div>
  );
}

export function buildDeliveryChallanPages(data: ReportData): ReactNode[][] {
  const b = internalBuilder(data, TITLE);
  addReportHead(b, data, TITLE, []);

  const o = data.quote.opportunity;
  const site = addressLines(data.quote).join(', ') || '—';
  const phone = [o?.phoneCode, o?.phone].filter(Boolean).join(' ').trim();
  const addrLines = estLines(site, INFO_HALF - 120, 11);
  const leftH = 3 * INFO_ROW + Math.max(INFO_ROW, addrLines * ADDR_LINE + 5);
  const rightH = 5 * INFO_ROW;
  b.add(
    <div className="dc-info">
      <div className="dc-col">
        <InfoRow k="Challan No">
          <b>{challanNo(data)}</b>
        </InfoRow>
        <InfoRow k="Date">{reportDate(data)}</InfoRow>
        <InfoRow k="Customer">
          <b>{customerName(data)}</b>
        </InfoRow>
        <div className="dc-row dc-row-wrap">
          <span className="dc-k">Site address</span>
          <span className="dc-sep">:</span>
          <span className="dc-v">{site}</span>
        </div>
      </div>
      <div className="dc-col">
        <InfoRow k="Project">{data.quote.projectName || '—'}</InfoRow>
        <InfoRow k="Quote No">{data.quote.quoteNo || '—'}</InfoRow>
        <InfoRow k="Contact No">{phone || '—'}</InfoRow>
        <InfoRow k="Vehicle No">
          <span className="dc-blank" />
        </InfoRow>
        <InfoRow k="Driver">
          <span className="dc-blank" />
        </InfoRow>
      </div>
    </div>,
    Math.max(leftH, rightH) + 16 + 14,
  );

  const designs = data.designs.map((d, i) => ({ d, i }));
  const totalQty = sumBy(data.designs, (d) => d.qty);
  b.table({
    items: designs,
    rowH: ({ d, i }) => rowHeight(DC_COLS, dcCells(d, i), 10.5, 26, 26),
    headH: headHeight(DC_COLS),
    footH: ROW_H,
    minRows: 3,
    title: (cont) => <SectionTitle sub={cont ? '(contd.)' : undefined}>Windows</SectionTitle>,
    titleH: SECTION_H,
    render: (chunk, info) => (
      <RTable
        cols={DC_COLS}
        className="rp-dc"
        foot={
          info.last && designs.length > 0 ? (
            <tr className="rt-total">
              <td colSpan={3} className="num">
                Total Qty
              </td>
              <td className="num">{totalQty}</td>
              <td />
            </tr>
          ) : undefined
        }
      >
        {chunk.length === 0 && <EmptyRow span={DC_COLS.length} text="No windows" />}
        {chunk.map(({ d, i }) => (
          <CellsRow key={d.id} cols={DC_COLS} cells={dcCells(d, i)} />
        ))}
      </RTable>
    ),
  });

  const loose = looseMaterials(data).map((l, i) => ({ l, i }));
  b.table({
    items: loose,
    rowH: ({ l, i }) => rowHeight(LOOSE_COLS, looseCells(l, i), 10.5, 26, 26),
    headH: headHeight(LOOSE_COLS),
    minRows: 3,
    title: (cont) => <SectionTitle sub={cont ? '(contd.)' : undefined}>Loose materials</SectionTitle>,
    titleH: SECTION_H,
    render: (chunk) => (
      <RTable cols={LOOSE_COLS} className="rp-dc">
        {chunk.length === 0 && <EmptyRow span={LOOSE_COLS.length} text="No loose materials" />}
        {chunk.map(({ l, i }) => (
          <CellsRow key={l.code} cols={LOOSE_COLS} cells={looseCells(l, i)} />
        ))}
      </RTable>
    ),
  });

  b.add(
    <>
      <p className="rp-note">Received the above materials in good condition.</p>
      <SignatureRow labels={['Prepared by', 'Checked by', 'Received by (customer)']} />
    </>,
    22 + 18 + 96 + 6,
  );
  return b.done();
}
