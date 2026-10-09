// Quote-level entries: custom lines on the rate pages, custom charges on the price structure,
// editable quote details and document renaming.
import { Router } from 'express';
import { all, get, run, parseJSON } from '../db.js';
import { calculateQuote, loadQuoteItems, quoteItemDTO, QUOTE_ITEM_VARS } from '../engine/quoteCalc.js';
import { badRequest, notFound, str, intParam } from './util.js';
import { normaliseCostHeads } from './masters.js';
import { CHARGE_KINDS, chargeTargets, defaultChargeTarget, insertCharge, readCharge, removeCharge, updateCharge } from './charges.js';

const router = Router();

const now = () => new Date().toISOString();

function quoteRow(id) {
  const q = get('SELECT * FROM quotes WHERE id = ?', intParam(id, 0));
  if (!q) throw notFound('Quote');
  return q;
}

// ---------------------------------------------------------------- custom rate-page entries
export const ITEM_CATEGORIES = Object.keys(QUOTE_ITEM_VARS);

function readItem(b, partial = false) {
  const out = {};
  if (!partial || b.category !== undefined) {
    const c = String(b.category || '');
    if (!ITEM_CATEGORIES.includes(c)) throw badRequest('Category must be profile, aluminium, reinforcement, hardware, glass or mesh');
    out.category = c;
  }
  if (!partial || b.name !== undefined) {
    const name = str(b.name, 200);
    if (!name) throw badRequest('Item name is required');
    out.name = name;
  }
  if (!partial || b.code !== undefined) out.code = str(b.code, 60);
  if (!partial || b.color !== undefined) out.color = str(b.color, 80);
  if (!partial || b.unit !== undefined) {
    const unit = str(b.unit, 20);
    if (!unit) throw badRequest('Unit is required');
    out.unit = unit;
  }
  if (!partial || b.qty !== undefined) {
    const qty = Number(b.qty);
    if (b.qty === '' || b.qty == null || !Number.isFinite(qty) || qty <= 0) throw badRequest('Quantity must be greater than zero');
    if (qty > 1e6) throw badRequest('Quantity is too large');
    out.qty = qty;
  }
  if (!partial || b.rate !== undefined) {
    const rate = Number(b.rate);
    if (b.rate === '' || b.rate == null || !Number.isFinite(rate) || rate < 0) throw badRequest('Rate must be 0 or more');
    if (rate > 1e8) throw badRequest('Rate is too large');
    out.rate = rate;
  }
  return out;
}

/** Categories shown on one rate page (the Profile page also lists aluminium profiles). */
function pageCategories(category) {
  if (category === 'profile') return ['profile', 'aluminium'];
  return ITEM_CATEGORIES.includes(category) ? [category] : ITEM_CATEGORIES;
}

router.get('/quotes/:id/items', (req, res) => {
  const q = quoteRow(req.params.id);
  const cats = req.query.category ? pageCategories(String(req.query.category)) : ITEM_CATEGORIES;
  res.json(loadQuoteItems(q.id).filter((it) => cats.includes(it.category)));
});

router.post('/quotes/:id/items', (req, res) => {
  const q = quoteRow(req.params.id);
  const f = readItem(req.body || {});
  const sort = (get('SELECT MAX(sort) m FROM quote_items WHERE quote_id = ?', q.id)?.m ?? -1) + 1;
  const t = now();
  const info = run(
    'INSERT INTO quote_items (quote_id, category, code, name, color, unit, qty, rate, sort, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    q.id, f.category, f.code, f.name, f.color, f.unit, f.qty, f.rate, sort, req.user.id, t, t,
  );
  const calc = calculateQuote(q.id);
  res.status(201).json({ item: quoteItemDTO(get('SELECT * FROM quote_items WHERE id = ?', info.lastInsertRowid)), summary: calc.summary });
});

router.put('/quote-items/:id', (req, res) => {
  const it = get('SELECT * FROM quote_items WHERE id = ?', intParam(req.params.id, 0));
  if (!it) throw notFound('Entry');
  const f = readItem(req.body || {}, true);
  const cols = Object.keys(f);
  if (cols.length) run(`UPDATE quote_items SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, ...cols.map((c) => f[c]), now(), it.id);
  const calc = calculateQuote(it.quote_id);
  res.json({ item: quoteItemDTO(get('SELECT * FROM quote_items WHERE id = ?', it.id)), summary: calc.summary });
});

router.delete('/quote-items/:id', (req, res) => {
  const it = get('SELECT * FROM quote_items WHERE id = ?', intParam(req.params.id, 0));
  if (!it) throw notFound('Entry');
  run('DELETE FROM quote_items WHERE id = ?', it.id);
  const calc = calculateQuote(it.quote_id);
  res.json({ ok: true, summary: calc.summary });
});

// ---------------------------------------------------------------- custom charges (cost heads)
function saveHeads(q, heads) {
  const clean = normaliseCostHeads(heads);
  run('UPDATE quotes SET cost_heads = ?, updated_at = ? WHERE id = ?', JSON.stringify(clean), now(), q.id);
  const calc = calculateQuote(q.id);
  return { heads: clean, summary: calc.summary };
}

router.get('/quotes/:id/charges', (req, res) => {
  const q = quoteRow(req.params.id);
  const heads = parseJSON(q.cost_heads, []);
  res.json({
    charges: heads.filter((h) => h.added),
    targets: chargeTargets(heads).map((h) => h.name),
    defaultTarget: defaultChargeTarget(heads),
    kinds: Object.fromEntries(Object.entries(CHARGE_KINDS).map(([k, v]) => [k, { calcType: v.calcType, label: v.label }])),
  });
});

router.post('/quotes/:id/charges', (req, res) => {
  const q = quoteRow(req.params.id);
  const heads = parseJSON(q.cost_heads, []);
  const c = readCharge(req.body || {}, heads);
  res.status(201).json({ ok: true, ...saveHeads(q, insertCharge(heads, c)) });
});

router.put('/quotes/:id/charges/:name', (req, res) => {
  const q = quoteRow(req.params.id);
  const heads = parseJSON(q.cost_heads, []);
  const oldName = String(req.params.name);
  if (!heads.some((h) => h.name === oldName && h.added)) throw notFound('Charge');
  const c = readCharge(req.body || {}, heads, oldName);
  res.json({ ok: true, ...saveHeads(q, updateCharge(heads, oldName, c)) });
});

router.delete('/quotes/:id/charges/:name', (req, res) => {
  const q = quoteRow(req.params.id);
  const heads = parseJSON(q.cost_heads, []);
  const name = String(req.params.name);
  if (!heads.some((h) => h.name === name && h.added)) throw notFound('Charge');
  res.json({ ok: true, ...saveHeads(q, removeCharge(heads, name)) });
});

// ---------------------------------------------------------------- quote details
router.put('/quotes/:id/meta', (req, res) => {
  const q = quoteRow(req.params.id);
  const b = req.body || {};
  let alias = q.alias;
  if (b.alias !== undefined) {
    alias = String(b.alias ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9 -]{0,9}$/.test(alias)) throw badRequest('Alias must be 1 to 10 letters or numbers, e.g. A or B2');
    if (get('SELECT id FROM quotes WHERE opportunity_id = ? AND alias = ? COLLATE NOCASE AND id != ?', q.opportunity_id, alias, q.id)) {
      throw badRequest(`Another quote of this opportunity already uses alias ${alias}`);
    }
  }
  const title = b.revisionTitle !== undefined ? str(b.revisionTitle, 120) : q.revision_title;
  if ((q.revision_no || 1) > 1 && !title) throw badRequest('Revision title is required for a revision');
  const remarks = b.remarks !== undefined ? str(b.remarks, 2000) : q.remarks;
  run('UPDATE quotes SET alias = ?, revision_title = ?, remarks = ?, updated_at = ? WHERE id = ?', alias, title, remarks, now(), q.id);
  res.json({ ok: true, id: q.id, alias, revisionTitle: title || '', remarks: remarks || '' });
});

// ---------------------------------------------------------------- documents
router.put('/documents/:id', (req, res) => {
  const d = get('SELECT * FROM documents WHERE id = ?', intParam(req.params.id, 0));
  if (!d) throw notFound('Document');
  const b = req.body || {};
  let name = d.original_name;
  if (b.name !== undefined) {
    name = String(b.name ?? '').trim();
    if (!name) throw badRequest('Document name is required');
    if (/[\\/:*?"<>|]/.test(name)) throw badRequest('Document name cannot contain \\ / : * ? " < > |');
    // keep the file extension so downloads still open in the right app
    const ext = /\.[A-Za-z0-9]{1,8}$/.exec(d.original_name)?.[0];
    if (ext && !name.toLowerCase().endsWith(ext.toLowerCase())) name += ext;
    if (name.length > 200) throw badRequest('Document name must be 200 characters or fewer');
  }
  const category = b.category !== undefined ? str(b.category, 60) : d.category;
  if (!category) throw badRequest('Category is required');
  run('UPDATE documents SET original_name = ?, category = ? WHERE id = ?', name, category, d.id);
  run('UPDATE quotes SET updated_at = ? WHERE id = ?', now(), d.quote_id);
  res.json({ ok: true, id: d.id, name, category });
});

/** Every custom entry and charge of a quote (copied with revisions). */
export function copyQuoteItems(fromQuoteId, toQuoteId) {
  const t = now();
  for (const it of all('SELECT * FROM quote_items WHERE quote_id = ? ORDER BY sort, id', fromQuoteId)) {
    run(
      'INSERT INTO quote_items (quote_id, category, code, name, color, unit, qty, rate, sort, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      toQuoteId, it.category, it.code, it.name, it.color, it.unit, it.qty, it.rate, it.sort, it.created_by, t, t,
    );
  }
}

export default router;
