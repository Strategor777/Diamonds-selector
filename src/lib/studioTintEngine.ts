import type { DiamondOpticalLut, StudioMacroMaskShape } from './certVerification';

const CANVAS_SIZE = 512;
const SCALE = CANVAS_SIZE / 1000;
const MAX_CACHE_ENTRIES = 320;

const TINTED_URL_CACHE = new Map<string, string>();
const IN_FLIGHT_RENDERS = new Map<string, Promise<string | null>>();
const BASE_IMAGE_CACHE = new Map<string, Promise<HTMLImageElement | null>>();

export interface StudioTintOptions {
  aspectScaleX?: number;
  aspectScaleY?: number;
  preserveSpecular?: boolean;
}

function clamp255(value: number): number {
  if (value <= 0) return 0;
  if (value >= 255) return 255;
  return value | 0;
}

/**
 * Converts a space-separated sRGB tableValues string (identical to SVG
 * <feFunc* type="table" tableValues="..." />) into a 256-entry Uint8Array LUT.
 */
export function buildLut256(tableValues: string): Uint8Array {
  const stops = tableValues
    .trim()
    .split(/\s+/)
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v));

  const lut = new Uint8Array(256);
  if (stops.length === 0) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }
  if (stops.length === 1) {
    const fixed = clamp255(Math.round(stops[0] * 255));
    lut.fill(fixed);
    return lut;
  }

  const maxIdx = stops.length - 1;
  for (let i = 0; i < 256; i++) {
    const pos = (i / 255) * maxIdx;
    const lo = Math.min(maxIdx - 1, Math.floor(pos));
    const frac = pos - lo;
    const out = stops[lo] + (stops[lo + 1] - stops[lo]) * frac;
    lut[i] = clamp255(Math.round(out * 255));
  }
  return lut;
}

function formatAspectBucket(sx: number, sy: number): string {
  return `${Math.round(sx * 100)}x${Math.round(sy * 100)}`;
}

export function buildTintedStudioCacheKey(
  src: string,
  maskShape: StudioMacroMaskShape,
  lut: DiamondOpticalLut,
  options?: StudioTintOptions
): string {
  const sx = options?.aspectScaleX ?? 1;
  const sy = options?.aspectScaleY ?? 1;
  const spec = options?.preserveSpecular === false ? '0' : '1';
  return `${src}|${maskShape}|${lut.r}|${lut.g}|${lut.b}|${formatAspectBucket(sx, sy)}|${spec}`;
}

export function getCachedTintedStudioUrl(
  src: string,
  maskShape: StudioMacroMaskShape,
  lut: DiamondOpticalLut,
  options?: StudioTintOptions
): string | null {
  const key = buildTintedStudioCacheKey(src, maskShape, lut, options);
  const hit = TINTED_URL_CACHE.get(key);
  if (!hit) return null;
  // Refresh LRU recency
  TINTED_URL_CACHE.delete(key);
  TINTED_URL_CACHE.set(key, hit);
  return hit;
}

function storeInLruCache(key: string, dataUrl: string): void {
  if (TINTED_URL_CACHE.has(key)) {
    TINTED_URL_CACHE.delete(key);
  }
  TINTED_URL_CACHE.set(key, dataUrl);
  while (TINTED_URL_CACHE.size > MAX_CACHE_ENTRIES) {
    const oldestKey = TINTED_URL_CACHE.keys().next().value;
    if (oldestKey === undefined) break;
    TINTED_URL_CACHE.delete(oldestKey);
  }
}

function drawPolygon(
  ctx: CanvasRenderingContext2D,
  points: readonly (readonly [number, number])[],
  scale: number
): void {
  if (points.length === 0) return;
  ctx.moveTo(points[0][0] * scale, points[0][1] * scale);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i][0] * scale, points[i][1] * scale);
  }
  ctx.closePath();
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  scale: number
): void {
  const sx = x * scale;
  const sy = y * scale;
  const sw = w * scale;
  const sh = h * scale;
  const sr = Math.min(r * scale, sw / 2, sh / 2);
  ctx.moveTo(sx + sr, sy);
  ctx.lineTo(sx + sw - sr, sy);
  ctx.quadraticCurveTo(sx + sw, sy, sx + sw, sy + sr);
  ctx.lineTo(sx + sw, sy + sh - sr);
  ctx.quadraticCurveTo(sx + sw, sy + sh, sx + sw - sr, sy + sh);
  ctx.lineTo(sx + sr, sy + sh);
  ctx.quadraticCurveTo(sx, sy + sh, sx, sy + sh - sr);
  ctx.lineTo(sx, sy + sr);
  ctx.quadraticCurveTo(sx, sy, sx + sr, sy);
  ctx.closePath();
}

/**
 * Traces the precision-fitted girdle silhouette in Canvas 2D coordinates (0..canvasSize)
 * for all 24 calibrated studio master photographs. Supports optional proportional
 * scaling around the canvas center so elongated/square cuts stay strictly aligned.
 */
export function traceMacroSilhouette(
  ctx: CanvasRenderingContext2D,
  maskShape: StudioMacroMaskShape,
  canvasSize: number = CANVAS_SIZE,
  aspectScaleX: number = 1,
  aspectScaleY: number = 1
): void {
  const s = canvasSize / 1000;
  const cx = canvasSize / 2;
  const cy = canvasSize / 2;

  ctx.save();
  if (aspectScaleX !== 1 || aspectScaleY !== 1) {
    ctx.translate(cx, cy);
    ctx.scale(aspectScaleX, aspectScaleY);
    ctx.translate(-cx, -cy);
  }

  ctx.beginPath();

  switch (maskShape) {
    case 'round':
      ctx.arc(502 * s, 518 * s, 265 * s, 0, Math.PI * 2);
      ctx.closePath();
      break;
    case 'oval':
      ctx.ellipse(500 * s, 503 * s, 218 * s, 302 * s, 0, 0, Math.PI * 2);
      ctx.closePath();
      break;
    case 'moval':
      // Elongated Marquise-Oval hybrid matching white_colorless_moval
      ctx.moveTo(499 * s, 186 * s);
      ctx.bezierCurveTo(604 * s, 268 * s, 668 * s, 382 * s, 668 * s, 502 * s);
      ctx.bezierCurveTo(668 * s, 622 * s, 604 * s, 734 * s, 499 * s, 814 * s);
      ctx.bezierCurveTo(394 * s, 734 * s, 330 * s, 622 * s, 330 * s, 502 * s);
      ctx.bezierCurveTo(330 * s, 382 * s, 394 * s, 268 * s, 499 * s, 186 * s);
      ctx.closePath();
      break;
    case 'emerald':
      drawPolygon(
        ctx,
        [
          [334, 198],
          [672, 198],
          [752, 278],
          [752, 730],
          [672, 810],
          [334, 810],
          [254, 730],
          [254, 278],
        ],
        s
      );
      break;
    case 'princess':
      drawRoundedRect(ctx, 242, 244, 516, 516, 4, s);
      break;
    case 'cushion':
      ctx.moveTo(500 * s, 238 * s);
      ctx.bezierCurveTo(632 * s, 238 * s, 704 * s, 256 * s, 732 * s, 288 * s);
      ctx.bezierCurveTo(756 * s, 322 * s, 764 * s, 402 * s, 764 * s, 506 * s);
      ctx.bezierCurveTo(764 * s, 610 * s, 754 * s, 688 * s, 726 * s, 724 * s);
      ctx.bezierCurveTo(696 * s, 758 * s, 626 * s, 774 * s, 500 * s, 774 * s);
      ctx.bezierCurveTo(374 * s, 774 * s, 304 * s, 758 * s, 274 * s, 724 * s);
      ctx.bezierCurveTo(246 * s, 688 * s, 234 * s, 610 * s, 234 * s, 506 * s);
      ctx.bezierCurveTo(234 * s, 402 * s, 244 * s, 322 * s, 268 * s, 288 * s);
      ctx.bezierCurveTo(296 * s, 256 * s, 368 * s, 238 * s, 500 * s, 238 * s);
      ctx.closePath();
      break;
    case 'old_mine':
      // Antique pillow outline matching white_colorless_old_mine
      ctx.moveTo(500 * s, 230 * s);
      ctx.bezierCurveTo(634 * s, 230 * s, 710 * s, 250 * s, 736 * s, 286 * s);
      ctx.bezierCurveTo(760 * s, 324 * s, 768 * s, 404 * s, 768 * s, 502 * s);
      ctx.bezierCurveTo(768 * s, 606 * s, 756 * s, 684 * s, 728 * s, 722 * s);
      ctx.bezierCurveTo(698 * s, 758 * s, 626 * s, 774 * s, 500 * s, 774 * s);
      ctx.bezierCurveTo(374 * s, 774 * s, 302 * s, 758 * s, 272 * s, 722 * s);
      ctx.bezierCurveTo(244 * s, 684 * s, 232 * s, 606 * s, 232 * s, 502 * s);
      ctx.bezierCurveTo(232 * s, 404 * s, 240 * s, 324 * s, 264 * s, 286 * s);
      ctx.bezierCurveTo(290 * s, 250 * s, 366 * s, 230 * s, 500 * s, 230 * s);
      ctx.closePath();
      break;
    case 'pear':
      ctx.moveTo(498 * s, 198 * s);
      ctx.bezierCurveTo(570 * s, 258 * s, 714 * s, 408 * s, 714 * s, 568 * s);
      ctx.bezierCurveTo(714 * s, 706 * s, 622 * s, 792 * s, 498 * s, 792 * s);
      ctx.bezierCurveTo(374 * s, 792 * s, 284 * s, 706 * s, 284 * s, 568 * s);
      ctx.bezierCurveTo(284 * s, 408 * s, 426 * s, 258 * s, 498 * s, 198 * s);
      ctx.closePath();
      break;
    case 'radiant':
      drawPolygon(
        ctx,
        [
          [338, 228],
          [662, 228],
          [728, 294],
          [728, 730],
          [662, 796],
          [338, 796],
          [272, 730],
          [272, 294],
        ],
        s
      );
      break;
    case 'marquise':
      ctx.moveTo(499 * s, 166 * s);
      ctx.bezierCurveTo(618 * s, 272 * s, 684 * s, 388 * s, 684 * s, 505 * s);
      ctx.bezierCurveTo(684 * s, 622 * s, 618 * s, 738 * s, 499 * s, 844 * s);
      ctx.bezierCurveTo(380 * s, 738 * s, 314 * s, 622 * s, 314 * s, 505 * s);
      ctx.bezierCurveTo(314 * s, 388 * s, 380 * s, 272 * s, 499 * s, 166 * s);
      ctx.closePath();
      break;
    case 'heart':
      ctx.moveTo(500 * s, 338 * s);
      ctx.bezierCurveTo(460 * s, 282 * s, 408 * s, 264 * s, 356 * s, 264 * s);
      ctx.bezierCurveTo(266 * s, 264 * s, 216 * s, 330 * s, 216 * s, 418 * s);
      ctx.bezierCurveTo(216 * s, 558 * s, 344 * s, 676 * s, 500 * s, 784 * s);
      ctx.bezierCurveTo(656 * s, 676 * s, 786 * s, 558 * s, 786 * s, 418 * s);
      ctx.bezierCurveTo(786 * s, 330 * s, 736 * s, 264 * s, 646 * s, 264 * s);
      ctx.bezierCurveTo(594 * s, 264 * s, 540 * s, 282 * s, 500 * s, 338 * s);
      ctx.closePath();
      break;
    case 'asscher':
      drawPolygon(
        ctx,
        [
          [302, 198],
          [704, 198],
          [802, 296],
          [802, 704],
          [704, 802],
          [302, 802],
          [204, 704],
          [204, 296],
        ],
        s
      );
      break;
    case 'baguette':
      drawRoundedRect(ctx, 306, 174, 392, 664, 2, s);
      break;
    case 'trilliant':
      ctx.moveTo(500 * s, 206 * s);
      ctx.bezierCurveTo(588 * s, 342 * s, 718 * s, 548 * s, 800 * s, 694 * s);
      ctx.bezierCurveTo(770 * s, 762 * s, 636 * s, 792 * s, 502 * s, 792 * s);
      ctx.bezierCurveTo(368 * s, 792 * s, 234 * s, 762 * s, 204 * s, 694 * s);
      ctx.bezierCurveTo(286 * s, 548 * s, 412 * s, 342 * s, 500 * s, 206 * s);
      ctx.closePath();
      break;
    case 'shield':
      drawPolygon(
        ctx,
        [
          [316, 198],
          [684, 198],
          [764, 316],
          [760, 368],
          [500, 860],
          [240, 368],
          [236, 316],
        ],
        s
      );
      break;
    case 'kite':
      drawPolygon(
        ctx,
        [
          [498, 178],
          [738, 416],
          [500, 864],
          [258, 416],
        ],
        s
      );
      break;
    case 'hexagon':
      drawPolygon(
        ctx,
        [
          [500, 136],
          [736, 310],
          [736, 704],
          [500, 884],
          [264, 704],
          [264, 310],
        ],
        s
      );
      break;
    case 'lozenge':
      drawPolygon(
        ctx,
        [
          [500, 112],
          [764, 504],
          [500, 912],
          [236, 504],
        ],
        s
      );
      break;
    case 'half_moon': {
      // Precision-fitted horizontal semicircle matching white_colorless_half_moon_v2 & 1170-12B
      ctx.ellipse(503 * s, 706 * s, 352 * s, 430 * s, 0, Math.PI, Math.PI * 2, false);
      ctx.closePath();
      break;
    }
    case 'trapezoid':
      drawPolygon(
        ctx,
        [
          [320, 198],
          [680, 198],
          [800, 816],
          [192, 816],
        ],
        s
      );
      break;
    case 'cadillac':
      drawPolygon(
        ctx,
        [
          [260, 212],
          [740, 212],
          [820, 376],
          [500, 834],
          [180, 376],
        ],
        s
      );
      break;
    case 'briolette':
      ctx.moveTo(500 * s, 148 * s);
      ctx.bezierCurveTo(582 * s, 252 * s, 746 * s, 426 * s, 746 * s, 588 * s);
      ctx.bezierCurveTo(746 * s, 742 * s, 646 * s, 856 * s, 500 * s, 856 * s);
      ctx.bezierCurveTo(354 * s, 856 * s, 252 * s, 742 * s, 252 * s, 588 * s);
      ctx.bezierCurveTo(252 * s, 426 * s, 418 * s, 252 * s, 500 * s, 148 * s);
      ctx.closePath();
      break;
    case 'cabochon':
      ctx.ellipse(500 * s, 494 * s, 232 * s, 294 * s, 0, 0, Math.PI * 2);
      ctx.closePath();
      break;
    case 'rose_cut':
      ctx.arc(500 * s, 518 * s, 266 * s, 0, Math.PI * 2);
      ctx.closePath();
      break;
  }

  ctx.restore();
}

export function loadStudioMasterImage(src: string): Promise<HTMLImageElement | null> {
  const existing = BASE_IMAGE_CACHE.get(src);
  if (existing) return existing;

  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    if (typeof Image === 'undefined') {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        resolve(img);
      } else {
        BASE_IMAGE_CACHE.delete(src);
        resolve(null);
      }
    };
    img.onerror = () => {
      BASE_IMAGE_CACHE.delete(src);
      resolve(null);
    };
    img.src = src;
  });

  BASE_IMAGE_CACHE.set(src, promise);
  return promise;
}

/**
 * Samples the neutral light-gray studio backdrop from the four corner zones of an image
 * so edge-aware matting and proportional scaling remain completely seamless.
 */
function sampleCornerBackdrop(
  pixels: Uint8ClampedArray,
  size: number
): { r: number; g: number; b: number } {
  const pts: [number, number][] = [
    [12, 12],
    [size - 13, 12],
    [12, size - 13],
    [size - 13, size - 13],
  ];
  let r = 0;
  let g = 0;
  let b = 0;
  for (const [x, y] of pts) {
    const idx = (y * size + x) * 4;
    r += pixels[idx];
    g += pixels[idx + 1];
    b += pixels[idx + 2];
  }
  return {
    r: Math.round(r / pts.length),
    g: Math.round(g / pts.length),
    b: Math.round(b / pts.length),
  };
}

/**
 * Renders a physically calibrated sRGB 6-stop optical LUT colorized diamond
 * photograph strictly inside the edge-aware feathered gem silhouette using Canvas 2D.
 *
 * Enhancements:
 * - Edge-aware corner-backdrop protection prevents any tint bleed onto the studio surface.
 * - Specular brilliance preservation keeps crisp white diamond highlights realistic.
 * - Optional real-world L:W aspect-ratio calibration aligns elongated vs square proportions.
 */
export function renderTintedStudioImage(
  src: string,
  maskShape: StudioMacroMaskShape,
  lut: DiamondOpticalLut,
  options?: StudioTintOptions
): Promise<string | null> {
  const aspectScaleX = options?.aspectScaleX ?? 1;
  const aspectScaleY = options?.aspectScaleY ?? 1;
  const preserveSpecular = options?.preserveSpecular !== false;

  const cached = getCachedTintedStudioUrl(src, maskShape, lut, options);
  if (cached) return Promise.resolve(cached);

  const key = buildTintedStudioCacheKey(src, maskShape, lut, options);
  const inFlight = IN_FLIGHT_RENDERS.get(key);
  if (inFlight) return inFlight;

  const task = (async (): Promise<string | null> => {
    if (typeof document === 'undefined') return null;

    const img = await loadStudioMasterImage(src);
    if (!img) return null;

    try {
      // 1. Sample true corner studio backdrop first so proportional scaling stays seamless
      const probeCanvas = document.createElement('canvas');
      probeCanvas.width = CANVAS_SIZE;
      probeCanvas.height = CANVAS_SIZE;
      const pctx = probeCanvas.getContext('2d', { willReadFrequently: true });
      if (!pctx) return null;

      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const cropSize = Math.min(iw, ih);
      const sx = (iw - cropSize) / 2;
      const sy = (ih - cropSize) / 2;
      pctx.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
      const probeData = pctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE).data;
      const bg = sampleCornerBackdrop(probeData, CANVAS_SIZE);

      // 2. Render base stone (optionally scaled to real L:W proportions on seamless studio fill)
      const mainCanvas = document.createElement('canvas');
      mainCanvas.width = CANVAS_SIZE;
      mainCanvas.height = CANVAS_SIZE;
      const ctx = mainCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;

      if (aspectScaleX !== 1 || aspectScaleY !== 1) {
        ctx.fillStyle = `rgb(${bg.r}, ${bg.g}, ${bg.b})`;
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        ctx.save();
        ctx.translate(CANVAS_SIZE / 2, CANVAS_SIZE / 2);
        ctx.scale(aspectScaleX, aspectScaleY);
        ctx.translate(-CANVAS_SIZE / 2, -CANVAS_SIZE / 2);
        ctx.drawImage(probeCanvas, 0, 0);
        ctx.restore();
      } else {
        ctx.drawImage(probeCanvas, 0, 0);
      }

      const imgData = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      const pixels = imgData.data;

      // 3. Render feathered girdle alpha mask aligned with aspectScaleX/Y
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = CANVAS_SIZE;
      maskCanvas.height = CANVAS_SIZE;
      const mctx = maskCanvas.getContext('2d', { willReadFrequently: true });
      if (!mctx) return null;

      mctx.fillStyle = '#000000';
      mctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      mctx.save();
      mctx.fillStyle = '#FFFFFF';
      mctx.shadowColor = '#FFFFFF';
      mctx.shadowBlur = 2.2;
      traceMacroSilhouette(mctx, maskShape, CANVAS_SIZE, aspectScaleX, aspectScaleY);
      mctx.fill();
      mctx.restore();

      const maskPixels = mctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE).data;

      // 4. Precompute 256-entry sRGB LUTs for R, G, B
      const lutR = buildLut256(lut.r);
      const lutG = buildLut256(lut.g);
      const lutB = buildLut256(lut.b);

      // 5. Apply optical absorption strictly inside the edge-aware feathered silhouette
      const totalBytes = pixels.length;
      for (let i = 0; i < totalBytes; i += 4) {
        const m = maskPixels[i]; // 0..255
        if (m === 0) continue;

        const r0 = pixels[i];
        const g0 = pixels[i + 1];
        const b0 = pixels[i + 2];

        let alpha = m / 255;

        // Edge-aware studio backdrop protection in the perimeter feather band:
        // prevents any tinted halo on the neutral studio paper or contact shadow.
        if (m < 245) {
          const dr = Math.abs(r0 - bg.r);
          const dg = Math.abs(g0 - bg.g);
          const db = Math.abs(b0 - bg.b);
          const bgDist = dr + dg + db;
          if (bgDist < 16) {
            alpha *= Math.max(0, (bgDist - 5) / 11);
            if (alpha <= 0.01) continue;
          }
        }

        // Neutralize slight natural warmth before optical LUT mapping
        const lum = 0.299 * r0 + 0.587 * g0 + 0.114 * b0;
        const nr = clamp255(Math.round(lum + (r0 - lum) * 0.16));
        const ng = clamp255(Math.round(lum + (g0 - lum) * 0.16));
        const nb = clamp255(Math.round(lum + (b0 - lum) * 0.16));

        let tr = lutR[nr];
        let tg = lutG[ng];
        let tb = lutB[nb];

        // Preserve pure white surface specular fire on ultra-bright crown facets
        if (preserveSpecular && lum > 240) {
          const specMix = Math.min(0.52, ((lum - 240) / 15) * 0.52);
          tr = clamp255(Math.round(tr + (255 - tr) * specMix));
          tg = clamp255(Math.round(tg + (255 - tg) * specMix));
          tb = clamp255(Math.round(tb + (255 - tb) * specMix));
        }

        if (alpha >= 0.995) {
          pixels[i] = tr;
          pixels[i + 1] = tg;
          pixels[i + 2] = tb;
        } else {
          const inv = 1 - alpha;
          pixels[i] = clamp255(Math.round(r0 * inv + tr * alpha));
          pixels[i + 1] = clamp255(Math.round(g0 * inv + tg * alpha));
          pixels[i + 2] = clamp255(Math.round(b0 * inv + tb * alpha));
        }
      }

      ctx.putImageData(imgData, 0, 0);
      const dataUrl = mainCanvas.toDataURL('image/jpeg', 0.93);
      if (dataUrl && dataUrl.startsWith('data:image/')) {
        storeInLruCache(key, dataUrl);
        return dataUrl;
      }
      return null;
    } catch {
      return null;
    }
  })();

  IN_FLIGHT_RENDERS.set(key, task);
  task.finally(() => {
    IN_FLIGHT_RENDERS.delete(key);
  });

  return task;
}
