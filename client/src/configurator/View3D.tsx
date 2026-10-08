import { useEffect, useMemo, useRef, useState, type CSSProperties, type JSX } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { DesignData, LeafNode } from '../lib/types';
import { layout, sashCount } from './model';

/* ------------------------------------------------------------------------------------------------
 * 3D view of a window design. 1 unit = 1 mm. The window is centred on the origin with X to the
 * right, Y up and +Z pointing to the inside of the building (the "inside" face looks at +Z).
 * Geometry conventions mirror DesignSvg (frame / mullion / sash face widths, insets, overlaps).
 * --------------------------------------------------------------------------------------------- */

export interface View3DProps {
  data: DesignData;
  frameColor: string;
  glassColor?: string;
  view?: 'inside' | 'outside';
  wall?: boolean;
  realistic?: boolean;
  /** Section view: the window is cut horizontally through its middle (upper half removed) and built from
   *  extruded multi-chamber profile cross-sections so the chambers show at the cut. */
  section?: boolean;
  className?: string;
  style?: CSSProperties;
}

// profile sight lines (same as the 2D renderer)
const FRAME = 62;
const MULL = 74;
const SASH = 58;
const GLASS_FILL = '#b8e2f4';
const BG = '#f4f6f9';

// depths (mm)
const BASE_DEPTH = 62;
const GLASS_T = 6;
const GLASS_BITE = 8; // glass edge hidden inside the profile
const CASE_SASH_D = 60;
const SASH_PROUD = 8; // casement sashes stand proud of the frame on the inside
const SL_SASH_D = 18;
const TRACK_STEP = 20;
const BEAD_W = 16;
const BEAD_D = 18;
const LIP_W = 12;
const WALL_D = 230;

// section view profiles (mm)
const WALL_T = 2.5; // uPVC outer wall
const WEB_T = 2; // internal web
const CHAMFER = 3;
const GAP = 0.5; // glazing clearance
const RAIL_CLR = 6; // jamb rails stop short of the sill / head rails
const CUT_LIFT = 0.15; // section outlines sit just above the cap fill

// texture tiles (mm)
const BRICK_TILE_W = 480; // 2 bricks of 230 + 10 mortar
const BRICK_TILE_H = 510; // 6 courses of 75 + 10 mortar
const HATCH_TILE = 40;
const MESH_TILE = 22;

// camera
const FOV = 35;
const YAW = (25 * Math.PI) / 180;
const PITCH = (10 * Math.PI) / 180;
const SEC_YAW = (22 * Math.PI) / 180;
const SEC_PITCH = (35 * Math.PI) / 180;
const KEY_DIR = new THREE.Vector3(0.45, 0.7, 0.75).normalize();
const FILL_DIR = new THREE.Vector3(-0.7, 0.15, 0.45).normalize();
const BACK_DIR = new THREE.Vector3(0.3, 0.4, -0.85).normalize();
const FONT = 'Roboto, "Segoe UI", Arial, sans-serif';

type V3 = [number, number, number];
type P2 = [number, number];
type Disposable = { dispose(): void };

/* ------------------------------------------------------------------ colour helpers */

function cssHex(v: string | undefined, fallback: string): string {
  const s = (v || '').trim();
  const m6 = /^#?([0-9a-f]{6})$/i.exec(s);
  if (m6) return `#${m6[1].toLowerCase()}`;
  const m3 = /^#?([0-9a-f]{3})$/i.exec(s);
  if (m3) return `#${m3[1].split('').map((c) => c + c).join('').toLowerCase()}`;
  return fallback;
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function isLight(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 170;
}

function num(v: unknown, fallback: number, min: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, n) : fallback;
}

const fmt = (v: number) => String(Math.round(v * 10) / 10);

/* ------------------------------------------------------------------ geometry batching */

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();

/** Accumulates flat-shaded triangles for one material so a whole layer is a single draw call. */
class Batch {
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly uv: number[] = [];
  readonly tile: number;

  constructor(tile = 0) {
    this.tile = tile;
  }

  /** Convex polygon, counter-clockwise when seen from the side its normal points to. */
  poly(verts: V3[], n: V3, m: THREE.Matrix4 | null) {
    let nx = n[0];
    let ny = n[1];
    let nz = n[2];
    let pts = verts;
    if (m) {
      _nm.getNormalMatrix(m);
      _n.set(nx, ny, nz).applyMatrix3(_nm).normalize();
      nx = _n.x;
      ny = _n.y;
      nz = _n.z;
      pts = verts.map((v): V3 => {
        _p.set(v[0], v[1], v[2]).applyMatrix4(m);
        return [_p.x, _p.y, _p.z];
      });
    }
    for (let i = 1; i < pts.length - 1; i++) {
      this.vert(pts[0], nx, ny, nz);
      this.vert(pts[i], nx, ny, nz);
      this.vert(pts[i + 1], nx, ny, nz);
    }
  }

  private vert(p: V3, nx: number, ny: number, nz: number) {
    this.pos.push(p[0], p[1], p[2]);
    this.nrm.push(nx, ny, nz);
    if (this.tile > 0) {
      // box mapping in mm, so patterns keep their real-world scale on every face
      const ax = Math.abs(nx);
      const ay = Math.abs(ny);
      const az = Math.abs(nz);
      let u: number;
      let v: number;
      if (az >= ax && az >= ay) {
        u = p[0];
        v = p[1];
      } else if (ax >= ay) {
        u = p[2];
        v = p[1];
      } else {
        u = p[0];
        v = p[2];
      }
      this.uv.push(u / this.tile, v / this.tile);
    }
  }
}

function seg(lines: number[], a: V3, b: V3, m: THREE.Matrix4 | null) {
  if (m) {
    _p.set(a[0], a[1], a[2]).applyMatrix4(m);
    lines.push(_p.x, _p.y, _p.z);
    _p.set(b[0], b[1], b[2]).applyMatrix4(m);
    lines.push(_p.x, _p.y, _p.z);
  } else lines.push(a[0], a[1], a[2], b[0], b[1], b[2]);
}

/** Extrudes a convex CCW polygon (XY) between z0 and z1. */
function prism(b: Batch, pts: P2[], z0: number, z1: number, m: THREE.Matrix4 | null = null, lines: number[] | null = null) {
  const n = pts.length;
  b.poly(pts.map(([x, y]): V3 => [x, y, z1]), [0, 0, 1], m);
  b.poly(pts.map(([x, y]): V3 => [x, y, z0]).reverse(), [0, 0, -1], m);
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % n];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    b.poly(
      [
        [ax, ay, z0],
        [bx, by, z0],
        [bx, by, z1],
        [ax, ay, z1],
      ],
      [dy / len, -dx / len, 0],
      m,
    );
    if (lines) {
      seg(lines, [ax, ay, z1], [bx, by, z1], m);
      seg(lines, [ax, ay, z0], [bx, by, z0], m);
      seg(lines, [ax, ay, z0], [ax, ay, z1], m);
    }
  }
}

const rectPts = (x0: number, y0: number, x1: number, y1: number): P2[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

function box(b: Batch, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, m: THREE.Matrix4 | null = null) {
  prism(b, rectPts(cx - sx / 2, cy - sy / 2, cx + sx / 2, cy + sy / 2), cz - sz / 2, cz + sz / 2, m);
}

/** Rectangular ring of four mitred members (outer rect x0..x1 / y0..y1, face width f). */
function ring(b: Batch, x0: number, y0: number, x1: number, y1: number, f: number, z0: number, z1: number, lines: number[] | null) {
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0.5 || h <= 0.5) return;
  if (w <= 2 * f + 1 || h <= 2 * f + 1) {
    prism(b, rectPts(x0, y0, x1, y1), z0, z1, null, lines);
    return;
  }
  prism(b, [[x0, y0], [x1, y0], [x1 - f, y0 + f], [x0 + f, y0 + f]], z0, z1, null, lines); // bottom
  prism(b, [[x0 + f, y1 - f], [x1 - f, y1 - f], [x1, y1], [x0, y1]], z0, z1, null, lines); // top
  prism(b, [[x0, y0], [x0 + f, y0 + f], [x0 + f, y1 - f], [x0, y1]], z0, z1, null, lines); // left
  prism(b, [[x1 - f, y0 + f], [x1, y0], [x1, y1], [x1 - f, y1 - f]], z0, z1, null, lines); // right
}

function batchMesh(b: Batch, mat: THREE.Material, bin: Disposable[], shadows: boolean): THREE.Mesh | null {
  if (!b.pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
  if (b.tile > 0) g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
  g.computeBoundingSphere();
  bin.push(g);
  const mesh = new THREE.Mesh(g, mat);
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  return mesh;
}

/* ------------------------------------------------------------------ section view: extruded profiles */

/** 2D profile cross-section in (u, z): u runs across the member (0 = outer edge, + towards the opening), z is world depth. */
interface Profile {
  outer: P2[]; // counter-clockwise
  holes: P2[][]; // clockwise chambers
  pts: P2[]; // outer followed by every hole, indexed by tris
  tris: number[][];
  uMin: number;
  uMax: number;
}

/** A straight member: profile (u, z) swept along s from 0 to len, optionally 45° mitred at either end. */
interface Member {
  o: V3; // origin (outer corner where the member starts)
  s: V3; // unit axis along the member
  u: V3; // unit axis across the member, in the window plane
  len: number;
  m0: boolean;
  m1: boolean;
}

interface Cut {
  y: number; // cut plane height (model space)
  lines: number[]; // section outlines drawn on the cut
}

interface Notch {
  a: number;
  b: number;
  dep: number;
}

const v2 = (p: P2) => new THREE.Vector2(p[0], p[1]);

function makeProfile(outer: P2[], holes: P2[][], dz = 0): Profile {
  const sh = (pts: P2[]) => pts.map(([u, z]): P2 => [u, z + dz]);
  let o = sh(outer);
  if (THREE.ShapeUtils.isClockWise(o.map(v2))) o = o.reverse();
  const hs = holes.map((h) => {
    const p = sh(h);
    return THREE.ShapeUtils.isClockWise(p.map(v2)) ? p : p.reverse();
  });
  const tris = THREE.ShapeUtils.triangulateShape(o.map(v2), hs.map((h) => h.map(v2)));
  let uMin = Infinity;
  let uMax = -Infinity;
  for (const [u] of o) {
    uMin = Math.min(uMin, u);
    uMax = Math.max(uMax, u);
  }
  return { outer: o, holes: hs, pts: o.concat(...hs), tris, uMin, uMax };
}

/** U-shaped steel reinforcement filling a chamber. */
function steelU(u0: number, z0: number, u1: number, z1: number, th: number, dz: number): Profile {
  return makeProfile(
    [
      [u0, z0],
      [u1, z0],
      [u1, z1],
      [u1 - th, z1],
      [u1 - th, z0 + th],
      [u0 + th, z0 + th],
      [u0 + th, z1],
      [u0, z1],
    ],
    [],
    dz,
  );
}

const cellHole = (holes: P2[][], u0: number, z0: number, u1: number, z1: number) => {
  if (u1 - u0 > 1.5 && z1 - z0 > 1.5) holes.push(rectPts(u0, z0, u1, z1));
};

/** Notch depth (towards the profile) on the opening face within [z0, z1] incl. wall clearance; at least the chamfer at corners. */
const notchDepth = (notches: Notch[], z0: number, z1: number, corner: boolean) =>
  notches.reduce((m, n) => (n.a < z1 + WALL_T && n.b > z0 - WALL_T ? Math.max(m, n.dep) : m), corner ? CHAMFER : 0);

/** Outer frame: face width f (wall side at u = 0), depth d; notches on the opening face. 4 chambers + steel. */
function frameSection(f: number, d: number, dz: number, notches: Notch[]) {
  const t = WALL_T;
  const w = WEB_T;
  const ch = CHAMFER;
  const out: P2[] = [
    [0, 0],
    [f - ch, 0],
    [f, ch],
  ];
  for (const n of notches) out.push([f, n.a], [f - n.dep, n.a], [f - n.dep, n.b], [f, n.b]);
  out.push([f, d - ch], [f - ch, d], [0, d]);
  const r1 = Math.max(9, d * 0.26);
  const r2 = d - Math.max(9, d * 0.22);
  const [a0, a1, b0, b1, c0, c1] = [t, r1 - w / 2, r1 + w / 2, r2 - w / 2, r2 + w / 2, d - t];
  const holes: P2[][] = [];
  cellHole(holes, t, a0, f - t - notchDepth(notches, a0, a1, true), a1); // outside chamber
  cellHole(holes, t, b0, 14 - w / 2, b1); // wall-side chamber
  const mu0 = 14 + w / 2;
  const mu1 = f - t - notchDepth(notches, b0, b1, false);
  cellHole(holes, mu0, b0, mu1, b1); // main (steel) chamber
  cellHole(holes, t, c0, f - t - notchDepth(notches, c0, c1, true), c1); // inside chamber
  return { body: makeProfile(out, holes, dz), steel: steelU(mu0 + 0.6, b0 + 0.6, mu1 - 0.6, b1 - 0.6, 1.5, dz) };
}

/** Mullion / transom: face width f centred on u = 0, depth d; notches on both faces. 6 chambers + steel. */
function mullionSection(f: number, d: number, dz: number, notches: Notch[]) {
  const t = WALL_T;
  const w = WEB_T;
  const ch = CHAMFER;
  const h = f / 2;
  const out: P2[] = [
    [-h + ch, 0],
    [h - ch, 0],
    [h, ch],
  ];
  for (const n of notches) out.push([h, n.a], [h - n.dep, n.a], [h - n.dep, n.b], [h, n.b]);
  out.push([h, d - ch], [h - ch, d], [-h + ch, d], [-h, d - ch]);
  for (const n of notches.slice().reverse()) out.push([-h, n.b], [-h + n.dep, n.b], [-h + n.dep, n.a], [-h, n.a]);
  out.push([-h, ch]);
  const r1 = Math.max(9, d * 0.26);
  const r2 = d - Math.max(9, d * 0.22);
  const [a0, a1, b0, b1, c0, c1] = [t, r1 - w / 2, r1 + w / 2, r2 - w / 2, r2 + w / 2, d - t];
  const holes: P2[][] = [];
  const ua = h - t - notchDepth(notches, a0, a1, true);
  cellHole(holes, -ua, a0, ua, a1);
  const ub = h - t - notchDepth(notches, b0, b1, false);
  cellHole(holes, -ub, b0, -12 - w / 2, b1);
  cellHole(holes, -12 + w / 2, b0, 12 - w / 2, b1);
  cellHole(holes, 12 + w / 2, b0, ub, b1);
  const uc = h - t - notchDepth(notches, c0, c1, true);
  cellHole(holes, -uc, c0, -w / 2, c1);
  cellHole(holes, w / 2, c0, uc, c1);
  return { body: makeProfile(out, holes, dz), steel: steelU(-12 + w / 2 + 0.6, b0 + 0.6, 12 - w / 2 - 0.6, b1 - 0.6, 1.5, dz) };
}

/** Casement sash (SASH x CASE_SASH_D) with the glazing rebate open to the room, its glazing bead and steel. */
function casementSection(dz: number) {
  const f = SASH;
  const d = CASE_SASH_D;
  const t = WALL_T;
  const g0 = d / 2 - GLASS_T / 2 - GAP; // outer glazing stop
  const g1 = d / 2 + GLASS_T / 2 + GAP; // bead seat
  const rb = f - 16; // rebate wall
  const body = makeProfile(
    [
      [0, 0],
      [f - 2, 0],
      [f, 2],
      [f, g0],
      [rb, g0],
      [rb, d],
      [2, d],
      [0, d - 2],
    ],
    [rectPts(t, t, f - t - 2, 11), rectPts(t, 13, 12, d - t - 2), rectPts(14, 13, rb - t, d - t), rectPts(rb - t + WEB_T, 13, f - t, g0 - t)],
    dz,
  );
  const bu = rb + GAP;
  const bead = makeProfile(
    [
      [bu, g1],
      [f, g1],
      [f, d - 12],
      [f - 6, d - 2],
      [bu, d - 2],
    ],
    [rectPts(bu + 1.8, g1 + 1.8, f - 1.8, d - 15)],
    dz,
  );
  return { body, bead, steel: steelU(14.6, 13.6, rb - t - 0.6, d - t - 0.6, 1.5, dz) };
}

/** Sliding sash (SASH x SL_SASH_D): glass pocket, guide-rail groove on the outer edge, 3 chambers + 2 small ones. */
function slidingSection(dz: number) {
  const f = SASH;
  const d = SL_SASH_D;
  const t = 1.8;
  const p0 = d / 2 - GLASS_T / 2 - GAP;
  const p1 = d / 2 + GLASS_T / 2 + GAP;
  const q0 = d / 2 - 2;
  const q1 = d / 2 + 2;
  const pk = f - 10;
  const body = makeProfile(
    [
      [0, 0],
      [f - 1, 0],
      [f, 1],
      [f, p0],
      [pk, p0],
      [pk, p1],
      [f, p1],
      [f, d - 1],
      [f - 1, d],
      [0, d],
      [0, q1],
      [6, q1],
      [6, q0],
      [0, q0],
    ],
    [
      rectPts(t, t, 6, q0 - t),
      rectPts(t, q1 + t, 6, d - t),
      rectPts(6 + t, t, 20, d - t),
      rectPts(22, t, 34, d - t),
      rectPts(36, t, pk - t, d - t),
    ],
    dz,
  );
  return { body, steel: steelU(22.5, t + 0.5, 33.5, d - t - 0.5, 1.2, dz) };
}

const at = (m: Member, s: number, u: number, z: number): V3 => [m.o[0] + m.s[0] * s + m.u[0] * u, m.o[1] + m.s[1] * s + m.u[1] * u, m.o[2] + z];

/** Planar convex polygon whose winding is made to agree with the outward normal n. */
function face(b: Batch, pts: V3[], n: V3) {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const c = pts[(i + 1) % pts.length];
    x += (a[1] - c[1]) * (a[2] + c[2]);
    y += (a[2] - c[2]) * (a[0] + c[0]);
    z += (a[0] - c[0]) * (a[1] + c[1]);
  }
  b.poly(x * n[0] + y * n[1] + z * n[2] < 0 ? pts.slice().reverse() : pts, n, null);
}

/** Flat section cap of an axis-aligned rectangle (x0..x1, z0..z1) lying on the cut plane. */
function cutRect(cap: Batch, cut: Cut, x0: number, x1: number, z0: number, z1: number) {
  const y = cut.y;
  face(cap, [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], [0, 1, 0]);
  const yl = y + CUT_LIFT;
  cut.lines.push(x0, yl, z0, x1, yl, z0, x1, yl, z0, x1, yl, z1, x1, yl, z1, x0, yl, z1, x0, yl, z1, x0, yl, z0);
}

/** Sweeps a profile along a member (walls, end faces), plus the flat cap + outline where it crosses the cut. */
function extrude(b: Batch, p: Profile, m: Member, lines: number[] | null, cut: Cut | null, cap: Batch | null) {
  if (cut) {
    let lo = Infinity;
    for (const s of [0, m.len]) for (const u of [p.uMin, p.uMax]) lo = Math.min(lo, m.o[1] + m.s[1] * s + m.u[1] * u);
    if (lo > cut.y + 0.5) return; // entirely in the removed half
  }
  const half = m.len / 2;
  const s0 = (u: number) => (m.m0 ? Math.min(u, half) : 0);
  const s1 = (u: number) => (m.m1 ? Math.max(m.len - u, half) : m.len);
  for (const loop of [p.outer, ...p.holes]) {
    const n = loop.length;
    for (let i = 0; i < n; i++) {
      const [au, az] = loop[i];
      const [cu, cz] = loop[(i + 1) % n];
      const du = cu - au;
      const dz = cz - az;
      const l = Math.hypot(du, dz);
      if (l < 1e-6) continue;
      const nu = dz / l;
      face(b, [at(m, s0(au), au, az), at(m, s0(cu), cu, cz), at(m, s1(cu), cu, cz), at(m, s1(au), au, az)], [m.u[0] * nu, m.u[1] * nu, -du / l]);
    }
  }
  const r = Math.SQRT1_2;
  const nA: V3 = m.m0 ? [(m.u[0] - m.s[0]) * r, (m.u[1] - m.s[1]) * r, 0] : [-m.s[0], -m.s[1], 0];
  const nB: V3 = m.m1 ? [(m.u[0] + m.s[0]) * r, (m.u[1] + m.s[1]) * r, 0] : [m.s[0], m.s[1], 0];
  for (const t of p.tris) {
    const q = [p.pts[t[0]], p.pts[t[1]], p.pts[t[2]]];
    face(b, q.map(([u, z]) => at(m, s0(u), u, z)), nA);
    face(b, q.map(([u, z]) => at(m, s1(u), u, z)), nB);
  }
  if (lines) {
    const ol = p.outer;
    for (let i = 0; i < ol.length; i++) {
      const [au, az] = ol[i];
      const [cu, cz] = ol[(i + 1) % ol.length];
      seg(lines, at(m, s0(au), au, az), at(m, s1(au), au, az), null);
      seg(lines, at(m, s0(au), au, az), at(m, s0(cu), cu, cz), null);
      seg(lines, at(m, s1(au), au, az), at(m, s1(cu), cu, cz), null);
    }
  }
  if (cut && cap && Math.abs(m.s[1]) > 0.5) {
    const sc = (cut.y - m.o[1]) / m.s[1];
    if (sc > 0 && sc < m.len) {
      for (const t of p.tris) face(cap, [at(m, sc, ...p.pts[t[0]]), at(m, sc, ...p.pts[t[1]]), at(m, sc, ...p.pts[t[2]])], [0, 1, 0]);
      const yl = cut.y + CUT_LIFT;
      for (const loop of [p.outer, ...p.holes]) {
        for (let i = 0; i < loop.length; i++) {
          const a = at(m, sc, ...loop[i]);
          const c = at(m, sc, ...loop[(i + 1) % loop.length]);
          cut.lines.push(a[0], yl, a[2], c[0], yl, c[2]);
        }
      }
    }
  }
}

/** Four mitred members of a rectangular ring (outer rect), u pointing inwards. */
function ringMembers(x0: number, y0: number, x1: number, y1: number): Member[] {
  const w = x1 - x0;
  const h = y1 - y0;
  return [
    { o: [x0, y0, 0], s: [1, 0, 0], u: [0, 1, 0], len: w, m0: true, m1: true },
    { o: [x1, y0, 0], s: [0, 1, 0], u: [-1, 0, 0], len: h, m0: true, m1: true },
    { o: [x1, y1, 0], s: [-1, 0, 0], u: [0, -1, 0], len: w, m0: true, m1: true },
    { o: [x0, y1, 0], s: [0, -1, 0], u: [1, 0, 0], len: h, m0: true, m1: true },
  ];
}

/** Layout y (from the top) of the section cut: mid-height, moved off transoms and the sash rails next to them. */
function cutLevel(H: number, mullions: { dir: 'v' | 'h'; y: number }[]): number {
  const mid = H / 2;
  const pad = 10;
  const busy: [number, number][] = [
    [-1, FRAME + SASH],
    [H - FRAME - SASH, H + 1],
  ];
  for (const m of mullions) if (m.dir === 'h') busy.push([m.y - MULL / 2 - SASH, m.y + MULL / 2 + SASH]);
  if (!busy.some(([a, b]) => mid > a - pad && mid < b + pad)) return mid;
  busy.sort((p, q) => p[0] - q[0]);
  let best = mid;
  let score = Infinity;
  let end = busy[0][1];
  for (let i = 1; i < busy.length; i++) {
    const [a, b] = busy[i];
    if (a - end > 2 * pad) {
      const c = (a + end) / 2;
      const sc = Math.abs(c - mid) - (a - end) * 0.01;
      if (sc < score) {
        score = sc;
        best = c;
      }
    }
    end = Math.max(end, b);
  }
  return best;
}

/** Every profile the section view of one design needs (z already in model space). */
function sectionProfiles(D: number, zf: number, slidingTracks: number[]) {
  const sliding = slidingTracks.length > 0;
  let notches: Notch[];
  if (sliding) {
    // shallow recesses on the opening face that seat the aluminium guide rails
    const iv = slidingTracks.map((tc) => [tc + zf - 5, tc + zf + 5]).sort((p, q) => p[0] - q[0]);
    notches = [];
    for (const [a0, b0] of iv) {
      const a = Math.max(a0, CHAMFER + 0.5);
      const b = Math.min(b0, D - CHAMFER - 0.5);
      if (b - a < 1) continue;
      const last = notches[notches.length - 1];
      if (last && a <= last.b + WALL_T) last.b = Math.max(last.b, b);
      else notches.push({ a, b, dep: 2 });
    }
  } else notches = [{ a: zf - GLASS_T / 2 - GAP, b: D - 6, dep: GLASS_BITE + 1 }]; // glazing rebate
  const zs0 = zf + SASH_PROUD - CASE_SASH_D;
  const zg = GLASS_T / 2 + GAP;
  const memo = new Map<string, Profile>();
  const once = (key: string, make: () => Profile) => {
    let p = memo.get(key);
    if (!p) {
      p = make();
      memo.set(key, p);
    }
    return p;
  };
  const slMemo = new Map<number, { body: Profile; steel: Profile }>();
  return {
    frame: frameSection(FRAME, D, -zf, notches),
    mull: mullionSection(MULL, D, -zf, sliding ? [] : notches),
    casement: casementSection(zs0),
    sliding(z0: number) {
      let p = slMemo.get(z0);
      if (!p) {
        p = slidingSection(z0);
        slMemo.set(z0, p);
      }
      return p;
    },
    // fixed glazing: outer glazing stop and room-side glazing bead
    lip: makeProfile(
      [
        [0, -zf],
        [LIP_W, -zf],
        [LIP_W, -zg - 2],
        [LIP_W - 2, -zg],
        [0, -zg],
      ],
      [rectPts(1.8, -zf + 1.8, LIP_W - 2.2, -zg - 2.5)],
    ),
    bead: makeProfile(
      [
        [0, zg],
        [BEAD_W, zg],
        [BEAD_W, zg + BEAD_D - 9],
        [BEAD_W - 5, GLASS_T / 2 + BEAD_D],
        [0, GLASS_T / 2 + BEAD_D],
      ],
      [rectPts(1.8, zg + 1.8, BEAD_W - 1.8, zg + BEAD_D - 11)],
    ),
    // glass bites into the frame only where the frame has a glazing rebate
    fixedBite: sliding ? 0 : GLASS_BITE,
    rail: (tc: number) =>
      once(`r${tc}`, () =>
        makeProfile(
          [
            [-2, tc - 5],
            [0, tc - 5],
            [0, tc - 1],
            [5, tc - 1],
            [5, tc + 1],
            [0, tc + 1],
            [0, tc + 5],
            [-2, tc + 5],
          ],
          [],
        ),
      ),
    interlock: (za: number, zb: number) => {
      const z0 = Math.min(za, zb);
      const z1 = Math.max(za, zb);
      return once(`i${z0}|${z1}`, () => makeProfile(rectPts(0, z0, 6, z1), z1 - z0 > 6 ? [rectPts(1.5, z0 + 1.5, 4.5, z1 - 1.5)] : []));
    },
  };
}

/* ------------------------------------------------------------------ generated textures */

interface TexCache {
  brick?: THREE.CanvasTexture | null;
  hatch?: THREE.CanvasTexture | null;
  mesh?: THREE.CanvasTexture | null;
  tri?: THREE.CanvasTexture | null;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas2d(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  return g ? [cv, g] : null;
}

/** 2 bricks x 6 courses, running bond, seamless. */
function drawBricks(): HTMLCanvasElement | null {
  const S = 512;
  const c = canvas2d(S, S);
  if (!c) return null;
  const [cv, g] = c;
  g.fillStyle = '#cfc7ba';
  g.fillRect(0, 0, S, S);
  const rows = 6;
  const rh = S / rows;
  const bw = S / 2;
  const mj = 9;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? bw / 2 : 0;
    for (let k = -1; k <= 2; k++) {
      const kk = ((k % 2) + 2) % 2; // the same brick wraps around both edges
      const rnd = mulberry32(r * 97 + kk * 13 + 5);
      const x = k * bw + off + mj / 2;
      const y = r * rh + mj / 2;
      const w = bw - mj;
      const h = rh - mj;
      if (x >= S || x + w <= 0) continue;
      const hue = 9 + rnd() * 10;
      const sat = 40 + rnd() * 16;
      const lig = 30 + rnd() * 12;
      g.fillStyle = `hsl(${hue.toFixed(1)}, ${sat.toFixed(1)}%, ${lig.toFixed(1)}%)`;
      g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(255,255,255,0.09)';
      g.fillRect(x, y, w, 3);
      g.fillStyle = 'rgba(0,0,0,0.14)';
      g.fillRect(x, y + h - 3, w, 3);
      for (let s = 0; s < 70; s++) {
        const sx = x + rnd() * w;
        const sy = y + rnd() * h;
        const sz = 1 + rnd() * 3;
        g.fillStyle = rnd() < 0.55 ? `rgba(0,0,0,${(0.05 + rnd() * 0.12).toFixed(3)})` : `rgba(255,225,205,${(0.04 + rnd() * 0.08).toFixed(3)})`;
        g.fillRect(sx, sy, sz, sz);
      }
    }
  }
  return cv;
}

function drawHatch(): HTMLCanvasElement | null {
  const S = 64;
  const c = canvas2d(S, S);
  if (!c) return null;
  const [cv, g] = c;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  g.strokeStyle = '#777777';
  g.lineWidth = 9;
  for (const k of [-S, 0, S]) {
    g.beginPath();
    g.moveTo(k, S);
    g.lineTo(k + S, 0);
    g.stroke();
  }
  return cv;
}

function drawMesh(): HTMLCanvasElement | null {
  const S = 32;
  const c = canvas2d(S, S);
  if (!c) return null;
  const [cv, g] = c;
  g.fillStyle = 'rgba(214,222,228,0.42)';
  g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(86,100,112,0.95)';
  g.lineWidth = 2.2;
  for (const k of [-S, 0, S]) {
    g.beginPath();
    g.moveTo(k, 0);
    g.lineTo(k + S, S);
    g.moveTo(k + S, 0);
    g.lineTo(k, S);
    g.stroke();
  }
  return cv;
}

function drawTriangle(): HTMLCanvasElement | null {
  const c = canvas2d(64, 36);
  if (!c) return null;
  const [cv, g] = c;
  g.fillStyle = '#111111';
  g.beginPath();
  g.moveTo(3, 2);
  g.lineTo(61, 2);
  g.lineTo(32, 34);
  g.closePath();
  g.fill();
  return cv;
}

function cachedTexture(cache: TexCache, key: keyof TexCache, aniso: number, make: () => HTMLCanvasElement | null, repeat?: [number, number]) {
  if (cache[key] === undefined) {
    const cv = make();
    if (!cv) cache[key] = null;
    else {
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = aniso;
      if (repeat) {
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(repeat[0], repeat[1]);
      }
      cache[key] = t;
    }
  }
  return cache[key] ?? null;
}

function roundRectPath(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

/** Camera-facing text label (white box) whose height is `worldH` mm. */
function labelSprite(text: string, worldH: number, framed: boolean, bin: Disposable[]): { sprite: THREE.Sprite; w: number; h: number } | null {
  const px = 64;
  const font = `500 ${px}px ${FONT}`;
  const probe = canvas2d(4, 4);
  if (!probe) return null;
  probe[1].font = font;
  const tw = probe[1].measureText(text).width;
  const lw = framed ? 4 : 3;
  const padX = px * 0.42;
  const boxH = Math.round(px * 1.4);
  const c = canvas2d(Math.ceil(tw + padX * 2 + lw * 2), boxH + lw * 2);
  if (!c) return null;
  const [cv, g] = c;
  roundRectPath(g, lw / 2, lw / 2, cv.width - lw, cv.height - lw, px * 0.16);
  g.fillStyle = '#ffffff';
  g.fill();
  g.lineWidth = lw;
  g.strokeStyle = framed ? '#374151' : '#cbd5e1';
  g.stroke();
  g.font = font;
  g.fillStyle = '#111827';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, cv.width / 2, cv.height / 2 + px * 0.04);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  bin.push(t, mat);
  const sprite = new THREE.Sprite(mat);
  const w = (worldH * cv.width) / cv.height;
  sprite.scale.set(w, worldH, 1);
  sprite.renderOrder = 10;
  return { sprite, w, h: worldH };
}

/* ------------------------------------------------------------------ materials */

interface BuildOpts {
  frameColor: string;
  glassColor: string;
  outside: boolean;
  wall: boolean;
  realistic: boolean;
  section: boolean;
}

interface SurfOpts {
  map?: THREE.Texture | null;
  side?: THREE.Side;
  transparent?: boolean;
  opacity?: number;
  depthWrite?: boolean;
  polygonOffset?: boolean;
  polygonOffsetFactor?: number;
  polygonOffsetUnits?: number;
  clippingPlanes?: THREE.Plane[];
  clipShadows?: boolean;
}

function makeMaterials(o: BuildOpts, cache: TexCache, aniso: number, bin: Disposable[], clip: THREE.Plane | null) {
  const real = o.realistic;
  const keep = <T extends Disposable>(m: T): T => {
    bin.push(m);
    return m;
  };
  // section view: clipped above the cut, cut-open solids show their inner faces
  const clipOnly: SurfOpts = clip ? { clippingPlanes: [clip], clipShadows: true } : {};
  const cut: SurfOpts = clip ? { ...clipOnly, side: THREE.DoubleSide } : {};
  const surf = (color: string, roughness: number, metalness: number, extra: SurfOpts = {}): THREE.Material =>
    keep(real ? new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra }) : new THREE.MeshLambertMaterial({ color, ...extra }));
  const glass = (opacity: number, roughness: number) =>
    keep(
      new THREE.MeshPhysicalMaterial({
        color: o.glassColor,
        metalness: 0,
        roughness: real ? roughness : Math.max(0.3, roughness),
        transparent: true,
        opacity,
        depthWrite: false,
        ior: 1.5,
        envMapIntensity: real ? 2.4 : 1,
        clearcoat: real ? 1 : 0,
        clearcoatRoughness: 0.04,
        ...clipOnly,
      }),
    );
  // flat, unlit fill of the section cut
  const capMat = (color: string) =>
    keep(
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
    );
  const outline = !real;
  const brick = cachedTexture(cache, 'brick', aniso, drawBricks, [1 / BRICK_TILE_W, 1 / BRICK_TILE_H]);
  const hatch = cachedTexture(cache, 'hatch', aniso, drawHatch, [1, 1]);
  const mesh = cachedTexture(cache, 'mesh', aniso, drawMesh, [1, 1]);
  const sec = clip
    ? {
        steel: surf('#a2aab2', 0.42, 0.6, cut),
        capFrame: capMat(shade(o.frameColor, isLight(o.frameColor) ? -0.2 : -0.3)),
        capSteel: capMat('#7b848d'),
        capAlu: capMat('#98a1a9'),
        capGlass: capMat(shade(o.glassColor, -0.28)),
        capWall: capMat('#b3a898'),
        cutLine: keep(new THREE.LineBasicMaterial({ color: '#1f2937', toneMapped: false })),
      }
    : null;
  return {
    frame: surf(o.frameColor, 0.4, 0, outline ? { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, ...cut } : cut),
    glass: glass(real ? 0.3 : 0.38, 0.04),
    louver: glass(real ? 0.5 : 0.58, 0.3),
    handle: surf('#2d3239', 0.35, 0.55, cut),
    alu: surf('#c5ccd3', 0.35, 0.65, cut),
    fanBody: surf('#e3eaef', 0.5, 0.1, { side: THREE.DoubleSide, ...clipOnly }),
    fan: surf('#56636f', 0.45, 0.3, cut),
    mesh: mesh
      ? surf('#ffffff', 0.85, 0, { map: mesh, transparent: true, depthWrite: false, side: THREE.DoubleSide, ...clipOnly })
      : surf('#7d8f9b', 0.85, 0, { transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide, ...clipOnly }),
    edge: keep(
      new THREE.LineBasicMaterial({
        color: shade(o.frameColor, isLight(o.frameColor) ? -0.35 : -0.5),
        toneMapped: false,
        ...(clip ? { clippingPlanes: [clip] } : {}),
      }),
    ),
    brick: brick ? surf('#ffffff', 0.92, 0, { map: brick, ...cut }) : surf('#9a4b33', 0.92, 0, cut),
    plaster: surf('#d8d2c6', 0.95, 0, cut),
    floor: surf('#4f4f4f', 0.8, 0),
    hatch: hatch ? surf('#ffffff', 0.9, 0, { map: hatch }) : surf('#9a9a9a', 0.9, 0),
    dim: keep(new THREE.LineBasicMaterial({ color: '#6b7280', toneMapped: false })),
    sec,
  };
}

/* ------------------------------------------------------------------ model */

interface Built {
  root: THREE.Group;
  bin: Disposable[];
  frameBox: THREE.Box3; // what the initial camera frames
  bounds: THREE.Box3; // everything, for lights & shadows
  floorTop: number;
  annot: THREE.Group;
  annotZ: number;
  hideAnnotBehind: boolean;
  frameKey: string;
  minDistance: number;
  yaw: number;
  pitch: number;
}

function slidingPositions(n: LeafNode): number {
  if (n.panel === 'monorail') return 2; // single track, but keep overlapping sashes apart
  const t = n.mesh ? Math.max(3, n.tracks || 3) : Math.max(1, n.tracks || 2);
  return Math.max(2, Math.min(6, t));
}

function buildModel(input: DesignData, o: BuildOpts, cache: TexCache, aniso: number): Built {
  const bin: Disposable[] = [];
  const W = num(input.width, 1500, 50);
  const H = num(input.height, 1500, 50);
  const fa = num(input.floorAperture, 900, 0);
  const data: DesignData = { ...input, width: W, height: H, floorAperture: fa };
  const big = Math.max(W, H);
  const fs = Math.min(170, Math.max(48, big * 0.06));
  const real = o.realistic;
  const { leaves, mullions } = layout(data);

  let D = BASE_DEPTH;
  for (const lr of leaves) {
    if (lr.node.panel === 'sliding' || lr.node.panel === 'monorail') D = Math.max(D, (slidingPositions(lr.node) - 1) * TRACK_STEP + SL_SASH_D + 6);
  }
  const zf = D / 2;

  /* section view: horizontal cut, everything above it removed */
  const sec = o.section;
  const cut: Cut | null = sec ? { y: H / 2 - cutLevel(H, mullions), lines: [] } : null;
  const cutY = cut ? cut.y : 0;
  const SP = sec
    ? sectionProfiles(
        D,
        zf,
        leaves.flatMap((lr) => {
          if (lr.node.panel !== 'sliding' && lr.node.panel !== 'monorail') return [];
          const nPos = slidingPositions(lr.node);
          return Array.from({ length: nPos }, (_, t) => (t - (nPos - 1) / 2) * TRACK_STEP);
        }),
      )
    : null;

  const mats = makeMaterials(o, cache, aniso, bin, cut ? new THREE.Plane(new THREE.Vector3(0, -1, 0), cutY) : null);
  const B = {
    frame: new Batch(),
    glass: new Batch(),
    louver: new Batch(),
    handle: new Batch(),
    alu: new Batch(),
    fan: new Batch(),
    mesh: new Batch(MESH_TILE),
    steel: new Batch(),
  };
  // section caps, one batch per fill colour
  const CB = { frame: new Batch(), steel: new Batch(), alu: new Batch(), glass: new Batch() };
  const lines: number[] | null = real ? null : [];
  const win = new THREE.Group();
  const extraMeshes: THREE.Mesh[] = [];

  // layout (x right, y down from the top-left corner) -> model coordinates
  const X = (x: number) => x - W / 2;
  const Y = (y: number) => H / 2 - y;

  const ex = (b: Batch, cb: Batch, p: Profile, m: Member, edges = true) => extrude(b, p, m, edges ? lines : null, cut, cb);
  /** Section cap of a vertical box-shaped part spanning ya..yb. */
  const capV = (cb: Batch, x0: number, x1: number, z0: number, z1: number, ya: number, yb: number) => {
    if (cut && ya < cut.y && cut.y < yb) cutRect(cb, cut, x0, x1, z0, z1);
  };

  /* outer frame */
  if (SP && W > 2 * FRAME + 1 && H > 2 * FRAME + 1) {
    for (const m of ringMembers(-W / 2, -H / 2, W / 2, H / 2)) {
      ex(B.frame, CB.frame, SP.frame.body, m);
      ex(B.steel, CB.steel, SP.frame.steel, m, false);
    }
  } else ring(B.frame, -W / 2, -H / 2, W / 2, H / 2, FRAME, -zf, zf, lines);

  /* mullions, trimmed to the inner edges of whatever they run into */
  for (const m of mullions) {
    if (m.dir === 'v') {
      const ya = m.y + (m.y <= 0.5 ? FRAME : MULL / 2);
      const yb = m.y + m.length - (m.y + m.length >= H - 0.5 ? FRAME : MULL / 2);
      if (yb - ya <= 0.5) continue;
      if (SP) {
        const mm: Member = { o: [X(m.x), Y(yb), 0], s: [0, 1, 0], u: [1, 0, 0], len: yb - ya, m0: false, m1: false };
        ex(B.frame, CB.frame, SP.mull.body, mm);
        ex(B.steel, CB.steel, SP.mull.steel, mm, false);
      } else prism(B.frame, rectPts(X(m.x - MULL / 2), Y(yb), X(m.x + MULL / 2), Y(ya)), -zf, zf, null, lines);
    } else {
      const xa = m.x + (m.x <= 0.5 ? FRAME : MULL / 2);
      const xb = m.x + m.length - (m.x + m.length >= W - 0.5 ? FRAME : MULL / 2);
      if (xb - xa <= 0.5) continue;
      if (SP) {
        const mm: Member = { o: [X(xa), Y(m.y), 0], s: [1, 0, 0], u: [0, 1, 0], len: xb - xa, m0: false, m1: false };
        ex(B.frame, CB.frame, SP.mull.body, mm);
        ex(B.steel, CB.steel, SP.mull.steel, mm, false);
      } else prism(B.frame, rectPts(X(xa), Y(m.y + MULL / 2), X(xb), Y(m.y - MULL / 2)), -zf, zf, null, lines);
    }
  }

  /* helpers working in layout coordinates */
  const zs0 = zf + SASH_PROUD - CASE_SASH_D;
  const zs1 = zf + SASH_PROUD;

  const pane = (x0: number, y0: number, x1: number, y1: number, zc: number, bite = GLASS_BITE) => {
    prism(B.glass, rectPts(x0 - bite, y0 - bite, x1 + bite, y1 + bite), zc - GLASS_T / 2, zc + GLASS_T / 2);
    capV(CB.glass, x0 - bite, x1 + bite, zc - GLASS_T / 2, zc + GLASS_T / 2, y0 - bite, y1 + bite);
  };

  const meshPlane = (x0: number, y0: number, x1: number, y1: number, z: number) =>
    B.mesh.poly(
      [
        [x0 - 2, y0 - 2, z],
        [x1 + 2, y0 - 2, z],
        [x1 + 2, y1 + 2, z],
        [x0 - 2, y1 + 2, z],
      ],
      [0, 0, 1],
      null,
    );

  /** Sash ring + infill; x/y/w/h in layout coordinates. */
  const sash = (x: number, y: number, w: number, h: number, infill: 'glass' | 'mesh', z0 = zs0, z1 = zs1) => {
    const x0 = X(x);
    const x1 = X(x + w);
    const y0 = Y(y + h);
    const y1 = Y(y);
    if (SP && x1 - x0 > 2 * SASH + 1 && y1 - y0 > 2 * SASH + 1) {
      const sliding = z1 - z0 < CASE_SASH_D - 1;
      const ps = sliding ? SP.sliding(z0) : SP.casement;
      const bead = !sliding && infill === 'glass' ? SP.casement.bead : null;
      for (const m of ringMembers(x0, y0, x1, y1)) {
        ex(B.frame, CB.frame, ps.body, m);
        ex(B.steel, CB.steel, ps.steel, m, false);
        if (bead) ex(B.frame, CB.frame, bead, m);
      }
    } else ring(B.frame, x0, y0, x1, y1, SASH, z0, z1, lines);
    const ix0 = x0 + SASH;
    const ix1 = x1 - SASH;
    const iy0 = y0 + SASH;
    const iy1 = y1 - SASH;
    if (ix1 - ix0 < 1 || iy1 - iy0 < 1) return;
    if (infill === 'glass') pane(ix0, iy0, ix1, iy1, (z0 + z1) / 2);
    else meshPlane(ix0, iy0, ix1, iy1, (z0 + z1) / 2);
  };

  const rotY = new THREE.Matrix4().makeRotationY(Math.PI);
  const rotZ = new THREE.Matrix4().makeRotationZ(Math.PI / 2);
  /** Handle on a sash face at layout point (hx, hy); dir -1 puts it on the outer face. */
  const handle = (hx: number, hy: number, zFace: number, dir: 1 | -1, horizontal: boolean, slim: boolean) => {
    const m = new THREE.Matrix4().makeTranslation(X(hx), Y(hy), zFace);
    if (dir < 0) m.multiply(rotY);
    if (horizontal) m.multiply(rotZ);
    if (slim) {
      box(B.handle, 0, 0, 4, 22, 150, 8, m);
      box(B.handle, 0, 0, 15, 15, 116, 14, m);
    } else {
      box(B.handle, 0, 0, 5, 32, 96, 10, m);
      box(B.handle, 0, 28, 19, 16, 16, 18, m);
      box(B.handle, 0, -36, 32, 22, 150, 14, m);
    }
  };

  /* leaves */
  for (const lr of leaves) {
    const n = lr.node;
    const ins = {
      l: lr.x <= 0.5 ? FRAME : MULL / 2,
      r: lr.x + lr.w >= W - 0.5 ? FRAME : MULL / 2,
      t: lr.y <= 0.5 ? FRAME : MULL / 2,
      b: lr.y + lr.h >= H - 0.5 ? FRAME : MULL / 2,
    };
    const x = lr.x + ins.l;
    const y = lr.y + ins.t;
    const w = lr.w - ins.l - ins.r;
    const h = lr.h - ins.t - ins.b;
    if (w <= 1 || h <= 1) continue;
    const cx0 = X(x);
    const cx1 = X(x + w);
    const cy0 = Y(y + h);
    const cy1 = Y(y);
    const outerMesh = () => meshPlane(cx0, cy0, cx1, cy1, -zf + 4);

    switch (n.panel) {
      case 'fixed':
      case 'fan': {
        if (SP && w > 2 * BEAD_W + 1 && h > 2 * BEAD_W + 1) {
          for (const m of ringMembers(cx0, cy0, cx1, cy1)) {
            ex(B.frame, CB.frame, SP.bead, m);
            ex(B.frame, CB.frame, SP.lip, m);
          }
        } else {
          ring(B.frame, cx0, cy0, cx1, cy1, BEAD_W, GLASS_T / 2, GLASS_T / 2 + BEAD_D, lines); // glazing bead
          ring(B.frame, cx0, cy0, cx1, cy1, LIP_W, -zf, -GLASS_T / 2, lines); // rebate lip
        }
        const gb = SP ? SP.fixedBite : GLASS_BITE;
        if (n.panel === 'fixed') {
          pane(cx0, cy0, cx1, cy1, 0, gb);
          break;
        }
        // exhaust fan: glass with a round cut-out, housing, hub and three blades
        const R = Math.min(w, h) * 0.3;
        const fcx = (cx0 + cx1) / 2;
        const fcy = (cy0 + cy1) / 2;
        const shape = new THREE.Shape();
        shape.moveTo(cx0 - gb, cy0 - gb);
        shape.lineTo(cx1 + gb, cy0 - gb);
        shape.lineTo(cx1 + gb, cy1 + gb);
        shape.lineTo(cx0 - gb, cy1 + gb);
        shape.closePath();
        if (cut && cy0 - gb < cut.y && cut.y < cy1 + gb) {
          const dy = cut.y - fcy;
          const c = Math.abs(dy) < R ? Math.sqrt(R * R - dy * dy) : 0;
          if (c > 0) {
            cutRect(CB.glass, cut, cx0 - gb, fcx - c, -GLASS_T / 2, GLASS_T / 2);
            cutRect(CB.glass, cut, fcx + c, cx1 + gb, -GLASS_T / 2, GLASS_T / 2);
          } else cutRect(CB.glass, cut, cx0 - gb, cx1 + gb, -GLASS_T / 2, GLASS_T / 2);
        }
        const hole = new THREE.Path();
        hole.absarc(fcx, fcy, R, 0, Math.PI * 2, true);
        shape.holes.push(hole);
        const glassGeo = new THREE.ExtrudeGeometry(shape, { depth: GLASS_T, bevelEnabled: false, curveSegments: 40 });
        glassGeo.translate(0, 0, -GLASS_T / 2);
        const bodyD = Math.max(56, R * 0.22);
        const body = new THREE.CylinderGeometry(R, R, bodyD, 48, 1, true);
        body.rotateX(Math.PI / 2);
        body.translate(fcx, fcy, 0);
        const lip = new THREE.TorusGeometry(R, 5, 8, 48);
        lip.translate(fcx, fcy, bodyD / 2);
        const hub = new THREE.CylinderGeometry(R * 0.14, R * 0.14, bodyD * 0.6, 24);
        hub.rotateX(Math.PI / 2);
        hub.translate(fcx, fcy, 0);
        bin.push(glassGeo, body, lip, hub);
        extraMeshes.push(new THREE.Mesh(glassGeo, mats.glass), new THREE.Mesh(body, mats.fanBody), new THREE.Mesh(lip, mats.fanBody), new THREE.Mesh(hub, mats.fan));
        const twist = Math.min(0.45, Math.asin(Math.min(1, (bodyD * 0.42) / (R * 0.18))));
        for (const a of [20, 140, 260]) {
          const m = new THREE.Matrix4()
            .makeTranslation(fcx, fcy, 0)
            .multiply(new THREE.Matrix4().makeRotationZ((a * Math.PI) / 180))
            .multiply(new THREE.Matrix4().makeTranslation(R * 0.52, 0, 0))
            .multiply(new THREE.Matrix4().makeRotationX(twist));
          box(B.fan, 0, 0, 0, R * 0.72, R * 0.36, 3, m);
        }
        break;
      }
      case 'louver': {
        const cw = Math.min(24, w * 0.1);
        const cz = Math.min(25, zf - 3);
        prism(B.alu, rectPts(cx0, cy0, cx0 + cw, cy1), -cz, cz);
        prism(B.alu, rectPts(cx1 - cw, cy0, cx1, cy1), -cz, cz);
        capV(CB.alu, cx0, cx0 + cw, -cz, cz, cy0, cy1);
        capV(CB.alu, cx1 - cw, cx1, -cz, cz, cy0, cy1);
        const bw = cx1 - cx0 - 2 * cw;
        if (bw <= 1) break;
        const count = Math.max(1, Math.floor(h / 95));
        const p = h / count;
        const bh = p * 0.9;
        const maxHalf = cz - 2;
        let tilt = 0.5;
        if ((bh / 2) * Math.sin(tilt) > maxHalf) tilt = Math.asin(Math.min(1, maxHalf / (bh / 2)));
        for (let i = 0; i < count; i++) {
          const m = new THREE.Matrix4().makeTranslation((cx0 + cx1) / 2, cy1 - p * (i + 0.5), 0).multiply(new THREE.Matrix4().makeRotationX(tilt));
          box(B.louver, 0, 0, 0, bw, bh, 5, m);
        }
        break;
      }
      case 'casement':
      case 'tiltturn':
      case 'tophung':
      case 'bottomhung':
      case 'mesh': {
        sash(x, y, w, h, n.panel === 'mesh' ? 'mesh' : 'glass');
        if (n.panel === 'tophung') handle(x + w / 2, y + h - SASH / 2, zs1, 1, true, false);
        else if (n.panel === 'bottomhung') handle(x + w / 2, y + SASH / 2, zs1, 1, true, false);
        else handle(n.hinge === 'right' ? x + SASH / 2 : x + w - SASH / 2, y + h / 2, zs1, 1, false, false);
        if (n.mesh && n.panel !== 'mesh') outerMesh();
        break;
      }
      case 'twin': {
        const half = w / 2;
        sash(x, y, half, h, 'glass');
        sash(x + half, y, w - half, h, 'glass');
        handle(x + half - SASH / 2, y + h / 2, zs1, 1, false, false);
        if (n.mesh) outerMesh();
        break;
      }
      case 'bifold': {
        const count = sashCount(n);
        const sw = w / count;
        for (let i = 0; i < count; i++) sash(x + i * sw, y, sw, h, 'glass');
        handle(x + w - SASH / 2, y + h / 2, zs1, 1, false, false);
        if (n.mesh) outerMesh();
        break;
      }
      case 'sliding':
      case 'monorail': {
        const count = sashCount(n);
        const nPos = slidingPositions(n);
        const withMesh = !!n.mesh && n.panel === 'sliding';
        const glassTracks = withMesh ? nPos - 1 : nPos;
        const trackZ = (t: number) => (t - (nPos - 1) / 2) * TRACK_STEP;
        const sw = (w + (count - 1) * SASH) / count;
        const mid = (count - 1) / 2;
        const list: { x0: number; x1: number; z: number; mesh: boolean; hx: number }[] = [];
        for (let i = 0; i < count; i++) {
          const sx = x + i * (sw - SASH);
          const meetRight = i < mid;
          list.push({ x0: sx, x1: sx + sw, z: trackZ(i % glassTracks), mesh: false, hx: meetRight ? sx + sw - SASH / 2 : sx + SASH / 2 });
        }
        if (withMesh) list.push({ x0: x + w - sw, x1: x + w, z: trackZ(nPos - 1), mesh: true, hx: x + w - sw + SASH / 2 });
        for (const s of list) {
          sash(s.x0, y, s.x1 - s.x0, h, s.mesh ? 'mesh' : 'glass', s.z - SL_SASH_D / 2, s.z + SL_SASH_D / 2);
          // handle on the meeting stile, on whichever face is not hidden by an overlapping sash
          const covered = (inner: boolean) => list.some((o2) => o2 !== s && (inner ? o2.z > s.z : o2.z < s.z) && o2.x0 < s.hx && s.hx < o2.x1);
          if (!covered(true)) handle(s.hx, y + h / 2, s.z + SL_SASH_D / 2, 1, false, true);
          else if (!covered(false)) handle(s.hx, y + h / 2, s.z - SL_SASH_D / 2, -1, false, true);
        }
        if (SP) {
          // interlocks: a hollow hook on each meeting stile reaching towards the neighbouring sash (clear of its glass)
          const ya = Y(y + h) + SASH;
          const len = h - 2 * SASH;
          const reach = SL_SASH_D / 2 - 4;
          const stop = GLASS_T / 2 + 1;
          if (len > 1) {
            for (let i = 0; i + 1 < count; i++) {
              const a = list[i];
              const c = list[i + 1];
              const sg = Math.sign(c.z - a.z) || 1;
              ex(B.frame, CB.frame, SP.interlock(a.z + sg * reach, c.z - sg * stop), { o: [X(a.x1), ya, 0], s: [0, 1, 0], u: [1, 0, 0], len, m0: false, m1: false });
              ex(B.frame, CB.frame, SP.interlock(c.z - sg * reach, a.z + sg * stop), { o: [X(c.x0), ya, 0], s: [0, 1, 0], u: [-1, 0, 0], len, m0: false, m1: false });
            }
          }
          // aluminium T guide rails on every track, seated in the frame recesses
          const jl = cy1 - cy0 - 2 * RAIL_CLR;
          for (let t = 0; t < nPos; t++) {
            const rp = SP.rail(trackZ(t));
            if (ins.b === FRAME) ex(B.alu, CB.alu, rp, { o: [cx0, cy0, 0], s: [1, 0, 0], u: [0, 1, 0], len: cx1 - cx0, m0: false, m1: false });
            if (ins.t === FRAME) ex(B.alu, CB.alu, rp, { o: [cx0, cy1, 0], s: [1, 0, 0], u: [0, -1, 0], len: cx1 - cx0, m0: false, m1: false });
            if (jl > 1 && ins.l === FRAME) ex(B.alu, CB.alu, rp, { o: [cx0, cy0 + RAIL_CLR, 0], s: [0, 1, 0], u: [1, 0, 0], len: jl, m0: false, m1: false });
            if (jl > 1 && ins.r === FRAME) ex(B.alu, CB.alu, rp, { o: [cx1, cy0 + RAIL_CLR, 0], s: [0, 1, 0], u: [-1, 0, 0], len: jl, m0: false, m1: false });
          }
        }
        break;
      }
    }
  }

  const shadows = real;
  const add = (b: Batch, mat: THREE.Material, cast: boolean) => {
    const mesh = batchMesh(b, mat, bin, cast && shadows);
    if (mesh) {
      if (!cast) mesh.receiveShadow = false;
      win.add(mesh);
    }
  };
  add(B.frame, mats.frame, true);
  if (mats.sec) add(B.steel, mats.sec.steel, true);
  add(B.handle, mats.handle, true);
  add(B.alu, mats.alu, true);
  add(B.fan, mats.fan, true);
  add(B.glass, mats.glass, false);
  add(B.louver, mats.louver, false);
  add(B.mesh, mats.mesh, false);
  for (const m of extraMeshes) {
    const transparent = m.material === mats.glass;
    m.castShadow = shadows && !transparent;
    m.receiveShadow = shadows && !transparent;
    win.add(m);
  }
  if (lines && lines.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    bin.push(g);
    win.add(new THREE.LineSegments(g, mats.edge));
  }
  // section: flat fills on the cut (solid walls around hollow chambers) and their outlines
  const addCut = (parent: THREE.Group, caps: [Batch, THREE.Material][], cutLines: number[], lineMat: THREE.Material) => {
    for (const [b, mat] of caps) {
      const mesh = batchMesh(b, mat, bin, false);
      if (mesh) parent.add(mesh);
    }
    if (cutLines.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(cutLines, 3));
      bin.push(g);
      parent.add(new THREE.LineSegments(g, lineMat));
    }
  };
  if (cut && mats.sec) {
    const s = mats.sec;
    addCut(
      win,
      [
        [CB.frame, s.capFrame],
        [CB.steel, s.capSteel],
        [CB.alu, s.capAlu],
        [CB.glass, s.capGlass],
      ],
      cut.lines,
      s.cutLine,
    );
  }
  if (o.outside) win.rotation.y = Math.PI;

  const root = new THREE.Group();
  root.add(win);

  /* wall */
  const floorTop = -H / 2 - fa;
  const wmx = Math.max(W * 0.25, 250);
  const wx0 = -W / 2 - wmx;
  const wx1 = W / 2 + wmx;
  const wTop = H / 2 + Math.max(H * 0.2, 200);
  if (o.wall) {
    // shape coordinates are relative to the floor so brick courses start at the floor line
    const top = wTop - floorTop;
    const s = new THREE.Shape();
    if (fa >= 20) {
      s.moveTo(wx0, 0);
      s.lineTo(wx1, 0);
      s.lineTo(wx1, top);
      s.lineTo(wx0, top);
      s.closePath();
      const hole = new THREE.Path();
      hole.moveTo(-W / 2, fa);
      hole.lineTo(-W / 2, fa + H);
      hole.lineTo(W / 2, fa + H);
      hole.lineTo(W / 2, fa);
      hole.closePath();
      s.holes.push(hole);
    } else {
      s.moveTo(wx0, 0);
      s.lineTo(-W / 2, 0);
      s.lineTo(-W / 2, fa + H);
      s.lineTo(W / 2, fa + H);
      s.lineTo(W / 2, 0);
      s.lineTo(wx1, 0);
      s.lineTo(wx1, top);
      s.lineTo(wx0, top);
      s.closePath();
    }
    const g = new THREE.ExtrudeGeometry(s, { depth: WALL_D, bevelEnabled: false, steps: 1, curveSegments: 1 });
    g.translate(0, floorTop, -WALL_D / 2);
    bin.push(g);
    const wallMesh = new THREE.Mesh(g, [mats.brick, mats.plaster]);
    wallMesh.castShadow = shadows;
    wallMesh.receiveShadow = shadows;
    root.add(wallMesh);
    if (mats.sec && floorTop < cutY && cutY < wTop) {
      const wc: Cut = { y: cutY, lines: [] };
      const cb = new Batch();
      cutRect(cb, wc, wx0, -W / 2, -WALL_D / 2, WALL_D / 2);
      cutRect(cb, wc, W / 2, wx1, -WALL_D / 2, WALL_D / 2);
      addCut(root, [[cb, mats.sec.capWall]], wc.lines, mats.sec.cutLine);
    }
  }

  /* floor line: dark strip with a hatched band under it */
  const stripH = Math.max(18, fs * 0.3);
  const hatchH = Math.max(30, fs * 0.55);
  const fpad = Math.max(FRAME, fs * 0.6);
  const fx0 = o.wall ? wx0 - fs : -W / 2 - fpad;
  const fx1 = o.wall ? wx1 + fs : W / 2 + fpad;
  const fd = o.wall ? WALL_D + fs * 4 : Math.max(160, fs * 2);
  {
    const strip = new Batch();
    prism(strip, rectPts(fx0, floorTop - stripH, fx1, floorTop), -fd / 2, fd / 2);
    const band = new Batch(HATCH_TILE);
    prism(band, rectPts(fx0, floorTop - stripH - hatchH, fx1, floorTop - stripH), -fd / 2, fd / 2);
    const a = batchMesh(strip, mats.floor, bin, false);
    const b = batchMesh(band, mats.hatch, bin, false);
    if (a) {
      a.receiveShadow = shadows;
      root.add(a);
    }
    if (b) root.add(b);
  }
  if (real) {
    // invisible ground that only shows the soft shadow
    const span = big * 8 + fa * 2;
    const g = new THREE.PlaneGeometry(span, span);
    g.rotateX(-Math.PI / 2);
    g.translate(0, floorTop - 0.5, 0);
    const m = new THREE.ShadowMaterial({ opacity: 0.16, depthWrite: false });
    bin.push(g, m);
    const catcher = new THREE.Mesh(g, m);
    catcher.receiveShadow = true;
    root.add(catcher);
  }

  /* dimensions & labels (never mirrored) */
  const annot = new THREE.Group();
  const zA = o.wall ? WALL_D / 2 + 2 : 0;
  const step = fs * 2.3;
  const dimBelow = fa >= step + fs * 0.9;
  const dimY = dimBelow ? -H / 2 - step : H / 2 + step;
  const dimX = -W / 2 - step;
  const tick = fs * 0.35;
  const gap = fs * 0.2;
  const ar = fs * 0.4;
  const lp: number[] = [];
  const L = (x1: number, y1: number, x2: number, y2: number) => lp.push(x1, y1, zA, x2, y2, zA);
  // overall width
  L(-W / 2, dimY, W / 2, dimY);
  for (const sx of [-1, 1]) {
    const ex = (sx * W) / 2;
    L(ex, dimY - tick, ex, dimY + tick);
    L(ex, dimY, ex - sx * ar, dimY + ar * 0.35);
    L(ex, dimY, ex - sx * ar, dimY - ar * 0.35);
    if (dimBelow) L(ex, -H / 2 - gap, ex, dimY - tick);
    else L(ex, H / 2 + gap, ex, dimY + tick);
  }
  // overall height
  L(dimX, -H / 2, dimX, H / 2);
  for (const sy of [-1, 1]) {
    const ey = (sy * H) / 2;
    L(dimX - tick, ey, dimX + tick, ey);
    L(dimX, ey, dimX + ar * 0.35, ey - sy * ar);
    L(dimX, ey, dimX - ar * 0.35, ey - sy * ar);
    L(-W / 2 - gap, ey, dimX - tick, ey);
  }
  // section marker: cut line leader with a viewing-direction arrow
  const secX = W / 2 + fs * 1.4;
  if (sec) {
    const ay = cutY - fs * 0.9;
    L(W / 2 + gap, cutY, secX, cutY);
    L(secX, cutY, secX, ay);
    L(secX, ay, secX - ar * 0.35, ay + ar);
    L(secX, ay, secX + ar * 0.35, ay + ar);
  }
  {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    bin.push(g);
    annot.add(new THREE.LineSegments(g, mats.dim));
  }
  const frameBox = new THREE.Box3(new THREE.Vector3(-W / 2, -H / 2, -zf - 40), new THREE.Vector3(W / 2, H / 2, zf + 60));
  const v = new THREE.Vector3();
  const wl = labelSprite(fmt(W), fs * 1.25, false, bin);
  if (wl) {
    wl.sprite.position.set(0, dimY, zA + 1);
    annot.add(wl.sprite);
    frameBox.expandByPoint(v.set(-wl.w / 2, dimY - wl.h / 2, zA)).expandByPoint(v.set(wl.w / 2, dimY + wl.h / 2, zA));
  }
  frameBox.expandByPoint(v.set(0, dimY - tick, zA));
  const hl = labelSprite(fmt(H), fs * 1.25, false, bin);
  if (hl) {
    hl.sprite.position.set(dimX, 0, zA + 1);
    annot.add(hl.sprite);
    frameBox.expandByPoint(v.set(dimX - hl.w / 2, 0, zA));
  }
  frameBox.expandByPoint(v.set(dimX - tick, 0, zA));

  // floor marker + label at the right end of the floor line
  const zF = fd / 2;
  const triW = fs * 1.1;
  const triX = fx1 - triW * 0.8;
  let labelRight = fx1;
  const triTex = cachedTexture(cache, 'tri', aniso, drawTriangle);
  if (triTex) {
    const m = new THREE.SpriteMaterial({ map: triTex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    bin.push(m);
    const tri = new THREE.Sprite(m);
    tri.center.set(0.5, 0);
    tri.scale.set(triW, fs * 0.6, 1);
    tri.position.set(triX, floorTop, zF);
    tri.renderOrder = 10;
    annot.add(tri);
  }
  const fl = labelSprite(`Floor Aperture Distance = ${fmt(fa)}`, fs * 1.0, true, bin);
  if (fl) {
    fl.sprite.center.set(0, 0.5);
    fl.sprite.position.set(triX + triW * 0.65, floorTop + fs * 0.7, zF);
    annot.add(fl.sprite);
    labelRight = triX + triW * 0.65 + fl.w;
  }
  // section view frames the remaining lower half, looking down onto the cut
  const secBox = new THREE.Box3(new THREE.Vector3(-W / 2, -H / 2, -zf - 40), new THREE.Vector3(W / 2, cutY, zf + 60));
  if (sec) {
    const sl = labelSprite('SECTION A-A', fs * 1.0, true, bin);
    if (sl) {
      const lx = secX + fs * 0.4;
      sl.sprite.center.set(0, 0.5);
      sl.sprite.position.set(lx, cutY, zA + 1);
      annot.add(sl.sprite);
      secBox.expandByPoint(v.set(lx + sl.w, cutY + sl.h / 2, zA));
    }
    secBox.expandByPoint(v.set(dimX - (hl ? hl.w / 2 : tick), 0, zA));
    if (dimBelow) secBox.expandByPoint(v.set(0, dimY - (wl ? wl.h / 2 : tick), zA));
    if (o.wall) secBox.union(new THREE.Box3(new THREE.Vector3(wx0, cutY - 1, -WALL_D / 2), new THREE.Vector3(wx1, cutY, WALL_D / 2)));
  }
  root.add(annot);

  // framing: window, dimensions, wall, and the floor when it is reasonably close
  if (o.wall) frameBox.union(new THREE.Box3(new THREE.Vector3(wx0, floorTop, -WALL_D / 2), new THREE.Vector3(wx1, wTop, WALL_D / 2)));
  const floorBox = new THREE.Box3(new THREE.Vector3(fx0, floorTop - stripH - hatchH, -fd / 2), new THREE.Vector3(Math.max(fx1, labelRight), floorTop + fs * 1.3, fd / 2));
  if (o.wall || fa <= 1.25 * big) frameBox.union(floorBox);
  const bounds = frameBox.clone().union(floorBox);
  if (sec) bounds.union(secBox);

  return {
    root,
    bin,
    frameBox: sec ? secBox : frameBox,
    bounds,
    floorTop,
    annot,
    annotZ: zA,
    hideAnnotBehind: o.wall,
    frameKey: `${W}|${H}|${fa}|${o.wall}|${o.outside}|${sec}`,
    minDistance: Math.max(120, Math.min(W, H) * 0.1),
    yaw: sec ? SEC_YAW : YAW,
    pitch: sec ? SEC_PITCH : PITCH,
  };
}

/* ------------------------------------------------------------------ component */

interface Ctx {
  apply(data: DesignData, o: BuildOpts): void;
}

export function View3D(props: View3DProps): JSX.Element {
  const { data, frameColor, glassColor, view = 'inside', wall = false, realistic = false, section = false, className, style } = props;
  const mountRef = useRef<HTMLDivElement | null>(null);
  const ctxRef = useRef<Ctx | null>(null);
  const [glError, setGlError] = useState(false);
  const dataKey = useMemo(() => JSON.stringify(data ?? null), [data]);

  // renderer, camera, controls, lights: created once per mount
  useEffect(() => {
    const host = mountRef.current;
    if (!host) return;
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'display:block;width:100%;height:100%;outline:none;';
    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = canvas.getContext('webgl2', {
        alpha: true,
        antialias: true,
        depth: true,
        stencil: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
        powerPreference: 'default',
      });
    } catch {
      gl = null;
    }
    if (!gl) {
      setGlError(true);
      return;
    }
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, context: gl as unknown as WebGLRenderingContext, antialias: true, alpha: true });
      // Driver-level shader compiler notes (e.g. ANGLE precision hints) are not actionable; keep the console clean.
      renderer.debug.checkShaderErrors = false;
    } catch {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      setGlError(true);
      return;
    }
    setGlError(false);
    host.appendChild(canvas);

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = false;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1.5, 5, 100000);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.8;
    controls.panSpeed = 0.9;
    controls.screenSpacePanning = true;

    const ambient = new THREE.AmbientLight(0xffffff, 1.45);
    const hemi = new THREE.HemisphereLight(0xffffff, 0xb3a796, 0.45);
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    const fill = new THREE.DirectionalLight(0xffffff, 0.6);
    const back = new THREE.DirectionalLight(0xffffff, 0.9);
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.radius = 4;
    key.shadow.bias = -0.0003;
    scene.add(ambient, hemi, key, key.target, fill, fill.target, back, back.target);

    const cache: TexCache = {};
    let envRT: THREE.WebGLRenderTarget | null = null;
    let model: Built | null = null;
    let frameKey = '';
    let interacted = false;
    let dirty = true;
    let raf = 0;

    const frameView = () => {
      if (!model) return;
      const box = model.frameBox;
      const aspect = camera.aspect > 0 && Number.isFinite(camera.aspect) ? camera.aspect : 1.5;
      const { yaw, pitch } = model;
      const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      const center = box.getCenter(new THREE.Vector3());
      const fwd = dir.clone().negate();
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
      const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
      const tanV = Math.tan((FOV * Math.PI) / 360);
      const tanH = tanV * aspect;
      const margin = 1.08;
      let dist = 1;
      const c = new THREE.Vector3();
      for (let i = 0; i < 8; i++) {
        c.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(center);
        const z = c.dot(dir);
        dist = Math.max(dist, z + (Math.abs(c.dot(right)) * margin) / tanH, z + (Math.abs(c.dot(up)) * margin) / tanV);
      }
      const radius = model.bounds.getBoundingSphere(new THREE.Sphere()).radius;
      camera.near = Math.max(2, dist / 250);
      camera.far = dist * 6 + radius * 4;
      camera.updateProjectionMatrix();
      camera.position.copy(center).addScaledVector(dir, dist);
      controls.target.copy(center);
      controls.minDistance = Math.min(model.minDistance, dist * 0.5);
      controls.maxDistance = dist * 4;
      camera.lookAt(center);
      controls.update();
      dirty = true;
    };

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w < 1 || h < 1) return;
      const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
      if (nextDpr !== dpr) {
        dpr = nextDpr;
        renderer.setPixelRatio(dpr);
      }
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (!interacted) frameView();
      dirty = true;
    };

    const disposeModel = () => {
      if (!model) return;
      scene.remove(model.root);
      for (const d of model.bin) d.dispose();
      model = null;
    };

    const apply = (d: DesignData, o: BuildOpts) => {
      const next = buildModel(d, o, cache, aniso);
      disposeModel();
      model = next;
      scene.add(next.root);

      const real = o.realistic;
      renderer.localClippingEnabled = o.section;
      renderer.toneMapping = real ? THREE.NeutralToneMapping : THREE.NoToneMapping;
      renderer.toneMappingExposure = 1;
      renderer.shadowMap.enabled = real;
      if (real && !envRT) {
        const pmrem = new THREE.PMREMGenerator(renderer);
        const room = new RoomEnvironment();
        envRT = pmrem.fromScene(room, 0.04);
        room.dispose();
        pmrem.dispose();
      }
      scene.environment = real && envRT ? envRT.texture : null;
      scene.environmentIntensity = 0.8;
      ambient.visible = !real;
      hemi.visible = real;
      fill.visible = !real;
      back.visible = !real;
      key.intensity = real ? 2.0 : 2.2;
      key.castShadow = real;

      const sphere = next.bounds.getBoundingSphere(new THREE.Sphere());
      const r = Math.max(1, sphere.radius);
      key.target.position.copy(sphere.center);
      key.position.copy(sphere.center).addScaledVector(KEY_DIR, r * 3);
      fill.target.position.copy(sphere.center);
      fill.position.copy(sphere.center).addScaledVector(FILL_DIR, r * 3);
      back.target.position.copy(sphere.center);
      back.position.copy(sphere.center).addScaledVector(BACK_DIR, r * 3);
      const sc = key.shadow.camera;
      sc.left = -r;
      sc.right = r;
      sc.top = r;
      sc.bottom = -r;
      sc.near = r * 0.5;
      sc.far = r * 6;
      sc.updateProjectionMatrix();
      key.shadow.normalBias = ((2 * r) / 2048) * 1.5;

      if (next.frameKey !== frameKey) {
        frameKey = next.frameKey;
        interacted = false;
        frameView();
      } else {
        controls.minDistance = Math.min(next.minDistance, controls.maxDistance * 0.1);
      }
      dirty = true;
    };

    const onStart = () => {
      interacted = true;
    };
    const onChange = () => {
      dirty = true;
    };
    const onDbl = () => {
      interacted = false;
      frameView();
    };
    controls.addEventListener('start', onStart);
    controls.addEventListener('change', onChange);
    canvas.addEventListener('dblclick', onDbl);

    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (model) {
        // keep the camera (and the orbit target) above the floor
        const floor = model.floorTop;
        if (controls.target.y < floor) controls.target.y = floor;
        const dist = camera.position.distanceTo(controls.target);
        if (dist > 1e-3) controls.maxPolarAngle = Math.acos(Math.max(-1, Math.min(1, (floor + 30 - controls.target.y) / dist)));
      }
      const moved = controls.update();
      if (model && camera.position.y < model.floorTop + 30) {
        camera.position.y = model.floorTop + 30;
        camera.lookAt(controls.target);
      }
      if (moved || dirty) {
        if (model && model.hideAnnotBehind) model.annot.visible = camera.position.z > model.annotZ;
        renderer.render(scene, camera);
        dirty = false;
      }
    };
    raf = requestAnimationFrame(tick);

    ctxRef.current = { apply };

    return () => {
      ctxRef.current = null;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('dblclick', onDbl);
      controls.removeEventListener('start', onStart);
      controls.removeEventListener('change', onChange);
      controls.dispose();
      disposeModel();
      cache.brick?.dispose();
      cache.hatch?.dispose();
      cache.mesh?.dispose();
      cache.tri?.dispose();
      envRT?.dispose();
      scene.environment = null;
      key.dispose();
      fill.dispose();
      back.dispose();
      hemi.dispose();
      ambient.dispose();
      const canLose = renderer.extensions.has('WEBGL_lose_context');
      renderer.dispose();
      if (canLose) renderer.forceContextLoss();
      canvas.remove();
    };
  }, []);

  // rebuild the model whenever the design or the presentation options change
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const d = JSON.parse(dataKey) as DesignData | null;
    if (!d || !d.root) return;
    try {
      ctx.apply(d, {
        frameColor: cssHex(frameColor, '#ffffff'),
        glassColor: cssHex(glassColor, GLASS_FILL),
        outside: view === 'outside',
        wall: !!wall,
        realistic: !!realistic,
        section: !!section,
      });
    } catch {
      // keep showing the previous model if a malformed design slips through
    }
  }, [dataKey, frameColor, glassColor, view, wall, realistic, section]);

  return (
    <div className={className} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: BG, ...style }}>
      <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
      {glError && (
        <div
          role="status"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            textAlign: 'center',
            color: '#64748b',
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          3D view is not available on this device: WebGL is disabled or not supported by the browser / graphics driver.
          <br />
          Use the 2D drawing instead.
        </div>
      )}
    </div>
  );
}
