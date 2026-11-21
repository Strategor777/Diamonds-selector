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
}

export async function verifyBatchCertificateColors(
  stones: Diamond[],
  options?: {
    onProgress?: (progress: BatchVerifyProgress) => void;
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

  const CHUNK_SIZE = 10;

  for (let i = 0; i < verifiable.length; i += CHUNK_SIZE) {
    if (options?.signal?.aborted) break;

    const chunk = verifiable.slice(i, i + CHUNK_SIZE);
    const uncached: Diamond[] = [];

    for (const stone of chunk) {
      const key = `${(stone.certLab || 'GIA').toUpperCase()}:${stone.certNumber.trim().toUpperCase()}`;
      const hit = clientVerifyCache.get(key);
      if (hit) {
        results.set(stone.id, hit);
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
        const res = await fetch('/api/cert-verify/batch', {
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
            completed += 1;
            if (item.status === 'verified') verifiedCount += 1;
            else if (item.status === 'not_found') notFoundCount += 1;
            else manualCount += 1;
          }
        } else {
          for (const stone of uncached) {
            const fallback: CertVerifyResponse = {
              status: 'manual_required',
              lab: stone.certLab || 'GIA',
              certNumber: stone.certNumber,
              verifyUrl: getCertVerifyUrl(stone.certLab, stone.certNumber),
              message: `Запрос проверки завершился со статусом ${res.status}.`,
              checkedAt: new Date().toISOString(),
            };
            results.set(stone.id, fallback);
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
          completed += 1;
          manualCount += 1;
        }
      }
    }

    options?.onProgress?.({
      completed,
      total,
      verifiedCount,
      manualCount,
      notFoundCount,
    });
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

export interface CalibratedStudioVisual {
  src: string;
  filter?: string;
  label: string;
}

/**
 * Selects the best studio base photograph and computes optical CSS color/intensity/overtone
 * calibration so the studio visual matches the diamond's verified color, shade, intensity & shape.
 */
export function getCalibratedStudioVisual(diamond: Diamond): CalibratedStudioVisual {
  const isFancy =
    diamond.directory === 'fancy' ||
    Boolean(diamond.isFancyColor) ||
    (Boolean(diamond.colorFamily) && diamond.colorFamily !== 'Бесцветный (D–J)');

  const shapeLabel = SHAPE_SHORT_RU[diamond.shape] || diamond.shape;

  // White / Near-colorless (D–J) studio photo calibrated by shape & letter grade warmth
  if (!isFancy) {
    const src = SHAPE_IMAGE_MAP[diamond.shape] || SHAPE_IMAGE_MAP.Round;
    const grade = (diamond.color || 'D').trim().toUpperCase().charAt(0);
    let filter: string | undefined;
    if (grade === 'D' || grade === 'E') {
      filter = 'brightness(1.03) contrast(1.02)';
    } else if (grade === 'H') {
      filter = 'sepia(0.05) saturate(1.04)';
    } else if (grade === 'I') {
      filter = 'sepia(0.11) saturate(1.08)';
    } else if (grade >= 'J' && grade <= 'Z') {
      filter = 'sepia(0.18) saturate(1.16) brightness(0.99)';
    }

    return {
      src,
      filter,
      label: `Студийное фото · ${shapeLabel} · ${diamond.color}`,
    };
  }

  // Colored / Fancy diamonds: pick optimal base photo + calibrate hue, overtone & intensity
  const parsed = parseFancyColor(diamond.color);
  const family = (diamond.colorFamily || parsed.colorFamily || '').toLowerCase();
  const hay = `${diamond.color} ${diamond.colorFamily || ''} ${diamond.fancyOvertone || ''}`.toLowerCase();
  const intensity = diamond.fancyIntensity || parsed.fancyIntensity || 'Fancy';

  let src: string = FANCY_IMAGE_MAP.yellow;
  let hueDeg = 0;
  let sat = 1.0;
  let bright = 1.0;
  let contrast = 1.0;

  if (family.includes('чёрн') || family.includes('черн') || hay.includes('black')) {
    src = SHAPE_IMAGE_MAP[diamond.shape] || SHAPE_IMAGE_MAP.Round;
    sat = 0.06;
    bright = 0.36;
    contrast = 1.48;
  } else if (family.includes('сер') || hay.includes('gray') || hay.includes('grey')) {
    src = SHAPE_IMAGE_MAP[diamond.shape] || SHAPE_IMAGE_MAP.Round;
    sat = 0.16;
    bright = 0.86;
    contrast = 1.08;
  } else if (family.includes('красн') || hay.includes(' red')) {
    src = FANCY_IMAGE_MAP.pink;
    hueDeg = 14;
    sat = 1.55;
    bright = 0.84;
    contrast = 1.12;
  } else if (family.includes('фиолет') || hay.includes('purple') || hay.includes('violet')) {
    src = FANCY_IMAGE_MAP.pink;
    hueDeg = -52;
    sat = 1.18;
    bright = 0.94;
    contrast = 1.05;
  } else if (family.includes('оранж') || hay.includes('orange')) {
    src = FANCY_IMAGE_MAP.cognac;
    hueDeg = -10;
    sat = 1.52;
    bright = 1.05;
    contrast = 1.04;
  } else if (family.includes('розов') || hay.includes('pink')) {
    src = FANCY_IMAGE_MAP.pink;
    if (hay.includes('purplish') || hay.includes('пурпур')) {
      hueDeg -= 22;
      sat *= 1.06;
    } else if (hay.includes('orangy') || hay.includes('оранж')) {
      hueDeg += 18;
      sat *= 1.08;
    } else if (hay.includes('brownish') || hay.includes('корич')) {
      hueDeg += 8;
      sat *= 0.82;
      bright *= 0.92;
    }
  } else if (family.includes('син') || family.includes('голуб') || hay.includes('blue')) {
    src = FANCY_IMAGE_MAP.blue;
    if (hay.includes('greenish') || hay.includes('зелен')) {
      hueDeg -= 22;
    } else if (hay.includes('grayish') || hay.includes('сер')) {
      sat *= 0.62;
      bright *= 0.95;
    } else if (hay.includes('violetish') || hay.includes('фиолет')) {
      hueDeg += 18;
    }
  } else if (family.includes('хамелеон') || hay.includes('chameleon')) {
    src = FANCY_IMAGE_MAP.green;
    hueDeg = -28;
    sat = 0.84;
    bright = 0.95;
    contrast = 1.06;
  } else if (family.includes('зел') || hay.includes('green')) {
    src = FANCY_IMAGE_MAP.green;
    if (hay.includes('bluish') || hay.includes('голуб')) {
      hueDeg += 26;
    } else if (hay.includes('yellowish') || hay.includes('желт')) {
      hueDeg -= 24;
    } else if (hay.includes('grayish') || hay.includes('сер')) {
      sat *= 0.68;
    }
  } else if (family.includes('корич') || hay.includes('brown')) {
    src = FANCY_IMAGE_MAP.cognac;
    sat = 0.86;
    bright = 0.86;
    contrast = 1.08;
    if (hay.includes('pinkish') || hay.includes('розов')) {
      hueDeg -= 18;
      sat *= 1.06;
    } else if (hay.includes('yellowish') || hay.includes('желт')) {
      hueDeg += 12;
    }
  } else if (
    family.includes('коньяч') ||
    family.includes('шампан') ||
    hay.includes('cognac') ||
    hay.includes('champagne')
  ) {
    src = FANCY_IMAGE_MAP.cognac;
    if (hay.includes('champagne') || hay.includes('шампан')) {
      sat *= 0.78;
      bright *= 1.08;
    }
  } else if (family.includes('жёлт') || family.includes('желт') || hay.includes('yellow')) {
    src = FANCY_IMAGE_MAP.yellow;
    if (hay.includes('orangy') || hay.includes('оранж')) {
      hueDeg -= 14;
      sat *= 1.12;
    } else if (hay.includes('greenish') || hay.includes('зелен')) {
      hueDeg += 16;
    } else if (hay.includes('brownish') || hay.includes('корич')) {
      hueDeg -= 10;
      sat *= 0.82;
      bright *= 0.9;
    }
  } else {
    src = SHAPE_IMAGE_MAP[diamond.shape] || FANCY_IMAGE_MAP.yellow;
  }

  // Apply intensity calibration (skip for black/gray where value is already calibrated)
  const isAchromatic =
    family.includes('чёрн') ||
    family.includes('черн') ||
    family.includes('сер') ||
    hay.includes('black') ||
    hay.includes('gray') ||
    hay.includes('grey');

  if (!isAchromatic) {
    switch (intensity) {
      case 'Light':
        sat *= 0.56;
        bright *= 1.07;
        break;
      case 'Fancy Light':
        sat *= 0.74;
        bright *= 1.04;
        break;
      case 'Fancy Intense':
        sat *= 1.18;
        contrast *= 1.04;
        break;
      case 'Fancy Vivid':
        sat *= 1.36;
        contrast *= 1.06;
        break;
      case 'Fancy Deep':
        sat *= 1.16;
        bright *= 0.85;
        contrast *= 1.08;
        break;
      case 'Fancy Dark':
        sat *= 0.92;
        bright *= 0.72;
        contrast *= 1.14;
        break;
      default:
        break;
    }
  }

  const filterParts: string[] = [];
  if (Math.abs(hueDeg) >= 1) filterParts.push(`hue-rotate(${Math.round(hueDeg)}deg)`);
  if (Math.abs(sat - 1) >= 0.02) filterParts.push(`saturate(${sat.toFixed(2)})`);
  if (Math.abs(bright - 1) >= 0.02) filterParts.push(`brightness(${bright.toFixed(2)})`);
  if (Math.abs(contrast - 1) >= 0.02) filterParts.push(`contrast(${contrast.toFixed(2)})`);

  const shadeText = parsed.isSpecificShade
    ? parsed.canonicalColor
    : diamond.colorFamily || diamond.color;

  return {
    src,
    filter: filterParts.length > 0 ? filterParts.join(' ') : undefined,
    label: `Студийное фото · ${shadeText}`,
  };
}
