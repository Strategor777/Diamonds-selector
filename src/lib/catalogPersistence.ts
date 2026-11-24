import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import {
  DEFAULT_PRICING_CONFIG,
  SHAPE_IMAGE_MAP,
  getCertVerifyUrl,
  getFancyDiamondImage,
} from '../data/diamonds';
import {
  CutGrade,
  Diamond,
  DiamondShape,
  FluorescenceGrade,
  OrderRequest,
  PolishSymmetryGrade,
  PriceCurrency,
  PricingConfig,
  SupplierFeed,
} from '../types/diamond';
import {
  OperationType,
  auth,
  db,
  handleFirestoreError,
  isFirestoreOfflineError,
  isFirestoreQuotaError,
  isVerifiedAdminEmail,
} from './firebase';
import {
  markSyncTimestamp,
  recordFirestoreDelete,
  recordFirestoreRead,
  recordFirestoreWrite,
  recordServerCacheHit,
  recordSkippedRead,
  recordSkippedWrite,
} from './firestoreMetrics';

const IDB_NAME = 'diamonds_selector_registry_v2';
const IDB_STORE = 'registry_kv';
const IDB_VERSION = 1;
const QUOTA_COOLDOWN_KEY = 'diamonds_selector_fs_quota_until_v1';
const LAST_SYNC_AT_KEY = 'diamonds_selector_last_sync_at_v1';
const QUOTA_COOLDOWN_MS = 15 * 60 * 1000;
export const DEFAULT_SYNC_TTL_MS = 15 * 60 * 1000; // 15 min client TTL cache

export const SHARD_SIZE = 500; // Max allowed by firestore.rules (<= 500) with compact v2 maps (< 180 KB/doc)
const CONCURRENT_SHARD_OPS = 6;

export function getLastSyncAt(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = Number(window.localStorage.getItem(LAST_SYNC_AT_KEY) || 0);
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  } catch {
    return null;
  }
}

export function setLastSyncAt(timestamp = Date.now()): void {
  markSyncTimestamp(timestamp);
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LAST_SYNC_AT_KEY, String(timestamp));
  } catch {
    // ignore storage errors
  }
}

export function isSyncFresh(
  lastSyncAt: number | null | undefined,
  ttlMs = DEFAULT_SYNC_TTL_MS
): boolean {
  if (!lastSyncAt || !Number.isFinite(lastSyncAt)) return false;
  return Date.now() - lastSyncAt < ttlMs;
}

export function isCloudQuotaInCooldown(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const until = Number(window.sessionStorage.getItem(QUOTA_COOLDOWN_KEY) || 0);
    return Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
}

function markCloudQuotaExceeded() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      QUOTA_COOLDOWN_KEY,
      String(Date.now() + QUOTA_COOLDOWN_MS)
    );
  } catch {
    // ignore storage errors
  }
}

export interface LocalRegistrySnapshot {
  version: number;
  catalog: Diamond[];
  suppliers: SupplierFeed[];
  pricingConfig: PricingConfig;
  savedAt: string;
  lastSyncAt?: number;
  publicShardHashes?: Record<string, string>;
  costShardHashes?: Record<string, string>;
  clearedExplicitly?: boolean;
}

export interface RegistrySyncProgress {
  phase: 'local' | 'cloud-public' | 'cloud-costs' | 'cloud-cleanup' | 'cloud-meta' | 'done';
  completed: number;
  total: number;
}

// === IndexedDB Local Instant Storage (Handles 100,000+ stones in ~100ms) ===

function openRegistryDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const idb = req.result;
      if (!idb.objectStoreNames.contains(IDB_STORE)) {
        idb.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'));
  });
}

export async function saveLocalRegistry(
  snapshot: LocalRegistrySnapshot
): Promise<void> {
  try {
    const idb = await openRegistryDb();
    await new Promise<void>((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(snapshot, 'snapshot');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
    });
    idb.close();
  } catch (err) {
    console.warn('Local IndexedDB save skipped:', err);
  }
}

export async function loadLocalRegistry(): Promise<LocalRegistrySnapshot | null> {
  try {
    const idb = await openRegistryDb();
    const result = await new Promise<LocalRegistrySnapshot | null>((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get('snapshot');
      req.onsuccess = () => resolve((req.result as LocalRegistrySnapshot) || null);
      req.onerror = () => reject(req.error || new Error('IndexedDB read failed'));
    });
    idb.close();
    if (
      result &&
      Array.isArray(result.catalog) &&
      (result.catalog.length > 0 || result.clearedExplicitly)
    ) {
      return result;
    }
    return null;
  } catch {
    return null;
  }
}

// === Ultra-Compact v2 Stone Serialization (Native Firestore Maps, Backward-Compatible with v1) ===

const SHAPE_ENCODE: Record<DiamondShape, string> = {
  Round: 'RD',
  Princess: 'PR',
  Emerald: 'EM',
  Oval: 'OV',
  Pear: 'PE',
  Marquise: 'MQ',
  Radiant: 'RA',
  Cushion: 'CU',
  Asscher: 'AS',
  Heart: 'HT',
  Baguette: 'BG',
  Trilliant: 'TR',
  'Old European': 'OE',
  'Old Mine': 'OM',
  'Antique Cushion': 'AC',
  'Rose Cut': 'RC',
  Shield: 'SH',
  Kite: 'KT',
  Hexagon: 'HX',
  Octagon: 'OC',
  Lozenge: 'LZ',
  'Half Moon': 'HM',
  Trapezoid: 'TZ',
  Cadillac: 'CD',
  Briolette: 'BR',
  Cabochon: 'CB',
  Moval: 'MV',
};

const SHAPE_DECODE: Record<string, DiamondShape> = Object.fromEntries(
  Object.entries(SHAPE_ENCODE).map(([full, code]) => [code, full as DiamondShape])
);

const CUT_ENCODE: Record<CutGrade, string> = {
  Ideal: 'ID',
  Excellent: 'EX',
  'Very Good': 'VG',
  Good: 'GD',
  Mixed: 'MX',
  Step: 'ST',
};

const CUT_DECODE: Record<string, CutGrade> = {
  ID: 'Ideal',
  EX: 'Excellent',
  VG: 'Very Good',
  GD: 'Good',
  MX: 'Mixed',
  ST: 'Step',
  Ideal: 'Ideal',
  Excellent: 'Excellent',
  'Very Good': 'Very Good',
  Good: 'Good',
  Mixed: 'Mixed',
  Step: 'Step',
};

const POL_SYM_ENCODE: Record<PolishSymmetryGrade, string> = {
  Excellent: 'EX',
  'Very Good': 'VG',
  Good: 'GD',
};

const POL_SYM_DECODE: Record<string, PolishSymmetryGrade> = {
  EX: 'Excellent',
  VG: 'Very Good',
  GD: 'Good',
  Excellent: 'Excellent',
  'Very Good': 'Very Good',
  Good: 'Good',
};

const FLUOR_ENCODE: Record<FluorescenceGrade, string> = {
  None: 'N',
  Faint: 'F',
  Medium: 'M',
  Strong: 'S',
};

const FLUOR_DECODE: Record<string, FluorescenceGrade> = {
  N: 'None',
  F: 'Faint',
  M: 'Medium',
  S: 'Strong',
  None: 'None',
  Faint: 'Faint',
  Medium: 'Medium',
  Strong: 'Strong',
};

const COLOR_FAMILY_ENCODE: Record<string, string> = {
  'Бесцветный (D–J)': 'W',
  'Жёлтый': 'YL',
  'Розовый': 'PK',
  'Голубой': 'BL',
  'Синий': 'BL',
  'Зелёный': 'GN',
  'Коричневый': 'BN',
  'Коньячный': 'CG',
  'Шампань': 'CH',
  'Оранжевый': 'OR',
  'Фиолетовый': 'PP',
  'Красный': 'RD',
  'Серый': 'GY',
  'Чёрный': 'BK',
  'Хамелеон': 'CM',
  'Фантазийный': 'FN',
};

const COLOR_FAMILY_DECODE: Record<string, string> = {
  W: 'Бесцветный (D–J)',
  YL: 'Жёлтый',
  PK: 'Розовый',
  BL: 'Голубой',
  GN: 'Зелёный',
  BN: 'Коричневый',
  CG: 'Коньячный',
  CH: 'Шампань',
  OR: 'Оранжевый',
  PP: 'Фиолетовый',
  RD: 'Красный',
  GY: 'Серый',
  BK: 'Чёрный',
  CM: 'Хамелеон',
  FN: 'Фантазийный',
};

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return cleaned.length > 0 ? cleaned : `id_${Date.now()}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Compact v2 serialization for public Firestore shards.
 * Uses native Firestore Maps (no JSON.stringify) while omitting defaults,
 * derivable fields (lwRatio, standard certUrl), and encoding repetitive enums
 * into 1–2 char codes — reducing document size by ~40–50%.
 */
export function toCompactPublicStone(d: Diamond): Record<string, unknown> {
  const dir = d.directory || (d.isFancyColor ? 'fancy' : 'white');
  const item: Record<string, unknown> = {
    i: d.id.slice(0, 120),
    ct: round2(d.carat),
    cl: (d.color || 'G').slice(0, 64),
    cr: (d.clarity || 'VS1').slice(0, 24),
    pr: Math.round(d.priceUsd),
  };

  if (d.sku && d.sku !== d.id) item.k = d.sku.slice(0, 80);
  if (d.shape !== 'Round') item.sh = SHAPE_ENCODE[d.shape] || d.shape;
  if (d.cut !== 'Excellent') item.cu = CUT_ENCODE[d.cut] || d.cut;
  if (d.polish !== 'Excellent') item.po = POL_SYM_ENCODE[d.polish] || d.polish;
  if (d.symmetry !== 'Excellent') item.sy = POL_SYM_ENCODE[d.symmetry] || d.symmetry;
  if (d.fluorescence !== 'None') item.fl = FLUOR_ENCODE[d.fluorescence] || d.fluorescence;

  const dp = round1(d.depthPercent);
  const tb = round1(d.tablePercent);
  if (dp !== 61.8) item.dp = dp;
  if (tb !== 57.5) item.tb = tb;

  const ln = round2(d.lengthMm);
  const wd = round2(d.widthMm);
  const dm = round2(d.depthMm);
  if (ln !== 6.4) item.ln = ln;
  if (wd !== 6.4) item.wd = wd;
  if (dm !== 3.95) item.dm = dm;

  const lab = (d.certLab || 'GIA').slice(0, 24);
  if (lab !== 'GIA') item.lb = lab;
  if (d.certNumber) item.cn = d.certNumber.slice(0, 64);
  if (d.currency && d.currency !== 'USD') item.cy = d.currency;
  if (dir === 'fancy') item.dr = 'f';

  if (
    d.stoneType &&
    d.stoneType !== 'Бриллиант' &&
    !(dir === 'fancy' && d.stoneType === 'Цветной бриллиант')
  ) {
    item.st = d.stoneType.slice(0, 64);
  }
  if (d.growthType && d.growthType !== 'Natural') item.gt = d.growthType;
  if (d.colorFamily && d.colorFamily !== 'Бесцветный (D–J)') {
    item.cf = COLOR_FAMILY_ENCODE[d.colorFamily] || d.colorFamily.slice(0, 48);
  }
  if (d.fancyIntensity) item.fi = d.fancyIntensity.slice(0, 32);
  const ovt = (d.fancyOvertone || d.overtone || '').trim();
  if (ovt) item.fo = ovt.slice(0, 48);

  // Store certUrl only if it differs from the standard computed verification URL
  if (d.certUrl && d.certUrl.startsWith('http')) {
    const computedDefault = getCertVerifyUrl(lab, d.certNumber || '');
    if (d.certUrl !== computedDefault) {
      item.cu2 = d.certUrl.slice(0, 400);
    }
  }
  if (d.imageUrl && d.imageUrl.startsWith('http')) item.im = d.imageUrl.slice(0, 400);
  if (d.videoUrl && d.videoUrl.startsWith('http')) item.vd = d.videoUrl.slice(0, 400);
  if (d.supplierId) item.sp = sanitizeId(d.supplierId).slice(0, 64);
  if (d.certColorVerified) item.cv = 1;
  if (d.certParamsVerified) item.pv = 1;
  if (d.useStudioPhoto) item.us = 1;

  return item;
}

/**
 * Decodes BOTH compact v2 stone maps AND legacy v1 stone maps seamlessly.
 */
export function fromCompactPublicStone(raw: Record<string, unknown>): Diamond {
  const id = String(raw.i ?? raw.id ?? '');
  const sku = String(raw.k ?? raw.sku ?? id);
  const rawShape = typeof raw.sh === 'string' ? raw.sh : 'Round';
  const shape = SHAPE_DECODE[rawShape] || (rawShape as DiamondShape) || 'Round';

  const color = String(raw.cl || 'G');
  const directory = raw.dr === 'f' || raw.dr === 'fancy' ? 'fancy' : 'white';
  const rawFamily = typeof raw.cf === 'string' ? raw.cf : '';
  const colorFamily = rawFamily
    ? COLOR_FAMILY_DECODE[rawFamily] || rawFamily
    : directory === 'fancy'
      ? 'Фантазийный'
      : 'Бесцветный (D–J)';

  const certLab = String(raw.lb || 'GIA');
  const certNumber = String(raw.cn || '');
  const certUrl =
    typeof raw.cu2 === 'string' && raw.cu2.startsWith('http')
      ? raw.cu2
      : getCertVerifyUrl(certLab, certNumber);
  const imageUrl =
    typeof raw.im === 'string' && raw.im.startsWith('http')
      ? raw.im
      : directory === 'fancy'
        ? getFancyDiamondImage(color, colorFamily, shape)
        : SHAPE_IMAGE_MAP[shape] || SHAPE_IMAGE_MAP.Round;

  const lengthMm = Number(raw.ln ?? 6.4);
  const widthMm = Number(raw.wd ?? 6.4);
  const depthMm = Number(raw.dm ?? 3.95);
  const lwRatio =
    raw.lw !== undefined
      ? Number(raw.lw)
      : round2(lengthMm / Math.max(0.01, widthMm));

  const cutRaw = typeof raw.cu === 'string' ? raw.cu : 'EX';
  const poRaw = typeof raw.po === 'string' ? raw.po : 'EX';
  const syRaw = typeof raw.sy === 'string' ? raw.sy : 'EX';
  const flRaw = typeof raw.fl === 'string' ? raw.fl : 'N';

  return {
    id,
    sku,
    stoneType: raw.st
      ? String(raw.st)
      : directory === 'fancy'
        ? 'Цветной бриллиант'
        : 'Бриллиант',
    growthType:
      raw.gt === 'CVD' || raw.gt === 'HPHT' ? raw.gt : 'Natural',
    shape,
    carat: Number(raw.ct || 1),
    color,
    colorFamily,
    clarity: String(raw.cr || 'VS1'),
    cut: CUT_DECODE[cutRaw] || 'Excellent',
    polish: POL_SYM_DECODE[poRaw] || 'Excellent',
    symmetry: POL_SYM_DECODE[syRaw] || 'Excellent',
    fluorescence: FLUOR_DECODE[flRaw] || 'None',
    depthPercent: Number(raw.dp ?? 61.8),
    tablePercent: Number(raw.tb ?? 57.5),
    crownAngle: 34.5,
    pavilionAngle: 40.8,
    girdle: 'Medium',
    culet: 'None',
    lengthMm,
    widthMm,
    depthMm,
    lwRatio,
    certLab,
    certNumber,
    certDate: '',
    certUrl,
    imageUrl,
    videoUrl: typeof raw.vd === 'string' ? raw.vd : undefined,
    priceUsd: Number(raw.pr || 0),
    currency: (raw.cy as PriceCurrency) || 'USD',
    origin: '',
    inStock: true,
    source: 'xlsx',
    supplierId: typeof raw.sp === 'string' ? raw.sp : undefined,
    directory,
    isFancyColor: directory === 'fancy',
    fancyIntensity: typeof raw.fi === 'string' ? raw.fi : undefined,
    fancyOvertone: typeof raw.fo === 'string' ? raw.fo : undefined,
    primaryHue: directory === 'fancy' ? colorFamily : undefined,
    overtone: typeof raw.fo === 'string' ? raw.fo : undefined,
    certColorVerified: raw.cv === 1 ? true : undefined,
    certParamsVerified: raw.pv === 1 ? true : undefined,
    certVerifiedColor: raw.cv === 1 ? color : undefined,
    useStudioPhoto: raw.us === 1 ? true : undefined,
  };
}

function toCompactCostEntry(d: Diamond): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    i: d.id.slice(0, 120),
    cs: Math.max(1, Math.round(d.costPriceUsd || d.priceUsd || 1)),
  };
  if (d.markupMode && d.markupMode !== 'multiplier') entry.mm = 'p';
  const mv = typeof d.markupValue === 'number' ? round2(d.markupValue) : 1.25;
  if (mv !== 1.25) entry.mv = mv;
  if (d.supplierId) entry.sp = sanitizeId(d.supplierId).slice(0, 64);
  if (d.supplierName) entry.sn = d.supplierName.slice(0, 120);
  if (d.supplierFileName) entry.sf = d.supplierFileName.slice(0, 180);
  return entry;
}

// === Deterministic 64-bit FNV-1a Shard Hash for Differential Sync ===

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

export function computeShardDataHash(items: Record<string, unknown>[]): string {
  const text = stableStringify(items);
  // Dual 32-bit FNV-1a lanes for a compact, deterministic 16-char hex digest
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c + (i & 0xff);
    h2 = Math.imul(h2, 0x01000193);
  }
  return (
    (h1 >>> 0).toString(16).padStart(8, '0') +
    (h2 >>> 0).toString(16).padStart(8, '0')
  );
}

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
  onTick?: (completed: number, total: number) => void
): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let nextIndex = 0;
  let completed = 0;

  const worker = async () => {
    while (nextIndex < tasks.length) {
      const current = nextIndex++;
      results[current] = await tasks[current]();
      completed++;
      onTick?.(completed, tasks.length);
    }
  };

  const workers = Array.from(
    { length: Math.min(limit, Math.max(1, tasks.length)) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

// === Public & Admin Cloud Registry Read ===

export interface CloudLoadResult {
  version: number;
  catalog: Diamond[];
  shardHashes?: Record<string, string>;
  suppliers?: SupplierFeed[];
  pricingConfig?: PricingConfig;
  upToDate?: boolean;
  skippedByTtl?: boolean;
  quotaExceeded?: boolean;
  offline?: boolean;
  source?: 'ttl-cache' | 'public-endpoint' | 'firestore';
}

export interface FetchCloudRegistryOptions {
  includeManagerData?: boolean;
  cachedVersion?: number;
  cachedCatalog?: Diamond[];
  cachedShardHashes?: Record<string, string>;
  lastSyncAt?: number | null;
  ttlMs?: number;
  force?: boolean;
}

/**
 * Lightweight client-only loader: calls the cached public Express endpoint
 * (/api/public/catalog) which serves public shards ONLY (zero wholesale costs)
 * and falls back to direct Firestore SDK only if the endpoint is unavailable.
 */
export async function fetchPublicClientCatalog(
  options?: Omit<FetchCloudRegistryOptions, 'includeManagerData'>
): Promise<CloudLoadResult | null> {
  const cachedVersion = options?.cachedVersion || 0;
  const lastSync = options?.lastSyncAt ?? getLastSyncAt();
  const ttlMs = options?.ttlMs ?? DEFAULT_SYNC_TTL_MS;

  // TTL cache check: skip network entirely when recently synced and local catalog exists
  if (!options?.force && cachedVersion > 0 && isSyncFresh(lastSync, ttlMs)) {
    recordSkippedRead('ttl', 1, 'Клиентский TTL-кеш актуален');
    return {
      version: cachedVersion,
      catalog: [],
      upToDate: true,
      skippedByTtl: true,
      source: 'ttl-cache',
    };
  }

  // Try lightweight cached public endpoint first (1 server read shared across all clients)
  if (typeof fetch !== 'undefined') {
    try {
      const qs = new URLSearchParams();
      if (cachedVersion > 0) {
        qs.set('cachedVersion', String(cachedVersion));
      }
      const res = await fetch(`/api/public/catalog?${qs.toString()}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (res.ok) {
        const data = (await res.json()) as {
          upToDate?: boolean;
          version?: number;
          shardCount?: number;
          shardHashes?: Record<string, string>;
          shards?: { shardIndex: number; items: Record<string, unknown>[] }[];
        };

        const remoteVersion = Number(data.version || 0);
        setLastSyncAt(Date.now());
        recordServerCacheHit(
          data.upToDate
            ? `Публичный endpoint: v${remoteVersion} актуальна`
            : `Публичный endpoint: загружено ${data.shards?.length || 0} шардов`
        );

        if (data.upToDate || (cachedVersion > 0 && remoteVersion === cachedVersion)) {
          recordSkippedRead(
            'version',
            Math.max(1, Number(data.shardCount || 1)),
            `Локальная v${cachedVersion} совпадает с облаком`
          );
          return {
            version: remoteVersion || cachedVersion,
            catalog: [],
            shardHashes: data.shardHashes,
            upToDate: true,
            source: 'public-endpoint',
          };
        }

        const orderedShards = Array.isArray(data.shards)
          ? [...data.shards].sort((a, b) => a.shardIndex - b.shardIndex)
          : [];
        const diamonds: Diamond[] = [];
        for (const shard of orderedShards) {
          if (!Array.isArray(shard.items)) continue;
          for (let j = 0; j < shard.items.length; j++) {
            diamonds.push(fromCompactPublicStone(shard.items[j]));
          }
        }

        return {
          version: remoteVersion,
          catalog: diamonds,
          shardHashes: data.shardHashes,
          upToDate: false,
          source: 'public-endpoint',
        };
      }
    } catch {
      // Fall back transparently to direct Firestore SDK below
    }
  }

  return fetchCloudRegistry({
    ...options,
    includeManagerData: false,
  });
}

/**
 * Direct Firestore cloud registry reader with:
 * - Immediate TTL exit
 * - Immediate cachedVersion exit (0 shard reads when local version is current)
 * - Differential shard reading via dataHash (only changed shards fetched)
 * - Optional admin overlay (pricing_config, suppliers, manager_cost_shards) ONLY when includeManagerData: true
 */
export async function fetchCloudRegistry(
  options?: FetchCloudRegistryOptions
): Promise<CloudLoadResult | null> {
  const cachedVersion = options?.cachedVersion || 0;
  const includeManagerData = Boolean(options?.includeManagerData);
  const lastSync = options?.lastSyncAt ?? getLastSyncAt();
  const ttlMs = options?.ttlMs ?? DEFAULT_SYNC_TTL_MS;

  if (isCloudQuotaInCooldown()) {
    return {
      version: cachedVersion,
      catalog: [],
      quotaExceeded: true,
    };
  }

  // TTL short-circuit for public checks when local cache is fresh
  if (!options?.force && !includeManagerData && cachedVersion > 0 && isSyncFresh(lastSync, ttlMs)) {
    recordSkippedRead('ttl', 1, 'Пропуск чтения Firestore по TTL');
    return {
      version: cachedVersion,
      catalog: [],
      upToDate: true,
      skippedByTtl: true,
      source: 'ttl-cache',
    };
  }

  const metaPath = 'registry_meta/current';
  let metaSnap;
  try {
    metaSnap = await getDoc(doc(db, 'registry_meta', 'current'));
    recordFirestoreRead(1, 'registry_meta/current');
    setLastSyncAt(Date.now());
  } catch (err) {
    if (isFirestoreQuotaError(err)) {
      markCloudQuotaExceeded();
      return {
        version: cachedVersion,
        catalog: [],
        quotaExceeded: true,
      };
    }
    if (isFirestoreOfflineError(err)) {
      return {
        version: cachedVersion,
        catalog: [],
        offline: true,
      };
    }
    handleFirestoreError(err, OperationType.GET, metaPath);
  }

  if (!metaSnap.exists()) {
    return null;
  }

  const meta = metaSnap.data();
  const version = Number(meta.version || 0);
  const totalCount = Number(meta.totalCount ?? 0);
  const shardCount = Number(meta.shardCount || 0);
  const remoteShardHashes: Record<string, string> = {};
  if (meta.shardHashes && typeof meta.shardHashes === 'object') {
    for (const [k, v] of Object.entries(meta.shardHashes as Record<string, unknown>)) {
      if (typeof v === 'string' && v.length > 0) {
        remoteShardHashes[k] = v;
      }
    }
  }
  const hasStableShards = Object.keys(remoteShardHashes).length > 0;

  if (version < 1) {
    return null;
  }

  const canReadAdmin =
    includeManagerData &&
    isVerifiedAdminEmail(auth.currentUser?.email, auth.currentUser?.emailVerified);

  // Immediate exit when local version is already current and admin data is not requested
  if (cachedVersion > 0 && cachedVersion === version && !canReadAdmin) {
    recordSkippedRead(
      'version',
      Math.max(1, shardCount),
      `cachedVersion v${cachedVersion} совпадает с облаком`
    );
    return {
      version,
      catalog: [],
      shardHashes: remoteShardHashes,
      upToDate: true,
      source: 'firestore',
    };
  }

  // Handle intentionally cleared empty cloud registry
  if (shardCount <= 0 && totalCount === 0) {
    return {
      version,
      catalog: [],
      shardHashes: {},
      suppliers: [],
      source: 'firestore',
    };
  }
  if (shardCount <= 0) {
    return null;
  }

  // Load public catalog shards — skip entirely if caller already has this exact version & catalog in memory!
  let diamonds: Diamond[] = [];
  const canReuseCachedCatalog =
    cachedVersion === version &&
    Array.isArray(options?.cachedCatalog) &&
    options!.cachedCatalog.length > 0;

  if (canReuseCachedCatalog) {
    diamonds = options!.cachedCatalog!.map((d) => ({ ...d }));
    recordSkippedRead(
      'version',
      shardCount,
      'Публичные шарды переиспользованы из памяти при загрузке кабинета'
    );
  } else {
    const canDiffShards =
      hasStableShards &&
      options?.cachedShardHashes &&
      Array.isArray(options?.cachedCatalog) &&
      options!.cachedCatalog.length > 0;

    if (canDiffShards) {
      // Differential public shard read: fetch ONLY shards whose dataHash changed!
      const cachedHashes = options!.cachedShardHashes!;
      const prevCatalog = options!.cachedCatalog!;
      const shardSlices: Diamond[][] = new Array(shardCount);
      const changedIndices: number[] = [];

      for (let i = 0; i < shardCount; i++) {
        const expected = remoteShardHashes[String(i)];
        const prevSlice = prevCatalog.slice(i * SHARD_SIZE, (i + 1) * SHARD_SIZE);
        if (
          expected &&
          cachedHashes[String(i)] === expected &&
          prevSlice.length > 0
        ) {
          shardSlices[i] = prevSlice;
        } else {
          changedIndices.push(i);
        }
      }

      const skippedByHash = shardCount - changedIndices.length;
      if (skippedByHash > 0) {
        recordSkippedRead(
          'hash',
          skippedByHash,
          `Пропущено ${skippedByHash} неизменённых шардов (dataHash)`
        );
      }

      if (changedIndices.length > 0) {
        try {
          await runWithConcurrency(
            changedIndices.map((idx) => async () => {
              const snap = await getDoc(doc(db, 'public_catalog_shards', `s${idx}`));
              if (snap.exists()) {
                const items = snap.data().items;
                shardSlices[idx] = Array.isArray(items)
                  ? items.map((it) => fromCompactPublicStone(it as Record<string, unknown>))
                  : [];
              } else {
                shardSlices[idx] = [];
              }
            }),
            CONCURRENT_SHARD_OPS
          );
          recordFirestoreRead(
            changedIndices.length,
            `Дифф-загрузка ${changedIndices.length} изменённых шардов`
          );
        } catch (err) {
          if (isFirestoreQuotaError(err)) {
            markCloudQuotaExceeded();
            return { version: cachedVersion, catalog: [], quotaExceeded: true };
          }
          if (isFirestoreOfflineError(err)) {
            return { version: cachedVersion, catalog: [], offline: true };
          }
          handleFirestoreError(err, OperationType.GET, 'public_catalog_shards');
        }
      }

      for (let i = 0; i < shardSlices.length; i++) {
        if (Array.isArray(shardSlices[i])) {
          for (let j = 0; j < shardSlices[i].length; j++) {
            diamonds.push(shardSlices[i][j]);
          }
        }
      }
    } else if (hasStableShards) {
      // Full read of stable shards s0..s{N-1}
      const shardSlices: Diamond[][] = new Array(shardCount);
      try {
        await runWithConcurrency(
          Array.from({ length: shardCount }, (_, idx) => async () => {
            const snap = await getDoc(doc(db, 'public_catalog_shards', `s${idx}`));
            if (snap.exists()) {
              const items = snap.data().items;
              shardSlices[idx] = Array.isArray(items)
                ? items.map((it) => fromCompactPublicStone(it as Record<string, unknown>))
                : [];
            } else {
              shardSlices[idx] = [];
            }
          }),
          CONCURRENT_SHARD_OPS
        );
        recordFirestoreRead(shardCount, `Загрузка ${shardCount} публичных шардов`);
      } catch (err) {
        if (isFirestoreQuotaError(err)) {
          markCloudQuotaExceeded();
          return { version: cachedVersion, catalog: [], quotaExceeded: true };
        }
        if (isFirestoreOfflineError(err)) {
          return { version: cachedVersion, catalog: [], offline: true };
        }
        handleFirestoreError(err, OperationType.GET, 'public_catalog_shards');
      }

      for (let i = 0; i < shardSlices.length; i++) {
        if (Array.isArray(shardSlices[i])) {
          for (let j = 0; j < shardSlices[i].length; j++) {
            diamonds.push(shardSlices[i][j]);
          }
        }
      }
    } else {
      // Legacy fallback: versioned shards v{version}_s{i} queried by version
      const shardsPath = 'public_catalog_shards';
      let shardSnaps;
      try {
        const q = query(
          collection(db, shardsPath),
          where('version', '==', version)
        );
        shardSnaps = await getDocs(q);
        recordFirestoreRead(
          Math.max(1, shardSnaps.docs.length),
          `Загрузка ${shardSnaps.docs.length} шардов v${version}`
        );
      } catch (err) {
        if (isFirestoreQuotaError(err)) {
          markCloudQuotaExceeded();
          return { version: cachedVersion, catalog: [], quotaExceeded: true };
        }
        if (isFirestoreOfflineError(err)) {
          return { version: cachedVersion, catalog: [], offline: true };
        }
        handleFirestoreError(err, OperationType.LIST, shardsPath);
      }

      const orderedShards = shardSnaps.docs
        .map((s) => s.data())
        .sort((a, b) => Number(a.shardIndex || 0) - Number(b.shardIndex || 0));

      for (let i = 0; i < orderedShards.length; i++) {
        const items = orderedShards[i].items;
        if (!Array.isArray(items)) continue;
        for (let j = 0; j < items.length; j++) {
          diamonds.push(fromCompactPublicStone(items[j] as Record<string, unknown>));
        }
      }
    }
  }

  let suppliers: SupplierFeed[] | undefined;
  let pricingConfig: PricingConfig | undefined;

  if (canReadAdmin) {
    // Load private wholesale costs, pricing config, and supplier feeds ONLY in Manager Cabinet
    try {
      const pricingSnap = await getDoc(doc(db, 'pricing_config', 'default'));
      recordFirestoreRead(1, 'pricing_config/default');
      if (pricingSnap.exists()) {
        const p = pricingSnap.data();
        pricingConfig = {
          mode: p.mode === 'percent' ? 'percent' : 'multiplier',
          value: Number(p.value ?? DEFAULT_PRICING_CONFIG.value),
          roundingStep: ([1, 10, 50, 100].includes(Number(p.roundingStep))
            ? Number(p.roundingStep)
            : 10) as PricingConfig['roundingStep'],
          applyOnImport: Boolean(p.applyOnImport ?? true),
        };
      }
    } catch (err) {
      if (isFirestoreQuotaError(err)) {
        markCloudQuotaExceeded();
        return { version, catalog: diamonds, suppliers, pricingConfig, quotaExceeded: true };
      }
      if (isFirestoreOfflineError(err)) {
        return { version, catalog: diamonds, suppliers, pricingConfig, offline: true };
      }
      handleFirestoreError(err, OperationType.GET, 'pricing_config/default');
    }

    try {
      const supSnaps = await getDocs(collection(db, 'suppliers'));
      recordFirestoreRead(Math.max(1, supSnaps.docs.length), 'suppliers');
      suppliers = supSnaps.docs.map((s) => {
        const d = s.data();
        return {
          id: s.id,
          name: String(d.name || s.id),
          fileName: String(d.fileName || ''),
          stoneCount: Number(d.stoneCount || 0),
          whiteCount: Number(d.whiteCount || 0),
          fancyCount: Number(d.fancyCount || 0),
          active: Boolean(d.active ?? true),
          updatedAt:
            d.updatedAt && typeof d.updatedAt.toDate === 'function'
              ? d.updatedAt.toDate().toISOString()
              : new Date().toISOString(),
        };
      });
    } catch (err) {
      if (isFirestoreQuotaError(err)) {
        markCloudQuotaExceeded();
        return { version, catalog: diamonds, suppliers, pricingConfig, quotaExceeded: true };
      }
      if (isFirestoreOfflineError(err)) {
        return { version, catalog: diamonds, suppliers, pricingConfig, offline: true };
      }
      handleFirestoreError(err, OperationType.LIST, 'suppliers');
    }

    try {
      const costMap = new Map<string, Record<string, unknown>>();
      if (hasStableShards) {
        const costDocs = await runWithConcurrency(
          Array.from({ length: shardCount }, (_, idx) => async () => {
            const snap = await getDoc(doc(db, 'manager_cost_shards', `s${idx}`));
            return snap.exists() ? snap.data() : null;
          }),
          CONCURRENT_SHARD_OPS
        );
        recordFirestoreRead(shardCount, `manager_cost_shards (${shardCount})`);
        for (const docData of costDocs) {
          const entries = docData?.entries;
          if (!Array.isArray(entries)) continue;
          for (const e of entries) {
            const rec = e as Record<string, unknown>;
            const recId = String(rec.i ?? rec.id ?? '');
            if (recId) costMap.set(recId, rec);
          }
        }
      } else {
        const costQ = query(
          collection(db, 'manager_cost_shards'),
          where('version', '==', version)
        );
        const costSnaps = await getDocs(costQ);
        recordFirestoreRead(
          Math.max(1, costSnaps.docs.length),
          `manager_cost_shards v${version}`
        );
        for (const cs of costSnaps.docs) {
          const entries = cs.data().entries;
          if (!Array.isArray(entries)) continue;
          for (const e of entries) {
            const rec = e as Record<string, unknown>;
            const recId = String(rec.i ?? rec.id ?? '');
            if (recId) costMap.set(recId, rec);
          }
        }
      }

      for (let i = 0; i < diamonds.length; i++) {
        const d = diamonds[i];
        const overlay = costMap.get(d.id);
        if (overlay) {
          d.costPriceUsd = Number(overlay.cs || d.priceUsd);
          d.markupMode =
            overlay.mm === 'p' || overlay.mm === 'percent' ? 'percent' : 'multiplier';
          d.markupValue = Number(overlay.mv ?? 1.25);
          if (typeof overlay.sn === 'string') d.supplierName = overlay.sn;
          if (typeof overlay.sf === 'string') d.supplierFileName = overlay.sf;
        }
      }
    } catch (err) {
      if (isFirestoreQuotaError(err)) {
        markCloudQuotaExceeded();
        return { version, catalog: diamonds, suppliers, pricingConfig, quotaExceeded: true };
      }
      if (isFirestoreOfflineError(err)) {
        return { version, catalog: diamonds, suppliers, pricingConfig, offline: true };
      }
      handleFirestoreError(err, OperationType.LIST, 'manager_cost_shards');
    }
  }

  return {
    version,
    catalog: diamonds,
    shardHashes: remoteShardHashes,
    suppliers,
    pricingConfig,
    upToDate: false,
    source: 'firestore',
  };
}

// Backward-compatible export alias
export const loadCloudRegistry = fetchCloudRegistry;

// === Differential Admin Cloud Publish (Only Changed Shards Written + Old Shards Deleted) ===

export async function publishCloudRegistry(params: {
  catalog: Diamond[];
  suppliers: SupplierFeed[];
  pricingConfig: PricingConfig;
  currentVersion: number;
  onProgress?: (progress: RegistrySyncProgress) => void;
}): Promise<{
  version: number;
  cloudSynced: boolean;
  message: string;
  shardHashes?: Record<string, string>;
  writtenShards?: number;
  skippedShards?: number;
  deletedShards?: number;
}> {
  const nextVersion = Math.max(1, params.currentVersion + 1);
  const nowIso = new Date().toISOString();

  const activeSupplierDisabled = new Set(
    params.suppliers.filter((s) => !s.active).map((s) => s.id)
  );
  const publicStones = params.catalog.filter(
    (d) => !d.supplierId || !activeSupplierDisabled.has(d.supplierId)
  );

  const totalShards =
    publicStones.length > 0 ? Math.ceil(publicStones.length / SHARD_SIZE) : 0;

  // Pre-compute compact v2 shard payloads and deterministic dataHash per shard
  const nextPublicShards: {
    index: number;
    items: Record<string, unknown>[];
    dataHash: string;
  }[] = [];
  const nextCostShards: {
    index: number;
    entries: Record<string, unknown>[];
    dataHash: string;
  }[] = [];
  const nextPublicHashes: Record<string, string> = {};
  const nextCostHashes: Record<string, string> = {};

  for (let s = 0; s < totalShards; s++) {
    const slice = publicStones.slice(s * SHARD_SIZE, (s + 1) * SHARD_SIZE);
    const compactPublic = slice.map(toCompactPublicStone);
    const compactCosts = slice.map(toCompactCostEntry);
    const pubHash = computeShardDataHash(compactPublic);
    const costHash = computeShardDataHash(compactCosts);

    nextPublicShards.push({ index: s, items: compactPublic, dataHash: pubHash });
    nextCostShards.push({ index: s, entries: compactCosts, dataHash: costHash });
    nextPublicHashes[String(s)] = pubHash;
    nextCostHashes[String(s)] = costHash;
  }

  // Step 1: Always save locally to IndexedDB immediately so reload NEVER loses data
  const localPrev = await loadLocalRegistry();
  const prevCostHashes = localPrev?.costShardHashes || {};

  params.onProgress?.({ phase: 'local', completed: 0, total: 1 });
  await saveLocalRegistry({
    version: nextVersion,
    catalog: params.catalog,
    suppliers: params.suppliers,
    pricingConfig: params.pricingConfig,
    savedAt: nowIso,
    lastSyncAt: Date.now(),
    publicShardHashes: nextPublicHashes,
    costShardHashes: nextCostHashes,
    clearedExplicitly: params.catalog.length === 0,
  });
  params.onProgress?.({ phase: 'local', completed: 1, total: 1 });

  // Step 2: Publish to Firestore if signed in as verified admin
  const currentUser = auth.currentUser;
  if (
    !currentUser ||
    !isVerifiedAdminEmail(currentUser.email, currentUser.emailVerified)
  ) {
    return {
      version: nextVersion,
      cloudSynced: false,
      message:
        'Сохранено локально в браузере. Чтобы опубликовать каталог в облачную базу для всех клиентов, войдите через Google в верхней панели.',
    };
  }

  const uid = currentUser.uid;
  let writtenPublic = 0;
  let skippedPublic = 0;
  let writtenCosts = 0;
  let skippedCosts = 0;
  let deletedOldDocs = 0;

  try {
    // Read current registry_meta/current to compare shardHashes and detect legacy v{N}_s{i} shards
    let prevPublicHashes: Record<string, string> = {};
    let prevShardCount = 0;
    let hadLegacyVersionedShards = false;

    try {
      const metaSnap = await getDoc(doc(db, 'registry_meta', 'current'));
      recordFirestoreRead(1, 'registry_meta/current (diff check)');
      if (metaSnap.exists()) {
        const metaData = metaSnap.data();
        prevShardCount = Number(metaData.shardCount || 0);
        if (metaData.shardHashes && typeof metaData.shardHashes === 'object') {
          for (const [k, v] of Object.entries(
            metaData.shardHashes as Record<string, unknown>
          )) {
            if (typeof v === 'string' && v.length > 0) {
              prevPublicHashes[k] = v;
            }
          }
        }
        // If previous meta existed with shards but no shardHashes map, old v{N}_s{i} shards need cleanup
        if (prevShardCount > 0 && Object.keys(prevPublicHashes).length === 0) {
          hadLegacyVersionedShards = true;
        }
      }
    } catch (err) {
      if (isFirestoreQuotaError(err)) throw err;
      // Proceed with full write if meta check fails
    }

    const publicTasks: (() => Promise<void>)[] = [];
    const costTasks: (() => Promise<void>)[] = [];

    for (let s = 0; s < totalShards; s++) {
      const pubShard = nextPublicShards[s];
      const costShard = nextCostShards[s];
      const shardId = `s${s}`;

      // Only write public shard when its dataHash changed!
      if (prevPublicHashes[String(s)] === pubShard.dataHash) {
        skippedPublic += 1;
      } else {
        publicTasks.push(async () => {
          const payload = {
            shardIndex: s,
            version: nextVersion,
            count: pubShard.items.length,
            dataHash: pubShard.dataHash,
            items: pubShard.items,
            updatedByUid: uid,
            updatedAt: serverTimestamp(),
          };
          try {
            await setDoc(doc(db, 'public_catalog_shards', shardId), payload);
            writtenPublic += 1;
          } catch (err) {
            if (isFirestoreQuotaError(err)) throw err;
            handleFirestoreError(
              err,
              OperationType.WRITE,
              `public_catalog_shards/${shardId}`
            );
          }
        });
      }

      // Only write cost shard when its dataHash changed (or migrating from legacy v{N}_s{i})!
      if (!hadLegacyVersionedShards && prevCostHashes[String(s)] === costShard.dataHash) {
        skippedCosts += 1;
      } else {
        costTasks.push(async () => {
          const payload = {
            shardIndex: s,
            version: nextVersion,
            count: costShard.entries.length,
            dataHash: costShard.dataHash,
            entries: costShard.entries,
            updatedByUid: uid,
            updatedAt: serverTimestamp(),
          };
          try {
            await setDoc(doc(db, 'manager_cost_shards', shardId), payload);
            writtenCosts += 1;
          } catch (err) {
            if (isFirestoreQuotaError(err)) throw err;
            handleFirestoreError(
              err,
              OperationType.WRITE,
              `manager_cost_shards/${shardId}`
            );
          }
        });
      }
    }

    if (skippedPublic + skippedCosts > 0) {
      recordSkippedWrite(
        skippedPublic + skippedCosts,
        `Пропущено ${skippedPublic} публ. и ${skippedCosts} закуп. шардов (dataHash совпал)`
      );
    }

    if (publicTasks.length > 0) {
      await runWithConcurrency(publicTasks, CONCURRENT_SHARD_OPS, (completed, total) => {
        params.onProgress?.({ phase: 'cloud-public', completed, total });
      });
      recordFirestoreWrite(writtenPublic, `Обновление ${writtenPublic} публ. шардов`);
    }

    if (costTasks.length > 0) {
      await runWithConcurrency(costTasks, CONCURRENT_SHARD_OPS, (completed, total) => {
        params.onProgress?.({ phase: 'cloud-costs', completed, total });
      });
      recordFirestoreWrite(writtenCosts, `Обновление ${writtenCosts} закуп. шардов`);
    }

    // Write pricing config & supplier feed docs
    params.onProgress?.({
      phase: 'cloud-meta',
      completed: 0,
      total: params.suppliers.length + 2,
    });

    try {
      await setDoc(doc(db, 'pricing_config', 'default'), {
        mode: params.pricingConfig.mode,
        value: params.pricingConfig.value,
        roundingStep: params.pricingConfig.roundingStep,
        applyOnImport: params.pricingConfig.applyOnImport,
        updatedByUid: uid,
        updatedAt: serverTimestamp(),
      });
      recordFirestoreWrite(1, 'pricing_config/default');
    } catch (err) {
      if (isFirestoreQuotaError(err)) throw err;
      handleFirestoreError(err, OperationType.WRITE, 'pricing_config/default');
    }

    const activeSupplierIds = new Set<string>();
    for (let i = 0; i < params.suppliers.length; i++) {
      const sup = params.suppliers[i];
      const supId = sanitizeId(sup.id);
      activeSupplierIds.add(supId);
      try {
        await setDoc(doc(db, 'suppliers', supId), {
          name: sup.name.slice(0, 120),
          fileName: (sup.fileName || sup.name).slice(0, 256),
          stoneCount: sup.stoneCount,
          whiteCount: sup.whiteCount,
          fancyCount: sup.fancyCount,
          active: sup.active,
          updatedByUid: uid,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        if (isFirestoreQuotaError(err)) throw err;
        handleFirestoreError(err, OperationType.WRITE, `suppliers/${supId}`);
      }
      params.onProgress?.({
        phase: 'cloud-meta',
        completed: i + 1,
        total: params.suppliers.length + 2,
      });
    }
    if (params.suppliers.length > 0) {
      recordFirestoreWrite(params.suppliers.length, 'suppliers');
    }

    // Remove stale supplier documents that were cleared or deleted
    try {
      const existingSupSnaps = await getDocs(collection(db, 'suppliers'));
      recordFirestoreRead(Math.max(1, existingSupSnaps.docs.length), 'suppliers cleanup');
      let supDeleted = 0;
      for (const snap of existingSupSnaps.docs) {
        if (!activeSupplierIds.has(snap.id)) {
          await deleteDoc(doc(db, 'suppliers', snap.id));
          supDeleted += 1;
        }
      }
      if (supDeleted > 0) {
        recordFirestoreDelete(supDeleted, 'Удаление старых поставщиков');
      }
    } catch (err) {
      if (!isFirestoreQuotaError(err)) {
        console.warn('Stale supplier cleanup skipped:', err);
      }
    }

    let fancyCount = 0;
    for (let i = 0; i < publicStones.length; i++) {
      if (publicStones[i].directory === 'fancy' || publicStones[i].isFancyColor) {
        fancyCount++;
      }
    }

    // Atomically flip the public manifest version with shardHashes BEFORE deleting old shards
    try {
      await setDoc(doc(db, 'registry_meta', 'current'), {
        version: nextVersion,
        totalCount: publicStones.length,
        whiteCount: publicStones.length - fancyCount,
        fancyCount,
        shardCount: totalShards,
        shardHashes: nextPublicHashes,
        supplierCount: params.suppliers.filter((s) => s.active).length,
        updatedByUid: uid,
        updatedAt: serverTimestamp(),
      });
      recordFirestoreWrite(1, `registry_meta/current (v${nextVersion})`);
      setLastSyncAt(Date.now());
    } catch (err) {
      if (isFirestoreQuotaError(err)) throw err;
      handleFirestoreError(err, OperationType.WRITE, 'registry_meta/current');
    }

    // Step 3: Delete old versions of shards (surplus s{i} and legacy v{N}_s{i} docs)
    const activeShardIds = new Set<string>();
    for (let s = 0; s < totalShards; s++) {
      activeShardIds.add(`s${s}`);
    }

    const deleteTasks: (() => Promise<void>)[] = [];

    // 3a. Surplus stable shards when catalog shrinks
    if (prevShardCount > totalShards) {
      for (let s = totalShards; s < prevShardCount; s++) {
        deleteTasks.push(async () => {
          await deleteDoc(doc(db, 'public_catalog_shards', `s${s}`));
          deletedOldDocs += 1;
        });
        deleteTasks.push(async () => {
          await deleteDoc(doc(db, 'manager_cost_shards', `s${s}`));
          deletedOldDocs += 1;
        });
      }
    }

    // 3b. Legacy v{N}_s{i} shards cleanup (one-time migration cleanup or after versioned writes)
    if (hadLegacyVersionedShards || totalShards === 0) {
      try {
        const [legacyPubSnaps, legacyCostSnaps] = await Promise.all([
          getDocs(collection(db, 'public_catalog_shards')),
          getDocs(collection(db, 'manager_cost_shards')),
        ]);
        recordFirestoreRead(
          legacyPubSnaps.docs.length + legacyCostSnaps.docs.length,
          'Поиск устаревших версий шардов'
        );

        for (const snap of legacyPubSnaps.docs) {
          if (!activeShardIds.has(snap.id)) {
            deleteTasks.push(async () => {
              await deleteDoc(doc(db, 'public_catalog_shards', snap.id));
              deletedOldDocs += 1;
            });
          }
        }
        for (const snap of legacyCostSnaps.docs) {
          if (!activeShardIds.has(snap.id)) {
            deleteTasks.push(async () => {
              await deleteDoc(doc(db, 'manager_cost_shards', snap.id));
              deletedOldDocs += 1;
            });
          }
        }
      } catch (err) {
        if (!isFirestoreQuotaError(err)) {
          console.warn('Legacy shard cleanup scan skipped:', err);
        }
      }
    }

    if (deleteTasks.length > 0) {
      await runWithConcurrency(deleteTasks, CONCURRENT_SHARD_OPS, (completed, total) => {
        params.onProgress?.({ phase: 'cloud-cleanup', completed, total });
      });
      recordFirestoreDelete(deletedOldDocs, `Удалено ${deletedOldDocs} старых шардов`);
    }

    // Best-effort notify server public cache to re-check registry_meta/current immediately
    if (typeof fetch !== 'undefined') {
      void fetch('/api/public/catalog/invalidate', { method: 'POST' }).catch(() => {});
    }
  } catch (err) {
    if (isFirestoreQuotaError(err)) {
      markCloudQuotaExceeded();
      params.onProgress?.({ phase: 'done', completed: 1, total: 1 });
      return {
        version: nextVersion,
        cloudSynced: false,
        message:
          'Исчерпан дневной бесплатный лимит операций Firestore. Каталог сохранён локально в браузере; облачная синхронизация возобновится завтра после сброса квоты или после расширения тарифа базы.',
      };
    }
    throw err;
  }

  params.onProgress?.({ phase: 'done', completed: 1, total: 1 });

  const cleanupNote =
    deletedOldDocs > 0 ? `, удалено устаревших шардов: ${deletedOldDocs}` : '';
  const diffNote =
    skippedPublic > 0
      ? `обновлено ${writtenPublic} из ${totalShards} блоков (${skippedPublic} без изменений${cleanupNote})`
      : `${totalShards} блоков${cleanupNote}`;

  return {
    version: nextVersion,
    cloudSynced: true,
    shardHashes: nextPublicHashes,
    writtenShards: writtenPublic,
    skippedShards: skippedPublic,
    deletedShards: deletedOldDocs,
    message:
      publicStones.length === 0
        ? `Облачный каталог очищен (0 камней${cleanupNote}).`
        : `Опубликовано в облачную базу (${publicStones.length.toLocaleString('ru-RU')} камней · ${diffNote}).`,
  };
}

// === Cloud Orders Persistence (PII Isolated by userId) ===

export async function saveCloudOrder(order: OrderRequest): Promise<boolean> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) {
    return false;
  }

  const orderId = sanitizeId(order.id);
  const payload = {
    userId: currentUser.uid,
    requestNumber: order.requestNumber.slice(0, 64),
    status: 'new',
    customerName: order.customerName.slice(0, 120),
    contactPhone: order.contactPhone.slice(0, 40),
    contactEmail: order.contactEmail.slice(0, 160),
    preferredChannel: order.preferredChannel,
    comment: (order.comment || '').slice(0, 1000),
    items: order.items.slice(0, 100).map((it) => ({
      id: it.id.slice(0, 120),
      sku: it.sku.slice(0, 64),
      shape: it.shape,
      carat: it.carat,
      color: it.color.slice(0, 64),
      clarity: it.clarity.slice(0, 24),
      certLab: it.certLab.slice(0, 24),
      certNumber: it.certNumber.slice(0, 64),
      priceUsd: it.priceUsd,
      currency: it.currency,
    })),
    totalCarat: order.totalCarat,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'orders', orderId), payload);
    recordFirestoreWrite(1, `orders/${orderId}`);
    return true;
  } catch (err) {
    if (isFirestoreQuotaError(err)) {
      markCloudQuotaExceeded();
      return false;
    }
    handleFirestoreError(err, OperationType.CREATE, `orders/${orderId}`);
  }
}
