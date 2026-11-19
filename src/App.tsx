import React, { Suspense, lazy, useDeferredValue, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowRight,
  Scale,
  X,
} from 'lucide-react';
import { CatalogSection } from './components/CatalogSection';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import {
  ALL_INITIAL_DIAMONDS,
  DEFAULT_PRICING_CONFIG,
  HERO_IMAGE_URL,
  applyPricingToDiamond,
} from './data/diamonds';
import {
  buildCatalogIndex,
  computeCatalogBounds,
  deduplicateDiamonds,
  filterAndSortCatalog,
} from './lib/catalogEngine';
import {
  AppSection,
  Diamond,
  DiamondFilters,
  PricingConfig,
} from './types/diamond';

// Route & modal-level code splitting to keep initial bundle lean and fast
const FancyDiamondsView = lazy(() =>
  import('./components/FancyDiamondsView').then((m) => ({
    default: m.FancyDiamondsView,
  }))
);
const PairFinderView = lazy(() =>
  import('./components/PairFinderView').then((m) => ({
    default: m.PairFinderView,
  }))
);
const CompareView = lazy(() =>
  import('./components/CompareView').then((m) => ({
    default: m.CompareView,
  }))
);
const GoogleSheetsWorkspace = lazy(() =>
  import('./components/GoogleSheetsWorkspace').then((m) => ({
    default: m.GoogleSheetsWorkspace,
  }))
);
const ManagerCabinetView = lazy(() =>
  import('./components/ManagerCabinetView').then((m) => ({
    default: m.ManagerCabinetView,
  }))
);
const DiamondDetailModal = lazy(() =>
  import('./components/DiamondDetailModal').then((m) => ({
    default: m.DiamondDetailModal,
  }))
);
const ExcelImportModal = lazy(() =>
  import('./components/ExcelImportModal').then((m) => ({
    default: m.ExcelImportModal,
  }))
);

const SectionFallback = () => (
  <div className="max-w-7xl mx-auto px-6 py-16">
    <div className="bg-white border border-[#E4E6EB] rounded-xl p-10 text-center text-sm text-[#5A606D]">
      Загрузка раздела...
    </div>
  </div>
);

const DEFAULT_FILTERS: DiamondFilters = {
  shapes: [],
  colors: [],
  colorFamilies: [],
  fancyIntensities: [],
  stoneTypes: [],
  clarities: [],
  minCarat: 0.2,
  maxCarat: 6.0,
  minPrice: 0,
  maxPrice: 150000,
  certLab: 'ALL',
  onlyPriceDrops: false,
  searchQuery: '',
  sortBy: 'price-asc',
};

export default function App() {
  const [activeSection, setActiveSection] = useState<AppSection>('catalog');
  const [catalog, setCatalog] = useState<Diamond[]>(ALL_INITIAL_DIAMONDS);
  const [filters, setFilters] = useState<DiamondFilters>(DEFAULT_FILTERS);
  const [pricingConfig, setPricingConfig] = useState<PricingConfig>(
    DEFAULT_PRICING_CONFIG
  );

  // Google Workspace Auth state
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Inspector Modal state
  const [inspectedDiamondId, setInspectedDiamondId] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<'photo' | 'video' | 'cert'>('photo');

  // Comparison state (up to 4 stones)
  const [comparedIds, setComparedIds] = useState<string[]>(['dm-001', 'dm-002']);

  // Pair Finder anchor
  const [pairAnchorId, setPairAnchorId] = useState<string | null>('dm-001');

  // Custom export batch sent from Compare or PairFinder to Google Sheets workspace
  const [customExportBatch, setCustomExportBatch] = useState<{
    stones: Diamond[];
    label: string;
  } | null>(null);

  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [excelTargetDirectory, setExcelTargetDirectory] = useState<'white' | 'fancy'>('white');
  const [importBanner, setImportBanner] = useState<string | null>(null);

  const [heroImgError, setHeroImgError] = useState(false);

  // Lazily load Firebase Auth after initial paint so Firebase SDK is code-split
  React.useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    import('./lib/googleAuth')
      .then((authMod) => {
        if (!active) return;
        unsubscribe = authMod.initAuth(
          (signedInUser, token) => {
            if (!active) return;
            setUser(signedInUser);
            setAccessToken(token);
          },
          () => {
            if (!active) return;
            setUser(null);
            setAccessToken(null);
          }
        );
        authMod.getAccessToken().then((t) => {
          if (active && t) setAccessToken(t);
        });
      })
      .catch(() => {
        // Ignore auth chunk errors in offline/SSR contexts
      });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const authMod = await import('./lib/googleAuth');
      const result = await authMod.googleSignIn();
      if (result) {
        setUser(result.user);
        setAccessToken(result.accessToken);
      }
    } catch (err) {
      console.error('Google login error:', err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLogout = async () => {
    const authMod = await import('./lib/googleAuth');
    await authMod.logout();
    setUser(null);
    setAccessToken(null);
  };

  // Pre-indexed catalog & deferred search for smooth 30,000-50,000 stone performance
  const deferredSearchQuery = useDeferredValue(filters.searchQuery);
  const catalogIndex = useMemo(() => buildCatalogIndex(catalog), [catalog]);

  const filteredCatalog = useMemo(
    () => filterAndSortCatalog(catalog, catalogIndex, filters, deferredSearchQuery),
    [catalog, catalogIndex, filters, deferredSearchQuery]
  );

  const fancyDiamonds = useMemo(() => {
    const res: Diamond[] = [];
    for (let i = 0; i < catalog.length; i++) {
      if (catalogIndex.fancyFlags[i] === 1) {
        res.push(catalog[i]);
      }
    }
    return res;
  }, [catalog, catalogIndex]);

  const inspectedDiamond = useMemo(
    () => (inspectedDiamondId ? catalog.find((d) => d.id === inspectedDiamondId) || null : null),
    [catalog, inspectedDiamondId]
  );

  const comparedDiamonds = useMemo(() => {
    if (comparedIds.length === 0) return [];
    const set = new Set(comparedIds);
    return catalog.filter((d) => set.has(d.id));
  }, [catalog, comparedIds]);

  const watchedDiamondIds = useMemo(() => new Set<string>(), []);

  const handleToggleCompare = (diamondId: string) => {
    setComparedIds((prev) => {
      if (prev.includes(diamondId)) {
        return prev.filter((id) => id !== diamondId);
      }
      if (prev.length >= 4) {
        return [...prev.slice(1), diamondId];
      }
      return [...prev, diamondId];
    });
  };

  const handleToggleWatchDiamond = () => {
    // Instant price-drop notifications temporarily disabled
  };

  const handleInspect = (
    diamond: Diamond,
    tab: 'photo' | 'video' | 'cert' = 'photo'
  ) => {
    setInspectorTab(tab);
    setInspectedDiamondId(diamond.id);
  };

  const handleFindPair = (diamond: Diamond) => {
    setPairAnchorId(diamond.id);
    setActiveSection('pair-finder');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleComparePair = (stoneAId: string, stoneBId: string) => {
    setComparedIds([stoneAId, stoneBId]);
    setActiveSection('compare');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleExportToSheets = (stones: Diamond[], label: string) => {
    setCustomExportBatch({ stones, label });
    setActiveSection('sheets');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleResetFilters = () => {
    const bounds = computeCatalogBounds(catalog, DEFAULT_FILTERS);
    setFilters({
      ...DEFAULT_FILTERS,
      minCarat: Math.min(DEFAULT_FILTERS.minCarat, bounds.minCarat),
      maxCarat: Math.max(DEFAULT_FILTERS.maxCarat, bounds.maxCarat),
      minPrice: bounds.minPrice,
      maxPrice: Math.max(DEFAULT_FILTERS.maxPrice, bounds.maxPrice),
    });
  };

  const expandFilterBoundsForDiamonds = (
    imported: Diamond[],
    replaceExisting: boolean
  ) => {
    if (imported.length === 0) return;
    const impBounds = computeCatalogBounds(imported, DEFAULT_FILTERS);

    if (replaceExisting) {
      setFilters({
        ...DEFAULT_FILTERS,
        minCarat: impBounds.minCarat,
        maxCarat: impBounds.maxCarat,
        minPrice: impBounds.minPrice,
        maxPrice: impBounds.maxPrice,
      });
    } else {
      setFilters((prev) => ({
        ...prev,
        minCarat: Math.min(prev.minCarat, impBounds.minCarat),
        maxCarat: Math.max(prev.maxCarat, impBounds.maxCarat),
        minPrice: Math.min(prev.minPrice, impBounds.minPrice),
        maxPrice: Math.max(prev.maxPrice, impBounds.maxPrice),
      }));
    }
  };

  const handleImportFromSheets = (
    imported: Diamond[],
    replaceExisting: boolean
  ) => {
    expandFilterBoundsForDiamonds(imported, replaceExisting);
    let uniqueCount = imported.length;
    setCatalog((prev) => {
      const dedup = deduplicateDiamonds(
        imported,
        prev,
        replaceExisting ? 'all' : 'none'
      );
      uniqueCount = dedup.diamonds.length;
      return dedup.diamonds;
    });
    setImportBanner(
      `Загружено ${imported.length.toLocaleString('ru-RU')} строк из Google Таблиц (уникальных в базе: ${uniqueCount.toLocaleString('ru-RU')}).`
    );
    setActiveSection('catalog');
  };

  const handleOpenExcelImport = (targetDir: 'white' | 'fancy') => {
    setExcelTargetDirectory(targetDir);
    setIsExcelModalOpen(true);
  };

  const handleImportFromExcel = (
    imported: Diamond[],
    replaceExisting: boolean,
    fileName: string,
    targetDirectory: 'white' | 'fancy'
  ) => {
    expandFilterBoundsForDiamonds(imported, replaceExisting);

    const replaceMode = !replaceExisting
      ? 'none'
      : targetDirectory === 'fancy'
        ? 'fancy'
        : 'all';

    let stats = { addedCount: imported.length, updatedCount: 0, duplicatesInBatch: 0 };

    setCatalog((prev) => {
      const dedup = deduplicateDiamonds(imported, prev, replaceMode);
      stats = {
        addedCount: dedup.addedCount,
        updatedCount: dedup.updatedCount,
        duplicatesInBatch: dedup.duplicatesInBatch,
      };
      return dedup.diamonds;
    });

    if (replaceExisting && imported.length > 0 && targetDirectory === 'white') {
      setComparedIds([]);
      setPairAnchorId(imported[0].id);
    }

    const dirLabel =
      targetDirectory === 'fancy' ? 'директорию «Цветные бриллианты»' : 'каталог';
    const dupSuffix =
      stats.duplicatesInBatch > 0
        ? ` · объединено дублей: ${stats.duplicatesInBatch.toLocaleString('ru-RU')}`
        : '';
    setImportBanner(
      `${replaceExisting ? 'Обновлена база' : 'Загружено'} ${imported.length.toLocaleString('ru-RU')} строк в ${dirLabel} из «${fileName}» (новых: ${stats.addedCount.toLocaleString('ru-RU')}, обновлено: ${stats.updatedCount.toLocaleString('ru-RU')}${dupSuffix}).`
    );
    setActiveSection(targetDirectory === 'fancy' ? 'fancy' : 'catalog');
  };

  // Manager Cabinet Actions
  const handleApplyPricingToStones = (
    stoneIds: string[] | null,
    nextConfig: PricingConfig
  ) => {
    const idSet = stoneIds ? new Set(stoneIds) : null;
    setCatalog((prev) => {
      const updated = prev.map((stone) =>
        idSet === null || idSet.has(stone.id)
          ? applyPricingToDiamond(stone, nextConfig)
          : stone
      );
      expandFilterBoundsForDiamonds(updated, false);
      return updated;
    });
  };

  const handleUpdateDiamond = (updated: Diamond) => {
    setCatalog((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    expandFilterBoundsForDiamonds([updated], false);
  };

  const handleAddDiamond = (created: Diamond) => {
    setCatalog((prev) => [created, ...prev]);
    expandFilterBoundsForDiamonds([created], false);
  };

  const handleDeleteDiamond = (diamondId: string) => {
    setCatalog((prev) => prev.filter((d) => d.id !== diamondId));
    setComparedIds((prev) => prev.filter((id) => id !== diamondId));
    if (inspectedDiamondId === diamondId) {
      setInspectedDiamondId(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA] text-[#111317]">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="bg-white border-b border-[#E4E6EB] sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveSection('catalog')}
            className="font-display text-2xl font-semibold tracking-tight text-[#111317] whitespace-nowrap shrink-0 text-left"
          >
            Diamonds Selector
          </button>

          {/* Zone 2: Concise single-line nav links */}
          <nav
            aria-label="Основная навигация"
            className="hidden lg:flex items-center gap-4 xl:gap-5 text-sm font-medium text-[#5A606D]"
          >
            <button
              type="button"
              onClick={() => setActiveSection('catalog')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeSection === 'catalog'
                  ? 'border-[#1B365D] text-[#111317]'
                  : 'border-transparent hover:text-[#111317]'
              }`}
            >
              Каталог
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('fancy')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                activeSection === 'fancy'
                  ? 'border-[#1B365D] text-[#111317]'
                  : 'border-transparent hover:text-[#111317]'
              }`}
            >
              Цветные бриллианты
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('pair-finder')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeSection === 'pair-finder'
                  ? 'border-[#1B365D] text-[#111317]'
                  : 'border-transparent hover:text-[#111317]'
              }`}
            >
              Подбор пары
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('compare')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                activeSection === 'compare'
                  ? 'border-[#1B365D] text-[#111317]'
                  : 'border-transparent hover:text-[#111317]'
              }`}
            >
              Сравнение ({comparedIds.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('sheets')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeSection === 'sheets'
                  ? 'border-[#1B365D] text-[#111317]'
                  : 'border-transparent hover:text-[#111317]'
              }`}
            >
              Google Таблицы
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('manager')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeSection === 'manager'
                  ? 'border-[#1B365D] text-[#111317]'
                  : 'border-transparent hover:text-[#111317]'
              }`}
            >
              Кабинет менеджера
            </button>
          </nav>

          {/* Zone 3: 1 Primary Action (Official Google Sign-In or Account Action) */}
          <div className="flex items-center shrink-0">
            {accessToken && user ? (
              <button
                type="button"
                onClick={() => setActiveSection('sheets')}
                className="px-4 py-2 text-xs font-medium rounded-md bg-[#1B365D] text-white hover:bg-[#142947] transition-colors whitespace-nowrap shrink-0 max-w-[200px] truncate"
              >
                {user.displayName || user.email || 'Google Sheets'}
              </button>
            ) : (
              <GoogleSignInButton
                onClick={handleGoogleLogin}
                disabled={isLoggingIn}
                label={isLoggingIn ? 'Вход...' : 'Войти с Google'}
              />
            )}
          </div>
        </div>

        {/* Mobile Secondary Scroll Nav (visible only below lg) */}
        <div className="lg:hidden border-t border-[#E4E6EB] px-4 py-2 flex items-center gap-4 overflow-x-auto text-xs font-medium text-[#5A606D]">
          {(
            [
              { id: 'catalog', label: 'Каталог' },
              { id: 'fancy', label: 'Цветные бриллианты' },
              { id: 'pair-finder', label: 'Подбор пары' },
              { id: 'compare', label: `Сравнение (${comparedIds.length})` },
              { id: 'sheets', label: 'Google Таблицы' },
              { id: 'manager', label: 'Кабинет менеджера' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveSection(item.id)}
              className={`whitespace-nowrap shrink-0 py-1 ${
                activeSection === item.id
                  ? 'text-[#111317] font-semibold underline underline-offset-4'
                  : ''
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {activeSection === 'catalog' && (
          <>
            {/* Editorial Storefront Hero Split */}
            <section className="bg-white border-b border-[#E4E6EB]">
              <div className="max-w-7xl mx-auto px-6 py-10 lg:py-14">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
                  <div className="lg:col-span-6 flex flex-col justify-center space-y-6 py-2">
                    <div className="text-xs font-medium text-[#5A606D] tracking-wide">
                      Антверпен · Женева · Цюрих · Сертификаты GIA, IGI, HRD
                    </div>
                    <h1
                      className="text-4xl sm:text-5xl font-semibold text-[#111317] leading-[1.08] tracking-tight"
                      style={{ textWrap: 'balance' }}
                    >
                      Селектор сертифицированных бриллиантов
                    </h1>
                    <p className="text-base text-[#5A606D] leading-relaxed max-w-xl">
                      Точный отбор по огранке, цвету, чистоте и каратности с обзором
                      360°, прямыми ссылками на реестры лабораторий, подбором пар и
                      синхронизацией с Google Таблицами.
                    </p>
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <a
                        href="#catalog-grid"
                        className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg bg-[#1B365D] text-white hover:bg-[#142947] transition-colors whitespace-nowrap"
                      >
                        Перейти к каталогу
                        <ArrowRight className="w-4 h-4" />
                      </a>
                      <button
                        type="button"
                        onClick={() => setActiveSection('pair-finder')}
                        className="px-5 py-2.5 text-sm font-medium rounded-lg border border-[#D5D9E0] bg-white text-[#111317] hover:bg-[#F7F8FA] transition-colors whitespace-nowrap"
                      >
                        Подобрать пару
                      </button>
                    </div>
                  </div>

                  <div className="lg:col-span-6">
                    <div className="h-full min-h-[260px] lg:min-h-[340px] rounded-xl overflow-hidden border border-[#E4E6EB] bg-[#F1F3F5]">
                      {!heroImgError ? (
                        <img
                          src={HERO_IMAGE_URL}
                          alt="Макросъёмка сертифицированного бриллианта на платине и известняке"
                          referrerPolicy="no-referrer"
                          onError={() => setHeroImgError(true)}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-sm text-[#5A606D]">
                          Diamonds Selector Atelier
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 4-Column Summary Strip below Hero Split */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pt-8 mt-8 border-t border-[#E4E6EB] text-sm">
                  <div>
                    <div className="font-mono tabular-nums text-lg font-semibold text-[#111317]">
                      {catalog.length} камней
                    </div>
                    <div className="text-xs text-[#5A606D] mt-0.5">
                      Доступно в живом каталоге
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-lg font-semibold text-[#111317]">
                      GIA · IGI · HRD
                    </div>
                    <div className="text-xs text-[#5A606D] mt-0.5">
                      Прямые ссылки на проверку бланков
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-lg font-semibold text-[#111317]">
                      360° и 10× лупа
                    </div>
                    <div className="text-xs text-[#5A606D] mt-0.5">
                      Видео-обзор и схема пропорций
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-lg font-semibold text-[#111317]">
                      Google Sheets
                    </div>
                    <div className="text-xs text-[#5A606D] mt-0.5">
                      Двусторонний импорт и экспорт
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Import Confirmation Banner */}
            {importBanner && (
              <div className="max-w-7xl mx-auto px-6 pt-6">
                <div className="p-3.5 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] text-xs text-[#065F46] flex items-center justify-between gap-3">
                  <span>{importBanner}</span>
                  <button
                    type="button"
                    onClick={() => setImportBanner(null)}
                    aria-label="Скрыть уведомление"
                    className="text-[#065F46] hover:text-[#043927]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Catalog Filters & Cards */}
            <CatalogSection
              diamonds={filteredCatalog}
              catalog={catalog}
              totalCount={catalog.length}
              fancyCount={catalogIndex.fancyCount}
              onGoToFancy={() => setActiveSection('fancy')}
              filters={filters}
              onChangeFilters={setFilters}
              onResetFilters={handleResetFilters}
              comparedIds={comparedIds}
              watchedDiamondIds={watchedDiamondIds}
              onInspect={handleInspect}
              onToggleCompare={handleToggleCompare}
              onFindPair={handleFindPair}
              onToggleWatch={handleToggleWatchDiamond}
              onOpenExcelImport={() => handleOpenExcelImport('white')}
            />
          </>
        )}

        <Suspense fallback={<SectionFallback />}>
          {activeSection === 'fancy' && (
            <>
              {importBanner && (
                <div className="max-w-7xl mx-auto px-6 pt-6">
                  <div className="p-3.5 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] text-xs text-[#065F46] flex items-center justify-between gap-3">
                    <span>{importBanner}</span>
                    <button
                      type="button"
                      onClick={() => setImportBanner(null)}
                      aria-label="Скрыть уведомление"
                      className="text-[#065F46] hover:text-[#043927]"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
              <FancyDiamondsView
                diamonds={fancyDiamonds}
                comparedIds={comparedIds}
                watchedDiamondIds={watchedDiamondIds}
                onInspect={handleInspect}
                onToggleCompare={handleToggleCompare}
                onFindPair={handleFindPair}
                onToggleWatch={handleToggleWatchDiamond}
                onOpenExcelImport={() => handleOpenExcelImport('fancy')}
                onGoToPairFinder={() => {
                  const firstFancy = fancyDiamonds[0];
                  if (firstFancy) setPairAnchorId(firstFancy.id);
                  setActiveSection('pair-finder');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                onExportSheets={handleExportToSheets}
              />
            </>
          )}

          {activeSection === 'pair-finder' && (
            <PairFinderView
              catalog={catalog}
              initialAnchorId={pairAnchorId}
              comparedIds={comparedIds}
              onInspect={handleInspect}
              onComparePair={handleComparePair}
              onExportPairToSheets={handleExportToSheets}
            />
          )}

          {activeSection === 'compare' && (
            <CompareView
              diamonds={comparedDiamonds}
              onRemove={(id) =>
                setComparedIds((prev) => prev.filter((item) => item !== id))
              }
              onClearAll={() => setComparedIds([])}
              onInspect={handleInspect}
              onFindPair={handleFindPair}
              onExportSheets={handleExportToSheets}
              onGoToCatalog={() => setActiveSection('catalog')}
            />
          )}

          {activeSection === 'sheets' && (
            <GoogleSheetsWorkspace
              user={user}
              accessToken={accessToken}
              isLoggingIn={isLoggingIn}
              onLogin={handleGoogleLogin}
              onLogout={handleGoogleLogout}
              catalog={catalog}
              comparedDiamonds={comparedDiamonds}
              notifications={[]}
              pricingConfig={pricingConfig}
              customExportBatch={customExportBatch}
              onClearCustomBatch={() => setCustomExportBatch(null)}
              onImportDiamonds={handleImportFromSheets}
            />
          )}

          {activeSection === 'manager' && (
            <ManagerCabinetView
              catalog={catalog}
              pricingConfig={pricingConfig}
              managerEmail={user?.email ?? null}
              onUpdatePricingConfig={setPricingConfig}
              onApplyPricingToStones={handleApplyPricingToStones}
              onUpdateDiamond={handleUpdateDiamond}
              onAddDiamond={handleAddDiamond}
              onDeleteDiamond={handleDeleteDiamond}
              onOpenExcelImport={() => handleOpenExcelImport('white')}
            />
          )}
        </Suspense>
      </main>

      {/* Compact Comparison Tray on Catalog & Fancy Views */}
      {(activeSection === 'catalog' || activeSection === 'fancy') &&
        comparedIds.length > 0 && (
        <div className="sticky bottom-4 z-30 max-w-2xl mx-auto px-4 w-full pointer-events-none">
          <div className="pointer-events-auto bg-[#111317] text-white rounded-xl px-4 py-2.5 shadow-xl flex items-center justify-between gap-4 border border-white/10">
            <div className="flex items-center gap-2.5 text-xs min-w-0">
              <Scale className="w-4 h-4 text-[#93C5FD] shrink-0" />
              <span className="truncate">
                Выбрано для сравнения:{' '}
                <strong className="font-mono tabular-nums">
                  {comparedIds.length}/4
                </strong>
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setComparedIds([])}
                className="px-2.5 py-1 text-xs text-white/70 hover:text-white transition-colors"
              >
                Сброс
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveSection('compare');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="px-3.5 py-1.5 text-xs font-medium rounded-md bg-white text-[#111317] hover:bg-[#F1F3F5] transition-colors whitespace-nowrap"
              >
                Сравнить камни
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quiet Editorial Footer */}
      <footer className="bg-white border-t border-[#E4E6EB] mt-16">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-wrap items-center justify-between gap-4 text-xs text-[#5A606D]">
          <div>Diamonds Selector — Селектор сертифицированных бриллиантов</div>
          <div className="flex flex-wrap items-center gap-6">
            <button
              type="button"
              onClick={() => setActiveSection('catalog')}
              className="hover:text-[#111317] transition-colors"
            >
              Каталог
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('fancy')}
              className="hover:text-[#111317] transition-colors"
            >
              Цветные бриллианты
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('pair-finder')}
              className="hover:text-[#111317] transition-colors"
            >
              Подбор пары
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('sheets')}
              className="hover:text-[#111317] transition-colors"
            >
              Google Таблицы
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('manager')}
              className="hover:text-[#111317] transition-colors"
            >
              Кабинет менеджера
            </button>
          </div>
        </div>
      </footer>

      {/* Lazy-mounted Diamond Detail Modal (only loaded when a stone is inspected) */}
      {inspectedDiamond && (
        <Suspense fallback={null}>
          <DiamondDetailModal
            diamond={inspectedDiamond}
            initialTab={inspectorTab}
            isCompared={comparedIds.includes(inspectedDiamond.id)}
            onClose={() => setInspectedDiamondId(null)}
            onToggleCompare={handleToggleCompare}
            onFindPair={handleFindPair}
          />
        </Suspense>
      )}

      {/* Lazy-mounted Excel Import Modal (keeps xlsx & worker out of initial bundle) */}
      {isExcelModalOpen && (
        <Suspense fallback={null}>
          <ExcelImportModal
            open={isExcelModalOpen}
            defaultTargetDirectory={excelTargetDirectory}
            pricingConfig={pricingConfig}
            onClose={() => setIsExcelModalOpen(false)}
            onImport={handleImportFromExcel}
          />
        </Suspense>
      )}
    </div>
  );
}
