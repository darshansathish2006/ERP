import crypto from 'node:crypto';
import { get, run } from './db.js';

const SESSION_DAYS_REMEMBER = 30;
const SESSION_HOURS_DEFAULT = 12;

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function createSession(userId, remember) {
  const token = crypto.randomBytes(32).toString('hex');
  const ms = remember ? SESSION_DAYS_REMEMBER * 864e5 : SESSION_HOURS_DEFAULT * 36e5;
  const expires = new Date(Date.now() + ms).toISOString();
  run('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', token, userId, new Date().toISOString(), expires);
  return { token, expiresAt: expires };
}

export function publicUser(u) {
  if (!u) return null;
  return { id: u.id, name: u.name, email: u.email, role: u.role, team: u.team, phone: u.phone };
}

/** Public user plus the role's permission map (for the signed-in user only). */
export function sessionUser(u) {
  if (!u) return null;
  const perms = permissionsOf(u);
  const keys = ['settings.manage', 'rates.manage', 'opportunity.delete', 'quote.manualRate', 'reports.costing'];
  return { ...publicUser(u), permissions: Object.fromEntries(keys.map((k) => [k, !!perms[k]])), tour: tourStateOf(u) };
}

export function tourStateOf(u) {
  let s = {};
  try {
    s = JSON.parse(u?.tour_state || '{}') || {};
  } catch {
    s = {};
  }
  return { finishedAt: s.finishedAt || null, skippedAt: s.skippedAt || null, done: Array.isArray(s.done) ? s.done.map(String) : [] };
}

export function userFromToken(token) {
  if (!token) return null;
  const row = get(
    `SELECT u.*, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`,
    token,
  );
  if (!row) return null;
  if (row.expires_at < new Date().toISOString()) {
    run('DELETE FROM sessions WHERE token = ?', token);
    return null;
  }
  return row;
}

export function tokenFromRequest(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  if (req.query && typeof req.query.token === 'string') return req.query.token;
  return null;
}

export function requireAuth(req, res, next) {
  const user = userFromToken(tokenFromRequest(req));
  if (!user) return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
  req.user = user;
  next();
}

export function createResetToken(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  run('INSERT INTO password_resets (token, user_id, expires_at) VALUES (?, ?, ?)', token, userId, expires);
  return token;
}

/** Permissions of the user's role. Administrators always have every permission. */
export function permissionsOf(user) {
  if (!user) return {};
  const row = get('SELECT permissions FROM roles WHERE name = ?', user.role);
  let perms = {};
  try {
    perms = row ? JSON.parse(row.permissions) : {};
  } catch {
    perms = {};
  }
  if (user.role === 'admin') return new Proxy(perms, { get: () => true });
  return perms;
}

export function can(user, permission) {
  return !!permissionsOf(user)[permission];
}

/** Express middleware: 403 unless the signed-in user's role has the permission. */
export function requirePermission(permission) {
  return (req, res, next) => {
    if (!can(req.user, permission)) return res.status(403).json({ error: 'You do not have permission to do this. Ask an administrator.' });
    next();
  };
}
