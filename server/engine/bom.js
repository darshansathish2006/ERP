// Bill-of-materials engine.
// A design is { width, height, root } where root is a tree of
//   { kind: 'split', dir: 'v'|'h', sizes: number[], children: Node[] }   (dir 'v' = vertical mullions)
//   { kind: 'leaf', panel: PanelType, sashes?, tracks?, mesh?, hinge?, glassId? }
// All dimensions are in millimetres measured on the outer frame.

export const round = (v, dp = 2) => {
  const f = 10 ** dp;
  return Math.round((v + Number.EPSILON) * f) / f;
};
export const round3 = (v) => round(v, 3);

export const SQFT_PER_SQM = 10.7639;
const KERF = 4;
// Silicone cans: fitted to the EvA price lists (1500x1500 → 0.8204, 1220x1220 → 0.6672 cans).
const SILICONE_PER_METRE = 0.1367794;
const floor3 = (v) => Math.floor(v * 1000 + 1e-6) / 1000;
const GLASS_DENSITY = 2.5; // kg per m2 per mm thickness

export const SLIDING_PANELS = new Set(['sliding']);
export const CASEMENT_PANELS = new Set(['casement', 'tiltturn', 'tophung', 'bottomhung', 'twin', 'louver', 'fan', 'mesh', 'bifold']);

/** Walk the tree and return leaves with rects and mullions with their geometry. */
export function layout(design) {
  const leaves = [];
  const mullions = [];
  let leafNo = 0;
  const walk = (node, x, y, w, h, depth) => {
    if (!node) return;
    if (node.kind === 'split' && Array.isArray(node.children) && node.children.length) {
      const sizes = normaliseSizes(node.sizes, node.children.length, node.dir === 'v' ? w : h);
      let off = 0;
      node.children.forEach((child, i) => {
        const s = sizes[i];
        if (node.dir === 'v') walk(child, x + off, y, s, h, depth + 1);
        else walk(child, x, y + off, w, s, depth + 1);
        off += s;
        if (i < node.children.length - 1) {
          mullions.push(
            node.dir === 'v'
              ? { dir: 'v', x: x + off, y, length: h, nodeId: node.id, index: i }
              : { dir: 'h', x, y: y + off, length: w, nodeId: node.id, index: i },
          );
        }
      });
    } else {
      leafNo += 1;
      leaves.push({ node, no: leafNo, x, y, w, h, depth });
    }
  };
  walk(design.root, 0, 0, Number(design.width) || 0, Number(design.height) || 0, 0);
  mullions.forEach((m, i) => (m.label = `M${i + 1}`));
  return { leaves, mullions };
}

export function normaliseSizes(sizes, count, total) {
  let arr = Array.isArray(sizes) && sizes.length === count ? sizes.map((s) => Math.max(1, Number(s) || 0)) : null;
  if (!arr) arr = Array.from({ length: count }, () => total / count);
  const sum = arr.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - total) > 0.01 && sum > 0) arr = arr.map((s) => (s * total) / sum);
  return arr;
}

export function sashCount(leaf) {
  const n = leaf.panel;
  if (n === 'sliding' || n === 'monorail' || n === 'bifold') return Math.max(2, Math.min(8, Number(leaf.sashes) || 2));
  if (n === 'twin') return 2;
  if (['casement', 'tiltturn', 'tophung', 'bottomhung', 'mesh'].includes(n)) return 1;
  return 0;
}

/** Glazed panes for a leaf – used by drawing labels such as "(1,2) 4MM PINHEAD GLASS". */
export function paneCount(leaf) {
  const n = leaf.panel;
  if (n === 'mesh' || n === 'louver') return 0;
  if (n === 'fixed' || n === 'fan') return 1;
  return sashCount(leaf);
}

function makeAccumulator(ctx) {
  const lines = new Map();
  const cuts = [];
  const add = (code, qty, extra = {}) => {
    if (!code || !(qty > 0)) return;
    const prev = lines.get(code);
    if (prev) prev.raw += qty;
    else lines.set(code, { code, raw: qty, ...extra });
  };
  const cut = (role, lengthMm, count, angle, member) => {
    const code = ctx.system.roles[role];
    if (!code || !(lengthMm > 0) || !(count > 0)) return;
    add(code, (lengthMm * count) / 1000, { kind: 'length', role });
    cuts.push({ code, role, length: round(lengthMm, 1), qty: count, angle, member });
  };
  return { lines, cuts, add, cut };
}

/**
 * Compute the full bill of materials for one unit of a design.
 * ctx = { system, color, glasses: Map, items: Map, rateOverrides: {} , meshId }
 */
export function computeBOM(design, ctx) {
  const W = Number(design.width) || 0;
  const H = Number(design.height) || 0;
  const { leaves, mullions } = layout(design);
  const acc = makeAccumulator(ctx);
  const panes = [];
  const meshPanes = [];
  const sashes = [];
  const warnings = [];
  const glassFor = (leaf) => ctx.glasses.get(leaf.node.glassId) || ctx.glasses.get(design.glassId) || ctx.defaultGlass;
  const meshGlass = ctx.glasses.get(design.meshId) || ctx.glasses.get('mesh-ss');
  // RI screws: one every 250 mm plus one per reinforcement piece.
  let riScrews = 0;
  const ri = (role, lengthMm, count) => {
    if (!(lengthMm > 0)) return;
    acc.cut(role, lengthMm, count, '90°-90°', 'Reinforcement');
    riScrews += (Math.floor(lengthMm / 250) + 1) * count;
  };
  const glazing = (label, w, h, glass, leafNo) => {
    if (!(w > 0 && h > 0) || !glass) return 0;
    const area = floor3((w * h) / 1e6);
    panes.push({ label, leafNo, glassId: glass.id, code: glass.code, name: glass.name, w: round(w, 1), h: round(h, 1), area, thickness: glass.thickness });
    acc.add('GLASS:' + glass.id, area, { kind: 'glass', glass });
    return area;
  };
  const mesh = (label, w, h) => {
    if (!(w > 0 && h > 0) || !meshGlass) return;
    const area = round3((w * h) / 1e6);
    meshPanes.push({ label, w: round(w, 1), h: round(h, 1), area, name: meshGlass.name, code: meshGlass.code });
    acc.add('MESH:' + meshGlass.id, area, { kind: 'mesh', glass: meshGlass });
  };
  const profileWeight = (role) => ctx.items.get(ctx.system.roles[role])?.weight || 0;

  // ---------- frame ----------
  const usesThreeTrack = leaves.some((l) => l.node.panel === 'sliding' && (Number(l.node.tracks) === 3 || l.node.mesh));
  const frameRole = ctx.system.type === 'sliding' && usesThreeTrack ? 'frame3' : 'frame';
  acc.cut(frameRole, W + 5, 2, '45°-45°', 'Frame Top/Bottom');
  acc.cut(frameRole, H + 5, 2, '45°-45°', 'Frame Left/Right');
  ri('riFrame', W - 100, 2);
  ri('riFrame', H - 100, 2);

  // ---------- mullions ----------
  for (const m of mullions) {
    const len = m.length - 76;
    acc.cut('mullion', len, 1, '90°-90°', `Mullion ${m.label}`);
    ri('riMullion', len - 50, 1);
    acc.add('PR-MC', 2);
  }

  // ---------- leaves ----------
  let sashNo = 0;
  for (const leaf of leaves) {
    const { node } = leaf;
    const cw = leaf.w;
    const ch = leaf.h;
    const glass = glassFor(leaf);
    const panel = node.panel || 'fixed';

    const glassBeadCuts = (bw, bh, member) => {
      acc.cut('bead', bw, 2, '45°-45°', member);
      acc.cut('bead', bh, 2, '45°-45°', member);
      return 2 * (bw + bh);
    };

    if (panel === 'fixed' || panel === 'fan') {
      const beadPerim = glassBeadCuts(cw - 100, ch - 100, `Fixed Glass Bead P${leaf.no}`);
      acc.add('5210', (2 * (beadPerim - 160)) / 1000);
      glazing(`P${leaf.no}`, cw - 112, ch - 112, glass, leaf.no);
      acc.add('PR-GP1MM', 4);
      acc.add('PR-GP2MM', 4);
      if (panel === 'fan') acc.add('PR-FCO', 1);
    } else if (panel === 'sliding') {
      const n = sashCount(node);
      const sw = (cw - 44 + 44 * (n - 1)) / n;
      const sh = ch - 88;
      const tracks = node.mesh ? 3 : Math.max(2, Math.min(3, Number(node.tracks) || 2));
      for (let i = 0; i < n; i++) {
        sashNo += 1;
        const label = `S${sashNo}`;
        acc.cut('sash', sw, 2, '45°-45°', `Sash ${label}`);
        acc.cut('sash', sh, 2, '45°-45°', `Sash ${label}`);
        const bw = sw - 100;
        const bh = sh - 102;
        const beadPerim = glassBeadCuts(bw, bh, `Glass Bead ${label}`);
        const area = glazing(label, sw - 112, sh - 98, glass, leaf.no);
        ri('riSash', sh - 6, 2);
        ri('riFrame', sw - 250, 2);
        acc.add('PR-SSWP', (2 * (2 * (sw + sh) - 20)) / 1000);
        acc.add('5210', (2 * (beadPerim - 160)) / 1000);
        acc.add('PR-SWG', 2);
        acc.add('PR-RS', 4);
        acc.add('PR-JAS', 4);
        acc.add('PPA 106', 2);
        acc.add('PPA-112', 1);
        acc.add('PR-DAS', 2);
        acc.add('PR-TB', 2);
        acc.add('PR-TBS', 2);
        acc.add('PR-GP1MM', 4);
        acc.add('PR-GP2MM', 4);
        acc.add('PR-DCS', 1);
        const weight =
          ((2 * (sw + sh)) / 1000) * profileWeight('sash') +
          ((2 * (bw + bh)) / 1000) * profileWeight('bead') +
          ((2 * (sh - 6)) / 1000) * profileWeight('riSash') +
          ((2 * (sw - 250)) / 1000) * profileWeight('riFrame') +
          area * (glass?.thickness || 4) * GLASS_DENSITY;
        sashes.push({ label, leafNo: leaf.no, w: round(sw, 1), h: round(sh, 1), weight: round3(weight) });
        if (sw > ctx.system.limits.maxSashWidth) warnings.push(`Sash ${label} width ${round(sw, 0)}mm exceeds the system limit of ${ctx.system.limits.maxSashWidth}mm.`);
        if (sh > ctx.system.limits.maxSashHeight) warnings.push(`Sash ${label} height ${round(sh, 0)}mm exceeds the system limit of ${ctx.system.limits.maxSashHeight}mm.`);
      }
      const interlocks = 2 * (n - 1);
      acc.cut('interlock', sh, interlocks, '90°-90°', 'Interlock');
      acc.add('PR-SISCREW', 2 * interlocks);
      const locksLeft = Math.ceil(n / 2);
      const locksRight = Math.floor(n / 2);
      acc.add('PR-STLL', locksLeft);
      acc.add('PR-STLR', locksRight);
      // Bump stoppers: one per sash on wide sashes, one per pair on narrow ones.
      const bumpStoppers = sw > 700 ? n : Math.ceil(n / 2);
      acc.add('PR-BS', bumpStoppers);
      acc.add('PR-BSSCREW', bumpStoppers);
      acc.add('PR-STLS', n);
      acc.add('PR-SPLSCREW', 2 * (locksLeft + locksRight));
      acc.add('PR-SPLSSCREW', 2 * n);
      acc.cut('guideRail', cw - 106, tracks, '90°-90°', 'Guide Rail');
      if (node.mesh) {
        const meshW = sw;
        const meshH = sh;
        acc.cut('meshSash', meshW, 2, '45°-45°', 'Mesh Sash');
        acc.cut('meshSash', meshH, 2, '45°-45°', 'Mesh Sash');
        mesh(`MS${leaf.no}`, meshW - 60, meshH - 60);
        acc.add('PR-SWG', 2);
        acc.add('PR-RS', 4);
        acc.add('PR-SSWP', (2 * (meshW + meshH) - 20) / 1000);
        acc.add('PR-MSH', 1);
      }
    } else if (['casement', 'tiltturn', 'tophung', 'bottomhung', 'twin'].includes(panel)) {
      const twin = panel === 'twin';
      const count = twin ? 2 : 1;
      const sw = twin ? cw / 2 - 12 : cw - 24;
      const sh = ch - 24;
      for (let i = 0; i < count; i++) {
        sashNo += 1;
        const label = `S${sashNo}`;
        acc.cut('sash', sw, 2, '45°-45°', `Sash ${label}`);
        acc.cut('sash', sh, 2, '45°-45°', `Sash ${label}`);
        const bw = sw - 110;
        const bh = sh - 110;
        const beadPerim = glassBeadCuts(bw, bh, `Glass Bead ${label}`);
        const area = glazing(label, sw - 122, sh - 122, glass, leaf.no);
        ri('riSash', sw - 120, 2);
        ri('riSash', sh - 120, 2);
        acc.add('PR-EPDM', (2 * (sw + sh) - 100) / 1000);
        acc.add('5210', (2 * (beadPerim - 160)) / 1000);
        acc.add('PR-GP1MM', 4);
        acc.add('PR-GP2MM', 4);
        acc.add('PR-DCS', 1);
        if (panel === 'tiltturn') {
          acc.add('PR-TTK', 1);
          acc.add('PR-KEEP', 4);
        } else if (panel === 'tophung' || panel === 'bottomhung') {
          acc.add('PR-TS', 2);
          acc.add('PR-FSS', 12);
          acc.add('PR-KEEP', 2);
        } else {
          acc.add(sh > 900 ? 'PR-FS16' : 'PR-FS12', 1);
          acc.add('PR-FSS', 12);
          acc.add('PR-KEEP', sh > 900 ? 4 : 2);
        }
        const weight =
          ((2 * (sw + sh)) / 1000) * profileWeight('sash') +
          ((2 * (bw + bh)) / 1000) * profileWeight('bead') +
          ((2 * (sw + sh) - 480) / 1000) * profileWeight('riSash') +
          area * (glass?.thickness || 4) * GLASS_DENSITY;
        sashes.push({ label, leafNo: leaf.no, w: round(sw, 1), h: round(sh, 1), weight: round3(weight) });
        if (sw > ctx.system.limits.maxSashWidth) warnings.push(`Sash ${label} width ${round(sw, 0)}mm exceeds the system limit of ${ctx.system.limits.maxSashWidth}mm.`);
        if (sh > ctx.system.limits.maxSashHeight) warnings.push(`Sash ${label} height ${round(sh, 0)}mm exceeds the system limit of ${ctx.system.limits.maxSashHeight}mm.`);
      }
      acc.add('PR-CH', 1);
      acc.add('PR-HS', 2);
      if (sh > 900 && panel !== 'tiltturn') acc.add('PR-MPL', 1);
      if (twin) {
        acc.cut('floatingMullion', sh - 40, 1, '90°-90°', 'French Floating Mullion');
        acc.add('PR-FMB', 1);
      }
      if (node.mesh) {
        acc.cut('meshSash', sw, 2 * count, '45°-45°', 'Mesh Sash');
        acc.cut('meshSash', sh, 2 * count, '45°-45°', 'Mesh Sash');
        for (let i = 0; i < count; i++) mesh(`MS${leaf.no}.${i + 1}`, sw - 60, sh - 60);
        acc.add('PR-MSH', count);
      }
    } else if (panel === 'mesh') {
      sashNo += 1;
      const sw = cw - 24;
      const sh = ch - 24;
      acc.cut('meshSash', sw, 2, '45°-45°', `Mesh Sash S${sashNo}`);
      acc.cut('meshSash', sh, 2, '45°-45°', `Mesh Sash S${sashNo}`);
      mesh(`MS${leaf.no}`, sw - 60, sh - 60);
      acc.add('PR-MSH', 1);
      acc.add('PR-FS12', 1);
      acc.add('PR-FSS', 12);
      acc.add('PR-KEEP', 2);
    } else if (panel === 'louver') {
      const blades = Math.max(1, Math.floor((ch - 60) / 95));
      acc.cut('louverHolder', ch - 60, 2, '90°-90°', 'Louver Blade Holder');
      if (node.louverType === 'fixed-pvc') {
        acc.add('PR-LVPVC', ((cw - 90) * blades) / 1000);
      } else {
        const louverGlass = glass?.kind === 'louver' ? glass : ctx.glasses.get('louver-6') || glass;
        for (let b = 0; b < blades; b++) glazing(`L${leaf.no}.${b + 1}`, cw - 90, 100, louverGlass, leaf.no);
      }
      acc.add('PR-LVC', blades);
      if (node.louverType === 'movable-glass') acc.add('PR-MLS', 1);
    } else if (panel === 'monorail' || panel === 'bifold') {
      const n = sashCount(node);
      const sw = panel === 'monorail' ? (cw + 50 * (n - 1)) / n - 20 : (cw - 40) / n;
      const sh = ch - (panel === 'monorail' ? 70 : 60);
      acc.cut('monorail', cw - 40, 1, '90°-90°', panel === 'monorail' ? 'Monorail Track' : 'Bifold Top Track');
      for (let i = 0; i < n; i++) {
        sashNo += 1;
        const label = `S${sashNo}`;
        acc.cut('sash', sw, 2, '45°-45°', `Sash ${label}`);
        acc.cut('sash', sh, 2, '45°-45°', `Sash ${label}`);
        const bw = sw - 100;
        const bh = sh - 100;
        const beadPerim = glassBeadCuts(bw, bh, `Glass Bead ${label}`);
        const area = glazing(label, sw - 112, sh - 112, glass, leaf.no);
        ri('riSash', sh - 6, 2);
        acc.add('5210', (2 * (beadPerim - 160)) / 1000);
        acc.add('PR-GP1MM', 4);
        acc.add('PR-GP2MM', 4);
        if (panel === 'monorail') {
          acc.add('PR-MRR', 1);
          acc.add('PR-SSWP', (2 * (sw + sh) - 20) / 1000);
        } else {
          acc.add('PR-BFK', 1);
          acc.add('PR-EPDM', (2 * (sw + sh) - 100) / 1000);
        }
        const weight =
          ((2 * (sw + sh)) / 1000) * profileWeight('sash') + ((2 * (bw + bh)) / 1000) * profileWeight('bead') + area * (glass?.thickness || 4) * GLASS_DENSITY;
        sashes.push({ label, leafNo: leaf.no, w: round(sw, 1), h: round(sh, 1), weight: round3(weight) });
      }
      acc.add('PR-CH', 1);
    }
  }

  // ---------- leaf add-ons: pleated / pull-down mesh, georgian bars, safety grill ----------
  for (const leaf of leaves) {
    const { node } = leaf;
    const ins = 2 * 62;
    const ow = Math.max(0, leaf.w - ins);
    const oh = Math.max(0, leaf.h - ins);
    const sqm = (ow * oh) / 1e6;
    if (node.pleated) acc.add(node.pleated === 'pulldown' ? 'PR-PDM' : 'PR-PLM', round3(sqm));
    if (node.grill) acc.add('MS-GRILL', round3(sqm));
    if (node.georgian && (node.georgian.rows || node.georgian.cols)) {
      const panes = Math.max(1, paneCount(node));
      const gw = ow / Math.max(1, node.panel === 'sliding' || node.panel === 'twin' || node.panel === 'bifold' || node.panel === 'monorail' ? panes : 1);
      const per = (node.georgian.rows || 0) * gw + (node.georgian.cols || 0) * oh;
      acc.add('PR-GB18', round3((per * (node.panel === 'sliding' || node.panel === 'twin' || node.panel === 'bifold' || node.panel === 'monorail' ? panes : 1)) / 1000));
      acc.add('PR-GBC', (node.georgian.rows || 0) * (node.georgian.cols || 0) * panes);
    }
  }

  // ---------- installation & consumables ----------
  const perimeterMm = 2 * (W + H);
  // Frame fasteners: one every 600 mm on each side, at least two per side.
  const perSide = (len) => Math.max(2, Math.ceil(len / 600));
  const fasteners = 2 * perSide(W) + 2 * perSide(H);
  acc.add('PR-FC', fasteners);
  acc.add('PR-N8X100', Math.ceil(fasteners / 2));
  acc.add('PR-N8X80', Math.floor(fasteners / 2));
  acc.add('PR-PP1MM', 4);
  acc.add('PR-PP2MM', 2 * fasteners + 4);
  acc.add('PR-PP5MM', 2 * fasteners);
  const silicone = round(((perimeterMm - 2) / 1000) * SILICONE_PER_METRE, 6);
  acc.add('PR-ACRYLIC', silicone);
  acc.add('PR-NEUTRAL', silicone);
  acc.add('PR-DCF', 2);
  acc.add('PR-4X16', riScrews);

  // ---------- validation ----------
  const lim = ctx.system.limits || {};
  if (lim.minWidth && W < lim.minWidth) warnings.push(`Width ${W}mm is below the minimum of ${lim.minWidth}mm for ${ctx.system.name}.`);
  if (lim.maxWidth && W > lim.maxWidth) warnings.push(`Width ${W}mm exceeds the maximum of ${lim.maxWidth}mm for ${ctx.system.name}.`);
  if (lim.minHeight && H < lim.minHeight) warnings.push(`Height ${H}mm is below the minimum of ${lim.minHeight}mm for ${ctx.system.name}.`);
  if (lim.maxHeight && H > lim.maxHeight) warnings.push(`Height ${H}mm exceeds the maximum of ${lim.maxHeight}mm for ${ctx.system.name}.`);
  for (const leaf of leaves) {
    const p = leaf.node.panel;
    if (p === 'sliding' && ctx.system.type !== 'sliding') warnings.push(`Panel ${leaf.no} is a sliding typology but ${ctx.system.name} is a casement system.`);
    if (CASEMENT_PANELS.has(p) && p !== 'louver' && p !== 'fan' && ctx.system.type === 'sliding' && p !== 'mesh')
      warnings.push(`Panel ${leaf.no} is an openable typology; consider the casement series.`);
    if (leaf.w < 200 || leaf.h < 200) warnings.push(`Panel ${leaf.no} is smaller than 200mm.`);
  }

  // ---------- price the lines ----------
  const lines = [];
  for (const raw of acc.lines.values()) {
    lines.push(priceLine(raw, ctx));
  }
  lines.sort((a, b) => GROUP_ORDER.indexOf(a.grp) - GROUP_ORDER.indexOf(b.grp) || a.sort - b.sort || a.code.localeCompare(b.code));

  const sumBy = (pred) => lines.filter(pred).reduce((s, l) => s + l.amount, 0);
  const vars = {
    UPVCPROFILECOST: sumBy((l) => l.category === 'profile'),
    ALUMINIUMPROFILECOST: sumBy((l) => l.category === 'aluminium'),
    RICOST: sumBy((l) => l.category === 'reinforcement'),
    HWCOST: sumBy((l) => l.category === 'hardware'),
    GLASSCOST: sumBy((l) => l.category === 'glass'),
    MESHCOST: sumBy((l) => l.category === 'mesh'),
  };

  const areaSqm = round3((W * H) / 1e6);
  return {
    width: W,
    height: H,
    areaSqm,
    areaSqft: round3(areaSqm * SQFT_PER_SQM),
    leaves: leaves.map((l) => ({ no: l.no, panel: l.node.panel, x: l.x, y: l.y, w: round(l.w, 1), h: round(l.h, 1), sashes: sashCount(l.node), mesh: !!l.node.mesh })),
    mullions,
    frameCode: displayCode(ctx.system.roles[frameRole], ctx),
    lines,
    cuts: acc.cuts.map((c) => ({ ...c, code: displayCode(c.code, ctx), name: ctx.items.get(c.code)?.name || c.code, category: ctx.items.get(c.code)?.category, baseCode: c.code })),
    panes,
    meshPanes,
    sashes,
    vars,
    warnings,
  };
}

export const GROUP_ORDER = ['Profile', 'Aluminium Profiles', 'Reinforcement', 'Fabrication Hardware', 'Accessories', 'Screws', 'Installation Hardware', 'Gasket', 'Glazing', 'Mesh'];

export function displayCode(code, ctx) {
  const item = ctx.items.get(code);
  if (item && item.color_variant && ctx.color?.suffix) return `${code}-${ctx.color.suffix}`;
  return code;
}

/** Price from the quote's selected price level (by display code, then base code), if any. */
function levelRate(ctx, category, code, baseCode) {
  const lv = ctx.levelPrices?.[category];
  if (!lv) return null;
  if (lv.has(code)) return lv.get(code);
  if (baseCode && lv.has(baseCode)) return lv.get(baseCode);
  return null;
}
export const LEVEL_CATEGORY = { profile: 'profile', aluminium: 'profile', reinforcement: 'reinforcement', hardware: 'hardware', glass: 'glass', mesh: 'glass' };

export function hardwareColor(color) {
  return color?.hw_color || (color?.laminated ? 'BROWN' : 'WHITE');
}

/** White hardware codes switch to their brown/black variant to match the profile colour. */
export function hardwareVariant(code, ctx) {
  const item = ctx.items.get(code);
  if (!item || item.category !== 'hardware') return code;
  const variants = item.extra?.variants;
  const hw = hardwareColor(ctx.color);
  if (variants && hw !== 'WHITE') {
    const v = variants[hw] || variants.BROWN;
    if (v && ctx.items.has(v)) return v;
  }
  return code;
}

function priceLine(raw, ctx) {
  if (raw.kind === 'glass' || raw.kind === 'mesh') {
    const g = raw.glass;
    const qty = round3(raw.raw);
    const override = ctx.rateOverrides?.[g.code];
    const lvl = levelRate(ctx, 'glass', g.code);
    const rate = override != null ? Number(override) : lvl != null ? lvl : Number(g.rate);
    return {
      code: g.code,
      baseCode: g.code,
      name: g.name,
      grp: raw.kind === 'glass' ? 'Glazing' : 'Mesh',
      category: raw.kind,
      unit: 'SQMT',
      qty,
      rate,
      amount: qty * rate,
      sort: 0,
    };
  }
  const itemCode = hardwareVariant(raw.code, ctx);
  const item = ctx.items.get(itemCode);
  if (!item) {
    return { code: raw.code, baseCode: raw.code, name: raw.code, grp: 'Fabrication Hardware', category: 'hardware', unit: 'Pcs', qty: raw.raw, rate: 0, amount: 0, sort: 999, color: '' };
  }
  const code = displayCode(itemCode, ctx);
  const qty = raw.kind === 'length' ? round3(raw.raw) : item.unit === 'Meter' ? round3(raw.raw) : round(raw.raw, 6);
  const baseRate = item.color_variant && ctx.color?.laminated ? Number(item.rate_lam ?? item.rate) : Number(item.rate);
  const override = ctx.rateOverrides?.[code];
  const lvl = levelRate(ctx, LEVEL_CATEGORY[item.category] || 'hardware', code, itemCode);
  const rate = override != null ? Number(override) : lvl != null ? lvl : baseRate;
  const color =
    item.category === 'hardware'
      ? item.extra?.hw_color || (item.extra?.variants || itemCode !== raw.code ? hardwareColor(ctx.color) : 'WHITE')
      : item.category === 'aluminium'
        ? 'WHITE'
        : `Inside-${ctx.color?.inside || 'WHITE'}, Outside-${ctx.color?.outside || 'WHITE'}`;
  return { code, baseCode: itemCode, name: item.name, grp: item.grp, category: item.category, unit: item.unit, qty, rate, amount: qty * rate, sort: item.sort || 0, color };
}

/** First-fit-decreasing bar optimisation for the Profile BOQ. */
export function optimiseBars(cutLengths, barLengthM) {
  const barMm = barLengthM * 1000;
  const bars = [];
  const sorted = [...cutLengths].sort((a, b) => b - a);
  for (const len of sorted) {
    if (len > barMm) {
      bars.push({ used: len, cuts: [len], oversize: true });
      continue;
    }
    let placed = false;
    for (const bar of bars) {
      const need = len + (bar.cuts.length ? KERF : 0);
      if (!bar.oversize && bar.used + need <= barMm) {
        bar.used += need;
        bar.cuts.push(len);
        placed = true;
        break;
      }
    }
    if (!placed) bars.push({ used: len, cuts: [len] });
  }
  return bars;
}
