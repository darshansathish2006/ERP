import type { ReactNode } from 'react';
import type { ReportData, ReportDesign } from '../../lib/types';
import { BODY_BUDGET, PageBuilder, headHeight, rowHeight } from '../engine';
import {
  EVA_LABEL_H,
  EvaHead,
  EvaLabel,
  ProjectTable,
  REMARK_COLS,
  RTable,
  RUN_H,
  ReportHead,
  RunningHead,
  CellsRow,
  EmptyRow,
  evaHeadH,
  istDate,
  istDateTime,
  istUsDateTime,
  projectTableH,
  remarkCells,
  reportHeadH,
} from '../parts';

export type Meta = [string, ReactNode][];

/** 08-10-2026 (India time). */
export function reportDate(data: Pick<ReportData, 'generatedAt'>): string {
  return istDate(data.generatedAt);
}

/** Builder for internal reports: a slim running header on every page after the first. */
export function internalBuilder(data: ReportData, title: string): PageBuilder {
  return new PageBuilder(BODY_BUDGET, { render: () => <RunningHead title={title} quote={data.quote} />, h: RUN_H });
}

export function standardMeta(data: ReportData): Meta {
  return [
    ['Project', data.quote.projectName || '—'],
    ['Project Code', data.quote.projectCode || '—'],
    ['Quote No', data.quote.quoteNo || '—'],
  ];
}

/** Company letterhead header (customer / site documents). */
export function addReportHead(b: PageBuilder, data: ReportData, title: string, meta: Meta = standardMeta(data)): void {
  b.add(<ReportHead company={data.company} title={title} date={reportDate(data)} meta={meta} />, reportHeadH(meta.length));
}

/**
 * EvA style header: "Title ............ Date : 08-10-2026 15:04:05 +05:30", then
 * "Project: X" / "Project Code : TIT-QT-…" and a blue rule.
 */
export function addEvaHead(b: PageBuilder, data: ReportData, title: string, opts: { dateStyle?: 'us' | 'dmy'; extra?: ReactNode[] } = {}): void {
  const date = opts.dateStyle === 'us' ? `Date: ${istUsDateTime(data.generatedAt)}` : `Date : ${istDateTime(data.generatedAt)}`;
  const lines: ReactNode[] = [
    <>
      Project: <b>{data.quote.projectName || '—'}</b>
    </>,
    <>
      Project Code : <b>{data.quote.quoteNo || '—'}</b>
    </>,
    ...(opts.extra ?? []),
  ];
  b.add(<EvaHead title={title} date={date} lines={lines} />, evaHeadH(lines.length));
}

/** "Report includes the data from projects :" + project table. */
export function addProjectsBlock(b: PageBuilder, data: ReportData, label = 'Report includes the data from projects :'): void {
  b.add(
    <>
      <EvaLabel>{label}</EvaLabel>
      <ProjectTable quote={data.quote} summary={data.summary} />
    </>,
    EVA_LABEL_H + projectTableH(data.quote, data.summary),
  );
}

/** "Design Remarks : :" table – one row per design that has a note. */
export function addDesignRemarks(b: PageBuilder, data: ReportData): void {
  const rows = data.designs.filter((d) => String(d.note || '').trim());
  b.table({
    items: rows,
    rowH: (d) => rowHeight(REMARK_COLS, remarkCells(d)),
    headH: headHeight(REMARK_COLS),
    title: (cont) => <EvaLabel>Design Remarks : :{cont ? ' (contd.)' : ''}</EvaLabel>,
    titleH: EVA_LABEL_H,
    render: (chunk) => (
      <RTable cols={REMARK_COLS} className="rt-remarks">
        {chunk.length === 0 && <EmptyRow span={REMARK_COLS.length} text="No design remarks" />}
        {chunk.map((d) => (
          <CellsRow key={d.id} cols={REMARK_COLS} cells={remarkCells(d)} />
        ))}
      </RTable>
    ),
  });
}

/** Group BOM order used by the engine (server/engine/bom.js GROUP_ORDER). */
export const GROUP_ORDER = ['Profile', 'Aluminium Profiles', 'Reinforcement', 'Fabrication Hardware', 'Accessories', 'Screws', 'Installation Hardware', 'Gasket', 'Glazing', 'Mesh'];

/** Groups in canonical order followed by any unknown groups in first-seen order. */
export function orderedGroups<T>(items: T[], grpOf: (t: T) => string, order: string[] = GROUP_ORDER): { grp: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const g = grpOf(it) || 'Other';
    map.set(g, [...(map.get(g) ?? []), it]);
  }
  const known = order.filter((g) => map.has(g));
  const unknown = [...map.keys()].filter((g) => !order.includes(g));
  return [...known, ...unknown].map((grp) => ({ grp, items: map.get(grp) ?? [] }));
}

export function designTitle(d: Pick<ReportDesign, 'ref' | 'name'>): string {
  return d.name ? `${d.ref} — ${d.name}` : d.ref;
}

export function sumBy<T>(items: T[], fn: (t: T) => number): number {
  return items.reduce((s, t) => s + (Number(fn(t)) || 0), 0);
}

/** Customer name as printed on site documents: "Mr. John Doe". */
export function customerName(data: Pick<ReportData, 'quote'>): string {
  const o = data.quote.opportunity;
  const name = [o?.salutation, o?.contactName || [o?.firstName, o?.lastName].filter(Boolean).join(' ')].filter(Boolean).join(' ').trim();
  return name || data.quote.projectName || '—';
}

/** Site / customer address lines. */
export function addressLines(quote: ReportData['quote']): string[] {
  const o = quote.opportunity;
  if (!o) return [];
  const cityLine = [o.city, o.pincode].filter(Boolean).join(' - ');
  const lines = [o.address1, o.address2, cityLine, o.state].map((s) => (s || '').trim()).filter(Boolean);
  if (!o.address1 && !o.address2 && o.siteLocation) lines.unshift(o.siteLocation.trim());
  return lines;
}
