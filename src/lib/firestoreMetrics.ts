// Daily Firestore operation counter & Spark quota alert monitor (client-local, shown only in Manager Cabinet)

const STORAGE_KEY = 'diamonds_selector_fs_metrics_v1';

export const SPARK_DAILY_READ_LIMIT = 50_000;
export const SPARK_DAILY_WRITE_LIMIT = 20_000;
export const SPARK_DAILY_DELETE_LIMIT = 20_000;

export interface FirestoreMetricEvent {
  at: string;
  op: 'read' | 'write' | 'delete' | 'skip-ttl' | 'skip-version' | 'skip-hash' | 'server-cache';
  count: number;
  label: string;
}

export interface FirestoreDailyMetrics {
  dateKey: string;
  reads: number;
  writes: number;
  deletes: number;
  skippedReadsByTtl: number;
  skippedReadsByVersion: number;
  skippedReadsByHash: number;
  skippedWritesByHash: number;
  serverCacheHits: number;
  lastSyncAt: number | null;
  lastPublishAt: number | null;
  recentEvents: FirestoreMetricEvent[];
}

export interface FirestoreQuotaAlert {
  level: 'warning' | 'critical';
  metric: 'reads' | 'writes' | 'deletes';
  percent: number;
  message: string;
}

function getTodayUtcKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function createEmptyDay(dateKey = getTodayUtcKey()): FirestoreDailyMetrics {
  return {
    dateKey,
    reads: 0,
    writes: 0,
    deletes: 0,
    skippedReadsByTtl: 0,
    skippedReadsByVersion: 0,
    skippedReadsByHash: 0,
    skippedWritesByHash: 0,
    serverCacheHits: 0,
    lastSyncAt: null,
    lastPublishAt: null,
    recentEvents: [],
  };
}

let memoryState: FirestoreDailyMetrics | null = null;
const listeners = new Set<() => void>();

function loadState(): FirestoreDailyMetrics {
  const today = getTodayUtcKey();
  if (memoryState && memoryState.dateKey === today) {
    return memoryState;
  }

  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<FirestoreDailyMetrics>;
        if (parsed && parsed.dateKey === today) {
          memoryState = {
            ...createEmptyDay(today),
            ...parsed,
            recentEvents: Array.isArray(parsed.recentEvents)
              ? parsed.recentEvents.slice(0, 12)
              : [],
          };
          return memoryState;
        }
      }
    } catch {
      // ignore storage errors
    }
  }

  memoryState = createEmptyDay(today);
  return memoryState;
}

function persistState(next: FirestoreDailyMetrics) {
  memoryState = next;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage quota errors
    }
  }
  for (const cb of listeners) {
    try {
      cb();
    } catch {
      // ignore listener errors
    }
  }
}

function appendEvent(
  events: FirestoreMetricEvent[],
  op: FirestoreMetricEvent['op'],
  count: number,
  label: string
): FirestoreMetricEvent[] {
  const entry: FirestoreMetricEvent = {
    at: new Date().toISOString(),
    op,
    count,
    label,
  };
  return [entry, ...events].slice(0, 12);
}

export function recordFirestoreRead(count: number, label = 'Firestore read') {
  const safe = Math.max(0, Math.round(count));
  if (safe === 0) return;
  const cur = loadState();
  persistState({
    ...cur,
    reads: cur.reads + safe,
    recentEvents: appendEvent(cur.recentEvents, 'read', safe, label),
  });
}

export function recordFirestoreWrite(count: number, label = 'Firestore write') {
  const safe = Math.max(0, Math.round(count));
  if (safe === 0) return;
  const cur = loadState();
  persistState({
    ...cur,
    writes: cur.writes + safe,
    lastPublishAt: Date.now(),
    recentEvents: appendEvent(cur.recentEvents, 'write', safe, label),
  });
}

export function recordFirestoreDelete(count: number, label = 'Удаление старых шардов') {
  const safe = Math.max(0, Math.round(count));
  if (safe === 0) return;
  const cur = loadState();
  persistState({
    ...cur,
    deletes: cur.deletes + safe,
    recentEvents: appendEvent(cur.recentEvents, 'delete', safe, label),
  });
}

export function recordSkippedRead(
  reason: 'ttl' | 'version' | 'hash',
  savedCount = 1,
  label?: string
) {
  const safe = Math.max(1, Math.round(savedCount));
  const cur = loadState();
  if (reason === 'ttl') {
    persistState({
      ...cur,
      skippedReadsByTtl: cur.skippedReadsByTtl + safe,
      recentEvents: appendEvent(
        cur.recentEvents,
        'skip-ttl',
        safe,
        label || 'Пропущено по TTL-кешу'
      ),
    });
  } else if (reason === 'version') {
    persistState({
      ...cur,
      skippedReadsByVersion: cur.skippedReadsByVersion + safe,
      recentEvents: appendEvent(
        cur.recentEvents,
        'skip-version',
        safe,
        label || 'Версия актуальна (cachedVersion)'
      ),
    });
  } else {
    persistState({
      ...cur,
      skippedReadsByHash: cur.skippedReadsByHash + safe,
      recentEvents: appendEvent(
        cur.recentEvents,
        'skip-hash',
        safe,
        label || 'Шарды не изменились (dataHash)'
      ),
    });
  }
}

export function recordSkippedWrite(savedCount: number, label = 'Неизменённые шарды (dataHash)') {
  const safe = Math.max(0, Math.round(savedCount));
  if (safe === 0) return;
  const cur = loadState();
  persistState({
    ...cur,
    skippedWritesByHash: cur.skippedWritesByHash + safe,
    recentEvents: appendEvent(cur.recentEvents, 'skip-hash', safe, label),
  });
}

export function recordServerCacheHit(label = 'Ответ клиентского кеш-эндпоинта') {
  const cur = loadState();
  persistState({
    ...cur,
    serverCacheHits: cur.serverCacheHits + 1,
    lastSyncAt: Date.now(),
    recentEvents: appendEvent(cur.recentEvents, 'server-cache', 1, label),
  });
}

export function markSyncTimestamp(ts = Date.now()) {
  const cur = loadState();
  persistState({
    ...cur,
    lastSyncAt: ts,
  });
}

export function getFirestoreMetricsSnapshot(): FirestoreDailyMetrics {
  const cur = loadState();
  return {
    ...cur,
    recentEvents: [...cur.recentEvents],
  };
}

export function resetFirestoreMetricsToday(): FirestoreDailyMetrics {
  const fresh = createEmptyDay();
  persistState(fresh);
  return fresh;
}

export function subscribeFirestoreMetrics(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getFirestoreQuotaAlerts(
  snapshot: FirestoreDailyMetrics = getFirestoreMetricsSnapshot()
): FirestoreQuotaAlert[] {
  const alerts: FirestoreQuotaAlert[] = [];

  const checks: {
    metric: 'reads' | 'writes' | 'deletes';
    used: number;
    limit: number;
    labelRu: string;
  }[] = [
    {
      metric: 'reads',
      used: snapshot.reads,
      limit: SPARK_DAILY_READ_LIMIT,
      labelRu: 'чтений Firestore',
    },
    {
      metric: 'writes',
      used: snapshot.writes,
      limit: SPARK_DAILY_WRITE_LIMIT,
      labelRu: 'записей Firestore',
    },
    {
      metric: 'deletes',
      used: snapshot.deletes,
      limit: SPARK_DAILY_DELETE_LIMIT,
      labelRu: 'удалений Firestore',
    },
  ];

  for (const item of checks) {
    const pct = Math.round((item.used / item.limit) * 100);
    if (pct >= 75) {
      alerts.push({
        level: 'critical',
        metric: item.metric,
        percent: pct,
        message: `Критическая нагрузка: использовано ${item.used.toLocaleString('ru-RU')} из ${item.limit.toLocaleString('ru-RU')} дневных ${item.labelRu} (${pct}%).`,
      });
    } else if (pct >= 30) {
      alerts.push({
        level: 'warning',
        metric: item.metric,
        percent: pct,
        message: `Повышенный расход: ${item.used.toLocaleString('ru-RU')} из ${item.limit.toLocaleString('ru-RU')} дневных ${item.labelRu} (${pct}%).`,
      });
    }
  }

  return alerts;
}
