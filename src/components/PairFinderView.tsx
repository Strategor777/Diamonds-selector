import React, { useMemo, useState } from 'react';
import {
  Check,
  ExternalLink,
  FileSpreadsheet,
  GitCompare,
  Scale,
  SlidersHorizontal,
} from 'lucide-react';
import {
  ALL_CLARITIES,
  ALL_COLORS,
  ALL_SHAPES,
  SHAPE_LABELS_RU,
  SHAPE_SHORT_RU,
  formatStonePrice,
  getColorHexTint,
} from '../data/diamonds';
import { classifyColorFamily } from '../lib/diamondMapper';
import { PairAnchorSpec, findMatchedPairs } from '../lib/pairMatcher';
import {
  Diamond,
  DiamondClarity,
  DiamondColor,
  DiamondShape,
  PairMatchCriteria,
} from '../types/diamond';
import { DiamondShapeIcon } from './DiamondShapeIcon';
import { NumericInput } from './NumericInput';

interface PairFinderViewProps {
  catalog: Diamond[];
  initialAnchorId?: string | null;
  comparedIds: string[];
  onInspect: (diamond: Diamond, tab?: 'photo' | 'video' | 'cert') => void;
  onComparePair: (stoneAId: string, stoneBId: string) => void;
  onExportPairToSheets: (stones: Diamond[], label: string) => void;
}

export const PairFinderView: React.FC<PairFinderViewProps> = ({
  catalog,
  initialAnchorId,
  onInspect,
  onComparePair,
  onExportPairToSheets,
}) => {
  const [anchorMode, setAnchorMode] = useState<'catalog' | 'custom'>('catalog');
  const [selectedAnchorId, setSelectedAnchorId] = useState<string>(
    initialAnchorId || catalog[0]?.id || ''
  );
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);

  // Custom anchor specification state
  const [customShape, setCustomShape] = useState<DiamondShape>('Round');
  const [customCarat, setCustomCarat] = useState<number>(1.5);
  const [customColor, setCustomColor] = useState<DiamondColor>('D');
  const [customClarity, setCustomClarity] = useState<DiamondClarity>('VVS1');
  const [customLengthMm, setCustomLengthMm] = useState<number>(7.35);
  const [customWidthMm, setCustomWidthMm] = useState<number>(7.38);

  const [criteria, setCriteria] = useState<PairMatchCriteria>({
    caratTolerance: 0.08,
    sizeToleranceMm: 0.2,
    colorToleranceSteps: 1,
    clarityToleranceSteps: 2,
    requireSameShape: true,
    maxPriceDiffPercent: 0,
  });

  // Sync if user clicked "Найти пару" on a specific card
  React.useEffect(() => {
    if (initialAnchorId) {
      setAnchorMode('catalog');
      setSelectedAnchorId(initialAnchorId);
      setSelectedCandidateId(null);
    }
  }, [initialAnchorId]);

  const anchorCatalogStone = useMemo(
    () => catalog.find((d) => d.id === selectedAnchorId) || catalog[0] || null,
    [catalog, selectedAnchorId]
  );

  const availableColorOptions = useMemo(() => {
    const set = new Set<string>(ALL_COLORS);
    catalog.forEach((d) => {
      if (d.color) set.add(d.color);
    });
    return Array.from(set);
  }, [catalog]);

  const availableClarityOptions = useMemo(() => {
    const set = new Set<string>(ALL_CLARITIES);
    catalog.forEach((d) => {
      if (d.clarity) set.add(d.clarity);
    });
    return Array.from(set);
  }, [catalog]);

  const effectiveAnchor: PairAnchorSpec | null = useMemo(() => {
    if (anchorMode === 'catalog') {
      if (!anchorCatalogStone) return null;
      return {
        id: anchorCatalogStone.id,
        sku: anchorCatalogStone.sku,
        shape: anchorCatalogStone.shape,
        carat: anchorCatalogStone.carat,
        color: anchorCatalogStone.color,
        colorFamily: anchorCatalogStone.colorFamily,
        isFancyColor: anchorCatalogStone.isFancyColor,
        fancyIntensity: anchorCatalogStone.fancyIntensity,
        primaryHue: anchorCatalogStone.primaryHue,
        clarity: anchorCatalogStone.clarity,
        lengthMm: anchorCatalogStone.lengthMm,
        widthMm: anchorCatalogStone.widthMm,
        lwRatio: anchorCatalogStone.lwRatio,
        priceUsd: anchorCatalogStone.priceUsd,
      };
    }
    return {
      shape: customShape,
      carat: customCarat,
      color: customColor,
      colorFamily: classifyColorFamily(customColor),
      clarity: customClarity,
      lengthMm: customLengthMm,
      widthMm: customWidthMm,
      lwRatio: Number((customLengthMm / Math.max(0.1, customWidthMm)).toFixed(2)),
    };
  }, [
    anchorMode,
    anchorCatalogStone,
    customShape,
    customCarat,
    customColor,
    customClarity,
    customLengthMm,
    customWidthMm,
  ]);

  const matches = useMemo(() => {
    if (!effectiveAnchor) return [];
    return findMatchedPairs(effectiveAnchor, catalog, criteria);
  }, [effectiveAnchor, catalog, criteria]);

  const activeCandidate = useMemo(() => {
    if (matches.length === 0) return null;
    return (
      matches.find((m) => m.diamond.id === selectedCandidateId) || matches[0]
    );
  }, [matches, selectedCandidateId]);

  return (
    <section className="max-w-7xl mx-auto px-6 py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 pb-6 border-b border-[#E4E6EB]">
        <div>
          <h2 className="text-3xl font-semibold text-[#111317]">
            Интеллектуальный подбор пары для камня
          </h2>
          <p className="text-sm text-[#5A606D] mt-1 max-w-2xl">
            Подбирайте идеальные парные бриллианты для серёг-пусет, запонок или боковых
            камней кольца с контролем геометрии в миллиметрах, цвета и каратности.
          </p>
        </div>

        <div className="inline-flex items-center gap-1 p-1 bg-[#EAECEF] rounded-lg">
          <button
            type="button"
            onClick={() => setAnchorMode('catalog')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              anchorMode === 'catalog'
                ? 'bg-white text-[#111317] shadow-sm'
                : 'text-[#5A606D] hover:text-[#111317]'
            }`}
          >
            Выбрать эталон из каталога
          </button>
          <button
            type="button"
            onClick={() => setAnchorMode('custom')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              anchorMode === 'custom'
                ? 'bg-white text-[#111317] shadow-sm'
                : 'text-[#5A606D] hover:text-[#111317]'
            }`}
          >
            Задать параметры своего камня
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Configuration Column */}
        <aside className="lg:col-span-4 bg-white border border-[#E4E6EB] rounded-xl p-6 space-y-6">
          {anchorMode === 'catalog' ? (
            <div className="space-y-3">
              <label
                htmlFor="anchor-stone-select"
                className="block text-xs font-medium text-[#5A606D]"
              >
                Эталонный камень из каталога
              </label>
              <select
                id="anchor-stone-select"
                value={selectedAnchorId}
                onChange={(e) => {
                  setSelectedAnchorId(e.target.value);
                  setSelectedCandidateId(null);
                }}
                className="w-full px-3 py-2.5 text-sm bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg text-[#111317] focus:outline-none focus:border-[#1B365D]"
              >
                {catalog.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.sku} · {SHAPE_SHORT_RU[d.shape]} {d.carat.toFixed(2)} ct · {d.color}/{d.clarity} ({d.lengthMm.toFixed(2)}×{d.widthMm.toFixed(2)} мм)
                  </option>
                ))}
              </select>

              {anchorCatalogStone && (
                <div className="p-4 bg-[#FAFAFA] border border-[#E4E6EB] rounded-lg flex items-center gap-3.5">
                  <DiamondShapeIcon
                    shape={anchorCatalogStone.shape}
                    className="w-10 h-10 text-[#1B365D] shrink-0"
                    filled
                  />
                  <div className="min-w-0 text-xs space-y-0.5">
                    <div className="font-semibold text-[#111317] truncate">
                      {anchorCatalogStone.stoneType &&
                      anchorCatalogStone.stoneType !== 'Бриллиант'
                        ? `${anchorCatalogStone.stoneType} · `
                        : ''}
                      {SHAPE_LABELS_RU[anchorCatalogStone.shape]}
                    </div>
                    <div className="font-mono tabular-nums text-[#5A606D]">
                      {anchorCatalogStone.carat.toFixed(2)} ct · {anchorCatalogStone.color} · {anchorCatalogStone.clarity}
                    </div>
                    <div className="font-mono tabular-nums text-[#5A606D]">
                      {anchorCatalogStone.lengthMm.toFixed(2)} × {anchorCatalogStone.widthMm.toFixed(2)} мм ·{' '}
                      {formatStonePrice(anchorCatalogStone.priceUsd, anchorCatalogStone.currency)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-xs font-medium text-[#5A606D]">
                Параметры вашего камня (для поиска второго в пару)
              </div>

              <div>
                <label className="block text-xs text-[#5A606D] mb-1.5">Форма огранки</label>
                <select
                  value={customShape}
                  onChange={(e) => setCustomShape(e.target.value as DiamondShape)}
                  className="w-full px-3 py-2 text-sm bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg"
                >
                  {ALL_SHAPES.map((s) => (
                    <option key={s} value={s}>
                      {SHAPE_LABELS_RU[s]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-xs text-[#5A606D] mb-1">Караты</label>
                  <NumericInput
                    min={0.1}
                    max={25}
                    emptyValue={1.0}
                    value={customCarat}
                    onValueChange={setCustomCarat}
                    className="w-full px-2.5 py-2 text-sm font-mono tabular-nums bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#5A606D] mb-1">Цвет</label>
                  <select
                    value={customColor}
                    onChange={(e) => setCustomColor(e.target.value as DiamondColor)}
                    className="w-full px-2.5 py-2 text-sm font-mono bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg"
                  >
                    {availableColorOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#5A606D] mb-1">Чистота</label>
                  <select
                    value={customClarity}
                    onChange={(e) => setCustomClarity(e.target.value as DiamondClarity)}
                    className="w-full px-2.5 py-2 text-sm font-mono bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg"
                  >
                    {availableClarityOptions.map((cl) => (
                      <option key={cl} value={cl}>
                        {cl}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs text-[#5A606D] mb-1">Длина (мм)</label>
                  <NumericInput
                    min={3}
                    max={20}
                    emptyValue={6.5}
                    value={customLengthMm}
                    onValueChange={setCustomLengthMm}
                    className="w-full px-2.5 py-2 text-sm font-mono tabular-nums bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#5A606D] mb-1">Ширина (мм)</label>
                  <NumericInput
                    min={3}
                    max={20}
                    emptyValue={6.5}
                    value={customWidthMm}
                    onValueChange={setCustomWidthMm}
                    className="w-full px-2.5 py-2 text-sm font-mono tabular-nums bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Tolerance Controls */}
          <div className="pt-5 border-t border-[#E4E6EB] space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#111317]">
              <SlidersHorizontal className="w-4 h-4 text-[#1B365D]" />
              Допуски подбора
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-[#5A606D]">Разброс по размеру (мм)</span>
                <span className="font-mono tabular-nums font-medium text-[#111317]">
                  ±{criteria.sizeToleranceMm.toFixed(2)} мм
                </span>
              </div>
              <input
                type="range"
                min={0.05}
                max={0.8}
                step={0.05}
                value={criteria.sizeToleranceMm}
                onChange={(e) =>
                  setCriteria((c) => ({ ...c, sizeToleranceMm: Number(e.target.value) }))
                }
                className="w-full accent-[#1B365D] cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-[#5A606D]">Разброс по каратам</span>
                <span className="font-mono tabular-nums font-medium text-[#111317]">
                  ±{criteria.caratTolerance.toFixed(2)} ct
                </span>
              </div>
              <input
                type="range"
                min={0.02}
                max={0.4}
                step={0.02}
                value={criteria.caratTolerance}
                onChange={(e) =>
                  setCriteria((c) => ({ ...c, caratTolerance: Number(e.target.value) }))
                }
                className="w-full accent-[#1B365D] cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-xs text-[#5A606D] mb-1.5">
                Отклонение по цвету
              </label>
              <div className="grid grid-cols-3 gap-1 p-1 bg-[#F1F3F5] rounded-lg">
                {[
                  { steps: 0, label: 'Точный' },
                  { steps: 1, label: '±1 грейд' },
                  { steps: 2, label: '±2 грейда' },
                ].map((opt) => (
                  <button
                    key={opt.steps}
                    type="button"
                    onClick={() =>
                      setCriteria((c) => ({ ...c, colorToleranceSteps: opt.steps }))
                    }
                    className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      criteria.colorToleranceSteps === opt.steps
                        ? 'bg-white text-[#111317] shadow-sm'
                        : 'text-[#5A606D] hover:text-[#111317]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-[#5A606D] mb-1.5">
                Отклонение по чистоте
              </label>
              <div className="grid grid-cols-3 gap-1 p-1 bg-[#F1F3F5] rounded-lg">
                {[
                  { steps: 0, label: 'Точная' },
                  { steps: 1, label: '±1 грейд' },
                  { steps: 3, label: '±3 грейда' },
                ].map((opt) => (
                  <button
                    key={opt.steps}
                    type="button"
                    onClick={() =>
                      setCriteria((c) => ({ ...c, clarityToleranceSteps: opt.steps }))
                    }
                    className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      criteria.clarityToleranceSteps === opt.steps
                        ? 'bg-white text-[#111317] shadow-sm'
                        : 'text-[#5A606D] hover:text-[#111317]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2.5 text-xs text-[#111317] cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={criteria.requireSameShape}
                onChange={(e) =>
                  setCriteria((c) => ({ ...c, requireSameShape: e.target.checked }))
                }
                className="w-4 h-4 accent-[#1B365D] rounded"
              />
              <span>Только совпадающая форма огранки</span>
            </label>
          </div>
        </aside>

        {/* Right Twin-Stone Visual Preview + Candidate List */}
        <div className="lg:col-span-8 space-y-6">
          {/* Twin Preview Stage */}
          {effectiveAnchor && activeCandidate ? (
            <div className="bg-white border border-[#E4E6EB] rounded-xl p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-[#5A606D]">
                    Визуальная примерка пары (масштаб 1:1 относительно друг друга)
                  </div>
                  <h3 className="text-xl font-semibold text-[#111317] mt-0.5">
                    Совместимость пары: {activeCandidate.compatibilityScore}%
                  </h3>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  {anchorMode === 'catalog' && anchorCatalogStone && (
                    <button
                      type="button"
                      onClick={() =>
                        onComparePair(anchorCatalogStone.id, activeCandidate.diamond.id)
                      }
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-[#D5D9E0] bg-white text-[#111317] hover:bg-[#F7F8FA] transition-colors whitespace-nowrap"
                    >
                      <Scale className="w-3.5 h-3.5" />
                      Сравнить пару
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const stones =
                        anchorMode === 'catalog' && anchorCatalogStone
                          ? [anchorCatalogStone, activeCandidate.diamond]
                          : [activeCandidate.diamond];
                      onExportPairToSheets(
                        stones,
                        `Подобранная пара (${SHAPE_SHORT_RU[activeCandidate.diamond.shape]})`
                      );
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-[#1B365D] text-white hover:bg-[#142947] transition-colors whitespace-nowrap"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Сохранить пару в Google Таблицы
                  </button>
                </div>
              </div>

              {/* Side-by-Side Earring / Twin Stone Visual Mount */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#FAFAFA] border border-[#E4E6EB] rounded-lg p-6">
                {/* Stone A (Anchor) */}
                <div className="flex items-center gap-4">
                  <div
                    className="w-24 h-24 rounded-full bg-white border border-[#E4E6EB] flex items-center justify-center shrink-0"
                    style={{
                      color:
                        effectiveAnchor.colorFamily &&
                        effectiveAnchor.colorFamily !== 'Бесцветный (D–J)'
                          ? getColorHexTint(
                              effectiveAnchor.color,
                              effectiveAnchor.colorFamily
                            ).deep
                          : '#1B365D',
                    }}
                  >
                    <DiamondShapeIcon
                      shape={effectiveAnchor.shape}
                      className="w-14 h-14"
                      filled
                    />
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="text-[#5A606D] font-medium">
                      Камень 1 (Эталон) {effectiveAnchor.sku ? `· ${effectiveAnchor.sku}` : ''}
                    </div>
                    <div className="text-sm font-semibold text-[#111317]">
                      {SHAPE_SHORT_RU[effectiveAnchor.shape]} {effectiveAnchor.carat.toFixed(2)} ct
                    </div>
                    <div className="font-mono tabular-nums text-[#5A606D]">
                      {effectiveAnchor.color} · {effectiveAnchor.clarity} · {effectiveAnchor.lengthMm.toFixed(2)}×{effectiveAnchor.widthMm.toFixed(2)} мм
                    </div>
                  </div>
                </div>

                {/* Stone B (Candidate) */}
                <div className="flex items-center gap-4 md:border-l md:border-[#E4E6EB] md:pl-6">
                  <div
                    className="w-24 h-24 rounded-full bg-white border border-[#E4E6EB] flex items-center justify-center shrink-0"
                    style={{
                      color:
                        activeCandidate.diamond.colorFamily &&
                        activeCandidate.diamond.colorFamily !== 'Бесцветный (D–J)'
                          ? getColorHexTint(
                              activeCandidate.diamond.color,
                              activeCandidate.diamond.colorFamily
                            ).deep
                          : '#1B365D',
                    }}
                  >
                    <DiamondShapeIcon
                      shape={activeCandidate.diamond.shape}
                      className="w-14 h-14"
                      filled
                    />
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="text-[#5A606D] font-medium">
                      Камень 2 (Пара) · {activeCandidate.diamond.sku}
                    </div>
                    <div className="text-sm font-semibold text-[#111317]">
                      {activeCandidate.diamond.stoneType &&
                      activeCandidate.diamond.stoneType !== 'Бриллиант'
                        ? `${activeCandidate.diamond.stoneType} · `
                        : ''}
                      {SHAPE_SHORT_RU[activeCandidate.diamond.shape]}{' '}
                      {activeCandidate.diamond.carat.toFixed(2)} ct
                    </div>
                    <div className="font-mono tabular-nums text-[#5A606D]">
                      {activeCandidate.diamond.color} · {activeCandidate.diamond.clarity} ·{' '}
                      {activeCandidate.diamond.lengthMm.toFixed(2)}×
                      {activeCandidate.diamond.widthMm.toFixed(2)} мм
                    </div>
                  </div>
                </div>
              </div>

              {/* Delta Breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div className="p-3 bg-[#FAFAFA] rounded-lg border border-[#E4E6EB]">
                  <div className="text-[#5A606D]">Разница размера</div>
                  <div className="font-mono tabular-nums font-semibold text-[#111317] mt-0.5">
                    Δ {activeCandidate.maxDimensionDiffMm.toFixed(2)} мм
                  </div>
                </div>
                <div className="p-3 bg-[#FAFAFA] rounded-lg border border-[#E4E6EB]">
                  <div className="text-[#5A606D]">Разница веса</div>
                  <div className="font-mono tabular-nums font-semibold text-[#111317] mt-0.5">
                    Δ {activeCandidate.caratDiff.toFixed(2)} ct
                  </div>
                </div>
                <div className="p-3 bg-[#FAFAFA] rounded-lg border border-[#E4E6EB]">
                  <div className="text-[#5A606D]">Разница цвета</div>
                  <div className="font-mono tabular-nums font-semibold text-[#111317] mt-0.5">
                    {activeCandidate.colorSteps === 0
                      ? 'Точное совпадение'
                      : `${activeCandidate.colorSteps} грейд`}
                  </div>
                </div>
                <div className="p-3 bg-[#FAFAFA] rounded-lg border border-[#E4E6EB]">
                  <div className="text-[#5A606D]">Сумма за оба камня</div>
                  <div className="font-mono tabular-nums font-semibold text-[#111317] mt-0.5">
                    {formatStonePrice(
                      (effectiveAnchor.priceUsd || 0) + activeCandidate.diamond.priceUsd,
                      activeCandidate.diamond.currency
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-[#E4E6EB] rounded-xl p-8 text-center space-y-2">
              <GitCompare className="w-8 h-8 text-[#6B7280] mx-auto" />
              <h3 className="text-lg font-semibold text-[#111317]">
                В текущих допусках пары не найдены
              </h3>
              <p className="text-sm text-[#5A606D]">
                Попробуйте расширить допуск по размеру (мм) или каратности на панели слева.
              </p>
            </div>
          )}

          {/* Ranked Candidates List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-[#5A606D]">
              <span>Найдено кандидатов в пару: {matches.length}</span>
              <span>Отсортировано по точности совпадения</span>
            </div>

            <div className="space-y-3">
              {matches.map((cand) => {
                const isSelected = activeCandidate?.diamond.id === cand.diamond.id;
                return (
                  <div
                    key={cand.diamond.id}
                    className={`bg-white border rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 transition-colors ${
                      isSelected
                        ? 'border-[#1B365D] bg-[#F8FAFC]'
                        : 'border-[#E4E6EB] hover:border-[#C5CBD6]'
                    }`}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <img
                        src={cand.diamond.imageUrl}
                        alt={cand.diamond.sku}
                        referrerPolicy="no-referrer"
                        className="w-16 h-12 rounded object-cover border border-[#E4E6EB] shrink-0 bg-[#F1F3F5]"
                      />
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 text-xs text-[#5A606D]">
                          <span className="font-mono">{cand.diamond.sku}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-medium text-[#1B365D]">
                            Совместимость {cand.compatibilityScore}%
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-[#111317]">
                          {cand.diamond.stoneType &&
                          cand.diamond.stoneType !== 'Бриллиант'
                            ? `${cand.diamond.stoneType} · `
                            : ''}
                          {SHAPE_SHORT_RU[cand.diamond.shape]}{' '}
                          {cand.diamond.carat.toFixed(2)} ct · {cand.diamond.color} ·{' '}
                          {cand.diamond.clarity}
                        </div>
                        <div className="text-xs font-mono tabular-nums text-[#5A606D]">
                          {cand.diamond.lengthMm.toFixed(2)}×{cand.diamond.widthMm.toFixed(2)} мм
                          (Δ {cand.maxDimensionDiffMm.toFixed(2)} мм) ·{' '}
                          <a
                            href={cand.diamond.certUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#1B365D] hover:underline inline-flex items-center gap-0.5"
                          >
                            {cand.diamond.certLab} #{cand.diamond.certNumber}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 ml-auto">
                      <div className="text-right">
                        <div className="text-sm font-semibold font-mono tabular-nums text-[#111317]">
                          {formatStonePrice(cand.diamond.priceUsd, cand.diamond.currency)}
                        </div>
                        <div className="text-xs font-mono tabular-nums text-[#5A606D]">
                          {formatStonePrice(
                            Math.round(cand.diamond.priceUsd / cand.diamond.carat),
                            cand.diamond.currency
                          )}
                          /ct
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setSelectedCandidateId(cand.diamond.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                          isSelected
                            ? 'bg-[#1B365D] border-[#1B365D] text-white'
                            : 'bg-white border-[#D5D9E0] text-[#111317] hover:bg-[#F7F8FA]'
                        }`}
                      >
                        {isSelected ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            Выбрана
                          </>
                        ) : (
                          'Примерить пару'
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => onInspect(cand.diamond, 'video')}
                        className="px-3 py-2 text-xs font-medium rounded-lg border border-[#D5D9E0] bg-white text-[#111317] hover:bg-[#F7F8FA] transition-colors whitespace-nowrap"
                      >
                        360°
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
