// Contacts: standalone contacts (contacts table) plus the customer contacts held on opportunities.
// A standalone contact is linked to the opportunities that share its phone number; opportunity
// contacts without a standalone record are listed from the opportunities and edited there.
import { Router } from 'express';
import { all, get, run, tx } from '../db.js';
import { badRequest, notFound, str, intParam } from './util.js';

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SALUTATIONS = ['Mr.', 'Ms.', 'Mrs.', 'Dr.', 'M/s.'];

/** Validate the contact fields shared by standalone and opportunity contacts. */
function readPerson(b) {
  const firstName = str(b.firstName, 80);
  if (!firstName) throw badRequest('First name is required');
  const phone = String(b.phone ?? '').replace(/[\s-]+/g, '');
  if (!phone) throw badRequest('Phone number is required');
  if (!/^[0-9]{6,15}$/.test(phone)) throw badRequest('Phone number must contain 6 to 15 digits');
  const email = str(b.email, 150);
  if (email && !EMAIL_RE.test(email)) throw badRequest('Email address is not valid');
  const phoneCode = str(b.phoneCode, 6) || '+91';
  if (!/^\+?[0-9]{1,4}$/.test(phoneCode)) throw badRequest('Country code is not valid');
  const salutation = str(b.salutation, 10) || 'Mr.';
  return { salutation: SALUTATIONS.includes(salutation) ? salutation : salutation.slice(0, 10), first_name: firstName, last_name: str(b.lastName, 80), phone_code: phoneCode, phone, email };
}

function readContact(b) {
  return {
    ...readPerson(b),
    company: str(b.company, 150),
    designation: str(b.designation, 80),
    city: str(b.city, 80)?.toUpperCase() || null,
    state: str(b.state, 80)?.toUpperCase() || null,
    address: str(b.address, 300),
    note: str(b.note, 2000),
  };
}

const fullName = (r) => [r.salutation, r.first_name, r.last_name].filter(Boolean).join(' ');

function oppStats() {
  // per phone number: every opportunity, for linking standalone contacts
  const byPhone = new Map();
  for (const o of all('SELECT id, phone, status, created_at, updated_at FROM opportunities ORDER BY id')) {
    const s = byPhone.get(o.phone) || { ids: [], won: 0, last: null };
    s.ids.push(o.id);
    if (o.status === 'won') s.won += 1;
    const t = o.updated_at || o.created_at;
    if (!s.last || t > s.last) s.last = t;
    byPhone.set(o.phone, s);
  }
  return byPhone;
}

function contactDTO(c, stats) {
  const s = stats.get(c.phone);
  const last = [c.updated_at, s?.last].filter(Boolean).sort().pop() || c.created_at;
  return {
    key: `c${c.id}`,
    source: 'contact',
    id: c.id,
    salutation: c.salutation,
    firstName: c.first_name,
    lastName: c.last_name || '',
    name: fullName(c),
    phoneCode: c.phone_code,
    phone: c.phone,
    email: c.email || '',
    company: c.company || '',
    designation: c.designation || '',
    city: c.city || '',
    state: c.state || '',
    address: c.address || '',
    note: c.note || '',
    opportunities: s?.ids.length || 0,
    won: s?.won || 0,
    opportunityIds: s?.ids || [],
    lastOpportunityId: s ? s.ids[s.ids.length - 1] : null,
    lastActivity: last,
    createdAt: c.created_at,
  };
}

function allContacts() {
  const stats = oppStats();
  const standalone = all('SELECT * FROM contacts ORDER BY id').map((c) => contactDTO(c, stats));
  const phones = new Set(standalone.map((c) => c.phone));
  const groups = all(
    `SELECT salutation, first_name, last_name, phone_code, phone, MAX(email) AS email, MAX(city) AS city, MAX(state) AS state, MAX(account) AS account,
       COUNT(*) AS opportunities, SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) AS won, MAX(COALESCE(updated_at, created_at)) AS last_activity,
       MAX(id) AS last_opportunity_id, GROUP_CONCAT(id) AS ids
     FROM opportunities GROUP BY phone, first_name, last_name`,
  )
    .filter((r) => !phones.has(r.phone))
    .map((r) => ({
      key: `o${r.last_opportunity_id}`,
      source: 'opportunity',
      id: null,
      salutation: r.salutation,
      firstName: r.first_name,
      lastName: r.last_name || '',
      name: fullName(r),
      phoneCode: r.phone_code,
      phone: r.phone,
      email: r.email || '',
      company: r.account || '',
      designation: '',
      city: r.city || '',
      state: r.state || '',
      address: '',
      note: '',
      opportunities: r.opportunities,
      won: r.won,
      opportunityIds: String(r.ids || '')
        .split(',')
        .map(Number)
        .filter(Boolean),
      lastOpportunityId: r.last_opportunity_id,
      lastActivity: r.last_activity,
      createdAt: null,
    }));
  return [...standalone, ...groups];
}

router.get('/contacts', (req, res) => {
  const q = str(req.query.q, 100)?.toLowerCase();
  const source = ['contact', 'opportunity'].includes(req.query.source) ? req.query.source : null;
  const page = Math.max(1, intParam(req.query.page, 1));
  const pageSize = Math.min(200, Math.max(5, intParam(req.query.pageSize, 25)));
  let rows = allContacts();
  if (source) rows = rows.filter((r) => r.source === source);
  if (q) rows = rows.filter((r) => [r.name, r.phone, `${r.phoneCode} ${r.phone}`, r.email, r.city, r.company].some((v) => String(v || '').toLowerCase().includes(q)));
  rows.sort((a, b) => String(b.lastActivity || '').localeCompare(String(a.lastActivity || '')));
  const counts = { all: 0, contact: 0, opportunity: 0 };
  for (const r of allContacts()) {
    counts.all += 1;
    counts[r.source] += 1;
  }
  res.json({ rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize, counts });
});

function assertUniquePhone(phone, exceptId = 0) {
  const dup = get('SELECT * FROM contacts WHERE phone = ? AND id != ?', phone, exceptId);
  if (dup) throw badRequest(`${fullName(dup)} already uses phone number ${dup.phone_code} ${dup.phone}`);
}

router.post('/contacts', (req, res) => {
  const f = readContact(req.body || {});
  assertUniquePhone(f.phone);
  const now = new Date().toISOString();
  const cols = Object.keys(f);
  const info = run(
    `INSERT INTO contacts (${cols.join(', ')}, created_by, created_at, updated_at) VALUES (${cols.map(() => '?').join(', ')}, ?, ?, ?)`,
    ...cols.map((c) => f[c]), req.user.id, now, now,
  );
  res.status(201).json(contactDTO(get('SELECT * FROM contacts WHERE id = ?', info.lastInsertRowid), oppStats()));
});

/** Edit a contact that exists only on opportunities: updates those opportunities' contact fields. */
router.put('/contacts/opportunity-contact', (req, res) => {
  const ids = (Array.isArray(req.body?.opportunityIds) ? req.body.opportunityIds : []).map((x) => intParam(x, 0)).filter(Boolean);
  if (!ids.length) throw badRequest('Choose the opportunities to update');
  const found = ids.filter((id) => get('SELECT id FROM opportunities WHERE id = ?', id));
  if (found.length !== ids.length) throw notFound('Opportunity');
  const f = readPerson(req.body || {});
  const now = new Date().toISOString();
  tx(() => {
    for (const id of ids) {
      run(
        'UPDATE opportunities SET salutation = ?, first_name = ?, last_name = ?, phone_code = ?, phone = ?, email = ?, updated_at = ? WHERE id = ?',
        f.salutation, f.first_name, f.last_name, f.phone_code, f.phone, f.email, now, id,
      );
    }
  });
  res.json({ ok: true, updatedOpportunities: ids.length });
});

router.put('/contacts/:id', (req, res) => {
  const c = get('SELECT * FROM contacts WHERE id = ?', intParam(req.params.id, 0));
  if (!c) throw notFound('Contact');
  const f = readContact(req.body || {});
  assertUniquePhone(f.phone, c.id);
  const now = new Date().toISOString();
  const updated = tx(() => {
    const cols = Object.keys(f);
    run(`UPDATE contacts SET ${cols.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, ...cols.map((k) => f[k]), now, c.id);
    // Keep the linked opportunities' contact details in step (they are matched by the old phone number).
    if (req.body?.updateOpportunities === false) return 0;
    return Number(
      run(
        'UPDATE opportunities SET salutation = ?, first_name = ?, last_name = ?, phone_code = ?, phone = ?, email = ?, updated_at = ? WHERE phone = ?',
        f.salutation, f.first_name, f.last_name, f.phone_code, f.phone, f.email, now, c.phone,
      ).changes,
    );
  });
  res.json({ ...contactDTO(get('SELECT * FROM contacts WHERE id = ?', c.id), oppStats()), updatedOpportunities: updated });
});

router.delete('/contacts/:id', (req, res) => {
  const c = get('SELECT * FROM contacts WHERE id = ?', intParam(req.params.id, 0));
  if (!c) throw notFound('Contact');
  run('DELETE FROM contacts WHERE id = ?', c.id);
  res.json({ ok: true });
});

export default router;
