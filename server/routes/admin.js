import { Router } from 'express';
import { all, get, run, tx, parseJSON, getSetting, setSetting } from '../db.js';
import { can, requirePermission } from '../auth.js';
import { PERMISSIONS, DEFAULT_LOOKUPS } from '../engine/catalog.js';
import { badRequest, notFound, str, num, intParam } from './util.js';
import { createQuoteForOpportunity } from './opportunities.js';
import { nextCounter } from '../db.js';

const router = Router();

// ---------------------------------------------------------------- lookups
export const LOOKUP_TYPES = Object.keys(DEFAULT_LOOKUPS);

export function lookupValues(type) {
  return all('SELECT value FROM lookups WHERE type = ? ORDER BY sort, value COLLATE NOCASE', type).map((r) => r.value);
}

router.get('/lookups', (_req, res) => {
  const out = Object.fromEntries(LOOKUP_TYPES.map((t) => [t, []]));
  for (const r of all('SELECT * FROM lookups ORDER BY sort, value COLLATE NOCASE')) {
    (out[r.type] ||= []).push({ value: r.value, meta: parseJSON(r.meta, {}), sort: r.sort });
  }
  res.json(out);
});

function lookupType(req) {
  const type = str(req.params.type, 40);
  if (!LOOKUP_TYPES.includes(type)) throw badRequest('Unknown list');
  return type;
}

router.post('/lookups/:type', requirePermission('settings.manage'), (req, res) => {
  const type = lookupType(req);
  const value = str(req.body?.value, 120);
  if (!value) throw badRequest('Name is required');
  if (type === 'opportunity_stage' && /^(won|lost)$/i.test(value)) throw badRequest('Won and Lost are built-in stages');
  if (get('SELECT value FROM lookups WHERE type = ? AND value = ? COLLATE NOCASE', type, value)) throw badRequest(`"${value}" already exists`);
  const sort = (get('SELECT MAX(sort) m FROM lookups WHERE type = ?', type)?.m ?? -1) + 1;
  run('INSERT INTO lookups (type, value, meta, sort) VALUES (?,?,?,?)', type, value, JSON.stringify(req.body?.meta || {}), sort);
  res.status(201).json({ value, meta: req.body?.meta || {}, sort });
});

router.put('/lookups/:type/:value', requirePermission('settings.manage'), (req, res) => {
  const type = lookupType(req);
  const old = get('SELECT * FROM lookups WHERE type = ? AND value = ?', type, req.params.value);
  if (!old) throw notFound('Item');
  const value = str(req.body?.value, 120) || old.value;
  if (value !== old.value && get('SELECT value FROM lookups WHERE type = ? AND value = ? COLLATE NOCASE', type, value)) throw badRequest(`"${value}" already exists`);
  tx(() => {
    run('UPDATE lookups SET value = ?, meta = ?, sort = ? WHERE type = ? AND value = ?', value, JSON.stringify(req.body?.meta ?? parseJSON(old.meta, {})), intParam(req.body?.sort, old.sort), type, old.value);
    // Keep existing records consistent when a value is renamed.
    const column = { opportunity_source: 'source', opportunity_stage: 'stage', lost_reason: 'lost_reason', opportunity_category: 'category' }[type];
    if (column && value !== old.value) run(`UPDATE opportunities SET ${column} = ? WHERE ${column} = ?`, value, old.value);
  });
  res.json({ ok: true });
});

router.delete('/lookups/:type/:value', requirePermission('settings.manage'), (req, res) => {
  const type = lookupType(req);
  run('DELETE FROM lookups WHERE type = ? AND value = ?', type, req.params.value);
  res.json({ ok: true });
});

router.put('/lookups/:type', requirePermission('settings.manage'), (req, res) => {
  // Reorder: { values: [...] }
  const type = lookupType(req);
  const values = Array.isArray(req.body?.values) ? req.body.values.map(String) : [];
  tx(() => values.forEach((v, i) => run('UPDATE lookups SET sort = ? WHERE type = ? AND value = ?', i, type, v)));
  res.json({ ok: true });
});

// ---------------------------------------------------------------- price levels
const LEVEL_CATEGORIES = ['profile', 'reinforcement', 'hardware', 'glass'];

function levelRow(id) {
  const lv = get('SELECT * FROM price_levels WHERE id = ?', intParam(id, 0));
  if (!lv) throw notFound('Price level');
  return lv;
}

/** Every priceable row of a category, with its default rate (one row per colour variant for profiles). */
export function catalogRows(category) {
  const rows = [];
  if (category === 'glass') {
    for (const g of all('SELECT * FROM glasses ORDER BY sort, name')) {
      rows.push({
        code: g.code, baseCode: g.code, name: g.name, brand: g.supplier || (g.kind === 'mesh' ? 'MESH' : 'GLASS'), rmCategory: g.kind.toUpperCase(),
        reportingCategory: g.kind === 'mesh' ? 'Mesh' : 'Glazing', color: '', unit: 'Square Meter', defaultRate: Number(g.rate), kind: g.kind,
      });
    }
    return rows;
  }
  const cats = category === 'profile' ? ['profile', 'aluminium'] : [category];
  const colors = all('SELECT * FROM colors ORDER BY sort');
  const items = all(`SELECT * FROM items WHERE category IN (${cats.map(() => '?').join(',')}) ORDER BY sort, code`, ...cats);
  for (const it of items) {
    const extra = parseJSON(it.extra, {});
    const base = {
      baseCode: it.code, name: it.name, brand: it.brand || 'PROMINANCE', rmCategory: it.rm_category || it.grp.toUpperCase(),
      reportingCategory: it.category === 'aluminium' ? 'Aluminium Profiles' : it.grp, unit: it.unit,
    };
    if (it.color_variant) {
      for (const c of colors) {
        rows.push({ ...base, code: c.suffix ? `${it.code}-${c.suffix}` : it.code, color: c.inside === c.outside ? (c.suffix ? `${c.inside}(In) ${c.outside}(Out)` : c.name) : `${c.inside}(In) ${c.outside}(Out)`, defaultRate: Number(c.laminated ? it.rate_lam ?? it.rate : it.rate), colorId: c.id });
      }
    } else {
      rows.push({ ...base, code: it.code, color: extra.hw_color || (it.category === 'hardware' || it.category === 'aluminium' ? 'WHITE' : ''), defaultRate: Number(it.rate) });
    }
  }
  return rows;
}

router.get('/price-levels', (req, res) => {
  const category = String(req.query.category || '');
  const where = LEVEL_CATEGORIES.includes(category) ? 'WHERE category = ?' : '';
  const rows = all(`SELECT * FROM price_levels ${where} ORDER BY category, is_default DESC, name`, ...(where ? [category] : []));
  res.json(rows.map((l) => ({ id: l.id, category: l.category, name: l.name, isDefault: !!l.is_default, createdAt: l.created_at })));
});

router.post('/price-levels', requirePermission('rates.manage'), (req, res) => {
  const category = String(req.body?.category || '');
  const name = str(req.body?.name, 80);
  if (!LEVEL_CATEGORIES.includes(category)) throw badRequest('Unknown category');
  if (!name) throw badRequest('Price level name is required');
  if (get('SELECT id FROM price_levels WHERE category = ? AND name = ? COLLATE NOCASE', category, name)) throw badRequest('A price level with this name already exists');
  const adjust = num(req.body?.adjustPct) ?? 0;
  if (adjust < -100 || adjust > 500) throw badRequest('Adjustment must be between -100% and 500%');
  const id = tx(() => {
    const info = run('INSERT INTO price_levels (category, name, is_default) VALUES (?,?,0)', category, name);
    const levelId = Number(info.lastInsertRowid);
    // Start from the default level's effective prices, adjusted by a percentage (e.g. -25 for "25% Discounted Price").
    const def = get('SELECT * FROM price_levels WHERE category = ? AND is_default = 1', category);
    const defPrices = new Map(def ? all('SELECT code, rate FROM level_prices WHERE level_id = ?', def.id).map((r) => [r.code, r.rate]) : []);
    for (const row of catalogRows(category)) {
      const rate = defPrices.get(row.code) ?? row.defaultRate;
      run('INSERT INTO level_prices (level_id, code, rate) VALUES (?,?,?)', levelId, row.code, Math.round(rate * (1 + adjust / 100) * 100) / 100);
    }
    return levelId;
  });
  res.status(201).json({ id, category, name, isDefault: false });
});

router.put('/price-levels/:id', requirePermission('rates.manage'), (req, res) => {
  const lv = levelRow(req.params.id);
  const name = str(req.body?.name, 80) || lv.name;
  if (name !== lv.name && get('SELECT id FROM price_levels WHERE category = ? AND name = ? COLLATE NOCASE AND id != ?', lv.category, name, lv.id)) throw badRequest('A price level with this name already exists');
  run('UPDATE price_levels SET name = ? WHERE id = ?', name, lv.id);
  res.json({ ok: true });
});

router.delete('/price-levels/:id', requirePermission('rates.manage'), (req, res) => {
  const lv = levelRow(req.params.id);
  if (lv.is_default) throw badRequest('The default price level cannot be deleted');
  tx(() => {
    run('DELETE FROM level_prices WHERE level_id = ?', lv.id);
    run('DELETE FROM price_levels WHERE id = ?', lv.id);
    // Quotes that used this level fall back to the default level.
    for (const q of all("SELECT id, price_levels FROM quotes WHERE price_levels LIKE ?", `%${lv.id}%`)) {
      const levels = parseJSON(q.price_levels, {});
      if (Number(levels[lv.category]) === lv.id) {
        delete levels[lv.category];
        run('UPDATE quotes SET price_levels = ? WHERE id = ?', JSON.stringify(levels), q.id);
      }
    }
  });
  res.json({ ok: true });
});

/** Rows of a price level with their effective rate. */
export function levelPrices(lv) {
  const prices = new Map(all('SELECT code, rate, updated_at FROM level_prices WHERE level_id = ?', lv.id).map((r) => [r.code, r]));
  return catalogRows(lv.category).map((r) => {
    const p = prices.get(r.code);
    return { ...r, rate: p ? Number(p.rate) : r.defaultRate, overridden: !!p, status: 'Saved', rmsStatus: 'Active' };
  });
}

router.get('/price-levels/:id/prices', (req, res) => {
  const lv = levelRow(req.params.id);
  let rows = levelPrices(lv);
  const q = str(req.query.q, 80)?.toLowerCase();
  if (q) rows = rows.filter((r) => r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || (r.color || '').toLowerCase().includes(q) || (r.rmCategory || '').toLowerCase().includes(q));
  const group = str(req.query.group, 60);
  if (group) rows = rows.filter((r) => r.reportingCategory === group || r.rmCategory === group);
  const sort = String(req.query.sort || '');
  if (sort) {
    const [key, dir] = sort.split(':');
    const k = { code: 'code', name: 'name', rate: 'rate', color: 'color', category: 'rmCategory' }[key];
    if (k) rows.sort((a, b) => (typeof a[k] === 'number' ? a[k] - b[k] : String(a[k]).localeCompare(String(b[k]))) * (dir === 'desc' ? -1 : 1));
  }
  const page = Math.max(1, intParam(req.query.page, 1));
  const pageSize = Math.min(500, Math.max(5, intParam(req.query.pageSize, 25)));
  res.json({ level: { id: lv.id, name: lv.name, category: lv.category, isDefault: !!lv.is_default }, rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize });
});

/** Save rates of a level. For the default level, plain (non-colour) codes update the master rate directly. */
export function saveLevelRates(lv, rates) {
  const known = new Map(catalogRows(lv.category).map((r) => [r.code, r]));
  let updated = 0;
  tx(() => {
    for (const [code, value] of Object.entries(rates)) {
      const row = known.get(code);
      if (!row) continue;
      if (value === null || value === '') {
        run('DELETE FROM level_prices WHERE level_id = ? AND code = ?', lv.id, code);
        updated++;
        continue;
      }
      const rate = Number(value);
      if (!Number.isFinite(rate) || rate < 0) throw badRequest(`Rate for ${code} must be a positive number`);
      if (lv.is_default && row.code === row.baseCode && !row.colorId) {
        if (lv.category === 'glass') run('UPDATE glasses SET rate = ? WHERE code = ?', rate, code);
        else run('UPDATE items SET rate = ? WHERE code = ?', rate, code);
        run('DELETE FROM level_prices WHERE level_id = ? AND code = ?', lv.id, code);
      } else {
        run(
          'INSERT INTO level_prices (level_id, code, rate, updated_at) VALUES (?,?,?,?) ON CONFLICT(level_id, code) DO UPDATE SET rate = excluded.rate, updated_at = excluded.updated_at',
          lv.id, code, rate, new Date().toISOString(),
        );
      }
      updated++;
    }
  });
  return updated;
}

router.put('/price-levels/:id/prices', requirePermission('rates.manage'), (req, res) => {
  const lv = levelRow(req.params.id);
  const rates = req.body?.rates;
  if (!rates || typeof rates !== 'object') throw badRequest('Rates are required');
  res.json({ ok: true, updated: saveLevelRates(lv, rates) });
});

router.post('/price-levels/:id/import', requirePermission('rates.manage'), (req, res) => {
  // rows: [{ code, rate }] parsed from an Excel sheet in the browser.
  const lv = levelRow(req.params.id);
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length) throw badRequest('The file has no rows');
  const known = new Set(catalogRows(lv.category).map((r) => r.code));
  const rates = {};
  const skipped = [];
  for (const r of rows) {
    const code = str(r?.code, 80);
    const rate = Number(r?.rate);
    if (!code || !known.has(code)) {
      if (code) skipped.push(code);
      continue;
    }
    if (!Number.isFinite(rate) || rate < 0) {
      skipped.push(code);
      continue;
    }
    rates[code] = rate;
  }
  const updated = saveLevelRates(lv, rates);
  res.json({ ok: true, updated, skipped: skipped.slice(0, 50), skippedCount: skipped.length });
});

// ---------------------------------------------------------------- roles & permissions
router.get('/roles', (_req, res) => {
  const counts = Object.fromEntries(all('SELECT role, COUNT(*) c FROM users GROUP BY role').map((r) => [r.role, r.c]));
  res.json({
    permissions: PERMISSIONS,
    roles: all('SELECT * FROM roles ORDER BY name').map((r) => ({ name: r.name, permissions: parseJSON(r.permissions, {}), users: counts[r.name] || 0, locked: r.name === 'admin' })),
  });
});
router.post('/roles', requirePermission('settings.manage'), (req, res) => {
  const name = str(req.body?.name, 40)?.toLowerCase().replace(/[^a-z0-9 _-]/g, '');
  if (!name) throw badRequest('Role name is required');
  if (get('SELECT name FROM roles WHERE name = ?', name)) throw badRequest('This role already exists');
  run('INSERT INTO roles (name, permissions) VALUES (?, ?)', name, JSON.stringify(req.body?.permissions || {}));
  res.status(201).json({ ok: true, name });
});
router.put('/roles/:name', requirePermission('settings.manage'), (req, res) => {
  const role = get('SELECT * FROM roles WHERE name = ?', req.params.name);
  if (!role) throw notFound('Role');
  if (role.name === 'admin') throw badRequest('The administrator role always has every permission');
  const perms = Object.fromEntries(PERMISSIONS.map((p) => [p.key, !!req.body?.permissions?.[p.key]]));
  run('UPDATE roles SET permissions = ? WHERE name = ?', JSON.stringify(perms), role.name);
  res.json({ ok: true });
});
router.delete('/roles/:name', requirePermission('settings.manage'), (req, res) => {
  const name = req.params.name;
  if (name === 'admin' || name === 'sales') throw badRequest('Built-in roles cannot be deleted');
  if (get('SELECT id FROM users WHERE role = ? LIMIT 1', name)) throw badRequest('Move the users in this role to another role first');
  run('DELETE FROM roles WHERE name = ?', name);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- locations
router.get('/cities', (_req, res) => {
  const counts = Object.fromEntries(all('SELECT city, COUNT(*) c FROM opportunities GROUP BY city').map((r) => [String(r.city).toUpperCase(), r.c]));
  res.json(all('SELECT * FROM cities ORDER BY state, name COLLATE NOCASE').map((c) => ({ ...c, opportunities: counts[String(c.name).toUpperCase()] || 0 })));
});
router.put('/cities/:id', requirePermission('settings.manage'), (req, res) => {
  const c = get('SELECT * FROM cities WHERE id = ?', intParam(req.params.id, 0));
  if (!c) throw notFound('City');
  const name = (str(req.body?.name, 80) || c.name).toUpperCase();
  if (name !== c.name && get('SELECT id FROM cities WHERE name = ? COLLATE NOCASE AND id != ?', name, c.id)) throw badRequest('This city already exists');
  run('UPDATE cities SET name = ?, state = ?, country = ? WHERE id = ?', name, (str(req.body?.state, 80) || c.state).toUpperCase(), (str(req.body?.country, 80) || c.country).toUpperCase(), c.id);
  if (name !== c.name) run('UPDATE opportunities SET city = ? WHERE city = ?', name, c.name);
  res.json({ ok: true });
});
router.delete('/cities/:id', requirePermission('settings.manage'), (req, res) => {
  const c = get('SELECT * FROM cities WHERE id = ?', intParam(req.params.id, 0));
  if (!c) throw notFound('City');
  if (get('SELECT id FROM opportunities WHERE city = ? COLLATE NOCASE LIMIT 1', c.name)) throw badRequest('This city is used by opportunities and cannot be deleted');
  run('DELETE FROM cities WHERE id = ?', c.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- saved views
router.get('/views', (req, res) => {
  const page = str(req.query.page, 40) || 'opportunity';
  res.json(all('SELECT * FROM saved_views WHERE user_id = ? AND page = ? ORDER BY name COLLATE NOCASE', req.user.id, page).map((v) => ({ id: v.id, name: v.name, page: v.page, config: parseJSON(v.config, {}) })));
});
router.post('/views', (req, res) => {
  const name = str(req.body?.name, 60);
  const page = str(req.body?.page, 40) || 'opportunity';
  if (!name) throw badRequest('View name is required');
  if (get('SELECT id FROM saved_views WHERE user_id = ? AND page = ? AND name = ? COLLATE NOCASE', req.user.id, page, name)) throw badRequest('You already have a view with this name');
  const info = run('INSERT INTO saved_views (user_id, page, name, config) VALUES (?,?,?,?)', req.user.id, page, name, JSON.stringify(req.body?.config || {}));
  res.status(201).json({ id: Number(info.lastInsertRowid), name, page, config: req.body?.config || {} });
});
router.put('/views/:id', (req, res) => {
  const v = get('SELECT * FROM saved_views WHERE id = ? AND user_id = ?', intParam(req.params.id, 0), req.user.id);
  if (!v) throw notFound('View');
  run('UPDATE saved_views SET name = ?, config = ? WHERE id = ?', str(req.body?.name, 60) || v.name, JSON.stringify(req.body?.config ?? parseJSON(v.config, {})), v.id);
  res.json({ ok: true });
});
router.delete('/views/:id', (req, res) => {
  run('DELETE FROM saved_views WHERE id = ? AND user_id = ?', intParam(req.params.id, 0), req.user.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- touchpoints
router.get('/opportunities/:id/touchpoints', (req, res) => {
  res.json(
    all(
      `SELECT t.*, u.name AS user_name FROM touchpoints t LEFT JOIN users u ON u.id = t.user_id WHERE t.opportunity_id = ? ORDER BY t.contacted_at DESC`,
      intParam(req.params.id, 0),
    ).map((t) => ({ id: t.id, kind: t.kind, note: t.note || '', contactedAt: t.contacted_at, user: t.user_name || '' })),
  );
});
router.post('/opportunities/:id/touchpoints', (req, res) => {
  const opp = get('SELECT id FROM opportunities WHERE id = ?', intParam(req.params.id, 0));
  if (!opp) throw notFound('Opportunity');
  const kind = str(req.body?.kind, 40);
  if (!kind) throw badRequest('Touchpoint type is required');
  const at = req.body?.contactedAt ? new Date(req.body.contactedAt) : new Date();
  if (Number.isNaN(at.getTime())) throw badRequest('Invalid date');
  if (at.getTime() > Date.now() + 60_000) throw badRequest('Contacted time cannot be in the future');
  const info = run('INSERT INTO touchpoints (opportunity_id, kind, note, contacted_at, user_id) VALUES (?,?,?,?,?)', opp.id, kind, str(req.body?.note, 1000), at.toISOString(), req.user.id);
  run('UPDATE opportunities SET updated_at = ? WHERE id = ?', new Date().toISOString(), opp.id);
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});
router.put('/touchpoints/:id', (req, res) => {
  const t = get('SELECT * FROM touchpoints WHERE id = ?', intParam(req.params.id, 0));
  if (!t) throw notFound('Touchpoint');
  const kind = str(req.body?.kind, 40);
  if (!kind) throw badRequest('Touchpoint type is required');
  const at = req.body?.contactedAt ? new Date(req.body.contactedAt) : new Date(t.contacted_at);
  if (Number.isNaN(at.getTime())) throw badRequest('Invalid date');
  if (at.getTime() > Date.now() + 60_000) throw badRequest('Contacted time cannot be in the future');
  run('UPDATE touchpoints SET kind = ?, note = ?, contacted_at = ? WHERE id = ?', kind, str(req.body?.note, 1000), at.toISOString(), t.id);
  run('UPDATE opportunities SET updated_at = ? WHERE id = ?', new Date().toISOString(), t.opportunity_id);
  res.json({ ok: true });
});
router.delete('/touchpoints/:id', (req, res) => {
  run('DELETE FROM touchpoints WHERE id = ?', intParam(req.params.id, 0));
  res.json({ ok: true });
});

// ---------------------------------------------------------------- teams
// A team is the "team" field shared by its users: adding a team assigns it to the chosen users.
function readTeam(body) {
  const name = str(body?.name, 80);
  if (!name) throw badRequest('Team name is required');
  const ids = (Array.isArray(body?.members) ? body.members : []).map((x) => intParam(x, 0)).filter(Boolean);
  if (!ids.length) throw badRequest('Choose at least one member for the team');
  for (const id of ids) if (!get('SELECT id FROM users WHERE id = ?', id)) throw notFound('User');
  return { name, ids };
}
router.post('/teams', requirePermission('settings.manage'), (req, res) => {
  const { name, ids } = readTeam(req.body);
  if (get('SELECT id FROM users WHERE team = ? COLLATE NOCASE LIMIT 1', name)) throw badRequest(`Team ${name} already exists`);
  tx(() => ids.forEach((id) => run('UPDATE users SET team = ? WHERE id = ?', name, id)));
  res.status(201).json({ ok: true, name, members: ids.length });
});
router.put('/teams/:name', requirePermission('settings.manage'), (req, res) => {
  const old = String(req.params.name);
  if (!get('SELECT id FROM users WHERE team = ? LIMIT 1', old)) throw notFound('Team');
  const { name, ids } = readTeam(req.body);
  if (name.toLowerCase() !== old.toLowerCase() && get('SELECT id FROM users WHERE team = ? COLLATE NOCASE LIMIT 1', name)) throw badRequest(`Team ${name} already exists`);
  tx(() => {
    run('UPDATE users SET team = NULL WHERE team = ?', old);
    ids.forEach((id) => run('UPDATE users SET team = ? WHERE id = ?', name, id));
  });
  res.json({ ok: true, name, members: ids.length });
});
router.delete('/teams/:name', requirePermission('settings.manage'), (req, res) => {
  const old = String(req.params.name);
  const n = Number(run('UPDATE users SET team = NULL WHERE team = ?', old).changes);
  if (!n) throw notFound('Team');
  res.json({ ok: true, members: n });
});

// ---------------------------------------------------------------- import data
router.post('/import/opportunities', requirePermission('settings.manage'), (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 2000) : [];
  if (!rows.length) throw badRequest('The file has no rows');
  const company = getSetting('company', {});
  const stages = lookupValues('opportunity_stage');
  const sources = lookupValues('opportunity_source');
  const errors = [];
  let created = 0;
  tx(() => {
    rows.forEach((r, i) => {
      const line = i + 2;
      const project = str(r.projectName, 150);
      const first = str(r.firstName, 80);
      const phone = String(r.phone ?? '').replace(/\D/g, '');
      const city = str(r.city, 80)?.toUpperCase();
      if (!project || !first || phone.length < 6 || !city) {
        errors.push(`Row ${line}: project name, first name, phone and city are required`);
        return;
      }
      const stage = stages.find((s) => s.toLowerCase() === String(r.stage || '').toLowerCase()) || stages[0] || 'Enquiry';
      const source = sources.find((s) => s.toLowerCase() === String(r.source || '').toLowerCase()) || sources[0] || 'Reference';
      const cityRow = get('SELECT * FROM cities WHERE name = ? COLLATE NOCASE', city);
      if (!cityRow) run('INSERT INTO cities (name, state, country) VALUES (?,?,?)', city, (str(r.state, 80) || 'TAMILNADU').toUpperCase(), 'INDIA');
      const seq = nextCounter('project', 3000);
      const now = new Date().toISOString();
      const info = run(
        `INSERT INTO opportunities (code, project_name, salutation, first_name, last_name, phone_code, phone, email, address1, city, state, country, managed_by, stage, source, est_value, category, status, created_by, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        `${company.projectPrefix || 'TIT-CH-'}${String(seq).padStart(8, '0')}`, project, str(r.salutation, 10) || 'Mr.', first, str(r.lastName, 80), '+91', phone, str(r.email, 150),
        str(r.address, 200), city, (str(r.state, 80) || cityRow?.state || 'TAMILNADU').toUpperCase(), 'INDIA', str(r.managedBy, 120) || req.user.name, stage, source, num(r.estValue), str(r.category, 60), 'active', req.user.id, now, now,
      );
      createQuoteForOpportunity(Number(info.lastInsertRowid));
      created++;
    });
  });
  res.json({ ok: true, created, errors: errors.slice(0, 50), errorCount: errors.length });
});

// ---------------------------------------------------------------- favourite settings pages
router.get('/settings/favourites', (req, res) => {
  res.json(getSetting(`settingsFav:${req.user.id}`, []));
});
router.put('/settings/favourites', (req, res) => {
  const list = Array.isArray(req.body?.pages) ? req.body.pages.map(String).slice(0, 50) : [];
  setSetting(`settingsFav:${req.user.id}`, list);
  res.json(list);
});

router.get('/me/permissions', (req, res) => {
  res.json(Object.fromEntries(PERMISSIONS.map((p) => [p.key, can(req.user, p.key)])));
});

export default router;
