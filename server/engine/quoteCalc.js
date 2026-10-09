import { all, get, run, parseJSON, nowISO } from '../db.js';
import { computeBOM, round, optimiseBars, GROUP_ORDER } from './bom.js';
import { priceDesign } from './pricing.js';

export function loadCatalog() {
  const items = new Map(all('SELECT * FROM items ORDER BY sort').map((r) => [r.code, { ...r, extra: parseJSON(r.extra, {}) }]));
  const systems = new Map(
    all('SELECT * FROM systems').map((r) => [r.id, { ...r, roles: parseJSON(r.roles, {}), limits: parseJSON(r.limits, {}) }]),
  );
  const colors = new Map(all('SELECT * FROM colors ORDER BY sort').map((r) => [r.id, r]));
  const glasses = new Map(all('SELECT * FROM glasses ORDER BY sort').map((r) => [r.id, r]));
  return { items, systems, colors, glasses };
}

export function designRowToModel(row) {
  const data = parseJSON(row.data, {});
  return {
    id: row.id,
    quoteId: row.quote_id,
    ref: row.ref,
    qty: row.qty,
    name: row.name || '',
    location: row.location || '',
    floor: row.floor || '',
    note: row.note || '',
    systemId: row.system_id,
    colorId: row.color_id,
    glassId: row.glass_id,
    calcType: row.calc_type || 'auto',
    manualSqftRate: row.manual_sqft_rate,
    addons: parseJSON(row.addons, []),
    sort: row.sort,
    unitPrice: row.unit_price,
    totalPrice: row.total_price,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    data,
  };
}

/** Rates of the quote's selected (non-default) price levels, keyed by category then code. */
export function loadLevelPrices(levels) {
  const out = {};
  for (const [category, id] of Object.entries(levels || {})) {
    const lv = get('SELECT * FROM price_levels WHERE id = ?', Number(id) || 0);
    if (!lv) continue;
    out[category] = new Map(all('SELECT code, rate FROM level_prices WHERE level_id = ?', lv.id).map((r) => [r.code, Number(r.rate)]));
  }
  // The default level of each category may also hold per-colour prices.
  for (const lv of all('SELECT * FROM price_levels WHERE is_default = 1')) {
    if (out[lv.category]) continue;
    const rows = all('SELECT code, rate FROM level_prices WHERE level_id = ?', lv.id);
    if (rows.length) out[lv.category] = new Map(rows.map((r) => [r.code, Number(r.rate)]));
  }
  return out;
}

export function bomForDesign(design, catalog, rateOverrides = {}, levelPrices = null) {
  const system = catalog.systems.get(design.systemId) || [...catalog.systems.values()][0];
  const color = catalog.colors.get(design.colorId) || catalog.colors.get('white');
  const ctx = {
    system,
    color,
    items: catalog.items,
    glasses: catalog.glasses,
    defaultGlass: catalog.glasses.get('g4-pinhead') || [...catalog.glasses.values()][0],
    rateOverrides,
    levelPrices: levelPrices || {},
  };
  return computeBOM({ ...design.data, glassId: design.glassId }, ctx);
}

// ---------- custom entries added on the quote's rate pages ----------

/** Category of a custom quote entry → the BOM cost variable (and so the cost head) its amount adds to. */
export const QUOTE_ITEM_VARS = {
  profile: 'UPVCPROFILECOST',
  aluminium: 'ALUMINIUMPROFILECOST',
  reinforcement: 'RICOST',
  hardware: 'HWCOST',
  glass: 'GLASSCOST',
  mesh: 'MESHCOST',
};
const QUOTE_ITEM_GROUPS = {
  profile: 'Profile',
  aluminium: 'Aluminium Profiles',
  reinforcement: 'Reinforcement',
  hardware: 'Additional Items',
  glass: 'Glazing',
  mesh: 'Mesh',
};

export function quoteItemDTO(r) {
  const qty = Number(r.qty) || 0;
  const rate = Number(r.rate) || 0;
  return {
    id: r.id,
    category: r.category,
    code: r.code || '',
    name: r.name,
    color: r.color || '',
    unit: r.unit,
    qty,
    rate,
    amount: qty * rate,
    sort: r.sort,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function loadQuoteItems(quoteId) {
  return all('SELECT * FROM quote_items WHERE quote_id = ? ORDER BY sort, id', quoteId).map(quoteItemDTO);
}

/** Totals of the custom entries per BOM cost variable, or null when the quote has none (pricing is then untouched). */
export function quoteItemVars(items) {
  if (!items?.length) return null;
  const vars = {};
  for (const it of items) {
    const v = QUOTE_ITEM_VARS[it.category];
    if (v) vars[v] = (vars[v] || 0) + it.amount;
  }
  return vars;
}

/** The BOM with this design's per-unit share of the custom entries added to its cost variables. */
export function withItemShare(bom, itemVars, share) {
  if (!itemVars || !share) return bom;
  const vars = { ...bom.vars };
  for (const [k, v] of Object.entries(itemVars)) vars[k] = (Number(vars[k]) || 0) + v * share;
  return { ...bom, vars };
}

/** Custom entries as BOM-style lines (flagged `added`) for the BOQ reports. */
export function quoteItemLines(items) {
  return items.map((it) => ({
    code: it.code,
    baseCode: it.code,
    name: it.name,
    grp: QUOTE_ITEM_GROUPS[it.category] || 'Additional Items',
    category: it.category,
    unit: it.unit,
    qty: it.qty,
    rate: it.rate,
    amount: it.amount,
    color: it.color,
    added: true,
    id: it.id,
  }));
}

function addonPerUnit(design, bom) {
  return (design.addons || []).reduce((s, a) => {
    const amt = Number(a.amount) || 0;
    return s + (a.basis === 'sqft' ? amt * bom.areaSqft : amt);
  }, 0);
}

/** Full calculation for a quote: per-design BOM & pricing plus project summary. */
export function calculateQuote(quoteId, { persist = true } = {}) {
  const quoteRow = get('SELECT * FROM quotes WHERE id = ?', quoteId);
  if (!quoteRow) return null;
  const heads = parseJSON(quoteRow.cost_heads, []);
  const rateOverrides = parseJSON(quoteRow.rate_overrides, {});
  const catalog = loadCatalog();
  const designs = all('SELECT * FROM designs WHERE quote_id = ? ORDER BY sort, id', quoteId).map(designRowToModel);

  const levelPrices = loadLevelPrices(parseJSON(quoteRow.price_levels, {}));
  const boms = designs.map((d) => bomForDesign(d, catalog, rateOverrides, levelPrices));
  const totalArea = designs.reduce((s, d, i) => s + boms[i].areaSqft * d.qty, 0);
  // Entries added on the rate pages are shared across the designs by area, like the lump-sum heads,
  // so each design's price (and the quotation rows) add up to the project total.
  const quoteItems = loadQuoteItems(quoteId);
  const itemVars = quoteItemVars(quoteItems);
  const itemTotal = quoteItems.reduce((s, it) => s + it.amount, 0);

  const results = designs.map((d, i) => {
    const bom = boms[i];
    const areaShare = totalArea ? bom.areaSqft / totalArea : 0;
    const price = priceDesign(withItemShare(bom, itemVars, areaShare), heads, {
      calcType: d.calcType,
      manualSqftRate: d.manualSqftRate,
      addonPerUnit: addonPerUnit(d, bom),
      areaShare,
      qty: d.qty,
    });
    const system = catalog.systems.get(d.systemId);
    const color = catalog.colors.get(d.colorId);
    const glass = catalog.glasses.get(d.glassId);
    return {
      ...d,
      systemName: system?.name || '',
      systemType: system?.type || '',
      brand: system?.brand || '',
      colorName: color?.name || '',
      colorInside: color?.inside || '',
      colorOutside: color?.outside || '',
      colorHex: color?.hex_out || '#ffffff',
      colorHexIn: color?.hex_in || '#ffffff',
      hwColor: color?.hw_color || 'WHITE',
      glassName: glass?.name || '',
      bom,
      price,
      unitPrice: price.grand,
      totalPrice: price.grand * d.qty,
      // per-unit raw-material share of the entries added on the rate pages
      addedShare: itemVars ? itemTotal * areaShare : 0,
    };
  });

  // With no designs there is no area to share the added entries over: price them as one extra unit
  // (no labour, lump sums or per-design charges) so they still reach the project total.
  let extra = null;
  if (itemVars && !(totalArea > 0)) {
    const vheads = heads.map((h) => (h.calcType === 'LumpSumPerDesign' ? { ...h, rate: 0 } : h));
    extra = priceDesign({ areaSqft: 0, areaSqm: 0, vars: { ...itemVars } }, vheads, { calcType: 'auto', qty: 1, areaShare: 0 });
  }

  // Project summary: every head summed over designs x qty.
  const summaryHeads = heads.map((h) => ({
    sl: h.sl,
    name: h.name,
    calcType: h.calcType,
    formula: h.formula,
    rate: h.rate,
    visibility: h.visibility,
    value:
      results.reduce((s, r) => s + (r.price.heads.find((x) => x.name === h.name)?.value || 0) * r.qty, 0) +
      (extra ? extra.heads.find((x) => x.name === h.name)?.value || 0 : 0),
    ...(h.added ? { added: true } : {}),
  }));
  let grand = results.reduce((s, r) => s + r.price.grand * r.qty, 0);
  let basic = results.reduce((s, r) => s + r.price.basic * r.qty, 0);
  if (extra) {
    grand += extra.grand;
    basic += extra.basic;
  }
  const qty = results.reduce((s, r) => s + r.qty, 0);
  const areaSqm = results.reduce((s, r) => s + r.bom.areaSqm * r.qty, 0);
  const summary = {
    heads: summaryHeads,
    basic,
    grand,
    qty,
    count: results.length,
    areaSqft: totalArea,
    areaSqm,
    sqftRate: totalArea ? basic / totalArea : 0,
    sqftRateWithTax: totalArea ? grand / totalArea : 0,
    sqmRateWithTax: areaSqm ? grand / areaSqm : 0,
    errors: [...new Set([...results.flatMap((r) => r.price.errors), ...(extra ? extra.errors : [])])],
    addedItems: { count: quoteItems.length, amount: itemTotal },
  };

  if (persist) {
    for (const r of results) {
      run('UPDATE designs SET unit_price = ?, total_price = ? WHERE id = ?', round(r.unitPrice), round(r.totalPrice), r.id);
    }
    run(
      'UPDATE quotes SET total_qty = ?, total_area = ?, basic_total = ?, grand_total = ?, updated_at = ? WHERE id = ?',
      qty,
      round(totalArea, 3),
      round(basic),
      round(grand),
      nowISO(),
      quoteId,
    );
  }

  return { quote: quoteRow, heads, rateOverrides, levelPrices, designs: results, summary, catalog, quoteItems };
}

/** Items used across a quote, aggregated, for the rate pages and BOQ reports. */
export function aggregateLines(designs) {
  const map = new Map();
  for (const d of designs) {
    for (const l of d.bom.lines) {
      const key = l.code;
      const prev = map.get(key);
      if (prev) {
        prev.qty += l.qty * d.qty;
        prev.amount += l.amount * d.qty;
      } else {
        map.set(key, { ...l, qty: l.qty * d.qty, amount: l.amount * d.qty });
      }
    }
  }
  return [...map.values()].sort((a, b) => GROUP_ORDER.indexOf(a.grp) - GROUP_ORDER.indexOf(b.grp) || a.code.localeCompare(b.code));
}

/** Profile bar requirement (standard bars) for the Profile BOQ report. */
export function profileBars(designs, catalog) {
  const byCode = new Map();
  for (const d of designs) {
    for (const c of d.bom.cuts) {
      if (c.category !== 'profile' && c.category !== 'aluminium') continue;
      const entry = byCode.get(c.code) || {
        code: c.code,
        baseCode: c.baseCode,
        name: c.name,
        category: c.category,
        color: c.category === 'aluminium' ? 'WHITE' : `Inside-${d.colorInside}, Outside-${d.colorOutside}`,
        cuts: [],
      };
      for (let q = 0; q < c.qty * d.qty; q++) entry.cuts.push(c.length);
      byCode.set(c.code, entry);
    }
  }
  return [...byCode.values()].map((e) => {
    const item = catalog.items.get(e.baseCode);
    const barLength = item?.bar_length || 5.8;
    const bars = optimiseBars(e.cuts, barLength);
    const used = e.cuts.reduce((s, x) => s + x, 0) / 1000;
    const billing = bars.length * barLength;
    return {
      code: e.code,
      baseCode: e.baseCode,
      name: e.name,
      category: e.category,
      color: e.color,
      barLength,
      pcs: bars.length,
      billingQty: round(billing, 3),
      usedQty: round(used, 3),
      wastage: round(billing - used, 3),
      wastagePct: billing ? round(((billing - used) / billing) * 100, 1) : 0,
      bars: bars.map((b) => ({ cuts: b.cuts, used: round(b.used, 1), offcut: round(barLength * 1000 - b.used, 1) })),
    };
  });
}
