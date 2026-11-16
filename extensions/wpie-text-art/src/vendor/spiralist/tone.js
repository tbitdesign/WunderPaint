/*! Spiralist, copyright (c) 2026 winch, MIT.
 * Upstream 7903271c9f475f7734c12f6293c9bb3c217d5cc9.
 * https://github.com/winchxyz/spiralist
 * License: assets/licenses/spiralist.txt. */
// Tone pipeline: photo -> square darkness field covering the art circle.
//
// Layers are cached separately so each control only redoes the work it affects:
//   rasterize(source, crop)            -> Raster   (DOM: canvas resample of the crop)
//   processTone(raster, tone)          -> Float32 lightness after levels/detail/curves
//   buildField(raster, toneL, opts)    -> Field    (darkness, pre-blurred to the ring spacing)
//
// Field coordinates: the circle's bounding square [-1,1]^2 maps onto a G x G grid,
// x to the right, y down. Samples outside the photo read as blank paper.

export const FIELD_SIZE = 1024;

export const TONE_DEFAULTS = Object.freeze({
  auto: true,        // levels + solve midtones for a target ink coverage
  darkness: 0,       // -1..1  shifts the ink-coverage target (auto) or the midtones (manual)
  contrast: 0,       // -1..1
  detail: 0.35,      // 0..1   local contrast
  brightness: 0,     // -1..1  manual mode only
  invert: false,     // flips tones on top of the automatic light-ink polarity
});

/** Mean ink coverage the auto tone aims for, from the Darkness slider. */
export function coverageTarget(darkness) {
  return 0.42 + 0.2 * Math.max(-1, Math.min(1, darkness));
}

export const CROP_DEFAULTS = Object.freeze({
  x: 0.5,        // circle centre in normalised image coords
  y: 0.5,
  zoom: 1,       // 1 = circle diameter equals the photo's short side
  rotation: 0,   // degrees, clockwise
});

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Size (in source pixels) of the circle's diameter for a crop. */
export function cropDiameter(width, height, crop) {
  return Math.min(width, height) / Math.max(0.05, crop.zoom);
}

/**
 * Resample the cropped circle area of `source` into a G x G RGBA raster.
 * source: CanvasImageSource with .width/.height (canvas, ImageBitmap, img).
 */
export function rasterize(source, crop, G = FIELD_SIZE) {
  const w = source.width, h = source.height;
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(G, G)
    : Object.assign(document.createElement('canvas'), { width: G, height: G });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, G, G);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const diam = cropDiameter(w, h, crop);
  const scale = G / diam;
  ctx.save();
  ctx.translate(G / 2, G / 2);
  ctx.rotate((crop.rotation || 0) * Math.PI / 180);
  ctx.scale(scale, scale);
  ctx.translate(-crop.x * w, -crop.y * h);
  ctx.drawImage(source, 0, 0, w, h);
  ctx.restore();
  const img = ctx.getImageData(0, 0, G, G);
  return rasterFromRGBA(img.data, G);
}

/** Pure part of rasterize: RGBA bytes -> luma (composited over white) + mask. */
export function rasterFromRGBA(rgba, G) {
  const N = G * G;
  const luma = new Float32Array(N);
  const mask = new Uint8Array(N);   // 1 = inside the circle and on an opaque-ish photo pixel
  const rgb = new Uint8ClampedArray(N * 3);
  const half = G / 2;
  for (let i = 0, y = 0; y < G; y++) {
    const dy = (y + 0.5 - half) / half;
    for (let x = 0; x < G; x++, i++) {
      const a = rgba[i * 4 + 3] / 255;
      // composite over white: transparent pixels and the area outside the photo become paper
      const r = rgba[i * 4] * a + 255 * (1 - a);
      const g = rgba[i * 4 + 1] * a + 255 * (1 - a);
      const b = rgba[i * 4 + 2] * a + 255 * (1 - a);
      rgb[i * 3] = r; rgb[i * 3 + 1] = g; rgb[i * 3 + 2] = b;
      luma[i] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const dx = (x + 0.5 - half) / half;
      mask[i] = (a > 0.5 && dx * dx + dy * dy <= 1) ? 1 : 0;
    }
  }
  return { G, luma, mask, rgb };
}

/**
 * Separable box blur, `passes` times (3 passes ~ Gaussian with sigma^2 = passes*r(r+1)/3). In place.
 * Edges clamp (repeat the border sample), so borders neither darken nor lighten. Running sums
 * over rows, and a row-major accumulator for columns, keep it cache friendly (~10 ms / pass at 1024^2).
 */
export function boxBlur(data, G, radius, passes = 3, channels = 1) {
  const r = Math.max(0, Math.round(radius));
  if (r < 1) return data;
  const tmp = new Float32Array(data.length);
  for (let p = 0; p < passes; p++) {
    blurRows(data, tmp, G, G, r, channels);
    blurCols(tmp, data, G, G, r, channels);
  }
  return data;
}

function blurRows(src, dst, W, H, r, ch) {
  const inv = 1 / (2 * r + 1);
  const last = W - 1;
  for (let y = 0; y < H; y++) {
    const row = y * W * ch;
    for (let c = 0; c < ch; c++) {
      const o = row + c;
      let acc = src[o] * (r + 1);
      for (let i = 1; i <= r; i++) acc += src[o + Math.min(i, last) * ch];
      for (let x = 0; x < W; x++) {
        dst[o + x * ch] = acc * inv;
        acc += src[o + Math.min(x + r + 1, last) * ch] - src[o + Math.max(x - r, 0) * ch];
      }
    }
  }
}

function blurCols(src, dst, W, H, r, ch) {
  const inv = 1 / (2 * r + 1);
  const rowLen = W * ch;
  const last = H - 1;
  const acc = new Float64Array(rowLen);
  for (let k = 0; k < rowLen; k++) {
    let a = src[k] * (r + 1);
    for (let i = 1; i <= r; i++) a += src[Math.min(i, last) * rowLen + k];
    acc[k] = a;
  }
  for (let y = 0; y < H; y++) {
    const out = y * rowLen;
    const add = Math.min(y + r + 1, last) * rowLen;
    const sub = Math.max(y - r, 0) * rowLen;
    for (let k = 0; k < rowLen; k++) {
      dst[out + k] = acc[k] * inv;
      acc[k] += src[add + k] - src[sub + k];
    }
  }
}

/** sigma (px) -> box radius for 3 passes. */
export function boxRadiusForSigma(sigma) {
  // 3 passes of radius r give variance r(r+1); solve r(r+1) = sigma^2
  return Math.max(0, Math.round((-1 + Math.sqrt(1 + 4 * sigma * sigma)) / 2));
}

// Subject bias: the centre of the frame matters more than the rim (Gaussian, sigma = half radius).
const weightMaps = new Map();
function centreWeights(G) {
  let w = weightMaps.get(G);
  if (w) return w;
  w = new Float32Array(G * G);
  const half = G / 2;
  for (let i = 0, y = 0; y < G; y++) {
    const dy = (y + 0.5 - half) / half;
    for (let x = 0; x < G; x++, i++) {
      const dx = (x + 0.5 - half) / half;
      w[i] = Math.exp(-(dx * dx + dy * dy) * 2);
    }
  }
  weightMaps.set(G, w);
  return w;
}

/** Centre-weighted histogram (256 bins) of values over masked pixels. */
function weightedHistogram(values, mask, G) {
  const hist = new Float64Array(256);
  const wts = centreWeights(G);
  let total = 0;
  for (let i = 0, N = G * G; i < N; i++) {
    if (!mask[i]) continue;
    const w = wts[i];
    const v = values[i];
    hist[v <= 0 ? 0 : v >= 1 ? 255 : (v * 255 + 0.5) | 0] += w;
    total += w;
  }
  return { hist, total };
}

/** v^g for v in [0,1] via a 4096-entry table with linear interpolation (Math.pow per pixel is slow). */
function applyGamma(out, g) {
  const n = 4096;
  const lut = new Float32Array(n + 2);
  for (let i = 0; i <= n; i++) lut[i] = Math.pow(i / n, g);
  lut[n + 1] = 1;
  for (let i = 0; i < out.length; i++) {
    const x = out[i] * n;
    const k = x | 0;
    out[i] = lut[k] + (lut[k + 1] - lut[k]) * (x - k);
  }
}

function percentile({ hist, total }, p) {
  const target = total * p;
  let acc = 0;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= target) return i / 255; }
  return 1;
}

/** Percentile levels over masked, centre-weighted pixels. Returns [lo, hi] in 0..1. */
export function levels(luma, mask, lowPct = 0.005, highPct = 0.995, G = Math.round(Math.sqrt(luma.length))) {
  const h = weightedHistogram(luma, mask, G);
  if (h.total < 1e-6) return [0, 1];
  const lo = percentile(h, lowPct), hi = percentile(h, highPct);
  if (hi - lo < 12 / 255) return [0, 1];   // nearly flat photo: stretching would only amplify noise
  return [lo, hi];
}

/** Mean ink coverage for exponent g over a weighted histogram. */
function meanInk(h, g, flip) {
  let s = 0;
  for (let i = 0; i < 256; i++) {
    if (!h.hist[i]) continue;
    const v = Math.pow(i / 255, g);
    s += h.hist[i] * (flip ? v : 1 - v);
  }
  return s / (h.total || 1);
}

/** Midtone exponent that makes the mean ink coverage hit `target` (bisection in log space). */
export function solveGamma(h, target, flip) {
  if (h.total < 1e-6) return 1;
  let lo = Math.log(0.1), hi = Math.log(10);
  // ink grows with the exponent for dark-on-light and shrinks for light-on-dark
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    const ink = meanInk(h, Math.exp(mid), flip);
    if ((ink < target) !== flip) lo = mid; else hi = mid;
  }
  return Math.exp((lo + hi) / 2);
}

/**
 * Apply the tone controls. Returns { L: Float32Array lightness (0 black .. 1 white), stats }.
 * `flip` = light ink on dark paper (ink goes where the photo is LIGHT), after the invert toggle.
 * Statistics are measured inside the circle only, weighted toward its centre.
 */
export function processTone(raster, tone, { flip = false } = {}) {
  const t = { ...TONE_DEFAULTS, ...tone };
  const { G, luma, mask } = raster;
  const N = G * G;
  const out = new Float32Array(N);
  const [lo, hi] = t.auto ? levels(luma, mask, 0.005, 0.995, G) : [0, 1];
  const span = Math.max(1e-3, hi - lo);
  for (let i = 0; i < N; i++) out[i] = clamp01((luma[i] - lo) / span);

  // Local contrast: unsharp mask with a wide radius (~2.5% of the diameter) lifts features
  // (eyes, mouth, the edge of a silhouette) that a spiral would otherwise flatten. The boost is
  // clamped so it never paints halos.
  if (t.detail > 0) {
    const base = Float32Array.from(out);
    boxBlur(base, G, boxRadiusForSigma(G * 0.025));
    const k = t.detail * 1.6;
    for (let i = 0; i < N; i++) {
      const d = Math.max(-0.15, Math.min(0.15, k * (out[i] - base[i])));
      out[i] = clamp01(out[i] + d);
    }
  }

  let h = weightedHistogram(out, mask, G);
  const mid = t.auto && h.total > 0 ? percentile(h, 0.5) : 0.5;
  const c = t.contrast >= 0 ? 1 + 2 * t.contrast : 1 + t.contrast;
  const b = t.auto ? 0 : t.brightness * 0.4;
  if (c !== 1 || b !== 0) {
    for (let i = 0; i < N; i++) out[i] = clamp01((out[i] - mid) * c + mid + b);
    h = weightedHistogram(out, mask, G);
  }

  // spread of tones inside the circle, to warn about flat photos
  const tot = h.total || 1;
  let mean = 0;
  for (let i = 0; i < 256; i++) mean += h.hist[i] * i / 255;
  mean /= tot;
  let varr = 0;
  for (let i = 0; i < 256; i++) varr += h.hist[i] * (i / 255 - mean) ** 2;
  const std = Math.sqrt(varr / tot);

  let gamma;
  if (t.auto) gamma = solveGamma(h, coverageTarget(t.darkness), flip);
  else gamma = Math.pow(2, (flip ? -1 : 1) * t.darkness * 1.3);
  if (gamma !== 1) applyGamma(out, gamma);

  return { L: out, stats: { lo, hi, gamma, std, flat: std < 0.03, coverage: meanInk(h, gamma, flip) } };
}

/**
 * Darkness field for a given ring count: D = 1 - lightness (flipped for light-on-dark media
 * or the invert toggle), then blurred to ~0.35 ring spacing so the spiral samples a band,
 * not single pixels (prevents aliasing / moire between rings and photo detail).
 */
export function buildField(raster, lightness, { rings, flip = false }) {
  const { G } = raster;
  const N = G * G;
  const D = new Float32Array(N);
  for (let i = 0; i < N; i++) D[i] = flip ? lightness[i] : 1 - lightness[i];
  const ringPx = (G / 2) / Math.max(1, rings);
  boxBlur(D, G, boxRadiusForSigma(ringPx * 0.35));
  return { G, D, rgb: null, raster, rings };
}

/** Blurred photo colour for "colour from photo" (lazily computed, cached on the field). */
export function ensureFieldColor(field) {
  if (field.rgb) return field.rgb;
  const { G, raster } = field;
  const N = G * G;
  const rgb = new Float32Array(N * 3);
  for (let i = 0; i < N * 3; i++) rgb[i] = raster.rgb[i];
  const ringPx = (G / 2) / Math.max(1, field.rings);
  boxBlur(rgb, G, boxRadiusForSigma(ringPx * 0.5), 3, 3);
  field.rgb = rgb;
  return rgb;
}

/** Bilinear sample of a single-channel grid at circle coords (x,y in [-1,1]); outside -> 0. */
export function sampleField(field, x, y) {
  const G = field.G;
  const gx = (x + 1) * 0.5 * G - 0.5;
  const gy = (y + 1) * 0.5 * G - 0.5;
  if (gx < -0.5 || gy < -0.5 || gx > G - 0.5 || gy > G - 0.5) return 0;
  const x0 = Math.max(0, Math.min(G - 1, Math.floor(gx)));
  const y0 = Math.max(0, Math.min(G - 1, Math.floor(gy)));
  const x1 = Math.min(G - 1, x0 + 1), y1 = Math.min(G - 1, y0 + 1);
  const fx = clamp01(gx - x0), fy = clamp01(gy - y0);
  const D = field.D;
  const a = D[y0 * G + x0], b = D[y0 * G + x1], c = D[y1 * G + x0], d = D[y1 * G + x1];
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
}

/** Bilinear RGB sample (0..255) into out[0..2]. */
export function sampleColor(field, x, y, out) {
  const G = field.G, rgb = field.rgb;
  const gx = Math.max(0, Math.min(G - 1, (x + 1) * 0.5 * G - 0.5));
  const gy = Math.max(0, Math.min(G - 1, (y + 1) * 0.5 * G - 0.5));
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const x1 = Math.min(G - 1, x0 + 1), y1 = Math.min(G - 1, y0 + 1);
  const fx = gx - x0, fy = gy - y0;
  for (let c = 0; c < 3; c++) {
    const a = rgb[(y0 * G + x0) * 3 + c], b = rgb[(y0 * G + x1) * 3 + c];
    const d0 = rgb[(y1 * G + x0) * 3 + c], d1 = rgb[(y1 * G + x1) * 3 + c];
    const top = a + (b - a) * fx, bot = d0 + (d1 - d0) * fx;
    out[c] = top + (bot - top) * fy;
  }
  return out;
}
