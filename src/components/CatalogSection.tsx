import React, { useMemo } from 'react';
import {
  FileSpreadsheet,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import {
  ALL_CLARITIES,
  ALL_COLORS,
  ALL_SHAPES,
  SHAPE_SHORT_RU,
  formatStonePrice,
  getColorHexTint,
} from '../data/diamonds';
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
import { NumericInput } from './NumericInput';

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
  watchedDiamondIds: Set<string>;
  onInspect: (diamond: Diamond, tab?: 'photo' | 'video' | 'cert') => void;
  onToggleCompare: (diamondId: string) => void;
  onFindPair: (diamond: Diamond) => void;
  onToggleWatch: (diamond: Diamond) => void;
  onOpenExcelImport: () => void;
}

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
  watchedDiamondIds,
  onInspect,
  onToggleCompare,
  onFindPair,
  onToggleWatch,
  onOpenExcelImport,
}) => {
  const facets = useMemo(() => {
    const stoneTypesSet = new Set<string>();
    const colorFamiliesSet = new Set<string>();
    const colorsSet = new Set<string>();
    const claritiesSet = new Set<string>();
    const labsSet = new Set<string>(['GIA', 'IGI', 'HRD']);
    const shapeCounts = new Map<DiamondShape, number>();

    let minCarat = Infinity;
    let maxCarat = 0;
    let minPrice = Infinity;
    let maxPrice = 0;

    const currencyCounts = new Map<PriceCurrency, number>();

    for (const d of catalog) {
      stoneTypesSet.add(d.stoneType || 'Бриллиант');
      colorFamiliesSet.add(d.colorFamily || 'Бесцветный (D–J)');
      colorsSet.add(d.color);
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

    const hasColoredStones = Array.from(colorFamiliesSet).some(
      (f) => f !== 'Бесцветный (D–J)'
    );
    const hasCustomStoneTypes =
      stoneTypesSet.size > 1 ||
      (stoneTypesSet.size === 1 && !stoneTypesSet.has('Бриллиант'));

    const availableColors = hasColoredStones
      ? Array.from(colorsSet)
      : ALL_COLORS;

    const extraClarities = Array.from(claritiesSet).filter(
      (cl) => !ALL_CLARITIES.includes(cl)
    );
    const availableClarities =
      extraClarities.length > 0 && claritiesSet.size > 0
        ? Array.from(
            new Set([
              ...ALL_CLARITIES.filter((c) => claritiesSet.has(c)),
              ...extraClarities,
            ])
          )
        : ALL_CLARITIES;

    return {
      stoneTypes: Array.from(stoneTypesSet),
      colorFamilies: Array.from(colorFamiliesSet),
      availableColors,
      availableClarities,
      availableLabs: ['ALL', ...Array.from(labsSet)],
      shapeCounts,
      hasColoredStones,
      hasCustomStoneTypes,
      primaryCurrency,
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
  }, [catalog]);

  const toggleShape = (shape: DiamondShape) => {
    onChangeFilters((prev) => ({
      ...prev,
      shapes: prev.shapes.includes(shape)
        ? prev.shapes.filter((s) => s !== shape)
        : [...prev.shapes, shape],
    }));
  };

  const toggleStoneType = (stoneType: string) => {
    onChangeFilters((prev) => ({
      ...prev,
      stoneTypes: prev.stoneTypes.includes(stoneType)
        ? prev.stoneTypes.filter((s) => s !== stoneType)
        : [...prev.stoneTypes, stoneType],
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
    filters.colors.length > 0 ||
    filters.clarities.length > 0 ||
    filters.minCarat > facets.boundMinCarat + 0.25 ||
    filters.maxCarat < facets.boundMaxCarat - 0.5 ||
    filters.minPrice > facets.boundMinPrice ||
    filters.maxPrice < facets.boundMaxPrice ||
    filters.certLab !== 'ALL' ||
    filters.onlyPriceDrops ||
    filters.searchQuery.trim() !== '';

  const priceStep = facets.primaryCurrency === 'RUB' ? 5000 : 500;
  const sliderMaxCarat = Math.max(facets.boundMaxCarat, filters.maxCarat);
  const sliderMaxPrice = Math.max(facets.boundMaxPrice, filters.maxPrice);

  return (
    <section id="catalog-grid" className="max-w-7xl mx-auto px-6 py-10 space-y-8">
      {/* Multi-Axis Filter Panel */}
      <div className="bg-white border border-[#E4E6EB] rounded-xl p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#E4E6EB]">
          <div className="flex items-center gap-2.5">
            <SlidersHorizontal className="w-4 h-4 text-[#1B365D]" />
            <h2 className="text-xl font-semibold text-[#111317]">
              Параметры подбора камней
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

            <button
              type="button"
              onClick={onOpenExcelImport}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg border border-[#1B365D] bg-[#F8FAFC] text-[#1B365D] hover:bg-[#EEF2F7] transition-colors whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Загрузить из .xlsx
            </button>

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

        {/* Stone Type & Color Family Row (shown automatically when colored gems / multiple minerals are loaded) */}
        {(facets.hasCustomStoneTypes || facets.hasColoredStones) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-2">
            {facets.hasCustomStoneTypes && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-[#5A606D]">
                  Минерал / Тип камня
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {facets.stoneTypes.map((st) => {
                    const active = filters.stoneTypes.includes(st);
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => toggleStoneType(st)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-[#1B365D] border-[#1B365D] text-white'
                            : 'bg-[#FAFAFA] border-[#E4E6EB] text-[#111317] hover:border-[#BFC6D2]'
                        }`}
                      >
                        {st}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {facets.hasColoredStones && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-[#5A606D]">
                  Цветовая группа / Оттенок
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {facets.colorFamilies.map((family) => {
                    const active = filters.colorFamilies.includes(family);
                    const swatch = getColorHexTint('', family).deep;
                    return (
                      <button
                        key={family}
                        type="button"
                        onClick={() => toggleColorFamily(family)}
                        className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-[#1B365D] border-[#1B365D] text-white'
                            : 'bg-[#FAFAFA] border-[#E4E6EB] text-[#111317] hover:border-[#BFC6D2]'
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
          </div>
        )}

        {/* Shape Selector Row (All 14 Diamond & Gemstone Cuts in a clean 2×7 Grid) */}
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

        {/* Color, Clarity, Carat, Price Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-2">
          {/* Color */}
          <div className="space-y-2.5">
            <div className="text-xs font-medium text-[#5A606D]">
              {facets.hasColoredStones ? 'Цвет / Оттенок' : 'Цвет (D–J)'}
            </div>
            {!facets.hasColoredStones ? (
              <div className="grid grid-cols-7 gap-1">
                {ALL_COLORS.map((color) => {
                  const active = filters.colors.includes(color);
                  return (
                    <button
                      key={color}
                      type="button"
                      onClick={() => toggleColor(color)}
                      className={`h-9 text-xs font-mono rounded-md border transition-colors ${
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
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                {facets.availableColors.map((color) => {
                  const active = filters.colors.includes(color);
                  return (
                    <button
                      key={color}
                      type="button"
                      onClick={() => toggleColor(color)}
                      className={`px-2.5 py-1.5 text-xs rounded-md border transition-colors ${
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
            )}
          </div>

          {/* Clarity */}
          <div className="space-y-2.5">
            <div className="text-xs font-medium text-[#5A606D]">Чистота</div>
            <div className="grid grid-cols-4 gap-1">
              {facets.availableClarities.slice(0, 12).map((clarity) => {
                const active = filters.clarities.includes(clarity);
                return (
                  <button
                    key={clarity}
                    type="button"
                    onClick={() => toggleClarity(clarity)}
                    title={clarity}
                    className={`h-9 px-1 text-xs font-mono rounded-md border transition-colors truncate ${
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
                    minCarat: Math.max(0, val),
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
                    maxCarat: Math.max(0, val),
                  }))
                }
                aria-label="Максимальный вес в каратах"
                className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-[#FAFAFA] border border-[#D5D9E0] rounded-md"
              />
            </div>
            <input
              type="range"
              min={facets.boundMinCarat}
              max={sliderMaxCarat}
              step="0.05"
              value={filters.maxCarat}
              onChange={(e) =>
                onChangeFilters((prev) => ({
                  ...prev,
                  maxCarat: Math.max(prev.minCarat, Number(e.target.value)),
                }))
              }
              aria-label="Верхняя граница каратности"
              className="w-full accent-[#1B365D] cursor-pointer"
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
                    minPrice: Math.max(0, val),
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
                    maxPrice: Math.max(0, val),
                  }))
                }
                aria-label="Максимальная цена"
                className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-[#FAFAFA] border border-[#D5D9E0] rounded-md"
              />
            </div>
            <input
              type="range"
              min={facets.boundMinPrice}
              max={sliderMaxPrice}
              step={priceStep}
              value={filters.maxPrice}
              onChange={(e) =>
                onChangeFilters((prev) => ({
                  ...prev,
                  maxPrice: Math.max(prev.minPrice, Number(e.target.value)),
                }))
              }
              aria-label="Верхняя граница цены"
              className="w-full accent-[#1B365D] cursor-pointer"
            />
          </div>
        </div>

        {/* Bottom Filter Bar: Lab, Price Drops, Sort */}
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
            <span className="text-xs text-[#5A606D] tabular-nums">
              Показано {diamonds.length} из {totalCount}
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

      {/* Results Grid */}
      {totalCount === 0 && fancyCount > 0 ? (
        <div className="bg-white border border-[#E4E6EB] rounded-xl p-12 text-center space-y-3">
          <h3 className="text-xl font-semibold text-[#111317]">
            Все загруженные камни ({fancyCount}) — цветные бриллианты
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
              Перейти в раздел «Цветные бриллианты» ({fancyCount})
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {diamonds.map((diamond) => (
            <DiamondCard
              key={diamond.id}
              diamond={diamond}
              isCompared={comparedIds.includes(diamond.id)}
              isWatched={watchedDiamondIds.has(diamond.id)}
              onInspect={onInspect}
              onToggleCompare={onToggleCompare}
              onFindPair={onFindPair}
              onToggleWatch={onToggleWatch}
            />
          ))}
        </div>
      )}
    </section>
  );
};
