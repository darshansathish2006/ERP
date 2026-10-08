const inr2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const num3 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

/** Round half away from zero at 2dp, matching how amounts are shown on the quotation. */
export function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/** ₹5,54,443.83 (Indian grouping). */
export function inr(v: number | null | undefined, digits: 0 | 2 = 2): string {
  const n = Number(v) || 0;
  const s = digits === 0 ? inr0.format(Math.round(n)) : inr2.format(n);
  return `₹${s}`;
}

/** 18406.99 – plain 2dp without grouping (as used in report tables). */
export function fixed2(v: number | null | undefined): string {
  return (Number(v) || 0).toFixed(2);
}

export function grouped2(v: number | null | undefined): string {
  return inr2.format(Number(v) || 0);
}

export function n3(v: number | null | undefined): string {
  return num3.format(Number(v) || 0);
}

export function qtyFmt(v: number, unit?: string): string {
  const n = Number(v) || 0;
  if (unit === 'Pcs' || unit === 'Set') return String(Math.round(n * 100) / 100);
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 1000) / 1000);
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** 02-10-2026 */
export function dateFmt(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}

/** 02 Oct 2026, 10:42 PM */
export function dateTimeFmt(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${pad(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()}, ${pad(h)}:${pad(d.getMinutes())} ${ampm}`;
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`;
  return dateFmt(iso);
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function initials(name: string | null | undefined): string {
  return (name || '?').trim().charAt(0).toUpperCase() || '?';
}

/** Compact axis labels: ₹15,00,000.00 */
export function axisInr(v: number): string {
  return `₹${inr2.format(v)}`;
}

export function todayISODate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
