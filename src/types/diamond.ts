export type DiamondShape =
  | 'Round'
  | 'Oval'
  | 'Emerald'
  | 'Princess'
  | 'Cushion'
  | 'Pear'
  | 'Radiant'
  | 'Marquise'
  | 'Heart'
  | 'Asscher'
  | 'Trilliant'
  | 'Baguette'
  | 'Octagon'
  | 'Cabochon';

export type DiamondColor = string;

export type DiamondClarity = string;

export type CutGrade = 'Ideal' | 'Excellent' | 'Very Good' | 'Good' | 'Mixed' | 'Step';

export type CertLab = 'GIA' | 'IGI' | 'HRD' | 'GRS' | 'SSEF' | 'Gubelin' | string;

export type PriceCurrency = 'USD' | 'RUB' | 'EUR';

export type PricingMode = 'multiplier' | 'percent';

export interface PricingConfig {
  mode: PricingMode;
  value: number;
  roundingStep: 1 | 10 | 50 | 100;
  applyOnImport: boolean;
}

export interface Diamond {
  id: string;
  sku: string;
  stoneType?: string;
  shape: DiamondShape;
  carat: number;
  color: DiamondColor;
  colorFamily?: string;
  clarity: DiamondClarity;
  cut: CutGrade;
  polish: 'Excellent' | 'Very Good' | 'Good';
  symmetry: 'Excellent' | 'Very Good' | 'Good';
  fluorescence: 'None' | 'Faint' | 'Medium' | 'Strong';
  depthPercent: number;
  tablePercent: number;
  crownAngle: number;
  pavilionAngle: number;
  girdle: string;
  culet: 'None' | 'Very Small';
  lengthMm: number;
  widthMm: number;
  depthMm: number;
  lwRatio: number;
  certLab: CertLab;
  certNumber: string;
  certDate: string;
  certUrl: string;
  imageUrl: string;
  videoUrl?: string;
  costPriceUsd?: number;
  markupMode?: PricingMode;
  markupValue?: number;
  priceUsd: number;
  currency?: PriceCurrency;
  previousPriceUsd?: number;
  priceChangedAt?: string;
  origin: string;
  inStock: boolean;
  source?: 'catalog' | 'sheets' | 'xlsx';
  directory?: 'white' | 'fancy';
  isFancyColor?: boolean;
  fancyIntensity?: string;
  fancyOvertone?: string;
  primaryHue?: string;
  overtone?: string;
  colorOrigin?: string;
  colorDistribution?: string;
}

export interface DiamondFilters {
  shapes: DiamondShape[];
  colors: DiamondColor[];
  colorFamilies: string[];
  fancyIntensities: string[];
  stoneTypes: string[];
  clarities: DiamondClarity[];
  minCarat: number;
  maxCarat: number;
  minPrice: number;
  maxPrice: number;
  certLab: string;
  onlyPriceDrops: boolean;
  searchQuery: string;
  sortBy: 'price-asc' | 'price-desc' | 'carat-desc' | 'carat-asc' | 'drop-desc';
}

export interface PriceAlertRule {
  id: string;
  label: string;
  diamondId?: string;
  shapes: DiamondShape[];
  colors: DiamondColor[];
  minCarat: number;
  maxCarat: number;
  maxPriceUsd: number;
  active: boolean;
  createdAt: string;
}

export interface PriceDropNotification {
  id: string;
  diamondId: string;
  sku: string;
  shape: DiamondShape;
  carat: number;
  color: DiamondColor;
  clarity: DiamondClarity;
  oldPriceUsd: number;
  newPriceUsd: number;
  dropPercent: number;
  timestamp: string;
  read: boolean;
}

export interface PairMatchCriteria {
  caratTolerance: number;
  sizeToleranceMm: number;
  colorToleranceSteps: number;
  clarityToleranceSteps: number;
  requireSameShape: boolean;
  maxPriceDiffPercent: number;
}

export interface MatchedPairCandidate {
  diamond: Diamond;
  compatibilityScore: number;
  caratDiff: number;
  lengthDiffMm: number;
  widthDiffMm: number;
  maxDimensionDiffMm: number;
  colorSteps: number;
  claritySteps: number;
  lwDiff: number;
}

export type AppSection =
  | 'catalog'
  | 'fancy'
  | 'pair-finder'
  | 'compare'
  | 'sheets'
  | 'manager';
