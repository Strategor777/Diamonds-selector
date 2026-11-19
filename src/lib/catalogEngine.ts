import {
  SHAPE_SHORT_RU,
  extractFancyIntensity,
} from '../data/diamonds';
import {
  Diamond,
  DiamondFilters,
  DiamondShape,
} from '../types/diamond';
import { isWhiteDiamondColorGrade } from './diamondMapper';

export interface CatalogIndex {
  searchTokens: string[];
  fancyFlags: Uint8Array;
  byShape: Map<DiamondShape, number[]>;
  whiteCount: number;
  fancyCount: number;
}

export interface CatalogBounds {
  minCarat: number;
  maxCarat: number;
  minPrice: number;
  maxPrice: number;
}

export interface DeduplicationResult {
  diamonds: Diamond[];
  addedCount: number;
  updatedCount: number;
  duplicatesInBatch: number;
}

export function isFancyDiamond(d: Diamond): boolean {
  // Rule: stones with standard white letter grades (D, E, F, ...) are always White Diamonds
  if (isWhiteDiamondColorGrade(d.color)) return false;
  if (d.directory === 'fancy' || d.isFancyColor) return true;
  if (!d.colorFamily || d.colorFamily === 'Бесцветный (D–J)') return false;
  if (!d.stoneType) return true;
  const st = d.stoneType.toLowerCase();
  return st.includes('бриллиант') || st.includes('diamond');
}

export function isWhiteDiamond(d: Diamond): boolean {
  if (isFancyDiamond(d)) return false;
  if (isWhiteDiamondColorGrade(d.color)) return true;
  if (!d.stoneType) return true;
  const st = d.stoneType.toLowerCase();
  return st === 'бриллиант' || st === 'diamond' || st === 'белый бриллиант';
}

export function buildCatalogIndex(catalog: Diamond[]): CatalogIndex {
  const len = catalog.length;
  const searchTokens = new Array<string>(len);
  const fancyFlags = new Uint8Array(len);
  const byShape = new Map<DiamondShape, number[]>();
  let fancyCount = 0;

  for (let i = 0; i < len; i++) {
    const d = catalog[i];
    const shapeRu = SHAPE_SHORT_RU[d.shape] || d.shape;
    searchTokens[i] =
      `${d.sku}\u0001${d.certNumber}\u0001${shapeRu}\u0001${d.stoneType || ''}\u0001${d.color}\u0001${d.colorFamily || ''}\u0001${d.origin}`.toLowerCase();

    if (isFancyDiamond(d)) {
      fancyFlags[i] = 1;
      fancyCount++;
    }

    let bucket = byShape.get(d.shape);
    if (!bucket) {
      bucket = [];
      byShape.set(d.shape, bucket);
    }
    bucket.push(i);
  }

  return {
    searchTokens,
    fancyFlags,
    byShape,
    whiteCount: len - fancyCount,
    fancyCount,
  };
}

export function computeCatalogBounds(
  stones: Diamond[],
  fallback: CatalogBounds = {
    minCarat: 0.2,
    maxCarat: 6.0,
    minPrice: 0,
    maxPrice: 150000,
  }
): CatalogBounds {
  const len = stones.length;
  if (len === 0) return fallback;

  let minC = Infinity;
  let maxC = -Infinity;
  let minP = Infinity;
  let maxP = -Infinity;

  for (let i = 0; i < len; i++) {
    const d = stones[i];
    if (d.carat < minC) minC = d.carat;
    if (d.carat > maxC) maxC = d.carat;
    if (d.priceUsd < minP) minP = d.priceUsd;
    if (d.priceUsd > maxP) maxP = d.priceUsd;
  }

  return {
    minCarat: Number.isFinite(minC) ? Math.max(0, Math.floor(minC * 20) / 20) : fallback.minCarat,
    maxCarat: Number.isFinite(maxC) ? Math.max(1.0, Math.ceil(maxC * 20) / 20) : fallback.maxCarat,
    minPrice: Number.isFinite(minP) ? Math.max(0, Math.floor(minP / 500) * 500) : fallback.minPrice,
    maxPrice: Number.isFinite(maxP) ? Math.max(1000, Math.ceil(maxP / 1000) * 1000) : fallback.maxPrice,
  };
}

export function filterAndSortCatalog(
  catalog: Diamond[],
  index: CatalogIndex,
  filters: DiamondFilters,
  deferredSearchQuery: string
): Diamond[] {
  const q = deferredSearchQuery.trim().toLowerCase();
  const hasShapes = filters.shapes.length > 0;
  const hasStoneTypes = filters.stoneTypes.length > 0;
  const hasColorFamilies = filters.colorFamilies.length > 0;
  const hasFancyIntensities =
    filters.fancyIntensities && filters.fancyIntensities.length > 0;
  const hasColors = filters.colors.length > 0;
  const hasClarities = filters.clarities.length > 0;
  const filterLab = filters.certLab !== 'ALL' ? filters.certLab.toUpperCase() : null;

  const isWhiteDirOnly =
    filters.stoneTypes.length === 1 && filters.stoneTypes[0] === 'Бриллиант';
  const isFancyDirOnly =
    filters.stoneTypes.length === 1 && filters.stoneTypes[0] === 'Цветной бриллиант';

  const stoneTypeSet = hasStoneTypes ? new Set(filters.stoneTypes) : null;
  const colorFamilySet = hasColorFamilies ? new Set(filters.colorFamilies) : null;
  const intensitySet = hasFancyIntensities ? new Set(filters.fancyIntensities) : null;
  const colorSet = hasColors ? new Set(filters.colors) : null;
  const claritySet = hasClarities ? new Set(filters.clarities) : null;

  const minCarat = filters.minCarat;
  const maxCarat = filters.maxCarat;
  const minPrice = filters.minPrice;
  const maxPrice = filters.maxPrice;

  const result: Diamond[] = [];

  const checkAndPush = (i: number) => {
    const d = catalog[i];

    if (d.carat < minCarat || d.carat > maxCarat) return;
    if (d.priceUsd < minPrice || d.priceUsd > maxPrice) return;

    if (isWhiteDirOnly) {
      if (index.fancyFlags[i] === 1) return;
      const st = d.stoneType || 'Бриллиант';
      if (st !== 'Бриллиант') return;
    } else if (isFancyDirOnly) {
      if (index.fancyFlags[i] !== 1) return;
    } else if (stoneTypeSet) {
      if (!stoneTypeSet.has(d.stoneType || 'Бриллиант')) return;
    }

    if (colorFamilySet && !colorFamilySet.has(d.colorFamily || 'Бесцветный (D–J)')) {
      return;
    }
    if (intensitySet) {
      const intensity = d.fancyIntensity || extractFancyIntensity(d.color);
      if (!intensitySet.has(intensity)) return;
    }
    if (colorSet && !colorSet.has(d.color)) return;
    if (claritySet && !claritySet.has(d.clarity)) return;
    if (filterLab && d.certLab.toUpperCase() !== filterLab) return;
    if (q && !index.searchTokens[i].includes(q)) return;

    result.push(d);
  };

  if (hasShapes) {
    for (let s = 0; s < filters.shapes.length; s++) {
      const bucket = index.byShape.get(filters.shapes[s]);
      if (!bucket) continue;
      for (let b = 0; b < bucket.length; b++) {
        checkAndPush(bucket[b]);
      }
    }
  } else {
    for (let i = 0; i < catalog.length; i++) {
      checkAndPush(i);
    }
  }

  switch (filters.sortBy) {
    case 'price-asc':
      result.sort((a, b) => a.priceUsd - b.priceUsd);
      break;
    case 'price-desc':
      result.sort((a, b) => b.priceUsd - a.priceUsd);
      break;
    case 'carat-desc':
      result.sort((a, b) => b.carat - a.carat);
      break;
    case 'carat-asc':
      result.sort((a, b) => a.carat - b.carat);
      break;
    default:
      break;
  }

  return result;
}

function getDiamondUniqueKey(d: Diamond): string {
  const sku = d.sku.trim().toUpperCase();
  const certNum = d.certNumber.trim().toUpperCase();
  const isGeneratedCert =
    certNum.startsWith('XL-') || certNum.startsWith('GS-') || certNum === '';

  if (!isGeneratedCert) {
    return `CERT:${d.certLab.trim().toUpperCase()}:${certNum}`;
  }
  if (sku) {
    return `SKU:${sku}`;
  }
  return `ID:${d.id}`;
}

export function deduplicateDiamonds(
  incoming: Diamond[],
  existing: Diamond[],
  replaceMode: 'none' | 'all' | 'fancy'
): DeduplicationResult {
  const map = new Map<string, Diamond>();

  if (replaceMode === 'none') {
    for (let i = 0; i < existing.length; i++) {
      const d = existing[i];
      map.set(getDiamondUniqueKey(d), d);
    }
  } else if (replaceMode === 'fancy') {
    for (let i = 0; i < existing.length; i++) {
      const d = existing[i];
      if (!isFancyDiamond(d)) {
        map.set(getDiamondUniqueKey(d), d);
      }
    }
  }

  const seenInBatch = new Set<string>();
  let addedCount = 0;
  let updatedCount = 0;
  let duplicatesInBatch = 0;

  for (let i = 0; i < incoming.length; i++) {
    const d = incoming[i];
    const key = getDiamondUniqueKey(d);
    if (seenInBatch.has(key)) {
      duplicatesInBatch++;
      map.set(key, d);
      continue;
    }
    seenInBatch.add(key);

    if (map.has(key)) {
      updatedCount++;
    } else {
      addedCount++;
    }
    map.set(key, d);
  }

  const merged = Array.from(map.values());
  return {
    diamonds: merged,
    addedCount,
    updatedCount,
    duplicatesInBatch,
  };
}
