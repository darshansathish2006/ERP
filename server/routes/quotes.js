import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { all, get, run, tx, getSetting, parseJSON, UPLOAD_DIR, nextCounter } from '../db.js';
import { DEFAULT_COMPANY } from '../engine/catalog.js';
import { calculateQuote, aggregateLines, profileBars, bomForDesign, loadCatalog, designRowToModel, loadLevelPrices } from '../engine/quoteCalc.js';
import { priceDesign } from '../engine/pricing.js';
import { round, sashCount, paneCount, LEVEL_CATEGORY } from '../engine/bom.js';
import { requirePermission } from '../auth.js';
import { badRequest, notFound, str, num, intParam, rangeBounds } from './util.js';
import { validateDesignData } from './designUtil.js';
import { opportunityDTO, createQuoteForOpportunity } from './opportunities.js';
import { normaliseCostHeads } from './masters.js';

const router = Router();
export const publicRoutes = Router();

// ---------------- helpers ----------------
function quoteRow(id) {
  const q = get('SELECT * FROM quotes WHERE id = ?', intParam(id, 0));
  if (!q) throw notFound('Quote');
  return q;
}
function designRow(id) {
  const d = get('SELECT * FROM designs WHERE id = ?', intParam(id, 0));
  if (!d) throw notFound('Design');
  return d;
}
function touchQuote(quoteId) {
  run('UPDATE quotes SET updated_at = ? WHERE id = ?', new Date().toISOString(), quoteId);
}

/** "(1,2) 4MM PINHEAD GLASS" style labels, numbering glazed areas in drawing order. */
export function glassLabels(design, catalog) {
  const groups = new Map();
  let n = 0;
  const walk = (node) => {
    if (!node) return;
    if (node.kind === 'split') return node.children.forEach(walk);
    const count = node.panel === 'louver' ? 1 : paneCount(node);
    const glass =
      node.panel === 'louver'
        ? catalog.glasses.get(node.glassId)?.kind === 'louver'
          ? catalog.glasses.get(node.glassId)
          : catalog.glasses.get('louver-6')
        : catalog.glasses.get(node.glassId) || catalog.glasses.get(design.glassId);
    for (let i = 0; i < count; i++) {
      n += 1;
      const key = node.panel === 'louver' && node.louverType === 'fixed-pvc' ? 'PVC LOUVER BLADES' : glass?.name || 'GLASS';
      groups.set(key, [...(groups.get(key) || []), n]);
    }
  };
  walk(design.data.root);
  return [...groups.entries()].map(([name, nums]) => `(${nums.join(',')}) ${name}`);
}

function designDTO(d, catalog) {
  return {
    id: d.id,
    quoteId: d.quoteId,
    ref: d.ref,
    qty: d.qty,
    name: d.name,
    location: d.location,
    floor: d.floor,
    note: d.note,
    systemId: d.systemId,
    systemName: d.systemName,
    systemType: d.systemType,
    brand: d.brand,
    colorId: d.colorId,
    colorName: d.colorName,
    colorInside: d.colorInside,
    colorOutside: d.colorOutside,
    colorHex: d.colorHex,
    colorHexIn: d.colorHexIn,
    hwColor: d.hwColor,
    glassId: d.glassId,
    glassName: d.glassName,
    glassLabels: glassLabels(d, catalog),
    data: d.data,
    calcType: d.calcType,
    manualSqftRate: d.manualSqftRate,
    addons: d.addons,
    sort: d.sort,
    areaSqft: d.bom.areaSqft,
    areaSqm: d.bom.areaSqm,
    unitPrice: d.price.grand,
    totalPrice: d.price.grand * d.qty,
    unitBasic: d.price.basic,
    autoBasic: d.price.autoBasic,
    sqftRate: d.price.sqftRate,
    autoSqftRate: d.price.autoSqftRate,
    sashes: d.bom.sashes,
    warnings: d.bom.warnings,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function quoteHeader(q) {
  const opp = get('SELECT * FROM opportunities WHERE id = ?', q.opportunity_id);
  return {
    id: q.id,
    quoteNo: q.quote_no,
    alias: q.alias,
    projectCode: opp?.code,
    projectName: opp?.project_name,
    opportunityId: q.opportunity_id,
    priceStructureId: q.price_structure_id,
    priceStructureName: q.price_structure_name,
    defaults: parseJSON(q.defaults, {}),
    remarks: q.remarks || '',
    createdAt: q.created_at,
    updatedAt: q.updated_at,
    revisionNo: q.revision_no || 1,
    revisionTitle: q.revision_title || '',
    isDefault: !!q.is_default,
    parentQuoteNo: q.parent_quote_id ? get('SELECT quote_no FROM quotes WHERE id = ?', q.parent_quote_id)?.quote_no || null : null,
    priceLevels: parseJSON(q.price_levels, {}),
    revisions: all('SELECT id, quote_no, alias, revision_no, revision_title, is_default, grand_total, created_at FROM quotes WHERE opportunity_id = ? ORDER BY id', q.opportunity_id).map((r) => ({
      id: r.id,
      quoteNo: r.quote_no,
      alias: r.alias,
      revisionNo: r.revision_no || 1,
      title: r.revision_title || '',
      isDefault: !!r.is_default,
      grandTotal: r.grand_total,
      createdAt: r.created_at,
    })),
    opportunity: opportunityDTO(opp),
  };
}

function fullQuote(id) {
  const calc = calculateQuote(intParam(id, 0));
  if (!calc) throw notFound('Quote');
  return {
    quote: quoteHeader(calc.quote),
    designs: calc.designs.map((d) => designDTO(d, calc.catalog)),
    summary: calc.summary,
  };
}

function readDesignBody(b, quote, partial = false) {
  const defaults = parseJSON(quote.defaults, {});
  const out = {};
  if (!partial || b.ref !== undefined) {
    const ref = str(b.ref, 30);
    if (!ref) throw badRequest('Design ref is required');
    out.ref = ref;
  }
  if (!partial || b.qty !== undefined) {
    const qty = Math.round(Number(b.qty));
    if (!(qty >= 1 && qty <= 9999)) throw badRequest('Quantity must be between 1 and 9999');
    out.qty = qty;
  }
  for (const [key, col, max] of [
    ['name', 'name', 80],
    ['location', 'location', 120],
    ['floor', 'floor', 40],
    ['note', 'note', 1000],
  ]) {
    if (!partial || b[key] !== undefined) out[col] = str(b[key], max);
  }
  const catalog = loadCatalog();
  if (!partial || b.systemId !== undefined) {
    const v = str(b.systemId) || defaults.systemId || 'inventa-sliding';
    if (!catalog.systems.has(v)) throw badRequest('Unknown profile system');
    out.system_id = v;
  }
  if (!partial || b.colorId !== undefined) {
    const v = str(b.colorId) || defaults.colorId || 'white';
    if (!catalog.colors.has(v)) throw badRequest('Unknown colour');
    out.color_id = v;
  }
  if (!partial || b.glassId !== undefined) {
    const v = str(b.glassId) || defaults.glassId || 'g4-pinhead';
    if (!catalog.glasses.has(v)) throw badRequest('Unknown glass');
    out.glass_id = v;
  }
  if (!partial || b.data !== undefined) out.data = JSON.stringify(validateDesignData(b.data));
  return out;
}

function assertUniqueRef(quoteId, ref, exceptId = 0) {
  if (ref && get('SELECT id FROM designs WHERE quote_id = ? AND ref = ? COLLATE NOCASE AND id != ?', quoteId, ref, exceptId)) {
    throw badRequest(`Design ref ${ref} already exists in this quote`);
  }
}

function nextRef(quoteId) {
  const refs = all('SELECT ref FROM designs WHERE quote_id = ?', quoteId).map((r) => r.ref.toUpperCase());
  let i = refs.length + 1;
  while (refs.includes(`W${i}`)) i++;
  return `W${i}`;
}

function insertDesign(quoteId, fields) {
  const now = new Date().toISOString();
  const sort = (get('SELECT MAX(sort) m FROM designs WHERE quote_id = ?', quoteId).m ?? -1) + 1;
  const info = run(
    `INSERT INTO designs (quote_id, ref, qty, name, location, floor, note, system_id, color_id, glass_id, data, calc_type, manual_sqft_rate, addons, sort, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    quoteId, fields.ref, fields.qty ?? 1, fields.name ?? null, fields.location ?? null, fields.floor ?? null, fields.note ?? null,
    fields.system_id, fields.color_id, fields.glass_id, fields.data, fields.calc_type || 'auto', fields.manual_sqft_rate ?? null, fields.addons || '[]', sort, now, now,
  );
  return Number(info.lastInsertRowid);
}

function designResponse(id) {
  const d = designRow(id);
  const calc = calculateQuote(d.quote_id);
  const full = calc.designs.find((x) => x.id === d.id);
  return { design: designDTO(full, calc.catalog), summary: calc.summary };
}

// ---------------- quotes ----------------
const QUOTE_SORTS = {
  updated_desc: 'q.updated_at DESC',
  created_desc: 'q.created_at DESC',
  created_asc: 'q.created_at ASC',
  value_desc: 'q.grand_total DESC',
  value_asc: 'q.grand_total ASC',
  name_asc: 'o.project_name COLLATE NOCASE ASC',
  area_desc: 'q.total_area DESC',
};

function quoteListRow(r) {
  return {
    id: r.id,
    opportunityId: r.opportunity_id,
    quoteNo: r.quote_no,
    alias: r.alias,
    revisionNo: r.revision_no || 1,
    revisionTitle: r.revision_title || '',
    parentQuoteNo: r.parent_quote_no || null,
    isDefault: !!r.is_default,
    projectName: r.project_name,
    projectCode: r.project_code,
    contact: [r.first_name, r.last_name].filter(Boolean).join(' '),
    city: r.city,
    status: r.status,
    stage: r.stage,
    managedBy: r.managed_by,
    category: r.category || '',
    designCount: r.design_count,
    totalQty: r.total_qty,
    totalArea: r.total_area,
    grandTotal: r.grand_total,
    priceStructureName: r.price_structure_name,
    revisionCount: r.revision_count ?? 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const QUOTE_SELECT = `SELECT q.*, o.project_name, o.code AS project_code, o.first_name, o.last_name, o.city, o.status, o.stage, o.managed_by, o.category,
    (SELECT COUNT(*) FROM designs d WHERE d.quote_id = q.id) AS design_count,
    (SELECT COUNT(*) FROM quotes q2 WHERE q2.opportunity_id = q.opportunity_id) AS revision_count,
    (SELECT quote_no FROM quotes pq WHERE pq.id = q.parent_quote_id) AS parent_quote_no
  FROM quotes q JOIN opportunities o ON o.id = q.opportunity_id`;

router.get('/quotes', (req, res) => {
  const q = str(req.query.q, 100);
  const where = [];
  const params = [];
  // One row per opportunity (its default quote). Other revisions are loaded when the row is expanded.
  if (req.query.all !== '1') where.push('q.id = (SELECT id FROM quotes WHERE opportunity_id = q.opportunity_id ORDER BY is_default DESC, id LIMIT 1)');
  if (q) {
    where.push('(q.quote_no LIKE ? OR o.project_name LIKE ? OR o.code LIKE ? OR o.first_name LIKE ? OR o.phone LIKE ? OR q.revision_title LIKE ?)');
    params.push(...Array(6).fill(`%${q}%`));
  }
  if (req.query.withDesigns === '1') where.push('EXISTS (SELECT 1 FROM designs d WHERE d.quote_id = q.id)');
  const tab = req.query.tab || req.query.status;
  if (['active', 'won', 'lost'].includes(tab)) {
    where.push('o.status = ?');
    params.push(tab);
  }
  const { start, end } = rangeBounds(req.query.range || 'all', req.query.from, req.query.to);
  if (start) {
    where.push('q.created_at >= ?');
    params.push(start);
  }
  if (end) {
    where.push('q.created_at <= ?');
    params.push(end);
  }
  if (req.query.view === 'mine') {
    where.push('o.managed_by = ?');
    params.push(req.user.name);
  }
  for (const [key, col] of [
    ['managedBy', 'o.managed_by'],
    ['stage', 'o.stage'],
    ['category', 'o.category'],
    ['city', 'o.city'],
  ]) {
    const values = [].concat(req.query[key] || []).map(String).filter(Boolean);
    if (values.length) {
      where.push(`${col} IN (${values.map(() => '?').join(',')})`);
      params.push(...values);
    }
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const page = Math.max(1, intParam(req.query.page, 1));
  const pageSize = Math.min(200, Math.max(5, intParam(req.query.pageSize, 25)));
  const sort = QUOTE_SORTS[req.query.sort] || 'o.created_at DESC';
  const total = get(`SELECT COUNT(*) c FROM quotes q JOIN opportunities o ON o.id = q.opportunity_id ${whereSql}`, ...params).c;
  const rows = all(`${QUOTE_SELECT} ${whereSql} ORDER BY ${sort}, q.id DESC LIMIT ? OFFSET ?`, ...params, pageSize, (page - 1) * pageSize).map(quoteListRow);
  const counts = Object.fromEntries(all('SELECT status, COUNT(*) c FROM opportunities GROUP BY status').map((r) => [r.status, r.c]));
  res.json({ rows, total, page, pageSize, counts });
});

router.get('/opportunities/:id/quotes', (req, res) => {
  res.json(all(`${QUOTE_SELECT} WHERE q.opportunity_id = ? ORDER BY q.id`, intParam(req.params.id, 0)).map(quoteListRow));
});

/** Create a revision: a full copy of the quote (designs, pricing and settings) with a title. */
router.post('/quotes/:id/revise', (req, res) => {
  const src = quoteRow(req.params.id);
  const title = str(req.body?.title, 120);
  if (!title) throw badRequest('Revision title is required');
  const company = getSetting('company', DEFAULT_COMPANY);
  const id = tx(() => {
    const seq = nextCounter('quote', 3000);
    const count = get('SELECT COUNT(*) c FROM quotes WHERE opportunity_id = ?', src.opportunity_id).c;
    const maxRev = get('SELECT MAX(revision_no) m FROM quotes WHERE opportunity_id = ?', src.opportunity_id).m || 1;
    const now = new Date().toISOString();
    const info = run(
      `INSERT INTO quotes (opportunity_id, quote_no, alias, price_structure_id, price_structure_name, cost_heads, rate_overrides, defaults, remarks, price_levels,
         parent_quote_id, revision_no, revision_title, is_default, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      src.opportunity_id, `${company.quotePrefix || 'TIT-QT-'}${String(seq).padStart(8, '0')}`, String.fromCharCode(65 + Math.min(count, 25)), src.price_structure_id, src.price_structure_name,
      src.cost_heads, src.rate_overrides, src.defaults, src.remarks, src.price_levels || '{}', src.id, maxRev + 1, title, req.body?.makeDefault ? 1 : 0, now, now,
    );
    const newId = Number(info.lastInsertRowid);
    for (const d of all('SELECT * FROM designs WHERE quote_id = ? ORDER BY sort, id', src.id)) {
      run(
        `INSERT INTO designs (quote_id, ref, qty, name, location, floor, note, system_id, color_id, glass_id, data, calc_type, manual_sqft_rate, addons, sort, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        newId, d.ref, d.qty, d.name, d.location, d.floor, d.note, d.system_id, d.color_id, d.glass_id, d.data, d.calc_type, d.manual_sqft_rate, d.addons, d.sort, now, now,
      );
    }
    if (req.body?.makeDefault) run('UPDATE quotes SET is_default = 0 WHERE opportunity_id = ? AND id != ?', src.opportunity_id, newId);
    return newId;
  });
  calculateQuote(id);
  res.status(201).json({ id });
});

router.post('/quotes/:id/set-default', (req, res) => {
  const q = quoteRow(req.params.id);
  tx(() => {
    run('UPDATE quotes SET is_default = 0 WHERE opportunity_id = ?', q.opportunity_id);
    run('UPDATE quotes SET is_default = 1 WHERE id = ?', q.id);
  });
  res.json({ ok: true });
});

router.put('/quotes/:id/revision', (req, res) => {
  const q = quoteRow(req.params.id);
  run('UPDATE quotes SET revision_title = ?, updated_at = ? WHERE id = ?', str(req.body?.title, 120), new Date().toISOString(), q.id);
  res.json({ ok: true });
});

/** Select which price level the quote uses for a raw-material category. */
router.put('/quotes/:id/price-levels', (req, res) => {
  const q = quoteRow(req.params.id);
  const category = String(req.body?.category || '');
  if (!['profile', 'reinforcement', 'hardware', 'glass'].includes(category)) throw badRequest('Unknown category');
  const levels = parseJSON(q.price_levels, {});
  const lv = req.body?.levelId ? get('SELECT * FROM price_levels WHERE id = ? AND category = ?', intParam(req.body.levelId, 0), category) : null;
  if (req.body?.levelId && !lv) throw notFound('Price level');
  if (!lv || lv.is_default) delete levels[category];
  else levels[category] = lv.id;
  run('UPDATE quotes SET price_levels = ?, updated_at = ? WHERE id = ?', JSON.stringify(levels), new Date().toISOString(), q.id);
  const calc = calculateQuote(q.id);
  res.json({ ok: true, summary: calc.summary });
});

router.post('/opportunities/:id/quotes', (req, res) => {
  const opp = get('SELECT id FROM opportunities WHERE id = ?', intParam(req.params.id, 0));
  if (!opp) throw notFound('Opportunity');
  const id = createQuoteForOpportunity(opp.id, intParam(req.body?.priceStructureId, null));
  res.status(201).json({ id });
});

router.get('/quotes/:id', (req, res) => {
  res.json(fullQuote(req.params.id));
});

router.put('/quotes/:id', (req, res) => {
  const q = quoteRow(req.params.id);
  const defaults = { ...parseJSON(q.defaults, {}) };
  if (req.body?.defaults && typeof req.body.defaults === 'object') {
    const catalog = loadCatalog();
    const d = req.body.defaults;
    if (d.systemId !== undefined) {
      if (!catalog.systems.has(d.systemId)) throw badRequest('Unknown profile system');
      defaults.systemId = d.systemId;
    }
    if (d.colorId !== undefined) {
      if (!catalog.colors.has(d.colorId)) throw badRequest('Unknown colour');
      defaults.colorId = d.colorId;
    }
    if (d.glassId !== undefined) {
      if (!catalog.glasses.has(d.glassId)) throw badRequest('Unknown glass');
      defaults.glassId = d.glassId;
    }
    if (d.floorAperture !== undefined) defaults.floorAperture = Math.max(0, Math.min(5000, Math.round(Number(d.floorAperture) || 0)));
  }
  run(
    'UPDATE quotes SET defaults = ?, remarks = ?, updated_at = ? WHERE id = ?',
    JSON.stringify(defaults), req.body?.remarks !== undefined ? str(req.body.remarks, 2000) : q.remarks, new Date().toISOString(), q.id,
  );
  res.json(fullQuote(q.id));
});

router.delete('/quotes/:id', (req, res) => {
  const q = quoteRow(req.params.id);
  const count = get('SELECT COUNT(*) c FROM quotes WHERE opportunity_id = ?', q.opportunity_id).c;
  if (count <= 1) throw badRequest('An opportunity must have at least one quote');
  run('DELETE FROM quotes WHERE id = ?', q.id);
  res.json({ ok: true });
});

// ---------------- pricing ----------------
router.get('/quotes/:id/pricing', (req, res) => {
  const calc = calculateQuote(intParam(req.params.id, 0), { persist: false });
  if (!calc) throw notFound('Quote');
  res.json({
    priceStructureId: calc.quote.price_structure_id,
    priceStructureName: calc.quote.price_structure_name,
    heads: calc.heads,
    summary: calc.summary,
    designs: calc.designs.map((d) => ({
      id: d.id,
      ref: d.ref,
      name: d.name,
      location: d.location,
      systemName: d.systemName,
      qty: d.qty,
      areaSqft: d.bom.areaSqft,
      calcType: d.calcType,
      manualSqftRate: d.manualSqftRate,
      autoBasic: d.price.autoBasic,
      autoSqftRate: d.price.autoSqftRate,
      basic: d.price.basic,
      sqftRate: d.price.sqftRate,
      grand: d.price.grand,
      addons: d.addons,
      heads: d.price.heads.map((h) => ({ name: h.name, value: h.value, visibility: h.visibility, error: h.error })),
    })),
  });
});

router.post('/quotes/:id/price-structure', (req, res) => {
  const q = quoteRow(req.params.id);
  const ps = get('SELECT * FROM price_structures WHERE id = ?', intParam(req.body?.priceStructureId, 0));
  if (!ps) throw notFound('Price structure');
  run('UPDATE quotes SET price_structure_id = ?, price_structure_name = ?, cost_heads = ?, updated_at = ? WHERE id = ?', ps.id, ps.name, ps.cost_heads, new Date().toISOString(), q.id);
  calculateQuote(q.id);
  res.json({ ok: true });
});

router.put('/quotes/:id/cost-heads', requirePermission('quote.manualRate'), (req, res) => {
  const q = quoteRow(req.params.id);
  const heads = normaliseCostHeads(req.body?.costHeads);
  run('UPDATE quotes SET cost_heads = ?, updated_at = ? WHERE id = ?', JSON.stringify(heads), new Date().toISOString(), q.id);
  calculateQuote(q.id);
  res.json({ ok: true, heads });
});

router.post('/quotes/:id/update-pricing', (req, res) => {
  const q = quoteRow(req.params.id);
  const calc = calculateQuote(q.id);
  res.json({ ok: true, summary: calc.summary });
});

const RATE_CATEGORIES = {
  profile: ['profile'],
  reinforcement: ['reinforcement'],
  hardware: ['hardware'],
  glass: ['glass'],
  mesh: ['mesh'],
  aluminium: ['aluminium'],
};

router.get('/quotes/:id/rates', (req, res) => {
  const calc = calculateQuote(intParam(req.params.id, 0), { persist: false });
  if (!calc) throw notFound('Quote');
  const cats = RATE_CATEGORIES[req.query.category] || RATE_CATEGORIES.profile;
  const wantAlu = req.query.category === 'profile';
  const lines = aggregateLines(calc.designs).filter((l) => cats.includes(l.category) || (wantAlu && l.category === 'aluminium'));
  const catalog = calc.catalog;
  const rows = lines.map((l) => {
    const item = catalog.items.get(l.baseCode);
    const glass = [...catalog.glasses.values()].find((g) => g.code === l.baseCode);
    const laminatedDesign = calc.designs.find((d) => d.bom.lines.some((x) => x.code === l.code));
    const color = laminatedDesign ? catalog.colors.get(laminatedDesign.colorId) : null;
    const masterRate = item ? (item.color_variant && color?.laminated ? Number(item.rate_lam ?? item.rate) : Number(item.rate)) : glass ? Number(glass.rate) : l.rate;
    const levelCat = LEVEL_CATEGORY[l.category] || 'hardware';
    const lvMap = calc.levelPrices[levelCat];
    const defaultRate = lvMap?.has(l.code) ? lvMap.get(l.code) : lvMap?.has(l.baseCode) ? lvMap.get(l.baseCode) : masterRate;
    const override = calc.rateOverrides[l.code];
    return {
      code: l.code,
      baseCode: l.baseCode,
      name: l.name,
      unit: l.unit,
      group: l.grp,
      category: l.category,
      qty: round(l.qty, 3),
      defaultRate,
      rate: override != null ? Number(override) : defaultRate,
      overridden: override != null,
      amount: l.amount,
      color: l.color || '',
    };
  });
  const levelCategory = req.query.category === 'mesh' ? 'glass' : req.query.category === 'aluminium' ? 'profile' : String(req.query.category || 'profile');
  const levels = all('SELECT * FROM price_levels WHERE category = ? ORDER BY is_default DESC, name', levelCategory).map((lv) => ({ id: lv.id, name: lv.name, isDefault: !!lv.is_default }));
  const selected = parseJSON(calc.quote.price_levels, {})[levelCategory] || levels.find((x) => x.isDefault)?.id || null;
  res.json({ rows, levels, levelId: selected, levelCategory });
});

router.put('/quotes/:id/rates', (req, res) => {
  const q = quoteRow(req.params.id);
  const overrides = parseJSON(q.rate_overrides, {});
  const updates = req.body?.rates;
  if (!updates || typeof updates !== 'object') throw badRequest('Rates are required');
  for (const [code, value] of Object.entries(updates)) {
    if (value === null || value === '') {
      delete overrides[code];
      continue;
    }
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) throw badRequest(`Rate for ${code} must be a positive number`);
    overrides[String(code).slice(0, 60)] = n;
  }
  run('UPDATE quotes SET rate_overrides = ?, updated_at = ? WHERE id = ?', JSON.stringify(overrides), new Date().toISOString(), q.id);
  const calc = calculateQuote(q.id);
  res.json({ ok: true, summary: calc.summary });
});

router.put('/quotes/:id/manual-rates', requirePermission('quote.manualRate'), (req, res) => {
  const q = quoteRow(req.params.id);
  const items = Array.isArray(req.body?.designs) ? req.body.designs : [];
  tx(() => {
    for (const it of items) {
      const d = get('SELECT id FROM designs WHERE id = ? AND quote_id = ?', intParam(it.id, 0), q.id);
      if (!d) continue;
      const calcType = it.calcType === 'manual' ? 'manual' : 'auto';
      const rate = num(it.manualSqftRate);
      if (calcType === 'manual' && !(rate > 0)) throw badRequest('Manual SQFT rate must be greater than zero');
      run('UPDATE designs SET calc_type = ?, manual_sqft_rate = ?, updated_at = ? WHERE id = ?', calcType, calcType === 'manual' ? rate : rate ?? null, new Date().toISOString(), d.id);
    }
  });
  const calc = calculateQuote(q.id);
  res.json({ ok: true, summary: calc.summary });
});

router.put('/designs/:id/addons', (req, res) => {
  const d = designRow(req.params.id);
  const addons = (Array.isArray(req.body?.addons) ? req.body.addons : [])
    .map((a) => ({ name: str(a?.name, 80), amount: Number(a?.amount) || 0, basis: a?.basis === 'sqft' ? 'sqft' : 'unit' }))
    .filter((a) => a.name);
  run('UPDATE designs SET addons = ?, updated_at = ? WHERE id = ?', JSON.stringify(addons), new Date().toISOString(), d.id);
  const calc = calculateQuote(d.quote_id);
  res.json({ ok: true, summary: calc.summary });
});

// ---------------- designs ----------------
router.post('/quotes/:id/designs', (req, res) => {
  const q = quoteRow(req.params.id);
  const body = { ...(req.body || {}) };
  if (!str(body.ref)) body.ref = nextRef(q.id);
  const fields = readDesignBody(body, q);
  assertUniqueRef(q.id, fields.ref);
  const id = insertDesign(q.id, fields);
  touchQuote(q.id);
  res.status(201).json(designResponse(id));
});

router.post('/quotes/:id/designs/preview', (req, res) => {
  const q = quoteRow(req.params.id);
  const b = req.body || {};
  const catalog = loadCatalog();
  const data = validateDesignData(b.data);
  const design = {
    id: intParam(b.id, 0),
    qty: Math.max(1, Math.round(Number(b.qty) || 1)),
    systemId: catalog.systems.has(b.systemId) ? b.systemId : 'inventa-sliding',
    colorId: catalog.colors.has(b.colorId) ? b.colorId : 'white',
    glassId: catalog.glasses.has(b.glassId) ? b.glassId : 'g4-pinhead',
    calcType: 'auto',
    addons: [],
    data,
  };
  const heads = parseJSON(q.cost_heads, []);
  const overrides = parseJSON(q.rate_overrides, {});
  const levelPrices = loadLevelPrices(parseJSON(q.price_levels, {}));
  const bom = bomForDesign(design, catalog, overrides, levelPrices);
  const others = all('SELECT * FROM designs WHERE quote_id = ? AND id != ?', q.id, design.id).map(designRowToModel);
  const otherArea = others.reduce((s, o) => s + bomForDesign(o, catalog, overrides, levelPrices).areaSqft * o.qty, 0);
  const totalArea = otherArea + bom.areaSqft * design.qty;
  const price = priceDesign(bom, heads, { calcType: 'auto', areaShare: totalArea ? bom.areaSqft / totalArea : 0, qty: design.qty });
  res.json({
    areaSqft: bom.areaSqft,
    areaSqm: bom.areaSqm,
    unitPrice: price.grand,
    basic: price.basic,
    sqftRate: price.sqftRate,
    warnings: bom.warnings,
    sashes: bom.sashes,
    glassLabels: glassLabels(design, catalog),
    heads: price.heads.map((h) => ({ name: h.name, value: h.value, visibility: h.visibility, calcType: h.calcType })),
    lines: bom.lines.map((l) => ({ code: l.code, name: l.name, grp: l.grp, category: l.category, unit: l.unit, qty: l.qty, rate: l.rate, amount: l.amount, color: l.color })),
    areaSqmExact: bom.areaSqm,
    frameCode: bom.frameCode,
    profiles: [...new Map(bom.cuts.filter((c) => c.category === 'profile' || c.category === 'aluminium').map((c) => [c.role, { role: c.role, code: c.code, name: c.name }])).values()],
  });
});

router.get('/designs/:id', (req, res) => {
  const d = designRow(req.params.id);
  const calc = calculateQuote(d.quote_id, { persist: false });
  const full = calc.designs.find((x) => x.id === d.id);
  res.json({
    design: designDTO(full, calc.catalog),
    bom: { lines: full.bom.lines, cuts: full.bom.cuts, panes: full.bom.panes, meshPanes: full.bom.meshPanes, sashes: full.bom.sashes, warnings: full.bom.warnings, frameCode: full.bom.frameCode },
    price: { heads: full.price.heads, basic: full.price.basic, grand: full.price.grand, sqftRate: full.price.sqftRate, autoBasic: full.price.autoBasic },
  });
});

router.put('/designs/:id', (req, res) => {
  const d = designRow(req.params.id);
  const q = quoteRow(d.quote_id);
  const fields = readDesignBody(req.body || {}, q, true);
  if (fields.ref) assertUniqueRef(q.id, fields.ref, d.id);
  const cols = Object.keys(fields);
  if (cols.length) {
    run(`UPDATE designs SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, ...cols.map((c) => fields[c]), new Date().toISOString(), d.id);
  }
  touchQuote(q.id);
  res.json(designResponse(d.id));
});

router.delete('/designs/:id', (req, res) => {
  const d = designRow(req.params.id);
  run('DELETE FROM designs WHERE id = ?', d.id);
  calculateQuote(d.quote_id);
  res.json({ ok: true });
});

router.post('/quotes/:id/designs/bulk-delete', (req, res) => {
  const q = quoteRow(req.params.id);
  const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map((x) => intParam(x, 0)).filter(Boolean);
  if (!ids.length) throw badRequest('Select at least one design');
  tx(() => ids.forEach((id) => run('DELETE FROM designs WHERE id = ? AND quote_id = ?', id, q.id)));
  calculateQuote(q.id);
  res.json({ ok: true, deleted: ids.length });
});

router.post('/designs/:id/duplicate', (req, res) => {
  const d = designRow(req.params.id);
  const id = insertDesign(d.quote_id, {
    ref: nextRef(d.quote_id),
    qty: d.qty,
    name: d.name,
    location: d.location,
    floor: d.floor,
    note: d.note,
    system_id: d.system_id,
    color_id: d.color_id,
    glass_id: d.glass_id,
    data: d.data,
    calc_type: d.calc_type,
    manual_sqft_rate: d.manual_sqft_rate,
    addons: d.addons,
  });
  touchQuote(d.quote_id);
  res.status(201).json(designResponse(id));
});

router.put('/quotes/:id/design-order', (req, res) => {
  const q = quoteRow(req.params.id);
  const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map((x) => intParam(x, 0));
  tx(() => ids.forEach((id, i) => run('UPDATE designs SET sort = ? WHERE id = ? AND quote_id = ?', i, id, q.id)));
  touchQuote(q.id);
  res.json(fullQuote(q.id));
});

router.post('/quotes/:id/global-edit', (req, res) => {
  const q = quoteRow(req.params.id);
  const catalog = loadCatalog();
  const field = req.body?.field;
  const value = req.body?.value;
  const map = { colorId: ['color_id', catalog.colors], glassId: ['glass_id', catalog.glasses], systemId: ['system_id', catalog.systems] };
  let col;
  let val = value;
  if (map[field]) {
    if (!map[field][1].has(value)) throw badRequest('Invalid value');
    col = map[field][0];
  } else if (field === 'qty') {
    val = Math.round(Number(value));
    if (!(val >= 1 && val <= 9999)) throw badRequest('Quantity must be between 1 and 9999');
    col = 'qty';
  } else if (field === 'location') {
    col = 'location';
    val = str(value, 120);
  } else throw badRequest('Unsupported global edit');
  const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map((x) => intParam(x, 0)).filter(Boolean);
  const now = new Date().toISOString();
  const affected = tx(() => {
    if (ids.length) {
      ids.forEach((id) => run(`UPDATE designs SET ${col} = ?, updated_at = ? WHERE id = ? AND quote_id = ?`, val, now, id, q.id));
      return ids.length;
    }
    return Number(run(`UPDATE designs SET ${col} = ?, updated_at = ? WHERE quote_id = ?`, val, now, q.id).changes);
  });
  if (field === 'glassId') {
    // A global glass change also clears per-panel glass overrides on the affected designs.
    const rows = ids.length ? ids.map((id) => get('SELECT * FROM designs WHERE id = ? AND quote_id = ?', id, q.id)).filter(Boolean) : all('SELECT * FROM designs WHERE quote_id = ?', q.id);
    for (const r of rows) {
      const data = parseJSON(r.data, {});
      const strip = (n) => {
        if (!n) return;
        if (n.kind === 'split') n.children.forEach(strip);
        else if (n.panel !== 'louver') delete n.glassId;
      };
      strip(data.root);
      run('UPDATE designs SET data = ? WHERE id = ?', JSON.stringify(data), r.id);
    }
  }
  calculateQuote(q.id);
  res.json({ ok: true, affected, ...fullQuote(q.id) });
});

router.post('/quotes/:id/designs/from-library', (req, res) => {
  const q = quoteRow(req.params.id);
  const lib = get('SELECT * FROM library_designs WHERE id = ?', intParam(req.body?.libraryId, 0));
  if (!lib) throw notFound('Library design');
  const defaults = parseJSON(q.defaults, {});
  const data = parseJSON(lib.data, {});
  if (defaults.floorAperture != null) data.floorAperture = defaults.floorAperture;
  const id = insertDesign(q.id, {
    ref: nextRef(q.id),
    qty: 1,
    name: lib.name,
    system_id: lib.system_id,
    color_id: defaults.colorId || lib.color_id,
    glass_id: defaults.glassId || lib.glass_id,
    data: JSON.stringify(validateDesignData(data)),
  });
  touchQuote(q.id);
  res.status(201).json(designResponse(id));
});

router.post('/designs/:id/save-to-library', (req, res) => {
  const d = designRow(req.params.id);
  const name = (str(req.body?.name, 80) || d.name || d.ref).toUpperCase();
  const info = run(
    'INSERT INTO library_designs (name, system_id, color_id, glass_id, data, created_at) VALUES (?,?,?,?,?,?)',
    name, d.system_id, d.color_id, d.glass_id, d.data, new Date().toISOString(),
  );
  res.status(201).json({ id: Number(info.lastInsertRowid), name });
});

// ---------------- documents ----------------
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname).slice(0, 12)}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
});

router.get('/quotes/:id/documents', (req, res) => {
  const q = quoteRow(req.params.id);
  res.json(
    all(
      `SELECT d.*, u.name AS uploaded_by_name FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by WHERE d.quote_id = ? ORDER BY d.uploaded_at DESC`,
      q.id,
    ).map((d) => ({ id: d.id, name: d.original_name, mime: d.mime, size: d.size, category: d.category, uploadedBy: d.uploaded_by_name, uploadedAt: d.uploaded_at })),
  );
});

router.post('/quotes/:id/documents', upload.array('files', 10), (req, res) => {
  const q = quoteRow(req.params.id);
  const files = req.files || [];
  if (!files.length) throw badRequest('Choose at least one file to upload');
  const category = str(req.body?.category, 60) || 'General';
  const now = new Date().toISOString();
  for (const f of files) {
    run(
      'INSERT INTO documents (quote_id, stored_name, original_name, mime, size, category, uploaded_by, uploaded_at) VALUES (?,?,?,?,?,?,?,?)',
      q.id, f.filename, Buffer.from(f.originalname, 'latin1').toString('utf8').slice(0, 200), f.mimetype, f.size, category, req.user.id, now,
    );
  }
  res.status(201).json({ ok: true, uploaded: files.length });
});

router.get('/documents/:id/download', (req, res) => {
  const d = get('SELECT * FROM documents WHERE id = ?', intParam(req.params.id, 0));
  if (!d) throw notFound('Document');
  const file = path.join(UPLOAD_DIR, path.basename(d.stored_name));
  if (!fs.existsSync(file)) throw notFound('File');
  res.download(file, d.original_name);
});

router.delete('/documents/:id', (req, res) => {
  const d = get('SELECT * FROM documents WHERE id = ?', intParam(req.params.id, 0));
  if (!d) throw notFound('Document');
  run('DELETE FROM documents WHERE id = ?', d.id);
  fs.rm(path.join(UPLOAD_DIR, path.basename(d.stored_name)), { force: true }, () => {});
  res.json({ ok: true });
});

// ---------------- smart quote ----------------
router.get('/quotes/:id/smart-quote', (req, res) => {
  const q = quoteRow(req.params.id);
  res.json(get('SELECT token, views, last_viewed_at AS lastViewedAt, created_at AS createdAt FROM smart_quotes WHERE quote_id = ? ORDER BY id DESC LIMIT 1', q.id) || null);
});
router.post('/quotes/:id/smart-quote', (req, res) => {
  const q = quoteRow(req.params.id);
  if (!get('SELECT id FROM designs WHERE quote_id = ? LIMIT 1', q.id)) throw badRequest('Add at least one design before generating a smart quote');
  let row = get('SELECT * FROM smart_quotes WHERE quote_id = ? ORDER BY id DESC LIMIT 1', q.id);
  if (!row) {
    const token = crypto.randomBytes(12).toString('hex');
    run('INSERT INTO smart_quotes (quote_id, token, views, created_at) VALUES (?,?,?,?)', q.id, token, 0, new Date().toISOString());
    row = get('SELECT * FROM smart_quotes WHERE token = ?', token);
  }
  res.status(201).json({ token: row.token, views: row.views, lastViewedAt: row.last_viewed_at, createdAt: row.created_at });
});

// ---------------- report data ----------------
export function reportData(quoteId) {
  const calc = calculateQuote(quoteId, { persist: false });
  if (!calc) throw notFound('Quote');
  const company = getSetting('company', DEFAULT_COMPANY);
  const lines = aggregateLines(calc.designs);
  const designs = calc.designs.map((d) => ({
    ...designDTO(d, calc.catalog),
    bom: d.bom,
    price: { heads: d.price.heads, basic: d.price.basic, grand: d.price.grand, sqftRate: d.price.sqftRate, autoBasic: d.price.autoBasic, manualBasic: d.price.manualBasic },
  }));
  return {
    company,
    quote: quoteHeader(calc.quote),
    designs,
    summary: calc.summary,
    lines,
    bars: profileBars(calc.designs, calc.catalog),
    zeroRate: {
      profile: lines.filter((l) => (l.category === 'profile' || l.category === 'aluminium' || l.category === 'reinforcement') && l.rate === 0).map((l) => ({ code: l.code, name: l.name })),
      hardware: lines.filter((l) => l.category === 'hardware' && l.rate === 0).map((l) => ({ code: l.code, name: l.name })),
      glass: lines.filter((l) => (l.category === 'glass' || l.category === 'mesh') && l.rate === 0).map((l) => ({ code: l.code, name: l.name })),
    },
    manualDesigns: designs.filter((d) => d.calcType === 'manual').map((d) => ({ ref: d.ref, name: d.name, basic: d.price.basic * d.qty })),
    generatedAt: new Date().toISOString(),
  };
}

router.get('/quotes/:id/report-data', (req, res) => {
  res.json(reportData(intParam(req.params.id, 0)));
});

publicRoutes.get('/smart-quote/:token', (req, res) => {
  const sq = get('SELECT * FROM smart_quotes WHERE token = ?', str(req.params.token, 80));
  if (!sq) throw notFound('Quote link');
  run('UPDATE smart_quotes SET views = views + 1, last_viewed_at = ? WHERE id = ?', new Date().toISOString(), sq.id);
  const data = reportData(sq.quote_id);
  // Whitelist only what the customer-facing quotation prints: no internal cost heads,
  // item rates, profit, manual-rate adjustments or CRM fields leave the server.
  const o = data.quote.opportunity || {};
  const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));
  res.json({
    company: data.company,
    quote: {
      ...pick(data.quote, ['id', 'quoteNo', 'alias', 'projectCode', 'projectName', 'createdAt', 'remarks']),
      opportunity: pick(o, ['salutation', 'firstName', 'lastName', 'contactName', 'address1', 'address2', 'pincode', 'city', 'state', 'country', 'siteLocation']),
    },
    designs: data.designs.map((d) => ({
      ...pick(d, [
        'id', 'ref', 'qty', 'name', 'location', 'floor', 'note', 'systemName', 'systemType', 'brand', 'colorId', 'colorName', 'colorInside', 'colorOutside',
        'colorHex', 'colorHexIn', 'hwColor', 'glassId', 'glassName', 'glassLabels', 'data', 'areaSqft', 'areaSqm', 'unitBasic', 'unitPrice', 'totalPrice', 'sqftRate', 'sashes',
      ]),
      bom: {
        areaSqft: d.bom.areaSqft,
        areaSqm: d.bom.areaSqm,
        sashes: d.bom.sashes,
        lines: d.bom.lines.map((l) => ({ code: l.code, baseCode: l.baseCode, name: l.name, grp: l.grp, category: l.category, unit: l.unit, color: l.color })),
        cuts: d.bom.cuts.map((c) => ({ code: c.code, role: c.role })),
      },
    })),
    summary: {
      ...pick(data.summary, ['qty', 'count', 'areaSqft', 'areaSqm', 'basic', 'grand', 'sqftRate', 'sqftRateWithTax', 'sqmRateWithTax']),
      heads: data.summary.heads.filter((h) => h.visibility === 'summary'),
      errors: [],
    },
    generatedAt: data.generatedAt,
  });
});

export default router;
