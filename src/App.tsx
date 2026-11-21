import React, { Suspense, lazy, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowRight,
  Scale,
  ShoppingBag,
  X,
} from 'lucide-react';
import { CatalogSection } from './components/CatalogSection';
import { DiamondDetailModal } from './components/DiamondDetailModal';
import { ExcelImportModal, ExcelImportMode } from './components/ExcelImportModal';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import {
  BulkAssortmentPatch,
  ManagerCabinetView,
} from './components/ManagerCabinetView';
import { ManagerPasswordGate } from './components/ManagerPasswordGate';
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
  isFancyDiamond,
  normalizeCatalogDiamonds,
  rebuildSupplierFeeds,
} from './lib/catalogEngine';
import {
  RegistrySyncProgress,
  loadCloudRegistry,
  loadLocalRegistry,
  publishCloudRegistry,
  saveCloudOrder,
  saveLocalRegistry,
} from './lib/catalogPersistence';
import { isVerifiedAdminEmail } from './lib/firebase';
import {
  GoogleAuthErrorInfo,
  consumeRedirectSignIn,
  getAccessToken,
  googleSignIn,
  googleSignInForCloud,
  googleSignInForCloudRedirect,
  initAuth,
  isStandaloneWindow,
  logout,
  parseGoogleAuthError,
} from './lib/googleAuth';
import {
  AppSection,
  Diamond,
  DiamondFilters,
  OrderRequest,
  PricingConfig,
  SupplierFeed,
} from './types/diamond';

// Resilient dynamic import helper that retries once before triggering a safe reload on stale chunks
function lazyWithRetry<T extends React.ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
  chunkKey: string
) {
  return lazy(async () => {
    try {
      const mod = await importer();
      try {
        window.sessionStorage.removeItem(`chunk_retry_${chunkKey}`);
      } catch {
        // ignore storage restrictions
      }
      return mod;
    } catch (firstErr) {
      try {
        await new Promise((r) => window.setTimeout(r, 250));
        return await importer();
      } catch (secondErr) {
        if (typeof window !== 'undefined') {
          try {
            const flag = `chunk_retry_${chunkKey}`;
            if (!window.sessionStorage.getItem(flag)) {
              window.sessionStorage.setItem(flag, '1');
              window.location.reload();
              return new Promise<{ default: T }>(() => {});
            }
          } catch {
            // ignore storage errors
          }
        }
        throw secondErr || firstErr;
      }
    }
  });
}

// Route & modal-level code splitting to keep initial bundle lean and fast
const PairFinderView = lazyWithRetry(
  () =>
    import('./components/PairFinderView').then((m) => ({
      default: m.PairFinderView,
    })),
  'pair-finder'
);
const CompareView = lazyWithRetry(
  () =>
    import('./components/CompareView').then((m) => ({
      default: m.CompareView,
    })),
  'compare'
);
const CartView = lazyWithRetry(
  () =>
    import('./components/CartView').then((m) => ({
      default: m.CartView,
    })),
  'cart'
);
const GoogleSheetsWorkspace = lazyWithRetry(
  () =>
    import('./components/GoogleSheetsWorkspace').then((m) => ({
      default: m.GoogleSheetsWorkspace,
    })),
  'sheets'
);

interface SectionErrorBoundaryProps {
  resetKey: string;
  children: React.ReactNode;
}

interface SectionErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class SectionErrorBoundary extends React.Component<
  SectionErrorBoundaryProps,
  SectionErrorBoundaryState
> {
  constructor(props: SectionErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): SectionErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Не удалось загрузить раздел.',
    };
  }

  componentDidUpdate(prevProps: SectionErrorBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, message: '' });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="max-w-lg mx-auto bg-white border border-[#E4E6EB] rounded-xl p-8 text-center space-y-4">
            <h2 className="text-lg font-semibold text-[#111317]">
              Не удалось загрузить раздел
            </h2>
            <p className="text-xs text-[#5A606D] leading-relaxed">
              {this.state.message}
            </p>
            <div className="flex items-center justify-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, message: '' })}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-[#D5D9E0] bg-white text-[#111317] hover:bg-[#F7F8FA]"
              >
                Повторить
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-[#1B365D] text-white hover:bg-[#142947]"
              >
                Обновить страницу
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const SectionFallback = () => (
  <div className="max-w-7xl mx-auto px-6 py-16">
    <div className="bg-white border border-[#E4E6EB] rounded-xl p-10 text-center text-sm text-[#5A606D]">
      Загрузка раздела...
    </div>
  </div>
);

const DEFAULT_FILTERS: DiamondFilters = {
  colorCategory: 'all',
  shapes: [],
  colors: [],
  colorFamilies: [],
  fancyIntensities: [],
  stoneTypes: [],
  clarities: [],
  cuts: [],
  polishes: [],
  symmetries: [],
  fluorescences: [],
  certLabs: [],
  growthTypes: [],
  minCarat: 0.2,
  maxCarat: 6.0,
  minPrice: 0,
  maxPrice: 150000,
  minDepthPercent: 0,
  maxDepthPercent: 100,
  minTablePercent: 0,
  maxTablePercent: 100,
  minLwRatio: 0,
  maxLwRatio: 5,
  minLengthMm: 0,
  maxLengthMm: 50,
  minWidthMm: 0,
  maxWidthMm: 50,
  onlyWithVideo: false,
  onlyWithCert: false,
  certLab: 'ALL',
  onlyPriceDrops: false,
  searchQuery: '',
  sortBy: 'price-asc',
};

export default function App() {
  const [activeSection, setActiveSection] = useState<AppSection>(() => {
    if (typeof window === 'undefined') return 'catalog';
    try {
      const saved = window.sessionStorage.getItem('diamonds_selector_section_v1');
      if (
        saved === 'catalog' ||
        saved === 'pair-finder' ||
        saved === 'compare' ||
        saved === 'cart' ||
        saved === 'manager' ||
        saved === 'sheets'
      ) {
        return saved;
      }
      if (saved === 'fancy') {
        return 'catalog';
      }
    } catch {
      // ignore storage restrictions
    }
    return 'catalog';
  });
  const [catalog, setCatalog] = useState<Diamond[]>(ALL_INITIAL_DIAMONDS);
  const [suppliers, setSuppliers] = useState<SupplierFeed[]>(() =>
    rebuildSupplierFeeds(ALL_INITIAL_DIAMONDS, [])
  );
  const [filters, setFilters] = useState<DiamondFilters>(() => {
    if (typeof window !== 'undefined') {
      try {
        if (window.sessionStorage.getItem('diamonds_selector_section_v1') === 'fancy') {
          return { ...DEFAULT_FILTERS, colorCategory: 'fancy' };
        }
      } catch {
        // ignore storage errors
      }
    }
    return DEFAULT_FILTERS;
  });
  const [pricingConfig, setPricingConfig] = useState<PricingConfig>(
    DEFAULT_PRICING_CONFIG
  );

  // Persistent Registry & Cloud Sync state
  const isHydratedRef = useRef(false);
  const [registryVersion, setRegistryVersion] = useState(0);
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [syncProgress, setSyncProgress] = useState<RegistrySyncProgress | null>(null);
  const [cloudStatusMessage, setCloudStatusMessage] = useState<string | null>(null);

  // Google Workspace & Firebase Auth state
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<GoogleAuthErrorInfo | null>(null);
  const canUseRedirectSignIn = useMemo(() => isStandaloneWindow(), []);

  const isAdminSignedIn = isVerifiedAdminEmail(user?.email, user?.emailVerified);

  // Inspector Modal state
  const [inspectedDiamondId, setInspectedDiamondId] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<'photo' | 'video' | 'cert'>('photo');

  // Comparison state (off by default — activated only via button)
  const [comparedIds, setComparedIds] = useState<string[]>([]);

  // Shopping Cart & Order Requests state
  const [cartIds, setCartIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = window.localStorage.getItem('diamonds_selector_cart_v1');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [submittedOrders, setSubmittedOrders] = useState<OrderRequest[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = window.localStorage.getItem('diamonds_selector_orders_v1');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  // Manager Cabinet password unlock state (password: 0000; preserved in sessionStorage during auth popup)
  const [isManagerUnlocked, setIsManagerUnlocked] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.sessionStorage.getItem('diamonds_selector_mgr_unlocked_v1') === '1';
    } catch {
      return false;
    }
  });

  // Pair Finder anchor
  const [pairAnchorId, setPairAnchorId] = useState<string | null>('dm-001');

  // Custom export batch sent from Compare or PairFinder to Google Sheets workspace
  const [customExportBatch, setCustomExportBatch] = useState<{
    stones: Diamond[];
    label: string;
  } | null>(null);

  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [excelTargetDirectory, setExcelTargetDirectory] = useState<'white' | 'fancy'>('white');
  const [excelImportMode, setExcelImportMode] = useState<ExcelImportMode>('none');
  const [importBanner, setImportBanner] = useState<string | null>(null);

  const [heroImgError, setHeroImgError] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem('diamonds_selector_cart_v1', JSON.stringify(cartIds));
    } catch {
      // Ignore storage quota errors
    }
  }, [cartIds]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        'diamonds_selector_orders_v1',
        JSON.stringify(submittedOrders)
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [submittedOrders]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem('diamonds_selector_section_v1', activeSection);
    } catch {
      // ignore storage errors
    }
  }, [activeSection]);

  useEffect(() => {
    try {
      if (isManagerUnlocked) {
        window.sessionStorage.setItem('diamonds_selector_mgr_unlocked_v1', '1');
      } else {
        window.sessionStorage.removeItem('diamonds_selector_mgr_unlocked_v1');
      }
    } catch {
      // ignore storage errors
    }
  }, [isManagerUnlocked]);

  // Subscribe to Firebase Auth state directly and resolve any same-tab redirect sign-in result
  React.useEffect(() => {
    let active = true;
    const unsubscribe = initAuth(
      (signedInUser, token) => {
        if (!active) return;
        setUser(signedInUser);
        setAccessToken(token);
        setAuthError(null);
      },
      () => {
        if (!active) return;
        setUser(null);
        setAccessToken(null);
      }
    );

    consumeRedirectSignIn()
      .then((res) => {
        if (!active || !res) return;
        setUser(res.user);
        if (res.accessToken) setAccessToken(res.accessToken);
        setAuthError(null);
      })
      .catch((err) => {
        if (!active) return;
        console.error('Google redirect sign-in error:', err);
        setAuthError(parseGoogleAuthError(err));
      });

    getAccessToken().then((t) => {
      if (active && t) setAccessToken(t);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // Hydrate persistent catalog from IndexedDB immediately on startup, then check cloud registry
  useEffect(() => {
    let active = true;

    const hydrate = async () => {
      let localVersion = 0;
      const localSnap = await loadLocalRegistry();
      if (!active) return;

      if (localSnap && (localSnap.catalog.length > 0 || localSnap.clearedExplicitly)) {
        localVersion = localSnap.version || 0;
        const normalizedLocal = normalizeCatalogDiamonds(localSnap.catalog);
        const hydratedSuppliers =
          localSnap.suppliers && localSnap.suppliers.length > 0
            ? rebuildSupplierFeeds(normalizedLocal, localSnap.suppliers)
            : rebuildSupplierFeeds(normalizedLocal, []);
        setCatalog(normalizedLocal);
        setSuppliers(hydratedSuppliers);
        if (localSnap.pricingConfig) {
          setPricingConfig(localSnap.pricingConfig);
        }
        setRegistryVersion(localVersion);
        if (normalizedLocal.length > 0) {
          const bounds = computeCatalogBounds(normalizedLocal, DEFAULT_FILTERS);
          setFilters((prev) => ({
            ...prev,
            minCarat: Math.min(prev.minCarat, bounds.minCarat),
            maxCarat: Math.max(prev.maxCarat, bounds.maxCarat),
            minPrice: Math.min(prev.minPrice, bounds.minPrice),
            maxPrice: Math.max(prev.maxPrice, bounds.maxPrice),
          }));
        }
      }

      isHydratedRef.current = true;

      try {
        const cloudSnap = await loadCloudRegistry({
          includeManagerData: false,
          cachedVersion: localVersion,
        });
        if (!active || !cloudSnap) return;

        if (cloudSnap.version > localVersion) {
          const normalizedCloud = normalizeCatalogDiamonds(cloudSnap.catalog);
          const nextSuppliers = rebuildSupplierFeeds(
            normalizedCloud,
            localSnap?.suppliers || []
          );
          setCatalog(normalizedCloud);
          setSuppliers(nextSuppliers);
          setRegistryVersion(cloudSnap.version);
          if (normalizedCloud.length > 0) {
            const bounds = computeCatalogBounds(normalizedCloud, DEFAULT_FILTERS);
            setFilters((prev) => ({
              ...prev,
              minCarat: Math.min(prev.minCarat, bounds.minCarat),
              maxCarat: Math.max(prev.maxCarat, bounds.maxCarat),
              minPrice: Math.min(prev.minPrice, bounds.minPrice),
              maxPrice: Math.max(prev.maxPrice, bounds.maxPrice),
            }));
          }
          void saveLocalRegistry({
            version: cloudSnap.version,
            catalog: normalizedCloud,
            suppliers: nextSuppliers,
            pricingConfig: localSnap?.pricingConfig || DEFAULT_PRICING_CONFIG,
            savedAt: new Date().toISOString(),
            clearedExplicitly: normalizedCloud.length === 0,
          });
        }
      } catch (err) {
        console.warn('Background cloud registry sync skipped:', err);
      }
    };

    void hydrate();
    return () => {
      active = false;
    };
  }, []);

  // When verified admin unlocks Manager Cabinet, hydrate private wholesale cost shards from cloud if newer
  useEffect(() => {
    if (!isAdminSignedIn || !isManagerUnlocked) return;
    let active = true;

    const loadAdminOverlay = async () => {
      try {
        const cloudAdmin = await loadCloudRegistry({
          includeManagerData: true,
        });
        if (!active || !cloudAdmin) return;

        if (cloudAdmin.version > registryVersion) {
          const normalizedAdmin = normalizeCatalogDiamonds(cloudAdmin.catalog);
          const nextSup =
            cloudAdmin.suppliers && cloudAdmin.suppliers.length > 0
              ? rebuildSupplierFeeds(normalizedAdmin, cloudAdmin.suppliers)
              : rebuildSupplierFeeds(normalizedAdmin, suppliers);
          setCatalog(normalizedAdmin);
          setSuppliers(nextSup);
          if (cloudAdmin.pricingConfig) {
            setPricingConfig(cloudAdmin.pricingConfig);
          }
          setRegistryVersion(cloudAdmin.version);
        }
      } catch (err) {
        console.warn('Admin cloud overlay load skipped:', err);
      }
    };

    void loadAdminOverlay();
    return () => {
      active = false;
    };
  }, [isAdminSignedIn, isManagerUnlocked]);

  // Auto-persist every catalog/supplier/pricing mutation to IndexedDB so reloads never reset data
  useEffect(() => {
    if (!isHydratedRef.current) return;
    const timer = window.setTimeout(() => {
      void saveLocalRegistry({
        version: registryVersion,
        catalog,
        suppliers,
        pricingConfig,
        savedAt: new Date().toISOString(),
        clearedExplicitly: catalog.length === 0,
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [catalog, suppliers, pricingConfig, registryVersion]);

  // Synchronous invocation inside button click preserves Chrome popup user-gesture activation
  const handleGoogleCloudLogin = () => {
    if (isLoggingIn) return;
    setAuthError(null);
    setIsLoggingIn(true);
    googleSignInForCloud()
      .then((result) => {
        setUser(result.user);
        if (result.accessToken) setAccessToken(result.accessToken);
      })
      .catch((err) => {
        console.error('Google cloud login error:', err);
        setAuthError(parseGoogleAuthError(err));
      })
      .finally(() => {
        setIsLoggingIn(false);
      });
  };

  const handleGoogleCloudRedirectLogin = () => {
    if (isLoggingIn) return;
    setAuthError(null);
    setIsLoggingIn(true);
    googleSignInForCloudRedirect().catch((err) => {
      console.error('Google redirect login error:', err);
      setAuthError(parseGoogleAuthError(err));
      setIsLoggingIn(false);
    });
  };

  const handleGoogleSheetsLogin = () => {
    if (isLoggingIn) return;
    setAuthError(null);
    setIsLoggingIn(true);
    googleSignIn()
      .then((result) => {
        setUser(result.user);
        setAccessToken(result.accessToken);
      })
      .catch((err) => {
        console.error('Google Sheets login error:', err);
        setAuthError(parseGoogleAuthError(err));
      })
      .finally(() => {
        setIsLoggingIn(false);
      });
  };

  const handleGoogleLogout = async () => {
    await logout();
    setUser(null);
    setAccessToken(null);
    setAuthError(null);
  };

  // Active supplier filtering for client storefront (paused suppliers remain visible in Manager Cabinet)
  const disabledSupplierIds = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; i < suppliers.length; i++) {
      if (!suppliers[i].active) set.add(suppliers[i].id);
    }
    return set;
  }, [suppliers]);

  const clientCatalog = useMemo(() => {
    if (disabledSupplierIds.size === 0) return catalog;
    return catalog.filter(
      (d) => !d.supplierId || !disabledSupplierIds.has(d.supplierId)
    );
  }, [catalog, disabledSupplierIds]);

  // Pre-indexed catalog & deferred search for smooth 60,000-100,000+ stone performance
  const deferredSearchQuery = useDeferredValue(filters.searchQuery);
  const catalogIndex = useMemo(
    () => buildCatalogIndex(clientCatalog),
    [clientCatalog]
  );

  const filteredCatalog = useMemo(
    () =>
      filterAndSortCatalog(
        clientCatalog,
        catalogIndex,
        filters,
        deferredSearchQuery,
        disabledSupplierIds
      ),
    [clientCatalog, catalogIndex, filters, deferredSearchQuery, disabledSupplierIds]
  );

  const inspectedDiamond = useMemo(
    () => (inspectedDiamondId ? catalog.find((d) => d.id === inspectedDiamondId) || null : null),
    [catalog, inspectedDiamondId]
  );

  const comparedDiamonds = useMemo(() => {
    if (comparedIds.length === 0) return [];
    const set = new Set(comparedIds);
    return clientCatalog.filter((d) => set.has(d.id));
  }, [clientCatalog, comparedIds]);

  const cartDiamonds = useMemo(() => {
    if (cartIds.length === 0) return [];
    const set = new Set(cartIds);
    return clientCatalog.filter((d) => set.has(d.id));
  }, [clientCatalog, cartIds]);

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

  const handleToggleCart = (diamondId: string) => {
    setCartIds((prev) =>
      prev.includes(diamondId)
        ? prev.filter((id) => id !== diamondId)
        : [...prev, diamondId]
    );
  };

  const handleSubmitOrder = (order: OrderRequest) => {
    setSubmittedOrders((prev) => [order, ...prev]);
    setCartIds([]);
    if (user?.emailVerified) {
      void saveCloudOrder(order).catch((err) => {
        console.warn('Cloud order save skipped:', err);
      });
    }
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

  const handlePublishToCloud = async (override?: {
    catalog: Diamond[];
    suppliers: SupplierFeed[];
    pricingConfig: PricingConfig;
  }) => {
    const targetCatalog = override?.catalog ?? catalog;
    const targetSuppliers = override?.suppliers ?? suppliers;
    const targetPricing = override?.pricingConfig ?? pricingConfig;

    setIsSyncingCloud(true);
    setCloudStatusMessage(null);
    setSyncProgress({ phase: 'local', completed: 0, total: 1 });
    try {
      const res = await publishCloudRegistry({
        catalog: targetCatalog,
        suppliers: targetSuppliers,
        pricingConfig: targetPricing,
        currentVersion: registryVersion,
        onProgress: setSyncProgress,
      });
      setRegistryVersion(res.version);
      setCloudStatusMessage(res.message);
    } catch (err: any) {
      setCloudStatusMessage(
        err?.message ||
          'Не удалось опубликовать в облачную базу. Локальная копия сохранена.'
      );
    } finally {
      setIsSyncingCloud(false);
      setSyncProgress(null);
    }
  };

  const handleImportFromSheets = (
    imported: Diamond[],
    replaceExisting: boolean
  ) => {
    expandFilterBoundsForDiamonds(imported, replaceExisting);
    const tagged = imported.map((d) => ({
      ...d,
      supplierId: d.supplierId || 'google-sheets',
      supplierName: d.supplierName || 'Google Таблицы',
      supplierFileName: d.supplierFileName || 'Google Sheets',
    }));
    const dedup = deduplicateDiamonds(
      tagged,
      catalog,
      replaceExisting ? 'all' : 'none'
    );
    const nextSuppliers = rebuildSupplierFeeds(dedup.diamonds, suppliers);
    setCatalog(dedup.diamonds);
    setSuppliers(nextSuppliers);
    setImportBanner(
      `Загружено ${imported.length.toLocaleString('ru-RU')} строк из Google Таблиц (уникальных в едином реестре: ${dedup.diamonds.length.toLocaleString('ru-RU')}).`
    );
    setActiveSection('catalog');
  };

  const handleOpenExcelImport = (
    targetDir: 'white' | 'fancy',
    mode: ExcelImportMode = 'none'
  ) => {
    setExcelTargetDirectory(targetDir);
    setExcelImportMode(mode);
    setIsExcelModalOpen(true);
  };

  const handleImportFromExcel = (
    imported: Diamond[],
    importMode: ExcelImportMode,
    fileName: string,
    targetDirectory: 'white' | 'fancy',
    supplier: { id: string; name: string }
  ) => {
    const replaceAll = importMode === 'all';
    expandFilterBoundsForDiamonds(imported, replaceAll);

    const dedup = deduplicateDiamonds(imported, catalog, importMode, supplier.id);
    const prevWithMeta: SupplierFeed[] = [
      ...suppliers.filter((s) => s.id !== supplier.id),
      {
        id: supplier.id,
        name: supplier.name,
        fileName,
        stoneCount: imported.length,
        whiteCount: 0,
        fancyCount: 0,
        active: true,
        updatedAt: new Date().toISOString(),
      },
    ];
    const nextSuppliers = rebuildSupplierFeeds(dedup.diamonds, prevWithMeta);

    setCatalog(dedup.diamonds);
    setSuppliers(nextSuppliers);

    if (replaceAll && imported.length > 0 && targetDirectory === 'white') {
      setComparedIds([]);
      setPairAnchorId(imported[0].id);
    }

    // Persist locally right away so an immediate reload keeps all imported stones
    void saveLocalRegistry({
      version: registryVersion,
      catalog: dedup.diamonds,
      suppliers: nextSuppliers,
      pricingConfig,
      savedAt: new Date().toISOString(),
    });

    // If verified admin is signed in, automatically publish updated unified registry to cloud
    if (isAdminSignedIn) {
      void handlePublishToCloud({
        catalog: dedup.diamonds,
        suppliers: nextSuppliers,
        pricingConfig,
      });
    }

    let importedFancy = 0;
    for (let i = 0; i < imported.length; i++) {
      if (isFancyDiamond(imported[i])) importedFancy++;
    }
    const importedWhite = imported.length - importedFancy;

    const dupSuffix =
      dedup.duplicatesInBatch > 0
        ? ` · объединено дублей: ${dedup.duplicatesInBatch.toLocaleString('ru-RU')}`
        : '';
    const modeLabel =
      importMode === 'all'
        ? 'Реестр заменён'
        : importMode === 'supplier'
          ? `Обновлён прайс поставщика «${supplier.name}»`
          : `Добавлено в единый реестр («${supplier.name}»)`;
    setImportBanner(
      `${modeLabel}: ${imported.length.toLocaleString('ru-RU')} строк из «${fileName}» (белых: ${importedWhite.toLocaleString('ru-RU')}, цветных: ${importedFancy.toLocaleString('ru-RU')}; новых: ${dedup.addedCount.toLocaleString('ru-RU')}, обновлено: ${dedup.updatedCount.toLocaleString('ru-RU')}${dupSuffix}). Всего в базе: ${dedup.diamonds.length.toLocaleString('ru-RU')}.`
    );
  };

  // Manager Cabinet Actions
  const handleToggleSupplierActive = (supplierId: string) => {
    setSuppliers((prev) =>
      prev.map((s) => (s.id === supplierId ? { ...s, active: !s.active } : s))
    );
  };

  const handleDeleteSupplier = (supplierId: string) => {
    const nextCatalog = catalog.filter((d) => {
      const id = d.supplierId || (d.source === 'catalog' ? 'default-atelier' : 'manual');
      return id !== supplierId;
    });
    const remainingIds = new Set(nextCatalog.map((d) => d.id));
    setCatalog(nextCatalog);
    setSuppliers((prev) =>
      rebuildSupplierFeeds(
        nextCatalog,
        prev.filter((s) => s.id !== supplierId)
      )
    );
    setComparedIds((prev) => prev.filter((id) => remainingIds.has(id)));
    setCartIds((prev) => prev.filter((id) => remainingIds.has(id)));
    if (inspectedDiamondId && !remainingIds.has(inspectedDiamondId)) {
      setInspectedDiamondId(null);
    }
  };

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

  const handleBatchUpdateDiamonds = (updatedList: Diamond[]) => {
    if (updatedList.length === 0) return;
    const byId = new Map<string, Diamond>();
    for (const item of updatedList) {
      byId.set(item.id, item);
    }
    const nextCatalog = catalog.map((d) => byId.get(d.id) || d);
    const nextSuppliers = rebuildSupplierFeeds(nextCatalog, suppliers);
    setCatalog(nextCatalog);
    setSuppliers(nextSuppliers);
    expandFilterBoundsForDiamonds(updatedList, false);

    void saveLocalRegistry({
      version: registryVersion,
      catalog: nextCatalog,
      suppliers: nextSuppliers,
      pricingConfig,
      savedAt: new Date().toISOString(),
      clearedExplicitly: nextCatalog.length === 0,
    });

    if (isAdminSignedIn) {
      void handlePublishToCloud({
        catalog: nextCatalog,
        suppliers: nextSuppliers,
        pricingConfig,
      });
    }
  };

  const handleAddDiamond = (created: Diamond) => {
    const tagged: Diamond = {
      ...created,
      supplierId: created.supplierId || 'manual',
      supplierName: created.supplierName || 'Добавлено вручную',
      supplierFileName: created.supplierFileName || 'Ручной ввод',
    };
    const nextCatalog = [tagged, ...catalog];
    setCatalog(nextCatalog);
    setSuppliers((prev) => rebuildSupplierFeeds(nextCatalog, prev));
    expandFilterBoundsForDiamonds([tagged], false);
  };

  const handleDeleteDiamond = (diamondId: string) => {
    const nextCatalog = catalog.filter((d) => d.id !== diamondId);
    setCatalog(nextCatalog);
    setSuppliers((prev) => rebuildSupplierFeeds(nextCatalog, prev));
    setComparedIds((prev) => prev.filter((id) => id !== diamondId));
    setCartIds((prev) => prev.filter((id) => id !== diamondId));
    if (inspectedDiamondId === diamondId) {
      setInspectedDiamondId(null);
    }
  };

  const handleClearAssortment = (
    mode: 'all' | 'ids' | 'restore-demo',
    stoneIds?: string[]
  ) => {
    let nextCatalog: Diamond[] = [];
    if (mode === 'all') {
      nextCatalog = [];
    } else if (mode === 'ids' && stoneIds && stoneIds.length > 0) {
      const removeSet = new Set(stoneIds);
      nextCatalog = catalog.filter((d) => !removeSet.has(d.id));
    } else if (mode === 'restore-demo') {
      nextCatalog = ALL_INITIAL_DIAMONDS;
    }

    const nextSuppliers = rebuildSupplierFeeds(
      nextCatalog,
      mode === 'all' ? [] : suppliers
    );
    const remainingIds = new Set(nextCatalog.map((d) => d.id));

    setCatalog(nextCatalog);
    setSuppliers(nextSuppliers);
    setComparedIds((prev) => prev.filter((id) => remainingIds.has(id)));
    setCartIds((prev) => prev.filter((id) => remainingIds.has(id)));
    if (inspectedDiamondId && !remainingIds.has(inspectedDiamondId)) {
      setInspectedDiamondId(null);
    }
    setPairAnchorId(nextCatalog[0]?.id ?? null);

    if (nextCatalog.length > 0) {
      expandFilterBoundsForDiamonds(nextCatalog, true);
    } else {
      setFilters(DEFAULT_FILTERS);
    }

    void saveLocalRegistry({
      version: registryVersion,
      catalog: nextCatalog,
      suppliers: nextSuppliers,
      pricingConfig,
      savedAt: new Date().toISOString(),
      clearedExplicitly: nextCatalog.length === 0,
    });

    if (isAdminSignedIn) {
      void handlePublishToCloud({
        catalog: nextCatalog,
        suppliers: nextSuppliers,
        pricingConfig,
      });
    }
  };

  const handleBulkUpdateAssortment = (
    stoneIds: string[] | null,
    patch: BulkAssortmentPatch
  ) => {
    const idSet = stoneIds ? new Set(stoneIds) : null;
    const cleanSupplier = patch.supplierName?.trim();
    const customSupplierId = cleanSupplier
      ? `sup-${cleanSupplier
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 24) || 'custom'}-${Date.now().toString(36).slice(-4)}`
      : undefined;
    const existingMatchedSupplier = cleanSupplier
      ? suppliers.find(
          (s) => s.name.trim().toLowerCase() === cleanSupplier.toLowerCase()
        )
      : undefined;
    const resolvedSupId = existingMatchedSupplier?.id || customSupplierId;

    const nextCatalog = catalog.map((stone) => {
      if (idSet !== null && !idSet.has(stone.id)) return stone;
      let next: Diamond = { ...stone };

      if (patch.directory === 'white') {
        next.directory = 'white';
        next.isFancyColor = false;
        next.stoneType = 'Бриллиант';
        next.colorFamily = 'Бесцветный (D–J)';
        next.fancyIntensity = undefined;
      } else if (patch.directory === 'fancy') {
        next.directory = 'fancy';
        next.isFancyColor = true;
        next.stoneType = 'Цветной бриллиант';
        if (!next.colorFamily || next.colorFamily === 'Бесцветный (D–J)') {
          next.colorFamily = 'Фантазийный';
        }
      }

      if (patch.growthType) {
        next.growthType = patch.growthType;
      }

      if (cleanSupplier && resolvedSupId) {
        next.supplierId = resolvedSupId;
        next.supplierName = cleanSupplier;
      }

      if (patch.photoMode === 'studio') {
        next.useStudioPhoto = true;
      } else if (patch.photoMode === 'supplier') {
        next.useStudioPhoto = false;
      }

      if (patch.pricingAction === 'apply' && patch.pricingConfig) {
        next = applyPricingToDiamond(next, patch.pricingConfig);
      } else if (patch.pricingAction === 'reset-to-cost') {
        next = applyPricingToDiamond(next, {
          mode: 'multiplier',
          value: 1,
          roundingStep: 1,
          applyOnImport: pricingConfig.applyOnImport,
        });
      }

      return next;
    });

    const nextSuppliers = rebuildSupplierFeeds(nextCatalog, suppliers);
    setCatalog(nextCatalog);
    setSuppliers(nextSuppliers);
    expandFilterBoundsForDiamonds(nextCatalog, false);

    void saveLocalRegistry({
      version: registryVersion,
      catalog: nextCatalog,
      suppliers: nextSuppliers,
      pricingConfig,
      savedAt: new Date().toISOString(),
      clearedExplicitly: nextCatalog.length === 0,
    });

    if (isAdminSignedIn) {
      void handlePublishToCloud({
        catalog: nextCatalog,
        suppliers: nextSuppliers,
        pricingConfig,
      });
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
              {comparedIds.length > 0 ? `Сравнение (${comparedIds.length})` : 'Сравнение'}
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('cart')}
              className={`inline-flex items-center gap-1.5 py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                activeSection === 'cart'
                  ? 'border-[#1B365D] text-[#111317]'
                  : 'border-transparent hover:text-[#111317]'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              {cartDiamonds.length > 0 ? `Корзина (${cartDiamonds.length})` : 'Корзина'}
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
            {user ? (
              <button
                type="button"
                onClick={() => setActiveSection('sheets')}
                className="px-4 py-2 text-xs font-medium rounded-md bg-[#1B365D] text-white hover:bg-[#142947] transition-colors whitespace-nowrap shrink-0 max-w-[200px] truncate"
              >
                {user.displayName || user.email || 'Аккаунт'}
              </button>
            ) : (
              <GoogleSignInButton
                onClick={handleGoogleCloudLogin}
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
              {
                id: 'compare',
                label:
                  comparedIds.length > 0 ? `Сравнение (${comparedIds.length})` : 'Сравнение',
              },
              {
                id: 'cart',
                label:
                  cartDiamonds.length > 0 ? `Корзина (${cartDiamonds.length})` : 'Корзина',
              },
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
        {authError && activeSection !== 'manager' && (
          <div className="max-w-7xl mx-auto px-6 pt-4">
            <div className="p-3.5 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#991B1B] flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div>{authError.message}</div>
                <div className="font-mono text-[11px] opacity-80">
                  {authError.code}
                  {authError.host ? ` · ${authError.host}` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAuthError(null)}
                aria-label="Скрыть ошибку входа"
                className="text-[#991B1B] hover:text-[#7F1D1D] shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        {activeSection === 'catalog' && (
          <>
            {/* Editorial Storefront Hero Split */}
            <section className="bg-white border-b border-[#E4E6EB]">
              <div className="max-w-7xl mx-auto px-6 py-10 lg:py-14">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
                  <div className="lg:col-span-6 flex flex-col justify-center space-y-6 py-2">
                    <div className="text-xs font-medium text-[#5A606D] tracking-wide">
                      Сертифицированные природные бриллианты · GIA, IGI, HRD
                    </div>
                    <h1
                      className="text-4xl sm:text-5xl font-semibold text-[#111317] leading-[1.08] tracking-tight"
                      style={{ textWrap: 'balance' }}
                    >
                      Селектор сертифицированных бриллиантов
                    </h1>
                    <p className="text-base text-[#5A606D] leading-relaxed max-w-xl">
                      Точный отбор по огранке, цвету, чистоте и каратности с обзором
                      360°, прямыми ссылками на реестры лабораторий и подбором пар.
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
                      {clientCatalog.length.toLocaleString('ru-RU')} камней
                    </div>
                    <div className="text-xs text-[#5A606D] mt-0.5 tabular-nums">
                      Белые: {catalogIndex.whiteCount.toLocaleString('ru-RU')} · Цветные:{' '}
                      {catalogIndex.fancyCount.toLocaleString('ru-RU')}
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
                      Корзина и заявка
                    </div>
                    <div className="text-xs text-[#5A606D] mt-0.5">
                      Формирование и отправка запроса по камням
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
              catalog={clientCatalog}
              totalCount={clientCatalog.length}
              whiteCount={catalogIndex.whiteCount}
              fancyCount={catalogIndex.fancyCount}
              onGoToManager={() => setActiveSection('manager')}
              filters={filters}
              onChangeFilters={setFilters}
              onResetFilters={handleResetFilters}
              comparedIds={comparedIds}
              cartIds={cartIds}
              watchedDiamondIds={watchedDiamondIds}
              onInspect={handleInspect}
              onToggleCompare={handleToggleCompare}
              onToggleCart={handleToggleCart}
              onFindPair={handleFindPair}
              onToggleWatch={handleToggleWatchDiamond}
            />
          </>
        )}

        <SectionErrorBoundary resetKey={`${activeSection}-${isManagerUnlocked}`}>
          {activeSection === 'manager' &&
            (isManagerUnlocked ? (
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
                <ManagerCabinetView
                  catalog={catalog}
                  suppliers={suppliers}
                  pricingConfig={pricingConfig}
                  managerEmail={user?.email ?? null}
                  isAdminSignedIn={isAdminSignedIn}
                  isLoggingIn={isLoggingIn}
                  authError={authError}
                  canUseRedirectSignIn={canUseRedirectSignIn}
                  isSyncingCloud={isSyncingCloud}
                  syncProgress={syncProgress}
                  cloudStatusMessage={cloudStatusMessage}
                  onUpdatePricingConfig={setPricingConfig}
                  onApplyPricingToStones={handleApplyPricingToStones}
                  onUpdateDiamond={handleUpdateDiamond}
                  onBatchUpdateDiamonds={handleBatchUpdateDiamonds}
                  onAddDiamond={handleAddDiamond}
                  onDeleteDiamond={handleDeleteDiamond}
                  onBulkUpdateAssortment={handleBulkUpdateAssortment}
                  onClearAssortment={handleClearAssortment}
                  onToggleSupplierActive={handleToggleSupplierActive}
                  onDeleteSupplier={handleDeleteSupplier}
                  onPublishToCloud={() => void handlePublishToCloud()}
                  onRequestGoogleLogin={handleGoogleCloudLogin}
                  onRequestGoogleRedirectLogin={handleGoogleCloudRedirectLogin}
                  onOpenExcelImport={(mode) => handleOpenExcelImport('white', mode)}
                  onLockCabinet={() => {
                    setIsManagerUnlocked(false);
                    setActiveSection('catalog');
                  }}
                />
              </>
            ) : (
              <ManagerPasswordGate
                expectedPassword="0000"
                onUnlock={() => setIsManagerUnlocked(true)}
                onCancel={() => setActiveSection('catalog')}
              />
            ))}

          <Suspense fallback={<SectionFallback />}>
            {activeSection === 'pair-finder' && (
              <PairFinderView
                catalog={clientCatalog}
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

            {activeSection === 'cart' && (
              <CartView
                diamonds={cartDiamonds}
                submittedOrders={submittedOrders}
                onRemove={(id) =>
                  setCartIds((prev) => prev.filter((item) => item !== id))
                }
                onClearCart={() => setCartIds([])}
                onInspect={handleInspect}
                onSubmitOrder={handleSubmitOrder}
                onGoToCatalog={() => setActiveSection('catalog')}
              />
            )}

            {activeSection === 'sheets' && (
              <GoogleSheetsWorkspace
                user={user}
                accessToken={accessToken}
                isLoggingIn={isLoggingIn}
                onLogin={handleGoogleSheetsLogin}
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
          </Suspense>
        </SectionErrorBoundary>
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
              onClick={() => setActiveSection('pair-finder')}
              className="hover:text-[#111317] transition-colors"
            >
              Подбор пары
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('cart')}
              className="hover:text-[#111317] transition-colors"
            >
              Корзина
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

      {/* Diamond Detail Modal */}
      {inspectedDiamond && (
        <DiamondDetailModal
          diamond={inspectedDiamond}
          initialTab={inspectorTab}
          isCompared={comparedIds.includes(inspectedDiamond.id)}
          isInCart={cartIds.includes(inspectedDiamond.id)}
          onClose={() => setInspectedDiamondId(null)}
          onToggleCompare={handleToggleCompare}
          onToggleCart={handleToggleCart}
          onFindPair={handleFindPair}
          onUpdateDiamond={handleUpdateDiamond}
        />
      )}

      {/* Excel Import Modal (xlsx library & worker load on demand when a file is chosen) */}
      {isExcelModalOpen && (
        <ExcelImportModal
          open={isExcelModalOpen}
          defaultTargetDirectory={excelTargetDirectory}
          defaultImportMode={excelImportMode}
          pricingConfig={pricingConfig}
          existingSuppliers={suppliers}
          onClose={() => setIsExcelModalOpen(false)}
          onImport={handleImportFromExcel}
        />
      )}
    </div>
  );
}
