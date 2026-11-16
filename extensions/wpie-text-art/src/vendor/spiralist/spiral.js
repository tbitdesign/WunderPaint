/*! Spiralist, copyright (c) 2026 winch, MIT.
 * Upstream 7903271c9f475f7734c12f6293c9bb3c217d5cc9.
 * https://github.com/winchxyz/spiralist
 * License: assets/licenses/spiralist.txt. */
// One continuous spiral line from a darkness field.
//
// Geometry lives in "circle units": the art circle has radius 1, centre (0,0), y down.
// Output is a single polyline; consecutive points are always joined (the pen never lifts).
//
// Per-point record (STRIDE floats):
//   x, y   position
//   w      full stroke width
//   s      cumulative length of the drawn path (pen travel)
//   tone   darkness at the point (0..1), used by brushes as pressure
//   turn   spiral turns completed at this point (0..rings), used for "ring by ring" pacing
//   dwell  how long the pen lingers here relative to its travel (>= 1 in tight turns); wet media
//          pool and bleed more where it is high, and "natural" pacing slows there

import { sampleField, sampleColor, ensureFieldColor } from './tone.js';

export const STRIDE = 7;
export const MAX_POINTS = 1_400_000;

export const LINE_DEFAULTS = Object.freeze({
  technique: 'thickness',  // 'thickness' | 'wave' | 'both'
  rings: 72,               // number of turns from centre to rim
  weight: 0.88,            // thickest stroke, fraction of ring spacing
  hairline: 0.08,          // thinnest stroke, fraction of ring spacing (keeps the ONE line visible)
  amplitude: 0.9,          // wave height at full darkness, fraction of the free space between rings
  frequency: 1.25,         // waves per ring spacing of travel
  penWidth: 0.18,          // wave-mode pen width, fraction of ring spacing
  wobble: 0.12,            // hand-drawn irregularity 0..1
  direction: 'cw',         // 'cw' | 'ccw'
  start: 'center',         // 'center' | 'edge'
  edgeFade: 2.5,           // rings over which the drawing fades to a hairline at the rim
  seed: 1,                 // hand-wobble variation
});

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Deterministic hashes / smooth value noise.
function hash2(ix, iy, seed) {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
/** 2D value noise in [-1, 1]. */
function noise2(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return ((a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uy) * 2 - 1;
}
function noise1(x, seed) { return noise2(x, 0.5, seed); }

// Hand wobble is a smooth field in paper space: neighbouring rings drift together, so the
// spiral looks hand-made while ring spacing only varies by a bounded amount.
const WOBBLE_AMP = 0.012;    // max radial drift at wobble 1, circle units
const WOBBLE_CELL = 0.18;    // correlation length, circle units
// Bound on the field's slope (two octaves of smoothstep value noise, any direction) times the
// drift: the largest relative change in ring spacing at wobble 1 (~31%).
const WOBBLE_SQUEEZE = WOBBLE_AMP * 4.7 / WOBBLE_CELL;

function wobbleField(x, y, seed) {
  return 0.7 * noise2(x / WOBBLE_CELL, y / WOBBLE_CELL, seed) +
         0.3 * noise2(x / (WOBBLE_CELL * 0.5) + 7.3, y / (WOBBLE_CELL * 0.5) - 2.1, seed + 11);
}

/** Smooth 2D hand-drift displacement (both axes) for paths that are not radial (maze). */
export function wobbleOffset(x, y, wobble, seed, out) {
  const a = WOBBLE_AMP * wobble;
  out[0] = a ? a * wobbleField(x, y, seed) : 0;
  out[1] = a ? a * wobbleField(x + 17.1, y - 9.3, seed + 5) : 0;
  return out;
}

/**
 * Width and wave budget for a line spacing d, shared by every path shape. Wobble can squeeze
 * neighbouring lines by up to WOBBLE_SQUEEZE of the spacing, so the widest stroke and the wave
 * both leave that much room; lines therefore never touch.
 */
export function lineWidths(L, d) {
  const tech = L.technique;
  const useWave = tech === 'wave' || tech === 'both';
  const useWidth = tech === 'thickness' || tech === 'both';
  const wobble = Math.max(0, Math.min(1, L.wobble));
  const room = d * (1 - WOBBLE_SQUEEZE * wobble) * 0.97;
  let wMin, wMax;
  if (tech === 'thickness') { wMin = d * L.hairline; wMax = d * L.weight; }
  else if (tech === 'wave') { wMin = wMax = d * L.penWidth; }
  else { wMin = d * Math.max(L.hairline, L.penWidth * 0.6); wMax = d * Math.max(L.hairline, L.weight * 0.55); }
  wMax = Math.min(wMax, room / (1 + 0.05 * wobble));
  wMin = Math.min(wMin, wMax);
  const free = Math.max(0, (room - wMax) / 2);
  const aMax = useWave ? free * Math.max(0, Math.min(1, L.amplitude)) : 0;
  return { useWave, useWidth, wobble, wMin, wMax, aMax };
}

/** Common tail of every geometry builder. */
export function finishGeometry(g) {
  const { n, data } = g;
  return {
    path: 'spiral', ...g,
    length: data[(n - 1) * STRIDE + 3],
    turns: data[(n - 1) * STRIDE + 5],
    _pace: new Map(),
  };
}

/**
 * Build the spiral polyline.
 * @param field  darkness field from tone.buildField
 * @param line   LINE_DEFAULTS-shaped settings
 * @param opts   { colorFromPhoto?: boolean }
 */
export function buildSpiral(field, line, opts = {}) {
  const L = { ...LINE_DEFAULTS, ...line };
  const rings = Math.max(4, Math.min(260, Math.round(L.rings)));
  const d = 1 / rings;                     // ring spacing
  const b = d / (2 * Math.PI);             // r = b * theta
  const tech = L.technique;
  const useWave = tech === 'wave' || tech === 'both';
  const useWidth = tech === 'thickness' || tech === 'both';
  const colorFromPhoto = !!opts.colorFromPhoto;
  if (colorFromPhoto) ensureFieldColor(field);

  // Widths and wave amplitude in circle units; neighbouring rings never touch.
  const { wobble, wMin, wMax, aMax } = lineWidths(L, d);

  const P = {
    field, d, b, rings, aMax, wMin, wMax, wobble, useWave, useWidth, colorFromPhoto,
    lambda: d * 0.9 / Math.max(0.25, L.frequency),
    dirSign: L.direction === 'ccw' ? -1 : 1,
    fade: Math.max(0, L.edgeFade) * d,
    seed: (L.seed | 0) || 1,
    tol: 0.05,     // chord tolerance for the wave, as a fraction of the pen width
  };
  let out = trace(P);
  // Extreme settings (many rings x high frequency) can exceed the point budget; loosen the
  // chord tolerance until the whole spiral fits rather than ever truncating the line.
  while (!out && P.tol < 4) { P.tol *= 2; out = trace(P); }
  if (!out) { P.tol = Infinity; out = trace(P, true); }
  const { data, colors, n } = out;
  if (L.start === 'edge') reverseInPlace(data, colors, n);

  return finishGeometry({
    n,
    data,
    colors,
    rings,
    spacing: d,
    technique: tech,
    maxWidth: wMax,
    minWidth: wMin,
    penWidth: tech === 'wave' ? wMin : null,
    start: L.start,
    path: 'spiral',
  });
}

/**
 * Walk the spiral from the centre to the rim, emitting points.
 * Step length adapts: along a tall wave the step is a fraction of the wavelength (enough samples
 * that the chord error stays under `tol` x pen width); on flat, pale stretches it relaxes to the
 * field resolution. Returns null if the point budget would be exceeded (unless `force`).
 */
function trace(P, force = false) {
  const { field, d, b, aMax, wMin, wMax, wobble, useWave, useWidth, dirSign, fade, seed } = P;
  const fieldPx = 2 / field.G;
  const spiralLength = Math.PI / d;
  // Never let the wave be finer than the budget allows at ~6 samples per wave in the darkest areas.
  const lambda = Math.max(P.lambda, 6 * 1.7 * spiralLength / MAX_POINTS);
  const baseStep = Math.min(d / 3, fieldPx * 0.9);
  const theta0 = Math.PI;                  // start half a turn out: r0 = d/2
  const thetaEnd = 1 / b;                  // r = 1
  const drift = WOBBLE_AMP * wobble;

  let cap = Math.min(MAX_POINTS, Math.ceil(spiralLength / baseStep) * 2 + 1024);
  let data = new Float32Array(cap * STRIDE);
  let colors = P.colorFromPhoto ? new Uint8Array(cap * 4) : null;
  const rgb = [0, 0, 0];

  let theta = theta0;
  let phase = 0;
  let n = 0;
  let px = 0, py = 0, sAcc = 0;
  let prevTheta = theta;
  // the wobble field and width jitter change slowly: evaluate them every few points
  let rw = 0, jitter = 1, lastWobbleS = -1, lastJitterS = -1;
  const rhoZone = 4 * d;       // the curvature cap only matters in the first rings
  for (;;) {
    const last = theta >= thetaEnd;
    if (last) theta = thetaEnd;
    const r = b * theta;
    const c = Math.cos(theta), sn = Math.sin(theta);
    const bx = r * c, by = r * sn * dirSign;

    // Darkness of the band under the pen, faded to paper over the last rings.
    let D = sampleField(field, bx, by);
    if (fade > 0) D *= 1 - smoothstep(1 - fade, 1, r);
    // Ramp in over the first half turn so the centre is not a knot.
    const ramp = smoothstep(theta0, theta0 + Math.PI * 1.5, theta);

    // Wave: radial sine whose phase is integrated over travel; darker = taller and denser.
    const speed = Math.sqrt(r * r + b * b);
    const travel = (theta - prevTheta) * speed;
    const density = 1 + 0.7 * D;
    phase += 2 * Math.PI * travel / lambda * density;
    const amp = useWave ? aMax * D * ramp : 0;
    if (drift && (n === 0 || sAcc - lastWobbleS > 0.004)) { rw = drift * wobbleField(bx, by, seed); lastWobbleS = sAcc; }
    const rr = r + (amp ? amp * Math.sin(phase) : 0) + rw * ramp;

    let w = useWidth ? wMin + (wMax - wMin) * D * ramp : wMin;
    if (wobble) {
      if (n === 0 || sAcc - lastJitterS > 0.003) { jitter = 1 + 0.05 * wobble * noise1(sAcc * 40, seed + 3); lastJitterS = sAcc; }
      w *= jitter;
    }
    // Curvature cap near the centre: a stroke wider than ~1.8x the curvature radius folds over.
    if (r < rhoZone) {
      const q = r * r + b * b;
      w = Math.min(w, 1.8 * q * Math.sqrt(q) / (r * r + 2 * b * b));
    }

    const x = rr * c, y = rr * sn * dirSign;
    if (n > 0) sAcc += Math.hypot(x - px, y - py);
    if (n >= MAX_POINTS && !force) return null;
    if (n >= cap) {
      cap = Math.ceil(cap * 1.6);
      const grown = new Float32Array(cap * STRIDE); grown.set(data); data = grown;
      if (colors) { const gc = new Uint8Array(cap * 4); gc.set(colors); colors = gc; }
    }
    const o = n * STRIDE;
    data[o] = x; data[o + 1] = y; data[o + 2] = w; data[o + 3] = sAcc; data[o + 4] = D;
    data[o + 5] = (theta - theta0) / (2 * Math.PI);
    // the pen lingers where the spiral is tight (the first rings) and where it lays down ink
    data[o + 6] = 1 + Math.min(2, (d / Math.max(r, d * 0.5)) * 0.45) * (0.5 + 0.5 * D);
    if (colors) {
      sampleColor(field, bx, by, rgb);
      const q = n * 4;
      colors[q] = rgb[0]; colors[q + 1] = rgb[1]; colors[q + 2] = rgb[2]; colors[q + 3] = 255;
    }
    px = x; py = y; n++;
    if (last) break;

    prevTheta = theta;
    let step = baseStep;
    if (useWave) {
      // samples per wave so that the sagitta A*(pi/N)^2/2 stays under tol * pen width — but never
      // finer than 2% of the ring spacing (~0.2 px even in a 4K export), or thin pens explode the count
      const eps = P.tol * Math.max(wMin, 0.4 * d);
      const N = amp > 1e-9 ? Math.min(16, Math.max(3, Math.PI * Math.sqrt(amp / (2 * eps)))) : 3;
      step = Math.min(step, lambda / density / N);
    }
    theta += Math.min(step / speed, 0.12);
  }
  return {
    data: data.subarray(0, n * STRIDE),
    colors: colors ? colors.subarray(0, n * 4) : null,
    n,
  };
}

// Reverse point order and rebuild cumulative length / turn so the pen starts at the rim.
function reverseInPlace(data, colors, n) {
  const total = data[(n - 1) * STRIDE + 3];
  const turns = data[(n - 1) * STRIDE + 5];
  for (let i = 0, j = n - 1; i < j; i++, j--) {
    for (let k = 0; k < STRIDE; k++) {
      const a = i * STRIDE + k, bb = j * STRIDE + k;
      const tmp = data[a]; data[a] = data[bb]; data[bb] = tmp;
    }
    if (colors) {
      for (let k = 0; k < 4; k++) {
        const a = i * 4 + k, bb = j * 4 + k;
        const tmp = colors[a]; colors[a] = colors[bb]; colors[bb] = tmp;
      }
    }
  }
  for (let i = 0; i < n; i++) {
    data[i * STRIDE + 3] = total - data[i * STRIDE + 3];
    data[i * STRIDE + 5] = turns - data[i * STRIDE + 5];
  }
}

// ------------------------------------------------------------------------------------ pacing
// A pacing table maps each point to the moment the pen reaches it (cumulative, arbitrary units).
//   'natural' — the pen slows where it lays down ink, hurries across empty paper
//   'steady'  — constant pen speed (equal path length per second)
//   'rings'   — constant turn rate (the disc grows at an even pace)
export const PACINGS = ['natural', 'steady', 'rings'];

export function pacingTable(geom, pacing = 'natural') {
  const key = PACINGS.includes(pacing) ? pacing : 'natural';
  if (geom._pace?.has(key)) return geom._pace.get(key);
  const { n, data } = geom;
  const t = new Float32Array(n);
  if (key === 'rings') {
    for (let i = 0; i < n; i++) t[i] = data[i * STRIDE + 5];
  } else if (key === 'steady') {
    for (let i = 0; i < n; i++) t[i] = data[i * STRIDE + 3];
  } else {
    // waves already lengthen the path in dark areas, so they need less extra dwell
    const k = geom.technique === 'wave' ? 0.4 : 0.65;
    let acc = 0;
    for (let i = 1; i < n; i++) {
      const o = i * STRIDE, p = o - STRIDE;
      const ds = data[o + 3] - data[p + 3];
      const ink = 0.5 * (data[o + 4] + data[p + 4]);
      const dwell = 0.5 * (data[o + 6] + data[p + 6]);
      acc += ds * ((1 - k) + k * ink) * dwell;
      t[i] = acc;
    }
  }
  geom._pace?.set(key, t);
  return t;
}

/** Fractional point index the pen has reached at drawing progress f in [0,1]. */
export function indexAt(geom, f, pacing = 'natural') {
  const { n } = geom;
  if (n < 2 || f <= 0) return 0;
  if (f >= 1) return n - 1;
  const t = pacingTable(geom, pacing);
  const target = f * t[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (t[mid] < target) lo = mid; else hi = mid;
  }
  const a = t[lo], bb = t[hi];
  return lo + (bb > a ? (target - a) / (bb - a) : 0);
}

/** Drawing progress f in [0,1] for a fractional point index (inverse of indexAt). */
export function progressAt(geom, fi, pacing = 'natural') {
  const { n } = geom;
  if (n < 2) return 1;
  const t = pacingTable(geom, pacing);
  const i = Math.max(0, Math.min(n - 1, Math.floor(fi)));
  const j = Math.min(n - 1, i + 1);
  const v = t[i] + (t[j] - t[i]) * Math.max(0, Math.min(1, fi - i));
  return t[n - 1] > 0 ? v / t[n - 1] : 1;
}

/** Interpolated pen position at a fractional index. */
export function headAt(geom, fi) {
  const { n, data } = geom;
  const i = Math.max(0, Math.min(n - 1, Math.floor(fi)));
  const j = Math.min(n - 1, i + 1);
  const t = Math.max(0, Math.min(1, fi - i));
  const a = i * STRIDE, bb = j * STRIDE;
  return {
    x: data[a] + (data[bb] - data[a]) * t,
    y: data[a + 1] + (data[bb + 1] - data[a + 1]) * t,
    w: data[a + 2] + (data[bb + 2] - data[a + 2]) * t,
    tone: data[a + 4] + (data[bb + 4] - data[a + 4]) * t,
    turn: data[a + 5] + (data[bb + 5] - data[a + 5]) * t,
    dwell: data[a + 6] + (data[bb + 6] - data[a + 6]) * t,
  };
}

/** Line length in metres when the art circle is printed at `diameterMm`. */
export function printedLength(geom, diameterMm = 180) {
  return geom.length * (diameterMm / 2) / 1000;
}

/**
 * A short synthetic spiral fragment (2.5 turns, thin-to-thick ramp) for brush previews.
 * Returned in the same format as buildSpiral, filling the unit circle.
 */
// pauses: fractions along the fragment where the pen stops for a moment (dwell rises there, so a
// wet medium pools and 'natural' pacing slows), for the wet tools' chips
export function previewStroke({ turns = 2.5, technique = 'thickness', ringsVisible = 5, pauses = [] } = {}) {
  const d = 1 / ringsVisible, b = d / (2 * Math.PI);
  const pts = [];
  const theta0 = (ringsVisible - turns) * 2 * Math.PI;
  const theta1 = ringsVisible * 2 * Math.PI;
  let s = 0, px = 0, py = 0, phase = 0, prev = theta0;
  for (let th = theta0; th <= theta1 + 1e-9; th += 0.01) {
    const r = b * th;
    const u = (th - theta0) / (theta1 - theta0);
    const D = Math.min(1, u * 1.15);
    phase += (th - prev) * r * 2 * Math.PI / (d * 0.7) * (1 + 0.7 * D); prev = th;
    const rr = r + (technique === 'wave' ? Math.sin(phase) * d * 0.33 * D : 0);
    const x = rr * Math.cos(th), y = rr * Math.sin(th);
    if (pts.length) s += Math.hypot(x - px, y - py);
    const w = technique === 'wave' ? d * 0.18 : d * (0.08 + 0.8 * D);
    let dwell = 1;
    for (const pu of pauses) dwell = Math.max(dwell, 1 + 0.9 * Math.exp(-(((u - pu) / 0.01) ** 2)));
    pts.push(x, y, w, s, D, th / (2 * Math.PI), dwell);
    px = x; py = y;
  }
  const data = new Float32Array(pts);
  const n = data.length / STRIDE;
  return { n, data, colors: null, rings: ringsVisible, spacing: d, length: s, turns, technique, path: 'spiral', _pace: new Map() };
}
