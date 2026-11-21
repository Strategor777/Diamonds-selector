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
  Diamond,
  DiamondShape,
  OrderRequest,
  PriceCurrency,
  PricingConfig,
  SupplierFeed,
} from '../types/diamond';
import {
  OperationType,
  auth,
  db,
  handleFirestoreError,
  isVerifiedAdminEmail,
} from './firebase';

const IDB_NAME = 'diamonds_selector_registry_v2';
const IDB_STORE = 'registry_kv';
const IDB_VERSION = 1;

const SHARD_SIZE = 400; // <= 400 compact stones per Firestore doc (< 350 KB, well under 1 MB limit)
const CONCURRENT_SHARD_OPS = 6;

export interface LocalRegistrySnapshot {
  version: number;
  catalog: Diamond[];
  suppliers: SupplierFeed[];
  pricingConfig: PricingConfig;
  savedAt: string;
  clearedExplicitly?: boolean;
}

export interface RegistrySyncProgress {
  phase: 'local' | 'cloud-public' | 'cloud-costs' | 'cloud-meta' | 'done';
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

// === Compact Serialization for Firestore Shards (Native Maps, Zero Wholesale Cost Leaks) ===

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return cleaned.length > 0 ? cleaned : `id_${Date.now()}`;
}

function toCompactPublicStone(d: Diamond): Record<string, unknown> {
  const item: Record<string, unknown> = {
    id: d.id.slice(0, 120),
    sku: (d.sku || '').slice(0, 80),
    sh: d.shape,
    ct: d.carat,
    cl: (d.color || 'G').slice(0, 64),
    cr: (d.clarity || 'VS1').slice(0, 24),
    cu: d.cut,
    po: d.polish,
    sy: d.symmetry,
    fl: d.fluorescence,
    dp: d.depthPercent,
    tb: d.tablePercent,
    ln: d.lengthMm,
    wd: d.widthMm,
    dm: d.depthMm,
    lw: d.lwRatio,
    lb: (d.certLab || 'GIA').slice(0, 24),
    cn: (d.certNumber || '').slice(0, 64),
    pr: d.priceUsd,
    cy: d.currency || 'USD',
    dr: d.directory || (d.isFancyColor ? 'fancy' : 'white'),
  };

  if (d.stoneType && d.stoneType !== 'Бриллиант') item.st = d.stoneType.slice(0, 64);
  if (d.growthType && d.growthType !== 'Natural') item.gt = d.growthType;
  if (d.colorFamily) item.cf = d.colorFamily.slice(0, 48);
  if (d.fancyIntensity) item.fi = d.fancyIntensity.slice(0, 32);
  if (d.fancyOvertone) item.fo = d.fancyOvertone.slice(0, 48);
  if (d.certUrl && d.certUrl.startsWith('http')) item.cu2 = d.certUrl.slice(0, 400);
  if (d.imageUrl && d.imageUrl.startsWith('http')) item.im = d.imageUrl.slice(0, 400);
  if (d.videoUrl && d.videoUrl.startsWith('http')) item.vd = d.videoUrl.slice(0, 400);
  if (d.supplierId) item.sp = sanitizeId(d.supplierId).slice(0, 64);
  if (d.certColorVerified) item.cv = 1;
  if (d.useStudioPhoto) item.us = 1;

  return item;
}

function fromCompactPublicStone(raw: Record<string, unknown>): Diamond {
  const shape = (raw.sh as DiamondShape) || 'Round';
  const color = String(raw.cl || 'G');
  const colorFamily = raw.cf ? String(raw.cf) : 'Бесцветный (D–J)';
  const directory = raw.dr === 'fancy' ? 'fancy' : 'white';
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

  return {
    id: String(raw.id || ''),
    sku: String(raw.sku || ''),
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
    cut: (raw.cu as Diamond['cut']) || 'Excellent',
    polish: (raw.po as Diamond['polish']) || 'Excellent',
    symmetry: (raw.sy as Diamond['symmetry']) || 'Excellent',
    fluorescence: (raw.fl as Diamond['fluorescence']) || 'None',
    depthPercent: Number(raw.dp || 61.8),
    tablePercent: Number(raw.tb || 57.5),
    crownAngle: 34.5,
    pavilionAngle: 40.8,
    girdle: 'Medium',
    culet: 'None',
    lengthMm: Number(raw.ln || 6.4),
    widthMm: Number(raw.wd || 6.4),
    depthMm: Number(raw.dm || 3.95),
    lwRatio: Number(raw.lw || 1.0),
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
    certVerifiedColor: raw.cv === 1 ? color : undefined,
    useStudioPhoto: raw.us === 1 ? true : undefined,
  };
}

function toCompactCostEntry(d: Diamond): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    id: d.id.slice(0, 120),
    cs: Math.max(1, Math.round(d.costPriceUsd || d.priceUsd || 1)),
    mm: d.markupMode || 'multiplier',
    mv: typeof d.markupValue === 'number' ? d.markupValue : 1.25,
  };
  if (d.supplierId) entry.sp = sanitizeId(d.supplierId).slice(0, 64);
  if (d.supplierName) entry.sn = d.supplierName.slice(0, 120);
  if (d.supplierFileName) entry.sf = d.supplierFileName.slice(0, 180);
  return entry;
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
  suppliers?: SupplierFeed[];
  pricingConfig?: PricingConfig;
}

export async function loadCloudRegistry(
  options?: {
    includeManagerData?: boolean;
    cachedVersion?: number;
  }
): Promise<CloudLoadResult | null> {
  const metaPath = 'registry_meta/current';
  let metaSnap;
  try {
    metaSnap = await getDoc(doc(db, 'registry_meta', 'current'));
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, metaPath);
  }

  if (!metaSnap.exists()) {
    return null;
  }

  const meta = metaSnap.data();
  const version = Number(meta.version || 0);
  const totalCount = Number(meta.totalCount ?? 0);
  const shardCount = Number(meta.shardCount || 0);
  if (version < 1) {
    return null;
  }

  const canReadAdmin =
    Boolean(options?.includeManagerData) &&
    isVerifiedAdminEmail(auth.currentUser?.email, auth.currentUser?.emailVerified);

  // If caller already has this exact version cached locally and doesn't need fresh admin overlays
  if (options?.cachedVersion === version && !canReadAdmin) {
    return null;
  }

  // Handle intentionally cleared empty cloud registry
  if (shardCount <= 0 && totalCount === 0) {
    return {
      version,
      catalog: [],
      suppliers: [],
    };
  }
  if (shardCount <= 0) {
    return null;
  }

  // Load public catalog shards for this version
  const shardsPath = 'public_catalog_shards';
  let shardSnaps;
  try {
    const q = query(
      collection(db, shardsPath),
      where('version', '==', version)
    );
    shardSnaps = await getDocs(q);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, shardsPath);
  }

  const orderedShards = shardSnaps.docs
    .map((s) => s.data())
    .sort((a, b) => Number(a.shardIndex || 0) - Number(b.shardIndex || 0));

  const diamonds: Diamond[] = [];
  for (let i = 0; i < orderedShards.length; i++) {
    const items = orderedShards[i].items;
    if (!Array.isArray(items)) continue;
    for (let j = 0; j < items.length; j++) {
      diamonds.push(fromCompactPublicStone(items[j] as Record<string, unknown>));
    }
  }

  let suppliers: SupplierFeed[] | undefined;
  let pricingConfig: PricingConfig | undefined;

  if (canReadAdmin) {
    // Load private wholesale costs, pricing config, and supplier feeds
    try {
      const pricingSnap = await getDoc(doc(db, 'pricing_config', 'default'));
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
      handleFirestoreError(err, OperationType.GET, 'pricing_config/default');
    }

    try {
      const supSnaps = await getDocs(collection(db, 'suppliers'));
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
      handleFirestoreError(err, OperationType.LIST, 'suppliers');
    }

    try {
      const costQ = query(
        collection(db, 'manager_cost_shards'),
        where('version', '==', version)
      );
      const costSnaps = await getDocs(costQ);
      const costMap = new Map<string, Record<string, unknown>>();
      for (const cs of costSnaps.docs) {
        const entries = cs.data().entries;
        if (!Array.isArray(entries)) continue;
        for (const e of entries) {
          const rec = e as Record<string, unknown>;
          if (typeof rec.id === 'string') {
            costMap.set(rec.id, rec);
          }
        }
      }

      for (let i = 0; i < diamonds.length; i++) {
        const d = diamonds[i];
        const overlay = costMap.get(d.id);
        if (overlay) {
          d.costPriceUsd = Number(overlay.cs || d.priceUsd);
          d.markupMode = overlay.mm === 'percent' ? 'percent' : 'multiplier';
          d.markupValue = Number(overlay.mv ?? 1.25);
          if (typeof overlay.sn === 'string') d.supplierName = overlay.sn;
          if (typeof overlay.sf === 'string') d.supplierFileName = overlay.sf;
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'manager_cost_shards');
    }
  }

  return {
    version,
    catalog: diamonds,
    suppliers,
    pricingConfig,
  };
}

// === Admin Cloud Registry Publish (Supports 60,000 - 100,000+ stones via sharding) ===

export async function publishCloudRegistry(params: {
  catalog: Diamond[];
  suppliers: SupplierFeed[];
  pricingConfig: PricingConfig;
  currentVersion: number;
  onProgress?: (progress: RegistrySyncProgress) => void;
}): Promise<{ version: number; cloudSynced: boolean; message: string }> {
  const nextVersion = Math.max(1, params.currentVersion + 1);
  const nowIso = new Date().toISOString();

  // Step 1: Always save locally to IndexedDB immediately so reload NEVER loses data
  params.onProgress?.({ phase: 'local', completed: 0, total: 1 });
  await saveLocalRegistry({
    version: nextVersion,
    catalog: params.catalog,
    suppliers: params.suppliers,
    pricingConfig: params.pricingConfig,
    savedAt: nowIso,
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
  const activeSupplierDisabled = new Set(
    params.suppliers.filter((s) => !s.active).map((s) => s.id)
  );
  const publicStones = params.catalog.filter(
    (d) => !d.supplierId || !activeSupplierDisabled.has(d.supplierId)
  );

  const totalShards =
    publicStones.length > 0 ? Math.ceil(publicStones.length / SHARD_SIZE) : 0;
  const publicTasks: (() => Promise<void>)[] = [];
  const costTasks: (() => Promise<void>)[] = [];

  for (let s = 0; s < totalShards; s++) {
    const slice = publicStones.slice(s * SHARD_SIZE, (s + 1) * SHARD_SIZE);
    const shardId = `v${nextVersion}_s${s}`;

    publicTasks.push(async () => {
      const payload = {
        shardIndex: s,
        version: nextVersion,
        count: slice.length,
        items: slice.map(toCompactPublicStone),
        updatedByUid: uid,
        updatedAt: serverTimestamp(),
      };
      try {
        await setDoc(doc(db, 'public_catalog_shards', shardId), payload);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `public_catalog_shards/${shardId}`);
      }
    });

    costTasks.push(async () => {
      const payload = {
        shardIndex: s,
        version: nextVersion,
        count: slice.length,
        entries: slice.map(toCompactCostEntry),
        updatedByUid: uid,
        updatedAt: serverTimestamp(),
      };
      try {
        await setDoc(doc(db, 'manager_cost_shards', shardId), payload);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `manager_cost_shards/${shardId}`);
      }
    });
  }

  // Write public storefront shards (skip when cleared to 0 stones)
  if (publicTasks.length > 0) {
    await runWithConcurrency(publicTasks, CONCURRENT_SHARD_OPS, (completed, total) => {
      params.onProgress?.({ phase: 'cloud-public', completed, total });
    });
  }

  // Write private manager wholesale cost shards
  if (costTasks.length > 0) {
    await runWithConcurrency(costTasks, CONCURRENT_SHARD_OPS, (completed, total) => {
      params.onProgress?.({ phase: 'cloud-costs', completed, total });
    });
  }

  // Write pricing config & supplier feed docs
  params.onProgress?.({ phase: 'cloud-meta', completed: 0, total: params.suppliers.length + 2 });

  try {
    await setDoc(doc(db, 'pricing_config', 'default'), {
      mode: params.pricingConfig.mode,
      value: params.pricingConfig.value,
      roundingStep: params.pricingConfig.roundingStep,
      applyOnImport: params.pricingConfig.applyOnImport,
      updatedByUid: uid,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
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
      handleFirestoreError(err, OperationType.WRITE, `suppliers/${supId}`);
    }
    params.onProgress?.({
      phase: 'cloud-meta',
      completed: i + 1,
      total: params.suppliers.length + 2,
    });
  }

  // Remove stale supplier documents that were cleared or deleted
  try {
    const existingSupSnaps = await getDocs(collection(db, 'suppliers'));
    for (const snap of existingSupSnaps.docs) {
      if (!activeSupplierIds.has(snap.id)) {
        await deleteDoc(doc(db, 'suppliers', snap.id));
      }
    }
  } catch (err) {
    console.warn('Stale supplier cleanup skipped:', err);
  }

  let fancyCount = 0;
  for (let i = 0; i < publicStones.length; i++) {
    if (publicStones[i].directory === 'fancy' || publicStones[i].isFancyColor) {
      fancyCount++;
    }
  }

  // Atomically flip the public manifest version last
  try {
    await setDoc(doc(db, 'registry_meta', 'current'), {
      version: nextVersion,
      totalCount: publicStones.length,
      whiteCount: publicStones.length - fancyCount,
      fancyCount,
      shardCount: totalShards,
      supplierCount: params.suppliers.filter((s) => s.active).length,
      updatedByUid: uid,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'registry_meta/current');
  }

  params.onProgress?.({ phase: 'done', completed: 1, total: 1 });

  return {
    version: nextVersion,
    cloudSynced: true,
    message:
      publicStones.length === 0
        ? 'Облачный каталог очищен (0 камней).'
        : `Опубликовано в облачную базу (${publicStones.length.toLocaleString('ru-RU')} камней, ${totalShards} блоков).`,
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
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `orders/${orderId}`);
  }
}
