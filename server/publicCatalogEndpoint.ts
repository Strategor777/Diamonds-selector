import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface FirebaseAppletConfig {
  projectId: string;
  apiKey: string;
  firestoreDatabaseId?: string;
}

interface FirestoreRestValue {
  nullValue?: null;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  timestampValue?: string;
  stringValue?: string;
  arrayValue?: { values?: FirestoreRestValue[] };
  mapValue?: { fields?: Record<string, FirestoreRestValue> };
}

interface FirestoreRestDocument {
  name?: string;
  fields?: Record<string, FirestoreRestValue>;
}

export interface PublicCatalogMetaPayload {
  version: number;
  totalCount: number;
  whiteCount: number;
  fancyCount: number;
  shardCount: number;
  shardHashes: Record<string, string>;
  hasStableShards: boolean;
  cachedAt: string;
}

export interface PublicCatalogShardPayload {
  shardIndex: number;
  version: number;
  count: number;
  dataHash?: string;
  items: Record<string, unknown>[];
}

export interface PublicCatalogResponse {
  upToDate: boolean;
  version: number;
  totalCount: number;
  whiteCount: number;
  fancyCount: number;
  shardCount: number;
  shardHashes: Record<string, string>;
  incremental?: boolean;
  shards?: PublicCatalogShardPayload[];
  cachedAt: string;
  source: 'server-memory-cache' | 'firestore-rest';
}

const META_TTL_MS = 60_000; // Re-check registry_meta/current at most once per minute across ALL clients
const FETCH_TIMEOUT_MS = 10_000;
const CONCURRENT_SHARD_FETCHES = 8;

let cachedConfig: FirebaseAppletConfig | null = null;
let cachedMeta: PublicCatalogMetaPayload | null = null;
let lastMetaCheckAt = 0;
let cachedShardsByIndex = new Map<number, PublicCatalogShardPayload>();
let cachedShardsVersion = 0;
let inFlightRefresh: Promise<PublicCatalogMetaPayload | null> | null = null;

function loadFirebaseConfig(): FirebaseAppletConfig | null {
  if (cachedConfig) return cachedConfig;
  const configPath = path.resolve(__dirname, '..', 'firebase-applet-config.json');
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw) as FirebaseAppletConfig;
    if (!parsed.projectId || !parsed.apiKey) return null;
    cachedConfig = parsed;
    return parsed;
  } catch {
    return null;
  }
}

function decodeFirestoreValue(val: FirestoreRestValue | undefined): unknown {
  if (!val) return undefined;
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('timestampValue' in val) return val.timestampValue;
  if ('nullValue' in val) return null;
  if (val.arrayValue) {
    const arr = val.arrayValue.values || [];
    return arr.map(decodeFirestoreValue);
  }
  if (val.mapValue) {
    const fields = val.mapValue.fields || {};
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      obj[k] = decodeFirestoreValue(v);
    }
    return obj;
  }
  return undefined;
}

function decodeDocumentFields(
  doc: FirestoreRestDocument | null
): Record<string, unknown> | null {
  if (!doc || !doc.fields) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc.fields)) {
    out[k] = decodeFirestoreValue(v);
  }
  return out;
}

async function fetchPublicFirestoreDoc(
  docPath: string
): Promise<Record<string, unknown> | null> {
  const cfg = loadFirebaseConfig();
  if (!cfg) return null;
  const dbId = cfg.firestoreDatabaseId || '(default)';
  const safePath = docPath
    .split('/')
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    cfg.projectId
  )}/databases/${encodeURIComponent(dbId)}/documents/${safePath}?key=${encodeURIComponent(
    cfg.apiKey
  )}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Firestore REST HTTP ${res.status} for ${docPath}`);
    }
    const json = (await res.json()) as FirestoreRestDocument;
    return decodeDocumentFields(json);
  } finally {
    clearTimeout(timer);
  }
}

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < tasks.length) {
      const idx = cursor++;
      results[idx] = await tasks[idx]();
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, Math.max(1, tasks.length)) }, () => worker())
  );
  return results;
}

async function refreshMetaAndChangedShards(): Promise<PublicCatalogMetaPayload | null> {
  if (inFlightRefresh) {
    return inFlightRefresh;
  }

  inFlightRefresh = (async () => {
    const metaRaw = await fetchPublicFirestoreDoc('registry_meta/current');
    if (!metaRaw) {
      lastMetaCheckAt = Date.now();
      return cachedMeta;
    }

    const version = Number(metaRaw.version || 0);
    const totalCount = Number(metaRaw.totalCount ?? 0);
    const whiteCount = Number(metaRaw.whiteCount ?? 0);
    const fancyCount = Number(metaRaw.fancyCount ?? 0);
    const shardCount = Number(metaRaw.shardCount ?? 0);
    const rawHashes =
      metaRaw.shardHashes && typeof metaRaw.shardHashes === 'object'
        ? (metaRaw.shardHashes as Record<string, unknown>)
        : {};
    const shardHashes: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawHashes)) {
      if (typeof v === 'string' && v.length > 0) {
        shardHashes[k] = v;
      }
    }
    const hasStableShards = Object.keys(shardHashes).length > 0;

    const nextMeta: PublicCatalogMetaPayload = {
      version,
      totalCount,
      whiteCount,
      fancyCount,
      shardCount,
      shardHashes,
      hasStableShards,
      cachedAt: new Date().toISOString(),
    };

    if (shardCount <= 0) {
      cachedShardsByIndex.clear();
      cachedShardsVersion = version;
      cachedMeta = nextMeta;
      lastMetaCheckAt = Date.now();
      return nextMeta;
    }

    // Determine which shard indices must be fetched from Firestore
    const indicesToFetch: number[] = [];
    for (let i = 0; i < shardCount; i++) {
      const existing = cachedShardsByIndex.get(i);
      if (hasStableShards) {
        const expectedHash = shardHashes[String(i)];
        if (!existing || !expectedHash || existing.dataHash !== expectedHash) {
          indicesToFetch.push(i);
        }
      } else {
        // Legacy versioned shards (v{version}_s{i}): re-fetch only when version changes or shard missing
        if (!existing || cachedShardsVersion !== version) {
          indicesToFetch.push(i);
        }
      }
    }

    // Drop surplus shards if catalog shrank
    for (const key of Array.from(cachedShardsByIndex.keys())) {
      if (key >= shardCount) {
        cachedShardsByIndex.delete(key);
      }
    }

    if (indicesToFetch.length > 0) {
      const tasks = indicesToFetch.map((shardIndex) => async () => {
        const primaryId = hasStableShards
          ? `s${shardIndex}`
          : `v${version}_s${shardIndex}`;
        let rawShard = await fetchPublicFirestoreDoc(
          `public_catalog_shards/${primaryId}`
        );

        // Graceful fallback during migration between stable s{i} and legacy v{N}_s{i}
        if (!rawShard) {
          const fallbackId = hasStableShards
            ? `v${version}_s${shardIndex}`
            : `s${shardIndex}`;
          rawShard = await fetchPublicFirestoreDoc(
            `public_catalog_shards/${fallbackId}`
          );
        }

        if (rawShard && Array.isArray(rawShard.items)) {
          cachedShardsByIndex.set(shardIndex, {
            shardIndex,
            version: Number(rawShard.version || version),
            count: Number(rawShard.count ?? rawShard.items.length),
            dataHash:
              typeof rawShard.dataHash === 'string'
                ? rawShard.dataHash
                : shardHashes[String(shardIndex)],
            items: rawShard.items as Record<string, unknown>[],
          });
        }
      });

      await runWithConcurrency(tasks, CONCURRENT_SHARD_FETCHES);
    }

    cachedShardsVersion = version;
    cachedMeta = nextMeta;
    lastMetaCheckAt = Date.now();
    return nextMeta;
  })();

  try {
    return await inFlightRefresh;
  } finally {
    inFlightRefresh = null;
  }
}

async function ensureFreshCache(): Promise<{
  meta: PublicCatalogMetaPayload | null;
  fromMemoryCache: boolean;
}> {
  const now = Date.now();
  if (
    cachedMeta &&
    now - lastMetaCheckAt < META_TTL_MS &&
    (cachedMeta.shardCount === 0 || cachedShardsByIndex.size >= cachedMeta.shardCount)
  ) {
    return { meta: cachedMeta, fromMemoryCache: true };
  }
  const meta = await refreshMetaAndChangedShards();
  return { meta, fromMemoryCache: false };
}

export async function getPublicCatalogMeta(): Promise<PublicCatalogMetaPayload | null> {
  const { meta } = await ensureFreshCache();
  return meta;
}

export async function getPublicCatalogPayload(options?: {
  cachedVersion?: number;
  indices?: number[];
}): Promise<PublicCatalogResponse | null> {
  const { meta, fromMemoryCache } = await ensureFreshCache();
  if (!meta) return null;

  const source: PublicCatalogResponse['source'] = fromMemoryCache
    ? 'server-memory-cache'
    : 'firestore-rest';

  // Fast early exit when client already holds the exact current version
  if (
    typeof options?.cachedVersion === 'number' &&
    options.cachedVersion > 0 &&
    options.cachedVersion === meta.version
  ) {
    return {
      upToDate: true,
      version: meta.version,
      totalCount: meta.totalCount,
      whiteCount: meta.whiteCount,
      fancyCount: meta.fancyCount,
      shardCount: meta.shardCount,
      shardHashes: meta.shardHashes,
      cachedAt: meta.cachedAt,
      source,
    };
  }

  // Optional incremental subset of changed shards requested by client
  if (Array.isArray(options?.indices) && options.indices.length > 0) {
    const requestedShards: PublicCatalogShardPayload[] = [];
    for (const idx of options.indices) {
      const shard = cachedShardsByIndex.get(idx);
      if (shard) {
        requestedShards.push(shard);
      }
    }
    return {
      upToDate: false,
      version: meta.version,
      totalCount: meta.totalCount,
      whiteCount: meta.whiteCount,
      fancyCount: meta.fancyCount,
      shardCount: meta.shardCount,
      shardHashes: meta.shardHashes,
      incremental: true,
      shards: requestedShards,
      cachedAt: meta.cachedAt,
      source,
    };
  }

  const orderedShards: PublicCatalogShardPayload[] = [];
  for (let i = 0; i < meta.shardCount; i++) {
    const shard = cachedShardsByIndex.get(i);
    if (shard) {
      orderedShards.push(shard);
    }
  }

  return {
    upToDate: false,
    version: meta.version,
    totalCount: meta.totalCount,
    whiteCount: meta.whiteCount,
    fancyCount: meta.fancyCount,
    shardCount: meta.shardCount,
    shardHashes: meta.shardHashes,
    shards: orderedShards,
    cachedAt: meta.cachedAt,
    source,
  };
}

export function invalidatePublicCatalogCache(): void {
  // Reset only the meta TTL timestamp; keep shard map intact so the next refresh only fetches changed hashes!
  lastMetaCheckAt = 0;
}
