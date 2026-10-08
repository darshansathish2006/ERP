import { Router } from 'express';
import { get, run } from '../db.js';
import { hashPassword, verifyPassword, createSession, sessionUser as publicUser, requireAuth, tokenFromRequest, createResetToken } from '../auth.js';
import { badRequest, str } from './util.js';

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/login', (req, res) => {
  const email = str(req.body?.email, 200);
  const password = req.body?.password;
  if (!email || !password) throw badRequest('Login ID and password are required');
  const user = get('SELECT * FROM users WHERE email = ?', email);
  if (!user || !verifyPassword(password, user.salt, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid login ID or password' });
  }
  const session = createSession(user.id, !!req.body?.remember);
  res.json({ token: session.token, expiresAt: session.expiresAt, user: publicUser(user) });
});

router.post('/register', (req, res) => {
  const name = str(req.body?.name, 120);
  const email = str(req.body?.email, 200);
  const password = String(req.body?.password || '');
  if (!name) throw badRequest('Name is required');
  if (!email || !EMAIL_RE.test(email)) throw badRequest('A valid email is required');
  if (password.length < 6) throw badRequest('Password must be at least 6 characters');
  if (get('SELECT id FROM users WHERE email = ?', email)) throw badRequest('An account with this email already exists');
  const { hash, salt } = hashPassword(password);
  const info = run(
    'INSERT INTO users (name, email, password_hash, salt, role, phone, created_at) VALUES (?,?,?,?,?,?,?)',
    name.toUpperCase(), email, hash, salt, 'sales', str(req.body?.phone, 30), new Date().toISOString(),
  );
  const user = get('SELECT * FROM users WHERE id = ?', info.lastInsertRowid);
  const session = createSession(user.id, false);
  res.status(201).json({ token: session.token, expiresAt: session.expiresAt, user: publicUser(user) });
});

/** True only for requests made on this computer (not via a tunnel or reverse proxy). */
function isLocalRequest(req) {
  const addr = req.socket?.remoteAddress || '';
  const loopback = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
  const proxied = req.headers['x-forwarded-for'] || req.headers['x-forwarded-host'] || req.headers['cf-connecting-ip'] || req.headers['x-real-ip'];
  return loopback && !proxied;
}

router.post('/forgot', (req, res) => {
  const email = str(req.body?.email, 200);
  if (!email) throw badRequest('Please enter your login ID');
  const user = get('SELECT * FROM users WHERE email = ?', email);
  let resetPath = null;
  if (user) {
    const token = createResetToken(user.id);
    resetPath = `/reset-password?token=${token}`;
    console.log(`[password reset] ${email}: ${resetPath}`);
  }
  // Email delivery is not configured. The link is always printed in the server console, and is only
  // returned to the browser for requests made on this computer – never over a shared/public link.
  if (isLocalRequest(req)) {
    return res.json({ ok: true, resetPath, message: user ? 'Password reset link generated.' : 'If the account exists, a reset link has been generated.' });
  }
  res.json({ ok: true, resetPath: null, remote: true, message: 'If the account exists, a password reset link has been generated for your administrator.' });
});

router.post('/reset', (req, res) => {
  const token = str(req.body?.token, 200);
  const password = String(req.body?.password || '');
  if (!token) throw badRequest('Reset token is missing');
  if (password.length < 6) throw badRequest('Password must be at least 6 characters');
  const row = get('SELECT * FROM password_resets WHERE token = ?', token);
  if (!row || row.used || row.expires_at < new Date().toISOString()) throw badRequest('This reset link is invalid or has expired');
  const { hash, salt } = hashPassword(password);
  run('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?', hash, salt, row.user_id);
  run('UPDATE password_resets SET used = 1 WHERE token = ?', token);
  run('DELETE FROM sessions WHERE user_id = ?', row.user_id);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.put('/me', requireAuth, (req, res) => {
  const name = str(req.body?.name, 120) || req.user.name;
  const phone = str(req.body?.phone, 30);
  run('UPDATE users SET name = ?, phone = ? WHERE id = ?', name, phone, req.user.id);
  if (req.body?.newPassword) {
    if (!verifyPassword(String(req.body.currentPassword || ''), req.user.salt, req.user.password_hash)) throw badRequest('Current password is incorrect');
    if (String(req.body.newPassword).length < 6) throw badRequest('New password must be at least 6 characters');
    const { hash, salt } = hashPassword(String(req.body.newPassword));
    run('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?', hash, salt, req.user.id);
  }
  res.json({ user: publicUser(get('SELECT * FROM users WHERE id = ?', req.user.id)) });
});

router.post('/logout', (req, res) => {
  const token = tokenFromRequest(req);
  if (token) run('DELETE FROM sessions WHERE token = ?', token);
  res.json({ ok: true });
});

export default router;
