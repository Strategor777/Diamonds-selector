import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Edit3,
  FileSpreadsheet,
  Lock,
  Percent,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  ALL_CLARITIES,
  ALL_FANCY_SHADES,
  ALL_SHAPES,
  FANCY_INTENSITIES,
  SHAPE_IMAGE_MAP,
  SHAPE_LABELS_RU,
  SHAPE_SHORT_RU,
  calculateClientPrice,
  extractFancyIntensity,
  formatStonePrice,
  getCertVerifyUrl,
  getEffectiveCostPrice,
  getFancyDiamondImage,
} from '../data/diamonds';
import { classifyColorFamily } from '../lib/diamondMapper';
import {
  CutGrade,
  Diamond,
  DiamondShape,
  PriceCurrency,
  PricingConfig,
  PricingMode,
} from '../types/diamond';
import { NumericInput } from './NumericInput';
import { PaginationBar } from './PaginationBar';

interface ManagerCabinetViewProps {
  catalog: Diamond[];
  pricingConfig: PricingConfig;
  managerEmail?: string | null;
  onUpdatePricingConfig: (next: PricingConfig) => void;
  onApplyPricingToStones: (stoneIds: string[] | null, config: PricingConfig) => void;
  onUpdateDiamond: (updated: Diamond) => void;
  onAddDiamond: (created: Diamond) => void;
  onDeleteDiamond: (diamondId: string) => void;
  onOpenExcelImport: () => void;
  onLockCabinet?: () => void;
}

const MULTIPLIER_PRESETS = [1.15, 1.25, 1.35, 1.5];
const PERCENT_PRESETS = [15, 25, 35, 50];

const COLOR_FAMILIES = [
  'Бесцветный (D–J)',
  ...ALL_FANCY_SHADES,
  'Фантазийный',
];

interface EditorDraft {
  isNew: boolean;
  stone: Diamond;
  costTotal: number;
  markupMode: PricingMode | 'manual';
  markupValue: number;
  manualClientPrice: number;
}

export const ManagerCabinetView: React.FC<ManagerCabinetViewProps> = ({
  catalog,
  pricingConfig,
  managerEmail,
  onUpdatePricingConfig,
  onApplyPricingToStones,
  onUpdateDiamond,
  onAddDiamond,
  onDeleteDiamond,
  onOpenExcelImport,
  onLockCabinet,
}) => {
  const [directoryFilter, setDirectoryFilter] = useState<'all' | 'white' | 'fancy'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearch = useDeferredValue(searchQuery);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [draftConfig, setDraftConfig] = useState<PricingConfig>(pricingConfig);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);
  const [editorDraft, setEditorDraft] = useState<EditorDraft | null>(null);

  useEffect(() => {
    setDraftConfig(pricingConfig);
  }, [pricingConfig]);

  useEffect(() => {
    if (!feedbackBanner) return;
    const timer = window.setTimeout(() => setFeedbackBanner(null), 5000);
    return () => window.clearTimeout(timer);
  }, [feedbackBanner]);

  const isFancyStone = (d: Diamond) =>
    d.directory === 'fancy' ||
    Boolean(d.isFancyColor) ||
    (Boolean(d.colorFamily) &&
      d.colorFamily !== 'Бесцветный (D–J)' &&
      (!d.stoneType ||
        d.stoneType.toLowerCase().includes('бриллиант') ||
        d.stoneType.toLowerCase().includes('diamond')));

  const filteredCatalog = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    const res: Diamond[] = [];
    for (let i = 0; i < catalog.length; i++) {
      const d = catalog[i];
      if (directoryFilter === 'fancy' && !isFancyStone(d)) continue;
      if (directoryFilter === 'white' && isFancyStone(d)) continue;
      if (
        q &&
        !(d.sku || '').toLowerCase().includes(q) &&
        !(d.certNumber || '').toLowerCase().includes(q) &&
        !(d.color || '').toLowerCase().includes(q) &&
        !(d.stoneType || '').toLowerCase().includes(q) &&
        !(SHAPE_SHORT_RU[d.shape] || d.shape || '').toLowerCase().includes(q) &&
        !(d.origin || '').toLowerCase().includes(q)
      ) {
        continue;
      }
      res.push(d);
    }
    return res;
  }, [catalog, directoryFilter, deferredSearch]);

  useEffect(() => {
    setPage(1);
  }, [filteredCatalog.length, directoryFilter, deferredSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredCatalog.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredCatalog.slice(start, start + pageSize);
  }, [filteredCatalog, safePage, pageSize]);

  const summary = useMemo(() => {
    const currencyCounts = new Map<PriceCurrency, number>();
    let totalCost = 0;
    let totalClient = 0;
    let fancyCount = 0;

    for (const d of filteredCatalog) {
      const cost = getEffectiveCostPrice(d);
      totalCost += cost;
      totalClient += d.priceUsd;
      if (isFancyStone(d)) fancyCount++;
      const cur = d.currency || 'USD';
      currencyCounts.set(cur, (currencyCounts.get(cur) || 0) + 1);
    }

    let primaryCurrency: PriceCurrency = 'USD';
    let bestCount = -1;
    for (const [cur, cnt] of currencyCounts.entries()) {
      if (cnt > bestCount) {
        bestCount = cnt;
        primaryCurrency = cur;
      }
    }

    const marginAmount = totalClient - totalCost;
    const avgMarkupPct =
      totalCost > 0 ? Math.round(((totalClient - totalCost) / totalCost) * 1000) / 10 : 0;

    return {
      totalCount: filteredCatalog.length,
      fancyCount,
      whiteCount: filteredCatalog.length - fancyCount,
      totalCost,
      totalClient,
      marginAmount,
      avgMarkupPct,
      primaryCurrency,
    };
  }, [filteredCatalog]);

  const handleGlobalModeSwitch = (mode: PricingMode) => {
    const nextValue =
      mode === 'multiplier'
        ? draftConfig.mode === 'percent'
          ? Number((1 + draftConfig.value / 100).toFixed(2))
          : draftConfig.value
        : draftConfig.mode === 'multiplier'
          ? Math.round((draftConfig.value - 1) * 100)
          : draftConfig.value;

    const nextConfig: PricingConfig = {
      ...draftConfig,
      mode,
      value: Math.max(mode === 'multiplier' ? 0.5 : -50, nextValue),
    };
    setDraftConfig(nextConfig);
    onUpdatePricingConfig(nextConfig);
  };

  const handleApplyGlobal = (scope: 'all' | 'filtered') => {
    onUpdatePricingConfig(draftConfig);
    const ids = scope === 'filtered' ? filteredCatalog.map((d) => d.id) : null;
    onApplyPricingToStones(ids, draftConfig);
    setFeedbackBanner(
      `Наценка (${
        draftConfig.mode === 'multiplier'
          ? `×${draftConfig.value.toFixed(2)}`
          : `+${draftConfig.value}%`
      }) применена к ${scope === 'all' ? 'всему каталогу' : `выборке (${filteredCatalog.length} поз.)`}.`
    );
  };

  const handleInlineCostChange = (stone: Diamond, nextCostRaw: number) => {
    const nextCost = Math.max(1, Math.round(nextCostRaw || 0));
    if (!Number.isFinite(nextCost) || nextCost <= 0) return;

    const mode = stone.markupMode || draftConfig.mode;
    const val =
      typeof stone.markupValue === 'number' ? stone.markupValue : draftConfig.value;
    const nextPrice = calculateClientPrice(
      nextCost,
      mode,
      val,
      draftConfig.roundingStep
    );
    onUpdateDiamond({
      ...stone,
      costPriceUsd: nextCost,
      markupMode: mode,
      markupValue: val,
      priceUsd: nextPrice,
    });
  };

  const handleInlineMarkupChange = (
    stone: Diamond,
    mode: PricingMode,
    val: number
  ) => {
    const cost = getEffectiveCostPrice(stone);
    const nextPrice = calculateClientPrice(
      cost,
      mode,
      val,
      draftConfig.roundingStep
    );
    onUpdateDiamond({
      ...stone,
      costPriceUsd: cost,
      markupMode: mode,
      markupValue: val,
      priceUsd: nextPrice,
    });
  };

  const openEditorForStone = (stone: Diamond) => {
    const costTotal = getEffectiveCostPrice(stone);
    setEditorDraft({
      isNew: false,
      stone: { ...stone },
      costTotal,
      markupMode: stone.markupMode || draftConfig.mode,
      markupValue:
        typeof stone.markupValue === 'number'
          ? stone.markupValue
          : draftConfig.value,
      manualClientPrice: stone.priceUsd,
    });
  };

  const openNewStoneEditor = () => {
    const defaultCost = 10000;
    const defaultClient = calculateClientPrice(
      defaultCost,
      draftConfig.mode,
      draftConfig.value,
      draftConfig.roundingStep
    );
    const certNum = String(2500000 + Math.floor(Math.random() * 899999));
    const isFancyDir = directoryFilter === 'fancy';

    setEditorDraft({
      isNew: true,
      stone: {
        id: `mgr-${Date.now()}`,
        sku: `MGR-${isFancyDir ? 'FNC' : 'RD'}-${Math.floor(100 + Math.random() * 900)}`,
        stoneType: isFancyDir ? 'Цветной бриллиант' : 'Бриллиант',
        shape: 'Round',
        carat: 1.5,
        color: isFancyDir ? 'Fancy Intense Yellow' : 'E',
        colorFamily: isFancyDir ? 'Жёлтый' : 'Бесцветный (D–J)',
        clarity: 'VVS2',
        cut: 'Excellent',
        polish: 'Excellent',
        symmetry: 'Excellent',
        fluorescence: 'None',
        depthPercent: 61.6,
        tablePercent: 57.5,
        crownAngle: 34.5,
        pavilionAngle: 40.8,
        girdle: 'Medium',
        culet: 'None',
        lengthMm: 7.36,
        widthMm: 7.39,
        depthMm: 4.55,
        lwRatio: 1.0,
        certLab: 'GIA',
        certNumber: certNum,
        certDate: new Date().toISOString().slice(0, 10),
        certUrl: getCertVerifyUrl('GIA', certNum),
        imageUrl: isFancyDir
          ? getFancyDiamondImage('Fancy Intense Yellow', 'Жёлтый', 'Round')
          : SHAPE_IMAGE_MAP.Round,
        costPriceUsd: defaultCost,
        markupMode: draftConfig.mode,
        markupValue: draftConfig.value,
        priceUsd: defaultClient,
        currency: 'USD',
        origin: 'Антверпен',
        inStock: true,
        source: 'catalog',
        directory: isFancyDir ? 'fancy' : 'white',
        isFancyColor: isFancyDir,
        fancyIntensity: isFancyDir ? 'Fancy Intense' : undefined,
      },
      costTotal: defaultCost,
      markupMode: draftConfig.mode,
      markupValue: draftConfig.value,
      manualClientPrice: defaultClient,
    });
  };

  const computeEditorClientPrice = (draft: EditorDraft): number => {
    if (draft.markupMode === 'manual') {
      return Math.max(1, Math.round(draft.manualClientPrice));
    }
    return calculateClientPrice(
      draft.costTotal,
      draft.markupMode,
      draft.markupValue,
      draftConfig.roundingStep
    );
  };

  const handleSaveEditor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editorDraft) return;
    const s = editorDraft.stone;
    const clientPrice = computeEditorClientPrice(editorDraft);
    const derivedMultiplier =
      editorDraft.costTotal > 0
        ? Number((clientPrice / editorDraft.costTotal).toFixed(2))
        : 1;

    const computedFamily = s.colorFamily || classifyColorFamily(s.color);
    const isFancy = s.directory === 'fancy';
    const nextStone: Diamond = {
      ...s,
      carat: Math.max(0.05, Number(s.carat) || 1),
      lengthMm: Math.max(0.5, Number(s.lengthMm) || 5),
      widthMm: Math.max(0.5, Number(s.widthMm) || 5),
      depthMm: Math.max(0.5, Number(s.depthMm) || 3),
      lwRatio: Number(
        (
          Math.max(0.5, Number(s.lengthMm) || 5) /
          Math.max(0.5, Number(s.widthMm) || 5)
        ).toFixed(2)
      ),
      colorFamily: computedFamily,
      isFancyColor: isFancy,
      fancyIntensity: isFancy
        ? s.fancyIntensity || extractFancyIntensity(s.color)
        : undefined,
      primaryHue: isFancy ? computedFamily : undefined,
      overtone: s.fancyOvertone || s.overtone,
      certUrl: s.certUrl.trim() || getCertVerifyUrl(s.certLab, s.certNumber),
      costPriceUsd: Math.max(1, Math.round(editorDraft.costTotal)),
      markupMode:
        editorDraft.markupMode === 'manual' ? 'multiplier' : editorDraft.markupMode,
      markupValue:
        editorDraft.markupMode === 'manual'
          ? derivedMultiplier
          : editorDraft.markupValue,
      priceUsd: clientPrice,
    };

    if (editorDraft.isNew) {
      onAddDiamond(nextStone);
      setFeedbackBanner(`Камень ${nextStone.sku} добавлен в базу.`);
    } else {
      onUpdateDiamond(nextStone);
      setFeedbackBanner(`Изменения для ${nextStone.sku} сохранены.`);
    }
    setEditorDraft(null);
  };

  return (
    <div>
      {/* Header Section */}
      <section className="bg-white border-b border-[#E4E6EB]">
        <div className="max-w-7xl mx-auto px-6 py-10 space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="space-y-2 max-w-3xl">
              <div className="inline-flex items-center gap-2 text-xs font-medium text-[#1B365D] tracking-wide">
                <Lock className="w-3.5 h-3.5" />
                <span>
                  Закрытый режим администратора
                  {managerEmail ? ` · ${managerEmail}` : ''}
                </span>
              </div>
              <h1
                className="text-3xl sm:text-4xl font-semibold text-[#111317] tracking-tight"
                style={{ textWrap: 'balance' }}
              >
                Личный кабинет менеджера
              </h1>
              <p className="text-sm sm:text-base text-[#5A606D] leading-relaxed">
                Управляйте характеристиками камней, входными ценами из файлов и
                правилами наценки. Входная цена видна исключительно здесь — в
                клиентском каталоге отображается только итоговая стоимость и цена за
                карат.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onOpenExcelImport}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium rounded-lg border border-[#D5D9E0] bg-white text-[#111317] hover:bg-[#F7F8FA] transition-colors whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet className="w-4 h-4 text-[#1B365D]" />
                Загрузить прайс .xlsx
              </button>
              <button
                type="button"
                onClick={openNewStoneEditor}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium rounded-lg bg-[#1B365D] text-white hover:bg-[#142947] transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                Добавить камень
              </button>
              {onLockCabinet && (
                <button
                  type="button"
                  onClick={onLockCabinet}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium rounded-lg border border-[#D5D9E0] bg-white text-[#5A606D] hover:text-[#111317] hover:bg-[#F7F8FA] transition-colors whitespace-nowrap shrink-0"
                >
                  <Lock className="w-3.5 h-3.5" />
                  Выйти
                </button>
              )}
            </div>
          </div>

          {/* 4-Column Summary Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pt-6 border-t border-[#E4E6EB] text-sm">
            <div>
              <div className="font-mono tabular-nums text-lg font-semibold text-[#111317]">
                {summary.totalCount} камней
              </div>
              <div className="text-xs text-[#5A606D] mt-0.5">
                Общий: {summary.whiteCount} · Цветные: {summary.fancyCount}
              </div>
            </div>
            <div>
              <div className="font-mono tabular-nums text-lg font-semibold text-[#5A606D]">
                {formatStonePrice(summary.totalCost, summary.primaryCurrency)}
              </div>
              <div className="text-xs text-[#5A606D] mt-0.5">
                Суммарная входная цена (только менеджер)
              </div>
            </div>
            <div>
              <div className="font-mono tabular-nums text-lg font-semibold text-[#111317]">
                {formatStonePrice(summary.totalClient, summary.primaryCurrency)}
              </div>
              <div className="text-xs text-[#5A606D] mt-0.5">
                Итоговая стоимость для клиента
              </div>
            </div>
            <div>
              <div className="font-mono tabular-nums text-lg font-semibold text-[#0F5132]">
                +{formatStonePrice(summary.marginAmount, summary.primaryCurrency)} (+
                {summary.avgMarkupPct}%)
              </div>
              <div className="text-xs text-[#5A606D] mt-0.5">
                Расчётная наценка по выборке
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {feedbackBanner && (
          <div className="p-3.5 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] text-xs text-[#065F46] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{feedbackBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedbackBanner(null)}
              aria-label="Скрыть уведомление"
              className="text-[#065F46]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Global Pricing Control Panel */}
        <div className="bg-white border border-[#E4E6EB] rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-[#E4E6EB]">
            <div>
              <h2 className="text-lg font-semibold text-[#111317]">
                Правило расчёта клиентской цены из входной
              </h2>
              <p className="text-xs text-[#5A606D] mt-0.5">
                Настройте коэффициент-мультипликатор или процентную наценку — формула
                применяется к входным ценам из файла и пересчитывает итоговую стоимость
                и цену за карат для клиента.
              </p>
            </div>

            <label className="inline-flex items-center gap-2 text-xs text-[#111317] cursor-pointer">
              <input
                type="checkbox"
                checked={draftConfig.applyOnImport}
                onChange={(e) => {
                  const next = { ...draftConfig, applyOnImport: e.target.checked };
                  setDraftConfig(next);
                  onUpdatePricingConfig(next);
                }}
                className="w-4 h-4 accent-[#1B365D]"
              />
              Автоматически применять при импорте .xlsx / Sheets
            </label>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-end">
            {/* Mode Switcher */}
            <div className="lg:col-span-4 space-y-1.5">
              <span className="block text-xs font-medium text-[#5A606D]">
                Способ наценки
              </span>
              <div className="inline-flex items-center gap-1 p-1 bg-[#F1F3F5] rounded-lg w-full">
                <button
                  type="button"
                  onClick={() => handleGlobalModeSwitch('multiplier')}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    draftConfig.mode === 'multiplier'
                      ? 'bg-white text-[#111317] shadow-sm'
                      : 'text-[#5A606D] hover:text-[#111317]'
                  }`}
                >
                  <span className="font-mono font-semibold">×</span>
                  Коэффициент
                </button>
                <button
                  type="button"
                  onClick={() => handleGlobalModeSwitch('percent')}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    draftConfig.mode === 'percent'
                      ? 'bg-white text-[#111317] shadow-sm'
                      : 'text-[#5A606D] hover:text-[#111317]'
                  }`}
                >
                  <Percent className="w-3.5 h-3.5" />
                  Наценка (%)
                </button>
              </div>
            </div>

            {/* Numeric Input + Presets */}
            <div className="lg:col-span-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="mgr-global-value" className="font-medium text-[#5A606D]">
                  {draftConfig.mode === 'multiplier'
                    ? 'Коэффициент-мультипликатор'
                    : 'Процентная наценка (%)'}
                </label>
                <div className="flex items-center gap-1">
                  {(draftConfig.mode === 'multiplier'
                    ? MULTIPLIER_PRESETS
                    : PERCENT_PRESETS
                  ).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        const next = { ...draftConfig, value: preset };
                        setDraftConfig(next);
                        onUpdatePricingConfig(next);
                      }}
                      className={`px-1.5 py-0.5 text-[11px] font-mono rounded border transition-colors ${
                        draftConfig.value === preset
                          ? 'bg-[#1B365D] border-[#1B365D] text-white'
                          : 'bg-[#FAFAFA] border-[#E4E6EB] text-[#5A606D] hover:text-[#111317]'
                      }`}
                    >
                      {draftConfig.mode === 'multiplier' ? `×${preset}` : `+${preset}%`}
                    </button>
                  ))}
                </div>
              </div>
              <NumericInput
                id="mgr-global-value"
                min={draftConfig.mode === 'multiplier' ? 0.5 : -50}
                max={draftConfig.mode === 'multiplier' ? 10 : 500}
                allowNegative={draftConfig.mode === 'percent'}
                value={draftConfig.value}
                onValueChange={(val) => {
                  const next = {
                    ...draftConfig,
                    value: Number.isFinite(val) ? val : 1,
                  };
                  setDraftConfig(next);
                  onUpdatePricingConfig(next);
                }}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg text-[#111317] focus:outline-none focus:border-[#1B365D]"
              />
            </div>

            {/* Rounding Step */}
            <div className="lg:col-span-2 space-y-1.5">
              <label
                htmlFor="mgr-rounding"
                className="block text-xs font-medium text-[#5A606D]"
              >
                Округление цены
              </label>
              <select
                id="mgr-rounding"
                value={draftConfig.roundingStep}
                onChange={(e) => {
                  const next: PricingConfig = {
                    ...draftConfig,
                    roundingStep: Number(e.target.value) as PricingConfig['roundingStep'],
                  };
                  setDraftConfig(next);
                  onUpdatePricingConfig(next);
                }}
                className="w-full px-3 py-2 text-xs font-mono bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg text-[#111317]"
              >
                <option value={1}>До 1</option>
                <option value={10}>До 10</option>
                <option value={50}>До 50</option>
                <option value={100}>До 100</option>
              </select>
            </div>

            {/* Apply Action */}
            <div className="lg:col-span-2 flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => handleApplyGlobal('all')}
                className="w-full px-3 py-2 text-xs font-medium rounded-lg bg-[#1B365D] text-white hover:bg-[#142947] transition-colors whitespace-nowrap"
              >
                Применить ко всем ({catalog.length})
              </button>
              {filteredCatalog.length !== catalog.length && (
                <button
                  type="button"
                  onClick={() => handleApplyGlobal('filtered')}
                  className="w-full px-3 py-1.5 text-[11px] font-medium rounded-lg border border-[#D5D9E0] bg-white text-[#111317] hover:bg-[#F7F8FA] transition-colors whitespace-nowrap"
                >
                  Только к выборке ({filteredCatalog.length})
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Inventory Table Container */}
        <div className="bg-white border border-[#E4E6EB] rounded-xl overflow-hidden">
          <div className="p-4 border-b border-[#E4E6EB] flex flex-wrap items-center justify-between gap-4">
            <div className="inline-flex items-center gap-1 p-1 bg-[#F1F3F5] rounded-lg">
              {(
                [
                  { id: 'all', label: `Все (${catalog.length})` },
                  { id: 'white', label: 'Общий каталог' },
                  { id: 'fancy', label: 'Цветные бриллианты' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDirectoryFilter(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    directoryFilter === tab.id
                      ? 'bg-white text-[#111317] shadow-sm'
                      : 'text-[#5A606D] hover:text-[#111317]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#6B7280] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по SKU, сертификату, цвету..."
                aria-label="Поиск камней в кабинете менеджера"
                className="pl-8 pr-3 py-1.5 text-xs bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg w-64 sm:w-72 focus:outline-none focus:border-[#1B365D]"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[980px] text-xs">
              <thead className="bg-[#FAFAFA] border-b border-[#E4E6EB] text-[#5A606D]">
                <tr>
                  <th className="p-3.5 font-medium">Камень / SKU</th>
                  <th className="p-3.5 font-medium">Параметры</th>
                  <th className="p-3.5 font-medium">Входная цена (менеджер)</th>
                  <th className="p-3.5 font-medium">Наценка</th>
                  <th className="p-3.5 font-medium text-right">Цена для клиента</th>
                  <th className="p-3.5 font-medium text-right">Маржа</th>
                  <th className="p-3.5 font-medium text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E6EB]">
                {visibleRows.map((d) => {
                  const costTotal = getEffectiveCostPrice(d);
                  const costPerCt = Math.round(costTotal / Math.max(0.01, d.carat));
                  const clientPerCt = Math.round(d.priceUsd / Math.max(0.01, d.carat));
                  const margin = d.priceUsd - costTotal;
                  const marginPct =
                    costTotal > 0 ? Math.round((margin / costTotal) * 1000) / 10 : 0;
                  const stoneMode = d.markupMode || draftConfig.mode;
                  const stoneVal =
                    typeof d.markupValue === 'number'
                      ? d.markupValue
                      : draftConfig.value;

                  return (
                    <tr key={d.id} className="hover:bg-[#FAFAFA] align-middle">
                      <td className="p-3.5">
                        <div className="flex items-center gap-3">
                          <img
                            src={d.imageUrl}
                            alt={d.sku}
                            referrerPolicy="no-referrer"
                            className="w-12 h-9 rounded object-cover border border-[#E4E6EB] bg-[#F1F3F5] shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="font-mono font-semibold text-[#111317] truncate">
                              {d.sku}
                            </div>
                            <div className="text-[11px] text-[#5A606D] truncate">
                              {isFancyStone(d) ? 'Цветные бриллианты' : 'Белые бриллианты'}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="p-3.5">
                        <div className="font-medium text-[#111317]">
                          {SHAPE_SHORT_RU[d.shape] || d.shape} {Number(d.carat || 0).toFixed(2)} ct · {d.color || '—'} ·{' '}
                          {d.clarity || '—'}
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-[#5A606D] mt-0.5">
                          {Number(d.lengthMm || 0).toFixed(2)}×{Number(d.widthMm || 0).toFixed(2)} мм · {d.certLab || '—'} #
                          {d.certNumber || '—'}
                        </div>
                      </td>

                      <td className="p-3.5">
                        <div className="flex items-center gap-1.5">
                          <NumericInput
                            min={1}
                            integerOnly
                            value={costTotal}
                            onValueChange={(val) => handleInlineCostChange(d, val)}
                            aria-label={`Входная цена для ${d.sku}`}
                            className="w-24 px-2 py-1 text-xs font-mono tabular-nums bg-white border border-[#D5D9E0] rounded focus:outline-none focus:border-[#1B365D]"
                          />
                          <span className="font-mono text-[#5A606D]">
                            {d.currency || 'USD'}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-[#5A606D] mt-1">
                          {formatStonePrice(costPerCt, d.currency)}/ct
                        </div>
                      </td>

                      <td className="p-3.5">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              const nextMode: PricingMode =
                                stoneMode === 'multiplier' ? 'percent' : 'multiplier';
                              const convertedVal =
                                nextMode === 'multiplier'
                                  ? Number((1 + stoneVal / 100).toFixed(2))
                                  : Math.round((stoneVal - 1) * 100);
                              handleInlineMarkupChange(d, nextMode, convertedVal);
                            }}
                            title="Переключить режим (× или %)"
                            className="px-2 py-1 text-[11px] font-mono font-semibold rounded border border-[#D5D9E0] bg-[#FAFAFA] text-[#1B365D] hover:bg-[#EEF2F7]"
                          >
                            {stoneMode === 'multiplier' ? '×' : '%'}
                          </button>
                          <NumericInput
                            min={stoneMode === 'multiplier' ? 0.5 : -50}
                            max={stoneMode === 'multiplier' ? 10 : 500}
                            allowNegative={stoneMode === 'percent'}
                            value={stoneVal}
                            onValueChange={(val) =>
                              handleInlineMarkupChange(d, stoneMode, val)
                            }
                            aria-label={`Наценка для ${d.sku}`}
                            className="w-16 px-2 py-1 text-xs font-mono tabular-nums bg-white border border-[#D5D9E0] rounded focus:outline-none focus:border-[#1B365D]"
                          />
                        </div>
                      </td>

                      <td className="p-3.5 text-right">
                        <div className="font-mono tabular-nums font-semibold text-sm text-[#111317]">
                          {formatStonePrice(d.priceUsd, d.currency)}
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-[#5A606D] mt-0.5">
                          {formatStonePrice(clientPerCt, d.currency)}/ct
                        </div>
                      </td>

                      <td className="p-3.5 text-right font-mono tabular-nums">
                        <div
                          className={`font-semibold ${
                            margin >= 0 ? 'text-[#0F5132]' : 'text-[#991B1B]'
                          }`}
                        >
                          {margin >= 0 ? '+' : ''}
                          {formatStonePrice(margin, d.currency)}
                        </div>
                        <div className="text-[11px] text-[#5A606D] mt-0.5">
                          {marginPct >= 0 ? '+' : ''}
                          {marginPct}%
                        </div>
                      </td>

                      <td className="p-3.5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditorForStone(d)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded border border-[#D5D9E0] bg-white text-[#111317] hover:bg-[#F7F8FA] transition-colors whitespace-nowrap"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-[#1B365D]" />
                            Изменить
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteDiamond(d.id)}
                            aria-label={`Удалить ${d.sku}`}
                            className="p-1.5 rounded border border-transparent text-[#6B7280] hover:text-[#991B1B] hover:bg-[#FEF2F2] transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filteredCatalog.length === 0 && (
              <div className="p-10 text-center text-xs text-[#5A606D] space-y-2">
                <div>По текущему фильтру камней нет.</div>
                <button
                  type="button"
                  onClick={() => {
                    setDirectoryFilter('all');
                    setSearchQuery('');
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-[#D5D9E0] bg-white text-[#111317]"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Сбросить фильтр
                </button>
              </div>
            )}
          </div>

          {filteredCatalog.length > 0 && (
            <div className="px-4 pb-4">
              <PaginationBar
                totalItems={filteredCatalog.length}
                page={safePage}
                pageSize={pageSize}
                pageSizeOptions={[50, 100, 250]}
                onPageChange={setPage}
                onPageSizeChange={(nextSize) => {
                  setPageSize(nextSize);
                  setPage(1);
                }}
                itemLabel="строк ассортимента"
              />
            </div>
          )}
        </div>
      </section>

      {/* Full Stone Characteristics & Pricing Editor Modal */}
      {editorDraft && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4 md:p-6 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Редактирование характеристик и цен камня"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditorDraft(null);
          }}
        >
          <form
            onSubmit={handleSaveEditor}
            className="bg-white border border-[#E4E6EB] rounded-xl max-w-4xl w-full overflow-hidden shadow-2xl my-auto"
          >
            <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-[#E4E6EB]">
              <div>
                <div className="text-xs text-[#5A606D] font-mono">
                  {editorDraft.isNew
                    ? 'Новый камень в базе'
                    : `Редактирование · ${editorDraft.stone.sku}`}
                </div>
                <h2 className="text-xl font-semibold text-[#111317]">
                  {editorDraft.isNew
                    ? 'Добавление камня и расчёт цены'
                    : 'Характеристики и ценообразование камня'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setEditorDraft(null)}
                aria-label="Закрыть редактор"
                className="w-9 h-9 rounded-lg border border-[#E4E6EB] flex items-center justify-center text-[#5A606D] hover:text-[#111317]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[78vh] overflow-y-auto text-xs">
              {/* Section 1: Manager Cost Price -> Markup -> Client Final Price */}
              <div className="p-4 bg-[#FAFAFA] border border-[#E4E6EB] rounded-xl space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-1.5 font-semibold text-[#111317] text-sm">
                    <Lock className="w-4 h-4 text-[#1B365D]" />
                    <span>Ценообразование: Входная цена → Цена для клиента</span>
                  </div>
                  <select
                    value={editorDraft.stone.currency || 'USD'}
                    onChange={(e) =>
                      setEditorDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              stone: {
                                ...prev.stone,
                                currency: e.target.value as PriceCurrency,
                              },
                            }
                          : prev
                      )
                    }
                    className="px-2.5 py-1 text-xs font-mono bg-white border border-[#D5D9E0] rounded"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="RUB">RUB (₽)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[#5A606D] mb-1">
                      Входная цена итого (менеджер)
                    </label>
                    <NumericInput
                      min={1}
                      integerOnly
                      value={editorDraft.costTotal}
                      onValueChange={(val) => {
                        setEditorDraft((prev) =>
                          prev ? { ...prev, costTotal: Math.max(1, val) } : prev
                        );
                      }}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-[#D5D9E0] rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-[#5A606D] mb-1">
                      Входная за карат (/ct)
                    </label>
                    <NumericInput
                      min={1}
                      integerOnly
                      value={Math.round(
                        editorDraft.costTotal / Math.max(0.01, editorDraft.stone.carat)
                      )}
                      onValueChange={(perCt) => {
                        setEditorDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                costTotal: Math.max(
                                  1,
                                  Math.round(perCt * Math.max(0.01, prev.stone.carat))
                                ),
                              }
                            : prev
                        );
                      }}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-[#D5D9E0] rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-[#5A606D] mb-1">Режим наценки</label>
                    <select
                      value={editorDraft.markupMode}
                      onChange={(e) => {
                        const mode = e.target.value as EditorDraft['markupMode'];
                        setEditorDraft((prev) => {
                          if (!prev) return prev;
                          const nextVal =
                            mode === 'multiplier'
                              ? prev.markupMode === 'percent'
                                ? Number((1 + prev.markupValue / 100).toFixed(2))
                                : prev.markupValue
                              : mode === 'percent'
                                ? prev.markupMode === 'multiplier'
                                  ? Math.round((prev.markupValue - 1) * 100)
                                  : prev.markupValue
                                : prev.markupValue;
                          return {
                            ...prev,
                            markupMode: mode,
                            markupValue: nextVal,
                            manualClientPrice: computeEditorClientPrice(prev),
                          };
                        });
                      }}
                      className="w-full px-3 py-2 text-sm bg-white border border-[#D5D9E0] rounded-lg"
                    >
                      <option value="multiplier">Коэффициент (×)</option>
                      <option value="percent">Процентная наценка (%)</option>
                      <option value="manual">Фикс. цена клиента</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[#5A606D] mb-1">
                      {editorDraft.markupMode === 'multiplier'
                        ? 'Мультипликатор (×)'
                        : editorDraft.markupMode === 'percent'
                          ? 'Наценка (%)'
                          : 'Итоговая цена клиента'}
                    </label>
                    {editorDraft.markupMode === 'manual' ? (
                      <NumericInput
                        min={1}
                        integerOnly
                        value={editorDraft.manualClientPrice}
                        onValueChange={(val) =>
                          setEditorDraft((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  manualClientPrice: Math.max(1, val),
                                }
                              : prev
                          )
                        }
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-[#1B365D] rounded-lg font-semibold"
                      />
                    ) : (
                      <NumericInput
                        min={editorDraft.markupMode === 'multiplier' ? 0.5 : -50}
                        max={editorDraft.markupMode === 'multiplier' ? 10 : 500}
                        allowNegative={editorDraft.markupMode === 'percent'}
                        value={editorDraft.markupValue}
                        onValueChange={(val) =>
                          setEditorDraft((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  markupValue: val,
                                }
                              : prev
                          )
                        }
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-[#D5D9E0] rounded-lg"
                      />
                    )}
                  </div>
                </div>

                {/* Live Result Strip */}
                {(() => {
                  const finalTotal = computeEditorClientPrice(editorDraft);
                  const finalPerCt = Math.round(
                    finalTotal / Math.max(0.01, editorDraft.stone.carat)
                  );
                  const profit = finalTotal - editorDraft.costTotal;
                  const pct =
                    editorDraft.costTotal > 0
                      ? Math.round((profit / editorDraft.costTotal) * 1000) / 10
                      : 0;
                  const cur = editorDraft.stone.currency || 'USD';
                  return (
                    <div className="grid grid-cols-3 gap-3 pt-2 border-t border-[#E4E6EB]">
                      <div>
                        <div className="text-[#5A606D]">Клиент видит (итого)</div>
                        <div className="text-base font-mono tabular-nums font-semibold text-[#111317]">
                          {formatStonePrice(finalTotal, cur)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[#5A606D]">Клиент видит (за карат)</div>
                        <div className="text-base font-mono tabular-nums font-semibold text-[#111317]">
                          {formatStonePrice(finalPerCt, cur)}/ct
                        </div>
                      </div>
                      <div>
                        <div className="text-[#5A606D]">Маржа менеджера</div>
                        <div className="text-base font-mono tabular-nums font-semibold text-[#0F5132]">
                          {profit >= 0 ? '+' : ''}
                          {formatStonePrice(profit, cur)} ({pct >= 0 ? '+' : ''}
                          {pct}%)
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Section 2: General & Directory */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[#5A606D] mb-1">Артикул (SKU)</label>
                  <input
                    type="text"
                    required
                    value={editorDraft.stone.sku}
                    onChange={(e) =>
                      setEditorDraft((prev) =>
                        prev
                          ? { ...prev, stone: { ...prev.stone, sku: e.target.value } }
                          : prev
                      )
                    }
                    className="w-full px-3 py-2 text-sm font-mono bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[#5A606D] mb-1">Директория</label>
                  <select
                    value={editorDraft.stone.directory || 'white'}
                    onChange={(e) => {
                      const dir = e.target.value as 'white' | 'fancy';
                      setEditorDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              stone: {
                                ...prev.stone,
                                directory: dir,
                                isFancyColor: dir === 'fancy',
                                stoneType:
                                  dir === 'fancy' ? 'Цветной бриллиант' : 'Бриллиант',
                              },
                            }
                          : prev
                      );
                    }}
                    className="w-full px-3 py-2 text-sm bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg"
                  >
                    <option value="white">Общий каталог</option>
                    <option value="fancy">Цветные бриллианты</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[#5A606D] mb-1">Тип камня</label>
                  <input
                    type="text"
                    value={editorDraft.stone.stoneType || 'Бриллиант'}
                    onChange={(e) =>
                      setEditorDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              stone: { ...prev.stone, stoneType: e.target.value },
                            }
                          : prev
                      )
                    }
                    className="w-full px-3 py-2 text-sm bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg"
                  />
                </div>
              </div>

              {/* Section 3: 4Cs & Fancy Color */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[#5A606D] mb-1">Форма (Shape)</label>
                  <select
                    value={editorDraft.stone.shape}
                    onChange={(e) =>
                      setEditorDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              stone: {
                                ...prev.stone,
                                shape: e.target.value as DiamondShape,
                              },
                            }
                          : prev
                      )
                    }
                    className="w-full px-3 py-2 text-sm bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg"
                  >
                    {ALL_SHAPES.map((s) => (
                      <option key={s} value={s}>
                        {SHAPE_LABELS_RU[s]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[#5A606D] mb-1">Караты (ct)</label>
                  <NumericInput
                    min={0.05}
                    max={50}
                    emptyValue={0.05}
                    value={editorDraft.stone.carat}
                    onValueChange={(val) =>
                      setEditorDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              stone: {
                                ...prev.stone,
                                carat: val,
                              },
                            }
                          : prev
                      )
                    }
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-[#5A606D] mb-1">Цвет</label>
                  <input
                    type="text"
                    value={editorDraft.stone.color}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditorDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              stone: {
                                ...prev.stone,
                                color: val,
                                colorFamily: classifyColorFamily(val),
                              },
                            }
                          : prev
                      );
                    }}
                    className="w-full px-3 py-2 text-sm font-mono bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-[#5A606D] mb-1">Чистота</label>
                  <input
                    type="text"
                    list="mgr-clarity-options"
                    value={editorDraft.stone.clarity}
                    onChange={(e) =>
                      setEditorDraft((prev) =>
                        prev
                          ? { ...prev, stone: { ...prev.stone, clarity: e.target.value } }
                          : prev
                      )
                    }
                    className="w-full px-3 py-2 text-sm font-mono bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg"
                  />
                  <datalist id="mgr-clarity-options">
                    {ALL_CLARITIES.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-[#5A606D] mb-1">Оттенок</label>
                  <select
                    value={editorDraft.stone.colorFamily || 'Бесцветный (D–J)'}
                    onChange={(e) =>
                      setEditorDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              stone: { ...prev.stone, colorFamily: e.target.value },
                            }
                          : prev
                      )
                    }
                    className="w-full px-3 py-2 text-sm bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg"
                  >
                    {COLOR_FAMILIES.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[#5A606D] mb-1">
                    Насыщенность (Fancy)
                  </label>
                  <select
                    value={editorDraft.stone.fancyIntensity || ''}
                    onChange={(e) =>
                      setEditorDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              stone: {
                                ...prev.stone,
                                fancyIntensity: e.target.value || undefined,
                              },
                            }
                          : prev
                      )
                    }
                    className="w-full px-3 py-2 text-sm bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg"
                  >
                    <option value="">— Нет / Бесцветный —</option>
                    {FANCY_INTENSITIES.map((i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[#5A606D] mb-1">Подтон / Обертон</label>
                  <input
                    type="text"
                    value={editorDraft.stone.fancyOvertone || editorDraft.stone.overtone || ''}
                    placeholder="Напр.: Оранжевый подтон"
                    onChange={(e) =>
                      setEditorDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              stone: {
                                ...prev.stone,
                                fancyOvertone: e.target.value || undefined,
                                overtone: e.target.value || undefined,
                              },
                            }
                          : prev
                      )
                    }
                    className="w-full px-3 py-2 text-sm bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-[#5A606D] mb-1">Огранка (Cut)</label>
                  <select
                    value={editorDraft.stone.cut}
                    onChange={(e) =>
                      setEditorDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              stone: {
                                ...prev.stone,
                                cut: e.target.value as CutGrade,
                              },
                            }
                          : prev
                      )
                    }
                    className="w-full px-3 py-2 text-sm bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg"
                  >
                    <option value="Ideal">Ideal</option>
                    <option value="Excellent">Excellent</option>
                    <option value="Very Good">Very Good</option>
                    <option value="Good">Good</option>
                    <option value="Step">Step</option>
                    <option value="Mixed">Mixed</option>
                  </select>
                </div>
              </div>

              {/* Section 4: Measurements, Polish/Sym/Fluor & Certificate */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[#5A606D] mb-1">Длина (мм)</label>
                  <NumericInput
                    min={0.5}
                    max={50}
                    emptyValue={5}
                    value={editorDraft.stone.lengthMm}
                    onValueChange={(val) =>
                      setEditorDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              stone: {
                                ...prev.stone,
                                lengthMm: val,
                              },
                            }
                          : prev
                      )
                    }
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[#5A606D] mb-1">Ширина (мм)</label>
                  <NumericInput
                    min={0.5}
                    max={50}
                    emptyValue={5}
                    value={editorDraft.stone.widthMm}
                    onValueChange={(val) =>
                      setEditorDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              stone: {
                                ...prev.stone,
                                widthMm: val,
                              },
                            }
                          : prev
                      )
                    }
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[#5A606D] mb-1">Высота (мм)</label>
                  <NumericInput
                    min={0.5}
                    max={50}
                    emptyValue={3}
                    value={editorDraft.stone.depthMm}
                    onValueChange={(val) =>
                      setEditorDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              stone: {
                                ...prev.stone,
                                depthMm: val,
                              },
                            }
                          : prev
                      )
                    }
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[#5A606D] mb-1">Флуоресценция</label>
                  <select
                    value={editorDraft.stone.fluorescence}
                    onChange={(e) =>
                      setEditorDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              stone: {
                                ...prev.stone,
                                fluorescence: e.target.value as Diamond['fluorescence'],
                              },
                            }
                          : prev
                      )
                    }
                    className="w-full px-3 py-2 text-sm bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg"
                  >
                    <option value="None">None</option>
                    <option value="Faint">Faint</option>
                    <option value="Medium">Medium</option>
                    <option value="Strong">Strong</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[#5A606D] mb-1">Лаборатория</label>
                  <input
                    type="text"
                    value={editorDraft.stone.certLab}
                    onChange={(e) =>
                      setEditorDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              stone: { ...prev.stone, certLab: e.target.value },
                            }
                          : prev
                      )
                    }
                    className="w-full px-3 py-2 text-sm font-mono bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[#5A606D] mb-1">№ сертификата</label>
                  <input
                    type="text"
                    value={editorDraft.stone.certNumber}
                    onChange={(e) =>
                      setEditorDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              stone: { ...prev.stone, certNumber: e.target.value },
                            }
                          : prev
                      )
                    }
                    className="w-full px-3 py-2 text-sm font-mono bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[#5A606D] mb-1">
                    Ссылка на сертификат
                  </label>
                  <input
                    type="url"
                    value={editorDraft.stone.certUrl}
                    onChange={(e) =>
                      setEditorDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              stone: { ...prev.stone, certUrl: e.target.value },
                            }
                          : prev
                      )
                    }
                    className="w-full px-3 py-2 text-sm font-mono bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[#5A606D] mb-1">URL фото</label>
                  <input
                    type="text"
                    value={editorDraft.stone.imageUrl}
                    onChange={(e) =>
                      setEditorDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              stone: { ...prev.stone, imageUrl: e.target.value },
                            }
                          : prev
                      )
                    }
                    className="w-full px-3 py-2 text-sm font-mono bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[#5A606D] mb-1">
                    URL видео 360° (опционально)
                  </label>
                  <input
                    type="text"
                    value={editorDraft.stone.videoUrl || ''}
                    placeholder="https://..."
                    onChange={(e) =>
                      setEditorDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              stone: {
                                ...prev.stone,
                                videoUrl: e.target.value || undefined,
                              },
                            }
                          : prev
                      )
                    }
                    className="w-full px-3 py-2 text-sm font-mono bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg"
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-[#E4E6EB] flex items-center justify-end gap-3 bg-[#FAFAFA]">
              <button
                type="button"
                onClick={() => setEditorDraft(null)}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-[#D5D9E0] bg-white text-[#111317] hover:bg-[#F7F8FA]"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-medium rounded-lg bg-[#1B365D] text-white hover:bg-[#142947]"
              >
                <Check className="w-3.5 h-3.5" />
                {editorDraft.isNew ? 'Добавить камень' : 'Сохранить изменения'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
