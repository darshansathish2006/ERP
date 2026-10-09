import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');
export const DATA_DIR = process.env.TITANS_DATA_DIR || path.join(ROOT_DIR, 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const DB_PATH = path.join(DATA_DIR, 'titans.db');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  team TEXT,
  phone TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS password_resets (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS counters (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  state TEXT NOT NULL DEFAULT 'TAMILNADU',
  country TEXT NOT NULL DEFAULT 'INDIA'
);
CREATE TABLE IF NOT EXISTS colors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  inside TEXT NOT NULL,
  outside TEXT NOT NULL,
  hex_in TEXT NOT NULL,
  hex_out TEXT NOT NULL,
  suffix TEXT NOT NULL DEFAULT '',
  laminated INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS glasses (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  thickness REAL NOT NULL DEFAULT 4,
  rate REAL NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'glass',
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS systems (
  id TEXT PRIMARY KEY,
  brand TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  roles TEXT NOT NULL,
  limits TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS items (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  grp TEXT NOT NULL,
  unit TEXT NOT NULL,
  rate REAL NOT NULL DEFAULT 0,
  rate_lam REAL,
  color_variant INTEGER NOT NULL DEFAULT 0,
  bar_length REAL,
  weight REAL NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS price_structures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  cost_heads TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS opportunities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  project_name TEXT NOT NULL,
  salutation TEXT NOT NULL DEFAULT 'Mr.',
  first_name TEXT NOT NULL,
  last_name TEXT,
  phone_code TEXT NOT NULL DEFAULT '+91',
  phone TEXT NOT NULL,
  email TEXT,
  note TEXT,
  address1 TEXT,
  address2 TEXT,
  pincode TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  country TEXT,
  site_location TEXT,
  lat REAL,
  lng REAL,
  bill_to TEXT,
  marketing_partner TEXT,
  managed_by TEXT NOT NULL,
  stage TEXT NOT NULL,
  source TEXT NOT NULL,
  est_value REAL,
  category TEXT,
  closure_date TEXT,
  supply_start TEXT,
  supply_end TEXT,
  personnel TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active',
  lost_reason TEXT,
  status_changed_at TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  quote_no TEXT NOT NULL UNIQUE,
  alias TEXT NOT NULL DEFAULT 'A',
  price_structure_id INTEGER,
  price_structure_name TEXT,
  cost_heads TEXT NOT NULL,
  rate_overrides TEXT NOT NULL DEFAULT '{}',
  defaults TEXT NOT NULL DEFAULT '{}',
  remarks TEXT,
  total_qty INTEGER NOT NULL DEFAULT 0,
  total_area REAL NOT NULL DEFAULT 0,
  basic_total REAL NOT NULL DEFAULT 0,
  grand_total REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS designs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  ref TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  name TEXT,
  location TEXT,
  floor TEXT,
  note TEXT,
  system_id TEXT NOT NULL,
  color_id TEXT NOT NULL,
  glass_id TEXT NOT NULL,
  data TEXT NOT NULL,
  calc_type TEXT NOT NULL DEFAULT 'auto',
  manual_sqft_rate REAL,
  addons TEXT NOT NULL DEFAULT '[]',
  sort INTEGER NOT NULL DEFAULT 0,
  unit_price REAL NOT NULL DEFAULT 0,
  total_price REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS library_designs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  system_id TEXT NOT NULL,
  color_id TEXT NOT NULL,
  glass_id TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  stored_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'General',
  uploaded_by INTEGER,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS smart_quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  views INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS favourite_reports (
  user_id INTEGER NOT NULL,
  report TEXT NOT NULL,
  PRIMARY KEY (user_id, report)
);
CREATE INDEX IF NOT EXISTS idx_opp_status ON opportunities(status);
CREATE INDEX IF NOT EXISTS idx_opp_created ON opportunities(created_at);
CREATE INDEX IF NOT EXISTS idx_quotes_opp ON quotes(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_designs_quote ON designs(quote_id);
`;

db.exec(SCHEMA);

const SCHEMA_V2 = `
CREATE TABLE IF NOT EXISTS price_levels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (category, name)
);
CREATE TABLE IF NOT EXISTS level_prices (
  level_id INTEGER NOT NULL REFERENCES price_levels(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  rate REAL NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (level_id, code)
);
CREATE TABLE IF NOT EXISTS lookups (
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}',
  sort INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (type, value)
);
CREATE TABLE IF NOT EXISTS roles (
  name TEXT PRIMARY KEY,
  permissions TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS touchpoints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  note TEXT,
  contacted_at TEXT NOT NULL,
  user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_touch_opp ON touchpoints(opportunity_id);
CREATE TABLE IF NOT EXISTS saved_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  page TEXT NOT NULL,
  name TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;
db.exec(SCHEMA_V2);

// Custom entries: lines added to a quote's rate pages, and standalone contacts.
const SCHEMA_V3 = `
CREATE TABLE IF NOT EXISTS quote_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  code TEXT,
  name TEXT NOT NULL,
  color TEXT,
  unit TEXT NOT NULL DEFAULT 'Pcs',
  qty REAL NOT NULL DEFAULT 1,
  rate REAL NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_items(quote_id);
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  salutation TEXT NOT NULL DEFAULT 'Mr.',
  first_name TEXT NOT NULL,
  last_name TEXT,
  phone_code TEXT NOT NULL DEFAULT '+91',
  phone TEXT NOT NULL,
  email TEXT,
  company TEXT,
  designation TEXT,
  city TEXT,
  state TEXT,
  address TEXT,
  note TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
`;
db.exec(SCHEMA_V3);

/** Add a column to an existing table if it is missing (idempotent migration helper). */
function addColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}
addColumn('quotes', 'parent_quote_id', 'INTEGER');
addColumn('quotes', 'revision_no', 'INTEGER NOT NULL DEFAULT 1');
addColumn('quotes', 'revision_title', 'TEXT');
addColumn('quotes', 'is_default', 'INTEGER NOT NULL DEFAULT 0');
addColumn('quotes', 'price_levels', "TEXT NOT NULL DEFAULT '{}'");
addColumn('items', 'extra', "TEXT NOT NULL DEFAULT '{}'");
addColumn('items', 'brand', 'TEXT');
addColumn('items', 'rm_category', 'TEXT');
addColumn('items', 'active', 'INTEGER NOT NULL DEFAULT 1');
addColumn('glasses', 'supplier', 'TEXT');
addColumn('colors', 'hw_color', "TEXT NOT NULL DEFAULT 'BROWN'");
addColumn('opportunities', 'account', 'TEXT');
addColumn('opportunities', 'tags', "TEXT NOT NULL DEFAULT '[]'");
addColumn('opportunities', 'competitor', 'TEXT');
// guided tour progress per user: { finishedAt?, skippedAt?, done: string[] } – empty means a new user
addColumn('users', 'tour_state', "TEXT NOT NULL DEFAULT '{}'");

/** Run fn inside a transaction; rolls back on error. */
export function tx(fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function all(sql, ...params) {
  return db.prepare(sql).all(...params);
}
export function get(sql, ...params) {
  return db.prepare(sql).get(...params);
}
export function run(sql, ...params) {
  return db.prepare(sql).run(...params);
}

export function getSetting(key, fallback = null) {
  const row = get('SELECT value FROM settings WHERE key = ?', key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return fallback;
  }
}
export function setSetting(key, value) {
  run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    JSON.stringify(value),
  );
}

/** Atomically increments a named counter and returns the new value. */
export function nextCounter(name, start = 1) {
  const row = get('SELECT value FROM counters WHERE name = ?', name);
  if (!row) {
    run('INSERT INTO counters (name, value) VALUES (?, ?)', name, start);
    return start;
  }
  const value = Number(row.value) + 1;
  run('UPDATE counters SET value = ? WHERE name = ?', value, name);
  return value;
}

export function parseJSON(text, fallback) {
  if (text == null) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export function nowISO() {
  return new Date().toISOString();
}
