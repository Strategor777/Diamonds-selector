export interface ParsedFancyColor {
  canonicalColor: string;
  colorFamily: string;
  fancyIntensity?: string;
  fancyOvertone?: string;
  isBareBaseColor: boolean;
  isSpecificShade: boolean;
  shortCode?: string;
}

interface HueDef {
  canonical: string;
  family: string;
  code: string;
  modifierWord: string;
  overtoneRu: string;
}

const HUE_DEFS: Record<string, HueDef> = {
  yellow: {
    canonical: 'Yellow',
    family: 'Жёлтый',
    code: 'Y',
    modifierWord: 'Yellowish',
    overtoneRu: 'Желтоватый подтон',
  },
  pink: {
    canonical: 'Pink',
    family: 'Розовый',
    code: 'P',
    modifierWord: 'Pinkish',
    overtoneRu: 'Розоватый подтон',
  },
  blue: {
    canonical: 'Blue',
    family: 'Синий / Голубой',
    code: 'B',
    modifierWord: 'Bluish',
    overtoneRu: 'Голубоватый подтон',
  },
  green: {
    canonical: 'Green',
    family: 'Зелёный',
    code: 'G',
    modifierWord: 'Greenish',
    overtoneRu: 'Зеленоватый подтон',
  },
  orange: {
    canonical: 'Orange',
    family: 'Оранжевый',
    code: 'O',
    modifierWord: 'Orangy',
    overtoneRu: 'Оранжевый подтон',
  },
  purple: {
    canonical: 'Purple',
    family: 'Фиолетовый',
    code: 'PR',
    modifierWord: 'Purplish',
    overtoneRu: 'Пурпурный подтон',
  },
  violet: {
    canonical: 'Violet',
    family: 'Фиолетовый',
    code: 'V',
    modifierWord: 'Violetish',
    overtoneRu: 'Фиолетовый подтон',
  },
  red: {
    canonical: 'Red',
    family: 'Красный',
    code: 'R',
    modifierWord: 'Reddish',
    overtoneRu: 'Красноватый подтон',
  },
  brown: {
    canonical: 'Brown',
    family: 'Коричневый',
    code: 'BR',
    modifierWord: 'Brownish',
    overtoneRu: 'Коричневый подтон',
  },
  champagne: {
    canonical: 'Champagne',
    family: 'Коньячный / Шампань',
    code: 'CH',
    modifierWord: 'Brownish',
    overtoneRu: 'Коричневый подтон',
  },
  cognac: {
    canonical: 'Cognac',
    family: 'Коньячный / Шампань',
    code: 'CG',
    modifierWord: 'Brownish',
    overtoneRu: 'Коричневый подтон',
  },
  black: {
    canonical: 'Black',
    family: 'Чёрный',
    code: 'BK',
    modifierWord: 'Blackish',
    overtoneRu: 'Тёмный подтон',
  },
  gray: {
    canonical: 'Gray',
    family: 'Серый',
    code: 'GR',
    modifierWord: 'Grayish',
    overtoneRu: 'Серый подтон',
  },
  chameleon: {
    canonical: 'Chameleon',
    family: 'Хамелеон',
    code: 'CM',
    modifierWord: 'Greenish',
    overtoneRu: 'Зеленоватый подтон',
  },
};

const BARE_BASE_COLORS = new Set<string>(
  Object.values(HUE_DEFS).map((d) => d.canonical.toLowerCase())
);

const INTENSITY_CODES: Record<string, string> = {
  Light: 'L',
  'Fancy Light': 'FL',
  Fancy: 'F',
  'Fancy Intense': 'FI',
  'Fancy Vivid': 'FV',
  'Fancy Deep': 'FD',
  'Fancy Dark': 'FDK',
};

const MODIFIER_SHORT_CODES: Record<string, string> = {
  Orangy: 'O',
  Brownish: 'B',
  Purplish: 'P',
  Pinkish: 'P',
  Yellowish: 'Y',
  Greenish: 'G',
  Grayish: 'G',
  Bluish: 'B',
  Reddish: 'R',
  Violetish: 'V',
};

const MODIFIER_TO_OVERTONE_RU: Record<string, string> = {
  Orangy: 'Оранжевый подтон',
  Purplish: 'Пурпурный подтон',
  Greenish: 'Зеленоватый подтон',
  Brownish: 'Коричневый подтон',
  Grayish: 'Серый подтон',
  Yellowish: 'Желтоватый подтон',
  Pinkish: 'Розоватый подтон',
  Bluish: 'Голубоватый подтон',
  Reddish: 'Красноватый подтон',
  Violetish: 'Фиолетовый подтон',
};

const MULTI_LETTER_HUE_MAP: Record<string, keyof typeof HUE_DEFS> = {
  YL: 'yellow',
  YLW: 'yellow',
  YEL: 'yellow',
  PK: 'pink',
  PNK: 'pink',
  BL: 'blue',
  BLU: 'blue',
  GN: 'green',
  GRN: 'green',
  OR: 'orange',
  ORG: 'orange',
  PU: 'purple',
  PR: 'purple',
  PRP: 'purple',
  PUR: 'purple',
  VI: 'violet',
  VIO: 'violet',
  RD: 'red',
  BR: 'brown',
  BRN: 'brown',
  BN: 'brown',
  BK: 'black',
  BLK: 'black',
  GY: 'gray',
  GR: 'gray',
  GRY: 'gray',
  CH: 'chameleon',
  CHAM: 'chameleon',
  SH: 'champagne',
  CG: 'cognac',
};

const SINGLE_LETTER_MAIN_HUE: Record<string, keyof typeof HUE_DEFS> = {
  Y: 'yellow',
  P: 'pink',
  B: 'blue',
  G: 'green',
  O: 'orange',
  R: 'red',
  V: 'violet',
};

function decodeModifierLetter(letter: string, mainHue: keyof typeof HUE_DEFS): string | null {
  switch (letter) {
    case 'O':
      return 'Orangy';
    case 'Y':
      return 'Yellowish';
    case 'R':
      return 'Reddish';
    case 'V':
      return 'Violetish';
    case 'P':
      // Before Brown/Orange/Yellow, P means Pinkish; before Pink/Red/Blue/Gray, P means Purplish
      return mainHue === 'brown' || mainHue === 'orange' || mainHue === 'yellow'
        ? 'Pinkish'
        : 'Purplish';
    case 'B':
      // Before Green/Gray, B is typically Bluish; before Pink/Yellow/Orange/Red, B is Brownish
      return mainHue === 'green' || mainHue === 'gray' ? 'Bluish' : 'Brownish';
    case 'G':
      // Before Yellow/Blue/Gray: G before Yellow/Brown is Greenish; before Pink/Blue/Violet is Grayish
      return mainHue === 'yellow' || mainHue === 'brown' ? 'Greenish' : 'Grayish';
    default:
      return null;
  }
}

function buildShortCode(
  intensity: string | undefined,
  modifiers: string[],
  mainHueKey: keyof typeof HUE_DEFS | undefined
): string | undefined {
  if (!intensity || !mainHueKey) return undefined;
  const intCode = INTENSITY_CODES[intensity];
  const hueDef = HUE_DEFS[mainHueKey];
  if (!intCode || !hueDef) return undefined;
  const modCodes = modifiers.map((m) => MODIFIER_SHORT_CODES[m] || '').join('');
  return `${intCode}${modCodes}${hueDef.code}`;
}

/**
 * Attempts to decode GIA / RapNet / diamond trade abbreviations such as:
 *   FIP, F I P, FVP, F V P, FVB, F V B, FIB, FVG, FVOP, F V O P, FIOP,
 *   FIBP, F I B P, FY, F Y, FLY, FVY, FIY, FDKB, FDP, FVPP, FIPP, LY, LP, VLY...
 */
function parseTradeAbbreviation(raw: string): ParsedFancyColor | null {
  // Only consider strings that consist of letters, spaces, dots, slashes or hyphens
  if (!/^[a-zA-Z\s.\-/]+$/.test(raw)) return null;

  const compact = raw.replace(/[\s.\-/]+/g, '').toUpperCase();
  // Trade codes are between 2 and 7 letters (e.g. FY, FIP, FVOP, FDKBR, FLBGY)
  if (compact.length < 2 || compact.length > 7) return null;

  // Reject normal English full words like PINK, BLUE, BROWN, GREEN, BLACK, WHITE, YELLOW, ORANGE, PURPLE, GRAY, GREY, RED
  if (
    compact === 'PINK' ||
    compact === 'BLUE' ||
    compact === 'BROWN' ||
    compact === 'GREEN' ||
    compact === 'BLACK' ||
    compact === 'WHITE' ||
    compact === 'YELLOW' ||
    compact === 'ORANGE' ||
    compact === 'PURPLE' ||
    compact === 'VIOLET' ||
    compact === 'GRAY' ||
    compact === 'GREY' ||
    compact === 'RED' ||
    compact === 'FANCY' ||
    compact === 'LIGHT' ||
    compact === 'FAINT' ||
    compact === 'DEEP' ||
    compact === 'DARK' ||
    compact === 'VIVID' ||
    compact === 'INTENSE'
  ) {
    return null;
  }

  // Match intensity prefix (longest first)
  const prefixTable: [string, string][] = [
    ['FDK', 'Fancy Dark'],
    ['FDA', 'Fancy Dark'],
    ['FDP', 'Fancy Deep'],
    ['FDE', 'Fancy Deep'],
    ['FLI', 'Fancy Light'],
    ['FLT', 'Fancy Light'],
    ['FVL', 'Light'],
    ['FIN', 'Fancy Intense'],
    ['FNT', 'Light'],
    ['FV', 'Fancy Vivid'],
    ['FI', 'Fancy Intense'],
    ['FL', 'Fancy Light'],
    ['FD', 'Fancy Deep'],
    ['VL', 'Light'],
    ['FT', 'Light'],
    ['LT', 'Light'],
    ['F', 'Fancy'],
    ['L', 'Light'],
  ];

  let intensity: string | undefined;
  let rest = '';

  for (const [pref, label] of prefixTable) {
    if (compact.startsWith(pref) && compact.length > pref.length) {
      const candidateRest = compact.slice(pref.length);
      // Avoid mis-parsing single-letter L/F on plain 2-letter clarity/color tokens unless valid hue follows
      if ((pref === 'L' || pref === 'F') && candidateRest.length === 1) {
        if (!SINGLE_LETTER_MAIN_HUE[candidateRest]) continue;
      }
      // Special guard: FL alone is clarity, but here candidateRest.length >= 1
      intensity = label;
      rest = candidateRest;
      break;
    }
  }

  if (!intensity || !rest) return null;

  // Extract main hue from the END of `rest` (try 3-letter, 2-letter, then 1-letter)
  let mainHueKey: keyof typeof HUE_DEFS | undefined;
  let modPart = '';

  for (const len of [3, 2]) {
    if (rest.length >= len) {
      const tail = rest.slice(-len);
      if (MULTI_LETTER_HUE_MAP[tail]) {
        mainHueKey = MULTI_LETTER_HUE_MAP[tail];
        modPart = rest.slice(0, -len);
        break;
      }
    }
  }

  if (!mainHueKey) {
    const tail1 = rest.slice(-1);
    if (SINGLE_LETTER_MAIN_HUE[tail1]) {
      mainHueKey = SINGLE_LETTER_MAIN_HUE[tail1];
      modPart = rest.slice(0, -1);
    }
  }

  if (!mainHueKey) return null;

  // Decode 0..2 modifier codes from `modPart`
  const modifiers: string[] = [];
  if (modPart.length > 0) {
    if (modPart.length > 3) return null; // Too noisy to be a clean trade code
    let idx = 0;
    while (idx < modPart.length) {
      // Check 2-letter modifier first (BR, GR, GN, OR, PK, PR, YL, BL)
      if (idx + 2 <= modPart.length) {
        const two = modPart.slice(idx, idx + 2);
        const mappedTwo = MULTI_LETTER_HUE_MAP[two];
        if (mappedTwo) {
          modifiers.push(HUE_DEFS[mappedTwo].modifierWord);
          idx += 2;
          continue;
        }
      }
      const one = modPart[idx];
      const decoded = decodeModifierLetter(one, mainHueKey);
      if (!decoded) return null;
      modifiers.push(decoded);
      idx += 1;
    }
  }

  const hueDef = HUE_DEFS[mainHueKey];
  const uniqueMods = Array.from(new Set(modifiers)).filter(
    (m) => m.toLowerCase() !== hueDef.modifierWord.toLowerCase()
  );

  const canonicalColor = [intensity, ...uniqueMods, hueDef.canonical].join(' ');
  const fancyOvertone =
    uniqueMods.length > 0 ? MODIFIER_TO_OVERTONE_RU[uniqueMods[0]] : undefined;

  return {
    canonicalColor,
    colorFamily: hueDef.family,
    fancyIntensity: intensity,
    fancyOvertone,
    isBareBaseColor: false,
    isSpecificShade: true,
    shortCode: buildShortCode(intensity, uniqueMods, mainHueKey),
  };
}

/**
 * Splits squashed tokens like "Intensepink", "Vividpink", "Fancyvividblue", "Lightyellow"
 * into clean space-separated words before word-level parsing.
 */
function splitSquashedFancyWords(input: string): string {
  let s = input
    .replace(/[_/,-]+/g, ' ')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Insert spaces around known glued intensity/modifier/hue tokens
  const boundaryWords = [
    'very\\s*light',
    'faint',
    'fancy',
    'vivid',
    'intense',
    'deep',
    'dark',
    'light',
    'orangy',
    'orangey',
    'yellowish',
    'brownish',
    'purplish',
    'pinkish',
    'greenish',
    'grayish',
    'greyish',
    'bluish',
    'reddish',
    'violetish',
    'chameleon',
    'champagne',
    'cognac',
    'yellow',
    'orange',
    'purple',
    'violet',
    'green',
    'brown',
    'black',
    'pink',
    'blue',
    'gray',
    'grey',
    'red',
  ];

  const regex = new RegExp(`(${boundaryWords.join('|')})`, 'gi');
  s = s.replace(regex, ' $1 ').replace(/\s+/g, ' ').trim();
  return s;
}

const WORD_TO_MODIFIER: Record<string, string> = {
  orangy: 'Orangy',
  orangey: 'Orangy',
  оранжеватый: 'Orangy',
  yellowish: 'Yellowish',
  желтоватый: 'Yellowish',
  brownish: 'Brownish',
  коричневатый: 'Brownish',
  purplish: 'Purplish',
  пурпурный: 'Purplish',
  пурпуроватый: 'Purplish',
  pinkish: 'Pinkish',
  розоватый: 'Pinkish',
  greenish: 'Greenish',
  зеленоватый: 'Greenish',
  grayish: 'Grayish',
  greyish: 'Grayish',
  сероватый: 'Grayish',
  bluish: 'Bluish',
  голубоватый: 'Bluish',
  reddish: 'Reddish',
  красноватый: 'Reddish',
  violetish: 'Violetish',
  фиолетоватый: 'Violetish',
};

const WORD_TO_HUE: Record<string, keyof typeof HUE_DEFS> = {
  yellow: 'yellow',
  canary: 'yellow',
  lemon: 'yellow',
  жёлтый: 'yellow',
  желтый: 'yellow',
  pink: 'pink',
  rose: 'pink',
  розовый: 'pink',
  blue: 'blue',
  aqua: 'blue',
  синий: 'blue',
  голубой: 'blue',
  green: 'green',
  mint: 'green',
  зелёный: 'green',
  зеленый: 'green',
  orange: 'orange',
  оранжевый: 'orange',
  purple: 'purple',
  фиолетовый: 'purple',
  сиреневый: 'purple',
  violet: 'violet',
  lavender: 'violet',
  red: 'red',
  ruby: 'red',
  красный: 'red',
  brown: 'brown',
  коричневый: 'brown',
  champagne: 'champagne',
  шампань: 'champagne',
  cognac: 'cognac',
  коньячный: 'cognac',
  black: 'black',
  чёрный: 'black',
  черный: 'black',
  gray: 'gray',
  grey: 'gray',
  серый: 'gray',
  chameleon: 'chameleon',
  хамелеон: 'chameleon',
};

/**
 * Full GIA & trade fancy color parser.
 * Distinguishes bare base colors ("Pink", "Blue", "Brown") from true fancy shades
 * ("Fancy Intense Pink" / "FIP", "Fancy Vivid Orangy Pink" / "FVOP", "Pinkish Brown").
 */
export function parseFancyColor(rawInput: string | undefined): ParsedFancyColor {
  const raw = (rawInput || '').trim();
  if (!raw) {
    return {
      canonicalColor: 'Fancy',
      colorFamily: 'Фантазийный',
      fancyIntensity: undefined,
      isBareBaseColor: true,
      isSpecificShade: false,
    };
  }

  // 1. Try compact/spaced GIA trade abbreviation first (FIP, F I P, FVOP, F V B, FY, FIBP, etc.)
  const abbrResult = parseTradeAbbreviation(raw);
  if (abbrResult) {
    return abbrResult;
  }

  // 2. Normalize squashed & mixed-case words ("Intensepink", "FANCY VIVID BLUE", "Pink Brown", "GREY")
  const expanded = splitSquashedFancyWords(raw);
  const low = expanded.toLowerCase();

  // Detect intensity ONLY when explicitly present in the string
  let fancyIntensity: string | undefined;
  if (/\bfancy\s+vivid\b|\bvivid\b|вивид|ярко[-\s]*фантаз/i.test(low)) {
    fancyIntensity = 'Fancy Vivid';
  } else if (/\bfancy\s+intense\b|\bintense\b|интенсив/i.test(low)) {
    fancyIntensity = 'Fancy Intense';
  } else if (/\bfancy\s+deep\b|\bdeep\b|глубок/i.test(low)) {
    fancyIntensity = 'Fancy Deep';
  } else if (/\bfancy\s+dark\b|\bdark\b|тёмн|темн/i.test(low)) {
    fancyIntensity = 'Fancy Dark';
  } else if (/\bfancy\s+light\b|светло[-\s]*фантаз/i.test(low)) {
    fancyIntensity = 'Fancy Light';
  } else if (/\bvery\s+light\b|\bfaint\b|\blight\b|светл/i.test(low)) {
    fancyIntensity = 'Light';
  } else if (/\bfancy\b|фантаз/i.test(low)) {
    fancyIntensity = 'Fancy';
  }

  // Tokenize words to extract modifiers and primary hue (last hue word is primary hue in GIA grading)
  const tokens = low.split(/\s+/).filter(Boolean);
  const modifiers: string[] = [];
  const huesFound: (keyof typeof HUE_DEFS)[] = [];

  for (const tok of tokens) {
    if (WORD_TO_MODIFIER[tok]) {
      modifiers.push(WORD_TO_MODIFIER[tok]);
      continue;
    }
    if (WORD_TO_HUE[tok]) {
      huesFound.push(WORD_TO_HUE[tok]);
      continue;
    }
  }

  const mainHueKey = huesFound.length > 0 ? huesFound[huesFound.length - 1] : undefined;

  // If multiple base hues appear (e.g., "Pink Brown" or "Yellow Green"), earlier hues act as modifying shades
  if (huesFound.length > 1) {
    for (let i = 0; i < huesFound.length - 1; i++) {
      const secondaryHue = huesFound[i];
      if (secondaryHue !== mainHueKey) {
        modifiers.push(HUE_DEFS[secondaryHue].modifierWord);
      }
    }
  }

  if (mainHueKey) {
    const hueDef = HUE_DEFS[mainHueKey];
    const uniqueMods = Array.from(new Set(modifiers)).filter(
      (m) => m.toLowerCase() !== hueDef.modifierWord.toLowerCase()
    );

    const isBareBaseColor = !fancyIntensity && uniqueMods.length === 0;
    const canonicalColor = [
      ...(fancyIntensity ? [fancyIntensity] : []),
      ...uniqueMods,
      hueDef.canonical,
    ].join(' ');

    const fancyOvertone =
      uniqueMods.length > 0 ? MODIFIER_TO_OVERTONE_RU[uniqueMods[0]] : undefined;

    return {
      canonicalColor,
      colorFamily: hueDef.family,
      fancyIntensity,
      fancyOvertone,
      isBareBaseColor,
      isSpecificShade: !isBareBaseColor,
      shortCode: buildShortCode(fancyIntensity, uniqueMods, mainHueKey),
    };
  }

  // Fallback for unrecognized non-white descriptive strings
  const cleanedTitle = raw
    .replace(/\s+/g, ' ')
    .trim();
  const isBare = BARE_BASE_COLORS.has(cleanedTitle.toLowerCase()) || !fancyIntensity;

  return {
    canonicalColor: cleanedTitle,
    colorFamily: 'Фантазийный',
    fancyIntensity,
    isBareBaseColor: isBare,
    isSpecificShade: !isBare,
  };
}

export function isBareFancyBaseColor(colorText: string | undefined): boolean {
  if (!colorText) return true;
  const parsed = parseFancyColor(colorText);
  return parsed.isBareBaseColor;
}

/**
 * Checks whether a URL points to an HTML viewer / video / document rather than a direct image.
 */
export function isNonImageMediaUrl(url: string | undefined): boolean {
  if (!url) return false;
  const low = url.trim().toLowerCase();
  if (!low.startsWith('http://') && !low.startsWith('https://')) return false;
  const withoutQuery = low.split('?')[0].split('#')[0];

  // Explicit image file extensions are always images
  if (/\.(jpg|jpeg|png|webp|gif|avif|bmp|svg)$/i.test(withoutQuery)) {
    return false;
  }

  // Known non-image extensions & 360° viewer pages / cert pages
  if (
    /\.(html?|aspx?|php|jsp|mp4|webm|mov|m4v|ogg|pdf)$/i.test(withoutQuery) ||
    low.includes('vision360') ||
    low.includes('v360.in') ||
    low.includes('loupe360') ||
    low.includes('sarine') ||
    low.includes('gia.edu/report') ||
    low.includes('igi.org/verify') ||
    low.includes('video') ||
    low.includes('/360/')
  ) {
    return true;
  }

  return false;
}

/**
 * Sanitizes an external media URL: trims quotes/whitespace, upgrades http:// to https://
 * to prevent browser mixed-content blocking, and encodes stray spaces.
 */
export function sanitizeMediaUrl(val: string | undefined): string | undefined {
  if (!val) return undefined;
  let t = val.trim().replace(/^["'<\s]+|["'>\s]+$/g, '');
  if (!t) return undefined;

  // Handle Excel =HYPERLINK("https://...", "label") if it leaked as text
  const hyperlinkMatch = t.match(/HYPERLINK\s*\(\s*["'](https?:\/\/[^"']+)["']/i);
  if (hyperlinkMatch) {
    t = hyperlinkMatch[1].trim();
  }

  if (t.startsWith('www.')) {
    t = `https://${t}`;
  } else if (t.startsWith('http://')) {
    t = `https://${t.slice(7)}`;
  } else if (!t.startsWith('https://') && !t.startsWith('/')) {
    return undefined;
  }

  return t.replace(/\s+/g, '%20');
}

/**
 * Checks whether a color string is a strict GIA white/near-colorless letter grade
 * (e.g. D, E, F, G+, D-E, G/H), while rejecting fancy abbreviations like F-Y or F-P.
 */
export function isStrictWhiteLetterGrade(raw: string | undefined): boolean {
  const cleaned = (raw || '').trim();
  if (!cleaned) return false;
  const upper = cleaned.toUpperCase();

  // Single GIA letter grade D..Z with optional +/-
  if (/^[D-Z]([+-])?$/.test(upper)) {
    return true;
  }

  // Adjacent letter range (e.g. D-E, F-G, G/H, I-J, K-L) — excludes F-Y, F-P, F-B
  const rangeMatch = upper.match(/^([D-N])([+-])?\s*[-/]\s*([D-N])([+-])?$/);
  if (rangeMatch) {
    const c1 = rangeMatch[1].charCodeAt(0);
    const c2 = rangeMatch[3].charCodeAt(0);
    if (Math.abs(c2 - c1) <= 2) {
      return true;
    }
  }

  return false;
}

export interface ColoredStoneDisplayInfo {
  isColored: boolean;
  baseColor: string;
  intensity?: string;
  shade?: string;
  overtone?: string;
}

/**
 * Extracts structured display fields (base color, intensity, shade, overtone) for
 * colored/fancy diamonds. Only populates intensity & shade when genuinely present
 * (bare base colors like "Pink" or "Brown" will have undefined intensity & shade).
 */
export function getColoredStoneDisplayInfo(stone: {
  color: string;
  colorFamily?: string;
  directory?: 'white' | 'fancy';
  isFancyColor?: boolean;
  fancyIntensity?: string;
  fancyOvertone?: string;
  overtone?: string;
}): ColoredStoneDisplayInfo {
  const isWhiteLetter = isStrictWhiteLetterGrade(stone.color);
  const isColored =
    !isWhiteLetter &&
    (Boolean(stone.isFancyColor) ||
      stone.directory === 'fancy' ||
      (Boolean(stone.colorFamily) && stone.colorFamily !== 'Бесцветный (D–J)'));

  if (!isColored) {
    return {
      isColored: false,
      baseColor: stone.color,
    };
  }

  const parsed = parseFancyColor(stone.color);
  const baseColor = stone.colorFamily || parsed.colorFamily || stone.color;
  const intensity = (stone.fancyIntensity || parsed.fancyIntensity || '').trim() || undefined;

  const rawOvertone = (
    stone.fancyOvertone ||
    stone.overtone ||
    parsed.fancyOvertone ||
    ''
  ).trim();
  const overtone =
    rawOvertone &&
    rawOvertone.toLowerCase() !== 'чистый тон (pure)' &&
    rawOvertone.toLowerCase() !== 'pure' &&
    rawOvertone.toLowerCase() !== 'none'
      ? rawOvertone
      : undefined;

  let shade: string | undefined;
  if (parsed.isSpecificShade) {
    shade = parsed.shortCode
      ? `${parsed.canonicalColor} (${parsed.shortCode})`
      : parsed.canonicalColor;
  } else if (overtone) {
    shade = overtone;
  }

  const extraOvertone =
    overtone && shade && !shade.toLowerCase().includes(overtone.toLowerCase())
      ? overtone
      : undefined;

  return {
    isColored: true,
    baseColor,
    intensity,
    shade,
    overtone: extraOvertone,
  };
}


