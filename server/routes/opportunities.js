import { Router } from 'express';
import { all, get, run, tx, nextCounter, getSetting, parseJSON } from '../db.js';
import { DEFAULT_COMPANY } from '../engine/catalog.js';
import { badRequest, notFound, str, num, intParam, requireFields, rangeBounds } from './util.js';
import { requirePermission } from '../auth.js';

const router = Router();

const SORTS = {
  created_desc: 'o.created_at DESC',
  created_asc: 'o.created_at ASC',
  name_asc: 'o.project_name COLLATE NOCASE ASC',
  name_desc: 'o.project_name COLLATE NOCASE DESC',
  value_desc: 'COALESCE(q.grand_total, o.est_value, 0) DESC',
  value_asc: 'COALESCE(q.grand_total, o.est_value, 0) ASC',
  contacted_desc: '(SELECT MAX(contacted_at) FROM touchpoints t WHERE t.opportunity_id = o.id) DESC',
  updated_desc: 'o.updated_at DESC',
};

export function opportunityDTO(o) {
  if (!o) return null;
  return {
    id: o.id,
    code: o.code,
    projectName: o.project_name,
    salutation: o.salutation,
    firstName: o.first_name,
    lastName: o.last_name || '',
    contactName: [o.first_name, o.last_name].filter(Boolean).join(' '),
    phoneCode: o.phone_code,
    phone: o.phone,
    email: o.email || '',
    note: o.note || '',
    address1: o.address1 || '',
    address2: o.address2 || '',
    pincode: o.pincode || '',
    city: o.city,
    state: o.state,
    country: o.country || '',
    siteLocation: o.site_location || '',
    lat: o.lat,
    lng: o.lng,
    billTo: o.bill_to || '',
    marketingPartner: o.marketing_partner || '',
    managedBy: o.managed_by,
    stage: o.stage,
    source: o.source,
    estValue: o.est_value,
    category: o.category || '',
    closureDate: o.closure_date || '',
    supplyStart: o.supply_start || '',
    supplyEnd: o.supply_end || '',
    personnel: parseJSON(o.personnel, []),
    status: o.status,
    lostReason: o.lost_reason || '',
    statusChangedAt: o.status_changed_at,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    quoteId: o.quote_id ?? null,
    quoteNo: o.quote_no ?? null,
    quoteValue: o.grand_total ?? null,
    quoteArea: o.total_area ?? null,
    designCount: o.design_count ?? null,
    quoteCount: o.quote_count ?? null,
    touchpoints: o.touchpoints ?? 0,
    lastContactedAt: o.last_contacted ?? null,
    account: o.account || '',
    tags: parseJSON(o.tags, []),
    competitor: o.competitor || '',
  };
}

function readBody(b) {
  requireFields(b, [
    ['projectName', 'Project name'],
    ['firstName', 'First name'],
    ['phone', 'Phone number'],
    ['city', 'City'],
    ['state', 'State'],
    ['managedBy', 'Managed by'],
    ['stage', 'Opportunity stage'],
    ['source', 'Opportunity source'],
  ]);
  const phone = String(b.phone).replace(/\s+/g, '');
  if (!/^[0-9]{6,15}$/.test(phone)) throw badRequest('Phone number must contain 6 to 15 digits');
  if (b.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(b.email).trim())) throw badRequest('Email address is not valid');
  const personnel = Array.isArray(b.personnel)
    ? b.personnel
        .map((p) => ({ name: str(p?.name, 80), role: str(p?.role, 60), phone: str(p?.phone, 30) }))
        .filter((p) => p.name)
    : [];
  const dates = ['closureDate', 'supplyStart', 'supplyEnd'];
  for (const d of dates) if (b[d] && !/^\d{4}-\d{2}-\d{2}$/.test(String(b[d]))) throw badRequest('Dates must be in YYYY-MM-DD format');
  if (b.supplyStart && b.supplyEnd && b.supplyEnd < b.supplyStart) throw badRequest('Expected supply end date cannot be before the start date');
  return {
    project_name: str(b.projectName, 150),
    salutation: str(b.salutation, 10) || 'Mr.',
    first_name: str(b.firstName, 80),
    last_name: str(b.lastName, 80),
    phone_code: str(b.phoneCode, 6) || '+91',
    phone,
    email: str(b.email, 150),
    note: str(b.note, 2000),
    address1: str(b.address1, 200),
    address2: str(b.address2, 200),
    pincode: str(b.pincode, 12),
    city: str(b.city, 80),
    state: str(b.state, 80),
    country: str(b.country, 80),
    site_location: str(b.siteLocation, 300),
    lat: num(b.lat),
    lng: num(b.lng),
    bill_to: str(b.billTo, 150),
    marketing_partner: str(b.marketingPartner, 150),
    managed_by: str(b.managedBy, 120),
    stage: str(b.stage, 40),
    source: str(b.source, 60),
    est_value: num(b.estValue),
    category: str(b.category, 60),
    closure_date: str(b.closureDate, 10),
    supply_start: str(b.supplyStart, 10),
    supply_end: str(b.supplyEnd, 10),
    personnel: JSON.stringify(personnel),
    account: str(b.account, 150),
    tags: JSON.stringify(Array.isArray(b.tags) ? b.tags.map((t) => String(t).slice(0, 40)).filter(Boolean).slice(0, 20) : []),
    competitor: str(b.competitor, 120),
  };
}

const LIST_SELECT = `
  SELECT o.*, q.id AS quote_id, q.quote_no, q.grand_total, q.total_area,
    (SELECT COUNT(*) FROM designs d WHERE d.quote_id = q.id) AS design_count,
    (SELECT COUNT(*) FROM touchpoints t WHERE t.opportunity_id = o.id) AS touchpoints,
    (SELECT MAX(contacted_at) FROM touchpoints t WHERE t.opportunity_id = o.id) AS last_contacted,
    (SELECT COUNT(*) FROM quotes q2 WHERE q2.opportunity_id = o.id) AS quote_count
  FROM opportunities o
  LEFT JOIN quotes q ON q.id = (SELECT id FROM quotes WHERE opportunity_id = o.id ORDER BY is_default DESC, id LIMIT 1)`;

router.get('/opportunities', (req, res) => {
  const where = [];
  const params = [];
  const tab = req.query.tab || 'active';
  if (['active', 'won', 'lost'].includes(tab)) {
    where.push('o.status = ?');
    params.push(tab);
  }
  const q = str(req.query.q, 100);
  if (q) {
    where.push('(o.project_name LIKE ? OR o.first_name LIKE ? OR o.last_name LIKE ? OR o.phone LIKE ? OR o.code LIKE ? OR o.city LIKE ? OR o.account LIKE ?)');
    params.push(...Array(7).fill(`%${q}%`));
  }
  const { start, end } = rangeBounds(req.query.range || '90d', req.query.from, req.query.to);
  if (start) {
    where.push('o.created_at >= ?');
    params.push(start);
  }
  if (end) {
    where.push('o.created_at <= ?');
    params.push(end);
  }
  for (const [key, col] of [
    ['city', 'o.city'],
    ['source', 'o.source'],
    ['stage', 'o.stage'],
    ['managedBy', 'o.managed_by'],
    ['category', 'o.category'],
    ['account', 'o.account'],
  ]) {
    const values = [].concat(req.query[key] || []).map(String).filter(Boolean);
    if (values.length) {
      where.push(`${col} IN (${values.map(() => '?').join(',')})`);
      params.push(...values);
    }
  }
  if (req.query.view === 'mine') {
    where.push('o.managed_by = ?');
    params.push(req.user.name);
  } else if (req.query.view === 'quoted') {
    where.push('EXISTS (SELECT 1 FROM designs d JOIN quotes qq ON qq.id = d.quote_id WHERE qq.opportunity_id = o.id)');
  } else if (req.query.view === 'unquoted') {
    where.push('NOT EXISTS (SELECT 1 FROM designs d JOIN quotes qq ON qq.id = d.quote_id WHERE qq.opportunity_id = o.id)');
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const page = Math.max(1, intParam(req.query.page, 1));
  const pageSize = Math.min(200, Math.max(5, intParam(req.query.pageSize, 25)));
  const sort = SORTS[req.query.sort] || SORTS.created_desc;
  const total = get(`SELECT COUNT(*) c FROM opportunities o ${whereSql}`, ...params).c;
  const rows = all(`${LIST_SELECT} ${whereSql} ORDER BY ${sort}, o.id DESC LIMIT ? OFFSET ?`, ...params, pageSize, (page - 1) * pageSize).map(opportunityDTO);
  const counts = Object.fromEntries(
    all(`SELECT o.status, COUNT(*) c FROM opportunities o GROUP BY o.status`).map((r) => [r.status, r.c]),
  );
  res.json({ rows, total, page, pageSize, counts });
});

router.get('/opportunities/:id', (req, res) => {
  const o = get(`${LIST_SELECT} WHERE o.id = ?`, intParam(req.params.id, 0));
  if (!o) throw notFound('Opportunity');
  res.json(opportunityDTO(o));
});

export function createQuoteForOpportunity(oppId, priceStructureId) {
  const company = getSetting('company', DEFAULT_COMPANY);
  const ps =
    get('SELECT * FROM price_structures WHERE id = ?', priceStructureId ?? 0) ||
    get('SELECT * FROM price_structures WHERE id = ?', getSetting('defaultPriceStructure', 0) ?? 0) ||
    get("SELECT * FROM price_structures WHERE name = 'Retail Projects'") ||
    get('SELECT * FROM price_structures ORDER BY id LIMIT 1');
  const seq = nextCounter('quote', 3000);
  const existing = get('SELECT COUNT(*) c FROM quotes WHERE opportunity_id = ?', oppId).c;
  const now = new Date().toISOString();
  const info = run(
    `INSERT INTO quotes (opportunity_id, quote_no, alias, price_structure_id, price_structure_name, cost_heads, rate_overrides, defaults, created_at, updated_at, is_default, revision_no)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,1)`,
    oppId, `${company.quotePrefix || 'TIT-QT-'}${String(seq).padStart(8, '0')}`, String.fromCharCode(65 + Math.min(existing, 25)), ps.id, ps.name, ps.cost_heads, '{}',
    JSON.stringify({ floorAperture: company.defaultFloorAperture || 900 }), now, now, existing ? 0 : 1,
  );
  return Number(info.lastInsertRowid);
}

router.post('/opportunities', (req, res) => {
  const data = readBody(req.body || {});
  const company = getSetting('company', DEFAULT_COMPANY);
  const out = tx(() => {
    const seq = nextCounter('project', 3000);
    const code = `${company.projectPrefix || 'TIT-CH-'}${String(seq).padStart(8, '0')}`;
    const now = new Date().toISOString();
    const cols = Object.keys(data);
    const info = run(
      `INSERT INTO opportunities (code, ${cols.join(', ')}, status, created_by, created_at, updated_at) VALUES (?, ${cols.map(() => '?').join(', ')}, ?, ?, ?, ?)`,
      code, ...cols.map((c) => data[c]), data.stage === 'Won' ? 'won' : data.stage === 'Lost' ? 'lost' : 'active', req.user.id, now, now,
    );
    const oppId = Number(info.lastInsertRowid);
    const quoteId = createQuoteForOpportunity(oppId, intParam(req.body?.priceStructureId, null));
    return { oppId, quoteId };
  });
  const o = get(`${LIST_SELECT} WHERE o.id = ?`, out.oppId);
  res.status(201).json({ opportunity: opportunityDTO(o), quoteId: out.quoteId });
});

router.put('/opportunities/:id', (req, res) => {
  const id = intParam(req.params.id, 0);
  const existing = get('SELECT * FROM opportunities WHERE id = ?', id);
  if (!existing) throw notFound('Opportunity');
  const data = readBody(req.body || {});
  const cols = Object.keys(data);
  let status = existing.status;
  if (data.stage === 'Won') status = 'won';
  else if (data.stage === 'Lost') status = 'lost';
  else if (existing.status !== 'active') status = 'active';
  run(
    `UPDATE opportunities SET ${cols.map((c) => `${c} = ?`).join(', ')}, status = ?, status_changed_at = ?, updated_at = ? WHERE id = ?`,
    ...cols.map((c) => data[c]), status, status !== existing.status ? new Date().toISOString() : existing.status_changed_at, new Date().toISOString(), id,
  );
  res.json(opportunityDTO(get(`${LIST_SELECT} WHERE o.id = ?`, id)));
});

router.post('/opportunities/:id/status', (req, res) => {
  const id = intParam(req.params.id, 0);
  const existing = get('SELECT * FROM opportunities WHERE id = ?', id);
  if (!existing) throw notFound('Opportunity');
  const status = req.body?.status;
  if (!['active', 'won', 'lost'].includes(status)) throw badRequest('Invalid status');
  const reason = status === 'lost' ? str(req.body?.reason, 200) : null;
  if (status === 'lost' && !reason) throw badRequest('Please select a reason for losing this opportunity');
  const stage = status === 'won' ? 'Won' : status === 'lost' ? 'Lost' : existing.stage === 'Won' || existing.stage === 'Lost' ? 'Negotiation' : existing.stage;
  const now = new Date().toISOString();
  run('UPDATE opportunities SET status = ?, stage = ?, lost_reason = ?, status_changed_at = ?, updated_at = ? WHERE id = ?', status, stage, reason, now, now, id);
  res.json(opportunityDTO(get(`${LIST_SELECT} WHERE o.id = ?`, id)));
});

router.delete('/opportunities/:id', requirePermission('opportunity.delete'), (req, res) => {
  const id = intParam(req.params.id, 0);
  if (!get('SELECT id FROM opportunities WHERE id = ?', id)) throw notFound('Opportunity');
  run('DELETE FROM opportunities WHERE id = ?', id);
  res.json({ ok: true });
});

export default router;
