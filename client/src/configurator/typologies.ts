import type { DesignNode, LeafNode, PanelType } from '../lib/types';
import { leaf, split } from './model';

export type SystemType = 'sliding' | 'casement' | null;

export interface Typology {
  id: string;
  label: string;
  group: string;
  systemType: SystemType;
  /** Build the subtree for a cell of the given size. */
  build: (w: number, h: number) => DesignNode;
  /**
   * Add-ons modify the selected panel instead of replacing it (pleated mesh, georgian bars, grills).
   * Returns null when the add-on cannot be applied to that panel type.
   */
  apply?: (n: LeafNode) => LeafNode | null;
  /** Louver add-on: ask for the louver type before applying. */
  askLouverType?: boolean;
}

const L = (panel: PanelType, extra = {}) => () => leaf(panel, extra);
const ratio = (total: number, parts: number[]) => {
  const sum = parts.reduce((a, b) => a + b, 0);
  const sizes = parts.map((p) => Math.round((p / sum) * total * 10) / 10);
  sizes[sizes.length - 1] = Math.round((total - sizes.slice(0, -1).reduce((a, b) => a + b, 0)) * 10) / 10;
  return sizes;
};
const notOn = (panels: PanelType[], patch: Partial<LeafNode>) => (n: LeafNode) => (panels.includes(n.panel) ? null : { ...n, ...patch });

export const TYPOLOGY_GROUPS = [
  'Openable Designs',
  'Tilt & Turn Designs',
  'Twin Sash Designs',
  'Sliding Designs',
  'Monorail Designs',
  'Bifold Designs',
  'Add-on Mesh Sash',
  'Only Mesh Sash',
  'Add-on Track With Mesh Sash',
  'Pleated & Pull-down Mesh',
  'Add-ons',
];

export const TYPOLOGIES: Typology[] = [
  // Openable
  { id: 'fixed', label: 'Fixed glass', group: 'Openable Designs', systemType: null, build: L('fixed') },
  { id: 'cas-l', label: 'Casement – hinge left', group: 'Openable Designs', systemType: 'casement', build: L('casement', { hinge: 'left' }) },
  { id: 'cas-r', label: 'Casement – hinge right', group: 'Openable Designs', systemType: 'casement', build: L('casement', { hinge: 'right' }) },
  { id: 'top-hung', label: 'Top hung', group: 'Openable Designs', systemType: 'casement', build: L('tophung') },
  { id: 'bottom-hung', label: 'Bottom hung', group: 'Openable Designs', systemType: 'casement', build: L('bottomhung') },
  { id: 'op-op', label: 'Casement pair (OP-OP)', group: 'Openable Designs', systemType: 'casement', build: (w) => split('v', ratio(w, [1, 1]), [leaf('casement', { hinge: 'left' }), leaf('casement', { hinge: 'right' })]) },
  { id: 'op-fix', label: 'Casement + fixed', group: 'Openable Designs', systemType: 'casement', build: (w) => split('v', ratio(w, [1, 1]), [leaf('casement', { hinge: 'left' }), leaf('fixed')]) },
  { id: 'op-fix-op', label: 'Casement – fixed – casement', group: 'Openable Designs', systemType: 'casement', build: (w) => split('v', ratio(w, [1, 1.6, 1]), [leaf('casement', { hinge: 'left' }), leaf('fixed'), leaf('casement', { hinge: 'right' })]) },
  { id: 'top-vent-fix', label: 'Top hung over fixed', group: 'Openable Designs', systemType: 'casement', build: (_w, h) => split('h', ratio(h, [1, 2.5]), [leaf('tophung'), leaf('fixed')]) },
  // Tilt & turn
  { id: 'tt-l', label: 'Tilt & turn – left', group: 'Tilt & Turn Designs', systemType: 'casement', build: L('tiltturn', { hinge: 'left' }) },
  { id: 'tt-r', label: 'Tilt & turn – right', group: 'Tilt & Turn Designs', systemType: 'casement', build: L('tiltturn', { hinge: 'right' }) },
  { id: 'tt-fix', label: 'Tilt & turn + fixed', group: 'Tilt & Turn Designs', systemType: 'casement', build: (w) => split('v', ratio(w, [1, 1]), [leaf('tiltturn', { hinge: 'left' }), leaf('fixed')]) },
  { id: 'tt-tt', label: 'Tilt & turn pair', group: 'Tilt & Turn Designs', systemType: 'casement', build: (w) => split('v', ratio(w, [1, 1]), [leaf('tiltturn', { hinge: 'left' }), leaf('tiltturn', { hinge: 'right' })]) },
  { id: 'tt-top-fix', label: 'Tilt & turn with top fixed', group: 'Tilt & Turn Designs', systemType: 'casement', build: (_w, h) => split('h', ratio(h, [1, 3]), [leaf('fixed'), leaf('tiltturn', { hinge: 'left' })]) },
  // Twin
  { id: 'twin', label: 'French (twin sash)', group: 'Twin Sash Designs', systemType: 'casement', build: L('twin') },
  { id: 'fix-twin-fix', label: 'Fixed – French – fixed', group: 'Twin Sash Designs', systemType: 'casement', build: (w) => split('v', ratio(w, [1, 2, 1]), [leaf('fixed'), leaf('twin'), leaf('fixed')]) },
  { id: 'twin-top-fix', label: 'French with top fixed', group: 'Twin Sash Designs', systemType: 'casement', build: (_w, h) => split('h', ratio(h, [1, 3]), [leaf('fixed'), leaf('twin')]) },
  { id: 'twin-top-vent', label: 'French with top hung vent', group: 'Twin Sash Designs', systemType: 'casement', build: (_w, h) => split('h', ratio(h, [1, 3]), [leaf('tophung'), leaf('twin')]) },
  { id: 'twin-twin', label: 'Double French', group: 'Twin Sash Designs', systemType: 'casement', build: (w) => split('v', ratio(w, [1, 1]), [leaf('twin'), leaf('twin')]) },
  // Sliding
  { id: 'sl-2', label: '2 Track 2 Panel (SL-SL)', group: 'Sliding Designs', systemType: 'sliding', build: L('sliding', { sashes: 2, tracks: 2 }) },
  { id: 'sl-3-2t', label: '2 Track 3 Panel', group: 'Sliding Designs', systemType: 'sliding', build: L('sliding', { sashes: 3, tracks: 2 }) },
  { id: 'sl-3', label: '3 Track 3 Panel', group: 'Sliding Designs', systemType: 'sliding', build: L('sliding', { sashes: 3, tracks: 3 }) },
  { id: 'sl-4', label: '2 Track 4 Panel', group: 'Sliding Designs', systemType: 'sliding', build: L('sliding', { sashes: 4, tracks: 2 }) },
  { id: 'sl-6', label: '3 Track 6 Panel', group: 'Sliding Designs', systemType: 'sliding', build: L('sliding', { sashes: 6, tracks: 3 }) },
  { id: 'topfix-sl', label: 'Top fixed + SL-SL', group: 'Sliding Designs', systemType: 'sliding', build: (_w, h) => split('h', ratio(h, [1, 2.75]), [leaf('fixed'), leaf('sliding', { sashes: 2, tracks: 2 })]) },
  { id: 'fix-sl-fix', label: 'Fixed – SL-SL – fixed', group: 'Sliding Designs', systemType: 'sliding', build: (w) => split('v', ratio(w, [1, 2, 1]), [leaf('fixed'), leaf('sliding', { sashes: 2, tracks: 2 }), leaf('fixed')]) },
  { id: 'sl-bottomfix', label: 'SL-SL + bottom fixed', group: 'Sliding Designs', systemType: 'sliding', build: (_w, h) => split('h', ratio(h, [3, 1]), [leaf('sliding', { sashes: 2, tracks: 2 }), leaf('fixed')]) },
  // Monorail
  { id: 'mr-2', label: 'Monorail – 2 panels', group: 'Monorail Designs', systemType: 'sliding', build: L('monorail', { sashes: 2 }) },
  { id: 'mr-3', label: 'Monorail – 3 panels', group: 'Monorail Designs', systemType: 'sliding', build: L('monorail', { sashes: 3 }) },
  { id: 'mr-4', label: 'Monorail – 4 panels', group: 'Monorail Designs', systemType: 'sliding', build: L('monorail', { sashes: 4 }) },
  { id: 'mr-topfix', label: 'Monorail with top fixed', group: 'Monorail Designs', systemType: 'sliding', build: (_w, h) => split('h', ratio(h, [1, 3]), [leaf('fixed'), leaf('monorail', { sashes: 2 })]) },
  // Bifold
  { id: 'bf-4', label: 'Bifold – 4 panels', group: 'Bifold Designs', systemType: 'casement', build: L('bifold', { sashes: 4 }) },
  // Add-on mesh sash
  { id: 'cas-mesh', label: 'Casement + mesh sash', group: 'Add-on Mesh Sash', systemType: 'casement', build: L('casement', { hinge: 'left', mesh: true }) },
  { id: 'twin-mesh', label: 'French + mesh sashes', group: 'Add-on Mesh Sash', systemType: 'casement', build: L('twin', { mesh: true }) },
  // Only mesh
  { id: 'mesh-l', label: 'Mesh shutter – hinge left', group: 'Only Mesh Sash', systemType: 'casement', build: L('mesh', { hinge: 'left' }) },
  { id: 'mesh-r', label: 'Mesh shutter – hinge right', group: 'Only Mesh Sash', systemType: 'casement', build: L('mesh', { hinge: 'right' }) },
  { id: 'mesh-pair', label: 'Mesh shutter pair', group: 'Only Mesh Sash', systemType: 'casement', build: (w) => split('v', ratio(w, [1, 1]), [leaf('mesh', { hinge: 'left' }), leaf('mesh', { hinge: 'right' })]) },
  // Add-on track with mesh
  { id: 'sl-2-m', label: 'SL-SL + mesh track (SL-SL-M)', group: 'Add-on Track With Mesh Sash', systemType: 'sliding', build: L('sliding', { sashes: 2, tracks: 3, mesh: true }) },
  { id: 'sl-3-m', label: '3 panel + mesh track', group: 'Add-on Track With Mesh Sash', systemType: 'sliding', build: L('sliding', { sashes: 3, tracks: 3, mesh: true }) },
  { id: 'sl-4-m', label: '4 panel + mesh track', group: 'Add-on Track With Mesh Sash', systemType: 'sliding', build: L('sliding', { sashes: 4, tracks: 3, mesh: true }) },
  { id: 'topfix-sl-m', label: 'Top fixed + SL-SL-M', group: 'Add-on Track With Mesh Sash', systemType: 'sliding', build: (_w, h) => split('h', ratio(h, [1, 2.75]), [leaf('fixed'), leaf('sliding', { sashes: 2, tracks: 3, mesh: true })]) },
  // Pleated & pull-down mesh (applied to the selected panel)
  { id: 'pleat-r', label: 'Right Pleated Mesh', group: 'Pleated & Pull-down Mesh', systemType: null, build: L('fixed', { pleated: 'right' }), apply: notOn(['louver', 'fan'], { pleated: 'right' }) },
  { id: 'pleat-l', label: 'Left Pleated Mesh', group: 'Pleated & Pull-down Mesh', systemType: null, build: L('fixed', { pleated: 'left' }), apply: notOn(['louver', 'fan'], { pleated: 'left' }) },
  { id: 'pleat-d', label: 'Double Pleated Mesh', group: 'Pleated & Pull-down Mesh', systemType: null, build: L('fixed', { pleated: 'double' }), apply: notOn(['louver', 'fan'], { pleated: 'double' }) },
  { id: 'pulldown', label: 'Pull-down Roller Mesh', group: 'Pleated & Pull-down Mesh', systemType: null, build: L('fixed', { pleated: 'pulldown' }), apply: notOn(['louver', 'fan'], { pleated: 'pulldown' }) },
  { id: 'pleat-none', label: 'Remove pleated mesh', group: 'Pleated & Pull-down Mesh', systemType: null, build: L('fixed'), apply: (n) => ({ ...n, pleated: undefined }) },
  // Add-ons
  { id: 'louver', label: 'Louver', group: 'Add-ons', systemType: null, build: L('louver', { louverType: 'fixed-glass' }), askLouverType: true },
  { id: 'fan', label: 'Exhaust fan provision', group: 'Add-ons', systemType: null, build: L('fan') },
  { id: 'fix-luv', label: 'Fixed + louver', group: 'Add-ons', systemType: null, build: (w) => split('v', ratio(w, [1.3, 1]), [leaf('fixed'), leaf('louver', { louverType: 'fixed-glass' })]), askLouverType: true },
  { id: 'fan-luv', label: 'Fan + louver', group: 'Add-ons', systemType: null, build: (w) => split('v', ratio(w, [1.6, 1]), [leaf('fan'), leaf('louver', { louverType: 'fixed-glass' })]), askLouverType: true },
  { id: 'georgian-2', label: 'Georgian bars 2 × 2', group: 'Add-ons', systemType: null, build: L('fixed', { georgian: { rows: 1, cols: 1 } }), apply: notOn(['louver', 'fan', 'mesh'], { georgian: { rows: 1, cols: 1 } }) },
  { id: 'georgian-3', label: 'Georgian bars 3 × 3', group: 'Add-ons', systemType: null, build: L('fixed', { georgian: { rows: 2, cols: 2 } }), apply: notOn(['louver', 'fan', 'mesh'], { georgian: { rows: 2, cols: 2 } }) },
  { id: 'grill', label: 'MS safety grill', group: 'Add-ons', systemType: null, build: L('fixed', { grill: true }), apply: notOn(['louver', 'fan'], { grill: true }) },
];

export interface DividerOption {
  id: string;
  label: string;
  dir: 'v' | 'h';
  ratios: number[];
}

export const DIVIDERS: DividerOption[] = [
  { id: 'v2', label: 'Vertical – 2 equal', dir: 'v', ratios: [1, 1] },
  { id: 'h2', label: 'Horizontal – 2 equal', dir: 'h', ratios: [1, 1] },
  { id: 'v3', label: 'Vertical – 3 equal', dir: 'v', ratios: [1, 1, 1] },
  { id: 'h3', label: 'Horizontal – 3 equal', dir: 'h', ratios: [1, 1, 1] },
  { id: 'v12', label: 'Vertical – 1 : 2', dir: 'v', ratios: [1, 2] },
  { id: 'v21', label: 'Vertical – 2 : 1', dir: 'v', ratios: [2, 1] },
  { id: 'v121', label: 'Vertical – 1 : 2 : 1', dir: 'v', ratios: [1, 2, 1] },
  { id: 'htop', label: 'Horizontal – top 1 : 3', dir: 'h', ratios: [1, 3] },
  { id: 'v4', label: 'Vertical – 4 equal', dir: 'v', ratios: [1, 1, 1, 1] },
];

export const LOUVER_TYPES: { value: NonNullable<LeafNode['louverType']>; label: string }[] = [
  { value: 'fixed-glass', label: 'Fixed Glass Louvers' },
  { value: 'fixed-pvc', label: 'Fixed PVC Louvers' },
  { value: 'movable-glass', label: 'Movable Glass Louvers' },
];
