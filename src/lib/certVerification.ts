import {
  FANCY_IMAGE_MAP,
  SHAPE_IMAGE_MAP,
  SHAPE_SHORT_RU,
  getCertVerifyUrl,
} from '../data/diamonds';
import { getStudioFallbackImage } from './catalogEngine';
import {
  isNonImageMediaUrl,
  isStrictWhiteLetterGrade,
  parseFancyColor,
  sanitizeMediaUrl,
} from './fancyColorParser';
import type {
  CertBatchVerifyResultItem,
  CertVerifyResponse,
} from './certVerifyTypes';
import type { Diamond } from '../types/diamond';

const CERT_NUMBER_REGEX = /^[A-Za-z0-9-]{4,32}$/;
const SYNTHETIC_CERT_PREFIX = /^(XL|GS|MGR|DEMO|TEST|TMP)-/i;

const clientVerifyCache = new Map<string, CertVerifyResponse>();

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

export async function verifyCertificateColor(
  lab: string,
  certNumber: string,
  options?: { bypassCache?: boolean; signal?: AbortSignal }
): Promise<CertVerifyResponse> {
  const cleanLab = (lab || 'GIA').trim().toUpperCase();
  const cleanCert = (certNumber || '').trim();
  const cacheKey = `${cleanLab}:${cleanCert.toUpperCase()}`;

  if (!options?.bypassCache) {
    const cached = clientVerifyCache.get(cacheKey);
    if (cached) return cached;
  }

  if (!isVerifiableCertNumber(cleanCert)) {
    return {
      status: 'invalid',
      lab: cleanLab,
      certNumber: cleanCert,
      verifyUrl: getCertVerifyUrl(cleanLab, cleanCert),
      message:
        'Номер сертификата отсутствует или является внутренним кодом поставщика.',
      checkedAt: new Date().toISOString(),
    };
  }

  try {
    const params = new URLSearchParams({
      lab: cleanLab,
      certNumber: cleanCert,
    });
    const res = await fetch(`/api/cert-verify?${params.toString()}`, {
      method: 'GET',
      signal: options?.signal,
    });

    if (!res.ok) {
      let errMsg = `Ошибка проверки (${res.status}).`;
      try {
        const body = (await res.json()) as { error?: string };
        if (body?.error) errMsg = body.error;
      } catch {
        // ignore parse error
      }
      return {
        status: 'manual_required',
        lab: cleanLab,
        certNumber: cleanCert,
        verifyUrl: getCertVerifyUrl(cleanLab, cleanCert),
        message: errMsg,
        checkedAt: new Date().toISOString(),
      };
    }

    const data = (await res.json()) as CertVerifyResponse;
    clientVerifyCache.set(cacheKey, data);
    return data;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    return {
      status: 'manual_required',
      lab: cleanLab,
      certNumber: cleanCert,
      verifyUrl: getCertVerifyUrl(cleanLab, cleanCert),
      message:
        'Сервис проверки временно недоступен. Откройте бланк на сайте лаборатории и подтвердите цвет вручную.',
      checkedAt: new Date().toISOString(),
    };
  }
}

export interface BatchVerifyProgress {
  completed: number;
  total: number;
  verifiedCount: number;
  manualCount: number;
  notFoundCount: number;
  rateLimited?: boolean;
}

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function verifyBatchCertificateColors(
  stones: Diamond[],
  options?: {
    onProgress?: (progress: BatchVerifyProgress) => void;
    onChunkComplete?: (chunkResults: Map<string, CertVerifyResponse>) => void;
    signal?: AbortSignal;
  }
): Promise<Map<string, CertVerifyResponse>> {
  const results = new Map<string, CertVerifyResponse>();
  const verifiable = stones.filter((s) => isVerifiableCertNumber(s.certNumber));
  const total = verifiable.length;
  let completed = 0;
  let verifiedCount = 0;
  let manualCount = 0;
  let notFoundCount = 0;
  let rateLimited = false;

  const CHUNK_SIZE = 10;

  for (let i = 0; i < verifiable.length; i += CHUNK_SIZE) {
    if (options?.signal?.aborted) break;

    const chunk = verifiable.slice(i, i + CHUNK_SIZE);
    const chunkResults = new Map<string, CertVerifyResponse>();
    const uncached: Diamond[] = [];

    for (const stone of chunk) {
      const key = `${(stone.certLab || 'GIA').toUpperCase()}:${stone.certNumber.trim().toUpperCase()}`;
      const hit = clientVerifyCache.get(key);
      if (hit) {
        results.set(stone.id, hit);
        chunkResults.set(stone.id, hit);
        completed += 1;
        if (hit.status === 'verified') verifiedCount += 1;
        else if (hit.status === 'not_found') notFoundCount += 1;
        else manualCount += 1;
      } else {
        uncached.push(stone);
      }
    }

    if (uncached.length > 0) {
      try {
        const sendBatchRequest = () =>
          fetch('/api/cert-verify/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: options?.signal,
            body: JSON.stringify({
              items: uncached.map((s) => ({
                id: s.id,
                lab: s.certLab || 'GIA',
                certNumber: s.certNumber.trim(),
              })),
            }),
          });

        let res = await sendBatchRequest();

        // If server rate-limit (429) triggers, pause briefly and retry once cleanly
        if (res.status === 429 && !options?.signal?.aborted) {
          await sleepWithAbort(2500, options?.signal);
          if (!options?.signal?.aborted) {
            res = await sendBatchRequest();
          }
        }

        if (res.ok) {
          const payload = (await res.json()) as {
            results?: CertBatchVerifyResultItem[];
          };
          const list = payload.results || [];
          for (const item of list) {
            if (!item.id) continue;
            const key = `${(item.lab || 'GIA').toUpperCase()}:${(item.certNumber || '').trim().toUpperCase()}`;
            clientVerifyCache.set(key, item);
            results.set(item.id, item);
            chunkResults.set(item.id, item);
            completed += 1;
            if (item.status === 'verified') verifiedCount += 1;
            else if (item.status === 'not_found') notFoundCount += 1;
            else manualCount += 1;
          }
        } else {
          if (res.status === 429) {
            rateLimited = true;
          }
          for (const stone of uncached) {
            const fallback: CertVerifyResponse = {
              status: 'manual_required',
              lab: stone.certLab || 'GIA',
              certNumber: stone.certNumber,
              verifyUrl: getCertVerifyUrl(stone.certLab, stone.certNumber),
              message:
                res.status === 429
                  ? 'Достигнут лимит частоты запросов (60/мин). Повторите через минуту или подтвердите цвет по ссылке.'
                  : `Запрос проверки завершился со статусом ${res.status}.`,
              checkedAt: new Date().toISOString(),
            };
            results.set(stone.id, fallback);
            chunkResults.set(stone.id, fallback);
            completed += 1;
            manualCount += 1;
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          break;
        }
        for (const stone of uncached) {
          const fallback: CertVerifyResponse = {
            status: 'manual_required',
            lab: stone.certLab || 'GIA',
            certNumber: stone.certNumber,
            verifyUrl: getCertVerifyUrl(stone.certLab, stone.certNumber),
            message: 'Не удалось связаться с сервером верификации.',
            checkedAt: new Date().toISOString(),
          };
          results.set(stone.id, fallback);
          chunkResults.set(stone.id, fallback);
          completed += 1;
          manualCount += 1;
        }
      }
    }

    if (chunkResults.size > 0) {
      options?.onChunkComplete?.(chunkResults);
    }

    options?.onProgress?.({
      completed,
      total,
      verifiedCount,
      manualCount,
      notFoundCount,
      rateLimited,
    });

    if (rateLimited) {
      break;
    }

    // Gentle pacing between uncached upstream chunks to respect lab & server rate limits
    if (uncached.length > 0 && i + CHUNK_SIZE < verifiable.length) {
      await sleepWithAbort(650, options?.signal);
    }
  }

  return results;
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
  const checkedAt = new Date().toISOString();

  if (isStrictWhiteLetterGrade(cleaned)) {
    const grade = cleaned.toUpperCase();
    return {
      status: 'verified',
      lab: cleanLab,
      certNumber: cleanCert,
      verifyUrl,
      rawColor: cleaned,
      normalizedColor: grade,
      colorFamily: 'Бесцветный (D–J)',
      isWhite: true,
      isSpecificShade: false,
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
    rawColor: cleaned,
    normalizedColor: parsed.canonicalColor,
    colorFamily: parsed.colorFamily,
    fancyIntensity: parsed.fancyIntensity,
    fancyOvertone: parsed.fancyOvertone,
    shortCode: parsed.shortCode,
    isWhite: false,
    isSpecificShade: parsed.isSpecificShade,
    message: `Цвет «${parsed.canonicalColor}»${
      parsed.shortCode ? ` (${parsed.shortCode})` : ''
    } подтверждён по бланку ${cleanLab} #${cleanCert}.`,
    checkedAt,
  };
}

/**
 * Applies a verified certificate color to a Diamond object, updating color/shade/intensity/category
 * and optionally switching to the calibrated studio photograph matching the verified characteristics.
 */
export function applyVerifiedColorToDiamond(
  diamond: Diamond,
  verification: CertVerifyResponse,
  options?: {
    useStudioPhoto?: boolean;
    source?: 'auto' | 'manual';
  }
): Diamond {
  if (verification.status !== 'verified' || !verification.normalizedColor) {
    return diamond;
  }

  const isWhite = Boolean(verification.isWhite);
  const nextBase: Diamond = {
    ...diamond,
    color: verification.normalizedColor,
    colorFamily: isWhite
      ? 'Бесцветный (D–J)'
      : verification.colorFamily || diamond.colorFamily || 'Фантазийный',
    directory: isWhite ? 'white' : 'fancy',
    isFancyColor: !isWhite,
    stoneType: isWhite ? 'Бриллиант' : 'Цветной бриллиант',
    fancyIntensity: isWhite ? undefined : verification.fancyIntensity,
    fancyOvertone: isWhite ? undefined : verification.fancyOvertone,
    overtone: isWhite ? undefined : verification.fancyOvertone,
    primaryHue: isWhite
      ? undefined
      : verification.colorFamily || diamond.colorFamily || 'Фантазийный',
    certColorVerified: true,
    certVerifiedColor: verification.normalizedColor,
    certVerifiedAt: verification.checkedAt,
    certVerifySource: options?.source || 'auto',
  };

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

export type StudioMacroMaskShape = 'round' | 'oval' | 'cushion' | 'emerald' | 'pear';

export interface DiamondOpticalPalette {
  lightHex: string;
  primaryHex: string;
  deepHex: string;
  overtoneHex?: string;
  multiplyOpacity: number;
  colorOpacity: number;
  darknessOverlay?: number;
  isWhite: boolean;
  isBlack: boolean;
}

export interface CalibratedStudioVisual {
  mode: 'native-photo' | 'tinted-macro' | 'faceted-svg';
  src: string;
  maskShape?: StudioMacroMaskShape;
  filter?: string;
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
  const hay = `${diamond.color || ''} ${diamond.colorFamily || ''} ${diamond.fancyOvertone || ''}`.toLowerCase();

  if (family.includes('чёрн') || family.includes('черн') || hay.includes('black')) {
    return 'black';
  }
  if (family.includes('сер') || hay.includes('gray') || hay.includes('grey')) {
    return 'gray';
  }
  if (family.includes('красн') || /\bred\b/.test(hay)) {
    return 'red';
  }
  if (family.includes('фиолет') || hay.includes('purple') || hay.includes('violet')) {
    return 'purple';
  }
  if (family.includes('оранж') || /\borange\b/.test(hay)) {
    return 'orange';
  }
  if (family.includes('розов') || hay.includes('pink')) {
    return 'pink';
  }
  if (family.includes('син') || family.includes('голуб') || hay.includes('blue')) {
    return 'blue';
  }
  if (family.includes('хамелеон') || hay.includes('chameleon')) {
    return 'chameleon';
  }
  if (family.includes('зел') || hay.includes('green')) {
    return 'green';
  }
  if (hay.includes('champagne') || hay.includes('шампан')) {
    return 'champagne';
  }
  if (family.includes('коньяч') || hay.includes('cognac')) {
    return 'cognac';
  }
  if (family.includes('корич') || hay.includes('brown')) {
    return 'brown';
  }
  if (family.includes('жёлт') || family.includes('желт') || hay.includes('yellow')) {
    return 'yellow';
  }
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
      isWhite: true,
      isBlack: false,
    };
  }

  const parsed = parseFancyColor(diamond.color);
  const colorKey = resolveCanonicalColorKey(diamond, parsed);
  const base = FANCY_BASE_PALETTES[colorKey];
  const intensity = diamond.fancyIntensity || parsed.fancyIntensity || 'Fancy';
  const overtoneHex = resolveOvertoneHex(
    `${diamond.fancyOvertone || ''} ${parsed.fancyOvertone || ''} ${diamond.color || ''}`
  );

  if (colorKey === 'black') {
    return {
      ...base,
      multiplyOpacity: 0.88,
      colorOpacity: 0.9,
      darknessOverlay: 0.42,
      isWhite: false,
      isBlack: true,
    };
  }

  if (colorKey === 'gray') {
    return {
      ...base,
      overtoneHex,
      multiplyOpacity: 0.56,
      colorOpacity: 0.65,
      darknessOverlay: intensity === 'Fancy Dark' ? 0.24 : 0.08,
      isWhite: false,
      isBlack: false,
    };
  }

  let multiplyOpacity = 0.72;
  let colorOpacity = 0.62;
  let darknessOverlay = 0;

  switch (intensity) {
    case 'Light':
      multiplyOpacity = 0.36;
      colorOpacity = 0.36;
      break;
    case 'Fancy Light':
      multiplyOpacity = 0.52;
      colorOpacity = 0.48;
      break;
    case 'Fancy':
      multiplyOpacity = 0.72;
      colorOpacity = 0.62;
      break;
    case 'Fancy Intense':
      multiplyOpacity = 0.86;
      colorOpacity = 0.78;
      break;
    case 'Fancy Vivid':
      multiplyOpacity = 0.94;
      colorOpacity = 0.88;
      break;
    case 'Fancy Deep':
      multiplyOpacity = 0.92;
      colorOpacity = 0.82;
      darknessOverlay = 0.18;
      break;
    case 'Fancy Dark':
      multiplyOpacity = 0.9;
      colorOpacity = 0.78;
      darknessOverlay = 0.3;
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
      return { maskShape: 'round', whiteMacroSrc: SHAPE_IMAGE_MAP.Round };
    case 'Oval':
    case 'Moval':
      return { maskShape: 'oval', whiteMacroSrc: SHAPE_IMAGE_MAP.Oval };
    case 'Cushion':
    case 'Antique Cushion':
    case 'Old Mine':
      return { maskShape: 'cushion', whiteMacroSrc: SHAPE_IMAGE_MAP.Cushion };
    case 'Emerald':
    case 'Octagon':
      return { maskShape: 'emerald', whiteMacroSrc: SHAPE_IMAGE_MAP.Emerald };
    case 'Pear':
      return { maskShape: 'pear', whiteMacroSrc: SHAPE_IMAGE_MAP.Pear };
    default:
      return null;
  }
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
      return {
        mode: 'tinted-macro',
        src: macroMatch.whiteMacroSrc,
        maskShape: macroMatch.maskShape,
        palette,
        label,
      };
    }
    return {
      mode: 'faceted-svg',
      src: SHAPE_IMAGE_MAP[diamond.shape] || SHAPE_IMAGE_MAP.Round,
      palette,
      label,
    };
  }

  const parsed = parseFancyColor(diamond.color);
  const colorKey = resolveCanonicalColorKey(diamond, parsed);
  const intensity = diamond.fancyIntensity || parsed.fancyIntensity || 'Fancy';
  const shadeText = parsed.isSpecificShade
    ? parsed.canonicalColor
    : diamond.colorFamily || diamond.color;
  const label = `Студийное фото · ${shapeLabel} · ${shadeText}`;

  // Use native colored macro photographs ONLY when BOTH shape AND color match natively!
  const nativeColorFilter = (() => {
    const parts: string[] = [];
    switch (intensity) {
      case 'Light':
        parts.push('saturate(0.62)', 'brightness(1.06)');
        break;
      case 'Fancy Light':
        parts.push('saturate(0.78)', 'brightness(1.03)');
        break;
      case 'Fancy Intense':
        parts.push('saturate(1.16)', 'contrast(1.04)');
        break;
      case 'Fancy Vivid':
        parts.push('saturate(1.30)', 'contrast(1.06)');
        break;
      case 'Fancy Deep':
        parts.push('saturate(1.14)', 'brightness(0.86)', 'contrast(1.08)');
        break;
      case 'Fancy Dark':
        parts.push('saturate(0.92)', 'brightness(0.74)', 'contrast(1.12)');
        break;
      default:
        break;
    }
    return parts.length > 0 ? parts.join(' ') : undefined;
  })();

  if (diamond.shape === 'Pear' && colorKey === 'pink') {
    return {
      mode: 'native-photo',
      src: FANCY_IMAGE_MAP.pink,
      filter: nativeColorFilter,
      palette,
      label,
    };
  }
  if (
    (diamond.shape === 'Oval' || diamond.shape === 'Moval') &&
    (colorKey === 'brown' || colorKey === 'cognac' || colorKey === 'champagne')
  ) {
    return {
      mode: 'native-photo',
      src: FANCY_IMAGE_MAP.cognac,
      filter:
        colorKey === 'champagne'
          ? 'saturate(0.75) brightness(1.08)'
          : nativeColorFilter,
      palette,
      label,
    };
  }
  if (
    (diamond.shape === 'Emerald' || diamond.shape === 'Octagon') &&
    colorKey === 'blue'
  ) {
    return {
      mode: 'native-photo',
      src: FANCY_IMAGE_MAP.blue,
      filter: nativeColorFilter,
      palette,
      label,
    };
  }
  if (diamond.shape === 'Radiant' && colorKey === 'yellow') {
    return {
      mode: 'native-photo',
      src: FANCY_IMAGE_MAP.yellow,
      filter: nativeColorFilter,
      palette,
      label,
    };
  }
  if (
    diamond.shape === 'Asscher' &&
    (colorKey === 'green' || colorKey === 'chameleon')
  ) {
    return {
      mode: 'native-photo',
      src: FANCY_IMAGE_MAP.green,
      filter:
        colorKey === 'chameleon'
          ? 'hue-rotate(-26deg) saturate(0.84) brightness(0.95)'
          : nativeColorFilter,
      palette,
      label,
    };
  }

  // For Round, Oval, Cushion, Emerald, Pear in ANY other color -> exact-shape white macro +
  // diamond-only optical glaze (zero color bleed onto the background stone pedestal!)
  if (macroMatch) {
    return {
      mode: 'tinted-macro',
      src: macroMatch.whiteMacroSrc,
      maskShape: macroMatch.maskShape,
      palette,
      label,
    };
  }

  // For Princess, Heart, Marquise, Radiant (non-yellow), Asscher (non-green), antique & specialty cuts ->
  // exact-shape studio-lit faceted gem rendering calibrated to exact color & intensity
  return {
    mode: 'faceted-svg',
    src: SHAPE_IMAGE_MAP[diamond.shape] || SHAPE_IMAGE_MAP.Round,
    palette,
    label,
  };
}
