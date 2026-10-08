import { badRequest } from './util.js';

export const PANEL_TYPES = ['fixed', 'casement', 'tiltturn', 'tophung', 'bottomhung', 'twin', 'sliding', 'monorail', 'bifold', 'louver', 'fan', 'mesh'];

let seq = 0;
export const newNodeId = () => `n${Date.now().toString(36)}${(++seq).toString(36)}`;

/** Validate and normalise the geometry JSON of a design. Throws 400 on invalid input. */
export function validateDesignData(data) {
  if (!data || typeof data !== 'object') throw badRequest('Design data is required');
  const width = Math.round(Number(data.width));
  const height = Math.round(Number(data.height));
  if (!(width >= 100 && width <= 12000)) throw badRequest('Width must be between 100 and 12000 mm');
  if (!(height >= 100 && height <= 12000)) throw badRequest('Height must be between 100 and 12000 mm');
  let count = 0;
  const clean = (node, depth, w, h) => {
    if (!node || typeof node !== 'object') throw badRequest('Invalid design structure');
    if (++count > 200) throw badRequest('Design has too many panels');
    if (depth > 8) throw badRequest('Design is nested too deeply');
    const id = typeof node.id === 'string' && node.id.length <= 40 ? node.id : newNodeId();
    if (node.kind === 'split') {
      const dir = node.dir === 'h' ? 'h' : 'v';
      const children = Array.isArray(node.children) ? node.children : [];
      if (children.length < 2 || children.length > 12) throw badRequest('A divided panel needs between 2 and 12 parts');
      const total = dir === 'v' ? w : h;
      let sizes = Array.isArray(node.sizes) && node.sizes.length === children.length ? node.sizes.map(Number) : children.map(() => total / children.length);
      if (sizes.some((s) => !(s > 0))) throw badRequest('Panel sizes must be positive');
      const sum = sizes.reduce((a, b) => a + b, 0);
      if (Math.abs(sum - total) > 0.5) sizes = sizes.map((s) => (s * total) / sum);
      sizes = sizes.map((s) => Math.round(s * 10) / 10);
      return {
        id,
        kind: 'split',
        dir,
        sizes,
        children: children.map((c, i) => clean(c, depth + 1, dir === 'v' ? sizes[i] : w, dir === 'h' ? sizes[i] : h)),
        ...(typeof node.equalization === 'string' ? { equalization: node.equalization.slice(0, 30) } : {}),
      };
    }
    const panel = PANEL_TYPES.includes(node.panel) ? node.panel : 'fixed';
    const out = { id, kind: 'leaf', panel };
    if (['sliding', 'monorail', 'bifold'].includes(panel)) out.sashes = Math.max(2, Math.min(8, Math.round(Number(node.sashes) || 2)));
    if (panel === 'sliding') out.tracks = Number(node.tracks) === 3 ? 3 : 2;
    if (['casement', 'tiltturn', 'mesh'].includes(panel)) out.hinge = node.hinge === 'right' ? 'right' : 'left';
    if (['casement', 'tiltturn', 'twin', 'sliding', 'tophung'].includes(panel) && node.mesh) out.mesh = true;
    if (panel === 'sliding' && out.mesh) out.tracks = 3;
    if (typeof node.glassId === 'string' && node.glassId) out.glassId = node.glassId.slice(0, 60);
    if (panel === 'louver') out.louverType = ['fixed-glass', 'fixed-pvc', 'movable-glass'].includes(node.louverType) ? node.louverType : 'fixed-glass';
    if (['left', 'right', 'double', 'pulldown'].includes(node.pleated) && panel !== 'louver' && panel !== 'fan') out.pleated = node.pleated;
    if (node.georgian && typeof node.georgian === 'object' && !['louver', 'fan', 'mesh'].includes(panel)) {
      const rows = Math.max(0, Math.min(8, Math.round(Number(node.georgian.rows) || 0)));
      const cols = Math.max(0, Math.min(8, Math.round(Number(node.georgian.cols) || 0)));
      if (rows || cols) out.georgian = { rows, cols };
    }
    if (node.grill && !['louver', 'fan'].includes(panel)) out.grill = true;
    return out;
  };
  return {
    width,
    height,
    floorAperture: Math.max(0, Math.min(5000, Math.round(Number(data.floorAperture ?? 900)))),
    ...(typeof data.meshId === 'string' ? { meshId: data.meshId.slice(0, 60) } : {}),
    root: clean(data.root || { kind: 'leaf', panel: 'fixed' }, 0, width, height),
  };
}
