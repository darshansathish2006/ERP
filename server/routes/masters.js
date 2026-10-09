import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { all, get, run, tx, getSetting, setSetting, parseJSON, ROOT_DIR } from '../db.js';
import { hashPassword, publicUser, requirePermission } from '../auth.js';
import { lookupValues } from './admin.js';
import {
  OPPORTUNITY_STAGES, OPPORTUNITY_SOURCES, OPPORTUNITY_CATEGORIES, LOST_REASONS, DESIGN_NAMES, DOCUMENT_CATEGORIES, DEFAULT_COMPANY, SYSTEMS,
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
// Codes and ids written into the pricing engine source (hardware the BOM always adds, fallback glass …).
let ENGINE_REFS = null;
function engineRefs() {
  if (!ENGINE_REFS) {
    ENGINE_REFS = new Set();
    for (const f of ['server/engine/bom.js', 'server/engine/quoteCalc.js', 'server/routes/quotes.js']) {
      try {
        const text = fs.readFileSync(path.join(ROOT_DIR, f), 'utf8');
        for (const m of text.matchAll(/'([A-Za-z0-9][A-Za-z0-9 ._-]{1,40})'/g)) ENGINE_REFS.add(m[1]);
      } catch {
        /* source not shipped – rely on the other checks */
      }
    }
  }
  return ENGINE_REFS;
}

const ITEM_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/;
const ITEM_CATEGORIES = ['profile', 'aluminium', 'reinforcement', 'hardware'];
const BAR_CATEGORIES = ['profile', 'aluminium', 'reinforcement'];

/** Why an item cannot be deleted or re-coded (systems, BOM rules, colour variants). Empty when unused. */
function itemUsage(code) {
  const reasons = [];
  for (const s of all('SELECT name, roles FROM systems')) {
    const roles = Object.entries(parseJSON(s.roles, {})).filter(([, c]) => c === code).map(([r]) => r);
    if (roles.length) reasons.push(`${s.name} (${roles.join(', ')})`);
  }
  if (engineRefs().has(code)) reasons.push('the bill of materials rules');
  for (const it of all('SELECT code, extra FROM items WHERE code != ?', code)) {
    const v = parseJSON(it.extra, {}).variants;
    if (v && Object.values(v).includes(code)) reasons.push(`the colour variant of ${it.code}`);
  }
  return reasons;
}

function rateField(v, label) {
  const n = num(v);
  if (n == null || n < 0) throw badRequest(`${label} must be 0 or more`);
  if (n > 1e8) throw badRequest(`${label} is too large`);
  return n;
}

router.put('/masters/items/:code', requirePermission('rates.manage'), (req, res) => {
  const item = get('SELECT * FROM items WHERE code = ?', req.params.code);
  if (!item) throw notFound('Item');
  const b = req.body || {};
  const next = { ...item };
  if (b.name !== undefined) {
    next.name = str(b.name, 200)?.toUpperCase();
    if (!next.name) throw badRequest('Item name is required');
  }
  if (b.unit !== undefined) next.unit = str(b.unit, 20) || item.unit;
  if (b.rate !== undefined || !Object.keys(b).length) next.rate = rateField(b.rate, 'Rate');
  if (b.grp !== undefined && str(b.grp, 60)) next.grp = str(b.grp, 60);
  if (b.brand !== undefined) next.brand = str(b.brand, 80);
  if (b.weight !== undefined) {
    const w = num(b.weight);
    if (w == null || w < 0 || w > 1000) throw badRequest('Weight must be between 0 and 1000 kg');
    next.weight = w;
  }
  const usage = itemUsage(item.code);
  if (b.category !== undefined && b.category !== item.category) {
    if (!ITEM_CATEGORIES.includes(b.category)) throw badRequest('Unknown category');
    if (usage.length) throw badRequest(`The category of ${item.code} cannot change: it is used by ${usage.join('; ')}`);
    next.category = b.category;
    next.color_variant = b.category === 'profile' ? 1 : 0;
    next.grp = ITEM_GROUPS[b.category] || (item.category === 'hardware' ? item.grp : 'Fabrication Hardware');
    if (!BAR_CATEGORIES.includes(b.category)) next.bar_length = null;
    else if (next.bar_length == null) next.bar_length = 5.8;
  }
  if (next.color_variant) {
    if (b.rate_lam !== undefined) next.rate_lam = b.rate_lam === null || b.rate_lam === '' ? (item.rate_lam ?? next.rate) : rateField(b.rate_lam, 'Laminated rate');
  } else next.rate_lam = null;
  if (b.bar_length !== undefined && BAR_CATEGORIES.includes(next.category)) {
    const bar = num(b.bar_length);
    if (bar == null || bar <= 0 || bar > 12) throw badRequest('Bar length must be between 0 and 12 m');
    next.bar_length = bar;
  }
  let code = item.code;
  if (b.code !== undefined) {
    code = String(b.code ?? '').trim().toUpperCase().slice(0, 60);
    if (!code || !ITEM_CODE_RE.test(code)) throw badRequest('RM code can use letters, numbers, space, dot, dash or underscore');
    if (code !== item.code) {
      if (usage.length) throw badRequest(`The code of ${item.code} cannot change: it is used by ${usage.join('; ')}`);
      if (get('SELECT code FROM items WHERE code = ? COLLATE NOCASE', code)) throw badRequest(`An item with code ${code} already exists`);
    }
  }
  tx(() => {
    run(
      'UPDATE items SET code = ?, name = ?, category = ?, grp = ?, unit = ?, rate = ?, rate_lam = ?, color_variant = ?, bar_length = ?, weight = ?, brand = ? WHERE code = ?',
      code, next.name, next.category, next.grp, next.unit, next.rate, next.rate_lam, next.color_variant, next.bar_length, next.weight, next.brand, item.code,
    );
    if (code !== item.code) {
      // price-level rows are keyed by code (and code-SUFFIX for colour variants)
      run('UPDATE level_prices SET code = ? WHERE code = ?', code, item.code);
      for (const c of all("SELECT suffix FROM colors WHERE suffix != ''")) run('UPDATE level_prices SET code = ? WHERE code = ?', `${code}-${c.suffix}`, `${item.code}-${c.suffix}`);
    }
  });
  res.json(get('SELECT * FROM items WHERE code = ?', code));
});

router.delete('/masters/items/:code', requirePermission('rates.manage'), (req, res) => {
  const item = get('SELECT * FROM items WHERE code = ?', req.params.code);
  if (!item) throw notFound('Item');
  const usage = itemUsage(item.code);
  if (usage.length) throw badRequest(`${item.code} is used by ${usage.join('; ')} and cannot be deleted. Change its rate instead.`);
  tx(() => {
    run('DELETE FROM items WHERE code = ?', item.code);
    run('DELETE FROM level_prices WHERE code = ? OR code LIKE ?', item.code, `${item.code}-%`);
  });
  res.json({ ok: true });
});

const ITEM_GROUPS = {
  profile: 'Profile',
  aluminium: 'Aluminium Profiles',
  reinforcement: 'Reinforcement',
};
router.post('/masters/items', requirePermission('rates.manage'), (req, res) => {
  const code = str(req.body?.code, 60)?.toUpperCase();
  const name = str(req.body?.name, 200);
  const category = str(req.body?.category, 30);
  if (!code || !name || !category) throw badRequest('Code, name and category are required');
  if (!ITEM_CODE_RE.test(code)) throw badRequest('RM code can use letters, numbers, space, dot, dash or underscore');
  if (!ITEM_CATEGORIES.includes(category)) throw badRequest('Unknown category');
  if (get('SELECT code FROM items WHERE code = ? COLLATE NOCASE', code)) throw badRequest('An item with this code already exists');
  const grp = ITEM_GROUPS[category] || str(req.body?.grp, 60) || 'Fabrication Hardware';
  const rate = req.body?.rate === undefined || req.body?.rate === '' ? 0 : rateField(req.body.rate, 'Rate');
  const rateLam = category === 'profile' && req.body?.rate_lam != null && req.body.rate_lam !== '' ? rateField(req.body.rate_lam, 'Laminated rate') : rate;
  let bar = null;
  if (BAR_CATEGORIES.includes(category)) {
    bar = num(req.body?.bar_length) ?? 5.8;
    if (bar <= 0 || bar > 12) throw badRequest('Bar length must be between 0 and 12 m');
  }
  const maxSort = get('SELECT MAX(sort) m FROM items').m || 0;
  run(
    'INSERT INTO items (code, name, category, grp, unit, rate, rate_lam, color_variant, bar_length, weight, sort, brand) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    code, name.toUpperCase(), category, grp, str(req.body?.unit, 20) || 'Pcs', rate,
    category === 'profile' ? rateLam : null, category === 'profile' ? 1 : 0, bar, Math.max(0, num(req.body?.weight) ?? 0), maxSort + 1, str(req.body?.brand, 80),
  );
  res.status(201).json(get('SELECT * FROM items WHERE code = ?', code));
});

// ---------- glass & mesh ----------
// ---------- glass & mesh ----------
function glassUsage(g) {
  const reasons = [];
  const like = `%"${g.id}"%`;
  const designs = get('SELECT COUNT(*) c FROM designs WHERE glass_id = ? OR data LIKE ?', g.id, like).c;
  if (designs) reasons.push(`${designs} design${designs > 1 ? 's' : ''} in quotes`);
  const lib = get('SELECT COUNT(*) c FROM library_designs WHERE glass_id = ? OR data LIKE ?', g.id, like).c;
  if (lib) reasons.push(`${lib} library design${lib > 1 ? 's' : ''}`);
  if (get('SELECT id FROM quotes WHERE defaults LIKE ? LIMIT 1', like)) reasons.push('project defaults of a quote');
  if (engineRefs().has(g.id)) reasons.push('the pricing engine (default glass)');
  return reasons;
}

router.put('/masters/glasses/:id', requirePermission('rates.manage'), (req, res) => {
  const g = get('SELECT * FROM glasses WHERE id = ?', req.params.id);
  if (!g) throw notFound('Glass');
  const b = req.body || {};
  const next = { ...g };
  if (b.rate !== undefined || !Object.keys(b).length) next.rate = rateField(b.rate, 'Rate');
  if (b.name !== undefined) {
    next.name = str(b.name, 120)?.toUpperCase();
    if (!next.name) throw badRequest('Name is required');
  }
  if (b.thickness !== undefined) {
    const t = num(b.thickness);
    if (t == null || t < 0 || t > 60) throw badRequest('Thickness must be between 0 and 60 mm');
    next.thickness = t;
  }
  if (b.supplier !== undefined) next.supplier = str(b.supplier, 80);
  if (b.kind !== undefined && b.kind !== g.kind) {
    if (!['glass', 'louver', 'mesh'].includes(b.kind)) throw badRequest('Kind must be glass, louver or mesh');
    const usage = glassUsage(g);
    if (usage.length) throw badRequest(`The kind of ${g.name} cannot change: it is used by ${usage.join('; ')}`);
    next.kind = b.kind;
  }
  run('UPDATE glasses SET name = ?, rate = ?, thickness = ?, supplier = ?, kind = ? WHERE id = ?', next.name, next.rate, next.thickness, next.supplier, next.kind, g.id);
  res.json(get('SELECT * FROM glasses WHERE id = ?', g.id));
});
router.post('/masters/glasses', requirePermission('rates.manage'), (req, res) => {
  const name = str(req.body?.name, 120);
  const code = str(req.body?.code, 40);
  const kind = ['glass', 'louver', 'mesh'].includes(req.body?.kind) ? req.body.kind : 'glass';
  if (!name || !code) throw badRequest('Code and name are required');
  const id = `${kind}-${code.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  if (get('SELECT id FROM glasses WHERE id = ? OR code = ? COLLATE NOCASE', id, code)) throw badRequest('This glass already exists');
  const rate = req.body?.rate === undefined || req.body?.rate === '' ? 0 : rateField(req.body.rate, 'Rate');
  const thickness = num(req.body?.thickness) ?? 4;
  if (thickness < 0 || thickness > 60) throw badRequest('Thickness must be between 0 and 60 mm');
  const maxSort = get('SELECT MAX(sort) m FROM glasses').m || 0;
  run('INSERT INTO glasses (id, code, name, thickness, rate, kind, sort, supplier) VALUES (?,?,?,?,?,?,?,?)', id, code.toUpperCase(), name.toUpperCase(), thickness, rate, kind, maxSort + 1, str(req.body?.supplier, 80));
  res.status(201).json(get('SELECT * FROM glasses WHERE id = ?', id));
});
router.delete('/masters/glasses/:id', requirePermission('rates.manage'), (req, res) => {
  const g = get('SELECT * FROM glasses WHERE id = ?', req.params.id);
  if (!g) throw notFound('Glass');
  const usage = glassUsage(g);
  if (usage.length) throw badRequest(`${g.name} is used by ${usage.join('; ')} and cannot be deleted`);
  tx(() => {
    run('DELETE FROM glasses WHERE id = ?', g.id);
    run("DELETE FROM level_prices WHERE code = ? AND level_id IN (SELECT id FROM price_levels WHERE category = 'glass')", g.code);
  });
  res.json({ ok: true });
});

// ---------- colours ----------
const HEX_RE = /^#[0-9a-f]{6}$/i;
const HW_COLORS = ['WHITE', 'BROWN', 'BLACK'];

function colorUsage(c) {
  const reasons = [];
  const designs = get('SELECT COUNT(*) c FROM designs WHERE color_id = ?', c.id).c;
  if (designs) reasons.push(`${designs} design${designs > 1 ? 's' : ''} in quotes`);
  const lib = get('SELECT COUNT(*) c FROM library_designs WHERE color_id = ?', c.id).c;
  if (lib) reasons.push(`${lib} library design${lib > 1 ? 's' : ''}`);
  if (get('SELECT id FROM quotes WHERE defaults LIKE ? LIMIT 1', `%"${c.id}"%`)) reasons.push('project defaults of a quote');
  if (c.id === 'white') reasons.push('the pricing engine (default colour)');
  return reasons;
}

router.post('/masters/colors', requirePermission('rates.manage'), (req, res) => {
  const name = str(req.body?.name, 80);
  const hex = str(req.body?.hex, 10);
  if (!name || !hex || !HEX_RE.test(hex)) throw badRequest('Name and a valid hex colour are required');
  const hexIn = str(req.body?.hexIn, 10) || hex;
  if (!HEX_RE.test(hexIn)) throw badRequest('Inside colour must be a hex colour like #5B3A21');
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  if (get('SELECT id FROM colors WHERE id = ? OR name = ? COLLATE NOCASE', id, name)) throw badRequest('This colour already exists');
  const suffix = (str(req.body?.suffix, 4) || name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2)).toUpperCase();
  if (!/^[A-Z0-9]{1,4}$/.test(suffix)) throw badRequest('Code suffix must be 1 to 4 letters or numbers');
  if (get('SELECT id FROM colors WHERE suffix = ? COLLATE NOCASE', suffix)) throw badRequest(`Another colour already uses the suffix ${suffix}`);
  const hw = HW_COLORS.includes(req.body?.hwColor) ? req.body.hwColor : req.body?.laminated === false ? 'WHITE' : 'BROWN';
  const maxSort = get('SELECT MAX(sort) m FROM colors').m || 0;
  run(
    'INSERT INTO colors (id, name, inside, outside, hex_in, hex_out, suffix, laminated, sort, hw_color) VALUES (?,?,?,?,?,?,?,?,?,?)',
    id, name.toUpperCase(), (str(req.body?.inside, 80) || name).toUpperCase(), (str(req.body?.outside, 80) || name).toUpperCase(), hexIn, hex, suffix,
    req.body?.laminated === false ? 0 : 1, maxSort + 1, hw,
  );
  res.status(201).json(get('SELECT * FROM colors WHERE id = ?', id));
});

router.put('/masters/colors/:id', requirePermission('rates.manage'), (req, res) => {
  const c = get('SELECT * FROM colors WHERE id = ?', req.params.id);
  if (!c) throw notFound('Colour');
  const b = req.body || {};
  const name = b.name !== undefined ? str(b.name, 80)?.toUpperCase() : c.name;
  if (!name) throw badRequest('Colour name is required');
  if (name !== c.name && get('SELECT id FROM colors WHERE name = ? COLLATE NOCASE AND id != ?', name, c.id)) throw badRequest('Another colour already has this name');
  const inside = b.inside !== undefined ? str(b.inside, 80)?.toUpperCase() || name : c.inside;
  const outside = b.outside !== undefined ? str(b.outside, 80)?.toUpperCase() || name : c.outside;
  const hexIn = b.hexIn !== undefined ? String(b.hexIn) : c.hex_in;
  const hexOut = b.hexOut !== undefined ? String(b.hexOut) : c.hex_out;
  if (!HEX_RE.test(hexIn) || !HEX_RE.test(hexOut)) throw badRequest('Colours must be hex values like #5B3A21');
  const laminated = b.laminated !== undefined ? (b.laminated ? 1 : 0) : c.laminated;
  const hw = b.hwColor !== undefined ? String(b.hwColor).toUpperCase() : c.hw_color;
  if (!HW_COLORS.includes(hw)) throw badRequest('Hardware colour must be WHITE, BROWN or BLACK');
  let suffix = c.suffix;
  if (b.suffix !== undefined) {
    suffix = String(b.suffix ?? '').trim().toUpperCase();
    if (suffix !== c.suffix) {
      if (!c.suffix || !suffix) throw badRequest(c.suffix ? 'The code suffix cannot be removed' : 'This colour uses the base profile codes, so it cannot get a suffix');
      if (!/^[A-Z0-9]{1,4}$/.test(suffix)) throw badRequest('Code suffix must be 1 to 4 letters or numbers');
      if (get('SELECT id FROM colors WHERE suffix = ? COLLATE NOCASE AND id != ?', suffix, c.id)) throw badRequest(`Another colour already uses the suffix ${suffix}`);
    }
  }
  tx(() => {
    run('UPDATE colors SET name = ?, inside = ?, outside = ?, hex_in = ?, hex_out = ?, suffix = ?, laminated = ?, hw_color = ? WHERE id = ?', name, inside, outside, hexIn, hexOut, suffix, laminated, hw, c.id);
    if (suffix !== c.suffix) {
      // laminated profile codes carry the suffix (PS62-UF-01-WN): move their level prices and quote rate edits
      const variants = all('SELECT code FROM items WHERE color_variant = 1').map((r) => r.code);
      for (const code of variants) run('UPDATE level_prices SET code = ? WHERE code = ?', `${code}-${suffix}`, `${code}-${c.suffix}`);
      for (const q of all("SELECT id, rate_overrides FROM quotes WHERE rate_overrides LIKE ?", `%-${c.suffix}"%`)) {
        const o = parseJSON(q.rate_overrides, {});
        let changed = false;
        for (const code of variants) {
          const k = `${code}-${c.suffix}`;
          if (k in o) {
            o[`${code}-${suffix}`] = o[k];
            delete o[k];
            changed = true;
          }
        }
        if (changed) run('UPDATE quotes SET rate_overrides = ? WHERE id = ?', JSON.stringify(o), q.id);
      }
    }
  });
  res.json(get('SELECT * FROM colors WHERE id = ?', c.id));
});

router.delete('/masters/colors/:id', requirePermission('rates.manage'), (req, res) => {
  const c = get('SELECT * FROM colors WHERE id = ?', req.params.id);
  if (!c) throw notFound('Colour');
  const usage = colorUsage(c);
  if (usage.length) throw badRequest(`${c.name} is used by ${usage.join('; ')} and cannot be deleted`);
  tx(() => {
    run('DELETE FROM colors WHERE id = ?', c.id);
    if (c.suffix) run('DELETE FROM level_prices WHERE code LIKE ?', `%-${c.suffix}`);
  });
  res.json({ ok: true });
});

// ---------- profile systems ----------
export const SYSTEM_ROLES = ['frame', 'frame3', 'sash', 'bead', 'interlock', 'mullion', 'floatingMullion', 'meshSash', 'guideRail', 'monorail', 'louverHolder', 'riFrame', 'riSash', 'riMullion'];
const OPTIONAL_ROLES = ['floatingMullion'];
const LIMIT_KEYS = ['minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'maxSashWidth', 'maxSashHeight'];

function readSystem(b) {
  const name = str(b?.name, 120)?.toUpperCase();
  if (!name) throw badRequest('System name is required');
  const brand = (str(b?.brand, 60) || 'PROMINANCE').toUpperCase();
  const type = b?.type === 'casement' ? 'casement' : b?.type === 'sliding' ? 'sliding' : null;
  if (!type) throw badRequest('System type must be sliding or casement');
  const roles = {};
  const input = b?.roles && typeof b.roles === 'object' ? b.roles : {};
  for (const role of SYSTEM_ROLES) {
    const code = str(input[role], 60);
    if (!code) {
      if (OPTIONAL_ROLES.includes(role)) continue;
      throw badRequest(`Choose the item used for the ${role} role`);
    }
    const item = get('SELECT code, category FROM items WHERE code = ?', code);
    if (!item) throw badRequest(`Item ${code} (${role}) is not in the rate master`);
    if (item.category === 'hardware') throw badRequest(`${code} is a hardware item and cannot be used as ${role}`);
    roles[role] = item.code;
  }
  const limits = {};
  for (const k of LIMIT_KEYS) {
    const v = Math.round(Number(b?.limits?.[k]));
    if (!(v >= 100 && v <= 12000)) throw badRequest('Size limits must be between 100 and 12000 mm');
    limits[k] = v;
  }
  if (limits.minWidth > limits.maxWidth || limits.minHeight > limits.maxHeight) throw badRequest('Minimum sizes must not be larger than the maximum sizes');
  return { name, brand, type, roles, limits };
}

function systemUsage(s) {
  const reasons = [];
  const designs = get('SELECT COUNT(*) c FROM designs WHERE system_id = ?', s.id).c;
  if (designs) reasons.push(`${designs} design${designs > 1 ? 's' : ''} in quotes`);
  const lib = get('SELECT COUNT(*) c FROM library_designs WHERE system_id = ?', s.id).c;
  if (lib) reasons.push(`${lib} library design${lib > 1 ? 's' : ''}`);
  if (get('SELECT id FROM quotes WHERE defaults LIKE ? LIMIT 1', `%"${s.id}"%`)) reasons.push('project defaults of a quote');
  if (SYSTEMS.some((x) => x.id === s.id)) reasons.push('the built-in catalog');
  return reasons;
}

const systemDTO = (s) => ({ ...s, roles: parseJSON(s.roles, {}), limits: parseJSON(s.limits, {}) });

router.post('/masters/systems', requirePermission('rates.manage'), (req, res) => {
  const f = readSystem(req.body);
  const id = f.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  if (!id) throw badRequest('System name needs letters or numbers');
  if (get('SELECT id FROM systems WHERE id = ? OR name = ? COLLATE NOCASE', id, f.name)) throw badRequest('A system with this name already exists');
  run('INSERT INTO systems (id, brand, name, type, roles, limits) VALUES (?,?,?,?,?,?)', id, f.brand, f.name, f.type, JSON.stringify(f.roles), JSON.stringify(f.limits));
  res.status(201).json(systemDTO(get('SELECT * FROM systems WHERE id = ?', id)));
});

router.put('/masters/systems/:id', requirePermission('rates.manage'), (req, res) => {
  const s = get('SELECT * FROM systems WHERE id = ?', req.params.id);
  if (!s) throw notFound('System');
  const f = readSystem(req.body);
  if (get('SELECT id FROM systems WHERE name = ? COLLATE NOCASE AND id != ?', f.name, s.id)) throw badRequest('A system with this name already exists');
  run('UPDATE systems SET brand = ?, name = ?, type = ?, roles = ?, limits = ? WHERE id = ?', f.brand, f.name, f.type, JSON.stringify(f.roles), JSON.stringify(f.limits), s.id);
  res.json(systemDTO(get('SELECT * FROM systems WHERE id = ?', s.id)));
});

/** Why each master record cannot be deleted (or re-coded); records missing from a map are unused. */
router.get('/masters/usage', (_req, res) => {
  const pick = (rows, keyOf, usage) => Object.fromEntries(rows.map((r) => [keyOf(r), usage(r)]).filter(([, u]) => u.length));
  res.json({
    items: pick(all('SELECT code FROM items'), (r) => r.code, (r) => itemUsage(r.code)),
    glasses: pick(all('SELECT * FROM glasses'), (r) => r.id, glassUsage),
    colors: pick(all('SELECT * FROM colors'), (r) => r.id, colorUsage),
    systems: pick(all('SELECT * FROM systems'), (r) => r.id, systemUsage),
  });
});

router.delete('/masters/systems/:id', requirePermission('rates.manage'), (req, res) => {
  const s = get('SELECT * FROM systems WHERE id = ?', req.params.id);
  if (!s) throw notFound('System');
  if (get('SELECT COUNT(*) c FROM systems').c <= 1) throw badRequest('At least one profile system is required');
  const usage = systemUsage(s);
  if (usage.length) throw badRequest(`${s.name} is used by ${usage.join('; ')} and cannot be deleted`);
  run('DELETE FROM systems WHERE id = ?', s.id);
  res.json({ ok: true });
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
  let bankAccounts = current.bankAccounts;
  if (b.bankAccounts !== undefined) {
    if (!Array.isArray(b.bankAccounts) || b.bankAccounts.length > 10) throw badRequest('Add up to 10 bank accounts');
    bankAccounts = b.bankAccounts.map((a, i) => {
      const acc = {
        accountName: str(a?.accountName, 120) || '',
        accountNo: str(a?.accountNo, 30) || '',
        bankName: str(a?.bankName, 120) || '',
        ifsc: (str(a?.ifsc, 11) || '').toUpperCase(),
        branch: str(a?.branch, 120) || '',
      };
      if (!acc.accountName || !acc.accountNo || !acc.bankName || !acc.ifsc) throw badRequest(`Bank account ${i + 1}: account name, number, bank and IFSC are required`);
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(acc.ifsc)) throw badRequest(`Bank account ${i + 1}: IFSC must be 11 characters, e.g. IDFB0081831`);
      return acc;
    });
  }
  const next = {
    ...current,
    ...b,
    bankAccounts,
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

router.delete('/price-structures/:id', requirePermission('settings.manage'), (req, res) => {
  const ps = get('SELECT * FROM price_structures WHERE id = ?', intParam(req.params.id, 0));
  if (!ps) throw notFound('Price structure');
  if (getSetting('defaultPriceStructure', null) === ps.id) throw badRequest('The default price structure cannot be deleted. Make another structure the default first.');
  if (get('SELECT COUNT(*) c FROM price_structures').c <= 1) throw badRequest('At least one price structure is required');
  // quotes keep their own copy of the cost heads, so they are not affected
  run('DELETE FROM price_structures WHERE id = ?', ps.id);
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
      // charges added to a single quote (Pricing → Add cost head) keep their marker and target
      ...(h.added ? { added: true, addedTo: String(h.addedTo ?? '').slice(0, 80) } : {}),
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
router.put('/library/:id', requirePermission('rates.manage'), (req, res) => {
  const lib = get('SELECT * FROM library_designs WHERE id = ?', intParam(req.params.id, 0));
  if (!lib) throw notFound('Library design');
  const b = req.body || {};
  const name = b.name !== undefined ? str(b.name, 80)?.toUpperCase() : lib.name;
  if (!name) throw badRequest('Design name is required');
  const systemId = b.systemId !== undefined ? str(b.systemId, 60) : lib.system_id;
  if (!get('SELECT id FROM systems WHERE id = ?', systemId)) throw badRequest('Unknown profile system');
  const colorId = b.colorId !== undefined ? str(b.colorId, 60) : lib.color_id;
  if (!get('SELECT id FROM colors WHERE id = ?', colorId)) throw badRequest('Unknown colour');
  const glassId = b.glassId !== undefined ? str(b.glassId, 60) : lib.glass_id;
  if (!get('SELECT id FROM glasses WHERE id = ?', glassId)) throw badRequest('Unknown glass');
  const data = parseJSON(lib.data, {});
  if (b.width !== undefined) data.width = Number(b.width);
  if (b.height !== undefined) data.height = Number(b.height);
  // panel sizes are rescaled proportionally to the new width / height
  const clean = validateDesignData(data);
  run('UPDATE library_designs SET name = ?, system_id = ?, color_id = ?, glass_id = ?, data = ? WHERE id = ?', name, systemId, colorId, glassId, JSON.stringify(clean), lib.id);
  res.json({ ok: true, id: lib.id, name });
});
router.delete('/library/:id', (req, res) => {
  const lib = get('SELECT id FROM library_designs WHERE id = ?', intParam(req.params.id, 0));
  if (!lib) throw notFound('Library design');
  run('DELETE FROM library_designs WHERE id = ?', lib.id);
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
