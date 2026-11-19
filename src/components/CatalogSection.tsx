import React, { useEffect, useMemo, useState } from 'react';
import {
  RotateCcw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import {
  ALL_CLARITIES,
  ALL_COLORS,
  ALL_FANCY_CLARITIES,
  ALL_FANCY_SHADES,
  ALL_SHAPES,
  FANCY_INTENSITIES,
  SHAPE_SHORT_RU,
  extractFancyIntensity,
  formatStonePrice,
  getColorHexTint,
} from '../data/diamonds';
import { isFancyDiamond } from '../lib/catalogEngine';
import {
  Diamond,
  DiamondClarity,
  DiamondColor,
  DiamondFilters,
  DiamondShape,
  PriceCurrency,
} from '../types/diamond';
import { DiamondCard } from './DiamondCard';
import { DiamondShapeIcon } from './DiamondShapeIcon';
import { DualRangeSlider } from './DualRangeSlider';
import { NumericInput } from './NumericInput';
import { PaginationBar } from './PaginationBar';

interface CatalogSectionProps {
  diamonds: Diamond[];
  catalog: Diamond[];
  totalCount: number;
  fancyCount?: number;
  onGoToFancy?: () => void;
  filters: DiamondFilters;
  onChangeFilters: React.Dispatch<React.SetStateAction<DiamondFilters>>;
  onResetFilters: () => void;
  comparedIds: string[];
  cartIds: string[];
  watchedDiamondIds: Set<string>;
  onInspect: (diamond: Diamond, tab?: 'photo' | 'video' | 'cert') => void;
  onToggleCompare: (diamondId: string) => void;
  onToggleCart: (diamondId: string) => void;
  onFindPair: (diamond: Diamond) => void;
  onToggleWatch: (diamond: Diamond) => void;
}

const WHITE_COLOR_SET = new Set<string>(ALL_COLORS);

export const CatalogSection: React.FC<CatalogSectionProps> = ({
  diamonds,
  catalog,
  totalCount,
  fancyCount = 0,
  onGoToFancy,
  filters,
  onChangeFilters,
  onResetFilters,
  comparedIds,
  cartIds,
  watchedDiamondIds,
  onInspect,
  onToggleCompare,
  onToggleCart,
  onFindPair,
  onToggleWatch,
}) => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);

  // Determine active directory mode (White Diamonds vs Colored Diamonds vs All)
  const isWhiteDirectoryOnly =
    filters.stoneTypes.length === 1 && filters.stoneTypes[0] === 'Бриллиант';
  const isFancyDirectoryOnly =
    filters.stoneTypes.length === 1 && filters.stoneTypes[0] === 'Цветной бриллиант';

  // Reset to page 1 when filtered list length or active sorting/filters change
  useEffect(() => {
    setPage(1);
  }, [
    diamonds.length,
    filters.sortBy,
    filters.stoneTypes,
    filters.shapes,
    filters.colors,
    filters.colorFamilies,
    filters.fancyIntensities,
    filters.clarities,
    filters.certLab,
    filters.searchQuery,
  ]);

  const comparedSet = useMemo(() => new Set(comparedIds), [comparedIds]);
  const cartSet = useMemo(() => new Set(cartIds), [cartIds]);

  // Extract available directory types from the entire catalog (always ordered with Бриллиант first)
  const directoryTypes = useMemo(() => {
    const typeSet = new Set<string>();
    let hasWhite = false;
    let hasFancy = false;

    for (let i = 0; i < catalog.length; i++) {
      const d = catalog[i];
      if (isFancyDiamond(d)) {
        hasFancy = true;
        typeSet.add('Цветной бриллиант');
      } else {
        const st = d.stoneType || 'Бриллиант';
        if (st === 'Бриллиант') hasWhite = true;
        typeSet.add(st);
      }
    }

    const ordered: string[] = [];
    if (hasWhite || typeSet.has('Бриллиант')) ordered.push('Бриллиант');
    if (hasFancy || typeSet.has('Цветной бриллиант')) ordered.push('Цветной бриллиант');
    for (const st of typeSet) {
      if (st !== 'Бриллиант' && st !== 'Цветной бриллиант') {
        ordered.push(st);
      }
    }
    return ordered;
  }, [catalog]);

  // Compute facets strictly scoped to the active directory slice (single O(n) pass for 50k stones)
  const facets = useMemo(() => {
    const coloredFamilyCounts = new Map<string, number>();
    const fancyIntensityCounts = new Map<string, number>();
    const fancyColorsSet = new Set<string>();
    const claritiesSet = new Set<string>();
    const labsSet = new Set<string>(['GIA', 'IGI', 'HRD']);
    const shapeCounts = new Map<DiamondShape, number>();

    let minCarat = Infinity;
    let maxCarat = 0;
    let minPrice = Infinity;
    let maxPrice = 0;
    let scopeTotalCount = 0;

    const currencyCounts = new Map<PriceCurrency, number>();

    for (let i = 0; i < catalog.length; i++) {
      const d = catalog[i];
      const fancy = isFancyDiamond(d);

      if (isWhiteDirectoryOnly) {
        if (fancy || (d.stoneType || 'Бриллиант') !== 'Бриллиант') continue;
      } else if (isFancyDirectoryOnly) {
        if (!fancy) continue;
      }

      scopeTotalCount++;

      // Colorless (D-J) belongs strictly to white diamonds, never to Colored Color Families
      const fam = d.colorFamily || 'Бесцветный (D–J)';
      if (fancy && fam !== 'Бесцветный (D–J)') {
        coloredFamilyCounts.set(fam, (coloredFamilyCounts.get(fam) || 0) + 1);
      }

      if (fancy) {
        const intensity = d.fancyIntensity || extractFancyIntensity(d.color);
        fancyIntensityCounts.set(
          intensity,
          (fancyIntensityCounts.get(intensity) || 0) + 1
        );
        if (!WHITE_COLOR_SET.has(d.color.toUpperCase())) {
          fancyColorsSet.add(d.color);
        }
      }

      claritiesSet.add(d.clarity);
      if (d.certLab) labsSet.add(d.certLab);
      shapeCounts.set(d.shape, (shapeCounts.get(d.shape) || 0) + 1);

      if (d.carat < minCarat) minCarat = d.carat;
      if (d.carat > maxCarat) maxCarat = d.carat;
      if (d.priceUsd < minPrice) minPrice = d.priceUsd;
      if (d.priceUsd > maxPrice) maxPrice = d.priceUsd;

      const cur = d.currency || 'USD';
      currencyCounts.set(cur, (currencyCounts.get(cur) || 0) + 1);
    }

    let primaryCurrency: PriceCurrency = 'USD';
    let topCurCount = -1;
    for (const [cur, cnt] of currencyCounts.entries()) {
      if (cnt > topCurCount) {
        topCurCount = cnt;
        primaryCurrency = cur;
      }
    }

    const hasColoredStones = !isWhiteDirectoryOnly && coloredFamilyCounts.size > 0;
    const extraColorFamilies = Array.from(coloredFamilyCounts.keys()).filter(
      (f) => !(ALL_FANCY_SHADES as readonly string[]).includes(f)
    );
    const orderedColorFamilies = [...ALL_FANCY_SHADES, ...extraColorFamilies];
    const hasCustomStoneTypes =
      directoryTypes.length > 1 ||
      (directoryTypes.length === 1 && directoryTypes[0] !== 'Бриллиант');

    const baseClarities = isFancyDirectoryOnly ? ALL_FANCY_CLARITIES : ALL_CLARITIES;
    const extraClarities = isWhiteDirectoryOnly
      ? []
      : Array.from(claritiesSet).filter((cl) => !baseClarities.includes(cl));

    const availableClarities = isWhiteDirectoryOnly
      ? ALL_CLARITIES
      : extraClarities.length > 0 && claritiesSet.size > 0
        ? Array.from(
            new Set([
              ...baseClarities.filter((c) => claritiesSet.has(c)),
              ...extraClarities,
            ])
          )
        : baseClarities;

    return {
      colorFamilies: orderedColorFamilies,
      colorFamilyCounts: coloredFamilyCounts,
      fancyIntensityCounts,
      fancyColors: Array.from(fancyColorsSet),
      availableClarities,
      availableLabs: ['ALL', ...Array.from(labsSet)],
      shapeCounts,
      hasColoredStones,
      hasCustomStoneTypes,
      primaryCurrency,
      scopeTotalCount,
      boundMinCarat: Number.isFinite(minCarat)
        ? Math.max(0.05, Math.floor(minCarat * 20) / 20)
        : 0.2,
      boundMaxCarat:
        maxCarat > 0 ? Math.max(5.0, Math.ceil(maxCarat * 10) / 10) : 6.0,
      boundMinPrice: Number.isFinite(minPrice)
        ? Math.max(0, Math.floor(minPrice / 500) * 500)
        : 0,
      boundMaxPrice:
        maxPrice > 0 ? Math.max(95000, Math.ceil(maxPrice / 1000) * 1000) : 95000,
    };
  }, [catalog, directoryTypes, isWhiteDirectoryOnly, isFancyDirectoryOnly]);

  // Select a dedicated directory cleanly (switching strips incompatible characteristics)
  const handleSelectDirectory = (stoneType: string) => {
    onChangeFilters((prev) => {
      const isAlreadyExclusive =
        prev.stoneTypes.length === 1 && prev.stoneTypes[0] === stoneType;

      if (isAlreadyExclusive) {
        return {
          ...prev,
          stoneTypes: [],
          colorFamilies: [],
          fancyIntensities: [],
          colors: [],
        };
      }

      if (stoneType === 'Бриллиант') {
        return {
          ...prev,
          stoneTypes: ['Бриллиант'],
          colorFamilies: [],
          fancyIntensities: [],
          colors: prev.colors.filter((c) => WHITE_COLOR_SET.has(c.toUpperCase())),
          clarities: prev.clarities.filter((cl) => ALL_CLARITIES.includes(cl)),
        };
      }

      if (stoneType === 'Цветной бриллиант') {
        return {
          ...prev,
          stoneTypes: ['Цветной бриллиант'],
          colorFamilies: prev.colorFamilies.filter((f) => f !== 'Бесцветный (D–J)'),
          colors: prev.colors.filter((c) => !WHITE_COLOR_SET.has(c.toUpperCase())),
        };
      }

      return {
        ...prev,
        stoneTypes: [stoneType],
        colorFamilies: [],
        fancyIntensities: [],
        colors: [],
      };
    });
  };

  const toggleShape = (shape: DiamondShape) => {
    onChangeFilters((prev) => ({
      ...prev,
      shapes: prev.shapes.includes(shape)
        ? prev.shapes.filter((s) => s !== shape)
        : [...prev.shapes, shape],
    }));
  };

  const toggleColorFamily = (family: string) => {
    onChangeFilters((prev) => ({
      ...prev,
      colorFamilies: prev.colorFamilies.includes(family)
        ? prev.colorFamilies.filter((f) => f !== family)
        : [...prev.colorFamilies, family],
    }));
  };

  const toggleFancyIntensity = (intensity: string) => {
    onChangeFilters((prev) => ({
      ...prev,
      fancyIntensities: prev.fancyIntensities.includes(intensity)
        ? prev.fancyIntensities.filter((item) => item !== intensity)
        : [...prev.fancyIntensities, intensity],
    }));
  };

  const toggleColor = (color: DiamondColor) => {
    onChangeFilters((prev) => ({
      ...prev,
      colors: prev.colors.includes(color)
        ? prev.colors.filter((c) => c !== color)
        : [...prev.colors, color],
    }));
  };

  const toggleClarity = (clarity: DiamondClarity) => {
    onChangeFilters((prev) => ({
      ...prev,
      clarities: prev.clarities.includes(clarity)
        ? prev.clarities.filter((c) => c !== clarity)
        : [...prev.clarities, clarity],
    }));
  };

  const hasActiveFilters =
    filters.shapes.length > 0 ||
    filters.stoneTypes.length > 0 ||
    filters.colorFamilies.length > 0 ||
    filters.fancyIntensities.length > 0 ||
    filters.colors.length > 0 ||
    filters.clarities.length > 0 ||
    filters.minCarat > facets.boundMinCarat + 0.25 ||
    filters.maxCarat < facets.boundMaxCarat - 0.5 ||
    filters.minPrice > facets.boundMinPrice ||
    filters.maxPrice < facets.boundMaxPrice ||
    filters.certLab !== 'ALL' ||
    filters.searchQuery.trim() !== '';

  const priceStep = facets.primaryCurrency === 'RUB' ? 5000 : 500;
  const sliderMinCarat = Math.min(facets.boundMinCarat, filters.minCarat);
  const sliderMaxCarat = Math.max(facets.boundMaxCarat, filters.maxCarat);
  const sliderMinPrice = Math.min(facets.boundMinPrice, filters.minPrice);
  const sliderMaxPrice = Math.max(facets.boundMaxPrice, filters.maxPrice);

  // Paginated slice (renders only 24/48/96 DOM cards even on 50,000-stone catalogs)
  const totalPages = Math.max(1, Math.ceil(diamonds.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleDiamonds = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return diamonds.slice(start, start + pageSize);
  }, [diamonds, safePage, pageSize]);

  const handlePageChange = (nextPage: number) => {
    setPage(nextPage);
    const el = document.getElementById('catalog-results-top');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <section id="catalog-grid" className="max-w-7xl mx-auto px-6 py-10 space-y-8">
      {/* Multi-Axis Filter Panel */}
      <div className="bg-white border border-[#E4E6EB] rounded-xl p-6 space-y-6">
        {/* Panel Header: Параметры подбора (Upload button moved exclusively to Manager Cabinet) */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#E4E6EB]">
          <div className="flex items-center gap-2.5">
            <SlidersHorizontal className="w-4 h-4 text-[#1B365D]" />
            <h2 className="text-xl font-semibold text-[#111317]">
              Параметры подбора
            </h2>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#6B7280] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={filters.searchQuery}
                onChange={(e) =>
                  onChangeFilters((prev) => ({ ...prev, searchQuery: e.target.value }))
                }
                placeholder="Поиск по SKU, цвету, камню или № сертификата"
                aria-label="Поиск по артикулу, названию камня или номеру сертификата"
                className="pl-8 pr-3 py-1.5 text-xs bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg w-64 sm:w-72 focus:outline-none focus:border-[#1B365D]"
              />
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={onResetFilters}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[#D5D9E0] text-[#5A606D] hover:text-[#111317] hover:bg-[#F7F8FA] transition-colors whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Сбросить фильтры
              </button>
            )}
          </div>
        </div>

        {/* 1. Top Block: Директория */}
        {facets.hasCustomStoneTypes && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-[#5A606D]">Директория</div>
            <div className="flex flex-wrap items-center gap-1.5">
              {directoryTypes.map((st) => {
                const active =
                  filters.stoneTypes.length === 1 && filters.stoneTypes[0] === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => handleSelectDirectory(st)}
                    className={`px-3.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-[#1B365D] border-[#1B365D] text-white'
                        : 'bg-[#FAFAFA] border-[#E4E6EB] text-[#111317] hover:border-[#BFC6D2]'
                    }`}
                  >
                    {st}
                  </button>
                );
              })}
              {filters.stoneTypes.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    onChangeFilters((prev) => ({
                      ...prev,
                      stoneTypes: [],
                      colorFamilies: [],
                      fancyIntensities: [],
                      colors: [],
                    }))
                  }
                  className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-transparent text-[#5A606D] hover:text-[#111317] hover:bg-[#F1F3F5] transition-colors whitespace-nowrap"
                >
                  Все категории
                </button>
              )}
            </div>
          </div>
        )}

        {/* 2. Below Directory: Форма огранки (14 Cuts in 2×7 Grid) */}
        <div className="space-y-2.5">
          <div className="text-xs font-medium text-[#5A606D]">Форма огранки</div>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {ALL_SHAPES.map((shape) => {
              const active = filters.shapes.includes(shape);
              const count = facets.shapeCounts.get(shape) || 0;
              return (
                <button
                  key={shape}
                  type="button"
                  onClick={() => toggleShape(shape)}
                  className={`flex flex-col items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg border transition-colors ${
                    active
                      ? 'bg-[#1B365D] border-[#1B365D] text-white'
                      : count > 0
                        ? 'bg-[#FAFAFA] border-[#E4E6EB] text-[#111317] hover:border-[#BFC6D2]'
                        : 'bg-[#FAFAFA]/60 border-[#E4E6EB]/70 text-[#8A919E] hover:text-[#111317] hover:border-[#BFC6D2]'
                  }`}
                >
                  <DiamondShapeIcon shape={shape} className="w-6 h-6" filled={active} />
                  <span className="text-xs font-medium whitespace-nowrap">
                    {SHAPE_SHORT_RU[shape]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Below Shape: Color / Shade Block (Scoped cleanly to White vs Colored Directory) */}
        <div className="space-y-4">
          {/* White-diamond color scale (D–J) — exclusively for White Diamonds (hidden in Colored directory) */}
          {!isFancyDirectoryOnly && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-[#5A606D]">
                <span>Цвет (D–J)</span>
                {!isWhiteDirectoryOnly && (
                  <span className="text-[11px] font-normal text-[#8A919E]">
                    · только белые бриллианты
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {ALL_COLORS.map((color) => {
                  const active = filters.colors.includes(color);
                  return (
                    <button
                      key={color}
                      type="button"
                      onClick={() => toggleColor(color)}
                      className={`h-9 min-w-[44px] px-3 text-xs font-mono rounded-md border transition-colors ${
                        active
                          ? 'bg-[#1B365D] border-[#1B365D] text-white font-semibold'
                          : 'bg-[#FAFAFA] border-[#E4E6EB] text-[#111317] hover:border-[#BFC6D2]'
                      }`}
                    >
                      {color}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Colored-only characteristics: Shade (Оттенок) — hidden completely in White directory */}
          {!isWhiteDirectoryOnly && facets.hasColoredStones && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-[#5A606D]">
                Оттенок
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {facets.colorFamilies.map((family) => {
                  const active = filters.colorFamilies.includes(family);
                  const swatch = getColorHexTint('', family).deep;
                  const count = facets.colorFamilyCounts.get(family) || 0;
                  return (
                    <button
                      key={family}
                      type="button"
                      onClick={() => toggleColorFamily(family)}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-[#1B365D] border-[#1B365D] text-white'
                          : count > 0
                            ? 'bg-[#FAFAFA] border-[#E4E6EB] text-[#111317] hover:border-[#BFC6D2]'
                            : 'bg-[#FAFAFA]/60 border-[#E4E6EB]/70 text-[#8A919E] hover:text-[#111317] hover:border-[#BFC6D2]'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className="w-2.5 h-2.5 rounded-full border border-black/15 shrink-0"
                        style={{ backgroundColor: swatch }}
                      />
                      {family}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Fancy Intensity & Fancy Shades — shown ONLY in Colored Diamonds directory */}
          {isFancyDirectoryOnly && (
            <>
              <div className="space-y-2">
                <div className="text-xs font-medium text-[#5A606D]">
                  Интенсивность окраски (Fancy Intensity)
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {FANCY_INTENSITIES.map((intensity) => {
                    const active = filters.fancyIntensities.includes(intensity);
                    const count = facets.fancyIntensityCounts.get(intensity) || 0;
                    return (
                      <button
                        key={intensity}
                        type="button"
                        onClick={() => toggleFancyIntensity(intensity)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap tabular-nums ${
                          active
                            ? 'bg-[#1B365D] border-[#1B365D] text-white'
                            : count > 0
                              ? 'bg-[#FAFAFA] border-[#E4E6EB] text-[#111317] hover:border-[#BFC6D2]'
                              : 'bg-[#FAFAFA]/60 border-[#E4E6EB]/70 text-[#8A919E] hover:text-[#111317]'
                        }`}
                      >
                        {intensity}
                        {count > 0 ? ` (${count})` : ''}
                      </button>
                    );
                  })}
                </div>
              </div>

              {facets.fancyColors.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-[#5A606D]">
                    Оттенок / Fancy-цвет
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {facets.fancyColors.slice(0, 40).map((color) => {
                      const active = filters.colors.includes(color);
                      return (
                        <button
                          key={color}
                          type="button"
                          onClick={() => toggleColor(color)}
                          className={`px-2.5 py-1.5 text-xs rounded-md border transition-colors whitespace-nowrap ${
                            active
                              ? 'bg-[#1B365D] border-[#1B365D] text-white font-medium'
                              : 'bg-[#FAFAFA] border-[#E4E6EB] text-[#111317] hover:border-[#BFC6D2]'
                          }`}
                        >
                          {color}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* 4. Directly Under Shade/Color Block — Clarity laid out in a single clean horizontal line */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-[#5A606D]">Чистота</div>
          <div className="flex flex-wrap items-center gap-1.5">
            {facets.availableClarities.slice(0, 12).map((clarity) => {
              const active = filters.clarities.includes(clarity);
              return (
                <button
                  key={clarity}
                  type="button"
                  onClick={() => toggleClarity(clarity)}
                  title={clarity}
                  className={`h-9 min-w-[54px] px-3 text-xs font-mono rounded-md border transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-[#1B365D] border-[#1B365D] text-white font-semibold'
                      : 'bg-[#FAFAFA] border-[#E4E6EB] text-[#111317] hover:border-[#BFC6D2]'
                  }`}
                >
                  {clarity}
                </button>
              );
            })}
          </div>
        </div>

        {/* 5. Below Clarity — Carat & Price Ranges with Dual-Thumb Sliders */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-1">
          {/* Carat Range */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[#5A606D]">Вес (карат)</span>
              <span className="font-mono tabular-nums text-[#111317]">
                {filters.minCarat.toFixed(2)} – {filters.maxCarat.toFixed(2)} ct
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumericInput
                min={0}
                max={filters.maxCarat}
                emptyValue={0}
                value={filters.minCarat}
                onValueChange={(val) =>
                  onChangeFilters((prev) => ({
                    ...prev,
                    minCarat: Math.max(0, Math.min(val, prev.maxCarat)),
                  }))
                }
                aria-label="Минимальный вес в каратах"
                className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-[#FAFAFA] border border-[#D5D9E0] rounded-md"
              />
              <NumericInput
                min={filters.minCarat}
                max={sliderMaxCarat * 2}
                emptyValue={Math.max(filters.minCarat, sliderMaxCarat)}
                value={filters.maxCarat}
                onValueChange={(val) =>
                  onChangeFilters((prev) => ({
                    ...prev,
                    maxCarat: Math.max(prev.minCarat, val),
                  }))
                }
                aria-label="Максимальный вес в каратах"
                className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-[#FAFAFA] border border-[#D5D9E0] rounded-md"
              />
            </div>
            <DualRangeSlider
              min={sliderMinCarat}
              max={sliderMaxCarat}
              step={0.05}
              valueMin={filters.minCarat}
              valueMax={filters.maxCarat}
              onChangeMin={(nextMin) =>
                onChangeFilters((prev) => ({
                  ...prev,
                  minCarat: Number(Math.min(nextMin, prev.maxCarat).toFixed(2)),
                }))
              }
              onChangeMax={(nextMax) =>
                onChangeFilters((prev) => ({
                  ...prev,
                  maxCarat: Number(Math.max(nextMax, prev.minCarat).toFixed(2)),
                }))
              }
              ariaLabelMin="Нижняя граница каратности"
              ariaLabelMax="Верхняя граница каратности"
            />
          </div>

          {/* Price Range */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs gap-2">
              <span className="font-medium text-[#5A606D] shrink-0">
                Цена ({facets.primaryCurrency})
              </span>
              <span className="font-mono tabular-nums text-[#111317] truncate">
                {formatStonePrice(filters.minPrice, facets.primaryCurrency)} –{' '}
                {formatStonePrice(filters.maxPrice, facets.primaryCurrency)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumericInput
                min={0}
                max={filters.maxPrice}
                integerOnly
                emptyValue={0}
                value={filters.minPrice}
                onValueChange={(val) =>
                  onChangeFilters((prev) => ({
                    ...prev,
                    minPrice: Math.max(0, Math.min(val, prev.maxPrice)),
                  }))
                }
                aria-label="Минимальная цена"
                className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-[#FAFAFA] border border-[#D5D9E0] rounded-md"
              />
              <NumericInput
                min={filters.minPrice}
                max={sliderMaxPrice * 2}
                integerOnly
                emptyValue={Math.max(filters.minPrice, sliderMaxPrice)}
                value={filters.maxPrice}
                onValueChange={(val) =>
                  onChangeFilters((prev) => ({
                    ...prev,
                    maxPrice: Math.max(prev.minPrice, val),
                  }))
                }
                aria-label="Максимальная цена"
                className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-[#FAFAFA] border border-[#D5D9E0] rounded-md"
              />
            </div>
            <DualRangeSlider
              min={sliderMinPrice}
              max={sliderMaxPrice}
              step={priceStep}
              valueMin={filters.minPrice}
              valueMax={filters.maxPrice}
              onChangeMin={(nextMin) =>
                onChangeFilters((prev) => ({
                  ...prev,
                  minPrice: Math.min(nextMin, prev.maxPrice),
                }))
              }
              onChangeMax={(nextMax) =>
                onChangeFilters((prev) => ({
                  ...prev,
                  maxPrice: Math.max(nextMax, prev.minPrice),
                }))
              }
              ariaLabelMin="Нижняя граница цены"
              ariaLabelMax="Верхняя граница цены"
            />
          </div>
        </div>

        {/* Bottom Filter Bar: Lab, Count, Sort */}
        <div className="pt-4 border-t border-[#E4E6EB] flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-[#5A606D]">Сертификат:</span>
              <div className="inline-flex flex-wrap items-center gap-1 p-0.5 bg-[#F1F3F5] rounded-md">
                {facets.availableLabs.map((lab) => (
                  <button
                    key={lab}
                    type="button"
                    onClick={() =>
                      onChangeFilters((prev) => ({
                        ...prev,
                        certLab: lab,
                      }))
                    }
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                      filters.certLab === lab
                        ? 'bg-white text-[#111317] shadow-sm'
                        : 'text-[#5A606D] hover:text-[#111317]'
                    }`}
                  >
                    {lab === 'ALL' ? 'Все' : lab}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-[#5A606D] font-mono tabular-nums">
              Найдено {diamonds.length.toLocaleString('ru-RU')} из{' '}
              {(isWhiteDirectoryOnly || isFancyDirectoryOnly
                ? facets.scopeTotalCount
                : totalCount
              ).toLocaleString('ru-RU')}
            </span>
            <select
              value={filters.sortBy}
              onChange={(e) =>
                onChangeFilters((prev) => ({
                  ...prev,
                  sortBy: e.target.value as DiamondFilters['sortBy'],
                }))
              }
              aria-label="Сортировка каталога"
              className="px-3 py-1.5 text-xs bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg text-[#111317]"
            >
              <option value="price-asc">Цена: по возрастанию</option>
              <option value="price-desc">Цена: по убыванию</option>
              <option value="carat-desc">Вес: от большего к меньшему</option>
              <option value="carat-asc">Вес: от меньшего к большему</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results Grid (Paginated for 30,000-50,000 stone performance) */}
      <div id="catalog-results-top" className="space-y-6">
        {totalCount === 0 && fancyCount > 0 ? (
          <div className="bg-white border border-[#E4E6EB] rounded-xl p-12 text-center space-y-3">
            <h3 className="text-xl font-semibold text-[#111317]">
              Все загруженные камни ({fancyCount.toLocaleString('ru-RU')}) — цветные бриллианты
            </h3>
            <p className="text-sm text-[#5A606D] max-w-md mx-auto">
              Для них выделен специализированный раздел с фильтрами по интенсивности
              окраски (Faint–Vivid), тону, обертону и флуоресценции.
            </p>
            {onGoToFancy && (
              <button
                type="button"
                onClick={onGoToFancy}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-medium rounded-lg bg-[#1B365D] text-white hover:bg-[#142947] transition-colors"
              >
                Перейти в раздел «Цветные бриллианты» ({fancyCount.toLocaleString('ru-RU')})
              </button>
            )}
          </div>
        ) : diamonds.length === 0 ? (
          <div className="bg-white border border-[#E4E6EB] rounded-xl p-12 text-center space-y-3">
            <h3 className="text-xl font-semibold text-[#111317]">
              По выбранным фильтрам камни не найдены
            </h3>
            <p className="text-sm text-[#5A606D]">
              Попробуйте расширить диапазон цены или каратности, либо сбросьте фильтры.
            </p>
            <button
              type="button"
              onClick={onResetFilters}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-[#1B365D] text-white hover:bg-[#142947] transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Сбросить все фильтры
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {visibleDiamonds.map((diamond) => (
                <DiamondCard
                  key={diamond.id}
                  diamond={diamond}
                  isCompared={comparedSet.has(diamond.id)}
                  isInCart={cartSet.has(diamond.id)}
                  isWatched={watchedDiamondIds.has(diamond.id)}
                  onInspect={onInspect}
                  onToggleCompare={onToggleCompare}
                  onToggleCart={onToggleCart}
                  onFindPair={onFindPair}
                  onToggleWatch={onToggleWatch}
                />
              ))}
            </div>

            <PaginationBar
              totalItems={diamonds.length}
              page={safePage}
              pageSize={pageSize}
              pageSizeOptions={[24, 48, 96]}
              onPageChange={handlePageChange}
              onPageSizeChange={(nextSize) => {
                setPageSize(nextSize);
                setPage(1);
              }}
              itemLabel="камней"
            />
          </>
        )}
      </div>
    </section>
  );
};
