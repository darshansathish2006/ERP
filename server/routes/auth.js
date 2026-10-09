import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { all, get, run, tx, getSetting, UPLOAD_DIR } from '../db.js';
import { hashPassword, verifyPassword, createSession, sessionUser as publicUser, requireAuth, tokenFromRequest, createResetToken, tourStateOf } from '../auth.js';
import { DEFAULT_COMPANY } from '../engine/catalog.js';
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

// Guided tour progress. Body: { done?: string[] (sections finished), finished?: true, skipped?: true, reset?: true }
router.put('/me/tour', requireAuth, (req, res) => {
  const cur = tourStateOf(req.user);
  const body = req.body || {};
  const now = new Date().toISOString();
  const next = body.reset
    ? { finishedAt: null, skippedAt: null, done: [] }
    : {
        finishedAt: body.finished ? now : cur.finishedAt,
        skippedAt: body.skipped ? now : cur.skippedAt,
        done: [...new Set([...cur.done, ...(Array.isArray(body.done) ? body.done.map((d) => str(d, 60)).filter(Boolean) : [])])].slice(0, 100),
      };
  run('UPDATE users SET tour_state = ? WHERE id = ?', JSON.stringify(next), req.user.id);
  res.json({ user: publicUser(get('SELECT * FROM users WHERE id = ?', req.user.id)) });
});

// ---------------------------------------------------------------- guided tour sample project
// The quote chapters of the tour need a real quote to point at. A temporary opportunity (tagged
// "tour-sample", created by this user, with TOUR-* codes so no real project/quote numbers are used)
// is created when the tour starts and deleted when it ends – or on the next app load if left behind.
const SAMPLE_TAG = 'tour-sample';
const SAMPLE_NAME = 'Tour sample project – deleted after the tour';

function sampleOpportunities(userId) {
  return all("SELECT * FROM opportunities WHERE created_by = ? AND tags LIKE ? AND code LIKE 'TOUR-%'", userId, `%"${SAMPLE_TAG}"%`);
}

function sampleInfo(opp) {
  const quote = get('SELECT id FROM quotes WHERE opportunity_id = ? ORDER BY is_default DESC, id LIMIT 1', opp.id);
  const design = quote ? get('SELECT id FROM designs WHERE quote_id = ? ORDER BY sort, id LIMIT 1', quote.id) : null;
  return { opportunityId: opp.id, quoteId: quote?.id ?? null, designId: design?.id ?? null, projectName: opp.project_name };
}

/** A code that is not used yet in `table.column`, e.g. TOUR-QT-7 or TOUR-QT-7-2. */
function freeCode(table, column, base) {
  let code = base;
  for (let i = 2; get(`SELECT 1 FROM ${table} WHERE ${column} = ?`, code); i++) code = `${base}-${i}`;
  return code;
}

router.post('/me/tour/sample', requireAuth, (req, res) => {
  const user = req.user;
  const existing = sampleOpportunities(user.id)[0];
  if (existing) {
    const info = sampleInfo(existing);
    if (info.quoteId) return res.json({ ...info, created: false });
    // A sample without a quote is broken – remove it and create a fresh one.
    deleteSamples(user.id);
  }
  const company = getSetting('company', DEFAULT_COMPANY) || DEFAULT_COMPANY;
  const ps =
    get('SELECT * FROM price_structures WHERE id = ?', getSetting('defaultPriceStructure', 0) ?? 0) ||
    get("SELECT * FROM price_structures WHERE name = 'Retail Projects'") ||
    get('SELECT * FROM price_structures ORDER BY id LIMIT 1');
  if (!ps) throw badRequest('No price structure is set up, so the tour sample project cannot be created');
  const stage = get("SELECT value FROM lookups WHERE type = 'opportunity_stage' AND value NOT IN ('Won', 'Lost') ORDER BY sort LIMIT 1")?.value || 'Enquiry';
  const source = get("SELECT value FROM lookups WHERE type = 'opportunity_source' ORDER BY sort LIMIT 1")?.value || 'Reference';
  const touchKind = get("SELECT value FROM lookups WHERE type = 'touchpoint_type' ORDER BY sort LIMIT 1")?.value || 'Call';
  const out = tx(() => {
    const now = new Date();
    const iso = now.toISOString();
    const code = freeCode('opportunities', 'code', `TOUR-${user.id}`);
    const opp = run(
      `INSERT INTO opportunities (code, project_name, salutation, first_name, last_name, phone_code, phone, email, note, city, state, country,
         managed_by, stage, source, est_value, category, personnel, status, created_by, created_at, updated_at, account, tags)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      code, SAMPLE_NAME, 'Mr.', 'Sample', 'Customer', '+91', '9000000000', null,
      'Created by the guided tour. It is deleted automatically when the tour ends.', 'CHENNAI', 'TAMILNADU', 'INDIA',
      user.name, stage, source, null, 'Residential', '[]', 'active', user.id, iso, iso, 'Sample Builders', JSON.stringify([SAMPLE_TAG]),
    );
    const oppId = Number(opp.lastInsertRowid);
    const quote = run(
      `INSERT INTO quotes (opportunity_id, quote_no, alias, price_structure_id, price_structure_name, cost_heads, rate_overrides, defaults, created_at, updated_at, is_default, revision_no)
       VALUES (?,?,?,?,?,?,?,?,?,?,1,1)`,
      oppId, freeCode('quotes', 'quote_no', `TOUR-QT-${user.id}`), 'A', ps.id, ps.name, ps.cost_heads, '{}',
      JSON.stringify({ floorAperture: company.defaultFloorAperture || 900 }), iso, iso,
    );
    // One logged call so the touchpoint column and drawer have something to show.
    run(
      'INSERT INTO touchpoints (opportunity_id, kind, note, contacted_at, user_id, created_at) VALUES (?,?,?,?,?,?)',
      oppId, touchKind, 'Sample call – discussed sliding windows for the hall', new Date(now.getTime() - 3600e3).toISOString(), user.id, iso,
    );
    return { opportunityId: oppId, quoteId: Number(quote.lastInsertRowid) };
  });
  res.status(201).json({ ...out, designId: null, projectName: SAMPLE_NAME, created: true });
});

/** Deletes this user's tour sample(s) with every quote, revision, design, document, smart quote and touchpoint. */
function deleteSamples(userId) {
  const opps = sampleOpportunities(userId);
  for (const o of opps) {
    const files = all('SELECT d.stored_name FROM documents d JOIN quotes q ON q.id = d.quote_id WHERE q.opportunity_id = ?', o.id);
    tx(() => {
      const quoteIds = 'SELECT id FROM quotes WHERE opportunity_id = ?';
      run(`DELETE FROM smart_quotes WHERE quote_id IN (${quoteIds})`, o.id);
      run(`DELETE FROM documents WHERE quote_id IN (${quoteIds})`, o.id);
      run(`DELETE FROM designs WHERE quote_id IN (${quoteIds})`, o.id);
      run('DELETE FROM quotes WHERE opportunity_id = ?', o.id);
      run('DELETE FROM touchpoints WHERE opportunity_id = ?', o.id);
      run('DELETE FROM opportunities WHERE id = ?', o.id);
    });
    for (const f of files) fs.rm(path.join(UPLOAD_DIR, path.basename(f.stored_name)), { force: true }, () => {});
  }
  return opps.length;
}

// Not limited by the opportunity.delete permission: it only ever removes the caller's own tour sample.
router.delete('/me/tour/sample', requireAuth, (req, res) => {
  res.json({ ok: true, deleted: deleteSamples(req.user.id) });
});

router.post('/logout', (req, res) => {
  const token = tokenFromRequest(req);
  if (token) run('DELETE FROM sessions WHERE token = ?', token);
  res.json({ ok: true });
});

export default router;
