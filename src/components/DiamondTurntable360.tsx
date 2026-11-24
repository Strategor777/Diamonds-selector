import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Film, Pause, Play, RotateCw } from 'lucide-react';
import { getColorHexTint } from '../data/diamonds';
import { sanitizeMediaUrl } from '../lib/fancyColorParser';
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

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const num = parseInt(
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean,
    16
  );
  if (Number.isNaN(num)) return { r: 245, g: 247, b: 250 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function mixRgb(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number
): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `rgb(${clamp(a.r + (b.r - a.r) * t)}, ${clamp(
    a.g + (b.g - a.g) * t
  )}, ${clamp(a.b + (b.b - a.b) * t)})`;
}

export const DiamondTurntable360: React.FC<DiamondTurntable360Props> = ({
  diamond,
  compact = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [angle, setAngle] = useState(24);
  const [speed, setSpeed] = useState<0.5 | 1 | 2>(1);
  const [externalError, setExternalError] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const sanitizedVideoUrl = useMemo(
    () => sanitizeMediaUrl(diamond.videoUrl),
    [diamond.videoUrl]
  );

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

  useEffect(() => {
    if (!isPlaying || mode !== 'turntable') return;
    let rafId = 0;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      setAngle((prev) => (prev + dt * 42 * speed) % 360);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, speed, mode]);

  useEffect(() => {
    if (mode !== 'turntable') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const logicalW = 500;
    const logicalH = 500;
    if (canvas.width !== logicalW * dpr || canvas.height !== logicalH * dpr) {
      canvas.width = logicalW * dpr;
      canvas.height = logicalH * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    const w = logicalW;
    const h = logicalH;
    const cx = w / 2;
    const cy = h / 2;

    ctx.clearRect(0, 0, w, h);

    // Studio backdrop
    const bgGrad = ctx.createRadialGradient(cx, cy - 30, 30, cx, cy, 280);
    bgGrad.addColorStop(0, '#FFFFFF');
    bgGrad.addColorStop(0.6, '#F2F4F7');
    bgGrad.addColorStop(1, '#E2E6EC');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Turntable pedestal shadow
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy + 104, 102, 18, 0, 0, Math.PI * 2);
    const shadowGrad = ctx.createRadialGradient(cx, cy + 104, 10, cx, cy + 104, 102);
    shadowGrad.addColorStop(0, 'rgba(17, 19, 23, 0.22)');
    shadowGrad.addColorStop(1, 'rgba(17, 19, 23, 0)');
    ctx.fillStyle = shadowGrad;
    ctx.fill();
    ctx.restore();

    const rad = (angle * Math.PI) / 180;
    const rxScale = 0.85 + 0.15 * Math.cos(rad * 2);
    const tiltY = Math.sin(rad) * 0.18;

    const aspectRatio =
      diamond.shape === 'Round' ||
      diamond.shape === 'Princess' ||
      diamond.shape === 'Cushion' ||
      diamond.shape === 'Asscher' ||
      diamond.shape === 'Heart' ||
      diamond.shape === 'Trilliant'
        ? 1
        : diamond.shape === 'Baguette'
          ? Math.min(2.1, Math.max(1.5, diamond.lwRatio || 1.8))
          : Math.min(1.55, Math.max(1.12, diamond.lwRatio || 1.25));

    const radiusX = (96 / Math.sqrt(aspectRatio)) * rxScale;
    const radiusY = 96 * Math.sqrt(aspectRatio) * (0.86 + Math.abs(tiltY) * 0.14);

    // Build outline points depending on shape
    const points: { x: number; y: number }[] = [];
    const facetCount =
      diamond.shape === 'Emerald' ||
      diamond.shape === 'Radiant' ||
      diamond.shape === 'Asscher' ||
      diamond.shape === 'Octagon'
        ? 8
        : diamond.shape === 'Princess' || diamond.shape === 'Baguette'
          ? 4
          : 16;

    if (diamond.shape === 'Princess') {
      const s = 86 * rxScale;
      points.push(
        { x: cx - s, y: cy - s },
        { x: cx + s, y: cy - s },
        { x: cx + s, y: cy + s },
        { x: cx - s, y: cy + s }
      );
    } else if (diamond.shape === 'Baguette') {
      const hw = radiusX * 0.8;
      const hh = radiusY * 1.06;
      points.push(
        { x: cx - hw, y: cy - hh },
        { x: cx + hw, y: cy - hh },
        { x: cx + hw, y: cy + hh },
        { x: cx - hw, y: cy + hh }
      );
    } else if (
      diamond.shape === 'Emerald' ||
      diamond.shape === 'Radiant' ||
      diamond.shape === 'Asscher' ||
      diamond.shape === 'Octagon'
    ) {
      const isSquareOct = diamond.shape === 'Asscher' || diamond.shape === 'Octagon';
      const hw = isSquareOct ? 88 * rxScale : radiusX * 0.85;
      const hh = isSquareOct ? 88 * (0.88 + Math.abs(tiltY) * 0.12) : radiusY * 0.98;
      const ch = diamond.shape === 'Asscher' || diamond.shape === 'Octagon' ? hw * 0.28 : 22;
      points.push(
        { x: cx - hw + ch, y: cy - hh },
        { x: cx + hw - ch, y: cy - hh },
        { x: cx + hw, y: cy - hh + ch },
        { x: cx + hw, y: cy + hh - ch },
        { x: cx + hw - ch, y: cy + hh },
        { x: cx - hw + ch, y: cy + hh },
        { x: cx - hw, y: cy + hh - ch },
        { x: cx - hw, y: cy - hh + ch }
      );
    } else if (diamond.shape === 'Pear') {
      for (let i = 0; i < 24; i++) {
        const t = (i / 24) * Math.PI * 2;
        const px = Math.sin(t) * radiusX * (1 - 0.35 * Math.cos(t));
        const py = -Math.cos(t) * radiusY;
        points.push({ x: cx + px, y: cy + py });
      }
    } else if (diamond.shape === 'Marquise') {
      for (let i = 0; i < 24; i++) {
        const t = (i / 24) * Math.PI * 2;
        const px = Math.sin(t) * radiusX * 0.82 * Math.pow(Math.abs(Math.sin(t)), 0.25);
        const py = -Math.cos(t) * radiusY * 1.08;
        points.push({ x: cx + px, y: cy + py });
      }
    } else if (diamond.shape === 'Heart') {
      const scale = 5.4 * rxScale;
      for (let i = 0; i < 28; i++) {
        const t = (i / 28) * Math.PI * 2;
        const hx = 16 * Math.pow(Math.sin(t), 3);
        const hy = -(
          13 * Math.cos(t) -
          5 * Math.cos(2 * t) -
          2 * Math.cos(3 * t) -
          Math.cos(4 * t)
        );
        points.push({ x: cx + hx * scale, y: cy + hy * scale * 0.96 - 6 });
      }
    } else if (diamond.shape === 'Trilliant') {
      const rTri = 102 * rxScale;
      const verts = [0, 1, 2].map((k) => {
        const a = -Math.PI / 2 + (k * Math.PI * 2) / 3 + rad * 0.12;
        return { x: cx + Math.cos(a) * rTri, y: cy + Math.sin(a) * rTri + 12 };
      });
      for (let edge = 0; edge < 3; edge++) {
        const v1 = verts[edge];
        const v2 = verts[(edge + 1) % 3];
        const steps = 6;
        for (let s = 0; s < steps; s++) {
          const u = s / steps;
          const midBow = Math.sin(u * Math.PI) * 10;
          const mx = v1.x + (v2.x - v1.x) * u;
          const my = v1.y + (v2.y - v1.y) * u;
          const dx = mx - cx;
          const dy = my - (cy + 12);
          const dist = Math.hypot(dx, dy) || 1;
          points.push({
            x: mx + (dx / dist) * midBow,
            y: my + (dy / dist) * midBow,
          });
        }
      }
    } else {
      const cushionFactor = diamond.shape === 'Cushion' ? 0.14 : 0;
      const ptsCount = diamond.shape === 'Cabochon' ? 28 : facetCount;
      for (let i = 0; i < ptsCount; i++) {
        const t = (i / ptsCount) * Math.PI * 2 + rad * 0.25;
        const rMod = 1 + cushionFactor * Math.cos(4 * t);
        points.push({
          x: cx + Math.cos(t) * radiusX * rMod,
          y: cy + Math.sin(t) * radiusY * rMod,
        });
      }
    }

    const tint = getColorHexTint(diamond.color, diamond.colorFamily);
    const baseRgb = hexToRgb(tint.base);
    const deepRgb = hexToRgb(tint.deep);
    const isColored = (diamond.colorFamily || 'Бесцветный (D–J)') !== 'Бесцветный (D–J)';

    // Clip stone body
    ctx.save();
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();

    const stoneGrad = ctx.createLinearGradient(cx - 110, cy - 110, cx + 110, cy + 110);
    stoneGrad.addColorStop(0, isColored ? tint.base : '#FFFFFF');
    stoneGrad.addColorStop(0.55, tint.base);
    stoneGrad.addColorStop(1, tint.deep);
    ctx.fillStyle = stoneGrad;
    ctx.fill();
    ctx.clip();

    if (diamond.shape === 'Cabochon') {
      // Smooth dome cabochon lighting without sharp facet grid
      const domeGrad = ctx.createRadialGradient(
        cx - 28 + Math.cos(rad) * 18,
        cy - 34 + Math.sin(rad) * 10,
        10,
        cx,
        cy,
        Math.max(radiusX, radiusY) * 1.15
      );
      domeGrad.addColorStop(0, 'rgba(255, 255, 255, 0.88)');
      domeGrad.addColorStop(0.28, tint.base);
      domeGrad.addColorStop(0.75, tint.deep);
      domeGrad.addColorStop(1, 'rgba(17, 19, 23, 0.28)');
      ctx.fillStyle = domeGrad;
      ctx.fillRect(cx - 160, cy - 160, 320, 320);

      // Cat's eye / silky sheen arc
      ctx.beginPath();
      ctx.ellipse(
        cx - 18 + Math.sin(rad) * 16,
        cy - 26 + Math.cos(rad) * 8,
        radiusX * 0.42,
        radiusY * 0.18,
        -0.4,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
      ctx.fill();
    } else {
      // Dynamic rotating crown & pavilion facets
      const innerScale = 0.56;
      const innerPoints = points.map((p) => ({
        x: cx + (p.x - cx) * innerScale + Math.sin(rad) * 8,
        y: cy + (p.y - cy) * innerScale + Math.cos(rad) * 4,
      }));

      for (let i = 0; i < points.length; i++) {
        const next = (i + 1) % points.length;
        const p1 = points[i];
        const p2 = points[next];
        const ip1 = innerPoints[i];
        const ip2 = innerPoints[next];

        const lightDot = Math.cos(rad + (i / points.length) * Math.PI * 2);
        const isDarkHeart =
          diamond.cut === 'Ideal' && Math.abs(lightDot) < 0.25 && i % 2 === 0;

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(ip2.x, ip2.y);
        ctx.lineTo(ip1.x, ip1.y);
        ctx.closePath();

        if (isDarkHeart) {
          ctx.fillStyle = tint.facet;
        } else if (isColored) {
          const factor = 0.15 + ((1 - lightDot) / 2) * 0.72;
          ctx.fillStyle = mixRgb(baseRgb, deepRgb, factor);
        } else {
          const lum = Math.round(212 + lightDot * 40);
          ctx.fillStyle = `rgb(${lum}, ${Math.min(255, lum + 3)}, ${Math.min(255, lum + 7)})`;
        }
        ctx.fill();
        ctx.strokeStyle = 'rgba(17, 19, 23, 0.14)';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // Star / inner pavilion facets
        ctx.beginPath();
        ctx.moveTo(ip1.x, ip1.y);
        ctx.lineTo(ip2.x, ip2.y);
        ctx.lineTo(cx + Math.sin(rad) * 4, cy + Math.cos(rad) * 3);
        ctx.closePath();

        if (isColored) {
          const innerFactor = 0.25 + ((1 + lightDot) / 2) * 0.55;
          ctx.fillStyle = mixRgb(baseRgb, deepRgb, innerFactor);
        } else {
          const innerLum = Math.round(224 - lightDot * 32);
          ctx.fillStyle = `rgb(${innerLum}, ${innerLum + 2}, ${Math.min(255, innerLum + 6)})`;
        }
        ctx.fill();
        ctx.strokeStyle = 'rgba(17, 19, 23, 0.12)';
        ctx.stroke();

        // Subtle prismatic dispersion flash at high light incidence
        if (lightDot > 0.86) {
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(ip1.x, ip1.y);
          ctx.lineTo(ip2.x, ip2.y);
          ctx.closePath();
          ctx.fillStyle = isColored
            ? 'rgba(255, 255, 255, 0.52)'
            : i % 2 === 0
              ? 'rgba(186, 220, 255, 0.55)'
              : 'rgba(255, 240, 210, 0.45)';
          ctx.fill();
        }
      }

      // Table facet sheen
      ctx.beginPath();
      innerPoints.forEach((p, i) =>
        i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)
      );
      ctx.closePath();
      const sheenX = cx + Math.cos(rad) * 45;
      const sheenY = cy + Math.sin(rad) * 35;
      const tableGrad = ctx.createLinearGradient(
        sheenX - 60,
        sheenY - 60,
        sheenX + 60,
        sheenY + 60
      );
      tableGrad.addColorStop(0, 'rgba(255,255,255,0.72)');
      tableGrad.addColorStop(0.5, 'rgba(255,255,255,0.08)');
      tableGrad.addColorStop(1, tint.facet);
      ctx.fillStyle = tableGrad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(17, 19, 23, 0.22)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.restore();

    // Outer girdle crisp stroke
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.strokeStyle = 'rgba(17, 19, 23, 0.34)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.restore();
  }, [angle, diamond, mode]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    draggingRef.current = true;
    lastXRef.current = e.clientX;
    setIsPlaying(false);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - lastXRef.current;
    lastXRef.current = e.clientX;
    setAngle((prev) => (prev + dx * 0.9 + 360) % 360);
  };

  const handlePointerUp = () => {
    draggingRef.current = false;
  };

  return (
    <div
      className={
        compact
          ? 'relative w-full h-full bg-[#F1F3F5] overflow-hidden'
          : 'bg-[#F1F3F5] border border-[#E4E6EB] rounded-lg overflow-hidden'
      }
    >
      {/* Top source switcher when diamond has an external videoUrl */}
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
              Интерактив 360°
            </button>
          </div>
        </div>
      )}

      {!sanitizedVideoUrl && !compact && (
        <div className="flex items-center justify-between gap-2 px-4 py-2 bg-white border-b border-[#E4E6EB] text-xs text-[#5A606D]">
          <span>
            Видео поставщика отсутствует в прайсе — отображается интерактивный 360° макет по пропорциям камня
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
                      360° макет
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
                360° макет
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
                Если плеер поставщика блокирует встраивание, откройте ссылку или переключитесь на 360° макет
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
        <div className={compact ? 'relative w-full h-full' : 'relative w-full max-w-[480px] aspect-square mx-auto'}>
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing block touch-none"
          />
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
              <span>Внешнее видео недоступно для встраивания — активен 360° режим</span>
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
