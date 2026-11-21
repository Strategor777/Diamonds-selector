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
  | 'Old Mine'
  | 'Old European'
  | 'Antique Cushion'
  | 'Rose Cut'
  | 'Moval'
  | 'Shield'
  | 'Kite'
  | 'Hexagon'
  | 'Lozenge'
  | 'Half Moon'
  | 'Trapezoid'
  | 'Cadillac'
  | 'Briolette'
  | 'Trilliant'
  | 'Baguette'
  | 'Octagon'
  | 'Cabochon';

export type DiamondColor = string;

export type DiamondClarity = string;

export type CutGrade = 'Ideal' | 'Excellent' | 'Very Good' | 'Good' | 'Mixed' | 'Step';

export type PolishSymmetryGrade = 'Excellent' | 'Very Good' | 'Good';

export type FluorescenceGrade = 'None' | 'Faint' | 'Medium' | 'Strong';

export type GrowthType = 'Natural' | 'CVD' | 'HPHT';

export type CertLab = 'GIA' | 'IGI' | 'HRD' | 'GRS' | 'SSEF' | 'Gubelin' | string;

export type PriceCurrency = 'USD' | 'RUB' | 'EUR';

export type PricingMode = 'multiplier' | 'percent';

export interface PricingConfig {
  mode: PricingMode;
  value: number;
  roundingStep: 1 | 10 | 50 | 100;
  applyOnImport: boolean;
}

export interface SupplierFeed {
  id: string;
  name: string;
  fileName: string;
  stoneCount: number;
  whiteCount: number;
  fancyCount: number;
  active: boolean;
  updatedAt: string;
}

export interface Diamond {
  id: string;
  sku: string;
  stoneType?: string;
  growthType?: GrowthType;
  shape: DiamondShape;
  carat: number;
  color: DiamondColor;
  colorFamily?: string;
  clarity: DiamondClarity;
  cut: CutGrade;
  polish: PolishSymmetryGrade;
  symmetry: PolishSymmetryGrade;
  fluorescence: FluorescenceGrade;
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
  supplierId?: string;
  supplierName?: string;
  supplierFileName?: string;
  directory?: 'white' | 'fancy';
  isFancyColor?: boolean;
  fancyIntensity?: string;
  fancyOvertone?: string;
  primaryHue?: string;
  overtone?: string;
  colorOrigin?: string;
  colorDistribution?: string;
  certColorVerified?: boolean;
  certVerifiedColor?: string;
  certVerifiedAt?: string;
  certVerifySource?: 'auto' | 'manual';
  useStudioPhoto?: boolean;
}

export type ColorCategoryFilter = 'all' | 'white' | 'fancy';

export interface DiamondFilters {
  colorCategory: ColorCategoryFilter;
  shapes: DiamondShape[];
  colors: DiamondColor[];
  colorFamilies: string[];
  fancyIntensities: string[];
  stoneTypes: string[];
  clarities: DiamondClarity[];
  cuts: CutGrade[];
  polishes: PolishSymmetryGrade[];
  symmetries: PolishSymmetryGrade[];
  fluorescences: FluorescenceGrade[];
  certLabs: string[];
  growthTypes: GrowthType[];
  minCarat: number;
  maxCarat: number;
  minPrice: number;
  maxPrice: number;
  minDepthPercent: number;
  maxDepthPercent: number;
  minTablePercent: number;
  maxTablePercent: number;
  minLwRatio: number;
  maxLwRatio: number;
  minLengthMm: number;
  maxLengthMm: number;
  minWidthMm: number;
  maxWidthMm: number;
  onlyWithVideo: boolean;
  onlyWithCert: boolean;
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
  | 'pair-finder'
  | 'compare'
  | 'cart'
  | 'sheets'
  | 'manager';

export interface OrderRequest {
  id: string;
  requestNumber: string;
  createdAt: string;
  status?: 'new' | 'in_progress' | 'completed' | 'cancelled';
  customerName: string;
  contactPhone: string;
  contactEmail: string;
  preferredChannel: 'phone' | 'whatsapp' | 'telegram' | 'email';
  comment: string;
  items: {
    id: string;
    sku: string;
    shape: DiamondShape;
    carat: number;
    color: string;
    clarity: string;
    certLab: string;
    certNumber: string;
    priceUsd: number;
    currency: PriceCurrency;
  }[];
  totalCarat: number;
  totalsByCurrency: Partial<Record<PriceCurrency, number>>;
}
