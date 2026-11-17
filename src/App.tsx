import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  ArrowRight,
  BellRing,
  Scale,
  TrendingDown,
  X,
} from 'lucide-react';
import { CatalogSection } from './components/CatalogSection';
import { CompareView } from './components/CompareView';
import { DiamondDetailModal } from './components/DiamondDetailModal';
import { ExcelImportModal } from './components/ExcelImportModal';
import { GoogleSheetsWorkspace } from './components/GoogleSheetsWorkspace';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import { PairFinderView } from './components/PairFinderView';
import { PriceAlertsView } from './components/PriceAlertsView';
import {
  HERO_IMAGE_URL,
  INITIAL_DIAMONDS,
  SHAPE_SHORT_RU,
  formatStonePrice,
} from './data/diamonds';
import {
  getAccessToken,
  googleSignIn,
  initAuth,
  logout,
} from './lib/googleAuth';
import {
  AppSection,
  Diamond,
  DiamondFilters,
  PriceAlertRule,
  PriceDropNotification,
} from './types/diamond';

const DEFAULT_FILTERS: DiamondFilters = {
  shapes: [],
  colors: [],
  colorFamilies: [],
  stoneTypes: [],
  clarities: [],
  minCarat: 0.2,
  maxCarat: 6.0,
  minPrice: 0,
  maxPrice: 95000,
  certLab: 'ALL',
  onlyPriceDrops: false,
  searchQuery: '',
  sortBy: 'price-asc',
};

function playPriceDropChime() {
  try {
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    osc2.frequency.setValueAtTime(1318.5, now + 0.08);

    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.25);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.45);
  } catch {
    // Ignore audio context restrictions if user hasn't interacted yet
  }
}

export default function App() {
  const [activeSection, setActiveSection] = useState<AppSection>('catalog');
  const [catalog, setCatalog] = useState<Diamond[]>(INITIAL_DIAMONDS);
  const [filters, setFilters] = useState<DiamondFilters>(DEFAULT_FILTERS);

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

  // Price-Drop Alert System
  const [alertRules, setAlertRules] = useState<PriceAlertRule[]>([
    {
      id: 'rule-init-1',
      label: 'Круглые и Овалы 1.40–2.20 ct (D–F)',
      shapes: ['Round', 'Oval'],
      colors: ['D', 'E', 'F'],
      minCarat: 1.4,
      maxCarat: 2.2,
      maxPriceUsd: 26000,
      active: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'rule-init-2',
      label: 'Отслеживание ANT-RD-152D',
      diamondId: 'dm-001',
      shapes: ['Round'],
      colors: ['D'],
      minCarat: 1.5,
      maxCarat: 1.6,
      maxPriceUsd: 23000,
      active: true,
      createdAt: new Date().toISOString(),
    },
  ]);

  const [notifications, setNotifications] = useState<PriceDropNotification[]>([
    {
      id: 'notif-init-1',
      diamondId: 'dm-003',
      sku: 'GEN-OV-204E',
      shape: 'Oval',
      carat: 2.04,
      color: 'E',
      clarity: 'VS1',
      oldPriceUsd: 26800,
      newPriceUsd: 24900,
      dropPercent: 7.1,
      timestamp: '2026-11-16T06:10:00Z',
      read: false,
    },
  ]);

  const [activeToast, setActiveToast] = useState<PriceDropNotification | null>(null);
  const [liveMonitoring, setLiveMonitoring] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Custom export batch sent from Compare or PairFinder to Google Sheets workspace
  const [customExportBatch, setCustomExportBatch] = useState<{
    stones: Diamond[];
    label: string;
  } | null>(null);

  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [importBanner, setImportBanner] = useState<string | null>(null);

  const [heroImgError, setHeroImgError] = useState(false);

  // Initialize Firebase Auth listener (in-memory token only)
  useEffect(() => {
    const unsubscribe = initAuth(
      (signedInUser, token) => {
        setUser(signedInUser);
        setAccessToken(token);
      },
      () => {
        setUser(null);
        setAccessToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
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
    await logout();
    setUser(null);
    setAccessToken(null);
  };

  // Refresh token accessor check
  useEffect(() => {
    getAccessToken().then((t) => {
      if (t) setAccessToken(t);
    });
  }, []);

  // Repricing / Instant Price Drop Engine
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;
  const rulesRef = useRef(alertRules);
  rulesRef.current = alertRules;

  const triggerMarketRepricing = useCallback(
    (manual: boolean) => {
      const currentCatalog = catalogRef.current;
      const activeRules = rulesRef.current.filter((r) => r.active);
      if (currentCatalog.length === 0) return;

      // Prefer a diamond matching an active rule so the user sees immediate matched feedback
      const matchingCandidates = currentCatalog.filter((d) =>
        activeRules.some((r) => {
          if (r.diamondId) return r.diamondId === d.id;
          return (
            r.shapes.includes(d.shape) &&
            r.colors.includes(d.color) &&
            d.carat >= r.minCarat &&
            d.carat <= r.maxCarat
          );
        })
      );

      const pool =
        matchingCandidates.length > 0 ? matchingCandidates : currentCatalog;
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      if (!chosen) return;

      const dropFactor = manual ? 0.945 : 0.965;
      const oldPrice = chosen.priceUsd;
      const newPrice = Math.max(100, Math.round((oldPrice * dropFactor) / 10) * 10);
      if (newPrice >= oldPrice) return;

      const dropPercent =
        Math.round(((oldPrice - newPrice) / oldPrice) * 1000) / 10;
      const nowIso = new Date().toISOString();

      setCatalog((prev) =>
        prev.map((d) =>
          d.id === chosen.id
            ? {
                ...d,
                previousPriceUsd: oldPrice,
                priceUsd: newPrice,
                priceChangedAt: nowIso,
              }
            : d
        )
      );

      const matchesRule = activeRules.some((r) => {
        if (r.diamondId) return r.diamondId === chosen.id;
        return (
          r.shapes.includes(chosen.shape) &&
          r.colors.includes(chosen.color) &&
          chosen.carat >= r.minCarat &&
          chosen.carat <= r.maxCarat &&
          newPrice <= r.maxPriceUsd
        );
      });

      if (matchesRule || manual) {
        const notif: PriceDropNotification = {
          id: `notif-${Date.now()}`,
          diamondId: chosen.id,
          sku: chosen.sku,
          shape: chosen.shape,
          carat: chosen.carat,
          color: chosen.color,
          clarity: chosen.clarity,
          oldPriceUsd: oldPrice,
          newPriceUsd: newPrice,
          dropPercent,
          timestamp: nowIso,
          read: false,
        };
        setNotifications((prev) => [notif, ...prev]);
        setActiveToast(notif);
        if (soundEnabled) {
          playPriceDropChime();
        }
      }
    },
    [soundEnabled]
  );

  useEffect(() => {
    if (!liveMonitoring) return;
    const timer = window.setInterval(() => {
      triggerMarketRepricing(false);
    }, 24000);
    return () => window.clearInterval(timer);
  }, [liveMonitoring, triggerMarketRepricing]);

  useEffect(() => {
    if (!activeToast) return;
    const t = window.setTimeout(() => setActiveToast(null), 9000);
    return () => window.clearTimeout(t);
  }, [activeToast]);

  const filteredCatalog = useMemo(() => {
    const q = filters.searchQuery.trim().toLowerCase();

    const list = catalog.filter((d) => {
      if (filters.shapes.length > 0 && !filters.shapes.includes(d.shape)) {
        return false;
      }
      if (
        filters.stoneTypes.length > 0 &&
        !filters.stoneTypes.includes(d.stoneType || 'Бриллиант')
      ) {
        return false;
      }
      if (
        filters.colorFamilies.length > 0 &&
        !filters.colorFamilies.includes(d.colorFamily || 'Бесцветный (D–J)')
      ) {
        return false;
      }
      if (filters.colors.length > 0 && !filters.colors.includes(d.color)) {
        return false;
      }
      if (filters.clarities.length > 0 && !filters.clarities.includes(d.clarity)) {
        return false;
      }
      if (d.carat < filters.minCarat || d.carat > filters.maxCarat) {
        return false;
      }
      if (d.priceUsd < filters.minPrice || d.priceUsd > filters.maxPrice) {
        return false;
      }
      if (
        filters.certLab !== 'ALL' &&
        d.certLab.toUpperCase() !== filters.certLab.toUpperCase()
      ) {
        return false;
      }
      if (
        filters.onlyPriceDrops &&
        (!d.previousPriceUsd || d.previousPriceUsd <= d.priceUsd)
      ) {
        return false;
      }
      if (
        q &&
        !d.sku.toLowerCase().includes(q) &&
        !d.certNumber.toLowerCase().includes(q) &&
        !SHAPE_SHORT_RU[d.shape].toLowerCase().includes(q) &&
        !(d.stoneType || '').toLowerCase().includes(q) &&
        !d.color.toLowerCase().includes(q) &&
        !(d.colorFamily || '').toLowerCase().includes(q) &&
        !d.origin.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      switch (filters.sortBy) {
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
  }, [catalog, filters]);

  const inspectedDiamond = useMemo(
    () => catalog.find((d) => d.id === inspectedDiamondId) || null,
    [catalog, inspectedDiamondId]
  );

  const comparedDiamonds = useMemo(
    () => catalog.filter((d) => comparedIds.includes(d.id)),
    [catalog, comparedIds]
  );

  const watchedDiamondIds = useMemo(() => {
    const set = new Set<string>();
    for (const r of alertRules) {
      if (r.active && r.diamondId) set.add(r.diamondId);
    }
    return set;
  }, [alertRules]);

  const unreadAlertsCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

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

  const handleToggleWatchDiamond = (diamond: Diamond) => {
    const existing = alertRules.find((r) => r.diamondId === diamond.id);
    if (existing) {
      setAlertRules((prev) => prev.filter((r) => r.id !== existing.id));
    } else {
      setAlertRules((prev) => [
        {
          id: `rule-${Date.now()}`,
          label: `Отслеживание ${diamond.sku} (${SHAPE_SHORT_RU[diamond.shape]} ${diamond.carat.toFixed(2)} ct)`,
          diamondId: diamond.id,
          shapes: [diamond.shape],
          colors: [diamond.color],
          minCarat: diamond.carat,
          maxCarat: diamond.carat,
          maxPriceUsd: diamond.priceUsd,
          active: true,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    }
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

  const computeBoundsForStones = (stones: Diamond[]) => {
    if (stones.length === 0) {
      return {
        minCarat: DEFAULT_FILTERS.minCarat,
        maxCarat: DEFAULT_FILTERS.maxCarat,
        minPrice: DEFAULT_FILTERS.minPrice,
        maxPrice: DEFAULT_FILTERS.maxPrice,
      };
    }
    const minImpCarat = Math.min(...stones.map((d) => d.carat));
    const maxImpCarat = Math.max(...stones.map((d) => d.carat));
    const minImpPrice = Math.min(...stones.map((d) => d.priceUsd));
    const maxImpPrice = Math.max(...stones.map((d) => d.priceUsd));

    return {
      minCarat: Math.max(0, Math.floor(minImpCarat * 20) / 20),
      maxCarat: Math.max(1.0, Math.ceil(maxImpCarat * 20) / 20),
      minPrice: Math.max(0, Math.floor(minImpPrice / 500) * 500),
      maxPrice: Math.max(1000, Math.ceil(maxImpPrice / 1000) * 1000),
    };
  };

  const handleResetFilters = () => {
    const bounds = computeBoundsForStones(catalog);
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
    const impBounds = computeBoundsForStones(imported);

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
    setCatalog((prev) => (replaceExisting ? imported : [...imported, ...prev]));
    setImportBanner(
      `Загружено ${imported.length} камней из Google Таблиц.`
    );
    setActiveSection('catalog');
  };

  const handleImportFromExcel = (
    imported: Diamond[],
    replaceExisting: boolean,
    fileName: string
  ) => {
    expandFilterBoundsForDiamonds(imported, replaceExisting);
    setCatalog((prev) => (replaceExisting ? imported : [...imported, ...prev]));
    if (replaceExisting && imported.length > 0) {
      setComparedIds([]);
      setPairAnchorId(imported[0].id);
    }
    setImportBanner(
      `${replaceExisting ? 'Каталог обновлён' : 'Добавлено'} ${imported.length} камней из файла «${fileName}».`
    );
    setActiveSection('catalog');
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

          {/* Zone 2: 5 concise single-line nav links */}
          <nav
            aria-label="Основная навигация"
            className="hidden lg:flex items-center gap-6 text-sm font-medium text-[#5A606D]"
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
              onClick={() => setActiveSection('alerts')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                activeSection === 'alerts'
                  ? 'border-[#1B365D] text-[#111317]'
                  : 'border-transparent hover:text-[#111317]'
              }`}
            >
              Оповещения{unreadAlertsCount > 0 ? ` (${unreadAlertsCount})` : ''}
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
              { id: 'pair-finder', label: 'Подбор пары' },
              { id: 'compare', label: `Сравнение (${comparedIds.length})` },
              {
                id: 'alerts',
                label: `Оповещения${unreadAlertsCount > 0 ? ` (${unreadAlertsCount})` : ''}`,
              },
              { id: 'sheets', label: 'Google Таблицы' },
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
              filters={filters}
              onChangeFilters={setFilters}
              onResetFilters={handleResetFilters}
              comparedIds={comparedIds}
              watchedDiamondIds={watchedDiamondIds}
              onInspect={handleInspect}
              onToggleCompare={handleToggleCompare}
              onFindPair={handleFindPair}
              onToggleWatch={handleToggleWatchDiamond}
              onOpenExcelImport={() => setIsExcelModalOpen(true)}
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

        {activeSection === 'alerts' && (
          <PriceAlertsView
            catalog={catalog}
            rules={alertRules}
            notifications={notifications}
            liveMonitoring={liveMonitoring}
            soundEnabled={soundEnabled}
            onToggleLiveMonitoring={() => setLiveMonitoring((v) => !v)}
            onToggleSound={() => setSoundEnabled((v) => !v)}
            onTriggerPriceCheckNow={() => triggerMarketRepricing(true)}
            onAddRule={(rule) =>
              setAlertRules((prev) => [
                {
                  ...rule,
                  id: `rule-${Date.now()}`,
                  createdAt: new Date().toISOString(),
                },
                ...prev,
              ])
            }
            onDeleteRule={(ruleId) =>
              setAlertRules((prev) => prev.filter((r) => r.id !== ruleId))
            }
            onToggleRuleActive={(ruleId) =>
              setAlertRules((prev) =>
                prev.map((r) => (r.id === ruleId ? { ...r, active: !r.active } : r))
              )
            }
            onMarkAllRead={() =>
              setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
            }
            onInspectDiamond={(id) => {
              const found = catalog.find((d) => d.id === id);
              if (found) handleInspect(found, 'photo');
            }}
            onExportAlertsToSheets={() => {
              setCustomExportBatch(null);
              setActiveSection('sheets');
            }}
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
            notifications={notifications}
            customExportBatch={customExportBatch}
            onClearCustomBatch={() => setCustomExportBatch(null)}
            onImportDiamonds={handleImportFromSheets}
          />
        )}
      </main>

      {/* Compact Comparison Tray on Catalog View */}
      {activeSection === 'catalog' && comparedIds.length > 0 && (
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

      {/* Instant Price-Drop Toast Notification */}
      {activeToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 max-w-sm w-[calc(100%-2.5rem)] bg-white border border-[#1B365D] rounded-xl shadow-2xl p-4 space-y-2.5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#0F5132]">
              <TrendingDown className="w-4 h-4" />
              <span>Мгновенное снижение цены (−{activeToast.dropPercent}%)</span>
            </div>
            <button
              type="button"
              onClick={() => setActiveToast(null)}
              aria-label="Закрыть уведомление"
              className="text-[#6B7280] hover:text-[#111317]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="text-sm font-semibold text-[#111317]">
            {SHAPE_SHORT_RU[activeToast.shape]} {activeToast.carat.toFixed(2)} ct ·{' '}
            {activeToast.color} · {activeToast.clarity} ({activeToast.sku})
          </div>
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="text-xs font-mono tabular-nums">
              {(() => {
                const toastCurrency =
                  catalog.find((d) => d.id === activeToast.diamondId)?.currency ||
                  'USD';
                return (
                  <>
                    <span className="text-[#6B7280] line-through">
                      {formatStonePrice(activeToast.oldPriceUsd, toastCurrency)}
                    </span>{' '}
                    <span className="font-semibold text-[#111317]">
                      → {formatStonePrice(activeToast.newPriceUsd, toastCurrency)}
                    </span>
                  </>
                );
              })()}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const stone = catalog.find((d) => d.id === activeToast.diamondId);
                  if (stone) handleInspect(stone, 'photo');
                  setActiveToast(null);
                }}
                className="px-2.5 py-1 text-xs font-medium rounded bg-[#1B365D] text-white hover:bg-[#142947] transition-colors"
              >
                Открыть
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveSection('alerts');
                  setActiveToast(null);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border border-[#D5D9E0] text-[#111317] hover:bg-[#F7F8FA]"
              >
                <BellRing className="w-3 h-3" />
                Все
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quiet Editorial Footer */}
      <footer className="bg-white border-t border-[#E4E6EB] mt-16">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-wrap items-center justify-between gap-4 text-xs text-[#5A606D]">
          <div>Diamonds Selector — Селектор сертифицированных бриллиантов</div>
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => setActiveSection('catalog')}
              className="hover:text-[#111317] transition-colors"
            >
              Каталог
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
              onClick={() => setActiveSection('alerts')}
              className="hover:text-[#111317] transition-colors"
            >
              Уведомления о ценах
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('sheets')}
              className="hover:text-[#111317] transition-colors"
            >
              Google Таблицы
            </button>
          </div>
        </div>
      </footer>

      {/* Diamond Detail Modal (Photo + 10x Loupe + 360 Video + Certificate) */}
      <DiamondDetailModal
        diamond={inspectedDiamond}
        initialTab={inspectorTab}
        isCompared={
          inspectedDiamond ? comparedIds.includes(inspectedDiamond.id) : false
        }
        isWatched={
          inspectedDiamond ? watchedDiamondIds.has(inspectedDiamond.id) : false
        }
        onClose={() => setInspectedDiamondId(null)}
        onToggleCompare={handleToggleCompare}
        onFindPair={handleFindPair}
        onToggleWatch={handleToggleWatchDiamond}
      />

      {/* Excel (.xlsx/.xls/.csv) Import Modal */}
      <ExcelImportModal
        open={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        onImport={handleImportFromExcel}
      />
    </div>
  );
}
