import { db, get, run, tx, setSetting } from './db.js';
import { hashPassword } from './auth.js';
import { COLORS, GLASSES, ITEMS, SYSTEMS, PRICE_STRUCTURES, DEFAULT_COMPANY, DEFAULT_LOOKUPS, DEFAULT_ROLES } from './engine/catalog.js';
import { pathToFileURL } from 'node:url';

export const ADMIN_EMAIL = 'titanswindows1@gmail.com';
// Set TITANS_ADMIN_PASSWORD on public deployments; the default is documented in the README.
export const ADMIN_PASSWORD = process.env.TITANS_ADMIN_PASSWORD || 'Titans@123';
export const PASSWORD_HINT = process.env.TITANS_ADMIN_PASSWORD ? '(password from TITANS_ADMIN_PASSWORD)' : ADMIN_PASSWORD;

let nodeSeq = 0;
const nid = () => `n${(++nodeSeq).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const leaf = (panel, extra = {}) => ({ id: nid(), kind: 'leaf', panel, ...extra });
const split = (dir, sizes, children) => ({ id: nid(), kind: 'split', dir, sizes, children });

const SL = 'inventa-sliding';
const OP = 'optima-casement';

export function libraryDefinitions() {
  return [
    { name: 'SL-SL', system: SL, color: 'walnut', w: 1500, h: 1500, root: leaf('sliding', { sashes: 2, tracks: 2 }) },
    { name: 'SL-SL-M', system: SL, color: 'white', w: 1500, h: 1200, root: leaf('sliding', { sashes: 2, tracks: 3, mesh: true }) },
    { name: 'SL-SL-SL', system: SL, color: 'white', w: 1800, h: 1200, root: leaf('sliding', { sashes: 3, tracks: 3 }) },
    { name: 'SL-SL-SL-SL', system: SL, color: 'white', w: 2400, h: 1500, root: leaf('sliding', { sashes: 4, tracks: 2 }) },
    { name: 'TOP FIX -SL-SL', system: SL, color: 'walnut', w: 1500, h: 1500, root: split('h', [400, 1100], [leaf('fixed'), leaf('sliding', { sashes: 2, tracks: 2 })]) },
    { name: 'SL', system: SL, color: 'white', w: 900, h: 900, root: leaf('sliding', { sashes: 2, tracks: 2 }) },
    { name: 'MONORAIL', system: SL, color: 'white', w: 1800, h: 2100, root: leaf('monorail', { sashes: 2 }) },
    { name: 'OP-OP', system: OP, color: 'white', w: 1200, h: 1200, root: split('v', [600, 600], [leaf('casement', { hinge: 'left' }), leaf('casement', { hinge: 'right' })]) },
    { name: 'OP', system: OP, color: 'white', w: 600, h: 1200, root: leaf('casement', { hinge: 'left' }) },
    { name: 'OP-FIX-OP', system: OP, color: 'white', w: 1800, h: 1200, root: split('v', [500, 800, 500], [leaf('casement', { hinge: 'left' }), leaf('fixed'), leaf('casement', { hinge: 'right' })]) },
    { name: 'FIX', system: OP, color: 'white', w: 1200, h: 1200, root: leaf('fixed') },
    { name: 'FIX LUV', system: OP, color: 'white', w: 810, h: 610, root: split('v', [460, 350], [leaf('fixed'), leaf('louver')]) },
    { name: 'LUV R FAN', system: OP, color: 'white', w: 800, h: 600, root: split('v', [500, 300], [leaf('fan'), leaf('louver')]) },
    { name: 'LUV R FN', system: OP, color: 'white', w: 800, h: 600, root: split('v', [500, 300], [leaf('fixed'), leaf('louver')]) },
    { name: 'LUV L FN', system: OP, color: 'white', w: 800, h: 600, root: split('v', [300, 500], [leaf('louver'), leaf('fixed')]) },
    { name: 'ONLY MESH', system: OP, color: 'white', w: 1000, h: 1000, root: leaf('mesh') },
    { name: 'VENT', system: OP, color: 'white', w: 600, h: 450, root: leaf('louver') },
    { name: 'OP-M', system: OP, color: 'white', w: 700, h: 1200, root: leaf('casement', { hinge: 'left', mesh: true }) },
    { name: 'FRENCH WINDOW', system: OP, color: 'golden-oak', w: 1200, h: 1500, root: leaf('twin') },
    { name: 'TILT & TURN', system: OP, color: 'anthracite-grey', w: 700, h: 1300, root: leaf('tiltturn', { hinge: 'left' }) },
    { name: 'TOP HUNG', system: OP, color: 'white', w: 600, h: 450, root: leaf('tophung') },
    { name: 'BIFOLD', system: OP, color: 'white', w: 2400, h: 2100, root: leaf('bifold', { sashes: 4 }) },
    {
      name: 'TOP VENT OP-FIX',
      system: OP,
      color: 'white',
      w: 1500,
      h: 1500,
      root: split('h', [450, 1050], [split('v', [750, 750], [leaf('tophung'), leaf('tophung')]), split('v', [450, 600, 450], [leaf('fixed'), leaf('casement', { hinge: 'right' }), leaf('fixed')])]),
    },
  ];
}

const getSettingRaw = (key) => get('SELECT value FROM settings WHERE key = ?', key)?.value;
const CATALOG_VERSION = 3;

function itemExtra(it) {
  const extra = {};
  if (it.variants) extra.variants = it.variants;
  if (it.hw_color) extra.hw_color = it.hw_color;
  return JSON.stringify(extra);
}

/** One-off upgrades for databases created by an earlier catalog version. */
function migrateCatalog(fromVersion) {
  if (fromVersion < 2) {
    // White profile rates and white/brown hardware variants from the EvA price lists.
    const white = { 'PS62-UF-01': 296.64, 'PS62-US-03': 267.48, 'PA62-UB-03': 80.33 };
    for (const [code, rate] of Object.entries(white)) run('UPDATE items SET rate = ? WHERE code = ?', rate, code);
    for (const it of ITEMS) run('UPDATE items SET extra = ? WHERE code = ?', itemExtra(it), it.code);
    for (const c of COLORS) run('UPDATE colors SET hw_color = ? WHERE id = ?', c.hw_color || 'BROWN', c.id);
    // Add the "Extra Charges" head to untouched default price structures.
    for (const ps of PRICE_STRUCTURES) {
      const row = get('SELECT * FROM price_structures WHERE name = ?', ps.name === 'Commercial Projects' ? 'Builder Projects' : ps.name);
      if (row && !String(row.cost_heads).includes('Extra Charges')) {
        run('UPDATE price_structures SET name = ?, cost_heads = ? WHERE id = ?', ps.name, JSON.stringify(ps.cost_heads), row.id);
      }
    }
    // Company defaults: fill in fields that did not exist before (bank details, letter, warranty …).
    const company = get("SELECT value FROM settings WHERE key = 'company'");
    if (company) {
      const cur = JSON.parse(company.value);
      const next = { ...DEFAULT_COMPANY, ...cur, bank: { ...DEFAULT_COMPANY.bank, ...cur.bank } };
      if (!cur.bank?.accountNo) next.bank.accountNo = DEFAULT_COMPANY.bank.accountNo;
      if (!cur.bank?.ifsc) next.bank.ifsc = DEFAULT_COMPANY.bank.ifsc;
      if (!cur.letter) {
        next.terms = DEFAULT_COMPANY.terms;
        next.paymentTerms = DEFAULT_COMPANY.paymentTerms;
        next.prerequisites = DEFAULT_COMPANY.prerequisites;
        next.warranty = DEFAULT_COMPANY.warranty;
      }
      setSetting('company', next);
    }
  }
}

export function seedMasters() {
  tx(() => {
    // Masters are inserted only when missing so edits made in the app are never overwritten.
    COLORS.forEach((c, i) =>
      run(
        'INSERT OR IGNORE INTO colors (id, name, inside, outside, hex_in, hex_out, suffix, laminated, sort, hw_color) VALUES (?,?,?,?,?,?,?,?,?,?)',
        c.id, c.name, c.inside, c.outside, c.hex_in, c.hex_out, c.suffix, c.laminated, i, c.hw_color || 'BROWN',
      ),
    );
    GLASSES.forEach((g, i) =>
      run('INSERT OR IGNORE INTO glasses (id, code, name, thickness, rate, kind, sort) VALUES (?,?,?,?,?,?,?)', g.id, g.code, g.name, g.thickness, g.rate, g.kind, i),
    );
    ITEMS.forEach((it, i) =>
      run(
        `INSERT OR IGNORE INTO items (code, name, category, grp, unit, rate, rate_lam, color_variant, bar_length, weight, sort, extra, brand, rm_category)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        it.code, it.name, it.category, it.grp, it.unit, it.rate, it.rate_lam ?? null, it.color_variant ? 1 : 0, it.bar_length ?? null, it.weight ?? 0, i, itemExtra(it),
        it.category === 'reinforcement' ? 'PROMINANCE RI' : it.category === 'hardware' ? 'PROMINANCE HW' : 'PROMINANCE',
        it.rm_category || it.grp.toUpperCase(),
      ),
    );
    // Systems are not user-editable, so keep them in sync with the catalog.
    SYSTEMS.forEach((s) =>
      run('INSERT OR IGNORE INTO systems (id, brand, name, type, roles, limits) VALUES (?,?,?,?,?,?)', s.id, s.brand, s.name, s.type, JSON.stringify(s.roles), JSON.stringify(s.limits)),
    );
    const version = Number(get("SELECT value FROM settings WHERE key = 'catalogVersion'")?.value || 0);
    const freshCatalog = !get('SELECT id FROM price_structures LIMIT 1');
    if (!freshCatalog && version < CATALOG_VERSION) migrateCatalog(version);
    setSetting('catalogVersion', CATALOG_VERSION);
    for (const ps of PRICE_STRUCTURES) {
      const exists = get('SELECT id FROM price_structures WHERE name = ?', ps.name);
      if (!exists) run('INSERT INTO price_structures (name, cost_heads) VALUES (?, ?)', ps.name, JSON.stringify(ps.cost_heads));
    }
    if (!getSettingRaw('defaultPriceStructure')) {
      const retail = get("SELECT id FROM price_structures WHERE name = 'Retail Projects'");
      if (retail) setSetting('defaultPriceStructure', retail.id);
    }
    // Every opportunity has exactly one default quote (older databases had none flagged).
    run(`UPDATE quotes SET is_default = 1 WHERE id IN (SELECT MIN(id) FROM quotes GROUP BY opportunity_id)
         AND opportunity_id NOT IN (SELECT opportunity_id FROM quotes WHERE is_default = 1)`);
    for (const [type, values] of Object.entries(DEFAULT_LOOKUPS)) {
      if (get('SELECT value FROM lookups WHERE type = ? LIMIT 1', type)) continue;
      values.forEach((v, i) => run('INSERT OR IGNORE INTO lookups (type, value, sort) VALUES (?,?,?)', type, v, i));
    }
    for (const [name, perms] of Object.entries(DEFAULT_ROLES)) {
      run('INSERT OR IGNORE INTO roles (name, permissions) VALUES (?, ?)', name, JSON.stringify(perms));
    }
    const levels = [
      ['profile', 'Default Profile Rate'],
      ['reinforcement', 'Default RI Rate'],
      ['hardware', 'Default HW Rate'],
      ['glass', 'Default Glass Rate'],
    ];
    for (const [category, name] of levels) {
      if (!get('SELECT id FROM price_levels WHERE category = ? AND is_default = 1', category)) {
        run('INSERT OR IGNORE INTO price_levels (category, name, is_default) VALUES (?,?,1)', category, name);
      }
    }
    for (const c of [
      ['CHENNAI', 'TAMILNADU'],
      ['PONDICHERRY', 'PUDUCHERRY'],
      ['santhome', 'TAMILNADU'],
      ['KRISHNAGIRI', 'TAMILNADU'],
      ['KANCHEEPURAM', 'TAMILNADU'],
      ['CHENGALPATTU', 'TAMILNADU'],
      ['TIRUVALLUR', 'TAMILNADU'],
      ['VELLORE', 'TAMILNADU'],
      ['COIMBATORE', 'TAMILNADU'],
      ['BENGALURU', 'KARNATAKA'],
    ]) {
      run('INSERT OR IGNORE INTO cities (name, state, country) VALUES (?, ?, ?)', c[0], c[1], 'INDIA');
    }
    if (!get("SELECT key FROM settings WHERE key = 'company'")) setSetting('company', DEFAULT_COMPANY);
    if (!get("SELECT key FROM settings WHERE key = 'banner'"))
      setSetting('banner', { enabled: false, message: '' });
    if (!get('SELECT id FROM library_designs LIMIT 1')) {
      for (const d of libraryDefinitions()) {
        run(
          'INSERT INTO library_designs (name, system_id, color_id, glass_id, data, created_at) VALUES (?,?,?,?,?,?)',
          d.name, d.system, d.color, 'g4-pinhead', JSON.stringify({ width: d.w, height: d.h, floorAperture: 900, root: d.root }), new Date().toISOString(),
        );
      }
    }
  });
}

export function seedAdmin() {
  if (get('SELECT id FROM users WHERE email = ?', ADMIN_EMAIL)) return;
  const { hash, salt } = hashPassword(ADMIN_PASSWORD);
  run(
    'INSERT INTO users (name, email, password_hash, salt, role, team, phone, created_at) VALUES (?,?,?,?,?,?,?,?)',
    'TITANS WINDOWS', ADMIN_EMAIL, hash, salt, 'admin', null, '+91 8778623728', new Date().toISOString(),
  );
}

export function wipe() {
  db.exec(`
    DELETE FROM smart_quotes; DELETE FROM documents; DELETE FROM designs; DELETE FROM quotes; DELETE FROM opportunities;
    DELETE FROM library_designs; DELETE FROM sessions; DELETE FROM password_resets; DELETE FROM favourite_reports; DELETE FROM users;
    DELETE FROM price_structures; DELETE FROM items; DELETE FROM systems; DELETE FROM colors; DELETE FROM glasses; DELETE FROM cities;
    DELETE FROM level_prices; DELETE FROM price_levels; DELETE FROM lookups; DELETE FROM roles; DELETE FROM touchpoints; DELETE FROM saved_views;
    DELETE FROM counters; DELETE FROM settings; DELETE FROM contacts; DELETE FROM quote_items;
  `);
}

/** Called on server start: seeds master data and the admin login on a brand new database. */
export function ensureSeeded() {
  const fresh = !get('SELECT id FROM users LIMIT 1');
  seedMasters();
  seedAdmin();
  return fresh;
}

// Accounts the old demo generator created; removed by clearBusinessData().
const DEMO_USER_EMAILS = ['karthik@titanswindows.in', 'priya@titanswindows.in'];
const tableExists = (name) => !!get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", name);

/**
 * Remove every opportunity, quote, design and related record (and the old demo users) while keeping
 * master data, rates, price levels, library designs, company settings and real user accounts.
 * Quote and project numbering restart from the beginning.
 */
export function clearBusinessData() {
  tx(() => {
    for (const t of ['smart_quotes', 'documents', 'touchpoints', 'designs', 'quotes', 'opportunities', 'contacts', 'saved_views', 'password_resets']) {
      if (tableExists(t)) run(`DELETE FROM ${t}`);
    }
    run("DELETE FROM counters WHERE name IN ('quote', 'project')");
    for (const email of DEMO_USER_EMAILS) {
      const u = get('SELECT id FROM users WHERE email = ?', email);
      if (!u) continue;
      run('DELETE FROM sessions WHERE user_id = ?', u.id);
      run('DELETE FROM favourite_reports WHERE user_id = ?', u.id);
      run('DELETE FROM users WHERE id = ?', u.id);
    }
    const banner = get("SELECT value FROM settings WHERE key = 'banner'");
    if (banner && /scheduled maintenance on 03 October 2026/.test(banner.value)) setSetting('banner', { enabled: false, message: '' });
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const mode = process.argv.includes('--clear-data') ? 'clear-data' : 'clean';
  if (mode === 'clear-data') {
    clearBusinessData();
  } else {
    wipe();
    seedMasters();
    seedAdmin();
  }
  const counts = {
    opportunities: get('SELECT COUNT(*) c FROM opportunities').c,
    quotes: get('SELECT COUNT(*) c FROM quotes').c,
    designs: get('SELECT COUNT(*) c FROM designs').c,
    library: get('SELECT COUNT(*) c FROM library_designs').c,
  };
  console.log(mode === 'clear-data' ? 'Business data cleared (masters and settings kept).' : 'Database reset to master data.', counts);
  console.log(`Login: ${ADMIN_EMAIL} / ${PASSWORD_HINT}`);
}
