// Custom charges ("added" cost heads) on a quote's price structure.
// A charge is inserted just before a subtotal head (default: Total Project Cost) and that head's
// formula gets " + [Charge]", so the charge flows into GST and the grand total automatically.
import { badRequest } from './util.js';

/** How each kind of charge maps onto the existing cost-head calculation types. */
export const CHARGE_KINDS = {
  fixed: { calcType: 'LumpSumDivideByArea', label: 'Fixed amount for the quote', formula: () => '#LUMPSUM' },
  unit: { calcType: 'LumpSumPerDesign', label: 'Amount per window', formula: () => '#LUMPSUM' },
  sqft: { calcType: 'AreaSqftFg', label: 'Amount per sqft', formula: () => '#AREASQFT' },
  percent: { calcType: 'Percentage', label: 'Percentage of a cost head', formula: (base) => `[${base}]` },
};

export function chargeKindOf(head) {
  return Object.keys(CHARGE_KINDS).find((k) => CHARGE_KINDS[k].calcType === head.calcType) || 'fixed';
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Heads a charge can be added into: formula heads that sum other heads (Total Project Cost, Sub Total …). */
export function chargeTargets(heads) {
  return heads.filter((h) => !h.added && h.calcType === 'CustomFormula' && /\[[^\]]+\]/.test(h.formula || ''));
}

/** Default "add into" head: Total Project Cost, else the base of the GST head, else the last head. */
export function defaultChargeTarget(heads) {
  const targets = chargeTargets(heads);
  const byName = targets.find((h) => /^total project cost$/i.test(h.name.trim()));
  if (byName) return byName.name;
  const gst = heads.find((h) => h.calcType === 'Percentage' && /gst|tax/i.test(h.name));
  const base = gst && /\[([^\]]+)\]/.exec(gst.formula || '')?.[1];
  if (base && targets.some((t) => t.name === base)) return base;
  return targets[targets.length - 1]?.name || heads[heads.length - 1]?.name || null;
}

function addRef(formula, name) {
  const f = String(formula || '').trim();
  return f ? `${f} + [${name}]` : `[${name}]`;
}

function removeRef(formula, name) {
  const n = esc(name);
  return String(formula || '')
    .replace(new RegExp(`\\s*\\+\\s*\\[${n}\\]`, 'g'), '')
    .replace(new RegExp(`^\\s*\\[${n}\\]\\s*\\+\\s*`), '')
    .trim();
}

function renameRef(formula, from, to) {
  return String(formula || '')
    .split(`[${from}]`)
    .join(`[${to}]`);
}

/** Validate a charge body: { name, kind, amount, base?, addTo?, visibility?, remark? }. */
export function readCharge(body, heads, exceptName = null) {
  const name = String(body?.name ?? '').trim().slice(0, 80);
  if (!name) throw badRequest('Charge name is required');
  if (/[[\]]/.test(name)) throw badRequest('Charge name cannot contain [ or ]');
  if (heads.some((h) => h.name !== exceptName && h.name.toLowerCase() === name.toLowerCase())) throw badRequest(`A cost head named "${name}" already exists`);
  const kind = String(body?.kind || '');
  if (!CHARGE_KINDS[kind]) throw badRequest('Choose how the charge is calculated: fixed amount, per window, per sqft or percentage');
  const amount = Number(body?.amount);
  if (body?.amount === '' || body?.amount == null || !Number.isFinite(amount)) throw badRequest(kind === 'percent' ? 'Enter the percentage' : 'Enter the amount');
  if (amount < 0) throw badRequest('Amount cannot be negative');
  if (kind === 'percent' && amount > 1000) throw badRequest('Percentage must be 1000 or less');
  if (amount > 1e9) throw badRequest('Amount is too large');
  const addTo = String(body?.addTo || '').trim() || defaultChargeTarget(heads.filter((h) => h.name !== exceptName));
  if (!addTo) throw badRequest('This price structure has no subtotal head to add the charge into');
  const base = kind === 'percent' ? String(body?.base || '').trim() : null;
  if (kind === 'percent' && !base) throw badRequest('Choose the cost head the percentage is applied to');
  return {
    name,
    kind,
    amount,
    base,
    addTo,
    visibility: body?.visibility === 'hidden' ? 'hidden' : 'summary',
    remark: String(body?.remark ?? '').trim().slice(0, 500),
  };
}

/** Insert a charge before its target head and add it to the target's formula. */
export function insertCharge(heads, c) {
  const ti = heads.findIndex((h) => h.name === c.addTo);
  if (ti < 0) throw badRequest(`Cost head "${c.addTo}" was not found in this quote`);
  const target = heads[ti];
  if (!chargeTargets(heads).some((h) => h.name === target.name)) throw badRequest(`A charge cannot be added into "${target.name}"`);
  if (c.kind === 'percent' && !heads.slice(0, ti).some((h) => h.name === c.base)) {
    throw badRequest(`"${c.base}" must come before "${target.name}" to be used as the percentage base`);
  }
  const spec = CHARGE_KINDS[c.kind];
  const head = {
    name: c.name,
    calcType: spec.calcType,
    formula: spec.formula(c.base),
    rate: c.amount,
    visibility: c.visibility,
    remark: c.remark,
    userRights: 'Administrator',
    added: true,
    addedTo: target.name,
  };
  const next = [...heads];
  next.splice(ti, 0, head);
  next[ti + 1] = { ...target, formula: addRef(target.formula, c.name) };
  return next;
}

/** Remove a charge and its "+ [Charge]" references. */
export function removeCharge(heads, name) {
  const out = heads.filter((h) => h.name !== name).map((h) => (String(h.formula || '').includes(`[${name}]`) ? { ...h, formula: removeRef(h.formula, name) } : h));
  const still = out.find((h) => String(h.formula || '').includes(`[${name}]`));
  if (still) throw badRequest(`"${name}" is used in the formula of "${still.name}". Change that cost head first.`);
  return out;
}

/** Update a charge in place (same target) or move it to another target. */
export function updateCharge(heads, oldName, c) {
  const old = heads.find((h) => h.name === oldName && h.added);
  if (!old) throw badRequest(`"${oldName}" is not an added charge`);
  const sameTarget = c.addTo === old.addedTo && heads.some((h) => h.name === c.addTo && String(h.formula || '').includes(`[${oldName}]`));
  if (!sameTarget) return insertCharge(removeCharge(heads, oldName), c);
  const spec = CHARGE_KINDS[c.kind];
  const idx = heads.indexOf(old);
  if (c.kind === 'percent' && !heads.slice(0, idx).some((h) => h.name === c.base)) {
    throw badRequest(`"${c.base}" must come before "${c.name}" to be used as the percentage base`);
  }
  return heads.map((h) => {
    if (h === old) return { ...old, name: c.name, calcType: spec.calcType, formula: spec.formula(c.base), rate: c.amount, visibility: c.visibility, remark: c.remark };
    return c.name !== oldName ? { ...h, formula: renameRef(h.formula, oldName, c.name) } : h;
  });
}

/** Re-create a charge head as a charge body (used to carry charges over to another price structure). */
export function chargeFromHead(h, heads) {
  const kind = chargeKindOf(h);
  const base = kind === 'percent' ? /\[([^\]]+)\]/.exec(h.formula || '')?.[1] || '' : null;
  const addTo = h.addedTo && chargeTargets(heads).some((t) => t.name === h.addedTo) ? h.addedTo : defaultChargeTarget(heads);
  return { name: h.name, kind, amount: Number(h.rate) || 0, base, addTo, visibility: h.visibility === 'hidden' ? 'hidden' : 'summary', remark: h.remark || '' };
}
