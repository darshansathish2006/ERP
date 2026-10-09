import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { DesignData, LeafNode } from '../lib/types';
import { layout, normaliseSizes, paneNumbers, sashCount, type LeafRect } from './model';

export const FRAME = 62;
export const MULL = 74;
export const SASH = 58;
export const GLASS_FILL = '#b8e2f4';

// uPVC glazing details (visible widths, mm)
const BEAD = 18; // room-side glazing bead
const LIP = 11; // exterior glazing lip of the profile
const GASKET = 4; // EPDM gasket line hugging the glass
const GASKET_COLOR = '#2b2f33';

/** Level of detail. 'auto' derives it from the rendered size (screen pixels per mm). */
export type DesignDetail = 'auto' | 'low' | 'medium' | 'high';

type Side = 't' | 'b' | 'l' | 'r';
const SIDES: Side[] = ['t', 'b', 'l', 'r'];
/** Gradient vector (objectBoundingBox) of each member of a rectangular ring, running from its outer to its inner edge. */
const SIDE_VEC: Record<Side, [number, number, number, number]> = { t: [0, 0, 0, 1], b: [0, 1, 0, 0], l: [0, 0, 1, 0], r: [1, 0, 0, 0] };
/** Light from the top left: how much the outer / inner rounded edge of each member faces the light (-1..1). */
const SIDE_LIT: Record<Side, [number, number]> = { t: [1, -0.9], b: [-0.85, 0.8], l: [0.75, -0.7], r: [-0.7, 0.65] };

/** The four 45° mitred members of a rectangular ring with outer rect x/y/w/h and face width f. */
function trapezoids(x: number, y: number, w: number, h: number, f: number): Record<Side, string> {
  return {
    t: `M${x} ${y}H${x + w}L${x + w - f} ${y + f}H${x + f}Z`,
    b: `M${x} ${y + h}H${x + w}L${x + w - f} ${y + h - f}H${x + f}Z`,
    l: `M${x} ${y}L${x + f} ${y + f}V${y + h - f}L${x} ${y + h}Z`,
    r: `M${x + w} ${y}L${x + w - f} ${y + f}V${y + h - f}L${x + w} ${y + h}Z`,
  };
}

/** Welded 45° mitre seams of a ring. */
const mitrePath = (x: number, y: number, w: number, h: number, f: number) =>
  `M${x} ${y}L${x + f} ${y + f}M${x + w} ${y}L${x + w - f} ${y + f}M${x} ${y + h}L${x + f} ${y + h - f}M${x + w} ${y + h}L${x + w - f} ${y + h - f}`;

export type DimTarget = { kind: 'width' } | { kind: 'height' } | { kind: 'child'; splitId: string; index: number; value: number };

export interface DesignSvgProps {
  data: DesignData;
  frameColor: string;
  glassColor?: string;
  view?: 'inside' | 'outside';
  showDims?: boolean;
  showFloor?: boolean;
  showPlan?: boolean;
  showLabels?: boolean;
  showNumbers?: boolean;
  interactive?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onDimClick?: (target: DimTarget, ev: React.MouseEvent) => void;
  onFloorClick?: (ev: React.MouseEvent) => void;
  viewBox?: string;
  className?: string;
  style?: React.CSSProperties;
  fontScale?: number;
  /** Multiplier for line weights – use a large value for tiny icon renders. */
  strokeScale?: number;
  /** Profile detail (bevel shading, glazing bead, gasket, drainage). Default 'auto': picked from the rendered size. */
  detail?: DesignDetail;
}

export function shade(hex: string, amt: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function isLight(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return true;
  const n = parseInt(m[1], 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 170;
}

/** Brightens a colour by scaling its channels (keeps the hue of dark laminates instead of washing them out). */
function brighten(hex: string, k: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 + k) + 6 * k)));
  return `#${((ch((n >> 16) & 255) << 16) | (ch((n >> 8) & 255) << 8) | ch(n & 255)).toString(16).padStart(6, '0')}`;
}

/** Shade of a uPVC profile face turned towards (lit > 0) or away from (lit < 0) the light. */
function profileTone(base: string, light: boolean, lit: number): string {
  if (lit >= 0) return light ? shade(base, 0.85 * lit) : brighten(base, 0.42 * lit);
  return shade(base, (light ? 0.17 : 0.34) * lit);
}

/** Gradient stops across a uPVC member: rounded outer edge, flat satin face, rounded inner edge. */
function profileStops(base: string, light: boolean, outer: number, inner: number): [number, string][] {
  const t = (lit: number) => profileTone(base, light, lit);
  return [
    [0, t(outer * 0.4 - 0.55)],
    [0.045, t(outer)],
    [0.15, t(0.62)],
    [0.8, t(0.45)],
    [0.93, t(inner)],
    [1, t(inner * 0.4 - 0.55)],
  ];
}

interface DimSpec {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  value: number;
  vertical: boolean;
  target: DimTarget;
}

/** Natural drawing bounds (in mm) for a design with the given decorations. */
export function designBounds(data: DesignData, opts: { showDims?: boolean; showFloor?: boolean; showPlan?: boolean }) {
  const W = data.width;
  const H = data.height;
  const big = Math.max(W, H);
  const fs = Math.min(170, Math.max(48, big * 0.06));
  const top = data.root.kind === 'split' ? data.root : null;
  const dimStep = fs * 2.3;
  const hLevels = opts.showDims ? (top && top.dir === 'h' ? 2 : 1) : 0;
  const wLevels = opts.showDims ? (top && top.dir === 'v' ? 2 : 1) : 0;
  const left = opts.showDims ? hLevels * dimStep + fs * 0.6 : fs * 0.4;
  let bottom = opts.showDims ? wLevels * dimStep + fs * 0.6 : fs * 0.4;
  const floorY = H + Math.max(data.floorAperture ?? 900, bottom + fs);
  if (opts.showFloor) bottom = Math.max(bottom, floorY - H + fs * 1.6);
  const planH = opts.showPlan ? fs * 6 : 0;
  const right = opts.showFloor ? fs * 3.2 : fs * 0.4;
  return { x: -left, y: -fs * 0.6, w: W + left + right, h: H + bottom + planH + fs * 0.6, fs, dimStep, floorY };
}

export function DesignSvg(props: DesignSvgProps) {
  const {
    data,
    frameColor,
    glassColor = GLASS_FILL,
    view = 'inside',
    showDims = true,
    showFloor = false,
    showPlan = false,
    showLabels = true,
    showNumbers = true,
    interactive = false,
    selectedId,
    onSelect,
    onDimClick,
    onFloorClick,
    className,
    style,
    fontScale = 1,
    strokeScale = 1,
    detail = 'auto',
  } = props;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const W = data.width;
  const H = data.height;
  const outside = view === 'outside';
  const mx = (x: number, w = 0) => (outside ? W - x - w : x);
  const { leaves, mullions, splits } = layout(data);
  const paneNo = paneNumbers(data);
  const hasSliding = leaves.some((l) => l.node.panel === 'sliding' || l.node.panel === 'monorail');
  const b = designBounds(data, { showDims, showFloor, showPlan: showPlan && hasSliding });
  const fs = b.fs * fontScale;
  const lw = Math.max(1.5, Math.max(W, H) / 700) * strokeScale;
  const glassStroke = shade(glassColor, -0.35);
  const viewBox = props.viewBox || `${b.x} ${b.y} ${b.w} ${b.h}`;

  // ---- level of detail: the same drawing is used from 40 px icons to a full-screen canvas ----
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const auto = detail === 'auto';
  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!auto || !el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      setBox((p) => (p && Math.abs(p.w - w) < 2 && Math.abs(p.h - h) < 2 ? p : { w, h }));
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [auto]);
  const vb = viewBox.split(/[\s,]+/).map(Number);
  const measured = auto && box && box.w > 0 && box.h > 0 && vb[2] > 0 && vb[3] > 0 ? Math.min(box.w / vb[2], box.h / vb[3]) : 0;
  // screen pixels per mm
  const q = detail === 'low' ? 0.03 : detail === 'medium' ? 0.1 : detail === 'high' ? 0.6 : measured || (strokeScale >= 3 ? 0.03 : 0.1);
  const shaded = q >= 0.045; // bevel shading, gasket, glass reflection
  const fine = q >= 0.11; // glazing bead, drainage slots, sliding track & interlock
  const crisp = q >= 0.26; // sash shadows, handle roses
  const pxmm = (n: number) => n / q; // n screen pixels in mm

  // ---- uPVC palette ----
  const light = isLight(frameColor);
  const edge = shaded ? shade(frameColor, light ? -0.5 : -0.55) : shade(frameColor, light ? -0.64 : -0.6); // profile outlines
  const seam = shade(frameColor, light ? -0.3 : -0.4); // welded mitres, bead joints, steps
  const tone = (lit: number) => profileTone(frameColor, light, lit);
  // outline weight: thin enough at icon size that the ~2 px white profiles still read as white
  const ow = shaded ? Math.max(lw * 0.85, pxmm(0.75)) : Math.max(lw * 0.6, pxmm(0.6));
  const seamW = Math.max(lw * 0.45, pxmm(0.5)); // seam weight
  const fillOf = (kind: 'p' | 'b' | 'm', s: Side | 'v' | 'h') => (shaded ? `url(#${kind}${s}${uid})` : frameColor);
  type Line = { c: string; w: number } | null;
  const dark: Line = { c: edge, w: ow };
  const soft: Line = { c: seam, w: seamW };
  // icons: dark lines only on the outer silhouette and around the glass, light joints in between, so the
  // ~2 px profiles still read as white uPVC
  const joint: Line = shaded ? dark : soft;

  const insetFor = (x: number, y: number, w: number, h: number) => ({
    l: x <= 0.5 ? FRAME : MULL / 2,
    r: x + w >= W - 0.5 ? FRAME : MULL / 2,
    t: y <= 0.5 ? FRAME : MULL / 2,
    b: y + h >= H - 0.5 ? FRAME : MULL / 2,
  });

  const nodes: ReactNode[] = [];
  const overlay: ReactNode[] = [];

  const numberBadge = (cx: number, cy: number, n: number, key: string) => {
    if (!showNumbers) return null;
    const r = fs * 0.42;
    return (
      <g key={key} pointerEvents="none">
        <line x1={cx} y1={cy + r} x2={cx} y2={cy + r * 3.2} stroke="#5f7d8c" strokeWidth={lw * 0.7} />
        <line x1={cx - r * 2.2} y1={cy + r * 1.6} x2={cx + r * 2.2} y2={cy + r * 1.6} stroke="#5f7d8c" strokeWidth={lw * 0.7} />
        <circle cx={cx} cy={cy} r={r} fill="#fff" stroke="#5f7d8c" strokeWidth={lw * 0.8} />
        <text x={cx} y={cy} fontSize={fs * 0.5} textAnchor="middle" dominantBaseline="central" fill="#1f2937">
          {n}
        </text>
      </g>
    );
  };

  const tag = (x: number, y: number, text: string, key: string, size = 0.55, anchor: 'start' | 'middle' | 'end' = 'middle') => {
    if (!showLabels) return null;
    const f = fs * size;
    const w = text.length * f * 0.62 + f * 0.6;
    const h = f * 1.35;
    const bx = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
    return (
      <g key={key} pointerEvents="none">
        <rect x={bx} y={y - h / 2} width={w} height={h} fill="#fff" stroke="#374151" strokeWidth={lw * 0.6} />
        <text x={bx + w / 2} y={y} fontSize={f} textAnchor="middle" dominantBaseline="central" fill="#111827">
          {text}
        </text>
      </g>
    );
  };

  const arrow = (x1: number, y: number, x2: number, key: string, double = false) => (
    <line
      key={key}
      x1={x1}
      y1={y}
      x2={x2}
      y2={y}
      stroke="#3b5563"
      strokeWidth={lw * 1.1}
      markerEnd={`url(#arr${uid})`}
      markerStart={double ? `url(#arrs${uid})` : undefined}
      pointerEvents="none"
    />
  );

  /** Four welded, mitred uPVC members (outer rect x/y/w/h, face width f). kind 'p' = frame / sash profile, 'b' = glazing bead. */
  const ring = (x: number, y: number, w: number, h: number, f: number, key: string, kind: 'p' | 'b' = 'p', outer: Line = kind === 'b' ? soft : dark, inner: Line = kind === 'b' ? null : dark) => {
    if (w <= 0.5 || h <= 0.5 || f <= 0) return null;
    const ff = Math.min(f, w / 2, h / 2);
    const tr = trapezoids(x, y, w, h, ff);
    return (
      <g key={key} pointerEvents="none">
        {SIDES.map((s) => (
          <path key={s} d={tr[s]} fill={fillOf(kind, s)} />
        ))}
        {shaded && <path d={mitrePath(x, y, w, h, ff)} fill="none" stroke={seam} strokeWidth={kind === 'b' ? seamW * 0.8 : seamW} />}
        {outer && <rect x={x} y={y} width={w} height={h} fill="none" stroke={outer.c} strokeWidth={outer.w} />}
        {inner && w > 2 * ff + 0.5 && h > 2 * ff + 0.5 && <rect x={x + ff} y={y + ff} width={w - 2 * ff} height={h - 2 * ff} fill="none" stroke={inner.c} strokeWidth={inner.w} />}
      </g>
    );
  };

  /** Glass (or an infill pattern) with a soft diagonal reflection. */
  const glass = (x: number, y: number, w: number, h: number, key: string, fill: string = glassColor, reflect = true) =>
    w > 0 && h > 0 ? (
      <g key={key} pointerEvents="none">
        <rect x={x} y={y} width={w} height={h} fill={fill} />
        {shaded && reflect && <rect x={x} y={y} width={w} height={h} fill={`url(#gr${uid})`} />}
      </g>
    ) : null;

  /** Black EPDM gasket line hugging the visible glass edge (lies on the bead / sash side of the edge). */
  const gasket = (x: number, y: number, w: number, h: number, key: string) => {
    if (w <= 0 || h <= 0) return null;
    const g = shaded ? Math.max(GASKET, pxmm(0.85)) : ow;
    return <rect key={key} x={x - g / 2} y={y - g / 2} width={w + g} height={h + g} fill="none" stroke={shaded ? GASKET_COLOR : edge} strokeWidth={g} pointerEvents="none" />;
  };

  // room side shows the glazing bead, the outside the profile's glazing lip
  const beadW = outside ? LIP : BEAD;

  /** uPVC sash: mitred profile ring, glass held by a glazing bead and an EPDM gasket. */
  const sashBox = (x: number, y: number, w: number, h: number, key: string, fill = glassColor, pattern?: string) => {
    const S = Math.min(SASH, w / 2, h / 2);
    const gx = x + S;
    const gy = y + S;
    const gw = Math.max(1, w - 2 * S);
    const gh = Math.max(1, h - 2 * S);
    const bw = fine ? Math.min(beadW, S * 0.45) : 0;
    return (
      <g key={key}>
        {glass(gx, gy, gw, gh, 'g', pattern ? `url(#${pattern})` : fill, !pattern)}
        {ring(x, y, w, h, S, 'r', 'p', joint, shaded ? dark : null)}
        {bw > 0 && ring(gx - bw, gy - bw, gw + 2 * bw, gh + 2 * bw, bw, 'bd', 'b')}
        {gasket(gx, gy, gw, gh, 'gk')}
      </g>
    );
  };

  /** Soft shadow of an inward-opening sash that stands proud of the frame (light from the top left). */
  const sashShadow = (x: number, y: number, w: number, h: number, key: string) => {
    if (!crisp || outside) return;
    const s = Math.max(5, pxmm(2));
    overlay.push(<path key={key} d={`M${x + w} ${y + s}h${s}V${y + h + s}H${x + s}V${y + h}H${x + w}Z`} fill="#0b1520" opacity={0.12} pointerEvents="none" />);
  };

  const openingLines = (x: number, y: number, w: number, h: number, hinge: 'left' | 'right' | 'top' | 'bottom', key: string) => {
    const ix = x + SASH;
    const iy = y + SASH;
    const iw = w - 2 * SASH;
    const ih = h - 2 * SASH;
    let d = '';
    if (hinge === 'left') d = `M${ix + iw} ${iy}L${ix} ${iy + ih / 2}L${ix + iw} ${iy + ih}`;
    if (hinge === 'right') d = `M${ix} ${iy}L${ix + iw} ${iy + ih / 2}L${ix} ${iy + ih}`;
    if (hinge === 'top') d = `M${ix} ${iy + ih}L${ix + iw / 2} ${iy}L${ix + iw} ${iy + ih}`;
    if (hinge === 'bottom') d = `M${ix} ${iy}L${ix + iw / 2} ${iy + ih}L${ix + iw} ${iy}`;
    return <path key={key} d={d} fill="none" stroke="#475569" strokeWidth={lw * 0.8} strokeDasharray={`${fs * 0.35} ${fs * 0.22}`} pointerEvents="none" />;
  };

  const handle = (x: number, y: number, vertical: boolean, key: string) => {
    const L = fs * 1.1;
    const T = fs * 0.22;
    const lever = vertical ? (
      <rect key={key} x={x - T / 2} y={y - L / 2} width={T} height={L} rx={T / 2} fill="#374151" pointerEvents="none" />
    ) : (
      <rect key={key} x={x - L / 2} y={y - T / 2} width={L} height={T} rx={T / 2} fill="#374151" pointerEvents="none" />
    );
    if (!crisp) return lever;
    // uPVC handle: rose plate on the sash profile, lever over it
    const rw = T * 1.9;
    const rl = T * 3.8;
    return (
      <g key={key} pointerEvents="none">
        {vertical ? (
          <rect x={x - rw / 2} y={y - L / 2 - T * 0.4} width={rw} height={rl} rx={rw / 2} fill={tone(0.5)} stroke={edge} strokeWidth={seamW} />
        ) : (
          <rect x={x - L / 2 - T * 0.4} y={y - rw / 2} width={rl} height={rw} rx={rw / 2} fill={tone(0.5)} stroke={edge} strokeWidth={seamW} />
        )}
        {lever}
      </g>
    );
  };

  const renderLeaf = (lr: LeafRect) => {
    const n: LeafNode = lr.node;
    const ins = insetFor(lr.x, lr.y, lr.w, lr.h);
    const x = mx(lr.x, lr.w) + (outside ? ins.r : ins.l);
    const y = lr.y + ins.t;
    const w = lr.w - ins.l - ins.r;
    const h = lr.h - ins.t - ins.b;
    const first = paneNo.get(n.id) ?? 1;
    const k = n.id;
    const out: ReactNode[] = [];
    const flipHinge = (hg: 'left' | 'right'): 'left' | 'right' => (outside ? (hg === 'left' ? 'right' : 'left') : hg);
    if (w <= 0 || h <= 0) return out;
    // Glass areas of this panel, used for georgian-bar overlays.
    const panes: { x: number; y: number; w: number; h: number }[] = [];

    switch (n.panel) {
      case 'fixed':
      case 'fan': {
        // glass glazed straight into the frame / mullions, held by a glazing bead
        const bw = fine ? Math.min(beadW, w / 4, h / 4) : 0;
        out.push(glass(x, y, w, h, `${k}g`, glassColor, n.panel === 'fixed'));
        if (bw > 0) out.push(ring(x, y, w, h, bw, `${k}bd`, 'b'));
        out.push(gasket(x + bw, y + bw, w - 2 * bw, h - 2 * bw, `${k}gk`));
        if (n.panel === 'fixed') panes.push({ x, y, w, h });
        if (n.panel === 'fan') {
          const r = Math.min(w, h) * 0.3;
          const cx = x + w / 2;
          const cy = y + h / 2;
          out.push(
            <g key={`${k}fan`} pointerEvents="none">
              <circle cx={cx} cy={cy} r={r} fill="#e8f4fa" stroke="#475569" strokeWidth={lw} />
              {[0, 120, 240].map((a) => (
                <path
                  key={a}
                  d={`M${cx} ${cy}Q${cx + r * 0.9 * Math.cos(((a + 25) * Math.PI) / 180)} ${cy + r * 0.9 * Math.sin(((a + 25) * Math.PI) / 180)} ${cx + r * 0.85 * Math.cos(((a + 60) * Math.PI) / 180)} ${cy + r * 0.85 * Math.sin(((a + 60) * Math.PI) / 180)}`}
                  fill="none"
                  stroke="#475569"
                  strokeWidth={lw}
                />
              ))}
              <circle cx={cx} cy={cy} r={r * 0.12} fill="#475569" />
            </g>,
          );
        } else out.push(numberBadge(x + w / 2, y + h / 2 - fs * 0.6, first, `${k}n`));
        break;
      }
      case 'louver': {
        out.push(<rect key={`${k}bg`} x={x} y={y} width={w} height={h} fill="#eef2f5" stroke={glassStroke} strokeWidth={lw * 0.6} />);
        const pitch = 95;
        const count = Math.max(1, Math.floor(h / pitch));
        const pvc = n.louverType === 'fixed-pvc';
        const bladeFill = pvc ? tone(0.2) : glassColor;
        for (let i = 0; i < count; i++) {
          const sy = y + (h / count) * i + (h / count) * 0.12;
          const bh = (h / count) * 0.66;
          out.push(
            <path
              key={`${k}b${i}`}
              d={`M${x + w * 0.04} ${sy + bh * 0.25}L${x + w * 0.96} ${sy}V${sy + bh * 0.75}L${x + w * 0.04} ${sy + bh}Z`}
              fill={bladeFill}
              stroke={pvc ? edge : glassStroke}
              strokeWidth={lw * 0.5}
              pointerEvents="none"
            />,
          );
        }
        if (n.louverType === 'movable-glass') {
          out.push(<rect key={`${k}op`} x={x + w - fs * 0.5} y={y + h * 0.15} width={fs * 0.22} height={h * 0.7} rx={fs * 0.1} fill="#64748b" pointerEvents="none" />);
          out.push(handle(x + w - fs * 0.4, y + h * 0.82, true, `${k}oph`));
        }
        out.push(tag(x + w / 2, y + fs * 0.7, 'L' + first, `${k}lt`, 0.5));
        break;
      }
      case 'casement':
      case 'tiltturn':
      case 'tophung':
      case 'bottomhung':
      case 'mesh': {
        const isMesh = n.panel === 'mesh';
        sashShadow(x, y, w, h, `${k}sh`);
        out.push(sashBox(x, y, w, h, `${k}s`, glassColor, isMesh ? `mesh${uid}` : undefined));
        if (!isMesh) panes.push({ x: x + SASH, y: y + SASH, w: w - 2 * SASH, h: h - 2 * SASH });
        const hg = flipHinge(n.hinge === 'right' ? 'right' : 'left');
        if (n.panel === 'tophung') {
          out.push(openingLines(x, y, w, h, 'top', `${k}o`));
          out.push(handle(x + w / 2, y + h - SASH / 2, false, `${k}h`));
        } else if (n.panel === 'bottomhung') {
          out.push(openingLines(x, y, w, h, 'bottom', `${k}o`));
          out.push(handle(x + w / 2, y + SASH / 2, false, `${k}h`));
        } else {
          out.push(openingLines(x, y, w, h, hg, `${k}o`));
          if (n.panel === 'tiltturn') out.push(openingLines(x, y, w, h, 'bottom', `${k}o2`));
          out.push(handle(hg === 'left' ? x + w - SASH / 2 : x + SASH / 2, y + h / 2, true, `${k}h`));
        }
        if (n.mesh) out.push(tag(x + w - fs * 0.3, y + SASH + fs * 0.5, 'M', `${k}m`, 0.5, 'end'));
        if (!isMesh) out.push(numberBadge(x + w / 2, y + h / 2 - fs * 0.6, first, `${k}n`));
        break;
      }
      case 'twin': {
        const half = w / 2;
        const fm = SASH * 0.6;
        sashShadow(x, y, w, h, `${k}sh`);
        out.push(sashBox(x, y, half + fm / 2, h, `${k}s1`));
        out.push(sashBox(x + half - fm / 2, y, half + fm / 2, h, `${k}s2`));
        panes.push({ x: x + SASH, y: y + SASH, w: half + fm / 2 - 2 * SASH, h: h - 2 * SASH });
        panes.push({ x: x + half - fm / 2 + SASH, y: y + SASH, w: half + fm / 2 - 2 * SASH, h: h - 2 * SASH });
        out.push(openingLines(x, y, half + fm / 2, h, 'left', `${k}o1`));
        out.push(openingLines(x + half - fm / 2, y, half + fm / 2, h, 'right', `${k}o2`));
        out.push(handle(x + half - fm, y + h / 2, true, `${k}h`));
        out.push(numberBadge(x + half / 2, y + h / 2 - fs * 0.6, first, `${k}n1`));
        out.push(numberBadge(x + half * 1.5, y + h / 2 - fs * 0.6, first + 1, `${k}n2`));
        if (n.mesh) out.push(tag(x + w - fs * 0.3, y + SASH + fs * 0.5, 'M', `${k}m`, 0.5, 'end'));
        break;
      }
      case 'sliding':
      case 'monorail': {
        const count = sashCount(n);
        const overlap = SASH;
        const sw = (w + (count - 1) * overlap) / count;
        if (n.mesh && n.panel === 'sliding') {
          out.push(<rect key={`${k}mesh`} x={outside ? x : x + w - sw} y={y} width={sw} height={h} fill={`url(#mesh${uid})`} opacity={0.9} />);
        }
        for (let i = 0; i < count; i++) {
          const idx = outside ? count - 1 - i : i;
          const sx = x + i * (sw - overlap);
          out.push(sashBox(sx, y, sw, h, `${k}s${i}`));
          if (fine && i > 0 && h > 2 * SASH + 1) {
            // interlock profile on the meeting stile of the sash in front
            const iw = SASH * 0.42;
            out.push(
              <g key={`${k}il${i}`} pointerEvents="none">
                <rect x={sx} y={y + SASH} width={iw} height={h - 2 * SASH} fill={tone(-0.6)} opacity={0.55} />
                <line x1={sx + iw} y1={y + SASH} x2={sx + iw} y2={y + h - SASH} stroke={seam} strokeWidth={seamW} />
              </g>,
            );
          }
          panes.push({ x: sx + SASH, y: y + SASH, w: sw - 2 * SASH, h: h - 2 * SASH });
          const label = `S${first + idx}`;
          out.push(tag(sx + sw / 2, y + SASH + fs * 0.55, label, `${k}t${i}`, 0.55));
          out.push(numberBadge(sx + sw / 2, y + h * 0.42, first + idx, `${k}n${i}`));
          // direction arrow: left half slides right, right half slides left, middle both
          const ay = y + h * 0.42 + fs * 1.05;
          const len = Math.min(sw * 0.35, fs * 2.4);
          const mid = (count - 1) / 2;
          if (i < mid) out.push(arrow(sx + sw / 2 - len / 2, ay, sx + sw / 2 + len / 2, `${k}a${i}`));
          else if (i > mid) out.push(arrow(sx + sw / 2 + len / 2, ay, sx + sw / 2 - len / 2, `${k}a${i}`));
          else out.push(arrow(sx + sw / 2 - len / 2, ay, sx + sw / 2 + len / 2, `${k}a${i}`, true));
          // handle on the meeting side
          const meetRight = i < mid || (i === mid && count % 2 === 1 && i === 0);
          const hx = meetRight ? sx + sw - SASH / 2 : sx + SASH / 2;
          out.push(handle(hx, y + h / 2, true, `${k}h${i}`));
          if (showLabels && n.panel === 'sliding' && count === 2) {
            const ghh = Math.round(lr.h / 2 - 41);
            out.push(tag(meetRight ? sx + sw - SASH - fs * 0.2 : sx + SASH + fs * 0.2, y + h / 2 + fs * 0.2, `GHH = ${ghh}`, `${k}g${i}`, 0.42, meetRight ? 'end' : 'start'));
          }
        }
        break;
      }
      case 'bifold': {
        const count = sashCount(n);
        const sw = w / count;
        for (let i = 0; i < count; i++) {
          const sx = x + i * sw;
          out.push(sashBox(sx, y, sw, h, `${k}s${i}`));
          panes.push({ x: sx + SASH, y: y + SASH, w: sw - 2 * SASH, h: h - 2 * SASH });
          out.push(openingLines(sx, y, sw, h, i % 2 === 0 ? 'left' : 'right', `${k}o${i}`));
          out.push(numberBadge(sx + sw / 2, y + h / 2 - fs * 0.6, first + i, `${k}n${i}`));
        }
        out.push(handle(x + w - SASH / 2, y + h / 2, true, `${k}h`));
        break;
      }
    }
    // ---- add-on overlays ----
    if (n.georgian && (n.georgian.rows || n.georgian.cols)) {
      const bar = Math.max(lw * 2.5, 18);
      panes.forEach((p, pi) => {
        for (let r = 1; r <= n.georgian!.rows; r++) {
          const gy = p.y + (p.h * r) / (n.georgian!.rows + 1);
          out.push(<rect key={`${k}gr${pi}-${r}`} x={p.x} y={gy - bar / 2} width={p.w} height={bar} fill={fillOf('m', 'h')} stroke={edge} strokeWidth={seamW} pointerEvents="none" />);
        }
        for (let c = 1; c <= n.georgian!.cols; c++) {
          const gx = p.x + (p.w * c) / (n.georgian!.cols + 1);
          out.push(<rect key={`${k}gc${pi}-${c}`} x={gx - bar / 2} y={p.y} width={bar} height={p.h} fill={fillOf('m', 'v')} stroke={edge} strokeWidth={seamW} pointerEvents="none" />);
        }
      });
    }
    if (n.grill) {
      const gap = 110;
      const bars = Math.max(2, Math.floor(w / gap));
      const parts: ReactNode[] = [];
      for (let i = 1; i < bars; i++) {
        const gx = x + (w * i) / bars;
        parts.push(<line key={i} x1={gx} y1={y} x2={gx} y2={y + h} stroke="#6b7280" strokeWidth={lw * 1.6} />);
      }
      parts.push(<line key="t" x1={x} y1={y + h * 0.33} x2={x + w} y2={y + h * 0.33} stroke="#6b7280" strokeWidth={lw * 1.4} />);
      parts.push(<line key="b" x1={x} y1={y + h * 0.66} x2={x + w} y2={y + h * 0.66} stroke="#6b7280" strokeWidth={lw * 1.4} />);
      out.push(<g key={`${k}grill`} opacity={0.75} pointerEvents="none">{parts}</g>);
    }
    if (n.pleated) {
      const parts: ReactNode[] = [];
      const pleatBand = (bx: number, bw: number, key: string) => {
        const folds = Math.max(4, Math.floor(bw / 22));
        let d = `M${bx} ${y}`;
        for (let i = 1; i <= folds; i++) d += `L${bx + (bw * i) / folds} ${i % 2 ? y + h * 0.02 : y}`;
        const lines: ReactNode[] = [];
        for (let i = 0; i <= folds; i++) {
          const fx = bx + (bw * i) / folds;
          lines.push(<line key={i} x1={fx} y1={y} x2={fx} y2={y + h} stroke="#7d8f9b" strokeWidth={lw * 0.7} />);
        }
        parts.push(
          <g key={key}>
            <rect x={bx} y={y} width={bw} height={h} fill="#dfe7ec" opacity={0.85} />
            {lines}
            <path d={d} fill="none" stroke="#7d8f9b" strokeWidth={lw * 0.7} />
          </g>,
        );
      };
      const band = Math.max(fs * 1.4, w * 0.16);
      const side = n.pleated === 'left' || n.pleated === 'right' ? (outside ? (n.pleated === 'left' ? 'right' : 'left') : n.pleated) : n.pleated;
      if (side === 'right' || side === 'double') pleatBand(x + w - band, band, 'pr');
      if (side === 'left' || side === 'double') pleatBand(x, band, 'pl');
      if (side === 'pulldown') {
        const box = Math.max(fs * 0.9, h * 0.07);
        parts.push(<rect key="cas" x={x} y={y} width={w} height={box} fill="#cfd8de" stroke="#7d8f9b" strokeWidth={lw * 0.7} />);
        parts.push(<rect key="scr" x={x} y={y + box} width={w} height={h * 0.35} fill={`url(#mesh${uid})`} opacity={0.75} />);
        parts.push(<rect key="bar" x={x} y={y + box + h * 0.35} width={w} height={fs * 0.25} fill="#7d8f9b" />);
      }
      parts.push(tag(x + w / 2, y + h - fs * 0.8, side === 'pulldown' ? 'PULL-DOWN MESH' : 'PLEATED MESH', `${k}plt`, 0.42));
      out.push(<g key={`${k}pleat`} pointerEvents="none">{parts}</g>);
    }
    if (interactive || selectedId) {
      out.push(
        <rect
          key={`${k}hit`}
          x={x}
          y={y}
          width={w}
          height={h}
          fill={selectedId === n.id ? 'rgba(251, 191, 140, 0.45)' : 'transparent'}
          stroke={selectedId === n.id ? '#f59e5b' : 'none'}
          strokeWidth={lw * 3}
          strokeDasharray={selectedId === n.id ? `${fs * 0.4} ${fs * 0.2}` : undefined}
          style={interactive ? { cursor: 'pointer' } : undefined}
          onClick={
            interactive
              ? (e) => {
                  e.stopPropagation();
                  onSelect?.(n.id === selectedId ? null : n.id);
                }
              : undefined
          }
        />,
      );
    }
    return out;
  };

  leaves.forEach((lr) => nodes.push(...renderLeaf(lr)));

  // mullions: the visible profile is butted (T-joint) against the inner edges of whatever it runs into; the
  // click target keeps the full centre-line length
  const mullionNodes = mullions.map((m) => {
    const selected = selectedId === m.nodeId;
    const hit = interactive
      ? {
          fill: 'transparent',
          style: { cursor: 'pointer' },
          onClick: (e: React.MouseEvent) => {
            e.stopPropagation();
            onSelect?.(selected ? null : m.nodeId);
          },
        }
      : null;
    const line = selected ? { c: '#1565c0', w: lw * 3 } : joint;
    const a = m.dir === 'v' ? m.y : m.x;
    const total = m.dir === 'v' ? H : W;
    const s0 = a + (a <= 0.5 ? FRAME : MULL / 2);
    const len = Math.max(0, a + m.length - (a + m.length >= total - 0.5 ? FRAME : MULL / 2) - s0);
    if (m.dir === 'v') {
      const x = mx(m.x) - MULL / 2;
      return (
        <g key={`m${m.label}`}>
          <rect x={x} y={s0} width={MULL} height={len} fill={fillOf('m', 'v')} stroke={line.c} strokeWidth={line.w} pointerEvents="none" />
          {hit && <rect x={x} y={m.y} width={MULL} height={m.length} {...hit} />}
          {showLabels && tag(x + MULL / 2, m.y + m.length / 2 + fs * 1.4, m.label, `ml${m.label}`, 0.42)}
        </g>
      );
    }
    return (
      <g key={`m${m.label}`}>
        <rect x={mx(s0, len)} y={m.y - MULL / 2} width={len} height={MULL} fill={fillOf('m', 'h')} stroke={line.c} strokeWidth={line.w} pointerEvents="none" />
        {hit && <rect x={mx(m.x, m.length)} y={m.y - MULL / 2} width={m.length} height={MULL} {...hit} />}
        {showLabels && tag(mx(m.x, m.length) + m.length / 2 + fs * 2, m.y, m.label, `ml${m.label}`, 0.42)}
      </g>
    );
  });

  // frame: four welded, mitred members; drainage slots (drain caps outside) in the bottom member and the
  // track lip of sliding windows
  const F = FRAME;
  const frameDetails: ReactNode[] = [];
  if (fine) {
    const slotH = Math.max(5, pxmm(1.6));
    const drain = (cx: number, key: string) => {
      const cy = H - F * 0.36;
      if (!outside) return <rect key={key} x={cx - 17} y={cy - slotH / 2} width={34} height={slotH} rx={slotH / 2} fill="#454b52" />;
      const ch = Math.max(14, pxmm(3.6));
      return (
        <g key={key}>
          <rect x={cx - 25} y={cy - ch / 2} width={50} height={ch} rx={ch / 2.2} fill={tone(0.75)} stroke={edge} strokeWidth={seamW} />
          <rect x={cx - 14} y={cy + ch * 0.06} width={28} height={Math.max(3, pxmm(1.1))} rx={1.5} fill="#454b52" />
        </g>
      );
    };
    for (const lr of leaves) {
      const n = lr.node;
      const xa = lr.x + (lr.x <= 0.5 ? F : MULL / 2);
      const xb = lr.x + lr.w - (lr.x + lr.w >= W - 0.5 ? F : MULL / 2);
      const span = xb - xa;
      if (span < 60) continue;
      if (n.panel === 'sliding' || n.panel === 'monorail') {
        if (lr.y + lr.h >= H - 0.5) frameDetails.push(<line key={`tb${n.id}`} x1={mx(xa)} y1={H - F * 0.7} x2={mx(xb)} y2={H - F * 0.7} stroke={seam} strokeWidth={seamW} />);
        if (lr.y <= 0.5) frameDetails.push(<line key={`tt${n.id}`} x1={mx(xa)} y1={F * 0.7} x2={mx(xb)} y2={F * 0.7} stroke={seam} strokeWidth={seamW} />);
      }
      if (lr.y + lr.h < H - 0.5) continue;
      const off = Math.min(Math.max(90, span * 0.16), span / 2);
      const xs = span > 450 ? [xa + off, xb - off] : [xa + span / 2];
      xs.forEach((cx, j) => frameDetails.push(drain(mx(cx), `dr${n.id}${j}`)));
    }
  }
  const frame = (
    <g key="frame" pointerEvents="none">
      {ring(0, 0, W, H, F, 'fr', 'p', dark, joint)}
      {frameDetails}
      {showLabels && tag(W - F - fs * 0.25, H - F - fs * 0.6, 'F1', 'f1', 0.55, 'end')}
    </g>
  );

  // dimensions
  const dims: DimSpec[] = [];
  if (showDims) {
    const top = data.root.kind === 'split' ? data.root : null;
    const step = b.dimStep;
    const wLevel = top && top.dir === 'v' ? 2 : 1;
    const hLevel = top && top.dir === 'h' ? 2 : 1;
    dims.push({ key: 'w', x1: 0, y1: H + step * wLevel, x2: W, y2: H + step * wLevel, value: W, vertical: false, target: { kind: 'width' } });
    dims.push({ key: 'h', x1: -step * hLevel, y1: 0, x2: -step * hLevel, y2: H, value: H, vertical: true, target: { kind: 'height' } });
    if (top) {
      const sizes = normaliseSizes(top.sizes, top.children.length, top.dir === 'v' ? W : H);
      let off = 0;
      sizes.forEach((s, i) => {
        if (top.dir === 'v') {
          const x1 = mx(off, s);
          dims.push({ key: `c${i}`, x1, y1: H + step, x2: x1 + s, y2: H + step, value: s, vertical: false, target: { kind: 'child', splitId: top.id, index: i, value: s } });
        } else {
          dims.push({ key: `c${i}`, x1: -step, y1: off, x2: -step, y2: off + s, value: s, vertical: true, target: { kind: 'child', splitId: top.id, index: i, value: s } });
        }
        off += s;
      });
    }
    // nested splits get compact dimension labels inside their cells
    for (const s of splits) {
      if (s.depth === 0) continue;
      let off = 0;
      s.sizes.forEach((size, i) => {
        if (s.node.dir === 'v') {
          const x1 = mx(s.x + off, size);
          dims.push({ key: `n${s.node.id}${i}`, x1, y1: s.y + s.h - FRAME * 0.2 - fs * 0.9, x2: x1 + size, y2: s.y + s.h - FRAME * 0.2 - fs * 0.9, value: size, vertical: false, target: { kind: 'child', splitId: s.node.id, index: i, value: size } });
        } else {
          const x1 = mx(s.x, s.w) + FRAME + fs * 0.9;
          dims.push({ key: `n${s.node.id}${i}`, x1, y1: s.y + off, x2: x1, y2: s.y + off + size, value: size, vertical: true, target: { kind: 'child', splitId: s.node.id, index: i, value: size } });
        }
        off += size;
      });
    }
  }

  const dimNodes = dims.map((d) => {
    const nested = d.key.startsWith('n');
    const f = nested ? fs * 0.55 : fs;
    const label = String(Math.round(d.value * 10) / 10);
    const tw = label.length * f * 0.62 + f * 0.9;
    const th = f * 1.45;
    const cx = (d.x1 + d.x2) / 2;
    const cy = (d.y1 + d.y2) / 2;
    const tick = f * 0.5;
    const clickable = interactive && !!onDimClick;
    return (
      <g key={d.key}>
        {d.vertical ? (
          <>
            <line x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} stroke="#6b7280" strokeWidth={lw * 0.7} markerStart={`url(#da${uid})`} markerEnd={`url(#db${uid})`} />
            {!nested && (
              <>
                <line x1={d.x1 - tick} y1={d.y1} x2={d.x1 + tick} y2={d.y1} stroke="#6b7280" strokeWidth={lw * 0.7} />
                <line x1={d.x1 - tick} y1={d.y2} x2={d.x1 + tick} y2={d.y2} stroke="#6b7280" strokeWidth={lw * 0.7} />
              </>
            )}
          </>
        ) : (
          <>
            <line x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} stroke="#6b7280" strokeWidth={lw * 0.7} markerStart={`url(#da${uid})`} markerEnd={`url(#db${uid})`} />
            {!nested && (
              <>
                <line x1={d.x1} y1={d.y1 - tick} x2={d.x1} y2={d.y1 + tick} stroke="#6b7280" strokeWidth={lw * 0.7} />
                <line x1={d.x2} y1={d.y1 - tick} x2={d.x2} y2={d.y1 + tick} stroke="#6b7280" strokeWidth={lw * 0.7} />
              </>
            )}
          </>
        )}
        <g
          transform={d.vertical ? `rotate(-90 ${cx} ${cy})` : undefined}
          style={clickable ? { cursor: 'pointer' } : undefined}
          data-tour={clickable ? 'cfg-dim' : undefined}
          onClick={clickable ? (e) => { e.stopPropagation(); onDimClick?.(d.target, e); } : undefined}
        >
          <rect x={cx - tw / 2} y={cy - th / 2} width={tw} height={th} rx={f * 0.15} fill="#fff" stroke={clickable ? '#cbd5e1' : 'none'} strokeWidth={lw * 0.6} />
          <text x={cx} y={cy} fontSize={f} textAnchor="middle" dominantBaseline="central" fill="#111827">
            {label}
          </text>
        </g>
      </g>
    );
  });

  // floor & plan
  const floorY = b.floorY;
  const floorNodes: ReactNode[] = [];
  if (showFloor) {
    const fx1 = -FRAME;
    const fx2 = W + FRAME;
    floorNodes.push(
      <g key="floor">
        <rect x={fx1} y={floorY} width={fx2 - fx1} height={fs * 0.35} fill="#5b5b5b" />
        <rect x={fx1} y={floorY + fs * 0.35} width={fx2 - fx1} height={fs * 0.45} fill={`url(#hatch${uid})`} />
        <g style={onFloorClick ? { cursor: 'pointer' } : undefined} onClick={onFloorClick}>
          <path d={`M${W + fs * 0.4} ${floorY - fs * 0.6}h${fs * 1.1}l${-fs * 0.55} ${fs * 0.6}z`} fill="#111" />
          <rect x={W + fs * 1.6} y={floorY - fs * 1.15} width={fs * 2.6} height={fs * 0.95} fill="#fff" stroke="#374151" strokeWidth={lw * 0.6} />
          <text x={W + fs * 1.75} y={floorY - fs * 0.67} fontSize={fs * 0.55} dominantBaseline="central" fill="#111">
            Floor {data.floorAperture}
          </text>
        </g>
      </g>,
    );
  }
  if (showPlan && hasSliding) {
    const py = (showFloor ? floorY + fs * 2 : H + b.dimStep * 2.2) + fs * 1.2;
    const depth = fs * 1.6;
    const parts: ReactNode[] = [];
    parts.push(<text key="out" x={W / 2} y={py - fs * 0.5} fontSize={fs * 0.5} textAnchor="middle" fill="#111">{outside ? 'IN' : 'OUT'}</text>);
    parts.push(<rect key="pf" x={0} y={py} width={W} height={depth} fill="none" stroke="#374151" strokeWidth={lw} />);
    for (const lr of leaves) {
      const n = lr.node;
      if (n.panel !== 'sliding' && n.panel !== 'monorail') continue;
      const count = sashCount(n);
      const tracks = n.panel === 'monorail' ? 1 : n.mesh ? 3 : n.tracks || 2;
      const sw = (lr.w + (count - 1) * SASH) / count;
      for (let i = 0; i < count; i++) {
        const t = i % Math.min(tracks, 2);
        const sx = mx(lr.x + i * (sw - SASH), sw);
        const ty = py + depth * 0.18 + t * depth * 0.32;
        parts.push(<rect key={`p${n.id}${i}`} x={sx} y={ty} width={sw} height={depth * 0.22} fill="#fff" stroke="#374151" strokeWidth={lw * 0.8} />);
      }
      if (n.mesh) parts.push(<rect key={`pm${n.id}`} x={mx(lr.x + lr.w - sw, sw)} y={py + depth * 0.82} width={sw} height={depth * 0.1} fill="#94a3b8" />);
    }
    parts.push(<text key="in" x={W / 2} y={py + depth + fs * 0.75} fontSize={fs * 0.5} textAnchor="middle" fill="#111">{outside ? 'OUT' : 'IN'}</text>);
    floorNodes.push(<g key="plan" pointerEvents="none">{parts}</g>);
  }

  // profile shading – every gradient lives in this <svg> (unique ids) so html2canvas can rasterise it on its own
  const grad = (id: string, v: [number, number, number, number], stops: [number, string][]) => (
    <linearGradient key={id} id={`${id}${uid}`} x1={v[0]} y1={v[1]} x2={v[2]} y2={v[3]}>
      {stops.map(([o, c], i) => (
        <stop key={i} offset={o} stopColor={c} />
      ))}
    </linearGradient>
  );
  const shadeDefs = shaded
    ? [
        ...SIDES.map((s) => grad(`p${s}`, SIDE_VEC[s], profileStops(frameColor, light, SIDE_LIT[s][0], SIDE_LIT[s][1]))),
        ...SIDES.map((s) =>
          grad(`b${s}`, SIDE_VEC[s], [
            [0, tone(-0.8)],
            [0.16, tone(0.6)],
            [0.5, tone(0.42)],
            [1, tone(SIDE_LIT[s][1] * 0.85)],
          ]),
        ),
        grad('mv', [0, 0, 1, 0], profileStops(frameColor, light, 0.75, -0.7)),
        grad('mh', [0, 0, 0, 1], profileStops(frameColor, light, 1, -0.9)),
        <linearGradient key="gr" id={`gr${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.3" />
          <stop offset="0.2" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.56" stopColor="#ffffff" stopOpacity="0.34" />
          <stop offset="0.61" stopColor="#ffffff" stopOpacity="0.06" />
          <stop offset="0.66" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="0.7" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>,
      ]
    : null;

  return (
    <svg
      ref={svgRef}
      className={className}
      style={style}
      viewBox={viewBox}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      onClick={interactive ? () => onSelect?.(null) : undefined}
      fontFamily="Roboto, 'Segoe UI', Arial, sans-serif"
    >
      <defs>
        <marker id={`arr${uid}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill="#3b5563" />
        </marker>
        <marker id={`arrs${uid}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill="#3b5563" />
        </marker>
        <marker id={`da${uid}`} viewBox="0 0 10 10" refX="1" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill="#6b7280" />
        </marker>
        <marker id={`db${uid}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto">
          <path d="M0 0L10 5L0 10z" fill="#6b7280" />
        </marker>
        <pattern id={`mesh${uid}`} width="24" height="24" patternUnits="userSpaceOnUse">
          <rect width="24" height="24" fill="#dfe7ec" />
          <path d="M0 0L24 24M24 0L0 24" stroke="#7d8f9b" strokeWidth="2" />
        </pattern>
        <pattern id={`hatch${uid}`} width="30" height="30" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="30" height="30" fill="#fff" />
          <line x1="0" y1="0" x2="0" y2="30" stroke="#777" strokeWidth="6" />
        </pattern>
        {shadeDefs}
      </defs>
      {nodes}
      {mullionNodes}
      {frame}
      {overlay}
      {dimNodes}
      {floorNodes}
    </svg>
  );
}
