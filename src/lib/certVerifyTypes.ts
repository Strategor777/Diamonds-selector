import type {
  CutGrade,
  DiamondShape,
  FluorescenceGrade,
  GrowthType,
  PolishSymmetryGrade,
} from '../types/diamond';

export type CertVerifyStatus =
  | 'verified'
  | 'manual_required'
  | 'not_found'
  | 'invalid';

export type CertVerifySourceMode =
  | 'pdf-parse'
  | 'text-paste'
  | 'manual';

export interface CertExtractedParameters {
  reportNumber?: string;
  reportDate?: string;
  growthType?: GrowthType;
  rawDescription?: string;
  shape?: DiamondShape;
  rawShape?: string;
  carat?: number;
  rawColor?: string;
  normalizedColor?: string;
  colorFamily?: string;
  fancyIntensity?: string;
  fancyOvertone?: string;
  shortCode?: string;
  isWhite?: boolean;
  isSpecificShade?: boolean;
  clarity?: string;
  cut?: CutGrade;
  polish?: PolishSymmetryGrade;
  symmetry?: PolishSymmetryGrade;
  fluorescence?: FluorescenceGrade;
  lengthMm?: number;
  widthMm?: number;
  depthMm?: number;
  lwRatio?: number;
  depthPercent?: number;
  tablePercent?: number;
  girdle?: string;
  culet?: 'None' | 'Very Small';
  comments?: string;
}

export interface CertVerifyResponse {
  status: CertVerifyStatus;
  lab: string;
  certNumber: string;
  verifyUrl: string;
  pdfUrl?: string;
  rawColor?: string;
  normalizedColor?: string;
  colorFamily?: string;
  fancyIntensity?: string;
  fancyOvertone?: string;
  shortCode?: string;
  isWhite?: boolean;
  isSpecificShade?: boolean;
  extractedShape?: string;
  extractedCarat?: number;
  extractedClarity?: string;
  params?: CertExtractedParameters;
  sourceMode?: CertVerifySourceMode;
  message: string;
  checkedAt: string;
}
