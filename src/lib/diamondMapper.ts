import {
  ALL_CLARITIES,
  ALL_COLORS,
  ALL_SHAPES,
  DEFAULT_PRICING_CONFIG,
  SHAPE_IMAGE_MAP,
  calculateClientPrice,
  extractFancyIntensity,
  extractFancyOvertone,
  getCertVerifyUrl,
  getFancyDiamondImage,
} from '../data/diamonds';
import {
  CertLab,
  Diamond,
  DiamondClarity,
  DiamondColor,
  DiamondShape,
  PriceCurrency,
  PricingConfig,
} from '../types/diamond';

export interface ColumnMapping {
  sku: number;
  stoneType: number;
  shape: number;
  carat: number;
  color: number;
  fancyColor: number;
  clarity: number;
  cut: number;
  polish: number;
  symmetry: number;
  fluorescence: number;
  priceUsd: number;
  pricePerCarat: number;
  previousPriceUsd: number;
  certLab: number;
  certNumber: number;
  certUrl: number;
  measurements: number;
  lengthMm: number;
  widthMm: number;
  depthMm: number;
  depthPercent: number;
  tablePercent: number;
  imageUrl: number;
  videoUrl: number;
  origin: number;
}

export type DetectionReason = 'header' | 'content' | 'none';

export interface ColumnAnalysisMeta {
  mapping: ColumnMapping;
  reasons: Record<keyof ColumnMapping, DetectionReason>;
  samples: Record<keyof ColumnMapping, string>;
}

export const MAPPING_FIELDS: {
  key: keyof ColumnMapping;
  label: string;
  required?: boolean;
}[] = [
  { key: 'stoneType', label: 'Камень / Разновидность' },
  { key: 'shape', label: 'Форма (Shape)', required: true },
  { key: 'carat', label: 'Караты (Carat)', required: true },
  { key: 'color', label: 'Цвет (Color / Оттенок)' },
  { key: 'fancyColor', label: 'Фантазийный оттенок / Интенсивность' },
  { key: 'clarity', label: 'Чистота (Clarity)' },
  { key: 'priceUsd', label: 'Цена итоговая' },
  { key: 'pricePerCarat', label: 'Цена за карат (/ct)' },
  { key: 'sku', label: 'Артикул / SKU' },
  { key: 'certLab', label: 'Лаборатория (GIA/IGI/GRS/SSEF)' },
  { key: 'certNumber', label: 'Номер сертификата' },
  { key: 'certUrl', label: 'Ссылка на сертификат' },
  { key: 'measurements', label: 'Размеры строкой (Д×Ш×В мм)' },
  { key: 'lengthMm', label: 'Длина (мм)' },
  { key: 'widthMm', label: 'Ширина (мм)' },
  { key: 'depthMm', label: 'Высота (мм)' },
  { key: 'cut', label: 'Огранка (Cut)' },
  { key: 'polish', label: 'Полировка (Polish)' },
  { key: 'symmetry', label: 'Симметрия (Symmetry)' },
  { key: 'fluorescence', label: 'Флуоресценция' },
  { key: 'depthPercent', label: 'Глубина (%)' },
  { key: 'tablePercent', label: 'Площадка (%)' },
  { key: 'imageUrl', label: 'Фото (URL)' },
  { key: 'videoUrl', label: 'Видео 360° (URL)' },
  { key: 'origin', label: 'Происхождение / Месторождение' },
];

const HEADER_RULES: Record<
  keyof ColumnMapping,
  { exact: string[]; partial: string[]; exclude?: string[] }
> = {
  sku: {
    exact: ['sku', 'stock', 'stock #', 'stock_id', 'stockno', 'lot', 'lot #', 'артикул', 'код', 'id'],
    partial: ['sku', 'stock', 'артикул', 'лот'],
  },
  stoneType: {
    exact: [
      'stone',
      'gem',
      'gemstone',
      'mineral',
      'variety',
      'species',
      'камень',
      'тип камня',
      'минерал',
      'разновидность',
      'порода',
      'вставка',
    ],
    partial: ['stone', 'gem', 'mineral', 'variety', 'камен', 'минерал', 'разновид', 'вставк'],
  },
  shape: {
    exact: ['shape', 'shp', 'форма', 'огранка', 'шейп'],
    partial: ['shape', 'форма', 'шейп', 'cut_shape'],
  },
  carat: {
    exact: ['carat', 'carats', 'weight', 'wt', 'ct', 'cts', 'карат', 'вес', 'масса'],
    partial: ['carat', 'карат', 'вес'],
    exclude: ['price', 'цена', 'per', '/ct', 'за карат'],
  },
  color: {
    exact: ['color', 'col', 'colour', 'цвет', 'окраска'],
    partial: ['color', 'colour', 'цвет', 'окраск'],
    exclude: ['fancy', 'intensity', 'интенсив', 'comment'],
  },
  fancyColor: {
    exact: [
      'fancy',
      'fancy color',
      'hue',
      'shade',
      'intensity',
      'оттенок',
      'интенсивность',
      'цветность',
      'фантазийный цвет',
    ],
    partial: ['fancy', 'hue', 'intensity', 'оттен', 'интенсив'],
  },
  clarity: {
    exact: ['clarity', 'clar', 'чистота', 'прозрачность'],
    partial: ['clarity', 'чистот', 'прозрач'],
  },
  cut: {
    exact: ['cut', 'cut grade', 'make', 'качество огранки'],
    partial: ['cut grade', 'качество огранк'],
    exclude: ['culet', 'калет'],
  },
  polish: {
    exact: ['polish', 'pol', 'полировка'],
    partial: ['polish', 'полиров'],
  },
  symmetry: {
    exact: ['symmetry', 'sym', 'симметрия', 'симм'],
    partial: ['symmet', 'симметр'],
  },
  fluorescence: {
    exact: ['fluorescence', 'fluor', 'fl', 'flo', 'флуоресценция', 'флюор'],
    partial: ['fluor', 'флуор', 'флюор'],
  },
  priceUsd: {
    exact: [
      'price',
      'price_usd',
      'total price',
      'total',
      'total $',
      'amount',
      'цена',
      'стоимость',
      'цена $',
      'цена руб',
      'цена ₽',
    ],
    partial: ['total price', 'price_usd', 'total $', 'итогов', 'стоимост', 'цена'],
    exclude: ['per', '/ct', 'за карат', 'previous', 'old', 'старая', 'rap'],
  },
  pricePerCarat: {
    exact: ['price/ct', 'price per carat', 'ppc', '$/ct', 'цена за карат', 'цена/ct'],
    partial: ['per carat', '/ct', 'за карат', 'ppc'],
  },
  previousPriceUsd: {
    exact: ['previous_price_usd', 'previous price', 'old price', 'старая цена'],
    partial: ['previous', 'old_price', 'старая цена'],
  },
  certLab: {
    exact: ['lab', 'cert_lab', 'certlab', 'лаборатория', 'лаб'],
    partial: ['lab', 'лаборатор'],
  },
  certNumber: {
    exact: [
      'cert_number',
      'certnumber',
      'cert #',
      'cert no',
      'report #',
      'report no',
      'report',
      'certificate',
      'номер сертификата',
      'сертификат',
    ],
    partial: ['cert_num', 'certnumber', 'report', 'номер сертиф', 'сертиф'],
    exclude: ['url', 'link', 'ссылк'],
  },
  certUrl: {
    exact: ['cert_url', 'certurl', 'report url', 'certificate url', 'cert link', 'ссылка на сертификат'],
    partial: ['cert_url', 'certurl', 'report_url', 'cert link', 'ссылка на сертиф'],
  },
  measurements: {
    exact: ['measurements', 'meas', 'dimensions', 'size', 'размеры', 'размер', 'габариты'],
    partial: ['measure', 'dimension', 'размер', 'габарит'],
  },
  lengthMm: {
    exact: ['length', 'length_mm', 'l', 'длина', 'длина мм'],
    partial: ['length', 'длина'],
  },
  widthMm: {
    exact: ['width', 'width_mm', 'w', 'ширина', 'ширина мм'],
    partial: ['width', 'ширина'],
  },
  depthMm: {
    exact: ['depth_mm', 'height', 'h', 'высота', 'высота мм'],
    partial: ['depth_mm', 'высота'],
  },
  depthPercent: {
    exact: ['depth%', 'depth %', 'depth_pct', 'td', 'глубина %'],
    partial: ['depth%', 'depth %', 'глубина %'],
  },
  tablePercent: {
    exact: ['table%', 'table %', 'table_pct', 'tb', 'площадка %', 'площадка'],
    partial: ['table', 'площадк'],
  },
  imageUrl: {
    exact: ['image', 'image_url', 'imagelink', 'image link', 'photo', 'photo_url', 'фото'],
    partial: ['image', 'photo', 'фото'],
  },
  videoUrl: {
    exact: [
      'video',
      'video_url',
      'videolink',
      'video link',
      '360',
      'v360',
      'видео',
      'ссылка на видео',
    ],
    partial: ['video', 'видео', '360', 'loupe', 'mp4', 'ролик'],
  },
  origin: {
    exact: ['origin', 'city', 'location', 'country', 'происхождение', 'город', 'страна', 'месторождение'],
    partial: ['origin', 'происхожд', 'город', 'месторожд', 'стран'],
  },
};

function matchHeaderRule(
  normHeaders: string[],
  rule: { exact: string[]; partial: string[]; exclude?: string[] }
): number {
  const isExcluded = (h: string) =>
    rule.exclude?.some((ex) => h.includes(ex)) ?? false;

  const exactIdx = normHeaders.findIndex(
    (h) => !isExcluded(h) && rule.exact.includes(h)
  );
  if (exactIdx >= 0) return exactIdx;

  return normHeaders.findIndex(
    (h) => !isExcluded(h) && rule.partial.some((p) => h.includes(p))
  );
}

export function detectHeaderRowIndex(rows: string[][]): number {
  const limit = Math.min(rows.length, 15);
  let bestIdx = 0;
  let bestScore = -1;

  const allHeaderKeywords = new Set<string>();
  Object.values(HEADER_RULES).forEach((rule) => {
    rule.exact.forEach((k) => allHeaderKeywords.add(k));
    rule.partial.forEach((k) => allHeaderKeywords.add(k));
  });

  for (let r = 0; r < limit; r++) {
    const row = rows[r];
    if (!row) continue;
    const nonEmpty = row.map((c) => c.trim()).filter(Boolean);
    if (nonEmpty.length < 2) continue;

    let keywordHits = 0;
    for (const cellText of nonEmpty) {
      const low = cellText.toLowerCase();
      if (low.length > 45) continue;
      for (const kw of allHeaderKeywords) {
        if (low === kw || (kw.length >= 3 && low.includes(kw))) {
          keywordHits++;
          break;
        }
      }
    }

    const numericCount = nonEmpty.filter((c) => /^\d+([.,]\d+)?$/.test(c)).length;
    const score = keywordHits * 10 + nonEmpty.length - numericCount * 3;

    if (score > bestScore) {
      bestScore = score;
      bestIdx = r;
    }
  }

  return bestIdx;
}

const SHAPE_TOKENS = new Set([
  'round', 'rb', 'br', 'круг', 'кр',
  'oval', 'ov', 'овал', 'ов',
  'emerald', 'em', 'изумруд',
  'princess', 'pr', 'принцесса',
  'cushion', 'cu', 'кушон',
  'pear', 'pe', 'ps', 'груша',
  'radiant', 'ra', 'rad', 'радиант',
  'marquise', 'mq', 'mar', 'маркиз',
  'heart', 'hs', 'сердце',
  'asscher', 'as', 'ашер',
  'trilliant', 'trillion', 'tr', 'триллион', 'треугольник',
  'baguette', 'bg', 'багет',
  'octagon', 'oc', 'октагон',
  'cabochon', 'cb', 'кабошон',
]);

const CLARITY_TOKENS = new Set([
  'FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'VVS', 'VS', 'SI',
  'EYE CLEAN', 'LOUPE CLEAN', 'EC', 'LC',
]);
const COLOR_TOKENS = new Set(['D', 'E', 'F', 'G', 'H', 'I', 'J']);
const COLORED_HUE_WORDS = [
  'yellow', 'pink', 'blue', 'green', 'red', 'purple', 'violet', 'orange',
  'champagne', 'brown', 'cognac', 'black', 'fancy',
  'жёлт', 'желт', 'розов', 'син', 'голуб', 'зел', 'красн', 'фиолет', 'оранж',
  'шампан', 'коньяч', 'корич', 'чёрн', 'черн', 'фантаз',
];
const LAB_TOKENS = new Set(['GIA', 'IGI', 'HRD', 'GRS', 'SSEF', 'GUBELIN', 'AIG', 'МГУ']);

function inferColumnsFromContent(
  rows: string[][],
  headerRowIndex: number,
  mapping: ColumnMapping,
  reasons: Record<keyof ColumnMapping, DetectionReason>
): void {
  const headerLen = rows[headerRowIndex]?.length ?? 0;
  const sampleEnd = Math.min(rows.length, headerRowIndex + 16);
  const usedCols = new Set(
    Object.values(mapping).filter((idx) => idx >= 0)
  );

  for (let col = 0; col < headerLen; col++) {
    if (usedCols.has(col)) continue;

    const vals: string[] = [];
    for (let r = headerRowIndex + 1; r < sampleEnd; r++) {
      const v = rows[r]?.[col]?.trim();
      if (v) vals.push(v);
    }
    if (vals.length === 0) continue;

    const ratio = (pred: (v: string) => boolean) =>
      vals.filter(pred).length / vals.length;

    if (
      mapping.shape < 0 &&
      ratio((v) => SHAPE_TOKENS.has(v.toLowerCase())) >= 0.5
    ) {
      mapping.shape = col;
      reasons.shape = 'content';
      usedCols.add(col);
      continue;
    }

    if (
      mapping.clarity < 0 &&
      ratio((v) => CLARITY_TOKENS.has(v.toUpperCase().replace(/\s+/g, ' '))) >= 0.5
    ) {
      mapping.clarity = col;
      reasons.clarity = 'content';
      usedCols.add(col);
      continue;
    }

    if (
      mapping.color < 0 &&
      (ratio((v) => COLOR_TOKENS.has(v.toUpperCase())) >= 0.5 ||
        ratio((v) => COLORED_HUE_WORDS.some((w) => v.toLowerCase().includes(w))) >= 0.5)
    ) {
      mapping.color = col;
      reasons.color = 'content';
      usedCols.add(col);
      continue;
    }

    if (
      mapping.certLab < 0 &&
      ratio((v) => LAB_TOKENS.has(v.toUpperCase())) >= 0.5
    ) {
      mapping.certLab = col;
      reasons.certLab = 'content';
      usedCols.add(col);
      continue;
    }

    if (
      mapping.measurements < 0 &&
      ratio((v) => /\d+(\.\d+)?\s*[-x×*]\s*\d+(\.\d+)?/i.test(v)) >= 0.5
    ) {
      mapping.measurements = col;
      reasons.measurements = 'content';
      usedCols.add(col);
      continue;
    }

    if (
      mapping.videoUrl < 0 &&
      ratio((v) =>
        /^https?:\/\/.*(360|video|mp4|webm|loupe|vision|sarine)/i.test(v)
      ) >= 0.4
    ) {
      mapping.videoUrl = col;
      reasons.videoUrl = 'content';
      usedCols.add(col);
      continue;
    }

    if (
      mapping.certUrl < 0 &&
      ratio((v) =>
        /^https?:\/\/.*(gia\.edu|igi\.org|hrd|gemresearch|report|cert)/i.test(v)
      ) >= 0.4
    ) {
      mapping.certUrl = col;
      reasons.certUrl = 'content';
      usedCols.add(col);
      continue;
    }

    if (
      mapping.imageUrl < 0 &&
      ratio((v) =>
        /^https?:\/\/.*\.(jpg|jpeg|png|webp)|image|photo/i.test(v)
      ) >= 0.4
    ) {
      mapping.imageUrl = col;
      reasons.imageUrl = 'content';
      usedCols.add(col);
      continue;
    }

    if (
      mapping.carat < 0 &&
      ratio((v) => {
        const n = parseFloat(v.replace(',', '.'));
        return Number.isFinite(n) && n >= 0.1 && n <= 50 && /[.,]/.test(v);
      }) >= 0.65
    ) {
      mapping.carat = col;
      reasons.carat = 'content';
      usedCols.add(col);
      continue;
    }
  }
}

export function analyzeColumns(
  rows: string[][],
  headerRowIndex = 0
): ColumnAnalysisMeta {
  const headers = rows[headerRowIndex] || [];
  const normHeaders = headers.map((h) => h.trim().toLowerCase());

  const mapping = {} as ColumnMapping;
  const reasons = {} as Record<keyof ColumnMapping, DetectionReason>;
  const samples = {} as Record<keyof ColumnMapping, string>;

  for (const field of MAPPING_FIELDS) {
    const idx = matchHeaderRule(normHeaders, HEADER_RULES[field.key]);
    mapping[field.key] = idx;
    reasons[field.key] = idx >= 0 ? 'header' : 'none';
  }
  mapping.previousPriceUsd = matchHeaderRule(
    normHeaders,
    HEADER_RULES.previousPriceUsd
  );
  reasons.previousPriceUsd = mapping.previousPriceUsd >= 0 ? 'header' : 'none';

  inferColumnsFromContent(rows, headerRowIndex, mapping, reasons);

  const sampleRow = rows[headerRowIndex + 1] || [];
  (Object.keys(mapping) as (keyof ColumnMapping)[]).forEach((key) => {
    const col = mapping[key];
    samples[key] = col >= 0 ? (sampleRow[col] || '').trim() : '';
  });

  return { mapping, reasons, samples };
}

export function autoDetectColumns(headers: string[]): ColumnMapping {
  return analyzeColumns([headers], 0).mapping;
}

export function normalizeShape(val: string | undefined): DiamondShape {
  if (!val) return 'Round';
  const v = val.trim().toLowerCase();
  const map: Record<string, DiamondShape> = {
    round: 'Round',
    rb: 'Round',
    br: 'Round',
    'round brilliant': 'Round',
    круг: 'Round',
    кр: 'Round',
    'кр-57': 'Round',
    'кр57': 'Round',
    oval: 'Oval',
    ov: 'Oval',
    овал: 'Oval',
    ов: 'Oval',
    emerald: 'Emerald',
    em: 'Emerald',
    изумруд: 'Emerald',
    из: 'Emerald',
    princess: 'Princess',
    pr: 'Princess',
    принцесса: 'Princess',
    пр: 'Princess',
    cushion: 'Cushion',
    cu: 'Cushion',
    кушон: 'Cushion',
    pear: 'Pear',
    pe: 'Pear',
    ps: 'Pear',
    груша: 'Pear',
    гр: 'Pear',
    radiant: 'Radiant',
    ra: 'Radiant',
    rad: 'Radiant',
    радиант: 'Radiant',
    marquise: 'Marquise',
    mq: 'Marquise',
    mar: 'Marquise',
    маркиз: 'Marquise',
    heart: 'Heart',
    hs: 'Heart',
    сердце: 'Heart',
    asscher: 'Asscher',
    as: 'Asscher',
    ашер: 'Asscher',
    ашшер: 'Asscher',
    trilliant: 'Trilliant',
    trillion: 'Trilliant',
    triangle: 'Trilliant',
    tr: 'Trilliant',
    триллион: 'Trilliant',
    треугольник: 'Trilliant',
    baguette: 'Baguette',
    bg: 'Baguette',
    багет: 'Baguette',
    octagon: 'Octagon',
    oc: 'Octagon',
    октагон: 'Octagon',
    cabochon: 'Cabochon',
    cb: 'Cabochon',
    кабошон: 'Cabochon',
  };
  if (map[v]) return map[v];
  const found = ALL_SHAPES.find((s) => v.includes(s.toLowerCase()));
  if (found) return found;
  if (v.includes('круг')) return 'Round';
  if (v.includes('овал')) return 'Oval';
  if (v.includes('изумр')) return 'Emerald';
  if (v.includes('принц')) return 'Princess';
  if (v.includes('кушон')) return 'Cushion';
  if (v.includes('груш')) return 'Pear';
  if (v.includes('радиант')) return 'Radiant';
  if (v.includes('маркиз')) return 'Marquise';
  if (v.includes('серд')) return 'Heart';
  if (v.includes('ашер')) return 'Asscher';
  if (v.includes('трил') || v.includes('треуг')) return 'Trilliant';
  if (v.includes('багет')) return 'Baguette';
  if (v.includes('октаг')) return 'Octagon';
  if (v.includes('кабош')) return 'Cabochon';
  return 'Round';
}

export function classifyColorFamily(colorText: string): string {
  const upper = colorText.trim().toUpperCase();
  if (ALL_COLORS.includes(upper as any)) {
    return 'Бесцветный (D–J)';
  }
  const low = colorText.trim().toLowerCase();
  if (low.includes('хамелеон') || low.includes('chameleon')) {
    return 'Хамелеон';
  }
  if (low.includes('жёлт') || low.includes('желт') || low.includes('yellow') || low.includes('canary') || low.includes('lemon')) {
    return 'Жёлтый';
  }
  if (low.includes('розов') || low.includes('pink') || low.includes('rose')) {
    return 'Розовый';
  }
  if (low.includes('красн') || low.includes('рубин') || low.includes('red') || low.includes('ruby') || low.includes('pigeon')) {
    return 'Красный';
  }
  if (low.includes('син') || low.includes('голуб') || low.includes('сапфир') || low.includes('blue') || low.includes('aqua') || low.includes('cornflower') || low.includes('royal')) {
    return 'Синий / Голубой';
  }
  if (low.includes('зел') || low.includes('изумруд') || low.includes('green') || low.includes('mint')) {
    return 'Зелёный';
  }
  if (low.includes('оранж') || low.includes('orange') || low.includes('padparadscha')) {
    return 'Оранжевый';
  }
  if (low.includes('фиолет') || low.includes('пурпур') || low.includes('сирен') || low.includes('purple') || low.includes('violet') || low.includes('lavender')) {
    return 'Фиолетовый';
  }
  if (low.includes('корич') || low.includes('brown')) {
    return 'Коричневый';
  }
  if (low.includes('коньяч') || low.includes('шампан') || low.includes('champagne') || low.includes('cognac')) {
    return 'Коньячный / Шампань';
  }
  if (low.includes('чёрн') || low.includes('черн') || low.includes('black')) {
    return 'Чёрный';
  }
  if (low.includes('сер') || low.includes('gray') || low.includes('grey')) {
    return 'Серый';
  }
  if (low.includes('бел') || low.includes('бесцв') || low.includes('white') || low.includes('colorless')) {
    return 'Бесцветный (D–J)';
  }
  return 'Фантазийный';
}

const FANCY_HUE_PATTERN =
  /\b(fancy|faint|very\s+light|light|intense|vivid|deep|dark|yellow|pink|blue|green|red|orange|purple|violet|brown|champagne|cognac|black|gray|grey|olive|teal|canary|rose|peach|chameleon)\b|жёлт|желт|розов|голуб|син|зел|красн|оранж|фиолет|пурпур|корич|коньяч|шампан|чёрн|черн|сер|хамелеон|фантаз/i;

/**
 * Returns true if the color string represents a standard white/near-colorless
 * GIA letter grade (D, E, F, G, H, I, J, K, L, M, ... including ranges like D-E, F+, G/H)
 * without any fancy/colored hue modifiers.
 */
export function isWhiteDiamondColorGrade(rawColor: string | undefined): boolean {
  const cleaned = (rawColor || '').trim();
  if (!cleaned) return false;
  if (FANCY_HUE_PATTERN.test(cleaned)) return false;

  const upper = cleaned.toUpperCase();
  // Exact single GIA letter grade D..Z or with +/- modifier or range D-E, F/G
  if (/^[D-Z]([+-])?(\s*[-/]\s*[D-Z]([+-])?)?$/.test(upper)) {
    return true;
  }
  // Common textual equivalents without fancy hue words
  if (/^(COLORLESS|NEAR\s*COLORLESS|WHITE|БЕСЦВЕТН\S*|БЕЛЫЙ|БЕЛ\.?)$/i.test(cleaned)) {
    return true;
  }
  return false;
}

export function normalizeColoredStoneColor(
  rawColor: string | undefined,
  rawFancy: string | undefined
): { color: DiamondColor; colorFamily: string; isWhiteLetterGrade: boolean } {
  const c = (rawColor || '').trim();
  const f = (rawFancy || '').trim();

  if (!c && !f) {
    return { color: 'G', colorFamily: 'Бесцветный (D–J)', isWhiteLetterGrade: true };
  }

  // If the primary color column specifies a white diamond letter grade (D, E, F, ...)
  // and there is no fancy colored hue in the fancy column, always route to White Diamonds.
  if (c && isWhiteDiamondColorGrade(c) && (!f || isWhiteDiamondColorGrade(f))) {
    const upper = c.toUpperCase();
    const letterMatch = upper.match(/^([D-Z])/);
    const normalized = letterMatch ? letterMatch[1] : upper;
    return {
      color: normalized,
      colorFamily: 'Бесцветный (D–J)',
      isWhiteLetterGrade: true,
    };
  }

  const combined =
    f && c && !c.toLowerCase().includes(f.toLowerCase()) ? `${f} ${c}` : c || f;

  if (isWhiteDiamondColorGrade(combined)) {
    const upper = combined.toUpperCase();
    const letterMatch = upper.match(/^([D-Z])/);
    return {
      color: letterMatch ? letterMatch[1] : upper,
      colorFamily: 'Бесцветный (D–J)',
      isWhiteLetterGrade: true,
    };
  }

  // Otherwise preserve the rich colored stone hue / fancy description
  return {
    color: combined,
    colorFamily: classifyColorFamily(combined),
    isWhiteLetterGrade: false,
  };
}

export function normalizeClarity(val: string | undefined): DiamondClarity {
  const raw = (val || '').trim();
  if (!raw) return 'VS1';
  const upperNoSpace = raw.toUpperCase().replace(/\s+/g, '');
  if (ALL_CLARITIES.includes(upperNoSpace)) {
    return upperNoSpace;
  }
  return raw;
}

export function normalizeLab(val: string | undefined): CertLab {
  const raw = (val || '').trim();
  if (!raw) return 'GIA';
  const upper = raw.toUpperCase();
  if (upper.includes('GIA')) return 'GIA';
  if (upper.includes('IGI')) return 'IGI';
  if (upper.includes('HRD')) return 'HRD';
  if (upper.includes('GRS')) return 'GRS';
  if (upper.includes('SSEF')) return 'SSEF';
  if (upper.includes('GUBELIN')) return 'Gubelin';
  return raw;
}

export function parseNumeric(val: string | undefined, fallback: number): number {
  if (!val) return fallback;
  const cleaned = String(val)
    .replace(/\s+/g, '')
    .replace(/[$€₽%ct]/gi, '')
    .replace(',', '.');
  const match = cleaned.match(/-?\d+(\.\d+)?/);
  if (!match) return fallback;
  const parsed = parseFloat(match[0]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseMeasurements(
  raw: string | undefined
): { lengthMm?: number; widthMm?: number; depthMm?: number } {
  if (!raw) return {};
  const matches = String(raw).replace(/,/g, '.').match(/\d+(\.\d+)?/g);
  if (!matches || matches.length < 2) return {};
  const nums = matches
    .map((m) => parseFloat(m))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (nums.length >= 3) {
    return { lengthMm: nums[0], widthMm: nums[1], depthMm: nums[2] };
  }
  if (nums.length === 2) {
    return { lengthMm: nums[0], widthMm: nums[1] };
  }
  return {};
}

function detectCurrency(
  priceHeader: string,
  samplePriceText: string | undefined
): PriceCurrency {
  const text = `${priceHeader} ${samplePriceText || ''}`.toLowerCase();
  if (text.includes('₽') || text.includes('руб') || text.includes('rub')) {
    return 'RUB';
  }
  if (text.includes('€') || text.includes('eur')) {
    return 'EUR';
  }
  return 'USD';
}

export interface MapRowsOptions {
  defaultDirectory?: 'white' | 'fancy';
  defaultStoneType?: string;
  pricingConfig?: PricingConfig;
}

export function mapRowsToDiamonds(
  rows: string[][],
  mapping: ColumnMapping,
  source: 'sheets' | 'xlsx',
  headerRowIndex = 0,
  options?: MapRowsOptions
): { diamonds: Diamond[]; skippedRows: number } {
  if (rows.length <= headerRowIndex + 1) {
    return { diamonds: [], skippedRows: 0 };
  }

  const headers = rows[headerRowIndex] || [];
  const priceHeader =
    mapping.priceUsd >= 0
      ? headers[mapping.priceUsd] || ''
      : mapping.pricePerCarat >= 0
        ? headers[mapping.pricePerCarat] || ''
        : '';

  const diamonds: Diamond[] = [];
  let skippedRows = 0;

  const cell = (row: string[], idx: number): string | undefined =>
    idx >= 0 && idx < row.length ? String(row[idx] ?? '').trim() : undefined;

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => !String(c ?? '').trim())) continue;

    const rawCarat = cell(row, mapping.carat);
    const carat = parseNumeric(rawCarat, 0);
    if (carat <= 0) {
      skippedRows++;
      continue;
    }

    const rawStoneType =
      cell(row, mapping.stoneType) || options?.defaultStoneType || undefined;
    const shape = normalizeShape(cell(row, mapping.shape));
    const { color, colorFamily, isWhiteLetterGrade } = normalizeColoredStoneColor(
      cell(row, mapping.color),
      cell(row, mapping.fancyColor)
    );
    const clarity = normalizeClarity(cell(row, mapping.clarity));
    const isColored = !isWhiteLetterGrade && colorFamily !== 'Бесцветный (D–J)';
    const isDiamondOrUnspecified =
      !rawStoneType ||
      rawStoneType.toLowerCase().includes('бриллиант') ||
      rawStoneType.toLowerCase().includes('diamond');

    // Mixed-assortment rule: any stone with a D, E, F, ... white grade is ALWAYS routed
    // automatically to the White Diamonds directory, regardless of upload target.
    const directory: Diamond['directory'] = isWhiteLetterGrade
      ? 'white'
      : isColored && isDiamondOrUnspecified
        ? 'fancy'
        : options?.defaultDirectory ?? 'white';

    const stoneType =
      directory === 'white'
        ? !rawStoneType || rawStoneType === 'Цветной бриллиант'
          ? 'Бриллиант'
          : rawStoneType
        : !rawStoneType || rawStoneType === 'Бриллиант'
          ? 'Цветной бриллиант'
          : rawStoneType;

    const fancyIntensity =
      directory === 'fancy' ? extractFancyIntensity(color) : undefined;
    const fancyOvertone =
      directory === 'fancy' ? extractFancyOvertone(color) : undefined;

    const rawPriceText = cell(row, mapping.priceUsd) || cell(row, mapping.pricePerCarat);
    const currency = detectCurrency(priceHeader, rawPriceText);

    const totalPriceRaw = parseNumeric(cell(row, mapping.priceUsd), 0);
    const ppcRaw = parseNumeric(cell(row, mapping.pricePerCarat), 0);
    const costPriceUsd =
      totalPriceRaw > 0
        ? Math.round(totalPriceRaw)
        : ppcRaw > 0
          ? Math.round(ppcRaw * carat)
          : Math.round(carat * 4500);

    const activePricing = options?.pricingConfig || DEFAULT_PRICING_CONFIG;
    const useMarkup = activePricing.applyOnImport;
    const markupMode = useMarkup ? activePricing.mode : 'multiplier';
    const markupValue = useMarkup ? activePricing.value : 1;
    const priceUsd = useMarkup
      ? calculateClientPrice(
          costPriceUsd,
          activePricing.mode,
          activePricing.value,
          activePricing.roundingStep
        )
      : costPriceUsd;

    const prevRaw = parseNumeric(cell(row, mapping.previousPriceUsd), 0);
    const previousPriceUsd = prevRaw > priceUsd ? Math.round(prevRaw) : undefined;

    const certLab = normalizeLab(cell(row, mapping.certLab));
    const certNumber =
      cell(row, mapping.certNumber) ||
      `${source === 'xlsx' ? 'XL' : 'GS'}-${2400000 + i * 137}`;
    const rawCertUrl = cell(row, mapping.certUrl);
    const certUrl =
      rawCertUrl && rawCertUrl.startsWith('http')
        ? rawCertUrl
        : getCertVerifyUrl(certLab, certNumber);

    const parsedMeas = parseMeasurements(cell(row, mapping.measurements));
    const baseDiameter = Number((Math.cbrt(carat) * 6.45).toFixed(2));
    const isSquareOrRound =
      shape === 'Round' ||
      shape === 'Princess' ||
      shape === 'Asscher' ||
      shape === 'Heart' ||
      shape === 'Trilliant';

    const lengthMm = parseNumeric(
      cell(row, mapping.lengthMm),
      parsedMeas.lengthMm ??
        (isSquareOrRound
          ? baseDiameter
          : Number((baseDiameter * 1.32).toFixed(2)))
    );
    const widthMm = parseNumeric(
      cell(row, mapping.widthMm),
      parsedMeas.widthMm ??
        (isSquareOrRound
          ? baseDiameter
          : Number((baseDiameter * 0.94).toFixed(2)))
    );
    const depthMm = parseNumeric(
      cell(row, mapping.depthMm),
      parsedMeas.depthMm ?? Number((widthMm * 0.615).toFixed(2))
    );

    const cutRaw = (cell(row, mapping.cut) || '').toLowerCase();
    const cut: Diamond['cut'] = cutRaw.includes('id')
      ? 'Ideal'
      : cutRaw.includes('vg') || cutRaw.includes('very')
        ? 'Very Good'
        : cutRaw.includes('mix')
          ? 'Mixed'
          : cutRaw.includes('step')
            ? 'Step'
            : cutRaw.includes('good')
              ? 'Good'
              : 'Excellent';

    const polishRaw = (cell(row, mapping.polish) || '').toLowerCase();
    const polish: Diamond['polish'] =
      polishRaw.includes('vg') || polishRaw.includes('very')
        ? 'Very Good'
        : polishRaw.includes('good')
          ? 'Good'
          : 'Excellent';

    const symRaw = (cell(row, mapping.symmetry) || '').toLowerCase();
    const symmetry: Diamond['symmetry'] =
      symRaw.includes('vg') || symRaw.includes('very')
        ? 'Very Good'
        : symRaw.includes('good')
          ? 'Good'
          : 'Excellent';

    const fluorRaw = (cell(row, mapping.fluorescence) || '').toLowerCase();
    const fluorescence: Diamond['fluorescence'] = fluorRaw.includes('strong')
      ? 'Strong'
      : fluorRaw.includes('med')
        ? 'Medium'
        : fluorRaw.includes('faint') || fluorRaw.includes('sl')
          ? 'Faint'
          : 'None';

    const normalizeUrl = (val: string | undefined): string | undefined => {
      if (!val) return undefined;
      const t = val.trim();
      if (!t) return undefined;
      if (t.startsWith('http://') || t.startsWith('https://')) return t;
      if (t.startsWith('www.')) return `https://${t}`;
      return undefined;
    };

    const rawPhoto = normalizeUrl(cell(row, mapping.imageUrl));
    const rawVideo = normalizeUrl(cell(row, mapping.videoUrl));

    const sku =
      cell(row, mapping.sku) ||
      `${source === 'xlsx' ? 'XL' : 'GS'}-${shape.slice(0, 2).toUpperCase()}-${Math.round(
        carat * 100
      )}-${i}`;

    diamonds.push({
      id: `${source}-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      sku,
      stoneType,
      shape,
      carat: Number(carat.toFixed(2)),
      color,
      colorFamily,
      clarity,
      cut,
      polish,
      symmetry,
      fluorescence,
      depthPercent: parseNumeric(cell(row, mapping.depthPercent), 61.8),
      tablePercent: parseNumeric(cell(row, mapping.tablePercent), 57.5),
      crownAngle: 34.5,
      pavilionAngle: 40.8,
      girdle: 'Medium',
      culet: 'None',
      lengthMm: Number(lengthMm.toFixed(2)),
      widthMm: Number(widthMm.toFixed(2)),
      depthMm: Number(depthMm.toFixed(2)),
      lwRatio: Number((lengthMm / Math.max(0.1, widthMm)).toFixed(2)),
      certLab,
      certNumber,
      certDate: new Date().toISOString().slice(0, 10),
      certUrl,
      imageUrl:
        rawPhoto ||
        (directory === 'fancy' || isColored
          ? getFancyDiamondImage(color, colorFamily, shape)
          : SHAPE_IMAGE_MAP[shape]),
      videoUrl: rawVideo,
      costPriceUsd,
      markupMode,
      markupValue,
      priceUsd,
      currency,
      previousPriceUsd,
      priceChangedAt: previousPriceUsd ? new Date().toISOString() : undefined,
      origin:
        cell(row, mapping.origin) ||
        (source === 'xlsx' ? 'Файл .xlsx' : 'Google Sheets'),
      inStock: true,
      source,
      directory,
      isFancyColor: directory === 'fancy',
      fancyIntensity,
      fancyOvertone,
      primaryHue: directory === 'fancy' ? colorFamily : undefined,
      overtone: fancyOvertone,
      colorOrigin: directory === 'fancy' ? 'Natural' : undefined,
      colorDistribution: directory === 'fancy' ? 'Even' : undefined,
    });
  }

  return { diamonds, skippedRows };
}
