/*! Spiralist, copyright (c) 2026 winch, MIT.
 * Upstream 7903271c9f475f7734c12f6293c9bb3c217d5cc9.
 * https://github.com/winchxyz/spiralist
 * License: assets/licenses/spiralist.txt. */
// One continuous line drawn as a maze.
//
// 1. A random spanning tree is grown over a grid of cells from the cell the user picked
//    (a recursive backtracker, so corridors are long and winding; optionally steered to run along
//    the photo's contours, the way an engraver's lines follow form).
// 2. Walking around that tree gives ONE closed path that passes every cell exactly once — the
//    classic "Hamiltonian cycle on the doubled grid". Because it wraps the tree it can never cross
//    itself, and parallel runs are always exactly one line-spacing apart.
// 3. Corners become quarter circles, then the path is resampled and each point gets width /
//    wave / wobble from the photo, exactly like the spiral.
//
// Output uses the spiral's geometry format (see spiral.js) so rendering, pacing, film and export
// work unchanged. Line spacing = 1/rings circle units, the same density as the spiral.

import { sampleField, sampleColor, ensureFieldColor } from './tone.js';
import { STRIDE, MAX_POINTS, LINE_DEFAULTS, lineWidths, wobbleOffset, finishGeometry } from './spiral.js';

export const MAZE_DEFAULTS = Object.freeze({
  shape: 'square',      // 'square' | 'circle'
  x: 0, y: 0,           // start point, circle units (the art square is [-1,1]^2)
  flow: 0.6,            // 0..1 how strongly corridors follow the photo's contours
  seed: 1,
});

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// neighbour directions: E, S, W, N  (y grows downward)
const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
const E = 1, S = 2, W = 4, N = 8;
const BIT = [E, S, W, N];
const OPP = [W, N, E, S];

/**
 * Grow the spanning tree. Returns per-cell open-side bits (Uint8Array) and the included mask.
 */
export function growMaze(field, { cells, shape, x, y, flow, seed }) {
  const n = cells;
  const c = 2 / n;
  const inside = new Uint8Array(n * n);
  let count = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const cx = -1 + (i + 0.5) * c, cy = -1 + (j + 0.5) * c;
    const ok = shape === 'circle' ? Math.hypot(cx, cy) <= 1 - 0.55 * c : true;
    if (ok) { inside[j * n + i] = 1; count++; }
  }
  // start: the included cell nearest the chosen point
  let start = -1, best = Infinity;
  for (let k = 0; k < n * n; k++) {
    if (!inside[k]) continue;
    const cx = -1 + ((k % n) + 0.5) * c, cy = -1 + (((k / n) | 0) + 0.5) * c;
    const d = (cx - x) ** 2 + (cy - y) ** 2;
    if (d < best) { best = d; start = k; }
  }

  // contour direction of the photo at each cell: corridors prefer to run along it
  const tx = new Float32Array(n * n), ty = new Float32Array(n * n), tw = new Float32Array(n * n);
  if (flow > 0 && field) {
    for (let k = 0; k < n * n; k++) {
      if (!inside[k]) continue;
      const cx = -1 + ((k % n) + 0.5) * c, cy = -1 + (((k / n) | 0) + 0.5) * c;
      const gx = sampleField(field, cx + c, cy) - sampleField(field, cx - c, cy);
      const gy = sampleField(field, cx, cy + c) - sampleField(field, cx, cy - c);
      const m = Math.hypot(gx, gy);
      if (m > 1e-4) { tx[k] = -gy / m; ty[k] = gx / m; tw[k] = Math.min(1, m * 4); }
    }
  }

  const open = new Uint8Array(n * n);
  const seen = new Uint8Array(n * n);
  const rand = mulberry32((seed | 0) * 2654435761 + 1);
  const stack = new Int32Array(count + 1);
  const lastDir = new Int8Array(n * n).fill(-1);
  let sp = 0;
  stack[sp++] = start;
  seen[start] = 1;
  const w = new Float32Array(4);
  while (sp) {
    const k = stack[sp - 1];
    const i = k % n, j = (k / n) | 0;
    let total = 0;
    for (let d = 0; d < 4; d++) {
      const ni = i + DX[d], nj = j + DY[d];
      w[d] = 0;
      if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
      const nk = nj * n + ni;
      if (!inside[nk] || seen[nk]) continue;
      // along the contour counts more; keeping straight a little more (longer corridors)
      const along = Math.abs(DX[d] * tx[k] + DY[d] * ty[k]);
      let wt = 1 + flow * 6 * tw[k] * along * along;
      if (d === lastDir[k]) wt *= 1.6;
      w[d] = wt;
      total += wt;
    }
    if (total === 0) { sp--; continue; }
    let r = rand() * total, d = 0;
    for (; d < 3; d++) { if (w[d] > 0 && r < w[d]) break; r -= w[d]; }
    while (w[d] === 0) d = (d + 1) & 3;
    const nk = (j + DY[d]) * n + (i + DX[d]);
    open[k] |= BIT[d];
    open[nk] |= OPP[d];
    seen[nk] = 1;
    lastDir[nk] = d;
    stack[sp++] = nk;
  }
  return { n, c, inside, open, start, count };
}

/**
 * Walk around the tree: sub-grid nodes (2n x 2n); each node has exactly two neighbours.
 * Returns node coordinates in order (Float64Array of x,y) starting at the start cell.
 */
export function mazeTour({ n, c, inside, open, start }) {
  const m = 2 * n;
  const id = (u, v) => v * m + u;
  // node -> [neighbour A, neighbour B]
  const nb = new Int32Array(m * m * 2).fill(-1);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i;
    if (!inside[k]) continue;
    const o = open[k];
    const TL = id(2 * i, 2 * j), TR = id(2 * i + 1, 2 * j), BL = id(2 * i, 2 * j + 1), BR = id(2 * i + 1, 2 * j + 1);
    const up = (u, v) => id(u, v - 1), down = (u, v) => id(u, v + 1), left = (u, v) => id(u - 1, v), right = (u, v) => id(u + 1, v);
    nb[TL * 2] = o & N ? up(2 * i, 2 * j) : TR;
    nb[TL * 2 + 1] = o & W ? left(2 * i, 2 * j) : BL;
    nb[TR * 2] = o & N ? up(2 * i + 1, 2 * j) : TL;
    nb[TR * 2 + 1] = o & E ? right(2 * i + 1, 2 * j) : BR;
    nb[BL * 2] = o & S ? down(2 * i, 2 * j + 1) : BR;
    nb[BL * 2 + 1] = o & W ? left(2 * i, 2 * j + 1) : TL;
    nb[BR * 2] = o & S ? down(2 * i + 1, 2 * j + 1) : BL;
    nb[BR * 2 + 1] = o & E ? right(2 * i + 1, 2 * j + 1) : TR;
  }
  const si = start % n, sj = (start / n) | 0;
  const first = id(2 * si, 2 * sj);
  const total = 0;
  const out = [];
  let prev = -1, cur = first;
  const h = c / 2;
  for (let guard = 0; guard < m * m + 4; guard++) {
    const u = cur % m, v = (cur / m) | 0;
    out.push(-1 + (u + 0.5) * h, -1 + (v + 0.5) * h);
    const a = nb[cur * 2], b = nb[cur * 2 + 1];
    const next = a !== prev ? a : b;
    prev = cur;
    cur = next;
    if (cur === first || cur < 0) break;
  }
  void total;
  return new Float64Array(out);
}

/**
 * Smooth the grid path: every 90° corner becomes a quarter circle of radius h/2 between the
 * midpoints of its two legs, so the line flows like a hand-drawn labyrinth. Returns a dense
 * polyline (x, y, curvature) sampled every `step` along the path.
 */
export function roundPath(pts, h, step) {
  const count = pts.length / 2;
  const out = [];
  const push = (x, y, k) => out.push(x, y, k);
  const R = h / 2;
  // walk leg midpoints; between two midpoints either a straight piece (collinear) or an arc
  const mid = i => [(pts[2 * i] + pts[2 * ((i + 1) % count)]) / 2, (pts[2 * i + 1] + pts[2 * ((i + 1) % count) + 1]) / 2];
  const last = count - 1;   // the tour is closed; we stop one leg short so the line stays open
  let [x0, y0] = [pts[0], pts[1]];
  push(x0, y0, 0);
  const line = (xa, ya, xb, yb) => {
    const len = Math.hypot(xb - xa, yb - ya);
    const k = Math.max(1, Math.ceil(len / step));
    for (let s = 1; s <= k; s++) push(xa + (xb - xa) * s / k, ya + (yb - ya) * s / k, 0);
  };
  // first half-leg
  let [mx, my] = mid(0);
  line(x0, y0, mx, my);
  for (let i = 1; i < last; i++) {
    const cx = pts[2 * i], cy = pts[2 * i + 1];
    const [nx, ny] = mid(i);
    const ax = cx - mx, ay = cy - my;          // incoming direction (to the corner)
    const bx = nx - cx, by = ny - cy;          // outgoing direction
    const cross = ax * by - ay * bx;
    if (Math.abs(cross) < 1e-12) {
      line(mx, my, nx, ny);
    } else {
      // arc centre sits inside the turn, R from both legs
      const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
      const ux = ax / la, uy = ay / la, vx = bx / lb, vy = by / lb;
      const ox = mx + (vx) * R, oy = my + (vy) * R;   // centre: from the incoming midpoint, step along outgoing dir
      const a0 = Math.atan2(my - oy, mx - ox), a1 = Math.atan2(ny - oy, nx - ox);
      let da = a1 - a0;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      const k = Math.max(2, Math.ceil(Math.abs(da) * R / step));
      for (let s = 1; s <= k; s++) {
        const a = a0 + da * s / k;
        push(ox + Math.cos(a) * R, oy + Math.sin(a) * R, 1 / R);
      }
      void ux; void uy;
    }
    mx = nx; my = ny;
  }
  // last half-leg to the final node
  line(mx, my, pts[2 * last], pts[2 * last + 1]);
  return new Float64Array(out);
}

/**
 * Build the maze geometry.
 * @param field  darkness field (tone.buildField)
 * @param line   LINE_DEFAULTS-shaped settings (rings = corridors across, technique, widths, wobble…)
 * @param maze   MAZE_DEFAULTS-shaped settings
 * @param opts   { colorFromPhoto }
 */
export function buildMaze(field, line, maze, opts = {}) {
  const L = { ...LINE_DEFAULTS, ...line };
  const M = { ...MAZE_DEFAULTS, ...maze };
  const cells = Math.max(8, Math.min(200, Math.round(L.rings)));
  const tree = growMaze(field, { cells, shape: M.shape, x: M.x, y: M.y, flow: Math.max(0, Math.min(1, M.flow)), seed: M.seed });
  const tour = mazeTour(tree);
  const h = tree.c / 2;                 // line spacing (= 1/cells)
  const fieldPx = 2 / field.G;
  const W = lineWidths(L, h);           // shared width / wave budget (same rules as the spiral)
  const lambda = h * 0.9 / Math.max(0.25, L.frequency);
  // base sampling: fine enough for the field and for a wave, bounded by the point budget
  const pathLen = (tour.length / 2) * h;
  let step = Math.min(h / 3, fieldPx * 0.9);
  if (W.useWave) step = Math.min(step, lambda / 10);
  step = Math.max(step, pathLen / (MAX_POINTS * 0.9));
  const base = roundPath(tour, h, step);
  const count = base.length / 3;
  if (opts.colorFromPhoto) ensureFieldColor(field);

  const data = new Float32Array(count * STRIDE);
  const colors = opts.colorFromPhoto ? new Uint8Array(count * 4) : null;
  const rgb = [0, 0, 0];
  const fade = Math.max(0, L.edgeFade) * h;
  const seed = (L.seed | 0) || 1;
  let phase = 0, sAcc = 0, px = 0, py = 0;
  const wob = [0, 0];
  for (let i = 0; i < count; i++) {
    const bx = base[3 * i], by = base[3 * i + 1], curv = base[3 * i + 2];
    // tangent from neighbours (for the wave's normal offset)
    const j0 = Math.max(0, i - 1), j1 = Math.min(count - 1, i + 1);
    let tx = base[3 * j1] - base[3 * j0], ty = base[3 * j1 + 1] - base[3 * j0 + 1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    let D = sampleField(field, bx, by);
    // fade toward the boundary so the maze melts into the paper at its edge
    const edge = M.shape === 'circle' ? 1 - Math.hypot(bx, by) : 1 - Math.max(Math.abs(bx), Math.abs(by));
    if (fade > 0) D *= smoothstep(0, fade, edge - h * 0.25);
    const travel = i ? Math.hypot(bx - base[3 * (i - 1)], by - base[3 * (i - 1) + 1]) : 0;
    const density = 1 + 0.7 * D;
    phase += 2 * Math.PI * travel / lambda * density;
    const amp = W.useWave ? W.aMax * D : 0;
    wobbleOffset(bx, by, W.wobble, seed, wob);
    const x = bx - ty * (amp ? amp * Math.sin(phase) : 0) + wob[0];
    const y = by + tx * (amp ? amp * Math.sin(phase) : 0) + wob[1];
    let w = W.useWidth ? W.wMin + (W.wMax - W.wMin) * D : W.wMin;
    // inside a corner the stroke must not fold over itself
    if (curv > 0) w = Math.min(w, 1.8 / curv);
    if (i) sAcc += Math.hypot(x - px, y - py);
    const o = i * STRIDE;
    data[o] = x; data[o + 1] = y; data[o + 2] = w; data[o + 3] = sAcc; data[o + 4] = D;
    data[o + 5] = 0;                        // filled below (monotone order key)
    data[o + 6] = 1 + Math.min(2, curv * h * 0.45) * (0.5 + 0.5 * D);   // the pen lingers in turns
    if (colors) {
      sampleColor(field, bx, by, rgb);
      colors[i * 4] = rgb[0]; colors[i * 4 + 1] = rgb[1]; colors[i * 4 + 2] = rgb[2]; colors[i * 4 + 3] = 255;
    }
    px = x; py = y;
  }
  // 'rings' pacing has no rings here: make the order key proportional to path length
  const total = data[(count - 1) * STRIDE + 3] || 1;
  for (let i = 0; i < count; i++) data[i * STRIDE + 5] = data[i * STRIDE + 3] / total * cells;
  return finishGeometry({
    n: count, data, colors, rings: cells, spacing: h, technique: L.technique,
    maxWidth: W.wMax, minWidth: W.wMin, penWidth: L.technique === 'wave' ? W.wMin : null,
    start: 'maze', path: 'maze', shape: M.shape, startPoint: { x: M.x, y: M.y },
  });
}
