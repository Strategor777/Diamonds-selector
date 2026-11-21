import {
  isStrictWhiteLetterGrade,
  parseFancyColor,
} from '../src/lib/fancyColorParser.ts';
import type { CertVerifyResponse } from '../src/lib/certVerifyTypes.ts';

const ALLOWED_LABS = new Set(['GIA', 'IGI', 'HRD', 'GRS', 'SSEF', 'GUBELIN']);

const ALLOWED_LAB_HOSTS = new Set([
  'www.gia.edu',
  'gia.edu',
  'www.igi.org',
  'igi.org',
  'api.igi.org',
  'my.hrdantwerp.com',
  'hrdantwerp.com',
  'www.hrdantwerp.com',
  'www.gemresearch.ch',
  'gemresearch.ch',
]);

const CERT_NUMBER_REGEX = /^[A-Za-z0-9-]{4,32}$/;
const SYNTHETIC_CERT_PREFIX = /^(XL|GS|MGR|DEMO|TEST|TMP)-/i;
const MAX_RESPONSE_BYTES = 512 * 1024;
const REQUEST_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_CACHE_ENTRIES = 2000;

interface CacheEntry {
  expiresAt: number;
  value: CertVerifyResponse;
}

const verificationCache = new Map<string, CacheEntry>();

function buildOfficialVerifyUrl(lab: string, certNumber: string): string {
  const encoded = encodeURIComponent(certNumber);
  if (lab === 'IGI') {
    return `https://www.igi.org/Verify-Your-Report/?r=${encoded}`;
  }
  if (lab === 'HRD') {
    return `https://my.hrdantwerp.com/?record_number=${encoded}`;
  }
  if (lab === 'GRS') {
    return `https://www.gemresearch.ch/verify/?report=${encoded}`;
  }
  return `https://www.gia.edu/report-check?reportno=${encoded}`;
}

function normalizeLabName(rawLab: string | undefined): string {
  const upper = (rawLab || 'GIA').trim().toUpperCase();
  if (upper.includes('IGI')) return 'IGI';
  if (upper.includes('HRD')) return 'HRD';
  if (upper.includes('GRS')) return 'GRS';
  if (upper.includes('SSEF')) return 'SSEF';
  if (upper.includes('GUBELIN')) return 'GUBELIN';
  if (upper.includes('GIA')) return 'GIA';
  return ALLOWED_LABS.has(upper) ? upper : 'GIA';
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_m, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) && code >= 32 && code <= 126
        ? String.fromCharCode(code)
        : ' ';
    });
}

function stripHtmlToText(html: string): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  const withBreaks = withoutScripts
    .replace(/<\/(tr|div|p|li|td|th|h[1-6]|dt|dd|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeHtmlEntities(withBreaks)
    .replace(/[ \t\r]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function looksLikeBotChallenge(status: number, body: string): boolean {
  if (status === 403 || status === 429 || status === 503) return true;
  const low = body.toLowerCase();
  return (
    low.includes('cf-browser-verification') ||
    low.includes('challenge-platform') ||
    low.includes('just a moment...') ||
    low.includes('g-recaptcha') ||
    low.includes('hcaptcha') ||
    low.includes('enable javascript and cookies') ||
    low.includes('access denied') ||
    low.includes('incapsula')
  );
}

interface FetchTextResult {
  ok: boolean;
  status: number;
  contentType: string;
  body: string;
  blocked: boolean;
}

async function fetchAllowlistedText(
  initialUrl: string,
  extraHeaders?: Record<string, string>
): Promise<FetchTextResult | null> {
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= 2; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(currentUrl);
    } catch {
      return null;
    }

    if (parsed.protocol !== 'https:' || !ALLOWED_LAB_HOSTS.has(parsed.hostname)) {
      return null;
    }

    let response: Response;
    try {
      response = await fetch(parsed.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Accept:
            'application/json, text/html, application/xhtml+xml;q=0.9, text/plain;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          ...(extraHeaders || {}),
        },
      });
    } catch {
      return null;
    }

    if (
      response.status >= 300 &&
      response.status < 400 &&
      response.headers.get('location')
    ) {
      const nextLoc = response.headers.get('location') || '';
      try {
        currentUrl = new URL(nextLoc, parsed).toString();
      } catch {
        return null;
      }
      continue;
    }

    const contentType = response.headers.get('content-type') || '';
    if (
      contentType.toLowerCase().includes('application/pdf') ||
      contentType.toLowerCase().startsWith('image/')
    ) {
      return {
        ok: response.ok,
        status: response.status,
        contentType,
        body: '',
        blocked: false,
      };
    }

    let text = '';
    try {
      const reader = response.body?.getReader();
      if (!reader) {
        text = (await response.text()).slice(0, MAX_RESPONSE_BYTES);
      } else {
        const chunks: Uint8Array[] = [];
        let total = 0;
        while (total < MAX_RESPONSE_BYTES) {
          const { done, value } = await reader.read();
          if (done || !value) break;
          const remaining = MAX_RESPONSE_BYTES - total;
          chunks.push(value.byteLength > remaining ? value.subarray(0, remaining) : value);
          total += Math.min(value.byteLength, remaining);
        }
        try {
          await reader.cancel();
        } catch {
          // ignore stream cancel errors
        }
        const merged = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          merged.set(chunk, offset);
          offset += chunk.byteLength;
        }
        text = new TextDecoder('utf-8', { fatal: false }).decode(merged);
      }
    } catch {
      return null;
    }

    return {
      ok: response.ok,
      status: response.status,
      contentType,
      body: text,
      blocked: looksLikeBotChallenge(response.status, text),
    };
  }

  return null;
}

interface ExtractedCertFields {
  rawColor?: string;
  extractedShape?: string;
  extractedCarat?: number;
  extractedClarity?: string;
  notFoundHint?: boolean;
}

function cleanColorCandidate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let cleaned = raw
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[:\-–—\s]+|[:\-–—.,;\s]+$/g, '')
    .trim();

  // Cut off trailing unrelated report labels if they got captured on the same line
  cleaned = cleaned
    .replace(
      /\b(clarity\s*grade|clarity|carat\s*weight|cut\s*grade|polish|symmetry|fluorescence|measurements|report\s*number|comments|origin|distribution)\b.*$/i,
      ''
    )
    .trim();

  if (!cleaned || cleaned.length > 64) return undefined;
  if (/^(n\/a|none|null|undefined|-|—|color|colour|grade)$/i.test(cleaned)) {
    return undefined;
  }

  // Must either be a strict white letter grade or contain a recognized GIA color/intensity word or trade code
  if (isStrictWhiteLetterGrade(cleaned)) {
    return cleaned.toUpperCase();
  }

  const parsed = parseFancyColor(cleaned);
  if (
    parsed.colorFamily !== 'Фантазийный' ||
    Boolean(parsed.fancyIntensity) ||
    Boolean(parsed.shortCode)
  ) {
    return cleaned;
  }

  return undefined;
}

function extractFieldsFromJsonObject(obj: unknown): ExtractedCertFields {
  const result: ExtractedCertFields = {};
  const visited = new Set<unknown>();

  const walk = (node: unknown, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 6 || visited.has(node)) return;
    visited.add(node);

    if (Array.isArray(node)) {
      for (const item of node) {
        walk(item, depth + 1);
      }
      return;
    }

    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const key = k.toLowerCase().replace(/[\s_-]+/g, '');
      if (typeof v === 'string' || typeof v === 'number') {
        const strVal = String(v).trim();
        if (
          !result.rawColor &&
          (key === 'color' ||
            key === 'colour' ||
            key === 'colorgrade' ||
            key === 'colourgrade' ||
            key === 'fancycolor' ||
            key === 'colordescription' ||
            key === 'finalcolor')
        ) {
          const candidate = cleanColorCandidate(strVal);
          if (candidate) result.rawColor = candidate;
        } else if (
          !result.extractedShape &&
          (key === 'shape' || key === 'shapeandcuttingstyle' || key === 'cutshape')
        ) {
          if (strVal.length > 1 && strVal.length < 48) {
            result.extractedShape = strVal;
          }
        } else if (
          !result.extractedClarity &&
          (key === 'clarity' || key === 'claritygrade')
        ) {
          if (/^(FL|IF|VVS1|VVS2|VS1|VS2|SI1|SI2|I1|I2)$/i.test(strVal)) {
            result.extractedClarity = strVal.toUpperCase();
          }
        } else if (
          result.extractedCarat === undefined &&
          (key === 'carat' || key === 'caratweight' || key === 'weight')
        ) {
          const num = parseFloat(strVal.replace(',', '.'));
          if (Number.isFinite(num) && num > 0.01 && num < 500) {
            result.extractedCarat = num;
          }
        }
      } else if (v && typeof v === 'object') {
        walk(v, depth + 1);
      }
    }
  };

  walk(obj, 0);
  return result;
}

function extractFieldsFromBody(body: string, contentType: string): ExtractedCertFields {
  const trimmed = body.trim();
  if (!trimmed) return {};

  // 1. Try JSON parsing first if JSON response or starts with { / [
  if (
    contentType.toLowerCase().includes('json') ||
    trimmed.startsWith('{') ||
    trimmed.startsWith('[')
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      const fromJson = extractFieldsFromJsonObject(parsed);
      if (fromJson.rawColor) return fromJson;
    } catch {
      // fall through to HTML/text parsing
    }
  }

  // 2. Try embedded JSON key patterns inside HTML scripts/payloads
  const embeddedJsonMatches = [
    /"(?:color_grade|colorGrade|ColorGrade|COLOR_GRADE|Color|COLOUR)"\s*:\s*"([^"]{1,64})"/i,
    /"(?:fancy_color|fancyColor|color_description|colorDescription)"\s*:\s*"([^"]{1,64})"/i,
  ];
  for (const re of embeddedJsonMatches) {
    const m = trimmed.match(re);
    if (m?.[1]) {
      const candidate = cleanColorCandidate(decodeHtmlEntities(m[1]));
      if (candidate) {
        return { rawColor: candidate };
      }
    }
  }

  // 3. Strip HTML to readable lines and extract labeled gemological values
  const plainText = stripHtmlToText(trimmed);
  const lowText = plainText.toLowerCase();

  if (
    lowText.includes('no report found') ||
    lowText.includes('report not found') ||
    lowText.includes('invalid report number') ||
    lowText.includes('no matching report')
  ) {
    return { notFoundHint: true };
  }

  const fields: ExtractedCertFields = {};

  const colorPatterns = [
    /(?:^|\n)\s*Colou?r\s+Grade\s*[:\-]?\s*\n?\s*([A-Za-z0-9\s,/+()-]{1,64})/i,
    /(?:^|\n)\s*Fancy\s+Colou?r\s*[:\-]?\s*\n?\s*([A-Za-z0-9\s,/+()-]{1,64})/i,
    /(?:^|\n)\s*Colou?r\s*[:\-]\s*([A-Za-z0-9\s,/+()-]{1,64})/i,
    /Colou?r\s+Grade\s*[:\-]\s*([A-Za-z0-9\s,/+()-]{1,64})/i,
  ];

  for (const re of colorPatterns) {
    const match = plainText.match(re);
    if (match?.[1]) {
      const firstLine = match[1].split('\n')[0];
      const candidate = cleanColorCandidate(firstLine);
      if (candidate) {
        fields.rawColor = candidate;
        break;
      }
    }
  }

  const clarityMatch = plainText.match(
    /Clarity(?:\s+Grade)?\s*[:\-]?\s*\n?\s*(FL|IF|VVS1|VVS2|VS1|VS2|SI1|SI2|I1|I2)\b/i
  );
  if (clarityMatch?.[1]) {
    fields.extractedClarity = clarityMatch[1].toUpperCase();
  }

  const caratMatch = plainText.match(
    /Carat\s+Weight\s*[:\-]?\s*\n?\s*(\d+(?:[.,]\d+)?)\s*(?:ct|carat)?/i
  );
  if (caratMatch?.[1]) {
    const ct = parseFloat(caratMatch[1].replace(',', '.'));
    if (Number.isFinite(ct) && ct > 0.01 && ct < 500) {
      fields.extractedCarat = ct;
    }
  }

  const shapeMatch = plainText.match(
    /Shape(?:\s+and\s+Cutting\s+Style)?\s*[:\-]?\s*\n?\s*([A-Za-z\s-]{3,36})/i
  );
  if (shapeMatch?.[1]) {
    fields.extractedShape = shapeMatch[1].split('\n')[0].trim();
  }

  return fields;
}

function buildVerifiedResponse(
  lab: string,
  certNumber: string,
  verifyUrl: string,
  extracted: ExtractedCertFields
): CertVerifyResponse {
  const rawColor = extracted.rawColor || '';
  const checkedAt = new Date().toISOString();

  if (isStrictWhiteLetterGrade(rawColor)) {
    const grade = rawColor.trim().toUpperCase();
    return {
      status: 'verified',
      lab,
      certNumber,
      verifyUrl,
      rawColor,
      normalizedColor: grade,
      colorFamily: 'Бесцветный (D–J)',
      isWhite: true,
      isSpecificShade: false,
      extractedShape: extracted.extractedShape,
      extractedCarat: extracted.extractedCarat,
      extractedClarity: extracted.extractedClarity,
      message: `Цвет «${grade}» подтверждён по сертификату ${lab} #${certNumber}.`,
      checkedAt,
    };
  }

  const parsed = parseFancyColor(rawColor);
  return {
    status: 'verified',
    lab,
    certNumber,
    verifyUrl,
    rawColor,
    normalizedColor: parsed.canonicalColor,
    colorFamily: parsed.colorFamily,
    fancyIntensity: parsed.fancyIntensity,
    fancyOvertone: parsed.fancyOvertone,
    shortCode: parsed.shortCode,
    isWhite: false,
    isSpecificShade: parsed.isSpecificShade,
    extractedShape: extracted.extractedShape,
    extractedCarat: extracted.extractedCarat,
    extractedClarity: extracted.extractedClarity,
    message: `Цвет «${parsed.canonicalColor}»${
      parsed.shortCode ? ` (${parsed.shortCode})` : ''
    } подтверждён по сертификату ${lab} #${certNumber}.`,
    checkedAt,
  };
}

function getCandidateEndpoints(lab: string, certNumber: string): string[] {
  const encoded = encodeURIComponent(certNumber);
  if (lab === 'IGI') {
    return [
      `https://api.igi.org/Report/GetReport?r=${encoded}`,
      `https://www.igi.org/Verify-Your-Report/?r=${encoded}`,
      `https://www.igi.org/verify-your-report/?r=${encoded}`,
    ];
  }
  if (lab === 'HRD') {
    return [
      `https://my.hrdantwerp.com/api/v1/certificate/${encoded}`,
      `https://my.hrdantwerp.com/?record_number=${encoded}`,
    ];
  }
  if (lab === 'GRS') {
    return [`https://www.gemresearch.ch/verify/?report=${encoded}`];
  }
  if (lab === 'GIA') {
    return [`https://www.gia.edu/report-check?reportno=${encoded}`];
  }
  return [];
}

function setCachedResult(key: string, value: CertVerifyResponse) {
  if (verificationCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = verificationCache.keys().next().value;
    if (oldestKey) verificationCache.delete(oldestKey);
  }
  verificationCache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value,
  });
}

export async function verifyLabCertificate(
  rawLab: string | undefined,
  rawCertNumber: string | undefined
): Promise<CertVerifyResponse> {
  const lab = normalizeLabName(rawLab);
  const certNumber = (rawCertNumber || '').trim();
  const verifyUrl = buildOfficialVerifyUrl(lab, certNumber);
  const checkedAt = new Date().toISOString();

  if (
    !certNumber ||
    !CERT_NUMBER_REGEX.test(certNumber) ||
    SYNTHETIC_CERT_PREFIX.test(certNumber)
  ) {
    return {
      status: 'invalid',
      lab,
      certNumber,
      verifyUrl,
      message:
        'Номер сертификата отсутствует или является внутренним кодом поставщика. Укажите официальный номер отчёта GIA / IGI / HRD.',
      checkedAt,
    };
  }

  const cacheKey = `${lab}:${certNumber.toUpperCase()}`;
  const cached = verificationCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const endpoints = getCandidateEndpoints(lab, certNumber);
  let sawBotChallenge = false;
  let sawNotFound = false;

  for (const endpoint of endpoints) {
    const fetched = await fetchAllowlistedText(endpoint);
    if (!fetched) continue;

    if (fetched.blocked) {
      sawBotChallenge = true;
      continue;
    }

    const extracted = extractFieldsFromBody(fetched.body, fetched.contentType);
    if (extracted.rawColor) {
      const verified = buildVerifiedResponse(lab, certNumber, verifyUrl, extracted);
      setCachedResult(cacheKey, verified);
      return verified;
    }

    if (extracted.notFoundHint) {
      sawNotFound = true;
    }
  }

  if (sawNotFound && !sawBotChallenge) {
    const notFoundResp: CertVerifyResponse = {
      status: 'not_found',
      lab,
      certNumber,
      verifyUrl,
      message: `Сертификат ${lab} #${certNumber} не найден в открытом реестре лаборатории. Проверьте номер на официальном сайте или укажите цвет из бланка вручную.`,
      checkedAt,
    };
    setCachedResult(cacheKey, notFoundResp);
    return notFoundResp;
  }

  const manualResp: CertVerifyResponse = {
    status: 'manual_required',
    lab,
    certNumber,
    verifyUrl,
    message: sawBotChallenge
      ? `Сайт ${lab} защищён проверкой браузера (CAPTCHA). Откройте официальный бланк по кнопке и подтвердите цвет из сертификата для автоподбора студийного фото.`
      : `Автоматический ответ ${lab} не содержит открытого текстового поля цвета. Откройте официальный бланк и укажите цвет из сертификата (например, FIP или Fancy Intense Pink).`,
    checkedAt,
  };
  setCachedResult(cacheKey, manualResp);
  return manualResp;
}
