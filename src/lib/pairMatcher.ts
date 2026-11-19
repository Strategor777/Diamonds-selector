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

const WHITE_COLOR_INDEX = new Map<string, number>(
  ALL_COLORS.map((c, idx) => [c.toUpperCase(), idx])
);
const CLARITY_INDEX = new Map<string, number>(
  ALL_FANCY_CLARITIES.map((c, idx) => [c.toUpperCase(), idx])
);

function getColorSteps(
  anchor: PairAnchorSpec,
  anchorColorUpper: string,
  anchorColorLower: string,
  anchorWhiteIdx: number,
  anchorHueLower: string,
  anchorIntensityRank: number | undefined,
  stone: Diamond
): number {
  const stoneColorUpper = stone.color.toUpperCase();
  const idxB = WHITE_COLOR_INDEX.get(stoneColorUpper);
  if (anchorWhiteIdx >= 0 && idxB !== undefined) {
    return Math.abs(anchorWhiteIdx - idxB);
  }

  // Fancy Color Diamonds: compare hue + intensity grade distance
  if (anchor.isFancyColor || stone.isFancyColor) {
    const hueB = (stone.primaryHue || stone.colorFamily || '').toLowerCase();
    const sameHue = anchorHueLower !== '' && hueB !== '' && anchorHueLower === hueB;
    const sameFamily =
      Boolean(anchor.colorFamily) &&
      Boolean(stone.colorFamily) &&
      anchor.colorFamily === stone.colorFamily;

    if (!sameHue && !sameFamily) {
      return 5;
    }

    const rankB = stone.fancyIntensity ? FANCY_INTENSITY_RANK[stone.fancyIntensity] : undefined;
    if (anchorIntensityRank !== undefined && rankB !== undefined) {
      return Math.abs(anchorIntensityRank - rankB);
    }
    return anchorColorLower === stone.color.trim().toLowerCase() ? 0 : 1;
  }

  if (anchorColorLower === stone.color.trim().toLowerCase()) {
    return 0;
  }
  if (anchor.colorFamily && stone.colorFamily && anchor.colorFamily === stone.colorFamily) {
    return 1;
  }
  return 4;
}

function getClaritySteps(
  anchorClarityIdx: number,
  anchorClarityLower: string,
  clarityB: string
): number {
  const idxB = CLARITY_INDEX.get(clarityB.toUpperCase());
  if (anchorClarityIdx >= 0 && idxB !== undefined) {
    return Math.abs(anchorClarityIdx - idxB);
  }
  return anchorClarityLower === clarityB.trim().toLowerCase() ? 0 : 1;
}

export function findMatchedPairs(
  anchor: PairAnchorSpec,
  catalog: Diamond[],
  criteria: PairMatchCriteria,
  maxResults = 120
): MatchedPairCandidate[] {
  const candidates: MatchedPairCandidate[] = [];

  const anchorColorUpper = anchor.color.toUpperCase();
  const anchorColorLower = anchor.color.trim().toLowerCase();
  const anchorWhiteIdx = WHITE_COLOR_INDEX.get(anchorColorUpper) ?? -1;
  const anchorHueLower = (anchor.primaryHue || anchor.colorFamily || '').toLowerCase();
  const anchorIntensityRank = anchor.fancyIntensity
    ? FANCY_INTENSITY_RANK[anchor.fancyIntensity]
    : undefined;
  const anchorClarityIdx = CLARITY_INDEX.get(anchor.clarity.toUpperCase()) ?? -1;
  const anchorClarityLower = anchor.clarity.trim().toLowerCase();

  const sizeDenom = Math.max(0.15, criteria.sizeToleranceMm * 1.4);
  const caratDenom = Math.max(0.05, criteria.caratTolerance * 1.4);
  const checkPrice = Boolean(
    anchor.priceUsd && anchor.priceUsd > 0 && criteria.maxPriceDiffPercent > 0
  );
  const anchorPrice = anchor.priceUsd || 0;

  for (let i = 0; i < catalog.length; i++) {
    const stone = catalog[i];
    if (anchor.id && stone.id === anchor.id) continue;
    if (criteria.requireSameShape && stone.shape !== anchor.shape) continue;

    const caratDiff = Math.abs(stone.carat - anchor.carat);
    if (caratDiff > criteria.caratTolerance) continue;

    const lengthDiffMm = Math.abs(stone.lengthMm - anchor.lengthMm);
    if (lengthDiffMm > criteria.sizeToleranceMm) continue;
    const widthDiffMm = Math.abs(stone.widthMm - anchor.widthMm);
    if (widthDiffMm > criteria.sizeToleranceMm) continue;
    const maxDimensionDiffMm = lengthDiffMm > widthDiffMm ? lengthDiffMm : widthDiffMm;

    const colorSteps = getColorSteps(
      anchor,
      anchorColorUpper,
      anchorColorLower,
      anchorWhiteIdx,
      anchorHueLower,
      anchorIntensityRank,
      stone
    );
    if (colorSteps > criteria.colorToleranceSteps) continue;

    const claritySteps = getClaritySteps(
      anchorClarityIdx,
      anchorClarityLower,
      stone.clarity
    );
    if (claritySteps > criteria.clarityToleranceSteps) continue;

    if (checkPrice) {
      const priceDiffPct = (Math.abs(stone.priceUsd - anchorPrice) / anchorPrice) * 100;
      if (priceDiffPct > criteria.maxPriceDiffPercent) continue;
    }

    const lwDiff = Math.abs(stone.lwRatio - anchor.lwRatio);

    const sizeScore = Math.max(0, 40 * (1 - maxDimensionDiffMm / sizeDenom));
    const caratScore = Math.max(0, 25 * (1 - caratDiff / caratDenom));
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

  candidates.sort((a, b) => b.compatibilityScore - a.compatibilityScore);
  return candidates.length > maxResults ? candidates.slice(0, maxResults) : candidates;
}
