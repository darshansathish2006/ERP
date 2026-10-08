import { Fragment, type ReactNode } from 'react';

/**
 * Deterministic A4 pagination.
 *
 * Every report is laid out as a vertical flow of blocks whose heights are
 * estimated up-front (fixed CSS metrics in reports.css + a conservative text
 * width model). Blocks that do not fit on the current page move to the next
 * one; tables are split row-wise with their header repeated.
 */

/** A4 at 96dpi. */
export const PAGE_W = 794;
export const PAGE_H = 1123;
/** Printable width inside the 36px side margins. */
export const CONTENT_W = 722;
/** Usable body height (1123 - 34 top - 52 footer = 1037) minus a safety margin. */
export const BODY_BUDGET = 1008;

/** Table metrics – must match `.rt` in reports.css (10.5px / 13px line, 3px padding, 1px border). */
export const ROW_H = 21;
export const LINE_H = 13;
export const TABLE_GAP = 10;

// ---------------------------------------------------------------- text model

const WIDE = new Set(['M', 'W', 'm', 'w', '@', '%', '₹']);
const NARROW = new Set(['i', 'j', 'l', 't', 'f', 'r', 'I', '.', ',', ':', ';', "'", '|', '!', '(', ')', '[', ']', '-', '/']);

/** Approximate rendered width (px) of a string in Roboto / Segoe UI. */
export function textWidth(text: string, fontPx: number, bold = false): number {
  let em = 0;
  for (const ch of text) {
    if (ch === ' ') em += 0.28;
    else if (WIDE.has(ch)) em += 0.86;
    else if (NARROW.has(ch)) em += 0.32;
    else if (ch >= 'A' && ch <= 'Z') em += 0.68;
    else if (ch >= '0' && ch <= '9') em += 0.58;
    else if (ch >= 'a' && ch <= 'z') em += 0.54;
    else em += 0.62;
  }
  return em * fontPx * (bold ? 1.06 : 1);
}

/** Estimated number of wrapped lines for `text` in a box `widthPx` wide (padding already removed). */
export function estLines(text: string | number | null | undefined, widthPx: number, fontPx = 10.5, bold = false): number {
  const s = text == null ? '' : String(text);
  if (!s) return 1;
  const avail = Math.max(16, widthPx);
  let lines = 0;
  for (const part of s.split('\n')) {
    // 12% slack for word-wrap inefficiency.
    lines += Math.max(1, Math.ceil((textWidth(part, fontPx, bold) * 1.12) / avail));
  }
  return lines;
}

/** Height of a paragraph of text. */
export function textBlockH(text: string, widthPx: number, fontPx: number, lineH: number, bold = false): number {
  return estLines(text, widthPx, fontPx, bold) * lineH;
}

export interface Col {
  label: ReactNode;
  /** px width; `table-layout: fixed` honours these. */
  w: number;
  align?: 'left' | 'right' | 'center';
  /** plain text version of the label, used for height estimation */
  text?: string;
}

const CELL_PAD = 10;

/** Estimated height of a table row given the plain text of each cell (aligned with `cols`). */
export function rowHeight(cols: { w: number }[], cells: (string | number | null | undefined)[], fontPx = 10.5, minH = ROW_H, base = ROW_H): number {
  let lines = 1;
  cells.forEach((c, i) => {
    const w = cols[i]?.w ?? 100;
    lines = Math.max(lines, estLines(c, w - CELL_PAD, fontPx));
  });
  return Math.max(minH, base + (lines - 1) * LINE_H);
}

/** Height of a header row (labels may wrap in narrow columns). */
export function headHeight(cols: Col[]): number {
  return rowHeight(
    cols,
    cols.map((c) => c.text ?? (typeof c.label === 'string' ? c.label : '')),
    10.5 * 1.06,
  );
}

/** Sum the widths of `cols` – handy for colSpan text estimation. */
export function spanWidth(cols: { w: number }[], from: number, to: number): number {
  let w = 0;
  for (let i = from; i <= to && i < cols.length; i++) w += cols[i].w;
  return w;
}

// ---------------------------------------------------------------- builder

export interface RunningHeader {
  render: (pageIndex: number) => ReactNode;
  h: number;
  /** also show on page 1 (default false) */
  onFirst?: boolean;
}

export interface TableSpec<T> {
  items: T[];
  rowH: (item: T) => number;
  /** height of the repeated `<thead>` */
  headH: number;
  /** renders one chunk of rows as a complete table */
  render: (chunk: T[], info: { first: boolean; last: boolean }) => ReactNode;
  /** optional caption rendered above every chunk (`cont` = continuation) */
  title?: (cont: boolean) => ReactNode;
  titleH?: number;
  /** height of a footer (totals) rendered with the last chunk */
  footH?: number;
  /** rows that must stay with the header/title (default 2) */
  minRows?: number;
  /** space below the table (default TABLE_GAP) */
  gap?: number;
  /** height of the placeholder row rendered when `items` is empty */
  emptyH?: number;
}

export class PageBuilder {
  readonly pages: ReactNode[][] = [];
  private used = 0;
  private base = 0;
  private seq = 0;
  private readonly budget: number;
  private readonly running: RunningHeader | null;

  constructor(budget: number = BODY_BUDGET, running: RunningHeader | null = null) {
    this.budget = budget;
    this.running = running;
    this.newPage();
  }

  private get current(): ReactNode[] {
    return this.pages[this.pages.length - 1];
  }

  get pageIndex(): number {
    return this.pages.length - 1;
  }

  /** True when nothing but the running header has been placed on the current page. */
  get fresh(): boolean {
    return this.used <= this.base;
  }

  get remaining(): number {
    return this.budget - this.used;
  }

  newPage(): void {
    const idx = this.pages.length;
    this.pages.push([]);
    this.used = 0;
    if (this.running && (idx > 0 || this.running.onFirst)) {
      this.current.push(<Fragment key={`run-${idx}`}>{this.running.render(idx)}</Fragment>);
      this.used = this.running.h;
    }
    this.base = this.used;
  }

  /** Start a new page unless the current one is still empty. */
  breakPage(): void {
    if (!this.fresh) this.newPage();
  }

  /** Make sure `h` px are available, breaking the page if needed. */
  ensure(h: number): void {
    if (!this.fresh && h > this.remaining) this.newPage();
  }

  /** Place a block of estimated height `h`. `keepWith` reserves extra space for what must follow it. */
  add(node: ReactNode, h: number, keepWith = 0): void {
    this.ensure(h + keepWith);
    this.current.push(<Fragment key={`b-${this.seq++}`}>{node}</Fragment>);
    this.used += h;
  }

  /** Place a table, splitting it across pages with its header repeated. */
  table<T>(spec: TableSpec<T>): void {
    const { items, rowH, headH, render, title, titleH = 0, footH = 0, minRows = 2, gap = TABLE_GAP, emptyH = ROW_H } = spec;
    const fixed = titleH + headH + gap;
    if (items.length === 0) {
      const h = fixed + emptyH + footH;
      this.add(
        <>
          {title?.(false)}
          {render([], { first: true, last: true })}
        </>,
        h,
      );
      return;
    }
    const heights = items.map(rowH);
    let i = 0;
    let first = true;
    while (i < items.length) {
      const keep = Math.min(minRows, items.length - i);
      let keepH = 0;
      for (let j = i; j < i + keep; j++) keepH += heights[j];
      if (i + keep >= items.length) keepH += footH;
      if (!this.fresh && fixed + keepH > this.remaining) this.newPage();
      const avail = this.remaining - fixed;
      let j = i;
      let h = 0;
      while (j < items.length) {
        const rh = heights[j] + (j === items.length - 1 ? footH : 0);
        if (j > i && h + rh > avail) break;
        h += rh;
        j++;
      }
      const chunk = items.slice(i, j);
      const last = j >= items.length;
      const isFirst = first;
      this.current.push(
        <Fragment key={`t-${this.seq++}`}>
          {title?.(!isFirst)}
          {render(chunk, { first: isFirst, last })}
        </Fragment>,
      );
      this.used += fixed + h;
      i = j;
      first = false;
      if (!last) this.newPage();
    }
  }

  /** Drop trailing empty pages and return the result. */
  done(): ReactNode[][] {
    while (this.pages.length > 1 && this.fresh) {
      this.pages.pop();
      // after popping, the previous page is by definition not fresh
      this.used = this.budget;
      this.base = 0;
    }
    return this.pages;
  }
}

/** Split an array into fixed-size chunks. */
export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
