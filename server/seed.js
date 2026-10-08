import { db, all, get, run, tx, setSetting, nextCounter } from './db.js';
import { hashPassword } from './auth.js';
import { COLORS, GLASSES, ITEMS, SYSTEMS, PRICE_STRUCTURES, DEFAULT_COMPANY, DEFAULT_LOOKUPS, DEFAULT_ROLES } from './engine/catalog.js';
import { calculateQuote } from './engine/quoteCalc.js';
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
      run('INSERT OR REPLACE INTO systems (id, brand, name, type, roles, limits) VALUES (?,?,?,?,?,?)', s.id, s.brand, s.name, s.type, JSON.stringify(s.roles), JSON.stringify(s.limits)),
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
      setSetting('banner', {
        enabled: true,
        message:
          'Our app will undergo scheduled maintenance on 03 October 2026 - Saturday from 15:00 UTC to 18:29 UTC (20:30 IST to 23:59 IST). We apologize for any inconvenience caused.',
      });
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

// ---------------- demo data ----------------
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VIDEO_NAMES = [
  'SY INTERIOR', 'JENIFERRAJ', 'YUVARAJ MOGAPPAIR', 'THIAGAR', 'Mohan Mangadu', 'SUGANYA SURESH PERAMBUR', 'Venkatesan Mathi',
  'SHANKAR POONAMALLEE', 'SATHISH', 'Kesavan', 'SUNDHAR MOGAPPAIR', 'LAKSHMIPATHI THIRUTANI', 'VIJAY KRISHNARAJ', 'NALINI ALAPAKKAM',
  'PREETHI AVADI', 'ASHOCK NAZARATHPETTAI', 'RAVIKUMAR', 'BABU KANCHEEPURAM', 'SURESH VELACHERRY', 'KESAVAN KANCHEEPURAM', 'IMRAN KHAN',
  'Pankaj Sharma', 'Vincent Karupaiklam', 'Ganapathy', 'SURESH',
];
const FIRST = ['Arun', 'Bala', 'Chandran', 'Deepak', 'Elango', 'Ganesh', 'Hari', 'Iniyan', 'Jagan', 'Karthik', 'Lokesh', 'Murali', 'Naveen', 'Prakash', 'Rajesh', 'Saravanan', 'Senthil', 'Tamil', 'Udhay', 'Vignesh', 'Anitha', 'Bhuvana', 'Divya', 'Geetha', 'Kavitha', 'Lavanya', 'Meena', 'Nithya', 'Priya', 'Revathi', 'Sangeetha', 'Uma', 'Vasanthi', 'Mohammed', 'Abdul', 'Joseph', 'Antony', 'Ramesh', 'Selvam', 'Kumar'];
const AREAS = ['ANNA NAGAR', 'PORUR', 'TAMBARAM', 'VELACHERRY', 'ADYAR', 'AVADI', 'AMBATTUR', 'MOGAPPAIR', 'POONAMALLEE', 'MANGADU', 'KOLATHUR', 'PALLAVARAM', 'MEDAVAKKAM', 'PERUNGUDI', 'ECR', 'OMR', 'KK NAGAR', 'T NAGAR', 'VALASARAVAKKAM', 'IYYAPPANTHANGAL', 'KUNDRATHUR', 'THIRUVERKADU', 'MADIPAKKAM', 'CHROMEPET'];
const STAGES_ACTIVE = ['Enquiry', 'Enquiry', 'Enquiry', 'Site Visit', 'Measurement', 'Quoted', 'Negotiation'];
const SOURCES = ['Reference', 'Reference', 'Reference', 'Facebook', 'Website Feedback', 'Resales', 'Dealer', 'Instagram', 'Google', 'Walk-in', 'Architect'];
const CATEGORIES = ['Residential', 'Residential', 'Villa', 'Apartment', 'Commercial', 'Renovation'];
const LOST = ['Price too high', 'Chose competitor', 'Project postponed', 'No response from customer', 'Went with aluminium', 'Budget constraints'];

export function seedDemo() {
  const rnd = mulberry32(20261003);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const int = (a, b) => Math.floor(a + rnd() * (b - a + 1));

  // sales executives
  const execs = [
    ['KARTHIK R', 'karthik@titanswindows.in', 'Chennai Sales'],
    ['PRIYA S', 'priya@titanswindows.in', 'Chennai Sales'],
  ];
  for (const [name, email, team] of execs) {
    if (!get('SELECT id FROM users WHERE email = ?', email)) {
      const { hash, salt } = hashPassword(ADMIN_PASSWORD);
      run('INSERT INTO users (name, email, password_hash, salt, role, team, created_at) VALUES (?,?,?,?,?,?,?)', name, email, hash, salt, 'sales', team, new Date().toISOString());
    }
  }
  const managers = ['TITANS WINDOWS', 'TITANS WINDOWS', 'TITANS WINDOWS', 'TITANS WINDOWS', 'KARTHIK R', 'PRIYA S'];
  const library = all('SELECT * FROM library_designs');
  const retail = get("SELECT * FROM price_structures WHERE name = 'Retail Projects'");
  const company = { quotePrefix: 'TIT-QT-', projectPrefix: 'TIT-CH-' };

  const now = Date.now();
  const DAY = 864e5;
  const records = [];
  // 25 most recent opportunities exactly as in the reference list (newest first)
  VIDEO_NAMES.forEach((name, i) => records.push({ name, daysAgo: i * 0.55 + rnd() * 0.4, status: 'active', city: 'CHENNAI' }));
  // the rest of the last 90 days
  for (let i = 0; i < 360; i++) {
    const daysAgo = 14 + rnd() * 76;
    const r = rnd();
    const status = r < 0.025 ? 'won' : r < 0.045 ? 'lost' : 'active';
    records.push({ name: `${pick(FIRST)} ${pick(AREAS)}`.toUpperCase(), daysAgo, status });
  }
  // older history
  for (let i = 0; i < 140; i++) {
    const daysAgo = 91 + rnd() * 400;
    const r = rnd();
    const status = r < 0.3 ? 'won' : r < 0.5 ? 'lost' : 'active';
    records.push({ name: `${pick(FIRST)} ${pick(AREAS)}`.toUpperCase(), daysAgo, status });
  }
  records.sort((a, b) => b.daysAgo - a.daysAgo);

  tx(() => {
    for (const rec of records) {
      const created = new Date(now - rec.daysAgo * DAY);
      const createdISO = created.toISOString();
      const parts = rec.name.split(' ');
      const first = parts[0];
      const last = parts.slice(1).join(' ');
      const randomCity = rnd() < 0.92 ? 'CHENNAI' : pick(['KANCHEEPURAM', 'CHENGALPATTU', 'TIRUVALLUR', 'PONDICHERRY']);
      const city = rec.city || randomCity;
      const state = city === 'PONDICHERRY' ? 'PUDUCHERRY' : 'TAMILNADU';
      const estValue = Math.round((40000 + rnd() * 160000) / 100) * 100 + int(0, 99) / 100;
      const stage = rec.status === 'won' ? 'Won' : rec.status === 'lost' ? 'Lost' : pick(STAGES_ACTIVE);
      const seq = nextCounter('project', 3000);
      const code = `${company.projectPrefix}${String(seq).padStart(8, '0')}`;
      const statusChanged = rec.status === 'active' ? null : new Date(created.getTime() + int(3, 20) * DAY).toISOString();
      const oppId = Number(
        run(
          `INSERT INTO opportunities (code, project_name, salutation, first_name, last_name, phone_code, phone, email, note, address1, address2, pincode, city, state, country,
            site_location, lat, lng, bill_to, marketing_partner, managed_by, stage, source, est_value, category, closure_date, supply_start, supply_end, personnel, status,
            lost_reason, status_changed_at, created_by, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          code, rec.name, rnd() < 0.85 ? 'Mr.' : 'Mrs.', first, last, '+91', `${pick(['9', '8', '7', '6'])}${String(int(100000000, 999999999))}`, null, null,
          `${int(1, 120)}, ${pick(AREAS)} MAIN ROAD`, null, String(600000 + int(1, 130)), city, state, 'INDIA',
          null, 13.0827 + (rnd() - 0.5) * 0.25, 80.2707 + (rnd() - 0.5) * 0.25, null, null, pick(managers), stage, pick(SOURCES),
          estValue, pick(CATEGORIES), null, null, null, '[]', rec.status, rec.status === 'lost' ? pick(LOST) : null, statusChanged, 1, createdISO, createdISO,
        ).lastInsertRowid,
      );
      const qseq = nextCounter('quote', 3000);
      const quoteCreated = new Date(created.getTime() + rnd() * 2 * DAY);
      const quoteId = Number(
        run(
          `INSERT INTO quotes (opportunity_id, quote_no, alias, price_structure_id, price_structure_name, cost_heads, rate_overrides, defaults, created_at, updated_at, is_default, revision_no)
           VALUES (?,?,?,?,?,?,?,?,?,?,1,1)`,
          oppId, `${company.quotePrefix}${String(qseq).padStart(8, '0')}`, 'A', retail.id, retail.name, retail.cost_heads, '{}', '{}', quoteCreated.toISOString(), quoteCreated.toISOString(),
        ).lastInsertRowid,
      );
      const touches = rec.daysAgo < 30 ? int(0, 3) : int(0, 1);
      for (let t = 0; t < touches; t++) {
        const at = new Date(created.getTime() + rnd() * Math.max(0.2, rec.daysAgo - 0.1) * DAY);
        run(
          'INSERT INTO touchpoints (opportunity_id, kind, note, contacted_at, user_id, created_at) VALUES (?,?,?,?,?,?)',
          oppId, pick(['Call', 'Site visit', 'WhatsApp', 'Meeting']), pick(['Discussed sizes', 'Shared quotation', 'Customer asked for revision', 'Follow up next week', null]), at.toISOString(), 1, at.toISOString(),
        );
      }
      const hasDesigns = rec.status !== 'active' ? rnd() < 0.85 : rec.daysAgo < 14 ? false : rnd() < 0.3;
      if (hasDesigns) {
        const n = int(1, 5);
        for (let k = 0; k < n; k++) {
          const lib = pick(library);
          const data = JSON.parse(lib.data);
          const scale = 0.8 + rnd() * 0.5;
          data.width = Math.round((data.width * scale) / 10) * 10;
          data.height = Math.round((data.height * (0.85 + rnd() * 0.3)) / 10) * 10;
          run(
            `INSERT INTO designs (quote_id, ref, qty, name, location, floor, note, system_id, color_id, glass_id, data, sort, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            quoteId, `W${k + 1}`, int(1, 4), lib.name, pick(['BEDROOM', 'HALL', 'KITCHEN', 'BATHROOM', 'BALCONY', 'STAIRCASE', '']), pick(['GF', 'FF', 'SF', '']), null,
            lib.system_id, rnd() < 0.6 ? lib.color_id : pick(['white', 'walnut', 'golden-oak', 'mahogany']), 'g4-pinhead', JSON.stringify(data), k, quoteCreated.toISOString(), quoteCreated.toISOString(),
          );
        }
        calculateQuote(quoteId);
        if (rnd() < 0.18) {
          // A revised copy of the quote, as customers often ask for changes.
          const title = pick(['sliding', 'Colour', 'WITHOUT MESH', 'REVISED', 'As per site rough measurement', 'MH', 'With top fix']);
          const revSeq = nextCounter('quote', 3000);
          const revCreated = new Date(quoteCreated.getTime() + int(1, 5) * DAY).toISOString();
          const revId = Number(
            run(
              `INSERT INTO quotes (opportunity_id, quote_no, alias, price_structure_id, price_structure_name, cost_heads, rate_overrides, defaults, created_at, updated_at, is_default, revision_no, revision_title, parent_quote_id)
               VALUES (?,?,?,?,?,?,?,?,?,?,0,2,?,?)`,
              oppId, `${company.quotePrefix}${String(revSeq).padStart(8, '0')}`, 'B', retail.id, retail.name, retail.cost_heads, '{}', '{}', revCreated, revCreated, title, quoteId,
            ).lastInsertRowid,
          );
          for (const d of all('SELECT * FROM designs WHERE quote_id = ?', quoteId)) {
            run(
              `INSERT INTO designs (quote_id, ref, qty, name, location, floor, note, system_id, color_id, glass_id, data, sort, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              revId, d.ref, d.qty, d.name, d.location, d.floor, d.note, d.system_id, title === 'Colour' ? 'golden-oak' : d.color_id, d.glass_id, d.data, d.sort, revCreated, revCreated,
            );
          }
          calculateQuote(revId);
        }
        if (rnd() < 0.35) {
          const views = int(0, 9);
          run(
            'INSERT INTO smart_quotes (quote_id, token, views, last_viewed_at, created_at) VALUES (?,?,?,?,?)',
            quoteId, `sq${quoteId}${Math.floor(rnd() * 1e9).toString(36)}`, views, views ? new Date(quoteCreated.getTime() + int(1, 6) * DAY).toISOString() : null, quoteCreated.toISOString(),
          );
        }
      }
    }
  });
}

export function wipe() {
  db.exec(`
    DELETE FROM smart_quotes; DELETE FROM documents; DELETE FROM designs; DELETE FROM quotes; DELETE FROM opportunities;
    DELETE FROM library_designs; DELETE FROM sessions; DELETE FROM password_resets; DELETE FROM favourite_reports; DELETE FROM users;
    DELETE FROM price_structures; DELETE FROM items; DELETE FROM systems; DELETE FROM colors; DELETE FROM glasses; DELETE FROM cities;
    DELETE FROM level_prices; DELETE FROM price_levels; DELETE FROM lookups; DELETE FROM roles; DELETE FROM touchpoints; DELETE FROM saved_views;
    DELETE FROM counters; DELETE FROM settings;
  `);
}

/** Called on server start: seeds masters (and demo data on a brand new database). */
export function ensureSeeded() {
  const fresh = !get('SELECT id FROM users LIMIT 1');
  seedMasters();
  seedAdmin();
  if (fresh && process.env.TITANS_NO_DEMO !== '1') seedDemo();
  return fresh;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const mode = process.argv.includes('--clean') ? 'clean' : 'demo';
  wipe();
  seedMasters();
  seedAdmin();
  if (mode === 'demo') seedDemo();
  const counts = {
    opportunities: get('SELECT COUNT(*) c FROM opportunities').c,
    quotes: get('SELECT COUNT(*) c FROM quotes').c,
    designs: get('SELECT COUNT(*) c FROM designs').c,
    library: get('SELECT COUNT(*) c FROM library_designs').c,
  };
  console.log(`Database reset (${mode}).`, counts);
  console.log(`Login: ${ADMIN_EMAIL} / ${PASSWORD_HINT}`);
}
