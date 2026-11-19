import React, { useMemo, useState } from 'react';
import {
  FileSpreadsheet,
  GitCompare,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import {
  ALL_CLARITIES,
  ALL_SHAPES,
  FANCY_INTENSITIES,
  SHAPE_SHORT_RU,
  extractFancyIntensity,
  formatStonePrice,
  getColorHexTint,
} from '../data/diamonds';
import {
  Diamond,
  DiamondShape,
  PriceCurrency,
} from '../types/diamond';
import { DiamondCard } from './DiamondCard';
import { DiamondShapeIcon } from './DiamondShapeIcon';
import { NumericInput } from './NumericInput';

interface FancyDiamondsViewProps {
  diamonds: Diamond[];
  comparedIds: string[];
  watchedDiamondIds: Set<string>;
  onInspect: (diamond: Diamond, tab?: 'photo' | 'video' | 'cert') => void;
  onToggleCompare: (diamondId: string) => void;
  onFindPair: (diamond: Diamond) => void;
  onToggleWatch: (diamond: Diamond) => void;
  onOpenExcelImport: () => void;
  onGoToPairFinder: () => void;
  onExportSheets: (stones: Diamond[], label: string) => void;
}

type SortBy = 'price-asc' | 'price-desc' | 'carat-desc' | 'carat-asc' | 'drop-desc';

export const FancyDiamondsView: React.FC<FancyDiamondsViewProps> = ({
  diamonds,
  comparedIds,
  watchedDiamondIds,
  onInspect,
  onToggleCompare,
  onFindPair,
  onToggleWatch,
  onOpenExcelImport,
  onGoToPairFinder,
  onExportSheets,
}) => {
  const [selectedColorFamilies, setSelectedColorFamilies] = useState<string[]>([]);
  const [selectedIntensities, setSelectedIntensities] = useState<string[]>([]);
  const [selectedShapes, setSelectedShapes] = useState<DiamondShape[]>([]);
  const [selectedClarities, setSelectedClarities] = useState<string[]>([]);
  const [minCarat, setMinCarat] = useState<number>(0.2);
  const [maxCarat, setMaxCarat] = useState<number>(10.0);
  const [minPrice, setMinPrice] = useState<number>(0);
  const [maxPrice, setMaxPrice] = useState<number>(200000);
  const [certLab, setCertLab] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortBy>('price-asc');

  const facets = useMemo(() => {
    const colorFamilyCounts = new Map<string, number>();
    const intensityCounts = new Map<string, number>();
    const shapeCounts = new Map<DiamondShape, number>();
    const claritiesSet = new Set<string>();
    const labsSet = new Set<string>(['GIA', 'IGI', 'HRD']);
    const currencyCounts = new Map<PriceCurrency, number>();

    let minC = Infinity;
    let maxC = 0;
    let minP = Infinity;
    let maxP = 0;

    for (const d of diamonds) {
      const fam = d.colorFamily || 'Фантазийный';
      colorFamilyCounts.set(fam, (colorFamilyCounts.get(fam) || 0) + 1);

      const intensity = d.fancyIntensity || extractFancyIntensity(d.color);
      intensityCounts.set(intensity, (intensityCounts.get(intensity) || 0) + 1);

      shapeCounts.set(d.shape, (shapeCounts.get(d.shape) || 0) + 1);
      claritiesSet.add(d.clarity);
      if (d.certLab) labsSet.add(d.certLab);

      if (d.carat < minC) minC = d.carat;
      if (d.carat > maxC) maxC = d.carat;
      if (d.priceUsd < minP) minP = d.priceUsd;
      if (d.priceUsd > maxP) maxP = d.priceUsd;

      const cur = d.currency || 'USD';
      currencyCounts.set(cur, (currencyCounts.get(cur) || 0) + 1);
    }

    let primaryCurrency: PriceCurrency = 'USD';
    let topCount = -1;
    for (const [cur, cnt] of currencyCounts.entries()) {
      if (cnt > topCount) {
        topCount = cnt;
        primaryCurrency = cur;
      }
    }

    const extraIntensities = Array.from(intensityCounts.keys()).filter(
      (i) => !(FANCY_INTENSITIES as readonly string[]).includes(i)
    );
    const availableIntensities = [...FANCY_INTENSITIES, ...extraIntensities];

    const extraClarities = Array.from(claritiesSet).filter(
      (cl) => !ALL_CLARITIES.includes(cl)
    );
    const availableClarities =
      claritiesSet.size > 0
        ? Array.from(
            new Set([
              ...ALL_CLARITIES.filter((c) => claritiesSet.has(c)),
              ...extraClarities,
            ])
          )
        : ALL_CLARITIES;

    return {
      colorFamilies: Array.from(colorFamilyCounts.keys()),
      colorFamilyCounts,
      availableIntensities,
      intensityCounts,
      shapeCounts,
      availableClarities,
      availableLabs: ['ALL', ...Array.from(labsSet)],
      primaryCurrency,
      boundMinCarat: Number.isFinite(minC) ? Math.max(0.05, Math.floor(minC * 20) / 20) : 0.2,
      boundMaxCarat: maxC > 0 ? Math.max(5.0, Math.ceil(maxC * 10) / 10) : 10.0,
      boundMinPrice: Number.isFinite(minP) ? Math.max(0, Math.floor(minP / 500) * 500) : 0,
      boundMaxPrice: maxP > 0 ? Math.max(150000, Math.ceil(maxP / 1000) * 1000) : 200000,
      actualMinCarat: Number.isFinite(minC) ? minC : 0,
      actualMaxCarat: maxC,
    };
  }, [diamonds]);

  const filteredDiamonds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const list = diamonds.filter((d) => {
      const fam = d.colorFamily || 'Фантазийный';
      if (selectedColorFamilies.length > 0 && !selectedColorFamilies.includes(fam)) {
        return false;
      }
      const intensity = d.fancyIntensity || extractFancyIntensity(d.color);
      if (selectedIntensities.length > 0 && !selectedIntensities.includes(intensity)) {
        return false;
      }
      if (selectedShapes.length > 0 && !selectedShapes.includes(d.shape)) {
        return false;
      }
      if (selectedClarities.length > 0 && !selectedClarities.includes(d.clarity)) {
        return false;
      }
      if (d.carat < minCarat || d.carat > maxCarat) {
        return false;
      }
      if (d.priceUsd < minPrice || d.priceUsd > maxPrice) {
        return false;
      }
      if (certLab !== 'ALL' && d.certLab.toUpperCase() !== certLab.toUpperCase()) {
        return false;
      }
      if (
        q &&
        !d.sku.toLowerCase().includes(q) &&
        !d.color.toLowerCase().includes(q) &&
        !(d.colorFamily || '').toLowerCase().includes(q) &&
        !(d.fancyIntensity || '').toLowerCase().includes(q) &&
        !(d.fancyOvertone || '').toLowerCase().includes(q) &&
        !d.certNumber.toLowerCase().includes(q) &&
        !SHAPE_SHORT_RU[d.shape].toLowerCase().includes(q) &&
        !d.origin.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'price-asc':
          return a.priceUsd - b.priceUsd;
        case 'price-desc':
          return b.priceUsd - a.priceUsd;
        case 'carat-desc':
          return b.carat - a.carat;
        case 'carat-asc':
          return a.carat - b.carat;
        case 'drop-desc': {
          const dropA = a.previousPriceUsd
            ? (a.previousPriceUsd - a.priceUsd) / a.previousPriceUsd
            : 0;
          const dropB = b.previousPriceUsd
            ? (b.previousPriceUsd - b.priceUsd) / b.previousPriceUsd
            : 0;
          return dropB - dropA;
        }
      }
    });
  }, [
    diamonds,
    selectedColorFamilies,
    selectedIntensities,
    selectedShapes,
    selectedClarities,
    minCarat,
    maxCarat,
    minPrice,
    maxPrice,
    certLab,
    searchQuery,
    sortBy,
  ]);

  const toggleItem = <T,>(
    setter: React.Dispatch<React.SetStateAction<T[]>>,
    value: T
  ) => {
    setter((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    );
  };

  const resetFilters = () => {
    setSelectedColorFamilies([]);
    setSelectedIntensities([]);
    setSelectedShapes([]);
    setSelectedClarities([]);
    setMinCarat(Math.min(0.2, facets.boundMinCarat));
    setMaxCarat(Math.max(10.0, facets.boundMaxCarat));
    setMinPrice(facets.boundMinPrice);
    setMaxPrice(Math.max(200000, facets.boundMaxPrice));
    setCertLab('ALL');
    setSearchQuery('');
  };

  const hasActiveFilters =
    selectedColorFamilies.length > 0 ||
    selectedIntensities.length > 0 ||
    selectedShapes.length > 0 ||
    selectedClarities.length > 0 ||
    minCarat > facets.boundMinCarat + 0.1 ||
    maxCarat < facets.boundMaxCarat - 0.1 ||
    minPrice > facets.boundMinPrice ||
    maxPrice < Math.min(200000, facets.boundMaxPrice) ||
    certLab !== 'ALL' ||
    searchQuery.trim() !== '';

  const priceStep = facets.primaryCurrency === 'RUB' ? 5000 : 1000;
  const sliderMaxCarat = Math.max(facets.boundMaxCarat, maxCarat);
  const sliderMaxPrice = Math.max(facets.boundMaxPrice, maxPrice);

  return (
    <div>
      {/* Editorial Directory Header */}
      <section className="bg-white border-b border-[#E4E6EB]">
        <div className="max-w-7xl mx-auto px-6 py-10 space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="space-y-2.5 max-w-3xl">
              <div className="text-xs font-medium text-[#5A606D] tracking-wide">
                Директория редких камней · Шкала GIA Fancy Color · Прямые сертификаты
              </div>
              <h1
                className="text-3xl sm:text-4xl font-semibold text-[#111317] tracking-tight"
                style={{ textWrap: 'balance' }}
              >
                Цветные бриллианты (Fancy Color)
              </h1>
              <p className="text-sm sm:text-base text-[#5A606D] leading-relaxed">
                Специализированный раздел сертифицированных фантазийных бриллиантов:
                жёлтых, розовых, голубых, зелёных и коньячных оттенков с фильтрацией по
                насыщенности GIA (от Fancy Light до Fancy Vivid) и подбору пар.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onOpenExcelImport}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium rounded-lg bg-[#1B365D] text-white hover:bg-[#142947] transition-colors whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Загрузить .xlsx в директорию
              </button>
              <button
                type="button"
                onClick={onGoToPairFinder}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium rounded-lg border border-[#D5D9E0] bg-white text-[#111317] hover:bg-[#F7F8FA] transition-colors whitespace-nowrap shrink-0"
              >
                <GitCompare className="w-4 h-4 text-[#1B365D]" />
                Подбор пары
              </button>
              {filteredDiamonds.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    onExportSheets(filteredDiamonds, 'Директория «Цветные бриллианты»')
                  }
                  className="px-4 py-2.5 text-xs font-medium rounded-lg border border-[#D5D9E0] bg-white text-[#111317] hover:bg-[#F7F8FA] transition-colors whitespace-nowrap shrink-0"
                >
                  Экспорт в Google Sheets
                </button>
              )}
            </div>
          </div>

          {/* 4-Column Summary Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pt-6 border-t border-[#E4E6EB] text-sm">
            <div>
              <div className="font-mono tabular-nums text-lg font-semibold text-[#111317]">
                {diamonds.length} камней
              </div>
              <div className="text-xs text-[#5A606D] mt-0.5">
                В директории Цветные бриллианты
              </div>
            </div>
            <div>
              <div className="font-mono tabular-nums text-lg font-semibold text-[#111317]">
                {facets.colorFamilies.length} оттенков
              </div>
              <div className="text-xs text-[#5A606D] mt-0.5">
                Жёлтый, розовый, синий, зелёный, коньяк
              </div>
            </div>
            <div>
              <div className="font-mono tabular-nums text-lg font-semibold text-[#111317]">
                {facets.actualMinCarat.toFixed(2)} – {facets.actualMaxCarat.toFixed(2)} ct
              </div>
              <div className="text-xs text-[#5A606D] mt-0.5">
                Диапазон каратности подборки
              </div>
            </div>
            <div>
              <div className="font-mono text-lg font-semibold text-[#111317]">
                GIA Fancy Scale
              </div>
              <div className="text-xs text-[#5A606D] mt-0.5">
                Контроль насыщенности и подтонов
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Directory Workspace */}
      <section className="max-w-7xl mx-auto px-6 py-10 space-y-8">
        <div className="bg-white border border-[#E4E6EB] rounded-xl p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#E4E6EB]">
            <div className="flex items-center gap-2.5">
              <SlidersHorizontal className="w-4 h-4 text-[#1B365D]" />
              <h2 className="text-xl font-semibold text-[#111317]">
                Фильтры директории цветных бриллиантов
              </h2>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#6B7280] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск по SKU, оттенку, подтону или № сертификата"
                  aria-label="Поиск по цветным бриллиантам"
                  className="pl-8 pr-3 py-1.5 text-xs bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg w-64 sm:w-80 focus:outline-none focus:border-[#1B365D]"
                />
              </div>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[#D5D9E0] text-[#5A606D] hover:text-[#111317] hover:bg-[#F7F8FA] transition-colors whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Сбросить фильтры
                </button>
              )}
            </div>
          </div>

          {/* Fancy Color Family + GIA Fancy Intensity Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-2.5">
              <div className="text-xs font-medium text-[#5A606D]">
                Основной цвет (Hue)
              </div>
              <div className="flex flex-wrap gap-2">
                {facets.colorFamilies.map((family) => {
                  const active = selectedColorFamilies.includes(family);
                  const swatch = getColorHexTint('', family).deep;
                  const count = facets.colorFamilyCounts.get(family) || 0;
                  return (
                    <button
                      key={family}
                      type="button"
                      onClick={() => toggleItem(setSelectedColorFamilies, family)}
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
                      <span>{family}</span>
                      <span
                        className={`font-mono tabular-nums ${
                          active ? 'text-white/80' : 'text-[#6B7280]'
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="text-xs font-medium text-[#5A606D]">
                Насыщенность цвета (GIA Fancy Scale)
              </div>
              <div className="flex flex-wrap gap-2">
                {facets.availableIntensities.map((intensity) => {
                  const active = selectedIntensities.includes(intensity);
                  const count = facets.intensityCounts.get(intensity) || 0;
                  return (
                    <button
                      key={intensity}
                      type="button"
                      onClick={() => toggleItem(setSelectedIntensities, intensity)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-[#1B365D] border-[#1B365D] text-white'
                          : count > 0
                            ? 'bg-[#FAFAFA] border-[#E4E6EB] text-[#111317] hover:border-[#BFC6D2]'
                            : 'bg-[#FAFAFA]/60 border-[#E4E6EB]/70 text-[#8A919E] hover:text-[#111317] hover:border-[#BFC6D2]'
                      }`}
                    >
                      <span>{intensity}</span>
                      {count > 0 && (
                        <span
                          className={`font-mono tabular-nums ${
                            active ? 'text-white/80' : 'text-[#6B7280]'
                          }`}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* All 14 Shapes 2x7 Grid */}
          <div className="space-y-2.5">
            <div className="text-xs font-medium text-[#5A606D]">Форма огранки</div>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {ALL_SHAPES.map((shape) => {
                const active = selectedShapes.includes(shape);
                const count = facets.shapeCounts.get(shape) || 0;
                return (
                  <button
                    key={shape}
                    type="button"
                    onClick={() => toggleItem(setSelectedShapes, shape)}
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

          {/* Clarity, Carat, Price Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
            {/* Clarity */}
            <div className="space-y-2.5">
              <div className="text-xs font-medium text-[#5A606D]">Чистота</div>
              <div className="grid grid-cols-4 gap-1">
                {facets.availableClarities.slice(0, 12).map((clarity) => {
                  const active = selectedClarities.includes(clarity);
                  return (
                    <button
                      key={clarity}
                      type="button"
                      onClick={() => toggleItem(setSelectedClarities, clarity)}
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
                  {minCarat.toFixed(2)} – {maxCarat.toFixed(2)} ct
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumericInput
                  min={0}
                  max={maxCarat}
                  emptyValue={0}
                  value={minCarat}
                  onValueChange={(val) => setMinCarat(Math.max(0, val))}
                  aria-label="Минимальный вес в каратах"
                  className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-[#FAFAFA] border border-[#D5D9E0] rounded-md"
                />
                <NumericInput
                  min={minCarat}
                  max={sliderMaxCarat * 2}
                  emptyValue={Math.max(minCarat, sliderMaxCarat)}
                  value={maxCarat}
                  onValueChange={(val) => setMaxCarat(Math.max(0, val))}
                  aria-label="Максимальный вес в каратах"
                  className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-[#FAFAFA] border border-[#D5D9E0] rounded-md"
                />
              </div>
              <input
                type="range"
                min={facets.boundMinCarat}
                max={sliderMaxCarat}
                step="0.05"
                value={maxCarat}
                onChange={(e) =>
                  setMaxCarat(Math.max(minCarat, Number(e.target.value)))
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
                  {formatStonePrice(minPrice, facets.primaryCurrency)} –{' '}
                  {formatStonePrice(maxPrice, facets.primaryCurrency)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumericInput
                  min={0}
                  max={maxPrice}
                  integerOnly
                  emptyValue={0}
                  value={minPrice}
                  onValueChange={(val) => setMinPrice(Math.max(0, val))}
                  aria-label="Минимальная цена"
                  className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-[#FAFAFA] border border-[#D5D9E0] rounded-md"
                />
                <NumericInput
                  min={minPrice}
                  max={sliderMaxPrice * 2}
                  integerOnly
                  emptyValue={Math.max(minPrice, sliderMaxPrice)}
                  value={maxPrice}
                  onValueChange={(val) => setMaxPrice(Math.max(0, val))}
                  aria-label="Максимальная цена"
                  className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-[#FAFAFA] border border-[#D5D9E0] rounded-md"
                />
              </div>
              <input
                type="range"
                min={facets.boundMinPrice}
                max={sliderMaxPrice}
                step={priceStep}
                value={maxPrice}
                onChange={(e) =>
                  setMaxPrice(Math.max(minPrice, Number(e.target.value)))
                }
                aria-label="Верхняя граница цены"
                className="w-full accent-[#1B365D] cursor-pointer"
              />
            </div>
          </div>

          {/* Bottom Bar: Cert Lab, Drops, Count, Sort */}
          <div className="pt-4 border-t border-[#E4E6EB] flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-[#5A606D]">Сертификат:</span>
                <div className="inline-flex flex-wrap items-center gap-1 p-0.5 bg-[#F1F3F5] rounded-md">
                  {facets.availableLabs.map((lab) => (
                    <button
                      key={lab}
                      type="button"
                      onClick={() => setCertLab(lab)}
                      className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                        certLab === lab
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
                Показано {filteredDiamonds.length} из {diamonds.length}
              </span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                aria-label="Сортировка цветных бриллиантов"
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
        {filteredDiamonds.length === 0 ? (
          <div className="bg-white border border-[#E4E6EB] rounded-xl p-12 text-center space-y-3">
            <h3 className="text-xl font-semibold text-[#111317]">
              Цветные бриллианты по выбранным параметрам не найдены
            </h3>
            <p className="text-sm text-[#5A606D]">
              Сбросьте фильтры оттенков и интенсивности или загрузите новую партию из файла .xlsx.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-[#1B365D] text-white hover:bg-[#142947] transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Сбросить фильтры
              </button>
              <button
                type="button"
                onClick={onOpenExcelImport}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg border border-[#D5D9E0] bg-white text-[#111317] hover:bg-[#F7F8FA] transition-colors"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-[#1B365D]" />
                Загрузить из .xlsx
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredDiamonds.map((diamond) => (
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
    </div>
  );
};
