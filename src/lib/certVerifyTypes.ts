export type CertVerifyStatus =
  | 'verified'
  | 'manual_required'
  | 'not_found'
  | 'invalid';

export interface CertVerifyResponse {
  status: CertVerifyStatus;
  lab: string;
  certNumber: string;
  verifyUrl: string;
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
  message: string;
  checkedAt: string;
}

export interface CertBatchVerifyRequestItem {
  id?: string;
  lab: string;
  certNumber: string;
}

export interface CertBatchVerifyResultItem extends CertVerifyResponse {
  id?: string;
}
