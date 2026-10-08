export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const badRequest = (msg) => new HttpError(400, msg);
export const notFound = (what = 'Record') => new HttpError(404, `${what} not found`);

export function str(v, max = 500) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

export function num(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function intParam(v, fallback) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function requireFields(body, fields) {
  const missing = fields.filter(([key]) => body[key] == null || String(body[key]).trim() === '').map(([, label]) => label);
  if (missing.length) throw badRequest(`${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} required`);
}

/** Resolve a date-range preset (as used by list filters and the dashboard) into ISO bounds. */
export function rangeBounds(range, from, to) {
  const now = new Date();
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  let start = null;
  let end = null;
  switch (range) {
    case 'today':
      start = startOfDay(now);
      break;
    case '7d':
      start = new Date(now.getTime() - 7 * 864e5);
      break;
    case '30d':
      start = new Date(now.getTime() - 30 * 864e5);
      break;
    case '90d':
      start = new Date(now.getTime() - 90 * 864e5);
      break;
    case 'month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'year':
      start = new Date(now.getFullYear(), 0, 1);
      break;
    case 'custom':
      if (from) start = new Date(`${from}T00:00:00`);
      if (to) end = new Date(`${to}T23:59:59.999`);
      break;
    default:
      break;
  }
  return {
    start: start && !Number.isNaN(start.getTime()) ? start.toISOString() : null,
    end: end && !Number.isNaN(end.getTime()) ? end.toISOString() : null,
  };
}
