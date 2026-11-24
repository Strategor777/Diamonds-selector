import { isStrictWhiteLetterGrade, parseFancyColor } from './fancyColorParser';
import type {
  CertExtractedParameters,
  CertVerifyResponse,
  CertVerifySourceMode,
} from './certVerifyTypes';
import type {
  CutGrade,
  Diamond,
  DiamondShape,
  FluorescenceGrade,
  GrowthType,
  PolishSymmetryGrade,
} from '../types/diamond';

export interface IgiParseResult {
  params: CertExtractedParameters;
  extractedCount: number;
  reportNumberMismatch: boolean;
  warnings: string[];
}

export interface CertParamDiff {
  field: string;
  label: string;
  currentValue: string;
  certValue: string;
  status: 'match' | 'mismatch' | 'added';
}

export function buildIgiVerifyUrl(certNumber: string): string {
  const clean = (certNumber || '').trim();
  return `https://www.igi.org/Verify-Your-Report/?r=${encodeURIComponent(clean)}`;
}

export function buildIgiPdfUrl(certNumber: string): string {
  const clean = (certNumber || '').trim();
  return `https://api.igi.org/viewpdf.php?r=${encodeURIComponent(clean)}`;
}

export function normalizeIgiShape(raw: string | undefined): DiamondShape | undefined {
  if (!raw) return undefined;
  const s = raw.toUpperCase().replace(/[^A-Z0-9\s/-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return undefined;

  if (s.includes('OLD EUROPEAN')) return 'Old European';
  if (s.includes('OLD MINE')) return 'Old Mine';
  if (s.includes('ANTIQUE CUSHION')) return 'Antique Cushion';
  if (s.includes('ROSE CUT') || s === 'ROSE') return 'Rose Cut';
  if (s.includes('HALF MOON') || s.includes('HALF-MOON')) return 'Half Moon';
  if (s.includes('SQUARE EMERALD') || s.includes('ASSCHER')) return 'Asscher';
  if (s.includes('EMERALD')) return 'Emerald';
  if (s.includes('PRINCESS') || s.includes('SQUARE MODIFIED BRILLIANT')) return 'Princess';
  if (
    s.includes('RADIANT') ||
    s.includes('CUT-CORNERED RECTANGULAR') ||
    s.includes('CUT CORNERED RECTANGULAR') ||
    s.includes('CUT-CORNERED SQUARE')
  ) {
    return 'Radiant';
  }
  if (s.includes('CUSHION')) return 'Cushion';
  if (s.includes('OVAL')) return 'Oval';
  if (s.includes('MOVAL')) return 'Moval';
  if (s.includes('PEAR')) return 'Pear';
  if (s.includes('MARQUISE')) return 'Marquise';
  if (s.includes('HEART')) return 'Heart';
  if (s.includes('BAGUETTE')) return 'Baguette';
  if (s.includes('TRILLIANT') || s.includes('TRILLION') || s.includes('TRIANGULAR')) {
    return 'Trilliant';
  }
  if (s.includes('TRAPEZOID') || s.includes('TRAPEZE')) return 'Trapezoid';
  if (s.includes('SHIELD')) return 'Shield';
  if (s.includes('KITE')) return 'Kite';
  if (s.includes('HEXAGON')) return 'Hexagon';
  if (s.includes('LOZENGE')) return 'Lozenge';
  if (s.includes('CADILLAC')) return 'Cadillac';
  if (s.includes('BRIOLETTE')) return 'Briolette';
  if (s.includes('OCTAGON')) return 'Octagon';
  if (s.includes('CABOCHON')) return 'Cabochon';
  if (s.includes('ROUND')) return 'Round';

  return undefined;
}

export function normalizeIgiClarity(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const s = raw.toUpperCase().replace(/\s+/g, ' ').trim();
  if (!s) return undefined;
  if (s.includes('INTERNALLY FLAWLESS') || s === 'IF') return 'IF';
  if (s.includes('FLAWLESS') || s === 'FL') return 'FL';

  const compact = s.replace(/\s+/g, '');
  const m = compact.match(/^(VVS1|VVS2|VS1|VS2|SI1|SI2|SI3|I1|I2|I3|FL|IF)\b/);
  return m ? m[1] : undefined;
}

export function normalizeIgiCut(raw: string | undefined): CutGrade | undefined {
  if (!raw) return undefined;
  const s = raw.toUpperCase().replace(/\s+/g, ' ').trim();
  if (!s || s === 'N/A' || s === 'NONE' || s === '-') return undefined;
  if (s.includes('IDEAL') || s === 'ID') return 'Ideal';
  if (s.includes('EXCELLENT') || s === 'EX' || s === 'EXC') return 'Excellent';
  if (s.includes('VERY GOOD') || s === 'VG') return 'Very Good';
  if (s === 'GOOD' || s === 'GD' || s === 'G') return 'Good';
  if (s.includes('STEP')) return 'Step';
  if (s.includes('MIXED')) return 'Mixed';
  return undefined;
}

export function normalizeIgiPolishSym(
  raw: string | undefined
): PolishSymmetryGrade | undefined {
  if (!raw) return undefined;
  const s = raw.toUpperCase().replace(/\s+/g, ' ').trim();
  if (!s || s === 'N/A' || s === '-') return undefined;
  if (s.includes('EXCELLENT') || s.includes('IDEAL') || s === 'EX' || s === 'EXC') {
    return 'Excellent';
  }
  if (s.includes('VERY GOOD') || s === 'VG') return 'Very Good';
  if (s.includes('GOOD') || s === 'GD' || s === 'G') return 'Good';
  return undefined;
}

export function normalizeIgiFluorescence(
  raw: string | undefined
): FluorescenceGrade | undefined {
  if (!raw) return undefined;
  const s = raw.toUpperCase().replace(/\s+/g, ' ').trim();
  if (!s || s === 'N/A' || s === '-') return undefined;
  if (s.includes('NONE') || s === 'NON' || s === 'NIL' || s === 'N') return 'None';
  if (s.includes('VERY STRONG') || s.includes('STRONG') || s === 'STG' || s === 'VST') {
    return 'Strong';
  }
  if (s.includes('MEDIUM') || s === 'MED') return 'Medium';
  if (
    s.includes('FAINT') ||
    s.includes('VERY SLIGHT') ||
    s.includes('SLIGHT') ||
    s === 'FNT' ||
    s === 'VSL' ||
    s === 'SL'
  ) {
    return 'Faint';
  }
  return undefined;
}

export function parseIgiMeasurements(raw: string | undefined): {
  lengthMm: number;
  widthMm: number;
  depthMm: number;
  lwRatio: number;
} | null {
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, '.').replace(/[×*]/g, 'x').replace(/[–—]/g, '-');

  // Pattern 1: Round brilliant format "6.48 - 6.52 x 3.98 mm"
  const roundMatch = cleaned.match(
    /(\d{1,2}\.\d{1,2})\s*-\s*(\d{1,2}\.\d{1,2})\s*x\s*(\d{1,2}\.\d{1,2})/i
  );
  if (roundMatch) {
    const d1 = parseFloat(roundMatch[1]);
    const d2 = parseFloat(roundMatch[2]);
    const depth = parseFloat(roundMatch[3]);
    if (d1 > 0.5 && d2 > 0.5 && depth > 0.3 && d1 < 40 && d2 < 40 && depth < 30) {
      const lengthMm = Math.max(d1, d2);
      const widthMm = Math.min(d1, d2);
      return {
        lengthMm: Number(lengthMm.toFixed(2)),
        widthMm: Number(widthMm.toFixed(2)),
        depthMm: Number(depth.toFixed(2)),
        lwRatio: Number((lengthMm / Math.max(0.01, widthMm)).toFixed(2)),
      };
    }
  }

  // Pattern 2: Fancy shape format "8.12 x 5.64 x 3.58 mm"
  const fancyMatch = cleaned.match(
    /(\d{1,2}\.\d{1,2})\s*x\s*(\d{1,2}\.\d{1,2})\s*x\s*(\d{1,2}\.\d{1,2})/i
  );
  if (fancyMatch) {
    const a = parseFloat(fancyMatch[1]);
    const b = parseFloat(fancyMatch[2]);
    const depth = parseFloat(fancyMatch[3]);
    if (a > 0.5 && b > 0.5 && depth > 0.3 && a < 40 && b < 40 && depth < 30) {
      const lengthMm = Math.max(a, b);
      const widthMm = Math.min(a, b);
      return {
        lengthMm: Number(lengthMm.toFixed(2)),
        widthMm: Number(widthMm.toFixed(2)),
        depthMm: Number(depth.toFixed(2)),
        lwRatio: Number((lengthMm / Math.max(0.01, widthMm)).toFixed(2)),
      };
    }
  }

  return null;
}

function cleanColorCandidate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let cleaned = raw
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[:\-–—\s]+|[:\-–—.,;\s]+$/g, '')
    .trim();

  cleaned = cleaned
    .replace(
      /\b(clarity\s*grade|clarity|carat\s*weight|cut\s*grade|polish|symmetry|fluorescence|measurements|report\s*number|comments|origin|distribution|table\s*size|total\s*depth)\b.*$/i,
      ''
    )
    .trim();

  if (!cleaned || cleaned.length > 64) return undefined;
  if (/^(n\/a|none|null|undefined|-|—|color|colour|grade)$/i.test(cleaned)) {
    return undefined;
  }

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

function normalizeReportDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  if (!cleaned) return undefined;

  // ISO already: 2025-10-14
  const iso = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return cleaned;

  // Named English month: "October 14, 2025" or "14 October 2025"
  const months: Record<string, string> = {
    january: '01',
    jan: '01',
    february: '02',
    feb: '02',
    march: '03',
    mar: '03',
    april: '04',
    apr: '04',
    may: '05',
    june: '06',
    jun: '06',
    july: '07',
    jul: '07',
    august: '08',
    aug: '08',
    september: '09',
    sep: '09',
    sept: '09',
    october: '10',
    oct: '10',
    november: '11',
    nov: '11',
    december: '12',
    dec: '12',
  };

  const mdy = cleaned.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (mdy) {
    const mm = months[mdy[1].toLowerCase()];
    if (mm) {
      return `${mdy[3]}-${mm}-${mdy[2].padStart(2, '0')}`;
    }
  }

  const dmy = cleaned.match(/^(\d{1,2})\s+([A-Za-z]{3,9}),?\s+(\d{4})$/);
  if (dmy) {
    const mm = months[dmy[2].toLowerCase()];
    if (mm) {
      return `${dmy[3]}-${mm}-${dmy[1].padStart(2, '0')}`;
    }
  }

  const slash = cleaned.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const yyyy = slash[3];
    if (a > 12 && b <= 12) {
      return `${yyyy}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
    }
    return `${yyyy}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`;
  }

  return cleaned.slice(0, 32);
}

function extractLabeledValue(
  text: string,
  labelPatterns: RegExp[]
): string | undefined {
  for (const pattern of labelPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const value = match[1].split('\n')[0].trim();
      if (value) return value;
    }
  }
  return undefined;
}

export function parseIgiReportText(
  rawText: string,
  expectedCertNumber?: string
): IgiParseResult {
  const normalizedText = rawText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const params: CertExtractedParameters = {};
  const warnings: string[] = [];

  if (!normalizedText) {
    return { params, extractedCount: 0, reportNumberMismatch: false, warnings };
  }

  // 1. Report Number
  const reportNumRaw = extractLabeledValue(normalizedText, [
    /(?:IGI\s+)?Report\s*(?:Number|No\.?|#)\s*[:\-]?\s*\n?\s*([A-Z]{0,3}\d{6,14})/i,
    /Summary\s*(?:Number|No\.?)\s*[:\-]?\s*\n?\s*([A-Z]{0,3}\d{6,14})/i,
    /Inscription(?:\(s\))?\s*[:\-]?\s*\n?\s*IGI\s+([A-Z]{0,3}\d{6,14})/i,
    /\b(LG\d{7,12})\b/i,
  ]);
  if (reportNumRaw) {
    params.reportNumber = reportNumRaw.toUpperCase();
  }

  // 2. Report Date
  const dateRaw = extractLabeledValue(normalizedText, [
    /(?:Report\s+)?Date\s*[:\-]?\s*\n?\s*([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Za-z]{3,9},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}[./-]\d{1,2}[./-]\d{4})/i,
  ]);
  if (dateRaw) {
    params.reportDate = normalizeReportDate(dateRaw);
  }

  // 3. Description & Growth Type (Natural vs Laboratory Grown CVD/HPHT)
  const descRaw = extractLabeledValue(normalizedText, [
    /Description\s*[:\-]?\s*\n?\s*([^\n]{4,80})/i,
  ]);
  if (descRaw) {
    params.rawDescription = descRaw;
  }

  const upperBody = normalizedText.toUpperCase();
  const isLabGrown =
    upperBody.includes('LABORATORY GROWN') ||
    upperBody.includes('LAB GROWN') ||
    upperBody.includes('LAB-GROWN') ||
    Boolean(params.reportNumber && params.reportNumber.startsWith('LG'));

  if (isLabGrown) {
    if (
      /\bHPHT\b/.test(upperBody) ||
      upperBody.includes('HIGH PRESSURE HIGH TEMPERATURE')
    ) {
      params.growthType = 'HPHT';
    } else {
      params.growthType = 'CVD';
    }
  } else if (upperBody.includes('NATURAL DIAMOND')) {
    params.growthType = 'Natural';
  }

  // 4. Shape & Cutting Style
  const shapeRaw = extractLabeledValue(normalizedText, [
    /Shape\s+(?:and|&)\s+Cutting\s+Style\s*[:\-]?\s*\n?\s*([A-Za-z][A-Za-z0-9\s/-]{2,48})/i,
    /Shape\s*[:\-]\s*([A-Za-z][A-Za-z0-9\s/-]{2,48})/i,
  ]);
  if (shapeRaw) {
    const cleanShape = shapeRaw
      .replace(/\b(measurements|carat\s*weight|grading\s*results)\b.*$/i, '')
      .trim();
    if (cleanShape) {
      params.rawShape = cleanShape;
      const mappedShape = normalizeIgiShape(cleanShape);
      if (mappedShape) params.shape = mappedShape;
    }
  }

  // 5. Carat Weight
  const caratRaw = extractLabeledValue(normalizedText, [
    /Carat\s+Weight\s*[:\-]?\s*\n?\s*(\d+(?:[.,]\d+)?)\s*(?:ct|carat|carats)?/i,
    /Weight\s*[:\-]\s*(\d+(?:[.,]\d+)?)\s*(?:ct|carat|carats)/i,
  ]);
  if (caratRaw) {
    const ct = parseFloat(caratRaw.replace(',', '.'));
    if (Number.isFinite(ct) && ct >= 0.05 && ct <= 200) {
      params.carat = Number(ct.toFixed(2));
    }
  }

  // 6. Color Grade
  const colorRaw = extractLabeledValue(normalizedText, [
    /(?:^|\n)\s*Colou?r\s+Grade\s*[:\-]?\s*\n?\s*([A-Za-z0-9\s,/+()-]{1,64})/i,
    /(?:^|\n)\s*Fancy\s+Colou?r\s*[:\-]?\s*\n?\s*([A-Za-z0-9\s,/+()-]{1,64})/i,
    /(?:^|\n)\s*Colou?r\s*[:\-]\s*([A-Za-z0-9\s,/+()-]{1,64})/i,
  ]);
  const cleanColor = cleanColorCandidate(colorRaw);
  if (cleanColor) {
    params.rawColor = cleanColor;
    if (isStrictWhiteLetterGrade(cleanColor)) {
      const grade = cleanColor.toUpperCase();
      params.normalizedColor = grade;
      params.colorFamily = 'Бесцветный (D–J)';
      params.isWhite = true;
      params.isSpecificShade = false;
    } else {
      const parsedColor = parseFancyColor(cleanColor);
      params.normalizedColor = parsedColor.canonicalColor;
      params.colorFamily = parsedColor.colorFamily;
      params.fancyIntensity = parsedColor.fancyIntensity;
      params.fancyOvertone = parsedColor.fancyOvertone;
      params.shortCode = parsedColor.shortCode;
      params.isWhite = false;
      params.isSpecificShade = parsedColor.isSpecificShade;
    }
  }

  // 7. Clarity Grade
  const clarityRaw = extractLabeledValue(normalizedText, [
    /Clarity\s+Grade\s*[:\-]?\s*\n?\s*([A-Za-z0-9\s]{2,24})/i,
    /Clarity\s*[:\-]\s*([A-Za-z0-9\s]{2,24})/i,
  ]);
  const normClarity = normalizeIgiClarity(clarityRaw);
  if (normClarity) {
    params.clarity = normClarity;
  }

  // 8. Cut Grade
  const cutRaw = extractLabeledValue(normalizedText, [
    /Cut\s+Grade\s*[:\-]?\s*\n?\s*(IDEAL|EXCELLENT|VERY\s+GOOD|GOOD|FAIR|POOR|ID|EX|VG|GD)\b/i,
    /(?:^|\n)\s*Cut\s*[:\-]\s*(IDEAL|EXCELLENT|VERY\s+GOOD|GOOD|ID|EX|VG|GD)\b/i,
  ]);
  const normCut = normalizeIgiCut(cutRaw);
  if (normCut) {
    params.cut = normCut;
  }

  // 9. Polish & Symmetry
  const polishRaw = extractLabeledValue(normalizedText, [
    /Polish\s*[:\-]?\s*\n?\s*(IDEAL|EXCELLENT|VERY\s+GOOD|GOOD|FAIR|EX|VG|GD)\b/i,
  ]);
  const normPolish = normalizeIgiPolishSym(polishRaw);
  if (normPolish) {
    params.polish = normPolish;
  }

  const symmetryRaw = extractLabeledValue(normalizedText, [
    /Symmetry\s*[:\-]?\s*\n?\s*(IDEAL|EXCELLENT|VERY\s+GOOD|GOOD|FAIR|EX|VG|GD)\b/i,
  ]);
  const normSymmetry = normalizeIgiPolishSym(symmetryRaw);
  if (normSymmetry) {
    params.symmetry = normSymmetry;
  }

  // 10. Fluorescence
  const fluorRaw = extractLabeledValue(normalizedText, [
    /Fluorescence\s*[:\-]?\s*\n?\s*(NONE|FAINT|VERY\s+SLIGHT|SLIGHT|MEDIUM|VERY\s+STRONG|STRONG|NON|FNT|MED|STG)\b/i,
  ]);
  const normFluor = normalizeIgiFluorescence(fluorRaw);
  if (normFluor) {
    params.fluorescence = normFluor;
  }

  // 11. Measurements
  const measRaw =
    extractLabeledValue(normalizedText, [
      /Measurements\s*[:\-]?\s*\n?\s*([0-9.,\s×x*–—-]{6,40}(?:mm)?)/i,
    ]) || normalizedText;
  const parsedMeas = parseIgiMeasurements(measRaw);
  if (parsedMeas) {
    params.lengthMm = parsedMeas.lengthMm;
    params.widthMm = parsedMeas.widthMm;
    params.depthMm = parsedMeas.depthMm;
    params.lwRatio = parsedMeas.lwRatio;
  }

  // 12. Table Size % & Total Depth %
  const tableRaw = extractLabeledValue(normalizedText, [
    /Table(?:\s+Size)?\s*[:\-]?\s*\n?\s*(\d{2}(?:[.,]\d)?)\s*%/i,
  ]);
  if (tableRaw) {
    const t = parseFloat(tableRaw.replace(',', '.'));
    if (Number.isFinite(t) && t >= 40 && t <= 85) {
      params.tablePercent = Number(t.toFixed(1));
    }
  }

  const depthPctRaw = extractLabeledValue(normalizedText, [
    /Total\s+Depth\s*[:\-]?\s*\n?\s*(\d{2}(?:[.,]\d)?)\s*%/i,
    /(?:^|\n)\s*Depth\s*[:\-]?\s*\n?\s*(\d{2}(?:[.,]\d)?)\s*%/i,
  ]);
  if (depthPctRaw) {
    const d = parseFloat(depthPctRaw.replace(',', '.'));
    if (Number.isFinite(d) && d >= 40 && d <= 85) {
      params.depthPercent = Number(d.toFixed(1));
    }
  }

  // 13. Girdle & Culet
  const girdleRaw = extractLabeledValue(normalizedText, [
    /Girdle\s*[:\-]?\s*\n?\s*([A-Za-z\s()-]{3,48})/i,
  ]);
  if (girdleRaw) {
    const cleanGirdle = girdleRaw
      .replace(/\b(culet|polish|symmetry|fluorescence|comments)\b.*$/i, '')
      .trim();
    if (cleanGirdle && cleanGirdle.length <= 42) {
      params.girdle = cleanGirdle;
    }
  }

  const culetRaw = extractLabeledValue(normalizedText, [
    /Culet\s*[:\-]?\s*\n?\s*(POINTED|NONE|VERY\s+SMALL|SMALL|MEDIUM)\b/i,
  ]);
  if (culetRaw) {
    params.culet = /VERY\s+SMALL|SMALL|MEDIUM/i.test(culetRaw)
      ? 'Very Small'
      : 'None';
  }

  // 14. Comments
  const commentsMatch = normalizedText.match(
    /Comments\s*[:\-]?\s*\n?\s*([^\n]{4,180})/i
  );
  if (commentsMatch?.[1]) {
    params.comments = commentsMatch[1].trim();
  }

  // Check report number mismatch if an expected certificate number was provided
  let reportNumberMismatch = false;
  if (expectedCertNumber && params.reportNumber) {
    const expClean = expectedCertNumber.trim().toUpperCase().replace(/^LG/, '');
    const gotClean = params.reportNumber.trim().toUpperCase().replace(/^LG/, '');
    if (expClean && gotClean && expClean !== gotClean) {
      reportNumberMismatch = true;
      warnings.push(
        `Номер в тексте/PDF (${params.reportNumber}) не совпадает с номером сертификата в карточке (${expectedCertNumber}). Проверьте, что открыт верный бланк.`
      );
    }
  }

  const countKeys: (keyof CertExtractedParameters)[] = [
    'shape',
    'carat',
    'normalizedColor',
    'clarity',
    'cut',
    'polish',
    'symmetry',
    'fluorescence',
    'lengthMm',
    'depthPercent',
    'tablePercent',
    'growthType',
  ];
  const extractedCount = countKeys.filter((k) => params[k] !== undefined).length;

  return {
    params,
    extractedCount,
    reportNumberMismatch,
    warnings,
  };
}

export function compareDiamondWithCertParams(
  diamond: Diamond,
  params: CertExtractedParameters
): CertParamDiff[] {
  const diffs: CertParamDiff[] = [];

  if (params.shape) {
    diffs.push({
      field: 'shape',
      label: 'Форма огранки',
      currentValue: diamond.shape,
      certValue: params.shape,
      status: diamond.shape === params.shape ? 'match' : 'mismatch',
    });
  }

  if (params.carat !== undefined) {
    const match = Math.abs(diamond.carat - params.carat) < 0.006;
    diffs.push({
      field: 'carat',
      label: 'Каратность',
      currentValue: `${diamond.carat.toFixed(2)} ct`,
      certValue: `${params.carat.toFixed(2)} ct`,
      status: match ? 'match' : 'mismatch',
    });
  }

  if (params.normalizedColor) {
    const match =
      diamond.color.trim().toLowerCase() ===
      params.normalizedColor.trim().toLowerCase();
    diffs.push({
      field: 'color',
      label: 'Цвет',
      currentValue: diamond.color || '—',
      certValue: params.normalizedColor,
      status: match ? 'match' : 'mismatch',
    });
  }

  if (params.clarity) {
    const match =
      diamond.clarity.trim().toUpperCase().replace(/\s+/g, '') ===
      params.clarity.trim().toUpperCase().replace(/\s+/g, '');
    diffs.push({
      field: 'clarity',
      label: 'Чистота',
      currentValue: diamond.clarity || '—',
      certValue: params.clarity,
      status: match ? 'match' : 'mismatch',
    });
  }

  if (params.cut) {
    diffs.push({
      field: 'cut',
      label: 'Огранка (Cut)',
      currentValue: diamond.cut || '—',
      certValue: params.cut,
      status: diamond.cut === params.cut ? 'match' : 'mismatch',
    });
  }

  if (params.polish) {
    diffs.push({
      field: 'polish',
      label: 'Полировка',
      currentValue: diamond.polish || '—',
      certValue: params.polish,
      status: diamond.polish === params.polish ? 'match' : 'mismatch',
    });
  }

  if (params.symmetry) {
    diffs.push({
      field: 'symmetry',
      label: 'Симметрия',
      currentValue: diamond.symmetry || '—',
      certValue: params.symmetry,
      status: diamond.symmetry === params.symmetry ? 'match' : 'mismatch',
    });
  }

  if (params.fluorescence) {
    diffs.push({
      field: 'fluorescence',
      label: 'Флуоресценция',
      currentValue: diamond.fluorescence || '—',
      certValue: params.fluorescence,
      status: diamond.fluorescence === params.fluorescence ? 'match' : 'mismatch',
    });
  }

  if (
    params.lengthMm !== undefined &&
    params.widthMm !== undefined &&
    params.depthMm !== undefined
  ) {
    const curStr = `${diamond.lengthMm.toFixed(2)} × ${diamond.widthMm.toFixed(2)} × ${diamond.depthMm.toFixed(2)} мм`;
    const certStr = `${params.lengthMm.toFixed(2)} × ${params.widthMm.toFixed(2)} × ${params.depthMm.toFixed(2)} мм`;
    const match =
      Math.abs(diamond.lengthMm - params.lengthMm) <= 0.02 &&
      Math.abs(diamond.widthMm - params.widthMm) <= 0.02 &&
      Math.abs(diamond.depthMm - params.depthMm) <= 0.02;
    diffs.push({
      field: 'measurements',
      label: 'Размеры (мм)',
      currentValue: curStr,
      certValue: certStr,
      status: match ? 'match' : 'mismatch',
    });
  }

  if (params.depthPercent !== undefined) {
    const match = Math.abs(diamond.depthPercent - params.depthPercent) <= 0.2;
    diffs.push({
      field: 'depthPercent',
      label: 'Глубина (%)',
      currentValue: `${diamond.depthPercent.toFixed(1)}%`,
      certValue: `${params.depthPercent.toFixed(1)}%`,
      status: match ? 'match' : 'mismatch',
    });
  }

  if (params.tablePercent !== undefined) {
    const match = Math.abs(diamond.tablePercent - params.tablePercent) <= 0.5;
    diffs.push({
      field: 'tablePercent',
      label: 'Площадка (%)',
      currentValue: `${diamond.tablePercent.toFixed(1)}%`,
      certValue: `${params.tablePercent.toFixed(1)}%`,
      status: match ? 'match' : 'mismatch',
    });
  }

  if (params.growthType) {
    const curGrowth = diamond.growthType || 'Natural';
    const labelGrowth = (g: GrowthType) =>
      g === 'Natural' ? 'Природный' : `Лабораторный (${g})`;
    diffs.push({
      field: 'growthType',
      label: 'Происхождение',
      currentValue: labelGrowth(curGrowth),
      certValue: labelGrowth(params.growthType),
      status: curGrowth === params.growthType ? 'match' : 'mismatch',
    });
  }

  if (params.reportDate) {
    const match = Boolean(diamond.certDate) && diamond.certDate === params.reportDate;
    diffs.push({
      field: 'certDate',
      label: 'Дата сертификата',
      currentValue: diamond.certDate || '—',
      certValue: params.reportDate,
      status: !diamond.certDate ? 'added' : match ? 'match' : 'mismatch',
    });
  }

  return diffs;
}

export function buildVerifiedResponseFromParams(
  lab: string,
  certNumber: string,
  params: CertExtractedParameters,
  sourceMode: CertVerifySourceMode
): CertVerifyResponse {
  const cleanLab = (lab || 'IGI').trim().toUpperCase();
  const cleanCert = (params.reportNumber || certNumber || '').trim();
  const verifyUrl =
    cleanLab === 'IGI'
      ? buildIgiVerifyUrl(cleanCert)
      : `https://www.gia.edu/report-check?reportno=${encodeURIComponent(cleanCert)}`;
  const pdfUrl = cleanLab === 'IGI' ? buildIgiPdfUrl(cleanCert) : undefined;
  const checkedAt = new Date().toISOString();

  const summaryParts: string[] = [];
  if (params.shape) summaryParts.push(params.shape);
  if (params.carat !== undefined) summaryParts.push(`${params.carat.toFixed(2)} ct`);
  if (params.normalizedColor) summaryParts.push(params.normalizedColor);
  if (params.clarity) summaryParts.push(params.clarity);

  const sourceLabel =
    sourceMode === 'pdf-parse'
      ? 'из PDF-бланка'
      : sourceMode === 'text-paste'
        ? 'из текста отчёта'
        : 'по сертификату';

  return {
    status: 'verified',
    lab: cleanLab,
    certNumber: cleanCert,
    verifyUrl,
    pdfUrl,
    rawColor: params.rawColor,
    normalizedColor: params.normalizedColor,
    colorFamily: params.colorFamily,
    fancyIntensity: params.fancyIntensity,
    fancyOvertone: params.fancyOvertone,
    shortCode: params.shortCode,
    isWhite: params.isWhite,
    isSpecificShade: params.isSpecificShade,
    extractedShape: params.rawShape || params.shape,
    extractedCarat: params.carat,
    extractedClarity: params.clarity,
    params,
    sourceMode,
    message: `Подтверждены параметры ${sourceLabel} ${cleanLab} #${cleanCert}${
      summaryParts.length > 0 ? `: ${summaryParts.join(' · ')}` : ''
    }.`,
    checkedAt,
  };
}
