import { useId, type ReactNode } from 'react';
import type { DesignData, LeafNode } from '../lib/types';
import { layout, normaliseSizes, paneNumbers, sashCount, type LeafRect } from './model';

export const FRAME = 62;
export const MULL = 74;
export const SASH = 58;
export const GLASS_FILL = '#b8e2f4';

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
  const stroke = shade(frameColor, isLight(frameColor) ? -0.35 : -0.45);
  const sashColor = frameColor;
  const lw = Math.max(1.5, Math.max(W, H) / 700) * strokeScale;
  const glassStroke = shade(glassColor, -0.35);

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

  const sashBox = (x: number, y: number, w: number, h: number, key: string, fill = glassColor, pattern?: string) => (
    <g key={key}>
      <rect x={x} y={y} width={w} height={h} fill={sashColor} stroke={stroke} strokeWidth={lw} />
      <rect x={x + SASH} y={y + SASH} width={Math.max(1, w - 2 * SASH)} height={Math.max(1, h - 2 * SASH)} fill={pattern ? `url(#${pattern})` : fill} stroke={stroke} strokeWidth={lw * 0.8} />
      {/* mitre lines */}
      <path
        d={`M${x} ${y}L${x + SASH} ${y + SASH}M${x + w} ${y}L${x + w - SASH} ${y + SASH}M${x} ${y + h}L${x + SASH} ${y + h - SASH}M${x + w} ${y + h}L${x + w - SASH} ${y + h - SASH}`}
        stroke={stroke}
        strokeWidth={lw * 0.6}
      />
    </g>
  );

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
    return vertical ? (
      <rect key={key} x={x - T / 2} y={y - L / 2} width={T} height={L} rx={T / 2} fill="#374151" pointerEvents="none" />
    ) : (
      <rect key={key} x={x - L / 2} y={y - T / 2} width={L} height={T} rx={T / 2} fill="#374151" pointerEvents="none" />
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
        out.push(<rect key={`${k}g`} x={x} y={y} width={w} height={h} fill={glassColor} stroke={glassStroke} strokeWidth={lw * 0.6} />);
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
        const bladeFill = pvc ? shade(frameColor, isLight(frameColor) ? -0.08 : 0.1) : glassColor;
        for (let i = 0; i < count; i++) {
          const sy = y + (h / count) * i + (h / count) * 0.12;
          const bh = (h / count) * 0.66;
          out.push(
            <path
              key={`${k}b${i}`}
              d={`M${x + w * 0.04} ${sy + bh * 0.25}L${x + w * 0.96} ${sy}V${sy + bh * 0.75}L${x + w * 0.04} ${sy + bh}Z`}
              fill={bladeFill}
              stroke={pvc ? stroke : glassStroke}
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
          out.push(<rect key={`${k}gr${pi}-${r}`} x={p.x} y={gy - bar / 2} width={p.w} height={bar} fill={frameColor} stroke={stroke} strokeWidth={lw * 0.4} pointerEvents="none" />);
        }
        for (let c = 1; c <= n.georgian!.cols; c++) {
          const gx = p.x + (p.w * c) / (n.georgian!.cols + 1);
          out.push(<rect key={`${k}gc${pi}-${c}`} x={gx - bar / 2} y={p.y} width={bar} height={p.h} fill={frameColor} stroke={stroke} strokeWidth={lw * 0.4} pointerEvents="none" />);
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

  // mullions
  const mullionNodes = mullions.map((m) => {
    const selected = selectedId === m.nodeId;
    const common = {
      fill: frameColor,
      stroke: selected ? '#1565c0' : stroke,
      strokeWidth: selected ? lw * 3 : lw,
      style: interactive ? { cursor: 'pointer' } : undefined,
      onClick: interactive
        ? (e: React.MouseEvent) => {
            e.stopPropagation();
            onSelect?.(selected ? null : m.nodeId);
          }
        : undefined,
    };
    if (m.dir === 'v') {
      const x = mx(m.x) - MULL / 2;
      return (
        <g key={`m${m.label}`}>
          <rect x={x} y={m.y} width={MULL} height={m.length} {...common} />
          {showLabels && tag(x + MULL / 2, m.y + m.length / 2 + fs * 1.4, m.label, `ml${m.label}`, 0.42)}
        </g>
      );
    }
    return (
      <g key={`m${m.label}`}>
        <rect x={mx(m.x, m.length)} y={m.y - MULL / 2} width={m.length} height={MULL} {...common} />
        {showLabels && tag(mx(m.x, m.length) + m.length / 2 + fs * 2, m.y, m.label, `ml${m.label}`, 0.42)}
      </g>
    );
  });

  // frame (mitred)
  const F = FRAME;
  const frame = (
    <g key="frame" pointerEvents="none">
      <path d={`M0 0H${W}L${W - F} ${F}H${F}Z`} fill={frameColor} stroke={stroke} strokeWidth={lw} />
      <path d={`M0 ${H}H${W}L${W - F} ${H - F}H${F}Z`} fill={frameColor} stroke={stroke} strokeWidth={lw} />
      <path d={`M0 0L${F} ${F}V${H - F}L0 ${H}Z`} fill={frameColor} stroke={stroke} strokeWidth={lw} />
      <path d={`M${W} 0L${W - F} ${F}V${H - F}L${W} ${H}Z`} fill={frameColor} stroke={stroke} strokeWidth={lw} />
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

  const viewBox = props.viewBox || `${b.x} ${b.y} ${b.w} ${b.h}`;
  return (
    <svg
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
