import type { ReactNode } from 'react';
import type { ReportData, ReportDesign } from '../../lib/types';
import { CONTENT_W, type Col, estLines, headHeight, rowHeight } from '../engine';
import { EmptyRow, RTable, RichText, SECTION_H, SectionTitle, SignatureRow, TickBox, alignCls, dash, mm, plainText, subPoint } from '../parts';
import { printCompany } from '../companyDefaults';
import { addReportHead, addressLines, customerName, internalBuilder } from './common';

const TITLE = 'Installation Checklist';

export const CHECK_STEPS = ['Opening checked', 'Fixed & levelled', 'Silicone done', 'Hardware working', 'Cleaned'];

export const IC_COLS: Col[] = [
  { label: 'Design Ref', w: 64 },
  { label: 'Location', w: 92 },
  { label: 'Size', w: 96 },
  ...CHECK_STEPS.map((s, i): Col => ({ label: s, w: i === 3 ? 98 : 93, align: 'center' })),
];

export function icCells(d: ReportDesign): string[] {
  return [d.qty > 1 ? `${d.ref} (${d.qty} Nos)` : d.ref, dash(d.location), `${mm(d.data?.width)} x ${mm(d.data?.height)} mm`, ...CHECK_STEPS.map(() => '')];
}

/** Prerequisites as checklist entries: numbered items and their un-numbered a./b. sub-points. */
export function prerequisiteItems(lines: string[]): { marker: string; text: string; sub: boolean }[] {
  const out: { marker: string; text: string; sub: boolean }[] = [];
  let n = 0;
  for (const raw of lines) {
    const t = String(raw ?? '').trim();
    if (!t) continue;
    const sp = subPoint(t);
    if (sp) out.push({ marker: sp.marker, text: sp.text, sub: true });
    else out.push({ marker: `${++n}.`, text: t, sub: false });
  }
  return out;
}

const LI_LINE = 15;
const liH = (text: string, sub: boolean) => estLines(plainText(text), CONTENT_W - (sub ? 96 : 62), 11) * LI_LINE + 6;

export function buildInstallationChecklistPages(data: ReportData): ReactNode[][] {
  const company = printCompany(data.company);
  const b = internalBuilder(data, TITLE);
  addReportHead(b, data, TITLE, [
    ['Project', data.quote.projectName || '—'],
    ['Quote No', data.quote.quoteNo || '—'],
    ['Customer', customerName(data)],
  ]);
  const site = addressLines(data.quote).join(', ');
  if (site) {
    b.add(
      <p className="rp-site">
        <b>Site :</b> {site}
      </p>,
      estLines(`Site : ${site}`, CONTENT_W, 11) * 15 + 10,
    );
  }

  b.table({
    items: data.designs,
    rowH: (d) => rowHeight(IC_COLS, icCells(d), 10.5, 28, 28),
    headH: headHeight(IC_COLS),
    minRows: 3,
    title: (cont) => <SectionTitle sub={cont ? '(contd.)' : 'tick each step when completed'}>Window installation</SectionTitle>,
    titleH: SECTION_H,
    render: (chunk) => (
      <RTable cols={IC_COLS} className="rp-ic">
        {chunk.length === 0 && <EmptyRow span={IC_COLS.length} text="No designs have been added to this quote yet." />}
        {chunk.map((d) => (
          <tr key={d.id}>
            {icCells(d).map((c, j) => (
              <td key={j} className={alignCls(IC_COLS[j].align)}>
                {j >= 3 ? <TickBox /> : c}
              </td>
            ))}
          </tr>
        ))}
      </RTable>
    ),
  });

  const items = prerequisiteItems(company.prerequisites);
  if (items.length) {
    b.add(<SectionTitle sub="confirm before installation begins">Pre-installation checklist</SectionTitle>, SECTION_H, liH(items[0].text, items[0].sub));
    items.forEach((it) =>
      b.add(
        <div className={`ic-li ${it.sub ? 'ic-li-sub' : ''}`}>
          <TickBox />
          <span className="ic-li-marker">{it.marker}</span>
          <span className="ic-li-text">
            <RichText text={it.text} />
          </span>
        </div>,
        liH(it.text, it.sub),
      ),
    );
  }

  const declaration =
    'We confirm that the windows listed above have been installed, levelled, sealed with silicone, checked for smooth operation of all hardware and cleaned, and are handed over to the customer in good condition.';
  const declH = estLines(declaration, CONTENT_W, 11) * 16 + 10;
  b.add(<SectionTitle>Handover declaration</SectionTitle>, SECTION_H, declH + 30 + 120);
  b.add(<p className="rp-decl">{declaration}</p>, declH);
  b.add(
    <div className="rp-handover">
      <span>
        Date of handover : <span className="dc-blank" />
      </span>
      <span>
        Customer remarks : <span className="dc-blank dc-blank-wide" />
      </span>
    </div>,
    30,
  );
  b.add(<SignatureRow labels={['Installation supervisor', 'Checked by', 'Customer / authorised signatory']} />, 18 + 96 + 6);
  return b.done();
}
