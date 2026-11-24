import React, { useEffect, useState } from 'react';
import { Activity, AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';
import {
  DEFAULT_SYNC_TTL_MS,
  getLastSyncAt,
} from '../lib/catalogPersistence';
import {
  SPARK_DAILY_DELETE_LIMIT,
  SPARK_DAILY_READ_LIMIT,
  SPARK_DAILY_WRITE_LIMIT,
  getFirestoreMetricsSnapshot,
  getFirestoreQuotaAlerts,
  resetFirestoreMetricsToday,
  subscribeFirestoreMetrics,
  type FirestoreDailyMetrics,
} from '../lib/firestoreMetrics';

interface FirestoreUsagePanelProps {
  registryVersion: number;
  lastSyncAt: number | null;
  onForceRefreshCloud?: () => void;
  isRefreshingCloud?: boolean;
}

function formatTimeRu(ts: number | null): string {
  if (!ts) return 'Ещё не выполнялась';
  try {
    return new Date(ts).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '—';
  }
}

export const FirestoreUsagePanel: React.FC<FirestoreUsagePanelProps> = ({
  registryVersion,
  lastSyncAt,
  onForceRefreshCloud,
  isRefreshingCloud = false,
}) => {
  const [metrics, setMetrics] = useState<FirestoreDailyMetrics>(() =>
    getFirestoreMetricsSnapshot()
  );

  useEffect(() => {
    const sync = () => setMetrics(getFirestoreMetricsSnapshot());
    sync();
    return subscribeFirestoreMetrics(sync);
  }, []);

  const alerts = getFirestoreQuotaAlerts(metrics);
  const readPct = Math.min(
    100,
    Math.round((metrics.reads / SPARK_DAILY_READ_LIMIT) * 1000) / 10
  );
  const writePct = Math.min(
    100,
    Math.round((metrics.writes / SPARK_DAILY_WRITE_LIMIT) * 1000) / 10
  );
  const totalSavedReads =
    metrics.skippedReadsByTtl +
    metrics.skippedReadsByVersion +
    metrics.skippedReadsByHash;
  const effectiveSyncAt = lastSyncAt ?? metrics.lastSyncAt ?? getLastSyncAt();
  const ttlMinutes = Math.round(DEFAULT_SYNC_TTL_MS / 60_000);

  return (
    <div className="bg-white border border-[#E4E6EB] rounded-xl p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#1B365D]" />
            <h3 className="text-sm font-semibold text-[#111317]">
              Мониторинг операций Firestore (за сегодня · {metrics.dateKey})
            </h3>
          </div>
          <p className="text-xs text-[#5A606D] mt-0.5">
            Версия каталога:{' '}
            <span className="font-mono font-medium text-[#111317]">
              v{registryVersion || 0}
            </span>{' '}
            · Последняя синхронизация:{' '}
            <span className="font-mono text-[#111317]">
              {formatTimeRu(effectiveSyncAt)}
            </span>{' '}
            · TTL-кеш: {ttlMinutes} мин
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onForceRefreshCloud && (
            <button
              type="button"
              disabled={isRefreshingCloud}
              onClick={onForceRefreshCloud}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[#D5D9E0] bg-white text-[#111317] hover:bg-[#F7F8FA] disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isRefreshingCloud ? 'animate-spin' : ''}`}
              />
              Проверить облако сейчас
            </button>
          )}
          <button
            type="button"
            onClick={() => setMetrics(resetFirestoreMetricsToday())}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-[#E4E6EB] bg-[#FAFAFA] text-[#5A606D] hover:text-[#111317]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Сбросить счётчик
          </button>
        </div>
      </div>

      {/* Quota Threshold Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <div
              key={alert.metric}
              className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
                alert.level === 'critical'
                  ? 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]'
                  : 'bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]'
              }`}
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Compact Operations Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
        <div className="p-3 rounded-lg bg-[#FAFAFA] border border-[#E4E6EB]">
          <div className="text-[#5A606D]">Чтения (Reads)</div>
          <div className="font-mono tabular-nums text-base font-semibold text-[#111317] mt-0.5">
            {metrics.reads.toLocaleString('ru-RU')}
          </div>
          <div className="mt-1.5 h-1.5 bg-[#E2E8F0] rounded-full overflow-hidden">
            <div
              className={`h-full ${
                readPct >= 75
                  ? 'bg-[#DC2626]'
                  : readPct >= 30
                    ? 'bg-[#D97706]'
                    : 'bg-[#1B365D]'
              }`}
              style={{ width: `${Math.max(readPct > 0 ? 3 : 0, readPct)}%` }}
            />
          </div>
          <div className="text-[11px] text-[#5A606D] font-mono mt-1">
            {readPct}% из 50 000
          </div>
        </div>

        <div className="p-3 rounded-lg bg-[#FAFAFA] border border-[#E4E6EB]">
          <div className="text-[#5A606D]">Записи (Writes)</div>
          <div className="font-mono tabular-nums text-base font-semibold text-[#111317] mt-0.5">
            {metrics.writes.toLocaleString('ru-RU')}
          </div>
          <div className="mt-1.5 h-1.5 bg-[#E2E8F0] rounded-full overflow-hidden">
            <div
              className={`h-full ${
                writePct >= 75
                  ? 'bg-[#DC2626]'
                  : writePct >= 30
                    ? 'bg-[#D97706]'
                    : 'bg-[#065F46]'
              }`}
              style={{ width: `${Math.max(writePct > 0 ? 3 : 0, writePct)}%` }}
            />
          </div>
          <div className="text-[11px] text-[#5A606D] font-mono mt-1">
            {writePct}% из 20 000
          </div>
        </div>

        <div className="p-3 rounded-lg bg-[#FAFAFA] border border-[#E4E6EB]">
          <div className="text-[#5A606D]">Удаления (Deletes)</div>
          <div className="font-mono tabular-nums text-base font-semibold text-[#111317] mt-0.5">
            {metrics.deletes.toLocaleString('ru-RU')}
          </div>
          <div className="text-[11px] text-[#5A606D] font-mono mt-2.5">
            Лимит: {SPARK_DAILY_DELETE_LIMIT.toLocaleString('ru-RU')}/день
          </div>
        </div>

        <div className="p-3 rounded-lg bg-[#ECFDF5]/60 border border-[#A7F3D0]">
          <div className="text-[#065F46]">Сэкономлено чтений</div>
          <div className="font-mono tabular-nums text-base font-semibold text-[#065F46] mt-0.5">
            {totalSavedReads.toLocaleString('ru-RU')}
          </div>
          <div className="text-[11px] text-[#065F46]/80 mt-1">
            TTL: {metrics.skippedReadsByTtl} · Версия: {metrics.skippedReadsByVersion} ·
            Hash: {metrics.skippedReadsByHash}
          </div>
        </div>

        <div className="p-3 rounded-lg bg-[#F4F7FB] border border-[#CBD5E1]">
          <div className="text-[#1B365D]">Сэкономлено записей</div>
          <div className="font-mono tabular-nums text-base font-semibold text-[#1B365D] mt-0.5">
            {metrics.skippedWritesByHash.toLocaleString('ru-RU')}
          </div>
          <div className="text-[11px] text-[#5A606D] mt-1">
            По dataHash · Кеш API: {metrics.serverCacheHits}
          </div>
        </div>
      </div>

      {metrics.recentEvents.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-[#5A606D] hover:text-[#111317] select-none">
            Последние операции ({metrics.recentEvents.length})
          </summary>
          <div className="mt-2 divide-y divide-[#F1F3F5] border border-[#E4E6EB] rounded-lg max-h-40 overflow-y-auto">
            {metrics.recentEvents.map((ev, idx) => (
              <div
                key={`${ev.at}-${idx}`}
                className="px-3 py-1.5 flex items-center justify-between gap-2 text-[11px]"
              >
                <span className="text-[#111317] truncate">{ev.label}</span>
                <span className="font-mono text-[#5A606D] whitespace-nowrap shrink-0">
                  {ev.op} · {ev.count} · {formatTimeRu(Date.parse(ev.at))}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};
