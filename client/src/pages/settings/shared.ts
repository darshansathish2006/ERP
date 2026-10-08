export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "sales manager" → "Sales Manager"; the built-in admin role reads "Administrator". */
export function roleLabel(role: string | null | undefined): string {
  const r = String(role || '').trim();
  if (!r) return '—';
  if (r === 'admin') return 'Administrator';
  return r.replace(/(^|[\s_-])([a-z])/g, (_m, sep: string, ch: string) => `${sep === '_' ? ' ' : sep}${ch.toUpperCase()}`);
}

/** Normalises a spreadsheet header for matching: "Price Level (₹)" → "pricelevel". */
export function normHeader(h: unknown): string {
  return String(h ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Finds the first header whose normalised form is one of `aliases` (exact match first, then prefix). */
export function findHeader(headers: string[], aliases: readonly string[]): string | null {
  const normed = headers.map((h) => [h, normHeader(h)] as const);
  for (const a of aliases) {
    const hit = normed.find(([, n]) => n === a);
    if (hit) return hit[0];
  }
  for (const a of aliases) {
    const hit = normed.find(([, n]) => n.startsWith(a));
    if (hit) return hit[0];
  }
  return null;
}

/** Spreadsheet cell → number. Accepts "₹1,234.50", " 12 ". Blank or text gives null. */
export function cellNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v ?? '').replace(/[₹,\s]/g, '').replace(/^rs\.?/i, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function cellText(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

/** File name safe for downloads. */
export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'export';
}

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });
}

/** Turns an internal cost head formula into the EvA display style. */
export function evaFormula(formula: string | null | undefined): string {
  return String(formula ?? '')
    .replace(/\[([^\]]*)\]/g, (_m, name: string) => `@${name.trim()}.value`)
    .replace(/#([A-Za-z0-9_]+)/g, (m, v: string) => {
      const up = v.toUpperCase();
      if (up === 'AREASQFT') return '#AreaSqftFg';
      if (up === 'LUMPSUM') return '1';
      if (up === 'DESIGNADDON' || up === 'MANUALADJUSTMENT') return '0';
      return m;
    });
}
