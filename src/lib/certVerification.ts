import {
  SHAPE_IMAGE_MAP,
  SHAPE_SHORT_RU,
  STUDIO_GEM_PHOTOS,
  getCertVerifyUrl,
} from '../data/diamonds';
import { getStudioFallbackImage } from './catalogEngine';
import {
  composeParsedFancyColor,
  isNonImageMediaUrl,
  isStrictWhiteLetterGrade,
  parseFancyColor,
  sanitizeMediaUrl,
} from './fancyColorParser';
import type { CertVerifyResponse } from './certVerifyTypes';
import { buildIgiPdfUrl } from './igiReportParser';
import type { Diamond } from '../types/diamond';

const CERT_NUMBER_REGEX = /^[A-Za-z0-9-]{4,32}$/;
const SYNTHETIC_CERT_PREFIX = /^(XL|GS|MGR|DEMO|TEST|TMP)-/i;

export function isVerifiableCertNumber(certNumber: string | undefined): boolean {
  const clean = (certNumber || '').trim();
  if (!clean) return false;
  if (SYNTHETIC_CERT_PREFIX.test(clean)) return false;
  return CERT_NUMBER_REGEX.test(clean);
}

export function hasExternalSupplierPhoto(diamond: Diamond): boolean {
  const sanitized = sanitizeMediaUrl(diamond.imageUrl);
  if (!sanitized || isNonImageMediaUrl(sanitized)) return false;
  return sanitized.startsWith('http://') || sanitized.startsWith('https://');
}

/**
 * Builds a structured verified response from a color string confirmed directly
 * by the user/manager from the official certificate PDF / website (e.g. "FIP",
 * "Fancy Intense Orangy Pink", "E", "FVOP").
 */
export function buildManualColorVerification(
  lab: string,
  certNumber: string,
  rawColorInput: string
): CertVerifyResponse | null {
  const cleaned = rawColorInput.trim();
  if (!cleaned) return null;
  const cleanLab = (lab || 'GIA').trim().toUpperCase();
  const cleanCert = (certNumber || '').trim();
  const verifyUrl = getCertVerifyUrl(cleanLab, cleanCert);
  const pdfUrl = cleanLab === 'IGI' ? buildIgiPdfUrl(cleanCert) : undefined;
  const checkedAt = new Date().toISOString();

  if (isStrictWhiteLetterGrade(cleaned)) {
    const grade = cleaned.toUpperCase();
    return {
      status: 'verified',
      lab: cleanLab,
      certNumber: cleanCert,
      verifyUrl,
      pdfUrl,
      rawColor: cleaned,
      normalizedColor: grade,
      colorFamily: 'Бесцветный (D–J)',
      isWhite: true,
      isSpecificShade: false,
      params: {
        rawColor: cleaned,
        normalizedColor: grade,
        colorFamily: 'Бесцветный (D–J)',
        isWhite: true,
        isSpecificShade: false,
      },
      sourceMode: 'manual',
      message: `Цвет «${grade}» подтверждён по бланку ${cleanLab} #${cleanCert}.`,
      checkedAt,
    };
  }

  const parsed = parseFancyColor(cleaned);
  return {
    status: 'verified',
    lab: cleanLab,
    certNumber: cleanCert,
    verifyUrl,
    pdfUrl,
    rawColor: cleaned,
    normalizedColor: parsed.canonicalColor,
    colorFamily: parsed.colorFamily,
    fancyIntensity: parsed.fancyIntensity,
    fancyOvertone: parsed.fancyOvertone,
    shortCode: parsed.shortCode,
    isWhite: false,
    isSpecificShade: parsed.isSpecificShade,
    params: {
      rawColor: cleaned,
      normalizedColor: parsed.canonicalColor,
      colorFamily: parsed.colorFamily,
      fancyIntensity: parsed.fancyIntensity,
      fancyOvertone: parsed.fancyOvertone,
      shortCode: parsed.shortCode,
      isWhite: false,
      isSpecificShade: parsed.isSpecificShade,
    },
    sourceMode: 'manual',
    message: `Цвет «${parsed.canonicalColor}»${
      parsed.shortCode ? ` (${parsed.shortCode})` : ''
    } подтверждён по бланку ${cleanLab} #${cleanCert}.`,
    checkedAt,
  };
}

/**
 * Applies ALL verified parameters from a certificate (shape, carat, color, clarity,
 * cut, polish, symmetry, fluorescence, measurements, table/depth %, growthType, reportDate)
 * to a Diamond object, keeping existing fields untouched when not present in the report.
 */
export function applyVerifiedParamsToDiamond(
  diamond: Diamond,
  verification: CertVerifyResponse,
  options?: {
    useStudioPhoto?: boolean;
    source?: 'auto' | 'manual' | 'pdf' | 'text';
  }
): Diamond {
  if (verification.status !== 'verified') {
    return diamond;
  }

  const p = verification.params || {};
  const verifiedColor = p.normalizedColor || verification.normalizedColor;
  const verifiedFields: string[] = [];

  const nextBase: Diamond = {
    ...diamond,
    certVerifiedAt: verification.checkedAt,
    certVerifySource:
      options?.source ||
      (verification.sourceMode === 'pdf-parse'
        ? 'pdf'
        : verification.sourceMode === 'text-paste'
          ? 'text'
          : verification.sourceMode === 'manual'
            ? 'manual'
            : 'auto'),
  };

  if (p.shape) {
    nextBase.shape = p.shape;
    verifiedFields.push('shape');
  }
  if (p.carat !== undefined) {
    nextBase.carat = p.carat;
    verifiedFields.push('carat');
  }
  if (p.clarity) {
    nextBase.clarity = p.clarity;
    verifiedFields.push('clarity');
  }
  if (p.cut) {
    nextBase.cut = p.cut;
    verifiedFields.push('cut');
  }
  if (p.polish) {
    nextBase.polish = p.polish;
    verifiedFields.push('polish');
  }
  if (p.symmetry) {
    nextBase.symmetry = p.symmetry;
    verifiedFields.push('symmetry');
  }
  if (p.fluorescence) {
    nextBase.fluorescence = p.fluorescence;
    verifiedFields.push('fluorescence');
  }
  if (
    p.lengthMm !== undefined &&
    p.widthMm !== undefined &&
    p.depthMm !== undefined
  ) {
    nextBase.lengthMm = p.lengthMm;
    nextBase.widthMm = p.widthMm;
    nextBase.depthMm = p.depthMm;
    nextBase.lwRatio =
      p.lwRatio ?? Number((p.lengthMm / Math.max(0.01, p.widthMm)).toFixed(2));
    verifiedFields.push('measurements');
  }
  if (p.depthPercent !== undefined) {
    nextBase.depthPercent = p.depthPercent;
    verifiedFields.push('depthPercent');
  }
  if (p.tablePercent !== undefined) {
    nextBase.tablePercent = p.tablePercent;
    verifiedFields.push('tablePercent');
  }
  if (p.girdle) {
    nextBase.girdle = p.girdle;
    verifiedFields.push('girdle');
  }
  if (p.culet) {
    nextBase.culet = p.culet;
    verifiedFields.push('culet');
  }
  if (p.growthType) {
    nextBase.growthType = p.growthType;
    verifiedFields.push('growthType');
  }
  if (p.reportDate) {
    nextBase.certDate = p.reportDate;
    verifiedFields.push('certDate');
  }

  if (verifiedColor) {
    const isWhite = Boolean(p.isWhite ?? verification.isWhite);
    const family = p.colorFamily || verification.colorFamily;
    const intensity = p.fancyIntensity || verification.fancyIntensity;
    const overtone = p.fancyOvertone || verification.fancyOvertone;

    nextBase.color = verifiedColor;
    nextBase.colorFamily = isWhite
      ? 'Бесцветный (D–J)'
      : family || diamond.colorFamily || 'Фантазийный';
    nextBase.directory = isWhite ? 'white' : 'fancy';
    nextBase.isFancyColor = !isWhite;
    nextBase.stoneType = isWhite ? 'Бриллиант' : 'Цветной бриллиант';
    nextBase.fancyIntensity = isWhite ? undefined : intensity;
    nextBase.fancyOvertone = isWhite ? undefined : overtone;
    nextBase.overtone = isWhite ? undefined : overtone;
    nextBase.primaryHue = isWhite
      ? undefined
      : family || diamond.colorFamily || 'Фантазийный';
    nextBase.certColorVerified = true;
    nextBase.certVerifiedColor = verifiedColor;
    verifiedFields.push('color');
  }

  if (verifiedFields.length > 0) {
    nextBase.certParamsVerified = true;
    nextBase.certVerifiedFields = Array.from(
      new Set([...(diamond.certVerifiedFields || []), ...verifiedFields])
    );
  }

  const shouldUseStudio =
    options?.useStudioPhoto === true ||
    (options?.useStudioPhoto !== false && !hasExternalSupplierPhoto(diamond));

  if (shouldUseStudio) {
    nextBase.useStudioPhoto = true;
    const studioSrc = getStudioFallbackImage(nextBase);
    if (!hasExternalSupplierPhoto(diamond)) {
      nextBase.imageUrl = studioSrc;
    }
  } else if (options?.useStudioPhoto === false) {
    nextBase.useStudioPhoto = false;
  }

  return nextBase;
}

/**
 * Backward-compatible alias applying verified certificate color (and any extra extracted params).
 */
export function applyVerifiedColorToDiamond(
  diamond: Diamond,
  verification: CertVerifyResponse,
  options?: {
    useStudioPhoto?: boolean;
    source?: 'auto' | 'manual' | 'pdf' | 'text';
  }
): Diamond {
  return applyVerifiedParamsToDiamond(diamond, verification, options);
}

export type StudioMacroMaskShape =
  | 'round'
  | 'oval'
  | 'emerald'
  | 'princess'
  | 'cushion'
  | 'pear'
  | 'radiant'
  | 'marquise'
  | 'heart'
  | 'asscher'
  | 'baguette'
  | 'trilliant'
  | 'shield'
  | 'kite'
  | 'hexagon'
  | 'lozenge'
  | 'half_moon'
  | 'trapezoid'
  | 'cadillac'
  | 'briolette'
  | 'cabochon'
  | 'rose_cut';

export interface DiamondOpticalLut {
  r: string;
  g: string;
  b: string;
}

export interface DiamondOpticalPalette {
  lightHex: string;
  primaryHex: string;
  deepHex: string;
  overtoneHex?: string;
  multiplyOpacity: number;
  colorOpacity: number;
  darknessOverlay?: number;
  lut?: DiamondOpticalLut;
  isWhite: boolean;
  isBlack: boolean;
}

export interface CalibratedStudioVisual {
  mode: 'native-photo' | 'tinted-macro' | 'faceted-svg';
  src: string;
  maskShape?: StudioMacroMaskShape;
  filter?: string;
  seamless?: boolean;
  palette: DiamondOpticalPalette;
  label: string;
}

type FancyColorKey =
  | 'yellow'
  | 'pink'
  | 'blue'
  | 'green'
  | 'brown'
  | 'cognac'
  | 'champagne'
  | 'orange'
  | 'purple'
  | 'red'
  | 'gray'
  | 'black'
  | 'chameleon';

function resolveCanonicalColorKey(
  diamond: Diamond,
  parsed: ReturnType<typeof parseFancyColor>
): FancyColorKey {
  const family = (diamond.colorFamily || parsed.colorFamily || '').toLowerCase();
  const hay = `${diamond.color || ''} ${diamond.colorFamily || ''}`.toLowerCase();

  // Pass 1: Always trust the primary canonical colorFamily first so overtones
  // like "Pink Brown" (family = Коричневый) or "Greenish Blue" (family = Синий)
  // never hijack the primary hue.
  if (family.includes('чёрн') || family.includes('черн')) return 'black';
  if (family.includes('сер')) return 'gray';
  if (family.includes('хамелеон')) return 'chameleon';
  if (family.includes('красн')) return 'red';
  if (family.includes('фиолет') || family.includes('пурпур')) return 'purple';
  if (family.includes('оранж')) return 'orange';
  if (family.includes('розов')) return 'pink';
  if (family.includes('син') || family.includes('голуб')) return 'blue';
  if (family.includes('зел')) return 'green';
  if (family.includes('коньяч') || family.includes('шампан')) {
    if (hay.includes('champagne') || hay.includes('шампан')) return 'champagne';
    return 'cognac';
  }
  if (family.includes('корич')) {
    if (hay.includes('champagne') || hay.includes('шампан')) return 'champagne';
    return 'brown';
  }
  if (family.includes('жёлт') || family.includes('желт')) return 'yellow';

  // Pass 2: Fallback to raw text when colorFamily is generic or missing
  if (hay.includes('black')) return 'black';
  if (hay.includes('gray') || hay.includes('grey')) return 'gray';
  if (hay.includes('chameleon')) return 'chameleon';
  if (/\bred\b/.test(hay)) return 'red';
  if (hay.includes('purple') || hay.includes('violet')) return 'purple';
  if (/\borange\b/.test(hay)) return 'orange';
  if (hay.includes('pink')) return 'pink';
  if (hay.includes('blue')) return 'blue';
  if (hay.includes('green')) return 'green';
  if (hay.includes('champagne') || hay.includes('шампан')) return 'champagne';
  if (hay.includes('cognac')) return 'cognac';
  if (hay.includes('brown')) return 'brown';
  if (hay.includes('yellow')) return 'yellow';
  return 'yellow';
}

function resolveOvertoneHex(overtoneText: string): string | undefined {
  const o = overtoneText.toLowerCase();
  if (o.includes('purplish') || o.includes('пурпур')) return '#B65CF2';
  if (o.includes('violetish') || o.includes('фиолет')) return '#8B5CF6';
  if (o.includes('orangy') || o.includes('оранж')) return '#F97316';
  if (o.includes('pinkish') || o.includes('розов')) return '#F472B6';
  if (o.includes('reddish') || o.includes('красн')) return '#DC2626';
  if (o.includes('greenish') || o.includes('зелен')) return '#10B981';
  if (o.includes('bluish') || o.includes('голуб') || o.includes('синев')) return '#2563EB';
  if (o.includes('yellowish') || o.includes('желт') || o.includes('жёлт')) return '#EAB308';
  if (o.includes('brownish') || o.includes('корич')) return '#8B5A2B';
  if (o.includes('grayish') || o.includes('сер')) return '#94A3B8';
  return undefined;
}

const FANCY_BASE_PALETTES: Record<
  FancyColorKey,
  { lightHex: string; primaryHex: string; deepHex: string }
> = {
  yellow: { lightHex: '#FFF6B8', primaryHex: '#F5C836', deepHex: '#C68A0A' },
  pink: { lightHex: '#FFD6E6', primaryHex: '#EC7AA8', deepHex: '#B93C73' },
  blue: { lightHex: '#CFE4FF', primaryHex: '#4E8AE6', deepHex: '#1D4FA8' },
  green: { lightHex: '#CCF7E2', primaryHex: '#3AC284', deepHex: '#117A4B' },
  chameleon: { lightHex: '#E0EFC7', primaryHex: '#7A9E47', deepHex: '#476524' },
  brown: { lightHex: '#E8C8AA', primaryHex: '#9C5E2E', deepHex: '#592E12' },
  cognac: { lightHex: '#F3D1AE', primaryHex: '#BA6E2C', deepHex: '#733B11' },
  champagne: { lightHex: '#F8E8CF', primaryHex: '#CFA878', deepHex: '#8E683D' },
  orange: { lightHex: '#FFD8B0', primaryHex: '#F27D24', deepHex: '#B84708' },
  purple: { lightHex: '#E9D2FF', primaryHex: '#9F62E6', deepHex: '#5F2AA8' },
  red: { lightHex: '#FFC2C8', primaryHex: '#D83446', deepHex: '#8C1423' },
  gray: { lightHex: '#E2E7EE', primaryHex: '#8F9AA8', deepHex: '#4E5866' },
  black: { lightHex: '#5B6270', primaryHex: '#252932', deepHex: '#0F1116' },
};

type RgbStop = readonly [number, number, number];
type SixStopLut = readonly [RgbStop, RgbStop, RgbStop, RgbStop, RgbStop, RgbStop];

const WHITE_IDENTITY_LUT: SixStopLut = [
  [0.0, 0.0, 0.0],
  [0.2, 0.2, 0.2],
  [0.4, 0.4, 0.4],
  [0.6, 0.6, 0.6],
  [0.8, 0.8, 0.8],
  [1.0, 1.0, 1.0],
];

const WARM_IVORY_LUT: SixStopLut = [
  [0.08, 0.06, 0.02],
  [0.29, 0.25, 0.16],
  [0.49, 0.45, 0.34],
  [0.69, 0.65, 0.54],
  [0.87, 0.84, 0.74],
  [1.0, 0.99, 0.97],
];

// 6-stop sRGB optical absorption curves directly measured from our GIA-calibrated
// studio photographs (stops at input luminance 0.0, 0.2, 0.4, 0.6, 0.8, 1.0).
// Every curve preserves razor-sharp facet contrast and pure white specular fire at stop 1.0.
const FANCY_PHYSICAL_LUTS: Record<FancyColorKey, SixStopLut> = {
  pink: [
    [0.28, 0.08, 0.06],
    [0.47, 0.23, 0.2],
    [0.66, 0.44, 0.41],
    [0.83, 0.64, 0.61],
    [0.94, 0.82, 0.8],
    [1.0, 0.98, 0.98],
  ],
  yellow: [
    [0.24, 0.12, 0.01],
    [0.51, 0.35, 0.07],
    [0.69, 0.54, 0.17],
    [0.84, 0.74, 0.34],
    [0.95, 0.89, 0.62],
    [1.0, 0.99, 0.95],
  ],
  blue: [
    [0.06, 0.14, 0.27],
    [0.24, 0.34, 0.47],
    [0.42, 0.54, 0.67],
    [0.62, 0.73, 0.84],
    [0.84, 0.91, 0.96],
    [0.98, 0.99, 1.0],
  ],
  green: [
    [0.07, 0.18, 0.09],
    [0.23, 0.39, 0.28],
    [0.41, 0.58, 0.46],
    [0.61, 0.77, 0.66],
    [0.83, 0.92, 0.85],
    [0.98, 1.0, 0.98],
  ],
  brown: [
    [0.2, 0.08, 0.03],
    [0.42, 0.23, 0.12],
    [0.6, 0.42, 0.27],
    [0.78, 0.61, 0.45],
    [0.92, 0.83, 0.72],
    [1.0, 0.98, 0.95],
  ],
  cognac: [
    [0.24, 0.1, 0.03],
    [0.48, 0.27, 0.13],
    [0.68, 0.47, 0.29],
    [0.84, 0.67, 0.48],
    [0.95, 0.87, 0.75],
    [1.0, 0.98, 0.95],
  ],
  champagne: [
    [0.25, 0.14, 0.06],
    [0.46, 0.31, 0.19],
    [0.64, 0.51, 0.4],
    [0.81, 0.72, 0.62],
    [0.93, 0.88, 0.81],
    [1.0, 0.99, 0.96],
  ],
  orange: [
    [0.34, 0.07, 0.0],
    [0.6, 0.23, 0.06],
    [0.76, 0.44, 0.21],
    [0.89, 0.63, 0.39],
    [0.97, 0.84, 0.68],
    [1.0, 0.98, 0.93],
  ],
  purple: [
    [0.2, 0.1, 0.33],
    [0.39, 0.26, 0.49],
    [0.57, 0.45, 0.63],
    [0.75, 0.64, 0.78],
    [0.91, 0.85, 0.93],
    [0.99, 0.98, 1.0],
  ],
  red: [
    [0.34, 0.05, 0.06],
    [0.53, 0.18, 0.2],
    [0.7, 0.36, 0.38],
    [0.85, 0.58, 0.59],
    [0.95, 0.82, 0.82],
    [1.0, 0.98, 0.98],
  ],
  chameleon: [
    [0.18, 0.15, 0.04],
    [0.36, 0.32, 0.17],
    [0.54, 0.51, 0.34],
    [0.72, 0.7, 0.53],
    [0.9, 0.89, 0.77],
    [0.99, 0.99, 0.95],
  ],
  gray: [
    [0.1, 0.1, 0.12],
    [0.24, 0.24, 0.26],
    [0.43, 0.43, 0.45],
    [0.64, 0.64, 0.66],
    [0.84, 0.84, 0.85],
    [0.98, 0.98, 0.99],
  ],
  black: [
    [0.02, 0.02, 0.03],
    [0.05, 0.05, 0.06],
    [0.1, 0.1, 0.12],
    [0.21, 0.22, 0.24],
    [0.46, 0.47, 0.5],
    [0.94, 0.95, 0.98],
  ],
};

function resolveOvertoneColorKey(overtoneText: string): FancyColorKey | undefined {
  const o = overtoneText.toLowerCase();
  if (o.includes('purplish') || o.includes('пурпур') || o.includes('violetish') || o.includes('фиолет')) {
    return 'purple';
  }
  if (o.includes('orangy') || o.includes('оранж')) return 'orange';
  if (o.includes('pinkish') || o.includes('розов')) return 'pink';
  if (o.includes('reddish') || o.includes('красн')) return 'red';
  if (o.includes('greenish') || o.includes('зелен')) return 'green';
  if (o.includes('bluish') || o.includes('голуб') || o.includes('синев')) return 'blue';
  if (o.includes('yellowish') || o.includes('желт') || o.includes('жёлт')) return 'yellow';
  if (o.includes('brownish') || o.includes('корич')) return 'brown';
  if (o.includes('grayish') || o.includes('сер')) return 'gray';
  return undefined;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function formatOpticalLut(stops: readonly RgbStop[]): DiamondOpticalLut {
  return {
    r: stops.map((s) => clamp01(s[0]).toFixed(3)).join(' '),
    g: stops.map((s) => clamp01(s[1]).toFixed(3)).join(' '),
    b: stops.map((s) => clamp01(s[2]).toFixed(3)).join(' '),
  };
}

function buildCalibratedLut(
  targetLut: SixStopLut,
  options: {
    strength: number;
    depthScale?: number;
    overtoneLut?: SixStopLut;
    overtoneMix?: number;
  }
): DiamondOpticalLut {
  const { strength, depthScale = 1, overtoneLut, overtoneMix = 0.26 } = options;
  const stops: RgbStop[] = targetLut.map((stop, idx) => {
    const id = WHITE_IDENTITY_LUT[idx];
    let r = stop[0];
    let g = stop[1];
    let b = stop[2];

    if (overtoneLut) {
      const ov = overtoneLut[idx];
      r = r * (1 - overtoneMix) + ov[0] * overtoneMix;
      g = g * (1 - overtoneMix) + ov[1] * overtoneMix;
      b = b * (1 - overtoneMix) + ov[2] * overtoneMix;
    }

    // Interpolate from neutral white diamond (strength < 1) or push chroma (strength > 1)
    if (strength <= 1) {
      r = id[0] + (r - id[0]) * strength;
      g = id[1] + (g - id[1]) * strength;
      b = id[2] + (b - id[2]) * strength;
    } else {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const boost = idx === 5 ? 1 + (strength - 1) * 0.25 : strength;
      r = lum + (r - lum) * boost;
      g = lum + (g - lum) * boost;
      b = lum + (b - lum) * boost;
    }

    // Deepen body stops for Fancy Deep / Fancy Dark while keeping top specular sparkle crisp
    if (depthScale !== 1 && idx < 5) {
      const weight = idx === 4 ? 0.5 + depthScale * 0.5 : depthScale;
      r *= weight;
      g *= weight;
      b *= weight;
    }

    return [clamp01(r), clamp01(g), clamp01(b)] as const;
  });

  return formatOpticalLut(stops);
}

export function getDiamondOpticalPalette(diamond: Diamond): DiamondOpticalPalette {
  const isFancy =
    diamond.directory === 'fancy' ||
    Boolean(diamond.isFancyColor) ||
    (Boolean(diamond.colorFamily) && diamond.colorFamily !== 'Бесцветный (D–J)');

  if (!isFancy) {
    const grade = (diamond.color || 'D').trim().toUpperCase().charAt(0);
    if (grade === 'D' || grade === 'E' || grade === 'F') {
      return {
        lightHex: '#FFFFFF',
        primaryHex: '#EEF4FC',
        deepHex: '#CBD8E8',
        multiplyOpacity: 0,
        colorOpacity: 0,
        isWhite: true,
        isBlack: false,
      };
    }
    if (grade === 'G') {
      return {
        lightHex: '#FFFDF8',
        primaryHex: '#F7F3E8',
        deepHex: '#DDD6C3',
        multiplyOpacity: 0.06,
        colorOpacity: 0.05,
        lut: buildCalibratedLut(WARM_IVORY_LUT, { strength: 0.08 }),
        isWhite: true,
        isBlack: false,
      };
    }
    if (grade === 'H') {
      return {
        lightHex: '#FFFBF0',
        primaryHex: '#F4ECDA',
        deepHex: '#D6C8A8',
        multiplyOpacity: 0.12,
        colorOpacity: 0.1,
        lut: buildCalibratedLut(WARM_IVORY_LUT, { strength: 0.15 }),
        isWhite: true,
        isBlack: false,
      };
    }
    return {
      lightHex: '#FFF6DE',
      primaryHex: '#EEDDB8',
      deepHex: '#C7AE7D',
      multiplyOpacity: grade === 'I' ? 0.2 : 0.28,
      colorOpacity: grade === 'I' ? 0.16 : 0.24,
      lut: buildCalibratedLut(WARM_IVORY_LUT, { strength: grade === 'I' ? 0.24 : 0.34 }),
      isWhite: true,
      isBlack: false,
    };
  }

  const parsed = composeParsedFancyColor(diamond);
  const colorKey = resolveCanonicalColorKey(diamond, parsed);
  const base = FANCY_BASE_PALETTES[colorKey];
  const baseLut = FANCY_PHYSICAL_LUTS[colorKey];
  const intensity = parsed.fancyIntensity || diamond.fancyIntensity || 'Fancy';
  const overtoneRaw = `${diamond.fancyOvertone || ''} ${diamond.overtone || ''} ${parsed.fancyOvertone || ''} ${diamond.color || ''}`;
  const overtoneHex = resolveOvertoneHex(overtoneRaw);
  const overtoneKey = resolveOvertoneColorKey(overtoneRaw);
  const overtoneLut =
    overtoneKey && overtoneKey !== colorKey ? FANCY_PHYSICAL_LUTS[overtoneKey] : undefined;

  if (colorKey === 'black') {
    return {
      ...base,
      multiplyOpacity: 0.88,
      colorOpacity: 0.9,
      darknessOverlay: 0.42,
      lut: formatOpticalLut(baseLut),
      isWhite: false,
      isBlack: true,
    };
  }

  if (colorKey === 'gray') {
    const depthScale =
      intensity === 'Fancy Dark' ? 0.72 : intensity === 'Fancy Deep' ? 0.82 : 1;
    const strength =
      intensity === 'Light' ? 0.55 : intensity === 'Fancy Light' ? 0.72 : 1;
    return {
      ...base,
      overtoneHex,
      multiplyOpacity: 0.56,
      colorOpacity: 0.65,
      darknessOverlay: intensity === 'Fancy Dark' ? 0.24 : 0.08,
      lut: buildCalibratedLut(baseLut, {
        strength,
        depthScale,
        overtoneLut,
        overtoneMix: 0.28,
      }),
      isWhite: false,
      isBlack: false,
    };
  }

  let multiplyOpacity = 0.72;
  let colorOpacity = 0.62;
  let darknessOverlay = 0;
  let lutStrength = 0.82;
  let lutDepthScale = 1;

  switch (intensity) {
    case 'Light':
      multiplyOpacity = 0.36;
      colorOpacity = 0.36;
      lutStrength = 0.38;
      break;
    case 'Fancy Light':
      multiplyOpacity = 0.52;
      colorOpacity = 0.48;
      lutStrength = 0.58;
      break;
    case 'Fancy':
      multiplyOpacity = 0.72;
      colorOpacity = 0.62;
      lutStrength = 0.8;
      break;
    case 'Fancy Intense':
      multiplyOpacity = 0.86;
      colorOpacity = 0.78;
      lutStrength = 1.0;
      break;
    case 'Fancy Vivid':
      multiplyOpacity = 0.94;
      colorOpacity = 0.88;
      lutStrength = 1.24;
      break;
    case 'Fancy Deep':
      multiplyOpacity = 0.92;
      colorOpacity = 0.82;
      darknessOverlay = 0.18;
      lutStrength = 1.12;
      lutDepthScale = 0.84;
      break;
    case 'Fancy Dark':
      multiplyOpacity = 0.9;
      colorOpacity = 0.78;
      darknessOverlay = 0.3;
      lutStrength = 0.98;
      lutDepthScale = 0.7;
      break;
    default:
      break;
  }

  return {
    ...base,
    overtoneHex,
    multiplyOpacity,
    colorOpacity,
    darknessOverlay: darknessOverlay || undefined,
    lut: buildCalibratedLut(baseLut, {
      strength: lutStrength,
      depthScale: lutDepthScale,
      overtoneLut,
      overtoneMix: 0.26,
    }),
    isWhite: false,
    isBlack: false,
  };
}

function getMacroShapeForDiamond(
  shape: Diamond['shape']
): { maskShape: StudioMacroMaskShape; whiteMacroSrc: string } | null {
  switch (shape) {
    case 'Round':
    case 'Old European':
      return { maskShape: 'round', whiteMacroSrc: STUDIO_GEM_PHOTOS.round_white };
    case 'Rose Cut':
      return { maskShape: 'rose_cut', whiteMacroSrc: STUDIO_GEM_PHOTOS.rose_cut_white };
    case 'Oval':
    case 'Moval':
      return { maskShape: 'oval', whiteMacroSrc: STUDIO_GEM_PHOTOS.oval_white };
    case 'Emerald':
      return { maskShape: 'emerald', whiteMacroSrc: STUDIO_GEM_PHOTOS.emerald_white };
    case 'Princess':
      return { maskShape: 'princess', whiteMacroSrc: STUDIO_GEM_PHOTOS.princess_white };
    case 'Cushion':
    case 'Antique Cushion':
    case 'Old Mine':
      return { maskShape: 'cushion', whiteMacroSrc: STUDIO_GEM_PHOTOS.cushion_white };
    case 'Pear':
      return { maskShape: 'pear', whiteMacroSrc: STUDIO_GEM_PHOTOS.pear_white };
    case 'Radiant':
      return { maskShape: 'radiant', whiteMacroSrc: STUDIO_GEM_PHOTOS.radiant_white };
    case 'Marquise':
      return { maskShape: 'marquise', whiteMacroSrc: STUDIO_GEM_PHOTOS.marquise_white };
    case 'Heart':
      return { maskShape: 'heart', whiteMacroSrc: STUDIO_GEM_PHOTOS.heart_white };
    case 'Asscher':
    case 'Octagon':
      return { maskShape: 'asscher', whiteMacroSrc: STUDIO_GEM_PHOTOS.asscher_white };
    case 'Baguette':
      return { maskShape: 'baguette', whiteMacroSrc: STUDIO_GEM_PHOTOS.baguette_white };
    case 'Trilliant':
      return { maskShape: 'trilliant', whiteMacroSrc: STUDIO_GEM_PHOTOS.trilliant_white };
    case 'Shield':
      return { maskShape: 'shield', whiteMacroSrc: STUDIO_GEM_PHOTOS.shield_white };
    case 'Kite':
      return { maskShape: 'kite', whiteMacroSrc: STUDIO_GEM_PHOTOS.kite_white };
    case 'Hexagon':
      return { maskShape: 'hexagon', whiteMacroSrc: STUDIO_GEM_PHOTOS.hexagon_white };
    case 'Lozenge':
      return { maskShape: 'lozenge', whiteMacroSrc: STUDIO_GEM_PHOTOS.lozenge_white };
    case 'Half Moon':
      return { maskShape: 'half_moon', whiteMacroSrc: STUDIO_GEM_PHOTOS.half_moon_white };
    case 'Trapezoid':
      return { maskShape: 'trapezoid', whiteMacroSrc: STUDIO_GEM_PHOTOS.trapezoid_white };
    case 'Cadillac':
      return { maskShape: 'cadillac', whiteMacroSrc: STUDIO_GEM_PHOTOS.cadillac_white };
    case 'Briolette':
      return { maskShape: 'briolette', whiteMacroSrc: STUDIO_GEM_PHOTOS.briolette_white };
    case 'Cabochon':
      return { maskShape: 'cabochon', whiteMacroSrc: STUDIO_GEM_PHOTOS.cabochon_white };
    default:
      return null;
  }
}

function resolveRoundStudioColorPhoto(
  colorKey: FancyColorKey,
  intensity: string,
  overtoneText: string
): { src: string; filter?: string } {
  const ovt = overtoneText.toLowerCase();
  const parts: string[] = [];

  if (colorKey === 'black') {
    return { src: STUDIO_GEM_PHOTOS.round_black };
  }

  if (colorKey === 'gray') {
    // Tinted gray diamonds (Bluish Gray, Greenish Gray, Violetish Gray) look
    // most authentic by desaturating the corresponding chromatic master.
    let src: string = STUDIO_GEM_PHOTOS.round_gray;
    let baseSat = 0.28;
    if (ovt.includes('blu') || ovt.includes('голуб') || ovt.includes('синев')) {
      src = STUDIO_GEM_PHOTOS.round_blue;
      baseSat = 0.34;
    } else if (ovt.includes('green') || ovt.includes('зелен')) {
      src = STUDIO_GEM_PHOTOS.round_green;
      baseSat = 0.32;
    } else if (
      ovt.includes('violet') ||
      ovt.includes('purpl') ||
      ovt.includes('фиолет') ||
      ovt.includes('пурпур')
    ) {
      src = STUDIO_GEM_PHOTOS.round_purple;
      baseSat = 0.34;
    } else if (ovt.includes('yellow') || ovt.includes('желт') || ovt.includes('жёлт')) {
      src = STUDIO_GEM_PHOTOS.round_champagne;
      baseSat = 0.36;
    }

    switch (intensity) {
      case 'Light':
      case 'Fancy Light':
        parts.push(`saturate(${baseSat})`, 'brightness(1.01)');
        break;
      case 'Fancy':
        parts.push(`saturate(${baseSat})`, 'contrast(1.06)', 'brightness(0.96)');
        break;
      case 'Fancy Intense':
      case 'Fancy Vivid':
        parts.push(`saturate(${Math.min(0.42, baseSat + 0.06)})`, 'contrast(1.09)', 'brightness(0.93)');
        break;
      case 'Fancy Deep':
      case 'Fancy Dark':
        parts.push(`saturate(${Math.max(0.2, baseSat - 0.04)})`, 'contrast(1.12)', 'brightness(0.87)');
        break;
      default:
        parts.push(`saturate(${baseSat})`, 'contrast(1.06)', 'brightness(0.96)');
        break;
    }
    return { src, filter: parts.join(' ') };
  }

  if (colorKey === 'chameleon') {
    switch (intensity) {
      case 'Light':
        parts.push('saturate(0.55)', 'brightness(1.04)');
        break;
      case 'Fancy Light':
        parts.push('saturate(0.74)', 'brightness(1.02)');
        break;
      case 'Fancy':
      case 'Fancy Intense':
        break;
      case 'Fancy Vivid':
        parts.push('saturate(1.24)', 'contrast(1.05)');
        break;
      case 'Fancy Deep':
        parts.push('saturate(1.12)', 'brightness(0.90)', 'contrast(1.08)');
        break;
      case 'Fancy Dark':
        parts.push('saturate(0.96)', 'brightness(0.84)', 'contrast(1.10)');
        break;
      default:
        break;
    }
    return {
      src: STUDIO_GEM_PHOTOS.round_chameleon,
      filter: parts.length > 0 ? parts.join(' ') : undefined,
    };
  }

  if (colorKey === 'champagne') {
    switch (intensity) {
      case 'Light':
        parts.push('saturate(0.72)', 'brightness(1.03)');
        break;
      case 'Fancy Light':
      case 'Fancy':
        break;
      case 'Fancy Intense':
        parts.push('saturate(1.24)', 'contrast(1.04)');
        break;
      case 'Fancy Vivid':
        parts.push('saturate(1.36)', 'contrast(1.06)');
        break;
      case 'Fancy Deep':
        parts.push('saturate(1.18)', 'brightness(0.92)', 'contrast(1.07)');
        break;
      case 'Fancy Dark':
        parts.push('saturate(1.04)', 'brightness(0.85)', 'contrast(1.10)');
        break;
      default:
        break;
    }
    if (ovt.includes('pink') || ovt.includes('розов')) {
      parts.push('hue-rotate(-18deg)');
    } else if (ovt.includes('green') || ovt.includes('зелен')) {
      parts.push('hue-rotate(24deg)');
    }
    return {
      src: STUDIO_GEM_PHOTOS.round_champagne,
      filter: parts.length > 0 ? parts.join(' ') : undefined,
    };
  }

  if (colorKey === 'red') {
    switch (intensity) {
      case 'Light':
        parts.push('saturate(0.60)', 'brightness(1.05)');
        break;
      case 'Fancy Light':
        parts.push('saturate(0.76)', 'brightness(1.03)');
        break;
      case 'Fancy':
      case 'Fancy Intense':
        break;
      case 'Fancy Vivid':
        parts.push('saturate(1.22)', 'contrast(1.05)');
        break;
      case 'Fancy Deep':
        parts.push('saturate(1.10)', 'brightness(0.91)', 'contrast(1.08)');
        break;
      case 'Fancy Dark':
        parts.push('saturate(0.95)', 'brightness(0.84)', 'contrast(1.10)');
        break;
      default:
        break;
    }
    if (ovt.includes('purpl') || ovt.includes('violet') || ovt.includes('пурпур') || ovt.includes('фиолет')) {
      parts.push('hue-rotate(-18deg)');
    } else if (ovt.includes('orang') || ovt.includes('оранж')) {
      parts.push('hue-rotate(16deg)');
    } else if (ovt.includes('brown') || ovt.includes('корич')) {
      parts.push('saturate(0.74)', 'brightness(0.93)');
    }
    return {
      src: STUDIO_GEM_PHOTOS.round_red,
      filter: parts.length > 0 ? parts.join(' ') : undefined,
    };
  }

  if (colorKey === 'brown' || colorKey === 'cognac') {
    switch (intensity) {
      case 'Light':
        parts.push('saturate(0.52)', 'brightness(1.05)');
        break;
      case 'Fancy Light':
        parts.push('saturate(0.74)', 'brightness(1.02)');
        break;
      case 'Fancy':
        break;
      case 'Fancy Intense':
        parts.push('saturate(1.18)', 'contrast(1.04)');
        break;
      case 'Fancy Vivid':
        parts.push('saturate(1.30)', 'contrast(1.06)');
        break;
      case 'Fancy Deep':
        parts.push('saturate(1.12)', 'brightness(0.90)', 'contrast(1.08)');
        break;
      case 'Fancy Dark':
        parts.push('saturate(0.96)', 'brightness(0.83)', 'contrast(1.12)');
        break;
      default:
        break;
    }
    if (ovt.includes('pink') || ovt.includes('розов')) {
      parts.push('hue-rotate(-24deg)');
    } else if (ovt.includes('orang') || ovt.includes('оранж')) {
      parts.push('hue-rotate(-10deg)', 'saturate(1.16)');
    } else if (ovt.includes('yellow') || ovt.includes('желт') || ovt.includes('жёлт')) {
      parts.push('hue-rotate(14deg)', 'saturate(1.10)');
    } else if (ovt.includes('green') || ovt.includes('зелен')) {
      parts.push('hue-rotate(34deg)', 'saturate(0.86)');
    } else if (ovt.includes('gray') || ovt.includes('grey') || ovt.includes('сер')) {
      parts.push('saturate(0.54)');
    }
    return {
      src: STUDIO_GEM_PHOTOS.round_brown,
      filter: parts.length > 0 ? parts.join(' ') : undefined,
    };
  }

  // Remaining chromatic Fancy Intense masters: pink, yellow, blue, green, orange, purple
  // All 6 masters are calibrated to GIA Fancy Intense (zero filter on exact match)
  const intenseMasterMap: Record<
    'pink' | 'yellow' | 'blue' | 'green' | 'orange' | 'purple',
    string
  > = {
    pink: STUDIO_GEM_PHOTOS.round_pink,
    yellow: STUDIO_GEM_PHOTOS.round_yellow,
    blue: STUDIO_GEM_PHOTOS.round_blue,
    green: STUDIO_GEM_PHOTOS.round_green,
    orange: STUDIO_GEM_PHOTOS.round_orange,
    purple: STUDIO_GEM_PHOTOS.round_purple,
  };

  switch (intensity) {
    case 'Light':
      parts.push('saturate(0.44)', 'brightness(1.04)');
      break;
    case 'Fancy Light':
      parts.push('saturate(0.68)', 'brightness(1.02)');
      break;
    case 'Fancy':
      parts.push('saturate(0.85)');
      break;
    case 'Fancy Intense':
      // Exact unedited GIA Fancy Intense master photograph
      break;
    case 'Fancy Vivid':
      parts.push('saturate(1.34)', 'contrast(1.05)');
      break;
    case 'Fancy Deep':
      parts.push('saturate(1.26)', 'brightness(0.91)', 'contrast(1.08)');
      break;
    case 'Fancy Dark':
      parts.push('saturate(1.05)', 'brightness(0.83)', 'contrast(1.11)');
      break;
    default:
      break;
  }

  // Subtle hue-rotate / desaturation for official GIA modifying overtones
  // (hue-rotate & saturate preserve the spotless neutral #F1F2F4 background!)
  if (colorKey === 'pink') {
    if (ovt.includes('violet') || ovt.includes('фиолет')) {
      parts.push('hue-rotate(-32deg)');
    } else if (ovt.includes('purpl') || ovt.includes('пурпур')) {
      parts.push('hue-rotate(-20deg)');
    } else if (ovt.includes('orang') || ovt.includes('оранж')) {
      parts.push('hue-rotate(16deg)');
    } else if (ovt.includes('brown') || ovt.includes('корич')) {
      parts.push('hue-rotate(10deg)', 'saturate(0.76)', 'brightness(0.95)');
    } else if (ovt.includes('gray') || ovt.includes('grey') || ovt.includes('сер')) {
      parts.push('saturate(0.55)');
    }
  } else if (colorKey === 'yellow') {
    if (ovt.includes('green') || ovt.includes('зелен')) {
      parts.push('hue-rotate(24deg)');
    } else if (ovt.includes('orang') || ovt.includes('оранж')) {
      parts.push('hue-rotate(-18deg)');
    } else if (ovt.includes('brown') || ovt.includes('корич')) {
      parts.push('hue-rotate(-14deg)', 'saturate(0.78)', 'brightness(0.94)');
    } else if (ovt.includes('gray') || ovt.includes('grey') || ovt.includes('сер')) {
      parts.push('saturate(0.55)');
    }
  } else if (colorKey === 'blue') {
    if (ovt.includes('green') || ovt.includes('зелен')) {
      parts.push('hue-rotate(-26deg)');
    } else if (
      ovt.includes('violet') ||
      ovt.includes('purpl') ||
      ovt.includes('фиолет') ||
      ovt.includes('пурпур')
    ) {
      parts.push('hue-rotate(24deg)');
    } else if (ovt.includes('gray') || ovt.includes('grey') || ovt.includes('сер')) {
      parts.push('saturate(0.50)');
    }
  } else if (colorKey === 'green') {
    if (ovt.includes('yellow') || ovt.includes('желт') || ovt.includes('жёлт')) {
      parts.push('hue-rotate(-26deg)');
    } else if (ovt.includes('blu') || ovt.includes('голуб') || ovt.includes('синев')) {
      parts.push('hue-rotate(28deg)');
    } else if (ovt.includes('brown') || ovt.includes('корич')) {
      parts.push('hue-rotate(-32deg)', 'saturate(0.72)', 'brightness(0.94)');
    } else if (ovt.includes('gray') || ovt.includes('grey') || ovt.includes('сер')) {
      parts.push('saturate(0.52)');
    }
  } else if (colorKey === 'orange') {
    if (ovt.includes('yellow') || ovt.includes('желт') || ovt.includes('жёлт')) {
      parts.push('hue-rotate(18deg)');
    } else if (
      ovt.includes('pink') ||
      ovt.includes('red') ||
      ovt.includes('розов') ||
      ovt.includes('красн')
    ) {
      parts.push('hue-rotate(-16deg)');
    } else if (ovt.includes('brown') || ovt.includes('корич')) {
      parts.push('saturate(0.74)', 'brightness(0.93)');
    }
  } else if (colorKey === 'purple') {
    if (ovt.includes('pink') || ovt.includes('розов')) {
      parts.push('hue-rotate(24deg)');
    } else if (ovt.includes('blu') || ovt.includes('голуб') || ovt.includes('синев')) {
      parts.push('hue-rotate(-24deg)');
    } else if (ovt.includes('gray') || ovt.includes('grey') || ovt.includes('сер')) {
      parts.push('saturate(0.52)');
    }
  }

  return {
    src: intenseMasterMap[colorKey],
    filter: parts.length > 0 ? parts.join(' ') : undefined,
  };
}

/**
 * Selects the studio visual strictly SHAPE-FIRST, then calibrates exact color, shade,
 * overtone, and intensity. Never displays a mismatched cut silhouette (e.g. never shows
 * a Pear or Emerald photo for a Round diamond).
 */
export function getCalibratedStudioVisual(diamond: Diamond): CalibratedStudioVisual {
  const isFancy =
    diamond.directory === 'fancy' ||
    Boolean(diamond.isFancyColor) ||
    (Boolean(diamond.colorFamily) && diamond.colorFamily !== 'Бесцветный (D–J)');

  const shapeLabel = SHAPE_SHORT_RU[diamond.shape] || diamond.shape;
  const palette = getDiamondOpticalPalette(diamond);
  const macroMatch = getMacroShapeForDiamond(diamond.shape);

  if (!isFancy) {
    const label = `Студийное фото · ${shapeLabel} · ${diamond.color}`;
    if (macroMatch) {
      const needsWarmTint =
        palette.multiplyOpacity > 0.01 || palette.colorOpacity > 0.01;
      if (!needsWarmTint) {
        return {
          mode: 'native-photo',
          src: macroMatch.whiteMacroSrc,
          seamless: true,
          palette,
          label,
        };
      }
      return {
        mode: 'tinted-macro',
        src: macroMatch.whiteMacroSrc,
        maskShape: macroMatch.maskShape,
        seamless: true,
        palette,
        label,
      };
    }
    return {
      mode: 'faceted-svg',
      src: SHAPE_IMAGE_MAP[diamond.shape] || STUDIO_GEM_PHOTOS.round_white,
      palette,
      label,
    };
  }

  const parsed = composeParsedFancyColor(diamond);
  const colorKey = resolveCanonicalColorKey(diamond, parsed);
  const intensity = parsed.fancyIntensity || diamond.fancyIntensity || 'Fancy';
  const shadeText = parsed.isSpecificShade
    ? parsed.canonicalColor
    : diamond.colorFamily || diamond.color;
  const label = `Студийное фото · ${shapeLabel} · ${shadeText}`;

  // Use exact photorealistic GIA-calibrated studio masters for ALL Round & Old European colors
  if (diamond.shape === 'Round' || diamond.shape === 'Old European') {
    const overtoneText = `${diamond.fancyOvertone || ''} ${diamond.overtone || ''} ${parsed.fancyOvertone || ''} ${diamond.color || ''}`;
    const resolved = resolveRoundStudioColorPhoto(colorKey, intensity, overtoneText);
    return {
      mode: 'native-photo',
      src: resolved.src,
      filter: resolved.filter,
      seamless: true,
      palette,
      label,
    };
  }

  // For ALL other 25 shapes (Oval, Emerald, Princess, Cushion, Pear, Radiant, Marquise,
  // Heart, Asscher, Rose Cut, Baguette, Trilliant, Shield, Kite, Hexagon, Lozenge,
  // Half Moon, Trapezoid, Cadillac, Briolette, Cabochon & antique equivalents) ->
  // unified bright-lightbox (#F1F2F4) colorless studio master + precision-fitted
  // GIA optical color/intensity/overtone glaze strictly inside the real diamond girdle!
  if (macroMatch) {
    return {
      mode: 'tinted-macro',
      src: macroMatch.whiteMacroSrc,
      maskShape: macroMatch.maskShape,
      seamless: true,
      palette,
      label,
    };
  }

  // Defensive fallback for any unknown custom shape outside ALL_SHAPES
  return {
    mode: 'faceted-svg',
    src: SHAPE_IMAGE_MAP[diamond.shape] || STUDIO_GEM_PHOTOS.round_white,
    palette,
    label,
  };
}
