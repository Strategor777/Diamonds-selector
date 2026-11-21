import {
  SHAPE_IMAGE_MAP,
  SHAPE_SHORT_RU,
  extractFancyIntensity,
  getFancyDiamondImage,
} from '../data/diamonds';
import {
  Diamond,
  DiamondFilters,
  DiamondShape,
  SupplierFeed,
} from '../types/diamond';
import { isWhiteDiamondColorGrade } from './diamondMapper';
import {
  isNonImageMediaUrl,
  isStrictWhiteLetterGrade,
  parseFancyColor,
  sanitizeMediaUrl,
} from './fancyColorParser';

export interface CatalogIndex {
  searchTokens: string[];
  fancyFlags: Uint8Array;
  hasVideoFlags: Uint8Array;
  hasCertFlags: Uint8Array;
  carats: Float32Array;
  prices: Float32Array;
  depths: Float32Array;
  tables: Float32Array;
  lwRatios: Float32Array;
  lengths: Float32Array;
  widths: Float32Array;
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

// High-speed columnar index optimized for 60,000 - 150,000+ unified multi-supplier stones
export function buildCatalogIndex(catalog: Diamond[]): CatalogIndex {
  const len = catalog.length;
  const searchTokens = new Array<string>(len);
  const fancyFlags = new Uint8Array(len);
  const hasVideoFlags = new Uint8Array(len);
  const hasCertFlags = new Uint8Array(len);
  const carats = new Float32Array(len);
  const prices = new Float32Array(len);
  const depths = new Float32Array(len);
  const tables = new Float32Array(len);
  const lwRatios = new Float32Array(len);
  const lengths = new Float32Array(len);
  const widths = new Float32Array(len);
  const byShape = new Map<DiamondShape, number[]>();
  let fancyCount = 0;

  for (let i = 0; i < len; i++) {
    const d = catalog[i];
    const shapeRu = SHAPE_SHORT_RU[d.shape] || d.shape;
    const isFancy = isFancyDiamond(d);
    const shortCode = isFancy ? parseFancyColor(d.color).shortCode || '' : '';
    searchTokens[i] =
      `${d.sku || ''}\u0001${d.certNumber || ''}\u0001${shapeRu}\u0001${d.stoneType || ''}\u0001${d.color || ''}\u0001${shortCode}\u0001${d.colorFamily || ''}\u0001${d.certLab || ''}`.toLowerCase();

    if (isFancy) {
      fancyFlags[i] = 1;
      fancyCount++;
    }
    if (d.videoUrl && d.videoUrl.startsWith('http')) {
      hasVideoFlags[i] = 1;
    }
    if (
      d.certNumber &&
      !d.certNumber.startsWith('XL-') &&
      !d.certNumber.startsWith('GS-')
    ) {
      hasCertFlags[i] = 1;
    }

    carats[i] = d.carat || 0;
    prices[i] = d.priceUsd || 0;
    depths[i] = d.depthPercent || 61.8;
    tables[i] = d.tablePercent || 57.5;
    lwRatios[i] = d.lwRatio || 1.0;
    lengths[i] = d.lengthMm || 0;
    widths[i] = d.widthMm || 0;

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
    hasVideoFlags,
    hasCertFlags,
    carats,
    prices,
    depths,
    tables,
    lwRatios,
    lengths,
    widths,
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
    minCarat: Number.isFinite(minC)
      ? Math.max(0, Math.floor(minC * 20) / 20)
      : fallback.minCarat,
    maxCarat: Number.isFinite(maxC)
      ? Math.max(1.0, Math.ceil(maxC * 20) / 20)
      : fallback.maxCarat,
    minPrice: Number.isFinite(minP)
      ? Math.max(0, Math.floor(minP / 500) * 500)
      : fallback.minPrice,
    maxPrice: Number.isFinite(maxP)
      ? Math.max(1000, Math.ceil(maxP / 1000) * 1000)
      : fallback.maxPrice,
  };
}

export function filterAndSortCatalog(
  catalog: Diamond[],
  index: CatalogIndex,
  filters: DiamondFilters,
  deferredSearchQuery: string,
  disabledSupplierIds?: Set<string>
): Diamond[] {
  const q = deferredSearchQuery.trim().toLowerCase();
  const hasShapes = filters.shapes.length > 0;
  const hasStoneTypes = filters.stoneTypes.length > 0;
  const hasColorFamilies = filters.colorFamilies.length > 0;
  const hasFancyIntensities =
    filters.fancyIntensities && filters.fancyIntensities.length > 0;
  const hasColors = filters.colors.length > 0;
  const hasClarities = filters.clarities.length > 0;
  const hasCuts = filters.cuts && filters.cuts.length > 0;
  const hasPolishes = filters.polishes && filters.polishes.length > 0;
  const hasSymmetries = filters.symmetries && filters.symmetries.length > 0;
  const hasFluorescences = filters.fluorescences && filters.fluorescences.length > 0;
  const hasCertLabs = filters.certLabs && filters.certLabs.length > 0;
  const hasGrowthTypes = filters.growthTypes && filters.growthTypes.length > 0;
  const filterLegacyLab =
    !hasCertLabs && filters.certLab !== 'ALL' ? filters.certLab.toUpperCase() : null;

  const isWhiteDirOnly =
    filters.colorCategory === 'white' ||
    (filters.colorCategory === 'all' &&
      filters.stoneTypes.length === 1 &&
      filters.stoneTypes[0] === 'Бриллиант');
  const isFancyDirOnly =
    filters.colorCategory === 'fancy' ||
    (filters.colorCategory === 'all' &&
      filters.stoneTypes.length === 1 &&
      filters.stoneTypes[0] === 'Цветной бриллиант');

  const stoneTypeSet = hasStoneTypes ? new Set(filters.stoneTypes) : null;
  const colorFamilySet = hasColorFamilies ? new Set(filters.colorFamilies) : null;
  const intensitySet = hasFancyIntensities ? new Set(filters.fancyIntensities) : null;
  const colorSet = hasColors ? new Set(filters.colors) : null;
  const claritySet = hasClarities ? new Set(filters.clarities) : null;
  const cutSet = hasCuts ? new Set(filters.cuts) : null;
  const polishSet = hasPolishes ? new Set(filters.polishes) : null;
  const symmetrySet = hasSymmetries ? new Set(filters.symmetries) : null;
  const fluorSet = hasFluorescences ? new Set(filters.fluorescences) : null;
  const labSet = hasCertLabs
    ? new Set(filters.certLabs.map((l) => l.toUpperCase()))
    : null;
  const growthSet = hasGrowthTypes ? new Set(filters.growthTypes) : null;

  const minCarat = filters.minCarat;
  const maxCarat = filters.maxCarat;
  const minPrice = filters.minPrice;
  const maxPrice = filters.maxPrice;

  const checkDepth = filters.minDepthPercent > 0 || filters.maxDepthPercent < 100;
  const checkTable = filters.minTablePercent > 0 || filters.maxTablePercent < 100;
  const checkLw = filters.minLwRatio > 0 || filters.maxLwRatio < 5;
  const checkLen = filters.minLengthMm > 0 || filters.maxLengthMm < 50;
  const checkWid = filters.minWidthMm > 0 || filters.maxWidthMm < 50;

  const hasDisabledSuppliers = Boolean(disabledSupplierIds && disabledSupplierIds.size > 0);
  const {
    carats,
    prices,
    depths,
    tables,
    lwRatios,
    lengths,
    widths,
    fancyFlags,
    hasVideoFlags,
    hasCertFlags,
    searchTokens,
  } = index;

  const result: Diamond[] = [];

  const checkAndPush = (i: number) => {
    const ct = carats[i];
    if (ct < minCarat || ct > maxCarat) return;
    const pr = prices[i];
    if (pr < minPrice || pr > maxPrice) return;

    if (filters.onlyWithVideo && hasVideoFlags[i] !== 1) return;
    if (filters.onlyWithCert && hasCertFlags[i] !== 1) return;

    if (checkDepth) {
      const dp = depths[i];
      if (dp < filters.minDepthPercent || dp > filters.maxDepthPercent) return;
    }
    if (checkTable) {
      const tb = tables[i];
      if (tb < filters.minTablePercent || tb > filters.maxTablePercent) return;
    }
    if (checkLw) {
      const lw = lwRatios[i];
      if (lw < filters.minLwRatio || lw > filters.maxLwRatio) return;
    }
    if (checkLen) {
      const ln = lengths[i];
      if (ln < filters.minLengthMm || ln > filters.maxLengthMm) return;
    }
    if (checkWid) {
      const wd = widths[i];
      if (wd < filters.minWidthMm || wd > filters.maxWidthMm) return;
    }

    const d = catalog[i];

    if (hasDisabledSuppliers && d.supplierId && disabledSupplierIds!.has(d.supplierId)) {
      return;
    }

    if (isWhiteDirOnly) {
      if (fancyFlags[i] === 1) return;
    } else if (isFancyDirOnly) {
      if (fancyFlags[i] !== 1) return;
    } else if (stoneTypeSet) {
      if (!stoneTypeSet.has(d.stoneType || 'Бриллиант')) return;
    }

    if (colorFamilySet && !colorFamilySet.has(d.colorFamily || 'Бесцветный (D–J)')) {
      return;
    }
    if (intensitySet) {
      const intensity = d.fancyIntensity || extractFancyIntensity(d.color);
      if (!intensity || !intensitySet.has(intensity)) return;
    }
    if (colorSet && !colorSet.has(d.color)) return;
    if (claritySet && !claritySet.has(d.clarity)) return;
    if (cutSet && !cutSet.has(d.cut)) return;
    if (polishSet && !polishSet.has(d.polish)) return;
    if (symmetrySet && !symmetrySet.has(d.symmetry)) return;
    if (fluorSet && !fluorSet.has(d.fluorescence)) return;
    if (growthSet && !growthSet.has(d.growthType || 'Natural')) return;
    if (labSet && !labSet.has((d.certLab || '').toUpperCase())) return;
    if (filterLegacyLab && (d.certLab || '').toUpperCase() !== filterLegacyLab) return;
    if (q && !searchTokens[i].includes(q)) return;

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
  const sku = (d.sku || '').trim().toUpperCase();
  const certNum = (d.certNumber || '').trim().toUpperCase();
  const isGeneratedCert =
    certNum.startsWith('XL-') || certNum.startsWith('GS-') || certNum === '';

  if (!isGeneratedCert) {
    return `CERT:${(d.certLab || 'GIA').trim().toUpperCase()}:${certNum}`;
  }
  if (sku) {
    return d.supplierId ? `SUP:${d.supplierId}:SKU:${sku}` : `SKU:${sku}`;
  }
  return `ID:${d.id}`;
}

export function deduplicateDiamonds(
  incoming: Diamond[],
  existing: Diamond[],
  replaceMode: 'none' | 'all' | 'fancy' | 'supplier',
  supplierId?: string
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
  } else if (replaceMode === 'supplier' && supplierId) {
    for (let i = 0; i < existing.length; i++) {
      const d = existing[i];
      if (d.supplierId !== supplierId) {
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
      // Keep the lower entry cost if same certificate appears twice in one batch
      const prev = map.get(key);
      if (!prev || (d.costPriceUsd || d.priceUsd) < (prev.costPriceUsd || prev.priceUsd)) {
        map.set(key, d);
      }
      continue;
    }
    seenInBatch.add(key);

    const existingStone = map.get(key);
    if (existingStone) {
      updatedCount++;
      // If same certificate comes from two different suppliers, keep the lower wholesale cost
      if (
        existingStone.supplierId &&
        d.supplierId &&
        existingStone.supplierId !== d.supplierId &&
        (existingStone.costPriceUsd || existingStone.priceUsd) <
          (d.costPriceUsd || d.priceUsd)
      ) {
        continue;
      }
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

export function rebuildSupplierFeeds(
  catalog: Diamond[],
  prevSuppliers: SupplierFeed[]
): SupplierFeed[] {
  const prevById = new Map(prevSuppliers.map((s) => [s.id, s]));
  const stats = new Map<
    string,
    { name: string; fileName: string; total: number; white: number; fancy: number }
  >();

  for (let i = 0; i < catalog.length; i++) {
    const d = catalog[i];
    const supId = d.supplierId || (d.source === 'catalog' ? 'default-atelier' : 'manual');
    const prev = prevById.get(supId);
    const name =
      d.supplierName ||
      prev?.name ||
      (supId === 'default-atelier'
        ? 'Базовый каталог'
        : supId === 'manual'
          ? 'Добавлено вручную'
          : supId);
    const fileName =
      d.supplierFileName ||
      prev?.fileName ||
      (supId === 'default-atelier' ? 'Встроенный каталог' : 'Ручной ввод');

    let entry = stats.get(supId);
    if (!entry) {
      entry = { name, fileName, total: 0, white: 0, fancy: 0 };
      stats.set(supId, entry);
    }
    entry.total++;
    if (isFancyDiamond(d)) {
      entry.fancy++;
    } else {
      entry.white++;
    }
  }

  const nowIso = new Date().toISOString();
  const next: SupplierFeed[] = [];
  for (const [id, st] of stats.entries()) {
    const prev = prevById.get(id);
    next.push({
      id,
      name: prev?.name || st.name,
      fileName: st.fileName,
      stoneCount: st.total,
      whiteCount: st.white,
      fancyCount: st.fancy,
      active: prev ? prev.active : true,
      updatedAt: prev?.stoneCount === st.total ? prev.updatedAt : nowIso,
    });
  }

  return next.sort((a, b) => b.stoneCount - a.stoneCount);
}

export function getStudioFallbackImage(
  diamond: Pick<Diamond, 'color' | 'colorFamily' | 'shape' | 'directory' | 'isFancyColor'>
): string {
  const isFancy =
    diamond.directory === 'fancy' ||
    Boolean(diamond.isFancyColor) ||
    (Boolean(diamond.colorFamily) && diamond.colorFamily !== 'Бесцветный (D–J)');
  if (isFancy) {
    return getFancyDiamondImage(diamond.color, diamond.colorFamily, diamond.shape);
  }
  return SHAPE_IMAGE_MAP[diamond.shape] || SHAPE_IMAGE_MAP.Round;
}

/**
 * Fast O(n) catalog normalization pass run on hydration from IndexedDB / Firestore
 * so already-persisted catalogs immediately get:
 *  - Normalized GIA fancy color shades (FIP -> Fancy Intense Pink, FVB -> Fancy Vivid Blue, etc.)
 *  - Accurate fancyIntensity (no false "Fancy" stamp on bare "PINK"/"BROWN" stones)
 *  - Accurate colorFamily
 *  - Sanitized https:// imageUrl & videoUrl (and non-image viewer URLs routed to videoUrl)
 */
export function normalizeCatalogDiamonds(catalog: Diamond[]): Diamond[] {
  let anyChanged = false;
  const out = new Array<Diamond>(catalog.length);

  for (let i = 0; i < catalog.length; i++) {
    const d = catalog[i];
    const trimmedColor = (d.color || '').trim();
    const isWhiteLetter = isStrictWhiteLetterGrade(trimmedColor);

    let nextColor = d.color;
    let nextColorFamily = d.colorFamily;
    let nextIntensity = d.fancyIntensity;
    let nextOvertone = d.fancyOvertone;
    let nextIsFancy = d.isFancyColor;
    let nextDirectory = d.directory;

    const treatsAsFancy =
      !isWhiteLetter &&
      (d.directory === 'fancy' ||
        d.isFancyColor ||
        (Boolean(d.colorFamily) && d.colorFamily !== 'Бесцветный (D–J)') ||
        trimmedColor.length > 2);

    if (treatsAsFancy) {
      const parsed = parseFancyColor(trimmedColor);
      nextColor = parsed.canonicalColor;
      nextColorFamily = parsed.colorFamily;
      nextIntensity = parsed.fancyIntensity;
      nextOvertone = parsed.fancyOvertone;
      nextIsFancy = true;
      nextDirectory = 'fancy';
    }

    let nextImageUrl = d.imageUrl;
    let nextVideoUrl = d.videoUrl ? sanitizeMediaUrl(d.videoUrl) : undefined;

    if (nextImageUrl && !nextImageUrl.startsWith('/')) {
      const sanitizedImg = sanitizeMediaUrl(nextImageUrl);
      if (!sanitizedImg) {
        nextImageUrl = getStudioFallbackImage({
          color: nextColor,
          colorFamily: nextColorFamily,
          shape: d.shape,
          directory: nextDirectory,
          isFancyColor: nextIsFancy,
        });
      } else if (isNonImageMediaUrl(sanitizedImg)) {
        if (!nextVideoUrl) {
          nextVideoUrl = sanitizedImg;
        }
        nextImageUrl = getStudioFallbackImage({
          color: nextColor,
          colorFamily: nextColorFamily,
          shape: d.shape,
          directory: nextDirectory,
          isFancyColor: nextIsFancy,
        });
      } else {
        nextImageUrl = sanitizedImg;
      }
    } else {
      nextImageUrl = getStudioFallbackImage({
        color: nextColor,
        colorFamily: nextColorFamily,
        shape: d.shape,
        directory: nextDirectory,
        isFancyColor: nextIsFancy,
      });
    }

    if (
      nextColor !== d.color ||
      nextColorFamily !== d.colorFamily ||
      nextIntensity !== d.fancyIntensity ||
      nextOvertone !== d.fancyOvertone ||
      nextIsFancy !== d.isFancyColor ||
      nextDirectory !== d.directory ||
      nextImageUrl !== d.imageUrl ||
      nextVideoUrl !== d.videoUrl
    ) {
      anyChanged = true;
      out[i] = {
        ...d,
        color: nextColor,
        colorFamily: nextColorFamily,
        fancyIntensity: nextIntensity,
        fancyOvertone: nextOvertone,
        overtone: nextOvertone,
        primaryHue: nextIsFancy ? nextColorFamily : d.primaryHue,
        isFancyColor: nextIsFancy,
        directory: nextDirectory,
        imageUrl: nextImageUrl,
        videoUrl: nextVideoUrl,
      };
    } else {
      out[i] = d;
    }
  }

  return anyChanged ? out : catalog;
}

