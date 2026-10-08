// Cost-head pricing engine.
// Formulas support numbers, #VARIABLES, [Cost Head Name] references, + - * / and parentheses.

import { round } from './bom.js';

export const CALC_TYPES = [
  'CustomFormula',
  'Percentage',
  'AreaSqftFg',
  'AreaSqmFg',
  'UserDefinedFGOverhead',
  'ManualPriceAutoAdjustment',
  'LumpSumDivideByArea',
  'LumpSumPerDesign',
];

export const FORMULA_VARIABLES = {
  UPVCPROFILECOST: 'Total cost of uPVC profiles',
  ALUMINIUMPROFILECOST: 'Total cost of aluminium profiles',
  RICOST: 'Total cost of reinforcement',
  HWCOST: 'Total cost of hardware, screws, accessories and gaskets',
  MESHCOST: 'Total cost of insect mesh',
  GLASSCOST: 'Total cost of glass',
  AREASQFT: 'Design area in square feet',
  AREASQM: 'Design area in square metres',
  QTY: 'Design quantity',
  DESIGNADDON: 'Sum of design add-on cost heads (per unit)',
  MANUALADJUSTMENT: 'Manual price auto adjustment',
  LUMPSUM: 'Lump sum share of this design',
};

function tokenize(src) {
  const tokens = [];
  let i = 0;
  const s = String(src ?? '');
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const num = Number(s.slice(i, j));
      if (Number.isNaN(num)) throw new Error(`Invalid number "${s.slice(i, j)}"`);
      tokens.push({ t: 'num', v: num });
      i = j;
      continue;
    }
    if (c === '#') {
      let j = i + 1;
      while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
      if (j === i + 1) throw new Error('Expected a variable name after #');
      tokens.push({ t: 'var', v: s.slice(i + 1, j).toUpperCase() });
      i = j;
      continue;
    }
    if (c === '[') {
      const j = s.indexOf(']', i);
      if (j < 0) throw new Error('Missing closing ] in cost head reference');
      tokens.push({ t: 'ref', v: s.slice(i + 1, j).trim() });
      i = j + 1;
      continue;
    }
    if ('+-*/()'.includes(c)) {
      tokens.push({ t: 'op', v: c });
      i++;
      continue;
    }
    throw new Error(`Unexpected character "${c}"`);
  }
  return tokens;
}

/** Evaluate a formula. resolveVar(name) and resolveRef(name) return numbers. */
export function evaluate(formula, resolveVar, resolveRef) {
  const tokens = tokenize(formula);
  if (!tokens.length) return 0;
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const expr = () => {
    let v = term();
    while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
      const op = next().v;
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };
  const term = () => {
    let v = factor();
    while (peek() && peek().t === 'op' && (peek().v === '*' || peek().v === '/')) {
      const op = next().v;
      const r = factor();
      v = op === '*' ? v * r : r === 0 ? 0 : v / r;
    }
    return v;
  };
  const factor = () => {
    const tok = next();
    if (!tok) throw new Error('Unexpected end of formula');
    if (tok.t === 'num') return tok.v;
    if (tok.t === 'var') return resolveVar(tok.v);
    if (tok.t === 'ref') return resolveRef(tok.v);
    if (tok.t === 'op' && tok.v === '-') return -factor();
    if (tok.t === 'op' && tok.v === '+') return factor();
    if (tok.t === 'op' && tok.v === '(') {
      const v = expr();
      const close = next();
      if (!close || close.v !== ')') throw new Error('Missing closing parenthesis');
      return v;
    }
    throw new Error(`Unexpected token "${tok.v}"`);
  };
  const out = expr();
  if (pos < tokens.length) throw new Error(`Unexpected token "${tokens[pos].v}"`);
  return Number.isFinite(out) ? out : 0;
}

/** Validate a formula against the variables and the cost heads that precede it. */
export function validateFormula(formula, headNames) {
  try {
    evaluate(
      formula,
      (v) => {
        if (!(v in FORMULA_VARIABLES)) throw new Error(`Unknown variable #${v}`);
        return 1;
      },
      (r) => {
        if (!headNames.includes(r)) throw new Error(`Unknown cost head [${r}]`);
        return 1;
      },
    );
    return null;
  } catch (e) {
    return e.message;
  }
}

function runHeads(heads, vars, manualAdjustment) {
  const values = new Map();
  const results = [];
  const resolveVar = (v) => {
    if (v === 'MANUALADJUSTMENT') return manualAdjustment;
    return Number(vars[v] ?? 0);
  };
  for (const h of heads) {
    const resolveRef = (name) => {
      if (!values.has(name)) throw new Error(`Cost head [${name}] must be defined before "${h.name}"`);
      return values.get(name);
    };
    const rate = Number(h.rate) || 0;
    let value = 0;
    let error = null;
    try {
      switch (h.calcType) {
        case 'CustomFormula':
          value = rate * evaluate(h.formula, resolveVar, resolveRef);
          break;
        case 'Percentage':
          value = (evaluate(h.formula, resolveVar, resolveRef) * rate) / 100;
          break;
        case 'AreaSqftFg':
          value = rate * Number(vars.AREASQFT || 0);
          break;
        case 'AreaSqmFg':
          value = rate * Number(vars.AREASQM || 0);
          break;
        case 'UserDefinedFGOverhead':
          value = rate * Number(vars.DESIGNADDON || 0);
          break;
        case 'ManualPriceAutoAdjustment':
          value = rate * manualAdjustment;
          break;
        case 'LumpSumDivideByArea':
          value = rate * Number(vars.AREASHARE || 0);
          break;
        case 'LumpSumPerDesign':
          value = rate;
          break;
        default:
          value = 0;
      }
    } catch (e) {
      error = e.message;
      value = 0;
    }
    values.set(h.name, value);
    results.push({ ...h, value, error });
  }
  return results;
}

/**
 * Price one unit of a design.
 * opts: { calcType: 'auto'|'manual', manualSqftRate, addonPerUnit, areaShare }
 */
export function priceDesign(bom, heads, opts = {}) {
  const vars = {
    ...bom.vars,
    AREASQFT: bom.areaSqft,
    AREASQM: bom.areaSqm,
    QTY: opts.qty || 1,
    DESIGNADDON: opts.addonPerUnit || 0,
    AREASHARE: opts.areaShare || 0,
  };
  let results = runHeads(heads, vars, 0);
  const adjHead = heads.find((h) => h.calcType === 'ManualPriceAutoAdjustment');
  const basicHead = findBasicHead(heads, adjHead);
  const autoBasic = basicHead ? results.find((r) => r.name === basicHead.name)?.value || 0 : 0;
  let manualAdjustment = 0;
  let manualBasic = null;
  if (opts.calcType === 'manual' && adjHead && basicHead && Number(opts.manualSqftRate) > 0) {
    manualBasic = Number(opts.manualSqftRate) * bom.areaSqft;
    const rate = Number(adjHead.rate) || 1;
    manualAdjustment = (manualBasic - autoBasic) / rate;
    results = runHeads(heads, vars, manualAdjustment);
  }
  const byName = Object.fromEntries(results.map((r) => [r.name, r.value]));
  const grandHead = heads[heads.length - 1];
  const grand = grandHead ? byName[grandHead.name] : 0;
  const basic = basicHead ? byName[basicHead.name] : grand;
  return {
    heads: results,
    autoBasic,
    manualBasic,
    basic,
    grand,
    sqftRate: bom.areaSqft ? basic / bom.areaSqft : 0,
    autoSqftRate: bom.areaSqft ? autoBasic / bom.areaSqft : 0,
    errors: results.filter((r) => r.error).map((r) => `${r.name}: ${r.error}`),
  };
}

/** The "Basic Value" head is the first head whose formula references the manual adjustment head. */
export function findBasicHead(heads, adjHead) {
  if (adjHead) {
    const ref = `[${adjHead.name}]`;
    const h = heads.find((x) => typeof x.formula === 'string' && x.formula.includes(ref));
    if (h) return h;
  }
  return heads.find((h) => /basic/i.test(h.name)) || null;
}

export function money(v) {
  return round(v, 2);
}
