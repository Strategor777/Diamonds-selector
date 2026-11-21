import React, { useEffect, useId, useMemo, useState } from 'react';
import { SHAPE_SHORT_RU } from '../data/diamonds';
import {
  CalibratedStudioVisual,
  DiamondOpticalPalette,
  StudioMacroMaskShape,
  getCalibratedStudioVisual,
  hasExternalSupplierPhoto,
} from '../lib/certVerification';
import { sanitizeMediaUrl } from '../lib/fancyColorParser';
import type { Diamond, DiamondShape } from '../types/diamond';

interface StudioDiamondImageProps {
  diamond: Diamond;
  preferStudio?: boolean;
  compact?: boolean;
  className?: string;
  zoomStyle?: React.CSSProperties;
  onClick?: () => void;
  onSourceModeChange?: (isStudio: boolean) => void;
}

function renderMacroSilhouette(maskShape: StudioMacroMaskShape) {
  switch (maskShape) {
    case 'round':
      return <circle cx="600" cy="448" r="182" />;
    case 'oval':
      return (
        <ellipse
          cx="601"
          cy="445"
          rx="208"
          ry="158"
          transform="rotate(-9 601 445)"
        />
      );
    case 'cushion':
      return (
        <path d="M 600 296 C 672 296, 720 307, 731 325 C 743 346, 746 392, 746 443 C 746 494, 743 540, 731 561 C 720 579, 672 590, 600 590 C 528 590, 480 579, 469 561 C 457 540, 454 494, 454 443 C 454 392, 457 346, 469 325 C 480 307, 528 296, 600 296 Z" />
      );
    case 'emerald':
      return (
        <polygon points="424,315 732,269 790,314 824,526 783,585 469,631 412,583 376,369" />
      );
    case 'pear':
      return (
        <path d="M 883 496 C 836 410, 680 274, 534 274 C 414 274, 359 354, 359 452 C 359 554, 434 627, 562 627 C 690 627, 818 564, 883 496 Z" />
      );
  }
}

function getMacroCenter(maskShape: StudioMacroMaskShape): { cx: number; cy: number; r: number } {
  switch (maskShape) {
    case 'round':
      return { cx: 600, cy: 448, r: 190 };
    case 'oval':
      return { cx: 601, cy: 445, r: 215 };
    case 'cushion':
      return { cx: 600, cy: 443, r: 185 };
    case 'emerald':
      return { cx: 600, cy: 450, r: 235 };
    case 'pear':
      return { cx: 585, cy: 452, r: 265 };
  }
}

interface FacetedShapeGeometry {
  outline: React.ReactNode;
  table: React.ReactNode;
  facets: React.ReactNode;
  shadowRx: number;
  shadowCy: number;
}

function getFacetedGeometry(shape: DiamondShape): FacetedShapeGeometry {
  switch (shape) {
    case 'Princess':
      return {
        outline: <rect x="48" y="48" width="144" height="144" rx="5" />,
        table: <rect x="78" y="78" width="84" height="84" rx="2" />,
        facets: (
          <>
            <path d="M48 48L192 192M192 48L48 192M120 48V78M120 162V192M48 120H78M162 120H192" />
            <polygon points="120,62 162,78 178,120 162,162 120,178 78,162 62,120 78,78" />
          </>
        ),
        shadowRx: 70,
        shadowCy: 204,
      };
    case 'Radiant':
      return {
        outline: <polygon points="74,34 166,34 190,58 190,182 166,206 74,206 50,182 50,58" />,
        table: <polygon points="88,62 152,62 164,74 164,166 152,178 88,178 76,166 76,74" />,
        facets: (
          <>
            <path d="M50 58L164 166M190 58L76 166M50 182L164 74M190 182L76 74M120 34V206M50 120H190" />
            <path d="M74 34L88 62M166 34L152 62M74 206L88 178M166 206L152 178" />
          </>
        ),
        shadowRx: 66,
        shadowCy: 214,
      };
    case 'Asscher':
      return {
        outline: <polygon points="76,44 164,44 196,76 196,164 164,196 76,196 44,164 44,76" />,
        table: <rect x="86" y="86" width="68" height="68" />,
        facets: (
          <>
            <polygon points="82,62 158,62 178,82 178,158 158,178 82,178 62,158 62,82" />
            <polygon points="84,74 156,74 166,84 166,156 156,166 84,166 74,156 74,84" />
            <path d="M44 76L86 86M196 76L154 86M44 164L86 154M196 164L154 154M76 44L86 86M164 44L154 86M76 196L86 154M164 196L154 154" />
          </>
        ),
        shadowRx: 70,
        shadowCy: 206,
      };
    case 'Marquise':
      return {
        outline: (
          <path d="M120 22C162 66 180 96 180 120C180 144 162 174 120 218C78 174 60 144 60 120C60 96 78 66 120 22Z" />
        ),
        table: (
          <path d="M120 56C146 84 155 102 155 120C155 138 146 156 120 184C94 156 85 138 85 120C85 102 94 84 120 56Z" />
        ),
        facets: (
          <>
            <path d="M120 22V218M60 120H180M78 74L155 120M162 74L85 120M78 166L155 120M162 166L85 120" />
            <path d="M120 56L162 74M120 56L78 74M120 184L162 166M120 184L78 166" />
          </>
        ),
        shadowRx: 54,
        shadowCy: 222,
      };
    case 'Heart':
      return {
        outline: (
          <path d="M120 206C120 206 38 148 38 94C38 64 60 44 86 44C103 44 114 54 120 66C126 54 137 44 154 44C180 44 202 64 202 94C202 148 120 206 120 206Z" />
        ),
        table: (
          <path d="M120 172C120 172 68 134 68 98C68 82 80 70 94 70C106 70 115 79 120 90C125 79 134 70 146 70C160 70 172 82 172 98C172 134 120 172 120 172Z" />
        ),
        facets: (
          <>
            <path d="M120 66V206M38 94L94 70M202 94L146 70M52 132L120 112L188 132M86 44L94 70M154 44L146 70M68 98L120 144L172 98" />
          </>
        ),
        shadowRx: 66,
        shadowCy: 214,
      };
    case 'Trilliant':
      return {
        outline: (
          <path d="M120 34C144 34 198 134 198 172C198 194 156 202 120 202C84 202 42 194 42 172C42 134 96 34 120 34Z" />
        ),
        table: <polygon points="120,76 168,166 72,166" />,
        facets: (
          <path d="M120 34V76M42 172L72 166M198 172L168 166M120 132L120 202M120 132L76 106M120 132L164 106M72 166L120 202L168 166" />
        ),
        shadowRx: 72,
        shadowCy: 212,
      };
    case 'Baguette':
      return {
        outline: <rect x="72" y="30" width="96" height="180" rx="4" />,
        table: <rect x="92" y="58" width="56" height="124" />,
        facets: (
          <>
            <rect x="82" y="44" width="76" height="152" />
            <path d="M72 30L92 58M168 30L148 58M72 210L92 182M168 210L148 182M72 120H92M148 120H168" />
          </>
        ),
        shadowRx: 52,
        shadowCy: 218,
      };
    case 'Rose Cut':
      return {
        outline: <circle cx="120" cy="120" r="82" />,
        table: <polygon points="120,68 165,94 165,146 120,172 75,146 75,94" />,
        facets: (
          <>
            <path d="M120 120L120 38M120 120L191 79M120 120L191 161M120 120L120 202M120 120L49 161M120 120L49 79" />
            <path d="M120 38L165 94L191 79M191 161L165 146L120 202M49 161L75 146L120 202M49 79L75 94L120 38" />
          </>
        ),
        shadowRx: 74,
        shadowCy: 210,
      };
    case 'Shield':
      return {
        outline: <polygon points="62,42 178,42 194,90 120,206 46,90" />,
        table: <polygon points="82,68 158,68 168,98 120,168 72,98" />,
        facets: (
          <path d="M62 42L82 68M178 42L158 68M194 90L168 98M46 90L72 98M120 168V206M120 42V168M72 98H168" />
        ),
        shadowRx: 66,
        shadowCy: 214,
      };
    case 'Kite':
      return {
        outline: <polygon points="120,28 190,94 120,212 50,94" />,
        table: <polygon points="120,62 162,100 120,174 78,100" />,
        facets: (
          <path d="M120 28V212M50 94H190M78 100L120 124L162 100M85 61L78 100M155 61L162 100" />
        ),
        shadowRx: 60,
        shadowCy: 218,
      };
    case 'Hexagon':
      return {
        outline: <polygon points="120,28 184,68 184,172 120,212 56,172 56,68" />,
        table: <polygon points="120,62 158,86 158,154 120,178 82,154 82,86" />,
        facets: (
          <>
            <polygon points="120,45 171,77 171,163 120,195 69,163 69,77" />
            <path d="M120 28V62M184 68L158 86M184 172L158 154M120 212V178M56 172L82 154M56 68L82 86" />
          </>
        ),
        shadowRx: 62,
        shadowCy: 218,
      };
    case 'Lozenge':
      return {
        outline: <polygon points="120,26 190,120 120,214 50,120" />,
        table: <polygon points="120,62 160,120 120,178 80,120" />,
        facets: (
          <>
            <polygon points="120,44 175,120 120,196 65,120" />
            <path d="M120 26V214M50 120H190" />
          </>
        ),
        shadowRx: 60,
        shadowCy: 220,
      };
    case 'Half Moon':
      return {
        outline: <path d="M72 38H92C146 38 184 74 184 120C184 166 146 202 92 202H72V38Z" />,
        table: <path d="M92 68H98C132 68 154 90 154 120C154 150 132 172 98 172H92V68Z" />,
        facets: (
          <path d="M72 120H184M72 38L92 68M72 202L92 172M140 52L130 82M140 188L130 158M174 84L148 100M174 156L148 140" />
        ),
        shadowRx: 58,
        shadowCy: 212,
      };
    case 'Trapezoid':
      return {
        outline: <polygon points="74,48 166,48 202,190 38,190" />,
        table: <polygon points="92,76 148,76 172,162 68,162" />,
        facets: (
          <>
            <polygon points="83,62 157,62 187,176 53,176" />
            <path d="M74 48L92 76M166 48L148 76M202 190L172 162M38 190L68 162M120 48V76M120 162V190" />
          </>
        ),
        shadowRx: 76,
        shadowCy: 202,
      };
    case 'Cadillac':
      return {
        outline: <polygon points="62,44 178,44 200,120 120,204 40,120" />,
        table: <polygon points="82,70 158,70 172,120 120,172 68,120" />,
        facets: (
          <path d="M62 44L82 70M178 44L158 70M200 120H172M40 120H68M120 172V204M120 44V172M68 120H172" />
        ),
        shadowRx: 70,
        shadowCy: 212,
      };
    case 'Briolette':
      return {
        outline: (
          <path d="M120 26C156 68 178 108 178 146C178 184 152 212 120 212C88 212 62 184 62 146C62 108 84 68 120 26Z" />
        ),
        table: <polygon points="120,66 154,116 146,166 120,192 94,166 86,116" />,
        facets: (
          <path d="M120 26V212M72 110H168M64 154H176M84 74L156 154M156 74L84 154M72 110L120 192L168 110" />
        ),
        shadowRx: 56,
        shadowCy: 218,
      };
    case 'Cabochon':
      return {
        outline: <ellipse cx="120" cy="120" rx="70" ry="92" />,
        table: <ellipse cx="102" cy="86" rx="22" ry="34" transform="rotate(-18 102 86)" />,
        facets: (
          <path d="M84 62C96 46 116 40 136 44" strokeLinecap="round" strokeWidth="3.5" />
        ),
        shadowRx: 64,
        shadowCy: 218,
      };
    default:
      return {
        outline: <circle cx="120" cy="120" r="82" />,
        table: <polygon points="120,68 158,86 172,120 158,154 120,172 82,154 68,120 82,86" />,
        facets: (
          <path d="M120 38V68M120 172V202M38 120H68M172 120H202M62 62L82 86M178 62L158 86M62 178L82 154M178 178L158 154" />
        ),
        shadowRx: 72,
        shadowCy: 210,
      };
  }
}

const FacetedStudioGemSvg: React.FC<{
  shape: DiamondShape;
  palette: DiamondOpticalPalette;
  compact?: boolean;
}> = ({ shape, palette, compact }) => {
  const uid = useId().replace(/:/g, '');
  const geom = useMemo(() => getFacetedGeometry(shape), [shape]);
  const strokeColor = palette.isBlack
    ? 'rgba(255,255,255,0.34)'
    : palette.isWhite
      ? 'rgba(71,85,105,0.34)'
      : 'rgba(17,19,23,0.22)';
  const sparkleOpacity = palette.isBlack ? 0.5 : 0.85;

  return (
    <svg
      viewBox="0 0 240 240"
      className="w-full h-full select-none"
      role="img"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`${uid}-bg`} cx="50%" cy="46%" r="60%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#EEF1F6" />
        </radialGradient>
        <radialGradient id={`${uid}-body`} cx="40%" cy="32%" r="72%">
          <stop offset="0%" stopColor={palette.isBlack ? '#6D7584' : '#FFFFFF'} />
          <stop offset="22%" stopColor={palette.lightHex} />
          <stop offset="68%" stopColor={palette.primaryHex} />
          <stop offset="100%" stopColor={palette.deepHex} />
        </radialGradient>
        <linearGradient id={`${uid}-table`} x1="15%" y1="10%" x2="85%" y2="90%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity={palette.isBlack ? 0.36 : 0.72} />
          <stop offset="50%" stopColor={palette.lightHex} stopOpacity={palette.isBlack ? 0.14 : 0.25} />
          <stop offset="100%" stopColor={palette.deepHex} stopOpacity="0.22" />
        </linearGradient>
        {palette.overtoneHex && (
          <radialGradient id={`${uid}-overtone`} cx="70%" cy="72%" r="62%">
            <stop offset="0%" stopColor={palette.overtoneHex} stopOpacity="0.42" />
            <stop offset="100%" stopColor={palette.overtoneHex} stopOpacity="0" />
          </radialGradient>
        )}
        <filter id={`${uid}-shadow`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      <rect x="0" y="0" width="240" height="240" fill={`url(#${uid}-bg)`} />

      {/* Ground contact shadow */}
      <ellipse
        cx="120"
        cy={geom.shadowCy}
        rx={geom.shadowRx}
        ry="11"
        fill="rgba(17, 24, 39, 0.14)"
        filter={`url(#${uid}-shadow)`}
      />

      {/* Gem main body */}
      <g fill={`url(#${uid}-body)`} stroke={strokeColor} strokeWidth={compact ? 2.4 : 1.5}>
        {geom.outline}
      </g>

      {/* Overtone glow inside gem */}
      {palette.overtoneHex && (
        <g fill={`url(#${uid}-overtone)`} stroke="none">
          {geom.outline}
        </g>
      )}

      {/* Facet geometry */}
      <g
        fill="none"
        stroke={palette.isBlack ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.68)'}
        strokeWidth={compact ? 1.8 : 1.2}
      >
        {geom.facets}
      </g>
      <g
        fill="none"
        stroke={strokeColor}
        strokeWidth={compact ? 1.1 : 0.75}
        opacity="0.7"
      >
        {geom.facets}
      </g>

      {/* Table specular reflection */}
      <g
        fill={`url(#${uid}-table)`}
        stroke={palette.isBlack ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.85)'}
        strokeWidth={compact ? 1.5 : 1.1}
      >
        {geom.table}
      </g>

      {/* Crisp optical sparkle highlights */}
      {!compact && (
        <g opacity={sparkleOpacity}>
          <circle cx="96" cy="88" r="3" fill="#FFFFFF" />
          <path
            d="M96 76V100M84 88H108"
            stroke="#FFFFFF"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <circle cx="144" cy="146" r="2" fill="#FFFFFF" opacity="0.7" />
        </g>
      )}
    </svg>
  );
};

const TintedMacroStudioView: React.FC<{
  visual: CalibratedStudioVisual;
  alt: string;
  compact?: boolean;
}> = ({ visual, alt, compact }) => {
  const uid = useId().replace(/:/g, '');
  const maskShape = visual.maskShape || 'round';
  const center = getMacroCenter(maskShape);
  const { palette } = visual;
  const needsTint =
    palette.multiplyOpacity > 0.01 ||
    palette.colorOpacity > 0.01 ||
    Boolean(palette.darknessOverlay);

  return (
    <div className="relative w-full aspect-[1200/896] max-h-full overflow-hidden">
      <img
        src={visual.src}
        alt={alt}
        loading={compact ? 'lazy' : undefined}
        decoding="async"
        className="block w-full h-full object-cover select-none"
      />
      {needsTint && (
        <svg
          viewBox="0 0 1200 896"
          className="absolute inset-0 w-full h-full pointer-events-none select-none"
          aria-hidden="true"
        >
          <defs>
            <radialGradient
              id={`${uid}-mul`}
              cx={center.cx}
              cy={center.cy}
              r={center.r}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor={palette.lightHex} />
              <stop offset="52%" stopColor={palette.primaryHex} />
              <stop offset="100%" stopColor={palette.deepHex} />
            </radialGradient>
            {palette.overtoneHex && (
              <radialGradient
                id={`${uid}-ovt`}
                cx={center.cx + center.r * 0.25}
                cy={center.cy + center.r * 0.2}
                r={center.r}
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor={palette.overtoneHex} stopOpacity="0.45" />
                <stop offset="100%" stopColor={palette.overtoneHex} stopOpacity="0" />
              </radialGradient>
            )}
            <filter id={`${uid}-soft`} x="-5%" y="-5%" width="110%" height="110%">
              <feGaussianBlur stdDeviation="2.5" />
            </filter>
          </defs>

          {/* Layer 1: Multiply body color inside the exact diamond silhouette */}
          {palette.multiplyOpacity > 0.01 && (
            <g
              fill={`url(#${uid}-mul)`}
              opacity={palette.multiplyOpacity}
              filter={`url(#${uid}-soft)`}
              style={{ mixBlendMode: 'multiply' }}
            >
              {renderMacroSilhouette(maskShape)}
            </g>
          )}

          {/* Layer 2: Chromatic hue pass for vividness without washing out facets */}
          {palette.colorOpacity > 0.01 && (
            <g
              fill={palette.primaryHex}
              opacity={palette.colorOpacity}
              filter={`url(#${uid}-soft)`}
              style={{ mixBlendMode: 'color' }}
            >
              {renderMacroSilhouette(maskShape)}
            </g>
          )}

          {/* Layer 3: Secondary overtone shimmer if present */}
          {palette.overtoneHex && (
            <g
              fill={`url(#${uid}-ovt)`}
              filter={`url(#${uid}-soft)`}
              style={{ mixBlendMode: 'multiply' }}
            >
              {renderMacroSilhouette(maskShape)}
            </g>
          )}

          {/* Layer 4: Controlled depth darkening for Black / Fancy Deep / Fancy Dark */}
          {palette.darknessOverlay && palette.darknessOverlay > 0 && (
            <g
              fill={palette.deepHex}
              opacity={palette.darknessOverlay}
              filter={`url(#${uid}-soft)`}
              style={{ mixBlendMode: 'multiply' }}
            >
              {renderMacroSilhouette(maskShape)}
            </g>
          )}
        </svg>
      )}
    </div>
  );
};

export const StudioDiamondImage: React.FC<StudioDiamondImageProps> = React.memo(
  ({
    diamond,
    preferStudio = false,
    compact = false,
    className = '',
    zoomStyle,
    onClick,
    onSourceModeChange,
  }) => {
    const studioVisual = useMemo(
      () => getCalibratedStudioVisual(diamond),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [
        diamond.shape,
        diamond.color,
        diamond.colorFamily,
        diamond.fancyIntensity,
        diamond.fancyOvertone,
        diamond.directory,
        diamond.isFancyColor,
      ]
    );

    const externalUrl = useMemo(() => {
      if (preferStudio || diamond.useStudioPhoto) return undefined;
      if (!hasExternalSupplierPhoto(diamond)) return undefined;
      return sanitizeMediaUrl(diamond.imageUrl);
    }, [diamond, preferStudio]);

    const [externalFailed, setExternalFailed] = useState(false);

    useEffect(() => {
      setExternalFailed(false);
    }, [diamond.id, externalUrl, preferStudio, diamond.useStudioPhoto]);

    const showExternal = Boolean(externalUrl && !externalFailed);

    useEffect(() => {
      onSourceModeChange?.(!showExternal);
    }, [showExternal, onSourceModeChange]);

    const altText = `${SHAPE_SHORT_RU[diamond.shape] || diamond.shape} ${diamond.carat.toFixed(2)} ct ${diamond.color} ${diamond.clarity}`;

    return (
      <div
        onClick={onClick}
        style={zoomStyle}
        className={`w-full h-full flex items-center justify-center overflow-hidden ${className}`}
      >
        {showExternal && externalUrl ? (
          <img
            src={externalUrl}
            alt={altText}
            loading={compact ? 'lazy' : undefined}
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setExternalFailed(true)}
            className={`w-full h-full object-contain ${compact ? 'p-0.5' : 'p-2'}`}
          />
        ) : studioVisual.mode === 'native-photo' ? (
          <img
            src={studioVisual.src}
            alt={altText}
            loading={compact ? 'lazy' : undefined}
            decoding="async"
            style={studioVisual.filter ? { filter: studioVisual.filter } : undefined}
            className={`w-full h-full object-contain ${compact ? 'p-0.5' : 'p-2'}`}
          />
        ) : studioVisual.mode === 'tinted-macro' ? (
          <div className={`w-full h-full flex items-center justify-center ${compact ? 'p-0.5' : 'p-2'}`}>
            <TintedMacroStudioView visual={studioVisual} alt={altText} compact={compact} />
          </div>
        ) : (
          <FacetedStudioGemSvg
            shape={diamond.shape}
            palette={studioVisual.palette}
            compact={compact}
          />
        )}
      </div>
    );
  }
);

StudioDiamondImage.displayName = 'StudioDiamondImage';
