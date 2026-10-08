import { Router } from 'express';
import { all, get, run, getSetting, setSetting, parseJSON } from '../db.js';
import { hashPassword, publicUser, requirePermission } from '../auth.js';
import { lookupValues } from './admin.js';
import {
  OPPORTUNITY_STAGES, OPPORTUNITY_SOURCES, OPPORTUNITY_CATEGORIES, LOST_REASONS, DESIGN_NAMES, DOCUMENT_CATEGORIES, DEFAULT_COMPANY,
} from '../engine/catalog.js';
import { CALC_TYPES, FORMULA_VARIABLES, validateFormula } from '../engine/pricing.js';
import { badRequest, notFound, str, num, intParam } from './util.js';
import { validateDesignData } from './designUtil.js';

const router = Router();

function lookupOr(type, fallback) {
  const v = lookupValues(type);
  return v.length ? v : fallback;
}

function systemsList() {
  return all('SELECT * FROM systems ORDER BY name').map((s) => ({ ...s, roles: parseJSON(s.roles, {}), limits: parseJSON(s.limits, {}) }));
}

router.get('/masters', (_req, res) => {
  const libraryNames = all('SELECT DISTINCT name FROM library_designs').map((r) => r.name);
  const designNames = [...new Set([...DESIGN_NAMES, ...libraryNames])];
  res.json({
    systems: systemsList(),
    colors: all('SELECT * FROM colors ORDER BY sort, name'),
    glasses: all('SELECT * FROM glasses ORDER BY sort, name'),
    items: all('SELECT * FROM items ORDER BY sort, code'),
    cities: all('SELECT * FROM cities ORDER BY name COLLATE NOCASE'),
    users: all('SELECT * FROM users ORDER BY id').map(publicUser),
    priceStructures: all('SELECT id, name FROM price_structures ORDER BY id'),
    stages: [...lookupOr('opportunity_stage', OPPORTUNITY_STAGES.filter((x) => x !== 'Won' && x !== 'Lost')), 'Won', 'Lost'],
    sources: lookupOr('opportunity_source', OPPORTUNITY_SOURCES),
    categories: lookupOr('opportunity_category', OPPORTUNITY_CATEGORIES),
    lostReasons: lookupOr('lost_reason', LOST_REASONS),
    documentCategories: lookupOr('document_category', DOCUMENT_CATEGORIES),
    lostCompetitors: lookupValues('lost_competitor'),
    personnelTypes: lookupValues('personnel_type'),
    accountTypes: lookupValues('account_type'),
    tags: lookupValues('tag'),
    touchpointTypes: lookupOr('touchpoint_type', ['Call', 'Site visit', 'Meeting', 'WhatsApp', 'Email']),
    glazingSuppliers: lookupValues('glazing_supplier'),
    roles: all('SELECT name FROM roles ORDER BY name').map((r) => r.name),
    priceLevels: all('SELECT id, category, name, is_default FROM price_levels ORDER BY category, is_default DESC, name').map((l) => ({ id: l.id, category: l.category, name: l.name, isDefault: !!l.is_default })),
    defaultPriceStructureId: getSetting('defaultPriceStructure', null),
    designNames,
    calcTypes: CALC_TYPES,
    formulaVariables: FORMULA_VARIABLES,
    company: getSetting('company', DEFAULT_COMPANY),
    banner: getSetting('banner', { enabled: false, message: '' }),
  });
});

// ---------- items / rate master ----------
router.put('/masters/items/:code', requirePermission('rates.manage'), (req, res) => {
  const item = get('SELECT * FROM items WHERE code = ?', req.params.code);
  if (!item) throw notFound('Item');
  const rate = num(req.body?.rate);
  const rateLam = num(req.body?.rate_lam);
  if (rate == null || rate < 0) throw badRequest('Rate must be a positive number');
  run(
    'UPDATE items SET name = ?, rate = ?, rate_lam = ?, unit = ? WHERE code = ?',
    str(req.body?.name, 200) || item.name,
    rate,
    item.color_variant ? (rateLam ?? item.rate_lam) : null,
    str(req.body?.unit, 20) || item.unit,
    item.code,
  );
  res.json(get('SELECT * FROM items WHERE code = ?', item.code));
});

const ITEM_GROUPS = {
  profile: 'Profile',
  aluminium: 'Aluminium Profiles',
  reinforcement: 'Reinforcement',
};
router.post('/masters/items', requirePermission('rates.manage'), (req, res) => {
  const code = str(req.body?.code, 60);
  const name = str(req.body?.name, 200);
  const category = str(req.body?.category, 30);
  if (!code || !name || !category) throw badRequest('Code, name and category are required');
  if (get('SELECT code FROM items WHERE code = ?', code)) throw badRequest('An item with this code already exists');
  const grp = ITEM_GROUPS[category] || str(req.body?.grp, 60) || 'Fabrication Hardware';
  const rate = num(req.body?.rate) ?? 0;
  const maxSort = get('SELECT MAX(sort) m FROM items').m || 0;
  run(
    'INSERT INTO items (code, name, category, grp, unit, rate, rate_lam, color_variant, bar_length, weight, sort) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    code.toUpperCase(), name.toUpperCase(), category, grp, str(req.body?.unit, 20) || 'Pcs', rate,
    category === 'profile' ? num(req.body?.rate_lam) ?? rate : null, category === 'profile' ? 1 : 0,
    ['profile', 'aluminium', 'reinforcement'].includes(category) ? num(req.body?.bar_length) ?? 5.8 : null, 0, maxSort + 1,
  );
  res.status(201).json(get('SELECT * FROM items WHERE code = ?', code.toUpperCase()));
});

// ---------- glass & mesh ----------
router.put('/masters/glasses/:id', requirePermission('rates.manage'), (req, res) => {
  const g = get('SELECT * FROM glasses WHERE id = ?', req.params.id);
  if (!g) throw notFound('Glass');
  const rate = num(req.body?.rate);
  if (rate == null || rate < 0) throw badRequest('Rate must be a positive number');
  run('UPDATE glasses SET name = ?, rate = ? WHERE id = ?', str(req.body?.name, 120) || g.name, rate, g.id);
  res.json(get('SELECT * FROM glasses WHERE id = ?', g.id));
});
router.post('/masters/glasses', requirePermission('rates.manage'), (req, res) => {
  const name = str(req.body?.name, 120);
  const code = str(req.body?.code, 40);
  const kind = ['glass', 'louver', 'mesh'].includes(req.body?.kind) ? req.body.kind : 'glass';
  if (!name || !code) throw badRequest('Code and name are required');
  const id = `${kind}-${code.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  if (get('SELECT id FROM glasses WHERE id = ? OR code = ?', id, code)) throw badRequest('This glass already exists');
  const maxSort = get('SELECT MAX(sort) m FROM glasses').m || 0;
  run('INSERT INTO glasses (id, code, name, thickness, rate, kind, sort) VALUES (?,?,?,?,?,?,?)', id, code.toUpperCase(), name.toUpperCase(), num(req.body?.thickness) ?? 4, num(req.body?.rate) ?? 0, kind, maxSort + 1);
  res.status(201).json(get('SELECT * FROM glasses WHERE id = ?', id));
});

// ---------- colours ----------
router.post('/masters/colors', requirePermission('rates.manage'), (req, res) => {
  const name = str(req.body?.name, 80);
  const hex = str(req.body?.hex, 10);
  if (!name || !hex || !/^#[0-9a-f]{6}$/i.test(hex)) throw badRequest('Name and a valid hex colour are required');
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  if (get('SELECT id FROM colors WHERE id = ?', id)) throw badRequest('This colour already exists');
  const suffix = (str(req.body?.suffix, 4) || name.slice(0, 2)).toUpperCase();
  const maxSort = get('SELECT MAX(sort) m FROM colors').m || 0;
  run(
    'INSERT INTO colors (id, name, inside, outside, hex_in, hex_out, suffix, laminated, sort) VALUES (?,?,?,?,?,?,?,?,?)',
    id, name.toUpperCase(), name.toUpperCase(), name.toUpperCase(), hex, hex, suffix, req.body?.laminated === false ? 0 : 1, maxSort + 1,
  );
  res.status(201).json(get('SELECT * FROM colors WHERE id = ?', id));
});

// ---------- cities ----------
router.post('/masters/cities', (req, res) => {
  const name = str(req.body?.name, 80);
  if (!name) throw badRequest('City name is required');
  const existing = get('SELECT * FROM cities WHERE name = ?', name);
  if (existing) return res.json(existing);
  const info = run('INSERT INTO cities (name, state, country) VALUES (?,?,?)', name.toUpperCase(), (str(req.body?.state, 80) || 'TAMILNADU').toUpperCase(), (str(req.body?.country, 80) || 'INDIA').toUpperCase());
  res.status(201).json(get('SELECT * FROM cities WHERE id = ?', info.lastInsertRowid));
});

// ---------- settings ----------
router.get('/settings/company', (_req, res) => res.json(getSetting('company', DEFAULT_COMPANY)));
router.put('/settings/company', requirePermission('settings.manage'), (req, res) => {
  const current = getSetting('company', DEFAULT_COMPANY);
  const b = req.body || {};
  if (!str(b.name)) throw badRequest('Company name is required');
  for (const key of ['logo', 'partnerLogo', 'headerImage']) {
    if (b[key] === undefined || b[key] === '') continue;
    if (typeof b[key] !== 'string' || !/^data:image\/(png|jpe?g|webp|svg\+xml);base64,/.test(b[key])) throw badRequest('Images must be PNG, JPG, WEBP or SVG');
    if (b[key].length > 2_800_000) throw badRequest('Each image must be smaller than 2 MB');
  }
  const next = {
    ...current,
    ...b,
    bank: { ...current.bank, ...(b.bank || {}) },
    paymentTerms: Array.isArray(b.paymentTerms) ? b.paymentTerms.map(String).filter(Boolean) : current.paymentTerms,
    terms: Array.isArray(b.terms) ? b.terms.map(String).filter(Boolean) : current.terms,
    prerequisites: Array.isArray(b.prerequisites) ? b.prerequisites.map(String).filter(Boolean) : current.prerequisites,
  };
  setSetting('company', next);
  res.json(next);
});
router.put('/settings/banner', requirePermission('settings.manage'), (req, res) => {
  const next = { enabled: !!req.body?.enabled, message: str(req.body?.message, 500) || '' };
  setSetting('banner', next);
  res.json(next);
});

// ---------- users ----------
router.get('/users', (_req, res) => res.json(all('SELECT * FROM users ORDER BY id').map(publicUser)));
function roleOf(value, fallback) {
  const v = str(value, 40);
  return v && get('SELECT name FROM roles WHERE name = ?', v) ? v : fallback;
}

router.post('/users', requirePermission('settings.manage'), (req, res) => {
  const name = str(req.body?.name, 120);
  const email = str(req.body?.email, 200);
  const password = String(req.body?.password || '');
  if (!name || !email) throw badRequest('Name and email are required');
  if (password.length < 6) throw badRequest('Password must be at least 6 characters');
  if (get('SELECT id FROM users WHERE email = ?', email)) throw badRequest('An account with this email already exists');
  const { hash, salt } = hashPassword(password);
  const info = run(
    'INSERT INTO users (name, email, password_hash, salt, role, team, phone, created_at) VALUES (?,?,?,?,?,?,?,?)',
    name.toUpperCase(), email, hash, salt, roleOf(req.body?.role, 'sales'), str(req.body?.team, 80), str(req.body?.phone, 30), new Date().toISOString(),
  );
  res.status(201).json(publicUser(get('SELECT * FROM users WHERE id = ?', info.lastInsertRowid)));
});
router.put('/users/:id', requirePermission('settings.manage'), (req, res) => {
  const u = get('SELECT * FROM users WHERE id = ?', intParam(req.params.id, 0));
  if (!u) throw notFound('User');
  run(
    'UPDATE users SET name = ?, team = ?, phone = ?, role = ? WHERE id = ?',
    (str(req.body?.name, 120) || u.name).toUpperCase(), str(req.body?.team, 80), str(req.body?.phone, 30), u.id === req.user.id ? u.role : roleOf(req.body?.role, u.role), u.id,
  );
  res.json(publicUser(get('SELECT * FROM users WHERE id = ?', u.id)));
});
router.delete('/users/:id', requirePermission('settings.manage'), (req, res) => {
  const id = intParam(req.params.id, 0);
  if (id === req.user.id) throw badRequest('You cannot remove your own account');
  run('DELETE FROM users WHERE id = ?', id);
  res.json({ ok: true });
});

// ---------- price structures ----------
router.get('/price-structures', (_req, res) => {
  const def = getSetting('defaultPriceStructure', null);
  res.json(all('SELECT * FROM price_structures ORDER BY id').map((p) => ({ ...p, cost_heads: parseJSON(p.cost_heads, []), is_default: p.id === def })));
});
router.put('/price-structures/:id', requirePermission('settings.manage'), (req, res) => {
  const ps = get('SELECT * FROM price_structures WHERE id = ?', intParam(req.params.id, 0));
  if (!ps) throw notFound('Price structure');
  const heads = normaliseCostHeads(req.body?.cost_heads);
  run('UPDATE price_structures SET name = ?, cost_heads = ? WHERE id = ?', str(req.body?.name, 80) || ps.name, JSON.stringify(heads), ps.id);
  res.json({ ...get('SELECT * FROM price_structures WHERE id = ?', ps.id), cost_heads: heads });
});
router.put('/price-structures/:id/default', requirePermission('settings.manage'), (req, res) => {
  const ps = get('SELECT id FROM price_structures WHERE id = ?', intParam(req.params.id, 0));
  if (!ps) throw notFound('Price structure');
  setSetting('defaultPriceStructure', ps.id);
  res.json({ ok: true });
});

router.post('/price-structures', requirePermission('settings.manage'), (req, res) => {
  const name = str(req.body?.name, 80);
  if (!name) throw badRequest('Name is required');
  if (get('SELECT id FROM price_structures WHERE name = ?', name)) throw badRequest('A price structure with this name already exists');
  const source = get('SELECT * FROM price_structures WHERE id = ?', intParam(req.body?.copyFrom, 0)) || get('SELECT * FROM price_structures ORDER BY id LIMIT 1');
  const info = run('INSERT INTO price_structures (name, cost_heads) VALUES (?, ?)', name, source.cost_heads);
  res.status(201).json({ id: Number(info.lastInsertRowid), name, cost_heads: parseJSON(source.cost_heads, []) });
});

export function normaliseCostHeads(input) {
  if (!Array.isArray(input) || !input.length) throw badRequest('At least one cost head is required');
  const names = [];
  const heads = input.map((h, i) => {
    const name = str(h?.name, 80);
    if (!name) throw badRequest(`Cost head ${i + 1} needs a name`);
    if (names.includes(name)) throw badRequest(`Duplicate cost head name "${name}"`);
    const calcType = CALC_TYPES.includes(h.calcType) ? h.calcType : 'CustomFormula';
    const formula = String(h.formula ?? '').slice(0, 1000);
    if (calcType === 'CustomFormula' || calcType === 'Percentage') {
      const err = validateFormula(formula, names);
      if (err) throw badRequest(`${name}: ${err}`);
    }
    names.push(name);
    const rate = Number(h.rate);
    return {
      sl: i + 1,
      name,
      calcType,
      formula,
      rate: Number.isFinite(rate) ? rate : 0,
      visibility: h.visibility === 'summary' ? 'summary' : 'hidden',
      remark: String(h.remark ?? '').slice(0, 500),
      userRights: h.userRights === 'Allocate permission' ? 'Allocate permission' : 'Administrator',
    };
  });
  return heads;
}

// ---------- library designs ----------
router.get('/library', (req, res) => {
  const q = str(req.query.q, 80);
  const page = Math.max(1, intParam(req.query.page, 1));
  const pageSize = Math.min(100, Math.max(1, intParam(req.query.pageSize, 25)));
  const conds = [];
  const params = [];
  if (q) {
    conds.push('(l.name LIKE ? OR s.name LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  const systemId = str(req.query.systemId, 60);
  if (systemId) {
    conds.push('l.system_id = ?');
    params.push(systemId);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const total = get(`SELECT COUNT(*) c FROM library_designs l LEFT JOIN systems s ON s.id = l.system_id ${where}`, ...params).c;
  const rows = all(
    `SELECT l.*, s.name AS system_name FROM library_designs l LEFT JOIN systems s ON s.id = l.system_id ${where} ORDER BY l.id LIMIT ? OFFSET ?`,
    ...params, pageSize, (page - 1) * pageSize,
  ).map((r) => ({ id: r.id, name: r.name, systemId: r.system_id, systemName: r.system_name, colorId: r.color_id, glassId: r.glass_id, data: parseJSON(r.data, {}), createdAt: r.created_at }));
  res.json({ rows, total, page, pageSize });
});
router.post('/library', (req, res) => {
  const name = str(req.body?.name, 80);
  if (!name) throw badRequest('Design name is required');
  const data = validateDesignData(req.body?.data);
  const info = run(
    'INSERT INTO library_designs (name, system_id, color_id, glass_id, data, created_at) VALUES (?,?,?,?,?,?)',
    name.toUpperCase(), str(req.body?.systemId) || 'inventa-sliding', str(req.body?.colorId) || 'white', str(req.body?.glassId) || 'g4-pinhead', JSON.stringify(data), new Date().toISOString(),
  );
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});
router.delete('/library/:id', (req, res) => {
  run('DELETE FROM library_designs WHERE id = ?', intParam(req.params.id, 0));
  res.json({ ok: true });
});

// ---------- favourite reports ----------
export const REPORT_KEYS = ['elevation', 'quotation', 'project-cost-summary', 'typology-cost-breakup', 'profile-boq', 'accessories-boq', 'glass-boq', 'cutting-schedule', 'design-assembly'];
router.get('/reports/favourites', (req, res) => {
  const flag = `favinit:${req.user.id}`;
  if (!getSetting(flag, false)) {
    for (const r of REPORT_KEYS) run('INSERT OR IGNORE INTO favourite_reports (user_id, report) VALUES (?, ?)', req.user.id, r);
    setSetting(flag, true);
  }
  res.json(all('SELECT report FROM favourite_reports WHERE user_id = ?', req.user.id).map((r) => r.report));
});
router.put('/reports/favourites/:report', (req, res) => {
  const report = str(req.params.report, 60);
  if (req.body?.favourite) run('INSERT OR IGNORE INTO favourite_reports (user_id, report) VALUES (?, ?)', req.user.id, report);
  else run('DELETE FROM favourite_reports WHERE user_id = ? AND report = ?', req.user.id, report);
  res.json(all('SELECT report FROM favourite_reports WHERE user_id = ?', req.user.id).map((r) => r.report));
});

export default router;
