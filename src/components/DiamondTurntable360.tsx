import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Film, Pause, Play, RotateCw } from 'lucide-react';
import { SHAPE_SHORT_RU } from '../data/diamonds';
import {
  getCalibratedStudioVisual,
  resolveSupplierPhotoUrl,
} from '../lib/certVerification';
import { sanitizeMediaUrl } from '../lib/fancyColorParser';
import {
  getCachedTintedStudioUrl,
  renderTintedStudioImage,
  traceMacroSilhouette,
} from '../lib/studioTintEngine';
import { Diamond } from '../types/diamond';

interface DiamondTurntable360Props {
  diamond: Diamond;
  compact?: boolean;
}

function isDirectVideoFile(url: string): boolean {
  const clean = url.split('?')[0].toLowerCase();
  return (
    clean.endsWith('.mp4') ||
    clean.endsWith('.webm') ||
    clean.endsWith('.mov') ||
    clean.endsWith('.m4v') ||
    clean.endsWith('.ogg') ||
    clean.includes('nivoda-inhousemedia.s3.amazonaws.com/inhouse-360-')
  );
}

interface FacetGlintSite {
  nx: number;
  ny: number;
  phase: number;
  freq: number;
  size: number;
  spectralIdx: number;
}

/**
 * Deterministic micro-facet scintillation anchor coordinates inside the crown & pavilion,
 * scaled to the active diamond's shape silhouette and real L/W proportions.
 */
const FACET_GLINT_SITES: readonly FacetGlintSite[] = [
  { nx: -0.22, ny: -0.18, phase: 0.25, freq: 2, size: 1.0, spectralIdx: 0 },
  { nx: 0.24, ny: -0.16, phase: 1.4, freq: 2, size: 0.95, spectralIdx: 1 },
  { nx: -0.16, ny: 0.2, phase: 2.35, freq: 2, size: 0.9, spectralIdx: 2 },
  { nx: 0.2, ny: 0.21, phase: 3.6, freq: 2, size: 0.95, spectralIdx: 0 },
  { nx: 0.0, ny: -0.28, phase: 0.95, freq: 3, size: 0.85, spectralIdx: 1 },
  { nx: 0.02, ny: 0.27, phase: 4.15, freq: 3, size: 0.85, spectralIdx: 2 },
  { nx: -0.3, ny: 0.02, phase: 5.05, freq: 2, size: 0.8, spectralIdx: 1 },
  { nx: 0.31, ny: -0.01, phase: 1.9, freq: 2, size: 0.85, spectralIdx: 0 },
  { nx: -0.1, ny: -0.06, phase: 2.85, freq: 3, size: 0.72, spectralIdx: 0 },
  { nx: 0.11, ny: 0.07, phase: 0.55, freq: 3, size: 0.75, spectralIdx: 2 },
  { nx: -0.14, ny: -0.27, phase: 4.75, freq: 3, size: 0.68, spectralIdx: 1 },
  { nx: 0.15, ny: 0.28, phase: 3.1, freq: 3, size: 0.68, spectralIdx: 0 },
  { nx: -0.26, ny: 0.13, phase: 5.7, freq: 2, size: 0.74, spectralIdx: 2 },
  { nx: 0.26, ny: -0.12, phase: 2.15, freq: 3, size: 0.74, spectralIdx: 1 },
];

function drawStarSparkle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  intensity: number,
  tintRgba: string
): void {
  if (intensity <= 0.02) return;

  // Soft optical bloom halo
  const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.4);
  glow.addColorStop(0, `rgba(255, 255, 255, ${(0.88 * intensity).toFixed(3)})`);
  glow.addColorStop(0.28, tintRgba);
  glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, radius * 2.4, 0, Math.PI * 2);
  ctx.fill();

  // Sharp 4-point specular glint spike on strong brilliance peaks
  if (intensity > 0.36) {
    const spikeLen = radius * (1.25 + intensity * 1.15);
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = `rgba(255, 255, 255, ${(0.78 * intensity).toFixed(3)})`;
    ctx.lineWidth = Math.max(0.8, radius * 0.14);
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(-spikeLen, 0);
    ctx.lineTo(spikeLen, 0);
    ctx.moveTo(0, -spikeLen);
    ctx.lineTo(0, spikeLen);
    ctx.stroke();

    const diag = spikeLen * 0.52;
    ctx.strokeStyle = `rgba(255, 255, 255, ${(0.45 * intensity).toFixed(3)})`;
    ctx.lineWidth = Math.max(0.6, radius * 0.1);
    ctx.beginPath();
    ctx.moveTo(-diag, -diag);
    ctx.lineTo(diag, diag);
    ctx.moveTo(-diag, diag);
    ctx.lineTo(diag, -diag);
    ctx.stroke();
    ctx.restore();
  }
}

export const DiamondTurntable360: React.FC<DiamondTurntable360Props> = ({
  diamond,
  compact = false,
}) => {
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [angle, setAngle] = useState(24);
  const [speed, setSpeed] = useState<0.5 | 1 | 2>(1);
  const [externalError, setExternalError] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const sanitizedVideoUrl = useMemo(
    () => sanitizeMediaUrl(diamond.videoUrl),
    [diamond.videoUrl]
  );

  // Rule 1: Supplier 360° video/viewer ALWAYS takes top priority when present
  const [mode, setMode] = useState<'turntable' | 'external'>(
    sanitizedVideoUrl ? 'external' : 'turntable'
  );
  const draggingRef = useRef(false);
  const lastXRef = useRef(0);

  // Reset mode and error state when switching stones
  useEffect(() => {
    setExternalError(false);
    setIframeLoaded(false);
    setMode(sanitizedVideoUrl ? 'external' : 'turntable');
  }, [diamond.id, sanitizedVideoUrl]);

  const directVideo = useMemo(
    () => (sanitizedVideoUrl ? isDirectVideoFile(sanitizedVideoUrl) : false),
    [sanitizedVideoUrl]
  );

  // Rule 1 + Rule 2 visual resolution for the photorealistic 360° showcase:
  // Priority 1: Real supplier photograph (direct imageUrl or derived v360/gem360 still)
  // Priority 2: Shape-, proportion-, and GIA-color-calibrated high-res studio master
  const supplierPhotoUrl = useMemo(() => {
    if (diamond.useStudioPhoto) return undefined;
    return resolveSupplierPhotoUrl(diamond);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diamond.imageUrl, diamond.videoUrl, diamond.useStudioPhoto]);

  const [supplierPhotoState, setSupplierPhotoState] = useState<
    'idle' | 'loaded' | 'failed'
  >(supplierPhotoUrl ? 'idle' : 'failed');

  useEffect(() => {
    setSupplierPhotoState(supplierPhotoUrl ? 'idle' : 'failed');
  }, [supplierPhotoUrl]);

  const studioVisual = useMemo(
    () => getCalibratedStudioVisual(diamond),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      diamond.shape,
      diamond.lwRatio,
      diamond.color,
      diamond.colorFamily,
      diamond.fancyIntensity,
      diamond.fancyOvertone,
      diamond.overtone,
      diamond.certVerifiedColor,
      diamond.directory,
      diamond.isFancyColor,
    ]
  );

  const maskShape = studioVisual.maskShape || 'round';
  const aspectScaleX = studioVisual.aspectScaleX ?? 1;
  const aspectScaleY = studioVisual.aspectScaleY ?? 1;
  const preserveSpecular =
    !studioVisual.palette.isBlack && !studioVisual.palette.darknessOverlay;
  const lut = studioVisual.palette.lut;
  const lutR = lut?.r || '';
  const lutG = lut?.g || '';
  const lutB = lut?.b || '';

  const tintOptions = useMemo(
    () => ({ aspectScaleX, aspectScaleY, preserveSpecular }),
    [aspectScaleX, aspectScaleY, preserveSpecular]
  );

  const syncTintedUrl = useMemo(
    () =>
      studioVisual.mode === 'tinted-macro' && lut
        ? getCachedTintedStudioUrl(studioVisual.src, maskShape, lut, tintOptions)
        : null,
    [studioVisual.mode, studioVisual.src, maskShape, lut, lutR, lutG, lutB, tintOptions]
  );

  const [tintedUrl, setTintedUrl] = useState<string | null>(syncTintedUrl);

  useEffect(() => {
    if (studioVisual.mode !== 'tinted-macro' || !lut) {
      setTintedUrl(null);
      return;
    }
    const hit = getCachedTintedStudioUrl(studioVisual.src, maskShape, lut, tintOptions);
    if (hit) {
      setTintedUrl(hit);
      return;
    }
    setTintedUrl(null);
    let cancelled = false;
    void renderTintedStudioImage(studioVisual.src, maskShape, lut, tintOptions).then(
      (dataUrl) => {
        if (!cancelled && dataUrl) {
          setTintedUrl(dataUrl);
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [studioVisual.mode, studioVisual.src, maskShape, lut, lutR, lutG, lutB, tintOptions]);

  const showSupplierInTurntable = Boolean(
    supplierPhotoUrl && supplierPhotoState === 'loaded'
  );
  const studioImageSrc =
    studioVisual.mode === 'tinted-macro'
      ? syncTintedUrl || tintedUrl || studioVisual.src
      : studioVisual.src;
  const isTintedReady =
    studioVisual.mode !== 'tinted-macro' || Boolean(syncTintedUrl || tintedUrl);

  // Smooth 60fps rotation timer
  useEffect(() => {
    if (!isPlaying || mode !== 'turntable') return;
    let rafId = 0;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.08, (now - lastTime) / 1000);
      lastTime = now;
      setAngle((prev) => (prev + dt * 36 * speed) % 360);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, speed, mode]);

  // Synchronized optical scintillation, softbox sweep & spectral fire overlay
  useEffect(() => {
    if (mode !== 'turntable') return;
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = 480;
    if (canvas.width !== size * dpr || canvas.height !== size * dpr) {
      canvas.width = size * dpr;
      canvas.height = size * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const rad = (angle * Math.PI) / 180;
    const { palette } = studioVisual;

    // Clip all optical light effects strictly inside the stone silhouette
    ctx.save();
    if (!showSupplierInTurntable) {
      traceMacroSilhouette(ctx, maskShape, size, aspectScaleX, aspectScaleY);
      ctx.clip();
    } else {
      ctx.beginPath();
      ctx.ellipse(
        cx,
        cy,
        size * 0.34 * aspectScaleX,
        size * 0.34 * aspectScaleY,
        0,
        0,
        Math.PI * 2
      );
      ctx.clip();
    }

    // 1. Subtle moving crown/pavilion contrast shadow (simulates real 360° studio head-shadow shift)
    const shadowShiftX = Math.cos(rad + Math.PI) * size * 0.16;
    const shadowShiftY = Math.sin(rad + Math.PI) * size * 0.08;
    const contrastGrad = ctx.createRadialGradient(
      cx + shadowShiftX,
      cy + shadowShiftY,
      size * 0.04,
      cx + shadowShiftX,
      cy + shadowShiftY,
      size * 0.38
    );
    contrastGrad.addColorStop(
      0,
      palette.isBlack ? 'rgba(0, 0, 0, 0.22)' : 'rgba(15, 23, 42, 0.13)'
    );
    contrastGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = contrastGrad;
    ctx.fillRect(0, 0, size, size);

    // 2. Sweeping overhead studio softbox specular sheen across the table & crown facets
    ctx.globalCompositeOperation = 'screen';
    const sweepCenter = cx + Math.sin(rad) * size * 0.26;
    const sweepAngle = 0.55 + Math.cos(rad) * 0.25;
    const dx = Math.cos(sweepAngle) * size * 0.34;
    const dy = Math.sin(sweepAngle) * size * 0.34;
    const sheenGrad = ctx.createLinearGradient(
      sweepCenter - dx,
      cy - dy,
      sweepCenter + dx,
      cy + dy
    );
    const sheenPeak = palette.isBlack ? 0.22 : palette.isWhite ? 0.28 : 0.24;
    sheenGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    sheenGrad.addColorStop(0.42, 'rgba(255, 255, 255, 0)');
    sheenGrad.addColorStop(0.5, `rgba(255, 255, 255, ${sheenPeak.toFixed(2)})`);
    sheenGrad.addColorStop(0.58, 'rgba(255, 255, 255, 0)');
    sheenGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = sheenGrad;
    ctx.fillRect(0, 0, size, size);

    // 3. Moving rim brilliance reflection along the rotating crown bezel
    const rimX = cx + Math.cos(rad) * size * 0.22;
    const rimY = cy - size * 0.08 + Math.sin(rad) * size * 0.12;
    const rimGrad = ctx.createRadialGradient(rimX, rimY, 4, rimX, rimY, size * 0.24);
    rimGrad.addColorStop(
      0,
      palette.isBlack ? 'rgba(226, 232, 240, 0.26)' : 'rgba(255, 255, 255, 0.32)'
    );
    rimGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = rimGrad;
    ctx.fillRect(0, 0, size, size);

    // 4. Micro-facet scintillation & natural prismatic fire glints (skip for smooth Cabochon)
    if (diamond.shape !== 'Cabochon') {
      ctx.globalCompositeOperation = 'lighter';
      const spreadX = size * 0.56 * aspectScaleX;
      const spreadY = size * 0.56 * aspectScaleY;
      const centerOffsetY = maskShape === 'half_moon' ? size * 0.04 : 0;

      const spectralPalette = palette.isWhite
        ? [
            'rgba(198, 228, 255, 0.52)', // icy cyan dispersion
            'rgba(255, 244, 214, 0.46)', // warm champagne fire
            'rgba(228, 214, 255, 0.44)', // delicate violet fire
          ]
        : palette.isBlack
          ? [
              'rgba(226, 232, 240, 0.42)',
              'rgba(203, 213, 225, 0.34)',
              'rgba(241, 245, 249, 0.38)',
            ]
          : [
              'rgba(255, 255, 255, 0.50)',
              'rgba(255, 250, 240, 0.42)',
              'rgba(235, 245, 255, 0.40)',
            ];

      const fireBoost =
        diamond.cut === 'Ideal' ? 1.0 : diamond.cut === 'Excellent' ? 0.92 : 0.78;
      const intensityScale = palette.isBlack ? 0.52 : palette.isWhite ? 0.82 : 0.74;

      for (let i = 0; i < FACET_GLINT_SITES.length; i++) {
        const site = FACET_GLINT_SITES[i];
        const wave = Math.max(0, Math.cos(rad * site.freq + site.phase));
        const flash = Math.pow(wave, 9) * fireBoost * intensityScale;
        if (flash < 0.05) continue;

        const gx = cx + site.nx * spreadX + Math.sin(rad + site.phase) * 5;
        const gy =
          cy + centerOffsetY + site.ny * spreadY + Math.cos(rad + site.phase) * 3;
        const glintRadius = (5.5 + site.size * 5.2) * (0.75 + flash * 0.45);
        const tint = spectralPalette[site.spectralIdx % spectralPalette.length];

        drawStarSparkle(ctx, gx, gy, glintRadius, flash, tint);
      }
    }

    ctx.restore();
    ctx.restore();
  }, [
    angle,
    diamond.cut,
    diamond.shape,
    maskShape,
    aspectScaleX,
    aspectScaleY,
    mode,
    showSupplierInTurntable,
    studioVisual,
  ]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    lastXRef.current = e.clientX;
    setIsPlaying(false);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - lastXRef.current;
    lastXRef.current = e.clientX;
    setAngle((prev) => (prev + dx * 0.9 + 360) % 360);
  };

  const handlePointerUp = () => {
    draggingRef.current = false;
  };

  // Subtle realistic 3D turntable perspective rocking synchronized with angle (0..360°)
  const rad = (angle * Math.PI) / 180;
  const yawDeg = Math.sin(rad) * 18;
  const pitchDeg = Math.cos(rad) * 8.5 - 2;
  const rollDeg = Math.sin(rad) * 2.2;
  const depthScale = 0.95 + Math.cos(rad * 2) * 0.025;
  const shadowOffsetX = -Math.sin(rad) * 14;
  const shadowScaleX = 0.92 + Math.abs(Math.cos(rad)) * 0.1;

  const altText = `${SHAPE_SHORT_RU[diamond.shape] || diamond.shape} ${diamond.carat.toFixed(2)} ct ${diamond.color} ${diamond.clarity}`;

  const nativeStudioImgStyle: React.CSSProperties | undefined =
    !showSupplierInTurntable &&
    studioVisual.mode === 'native-photo' &&
    (studioVisual.filter || aspectScaleX !== 1 || aspectScaleY !== 1)
      ? {
          ...(studioVisual.filter ? { filter: studioVisual.filter } : {}),
          ...(aspectScaleX !== 1 || aspectScaleY !== 1
            ? { transform: `scale(${aspectScaleX}, ${aspectScaleY})` }
            : {}),
        }
      : undefined;

  return (
    <div
      className={
        compact
          ? 'relative w-full h-full bg-[#ECEEF1] overflow-hidden'
          : 'bg-[#ECEEF1] border border-[#E4E6EB] rounded-lg overflow-hidden'
      }
    >
      {/* Top source switcher when diamond has an external supplier videoUrl (Rule 1) */}
      {sanitizedVideoUrl && !compact && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-white border-b border-[#E4E6EB]">
          <div className="flex items-center gap-2 text-xs text-[#5A606D]">
            <span>Источник видео</span>
            <a
              href={sanitizedVideoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[#1B365D] hover:underline font-medium"
            >
              Открыть ссылку
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="flex items-center gap-1 p-0.5 bg-[#F1F3F5] rounded-md">
            <button
              type="button"
              onClick={() => {
                setExternalError(false);
                setMode('external');
              }}
              className={`px-3 py-1 text-xs font-medium rounded whitespace-nowrap transition-colors ${
                mode === 'external'
                  ? 'bg-white text-[#111317] shadow-sm'
                  : 'text-[#5A606D] hover:text-[#111317]'
              }`}
            >
              Видео по ссылке
            </button>
            <button
              type="button"
              onClick={() => setMode('turntable')}
              className={`px-3 py-1 text-xs font-medium rounded whitespace-nowrap transition-colors ${
                mode === 'turntable'
                  ? 'bg-white text-[#111317] shadow-sm'
                  : 'text-[#5A606D] hover:text-[#111317]'
              }`}
            >
              Студийный 360°
            </button>
          </div>
        </div>
      )}

      {!sanitizedVideoUrl && !compact && (
        <div className="flex items-center justify-between gap-2 px-4 py-2 bg-white border-b border-[#E4E6EB] text-xs text-[#5A606D]">
          <span>
            {showSupplierInTurntable
              ? 'Видео поставщика отсутствует — интерактивный 360° обзор на основе фото поставщика'
              : `Видео поставщика отсутствует — фотореалистичный 360° обзор (${studioVisual.label})`}
          </span>
        </div>
      )}

      {mode === 'external' && sanitizedVideoUrl && !externalError ? (
        <div
          className={`relative w-full ${
            compact ? 'h-full' : 'max-w-[480px] aspect-square mx-auto'
          } bg-[#F8F9FB] overflow-hidden`}
        >
          {directVideo ? (
            <video
              key={sanitizedVideoUrl}
              src={sanitizedVideoUrl}
              controls={!compact}
              autoPlay
              loop
              muted
              playsInline
              onError={() => {
                setExternalError(true);
                setMode('turntable');
              }}
              className="absolute inset-0 w-full h-full object-contain bg-[#F8F9FB]"
            />
          ) : (
            <>
              {!iframeLoaded && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center bg-[#F4F5F7] text-xs text-[#5A606D]">
                  <span>Загрузка 360° плеера поставщика...</span>
                  <div className="flex items-center gap-2">
                    <a
                      href={sanitizedVideoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white border border-[#D5D9E0] text-[#1B365D] font-medium hover:bg-[#F7F8FA]"
                    >
                      Открыть видео
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <button
                      type="button"
                      onClick={() => setMode('turntable')}
                      className="px-2.5 py-1 rounded bg-white border border-[#D5D9E0] text-[#111317] font-medium hover:bg-[#F7F8FA]"
                    >
                      Студийный 360°
                    </button>
                  </div>
                </div>
              )}
              <iframe
                key={sanitizedVideoUrl}
                src={sanitizedVideoUrl}
                title={`360 видео ${diamond.sku}`}
                referrerPolicy="no-referrer"
                allow="fullscreen; autoplay"
                sandbox="allow-scripts allow-same-origin allow-popups"
                onLoad={() => setIframeLoaded(true)}
                onError={() => {
                  setExternalError(true);
                  setMode('turntable');
                }}
                className="absolute inset-0 w-full h-full border-0 bg-transparent block"
              />
            </>
          )}

          {compact ? (
            <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 z-10">
              <button
                type="button"
                onClick={() => setMode('turntable')}
                className="px-2 py-1 rounded bg-white/92 backdrop-blur-sm border border-[#E4E6EB] text-[11px] font-medium text-[#111317] hover:bg-white transition-colors"
              >
                Студийный 360°
              </button>
              <a
                href={sanitizedVideoUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Открыть внешнее видео в новой вкладке"
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/92 backdrop-blur-sm border border-[#E4E6EB] text-[11px] font-medium text-[#1B365D] hover:bg-white transition-colors"
              >
                <span>Открыть</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          ) : !directVideo ? (
            <div className="absolute bottom-2.5 left-2.5 right-2.5 z-10 flex items-center justify-between gap-2 px-3 py-1.5 rounded bg-white/92 backdrop-blur-sm border border-[#E4E6EB] text-[11px] text-[#5A606D]">
              <span className="truncate">
                Если плеер поставщика блокирует встраивание, откройте ссылку или переключитесь на студийный 360°
              </span>
              <a
                href={sanitizedVideoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[#1B365D] font-medium hover:underline whitespace-nowrap shrink-0"
              >
                Открыть ↗
              </a>
            </div>
          ) : null}
        </div>
      ) : (
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`${
            compact ? 'relative w-full h-full' : 'relative w-full max-w-[480px] aspect-square mx-auto'
          } overflow-hidden select-none cursor-grab active:cursor-grabbing touch-none bg-[#EAECEF]`}
          style={{
            background:
              'radial-gradient(circle at 50% 42%, #F6F7F9 0%, #ECEEF1 58%, #E1E4EA 100%)',
          }}
        >
          {/* Dynamic rotating turntable pedestal shadow */}
          <div
            aria-hidden="true"
            className="absolute left-1/2 bottom-[11%] w-[52%] h-[9%] rounded-full pointer-events-none"
            style={{
              transform: `translate(-50%, 0) translateX(${shadowOffsetX.toFixed(1)}px) scaleX(${shadowScaleX.toFixed(3)})`,
              background:
                'radial-gradient(ellipse at center, rgba(17, 19, 23, 0.22) 0%, rgba(17, 19, 23, 0.06) 52%, rgba(17, 19, 23, 0) 76%)',
              filter: 'blur(6px)',
            }}
          />

          {/* 3D Perspective Stage holding photorealistic diamond + synchronized scintillation canvas */}
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{
              transform: `perspective(920px) rotateY(${yawDeg.toFixed(2)}deg) rotateX(${pitchDeg.toFixed(2)}deg) rotateZ(${rollDeg.toFixed(2)}deg) scale(${depthScale.toFixed(4)})`,
              transformStyle: 'preserve-3d',
              willChange: 'transform',
            }}
          >
            <div className="relative w-full h-full flex items-center justify-center">
              {/* Studio base layer (visible immediately and whenever supplier still photo isn't loaded) */}
              {!showSupplierInTurntable && (
                <>
                  <img
                    src={studioImageSrc}
                    alt={altText}
                    decoding="async"
                    referrerPolicy="no-referrer"
                    style={nativeStudioImgStyle}
                    className="w-full h-full object-cover object-center block select-none"
                  />
                  {!isTintedReady && !studioVisual.palette.isWhite && (
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background: `radial-gradient(circle at 50% 50%, ${studioVisual.palette.primaryHex} 0%, ${studioVisual.palette.deepHex} 46%, transparent 66%)`,
                        mixBlendMode: 'multiply',
                        opacity: Math.min(
                          0.75,
                          Math.max(0.28, studioVisual.palette.multiplyOpacity * 0.78)
                        ),
                      }}
                    />
                  )}
                </>
              )}

              {/* Priority 1: Real supplier photograph inside the 360° stage when available */}
              {supplierPhotoUrl && supplierPhotoState !== 'failed' && (
                <img
                  key={supplierPhotoUrl}
                  src={supplierPhotoUrl}
                  alt={altText}
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    if (img.naturalWidth >= 48 && img.naturalHeight >= 48) {
                      setSupplierPhotoState('loaded');
                    } else {
                      setSupplierPhotoState('failed');
                    }
                  }}
                  onError={() => setSupplierPhotoState('failed')}
                  className={
                    showSupplierInTurntable
                      ? 'w-[86%] h-[86%] object-contain object-center block select-none rounded-lg'
                      : 'absolute inset-0 w-full h-full opacity-0 pointer-events-none'
                  }
                />
              )}

              {/* Real-time 60fps optical scintillation, light-sweep & fire overlay */}
              <canvas
                ref={overlayCanvasRef}
                aria-hidden="true"
                className="absolute inset-0 w-full h-full pointer-events-none block"
              />
            </div>
          </div>

          <div className="absolute top-3 left-3 flex items-center gap-2 text-xs text-[#5A606D] bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded border border-[#E4E6EB] pointer-events-none">
            <RotateCw className="w-3.5 h-3.5 text-[#1B365D]" />
            <span className="font-mono tabular-nums">{Math.round(angle)}°</span>
            {!compact && (
              <>
                <span aria-hidden="true">·</span>
                <span>Потяните для вращения</span>
              </>
            )}
          </div>

          {externalError && sanitizedVideoUrl && !compact && (
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 text-xs bg-white/95 backdrop-blur-sm border border-[#E4E6EB] rounded px-3 py-1.5 text-[#5A606D]">
              <span>Внешнее видео недоступно для встраивания — активен студийный 360° режим</span>
              <a
                href={sanitizedVideoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[#1B365D] font-medium hover:underline whitespace-nowrap"
              >
                Открыть ↗
              </a>
            </div>
          )}

          {!compact && (
            <div className="absolute top-3 right-3 text-xs text-[#5A606D] bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded border border-[#E4E6EB] font-mono tabular-nums pointer-events-none">
              {diamond.lengthMm.toFixed(2)} × {diamond.widthMm.toFixed(2)} мм
            </div>
          )}
        </div>
      )}

      {mode === 'turntable' && !compact && (
        <div className="flex items-center gap-4 px-4 py-3 bg-white border-t border-[#E4E6EB]">
          <button
            type="button"
            onClick={() => setIsPlaying((p) => !p)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[#1B365D] text-white hover:bg-[#142947] transition-colors whitespace-nowrap shrink-0"
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                Пауза
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                Вращать 360°
              </>
            )}
          </button>

          <div className="flex-1 flex items-center gap-2.5">
            <Film className="w-3.5 h-3.5 text-[#6B7280] shrink-0" />
            <input
              type="range"
              min={0}
              max={359}
              value={Math.round(angle)}
              onChange={(e) => {
                setIsPlaying(false);
                setAngle(Number(e.target.value));
              }}
              aria-label="Угол поворота 360 градусов"
              className="w-full accent-[#1B365D] cursor-pointer"
            />
          </div>

          <div className="flex items-center gap-1 bg-[#F1F3F5] p-0.5 rounded-md shrink-0">
            {([0.5, 1, 2] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                className={`px-2 py-1 text-xs font-mono tabular-nums rounded transition-colors ${
                  speed === s
                    ? 'bg-white text-[#111317] shadow-sm font-medium'
                    : 'text-[#5A606D] hover:text-[#111317]'
                }`}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
