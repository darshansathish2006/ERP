import type { DesignData, DesignNode, LeafNode, PanelType, SplitNode } from '../lib/types';

let seq = 0;
export const newId = () => `n${Date.now().toString(36)}${(++seq).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export const MIN_PANEL = 150;

export function leaf(panel: PanelType = 'fixed', extra: Partial<LeafNode> = {}): LeafNode {
  return { id: newId(), kind: 'leaf', panel, ...extra };
}

export function split(dir: 'v' | 'h', sizes: number[], children: DesignNode[]): SplitNode {
  return { id: newId(), kind: 'split', dir, sizes, children };
}

export function defaultDesignData(width = 1500, height = 1500, floorAperture = 900): DesignData {
  return { width, height, floorAperture, root: leaf('fixed') };
}

export function cloneNode<T extends DesignNode>(node: T, freshIds = false): T {
  const copy = JSON.parse(JSON.stringify(node)) as T;
  if (freshIds) {
    const walk = (n: DesignNode) => {
      n.id = newId();
      if (n.kind === 'split') n.children.forEach(walk);
    };
    walk(copy);
  }
  return copy;
}

export function normaliseSizes(sizes: number[] | undefined, count: number, total: number): number[] {
  let arr = Array.isArray(sizes) && sizes.length === count ? sizes.map((s) => Math.max(1, Number(s) || 0)) : null;
  if (!arr) arr = Array.from({ length: count }, () => total / count);
  const sum = arr.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - total) > 0.01 && sum > 0) arr = arr.map((s) => (s * total) / sum);
  return arr;
}

export interface LeafRect {
  node: LeafNode;
  no: number;
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
}
export interface MullionRect {
  dir: 'v' | 'h';
  x: number;
  y: number;
  length: number;
  nodeId: string;
  index: number;
  label: string;
}
export interface SplitRect {
  node: SplitNode;
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  sizes: number[];
}

export function layout(data: DesignData) {
  const leaves: LeafRect[] = [];
  const mullions: MullionRect[] = [];
  const splits: SplitRect[] = [];
  let no = 0;
  const walk = (node: DesignNode, x: number, y: number, w: number, h: number, depth: number) => {
    if (node.kind === 'split' && node.children.length) {
      const sizes = normaliseSizes(node.sizes, node.children.length, node.dir === 'v' ? w : h);
      splits.push({ node, x, y, w, h, depth, sizes });
      let off = 0;
      node.children.forEach((child, i) => {
        const s = sizes[i];
        if (node.dir === 'v') walk(child, x + off, y, s, h, depth + 1);
        else walk(child, x, y + off, w, s, depth + 1);
        off += s;
        if (i < node.children.length - 1) {
          mullions.push(
            node.dir === 'v'
              ? { dir: 'v', x: x + off, y, length: h, nodeId: node.id, index: i, label: '' }
              : { dir: 'h', x, y: y + off, length: w, nodeId: node.id, index: i, label: '' },
          );
        }
      });
    } else if (node.kind === 'leaf') {
      no += 1;
      leaves.push({ node, no, x, y, w, h, depth });
    }
  };
  walk(data.root, 0, 0, data.width, data.height, 0);
  mullions.forEach((m, i) => (m.label = `M${i + 1}`));
  return { leaves, mullions, splits };
}

export function sashCount(n: LeafNode): number {
  if (n.panel === 'sliding' || n.panel === 'monorail' || n.panel === 'bifold') return Math.max(2, Math.min(8, n.sashes || 2));
  if (n.panel === 'twin') return 2;
  if (['casement', 'tiltturn', 'tophung', 'bottomhung', 'mesh'].includes(n.panel)) return 1;
  return 0;
}

/** Number of numbered glazed areas a leaf contributes (louver counts as one area). */
export function glazedAreas(n: LeafNode): number {
  if (n.panel === 'mesh') return 0;
  if (n.panel === 'fixed' || n.panel === 'fan' || n.panel === 'louver') return 1;
  return sashCount(n);
}

/** Map of leafId -> first pane number. */
export function paneNumbers(data: DesignData): Map<string, number> {
  const map = new Map<string, number>();
  let n = 1;
  const walk = (node: DesignNode) => {
    if (node.kind === 'split') return node.children.forEach(walk);
    map.set(node.id, n);
    n += glazedAreas(node);
  };
  walk(data.root);
  return map;
}

export function findNode(root: DesignNode, id: string): DesignNode | null {
  if (root.id === id) return root;
  if (root.kind === 'split') {
    for (const c of root.children) {
      const f = findNode(c, id);
      if (f) return f;
    }
  }
  return null;
}

export function findParent(root: DesignNode, id: string): { parent: SplitNode; index: number } | null {
  if (root.kind !== 'split') return null;
  for (let i = 0; i < root.children.length; i++) {
    if (root.children[i].id === id) return { parent: root, index: i };
    const f = findParent(root.children[i], id);
    if (f) return f;
  }
  return null;
}

/** Immutable replace of a node by id. */
export function replaceNode(root: DesignNode, id: string, fn: (n: DesignNode) => DesignNode): DesignNode {
  if (root.id === id) return fn(root);
  if (root.kind === 'split') {
    let changed = false;
    const children = root.children.map((c) => {
      const r = replaceNode(c, id, fn);
      if (r !== c) changed = true;
      return r;
    });
    return changed ? { ...root, children } : root;
  }
  return root;
}

export function allLeaves(root: DesignNode): LeafNode[] {
  if (root.kind === 'leaf') return [root];
  return root.children.flatMap(allLeaves);
}

/** Size of the cell occupied by a node. */
export function nodeRect(data: DesignData, id: string): { x: number; y: number; w: number; h: number } | null {
  const { leaves, splits } = layout(data);
  const l = leaves.find((x) => x.node.id === id);
  if (l) return { x: l.x, y: l.y, w: l.w, h: l.h };
  const s = splits.find((x) => x.node.id === id);
  if (s) return { x: s.x, y: s.y, w: s.w, h: s.h };
  return null;
}

/** Split a leaf into parts using ratios (e.g. [1,1] or [1,2,1]). */
export function splitLeaf(data: DesignData, leafId: string, dir: 'v' | 'h', ratios: number[]): DesignData {
  const rect = nodeRect(data, leafId);
  if (!rect) return data;
  const total = dir === 'v' ? rect.w : rect.h;
  const sum = ratios.reduce((a, b) => a + b, 0);
  const sizes = ratios.map((r) => Math.round(((r / sum) * total) * 10) / 10);
  const drift = total - sizes.reduce((a, b) => a + b, 0);
  sizes[sizes.length - 1] = Math.round((sizes[sizes.length - 1] + drift) * 10) / 10;
  if (sizes.some((s) => s < MIN_PANEL)) throw new Error(`Panels would be smaller than ${MIN_PANEL} mm`);
  const root = replaceNode(data.root, leafId, (n) => {
    const glassId = n.kind === 'leaf' ? n.glassId : undefined;
    return split(dir, sizes, ratios.map(() => leaf('fixed', glassId ? { glassId } : {})));
  });
  return { ...data, root };
}

/** Merge a split node back into a single fixed panel. */
export function mergeSplit(data: DesignData, splitId: string): DesignData {
  return { ...data, root: replaceNode(data.root, splitId, () => leaf('fixed')) };
}

/** Remove the divider between a node and its parent: collapses the parent split. */
export function removeDividerAround(data: DesignData, nodeId: string): DesignData {
  const p = findParent(data.root, nodeId);
  if (!p) return data;
  return mergeSplit(data, p.parent.id);
}

/** Change the size of one child of a split; the neighbour absorbs the difference. */
export function setChildSize(data: DesignData, splitId: string, index: number, size: number): DesignData {
  const node = findNode(data.root, splitId);
  const rect = nodeRect(data, splitId);
  if (!node || node.kind !== 'split' || !rect) return data;
  const total = node.dir === 'v' ? rect.w : rect.h;
  const sizes = normaliseSizes(node.sizes, node.children.length, total);
  const nb = index < sizes.length - 1 ? index + 1 : index - 1;
  const delta = size - sizes[index];
  if (size < MIN_PANEL || sizes[nb] - delta < MIN_PANEL) throw new Error(`Each panel must be at least ${MIN_PANEL} mm`);
  sizes[index] = size;
  sizes[nb] -= delta;
  return { ...data, root: replaceNode(data.root, splitId, (n) => ({ ...(n as SplitNode), sizes: sizes.map((s) => Math.round(s * 10) / 10) })) };
}

/** Resize the whole design, scaling every split proportionally. */
export function resizeDesign(data: DesignData, width: number, height: number): DesignData {
  const sx = width / data.width;
  const sy = height / data.height;
  const scale = (n: DesignNode): DesignNode => {
    if (n.kind === 'leaf') return n;
    const f = n.dir === 'v' ? sx : sy;
    return { ...n, sizes: n.sizes.map((s) => Math.round(s * f * 10) / 10), children: n.children.map(scale) };
  };
  const next = { ...data, width, height, root: scale(data.root) };
  // fix rounding drift so sizes always sum to the parent dimension
  const fix = (n: DesignNode, w: number, h: number): DesignNode => {
    if (n.kind === 'leaf') return n;
    const total = n.dir === 'v' ? w : h;
    const sizes = normaliseSizes(n.sizes, n.children.length, total).map((s) => Math.round(s * 10) / 10);
    const drift = total - sizes.reduce((a, b) => a + b, 0);
    sizes[sizes.length - 1] = Math.round((sizes[sizes.length - 1] + drift) * 10) / 10;
    return { ...n, sizes, children: n.children.map((c, i) => fix(c, n.dir === 'v' ? sizes[i] : w, n.dir === 'h' ? sizes[i] : h)) };
  };
  return { ...next, root: fix(next.root, width, height) };
}

export type Equalization = 'mullion' | 'glass' | 'sash';

/** Equalise the parts of a split. Glass equalisation compensates for frame vs mullion sight lines. */
export function equalize(data: DesignData, splitId: string, mode: Equalization, frameFace = 62, mullionFace = 74): DesignData {
  const node = findNode(data.root, splitId);
  const rect = nodeRect(data, splitId);
  if (!node || node.kind !== 'split' || !rect) return data;
  const n = node.children.length;
  const total = node.dir === 'v' ? rect.w : rect.h;
  let sizes: number[];
  if (mode === 'mullion') {
    sizes = Array.from({ length: n }, () => total / n);
  } else {
    // equal visible glass: outer parts lose a frame face plus half a mullion, inner parts lose a full mullion
    const atStart = node.dir === 'v' ? rect.x <= 0.5 : rect.y <= 0.5;
    const atEnd = node.dir === 'v' ? rect.x + rect.w >= data.width - 0.5 : rect.y + rect.h >= data.height - 0.5;
    const loss = (i: number) => {
      const first = i === 0 ? (atStart ? frameFace : mullionFace / 2) : mullionFace / 2;
      const last = i === n - 1 ? (atEnd ? frameFace : mullionFace / 2) : mullionFace / 2;
      return first + last;
    };
    const totalLoss = Array.from({ length: n }, (_, i) => loss(i)).reduce((a, b) => a + b, 0);
    const glass = (total - totalLoss) / n;
    sizes = Array.from({ length: n }, (_, i) => glass + loss(i));
  }
  sizes = sizes.map((s) => Math.round(s * 10) / 10);
  const drift = total - sizes.reduce((a, b) => a + b, 0);
  sizes[n - 1] = Math.round((sizes[n - 1] + drift) * 10) / 10;
  return { ...data, root: replaceNode(data.root, splitId, (x) => ({ ...(x as SplitNode), sizes, equalization: mode })) };
}

export function updateLeaf(data: DesignData, leafId: string, patch: Partial<LeafNode>): DesignData {
  return {
    ...data,
    root: replaceNode(data.root, leafId, (n) => {
      if (n.kind !== 'leaf') return n;
      const next: LeafNode = { ...n, ...patch };
      if (next.panel === 'sliding' && next.mesh) next.tracks = 3;
      return next;
    }),
  };
}

export function hasPanel(data: DesignData, types: PanelType[]): boolean {
  return allLeaves(data.root).some((l) => types.includes(l.panel));
}

const CODE: Record<PanelType, string> = {
  fixed: 'FIX',
  casement: 'OP',
  tiltturn: 'TT',
  tophung: 'TH',
  bottomhung: 'BH',
  twin: 'OP-OP',
  sliding: 'SL',
  monorail: 'MR',
  bifold: 'BF',
  louver: 'LUV',
  fan: 'FAN',
  mesh: 'MESH',
};

/** Suggested typology name such as "SL-SL", "TOP FIX -SL-SL" or "OP-FIX-OP". */
export function typologyCode(data: DesignData): string {
  const leafCode = (l: LeafNode) => {
    if (l.panel === 'sliding' || l.panel === 'monorail' || l.panel === 'bifold') {
      const base = Array.from({ length: sashCount(l) }, () => CODE[l.panel]).join('-');
      return l.mesh ? `${base}-M` : base;
    }
    return l.mesh ? `${CODE[l.panel]}-M` : CODE[l.panel];
  };
  const walk = (n: DesignNode): string => {
    if (n.kind === 'leaf') return leafCode(n);
    if (n.dir === 'h' && n.children.length === 2 && n.children[0].kind === 'leaf' && n.children[0].panel === 'fixed') return `TOP FIX -${walk(n.children[1])}`;
    return n.children.map(walk).join(n.dir === 'v' ? '-' : ' / ');
  };
  return walk(data.root);
}

export function validateData(data: DesignData): string[] {
  const issues: string[] = [];
  const { leaves } = layout(data);
  for (const l of leaves) {
    if (l.w < MIN_PANEL || l.h < MIN_PANEL) issues.push(`Panel ${l.no} is smaller than ${MIN_PANEL} mm`);
  }
  return issues;
}
