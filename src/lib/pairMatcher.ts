import { ALL_COLORS, ALL_FANCY_CLARITIES, FANCY_INTENSITY_RANK } from '../data/diamonds';
import {
  Diamond,
  DiamondClarity,
  DiamondColor,
  DiamondShape,
  MatchedPairCandidate,
  PairMatchCriteria,
} from '../types/diamond';

export interface PairAnchorSpec {
  id?: string;
  sku?: string;
  shape: DiamondShape;
  carat: number;
  color: DiamondColor;
  colorFamily?: string;
  isFancyColor?: boolean;
  fancyIntensity?: string;
  primaryHue?: string;
  clarity: DiamondClarity;
  lengthMm: number;
  widthMm: number;
  lwRatio: number;
  priceUsd?: number;
}

function getColorSteps(
  anchor: PairAnchorSpec,
  stone: Diamond
): number {
  // White D-J diamonds
  const idxA = ALL_COLORS.indexOf(anchor.color.toUpperCase());
  const idxB = ALL_COLORS.indexOf(stone.color.toUpperCase());
  if (idxA >= 0 && idxB >= 0) {
    return Math.abs(idxA - idxB);
  }

  // Fancy Color Diamonds: compare hue + intensity grade distance
  if (anchor.isFancyColor || stone.isFancyColor) {
    const hueA = (anchor.primaryHue || anchor.colorFamily || '').toLowerCase();
    const hueB = (stone.primaryHue || stone.colorFamily || '').toLowerCase();
    const sameHue = hueA && hueB && hueA === hueB;
    const sameFamily =
      anchor.colorFamily && stone.colorFamily && anchor.colorFamily === stone.colorFamily;

    if (!sameHue && !sameFamily) {
      return 5;
    }

    const rankA = anchor.fancyIntensity ? FANCY_INTENSITY_RANK[anchor.fancyIntensity] : undefined;
    const rankB = stone.fancyIntensity ? FANCY_INTENSITY_RANK[stone.fancyIntensity] : undefined;
    if (rankA !== undefined && rankB !== undefined) {
      return Math.abs(rankA - rankB);
    }
    return anchor.color.trim().toLowerCase() === stone.color.trim().toLowerCase() ? 0 : 1;
  }

  if (anchor.color.trim().toLowerCase() === stone.color.trim().toLowerCase()) {
    return 0;
  }
  if (anchor.colorFamily && stone.colorFamily && anchor.colorFamily === stone.colorFamily) {
    return 1;
  }
  return 4;
}

function getClaritySteps(clarityA: string, clarityB: string): number {
  const idxA = ALL_FANCY_CLARITIES.indexOf(clarityA.toUpperCase());
  const idxB = ALL_FANCY_CLARITIES.indexOf(clarityB.toUpperCase());
  if (idxA >= 0 && idxB >= 0) {
    return Math.abs(idxA - idxB);
  }
  return clarityA.trim().toLowerCase() === clarityB.trim().toLowerCase() ? 0 : 1;
}

export function findMatchedPairs(
  anchor: PairAnchorSpec,
  catalog: Diamond[],
  criteria: PairMatchCriteria
): MatchedPairCandidate[] {
  const candidates: MatchedPairCandidate[] = [];

  for (const stone of catalog) {
    if (anchor.id && stone.id === anchor.id) continue;
    if (criteria.requireSameShape && stone.shape !== anchor.shape) continue;

    const caratDiff = Math.abs(stone.carat - anchor.carat);
    if (caratDiff > criteria.caratTolerance) continue;

    const lengthDiffMm = Math.abs(stone.lengthMm - anchor.lengthMm);
    const widthDiffMm = Math.abs(stone.widthMm - anchor.widthMm);
    const maxDimensionDiffMm = Math.max(lengthDiffMm, widthDiffMm);
    if (maxDimensionDiffMm > criteria.sizeToleranceMm) continue;

    const colorSteps = getColorSteps(anchor, stone);
    if (colorSteps > criteria.colorToleranceSteps) continue;

    const claritySteps = getClaritySteps(anchor.clarity, stone.clarity);
    if (claritySteps > criteria.clarityToleranceSteps) continue;

    if (anchor.priceUsd && anchor.priceUsd > 0 && criteria.maxPriceDiffPercent > 0) {
      const priceDiffPct =
        (Math.abs(stone.priceUsd - anchor.priceUsd) / anchor.priceUsd) * 100;
      if (priceDiffPct > criteria.maxPriceDiffPercent) continue;
    }

    const lwDiff = Math.abs(stone.lwRatio - anchor.lwRatio);

    const sizeScore = Math.max(
      0,
      40 * (1 - maxDimensionDiffMm / Math.max(0.15, criteria.sizeToleranceMm * 1.4))
    );
    const caratScore = Math.max(
      0,
      25 * (1 - caratDiff / Math.max(0.05, criteria.caratTolerance * 1.4))
    );
    const colorScore = Math.max(0, 20 - colorSteps * 7);
    const clarityScore = Math.max(0, 10 - claritySteps * 3);
    const shapeBonus = stone.shape === anchor.shape ? 5 : 0;

    const compatibilityScore = Math.min(
      99,
      Math.max(55, Math.round(sizeScore + caratScore + colorScore + clarityScore + shapeBonus))
    );

    candidates.push({
      diamond: stone,
      compatibilityScore,
      caratDiff: Number(caratDiff.toFixed(2)),
      lengthDiffMm: Number(lengthDiffMm.toFixed(2)),
      widthDiffMm: Number(widthDiffMm.toFixed(2)),
      maxDimensionDiffMm: Number(maxDimensionDiffMm.toFixed(2)),
      colorSteps,
      claritySteps,
      lwDiff: Number(lwDiff.toFixed(2)),
    });
  }

  return candidates.sort((a, b) => b.compatibilityScore - a.compatibilityScore);
}
