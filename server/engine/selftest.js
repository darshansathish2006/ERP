// Verifies the BOM + pricing engine against the reference quotation
// (W1 SL-SL 1500 x 1500, walnut, 4MM PINHEAD GLASS, PROMINANCE INVENTA SLIDING SERIES).
import assert from 'node:assert/strict';
import { COLORS, GLASSES, ITEMS, SYSTEMS, retailCostHeads } from './catalog.js';
import { computeBOM, optimiseBars, round } from './bom.js';
import { priceDesign } from './pricing.js';

const extraOf = (it) => ({ ...(it.variants ? { variants: it.variants } : {}), ...(it.hw_color ? { hw_color: it.hw_color } : {}) });
const items = new Map(ITEMS.map((it, i) => [it.code, { ...it, sort: i, extra: extraOf(it) }]));
const glasses = new Map(GLASSES.map((g) => [g.id, g]));
const system = SYSTEMS.find((s) => s.id === 'inventa-sliding');
const color = COLORS.find((c) => c.id === 'walnut');
const ctx = { system, color, items, glasses, defaultGlass: glasses.get('g4-pinhead'), rateOverrides: {} };

const design = { width: 1500, height: 1500, glassId: 'g4-pinhead', root: { id: 'r', kind: 'leaf', panel: 'sliding', sashes: 2, tracks: 2 } };
const bom = computeBOM(design, ctx);
const line = (code) => bom.lines.find((l) => l.code === code);

const expectQty = {
  'PS62-UF-01-WN': 6.02, 'PS62-US-03-WN': 8.648, 'PA62-UB-03-WN': 7.84, 'PS62-UO-05-WN': 2.824, PAM116: 2.788,
  'PR12-06B': 5.624, 'PR12-23': 7.6, 'PR-SWG': 4, 'PR-SSWP': 17.216, 'PR-GP1MM': 8, 'PR-GP2MM': 8, 'PR-TB': 4,
  'PR-4X16': 60, 'PR-JAS': 8, 'PR-BSSCREW': 2, 'PR-DAS': 4, 'PR-RS': 8, 'PR-SISCREW': 4, 'PR-SPLSCREW': 4, 'PR-SPLSSCREW': 4, 'PR-TBS': 4,
  'PR-STLS': 2, 'PR-BSB': 2, 'PPA-1128': 2, 'PR-FCB': 12, 'PR-N8X100': 6, 'PR-N8X80': 6, 'PR-DCFB': 2, 'PR-DCSB': 2,
  'PR-PP1MM': 4, 'PR-PP2MM': 28, 'PR-PP5MM': 24, 5210: 15.04, CG0004PH: 1.676, 'PPA-106-CS': 4, 'PR-STLLB': 1, 'PR-STLRB': 1,
};
for (const [code, qty] of Object.entries(expectQty)) {
  assert.ok(line(code), `missing BOM line ${code}`);
  assert.equal(round(line(code).qty, 3), qty, `qty for ${code}`);
}
assert.equal(round(line('PR-NEUTRAL').amount), 110.75);
assert.equal(round(line('PR-ACRYLIC').amount), 77.94);
assert.equal(round(bom.vars.UPVCPROFILECOST), 10966.63);
assert.equal(round(bom.vars.HWCOST), 807.87);
assert.equal(round(bom.vars.GLASSCOST), 722.36);
assert.equal(bom.areaSqft, 24.219);

const heads = retailCostHeads();
const auto = priceDesign(bom, heads, { calcType: 'auto', qty: 1 });
assert.equal(auto.basic.toFixed(2), '18406.99');
assert.equal(auto.grand.toFixed(2), '21720.25');
assert.equal(auto.sqftRate.toFixed(2), '760.02');

const manual = priceDesign(bom, heads, { calcType: 'manual', manualSqftRate: 700, qty: 1 });
const v = (name) => manual.heads.find((h) => h.name === name).value;
assert.equal(v('Basic Value').toFixed(2), '16953.30');
assert.equal(v('FREEZE RATE').toFixed(2), '-1453.69');
assert.equal(v('GST').toFixed(2), '3051.59');
assert.equal(manual.grand.toFixed(2), '20004.89');
assert.equal((manual.grand / bom.areaSqft).toFixed(2), '826.00');

// Profile BOQ: 8 standard bars, 43.8 m
const byCode = new Map();
for (const c of bom.cuts.filter((c) => c.category === 'profile' || c.category === 'aluminium')) {
  const arr = byCode.get(c.code) || [];
  for (let i = 0; i < c.qty; i++) arr.push(c.length);
  byCode.set(c.code, arr);
}
let pcs = 0;
let billing = 0;
for (const [code, cuts] of byCode) {
  const bar = items.get(bom.cuts.find((c) => c.code === code).baseCode).bar_length;
  const bars = optimiseBars(cuts, bar);
  pcs += bars.length;
  billing += bars.length * bar;
}
assert.equal(pcs, 8);
assert.equal(round(billing, 3), 43.8);

// ---- second reference: W1 SL-SL 1220 x 1220, WHITE (₹10,033.82) ----
const white = COLORS.find((c) => c.id === 'white');
const bomW = computeBOM({ width: 1220, height: 1220, glassId: 'g4-pinhead', root: { id: 'r', kind: 'leaf', panel: 'sliding', sashes: 2, tracks: 2 } }, { ...ctx, color: white });
const lineW = (code) => bomW.lines.find((l) => l.code === code);
const expectW = { 'PS62-UF-01': 4.9, 'PPA 106': 4, 'PR-STLL': 1, 'PR-STLR': 1, 'PR-BS': 1, 'PR-BSSCREW': 1, 'PR-FC': 12, 'PR-N8X100': 6, 'PR-N8X80': 6, 'PR-PP2MM': 28, 'PR-PP5MM': 24, 'PR-4X16': 48, 'PR-DCF': 2, 'PR-DCS': 2, 'PPA-112': 2, CG0004PH: 1.028 };
for (const [code, qty] of Object.entries(expectW)) {
  assert.ok(lineW(code), `missing white BOM line ${code}`);
  assert.equal(round(lineW(code).qty, 3), qty, `white qty for ${code}`);
}
assert.equal(bomW.areaSqft, 16.017);
assert.equal(round(bomW.vars.UPVCPROFILECOST), 3812.17);
assert.equal(round(bomW.vars.HWCOST), 846.37);
assert.equal(round(bomW.vars.GLASSCOST), 443.07);
const autoW = priceDesign(bomW, heads, { calcType: 'auto', qty: 1 });
assert.equal(autoW.basic.toFixed(2), '8503.24');
assert.equal(autoW.grand.toFixed(2), '10033.82');
const manualW = priceDesign(bomW, heads, { calcType: 'manual', manualSqftRate: 600, qty: 1 });
assert.equal(manualW.basic.toFixed(2), '9610.20');

console.log('Engine self-test passed:');
console.log(`  White 1220x1220: Basic ₹${autoW.basic.toFixed(2)}  Grand ₹${autoW.grand.toFixed(2)}  (₹${autoW.sqftRate.toFixed(2)}/sqft)`);
console.log(`  Basic ₹${auto.basic.toFixed(2)}  Grand ₹${auto.grand.toFixed(2)}  (₹${auto.sqftRate.toFixed(2)}/sqft)`);
console.log(`  Manual @700/sqft -> Basic ₹${v('Basic Value').toFixed(2)}  Freeze ₹${v('FREEZE RATE').toFixed(2)}  Grand ₹${manual.grand.toFixed(2)}`);
console.log(`  Profile BOQ: ${pcs} bars, ${billing.toFixed(3)} m; sash weights ${bom.sashes.map((s) => s.weight).join(', ')} kg`);
