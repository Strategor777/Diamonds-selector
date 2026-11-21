import React, { useMemo, useRef, useState } from 'react';
import {
  Check,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import { SHAPE_SHORT_RU } from '../data/diamonds';
import {
  BatchVerifyProgress,
  applyVerifiedColorToDiamond,
  buildManualColorVerification,
  hasExternalSupplierPhoto,
  isVerifiableCertNumber,
  verifyBatchCertificateColors,
} from '../lib/certVerification';
import type { CertVerifyResponse } from '../lib/certVerifyTypes';
import type { Diamond } from '../types/diamond';

interface CertBatchVerifyModalProps {
  open: boolean;
  allStones: Diamond[];
  filteredStones: Diamond[];
  onClose: () => void;
  onBatchApplyDiamonds: (updatedList: Diamond[]) => void;
}

export const CertBatchVerifyModal: React.FC<CertBatchVerifyModalProps> = ({
  open,
  allStones,
  filteredStones,
  onClose,
  onBatchApplyDiamonds,
}) => {
  const [scope, setScope] = useState<'filtered' | 'all'>(
    filteredStones.length < allStones.length ? 'filtered' : 'all'
  );
  const [onlyUnverified, setOnlyUnverified] = useState(true);
  const [photoPolicy, setPhotoPolicy] = useState<'smart' | 'always-studio' | 'keep'>(
    'smart'
  );
  const [maxBatchCount, setMaxBatchCount] = useState<number>(50);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<BatchVerifyProgress | null>(null);
  const [manualItems, setManualItems] = useState<
    { stone: Diamond; result: CertVerifyResponse }[]
  >([]);
  const [manualInputs, setManualInputs] = useState<Record<string, string>>({});
  const [appliedSummary, setAppliedSummary] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const candidateStones = useMemo(() => {
    const base = scope === 'filtered' ? filteredStones : allStones;
    return base.filter(
      (s) =>
        isVerifiableCertNumber(s.certNumber) &&
        (!onlyUnverified || !s.certColorVerified)
    );
  }, [scope, filteredStones, allStones, onlyUnverified]);

  const targetStones = useMemo(
    () => candidateStones.slice(0, maxBatchCount),
    [candidateStones, maxBatchCount]
  );

  if (!open) return null;

  const handleStart = async () => {
    if (targetStones.length === 0 || isRunning) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setIsRunning(true);
    setAppliedSummary(null);
    setManualItems([]);
    setProgress({
      completed: 0,
      total: targetStones.length,
      verifiedCount: 0,
      manualCount: 0,
      notFoundCount: 0,
    });

    const stoneById = new Map(targetStones.map((s) => [s.id, s]));
    let totalAutoApplied = 0;
    let hitRateLimit = false;

    try {
      const resultsMap = await verifyBatchCertificateColors(targetStones, {
        signal: controller.signal,
        onProgress: (p) => {
          if (p.rateLimited) hitRateLimit = true;
          setProgress(p);
        },
        onChunkComplete: (chunkResults) => {
          const chunkUpdated: Diamond[] = [];
          const chunkManual: { stone: Diamond; result: CertVerifyResponse }[] = [];

          for (const [stoneId, res] of chunkResults.entries()) {
            const stone = stoneById.get(stoneId);
            if (!stone) continue;

            if (res.status === 'verified' && res.normalizedColor) {
              const colorChanged =
                stone.color.trim().toLowerCase() !==
                res.normalizedColor.trim().toLowerCase();
              const useStudio =
                photoPolicy === 'always-studio'
                  ? true
                  : photoPolicy === 'keep'
                    ? false
                    : stone.useStudioPhoto || !hasExternalSupplierPhoto(stone) || colorChanged;
              chunkUpdated.push(
                applyVerifiedColorToDiamond(stone, res, {
                  useStudioPhoto: useStudio,
                  source: 'auto',
                })
              );
            } else if (res.status === 'manual_required' || res.status === 'not_found') {
              chunkManual.push({ stone, result: res });
            }
          }

          if (chunkUpdated.length > 0) {
            totalAutoApplied += chunkUpdated.length;
            onBatchApplyDiamonds(chunkUpdated);
          }
          if (chunkManual.length > 0) {
            setManualItems((prev) => [...prev, ...chunkManual]);
          }
        },
      });

      const manualTotal = Array.from(resultsMap.values()).filter(
        (r) => r.status === 'manual_required' || r.status === 'not_found'
      ).length;

      if (hitRateLimit) {
        setAppliedSummary(
          totalAutoApplied > 0
            ? `Сохранено ${totalAutoApplied} подтверждённых камн., затем достигнут минутный лимит запросов (60/мин). Подождите минуту и продолжите — проверенные камни уже пропустятся автоматически.`
            : 'Достигнут минутный лимит запросов к серверу верификации (60/мин). Подождите минуту и запустите следующий пакет.'
        );
      } else {
        setAppliedSummary(
          totalAutoApplied > 0
            ? `Автоматически подтверждён цвет для ${totalAutoApplied} камн. и обновлены студийные фото (сохранено по пакетам).`
            : manualTotal > 0
              ? `Проверено ${resultsMap.size} сертификатов. Сайты лабораторий запросили ручное подтверждение (CAPTCHA) — вы можете уточнить цвет ниже по прямым ссылкам на бланки.`
              : 'Проверка завершена.'
        );
      }
    } finally {
      setIsRunning(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleConfirmManualRow = (stone: Diamond) => {
    const raw = (manualInputs[stone.id] || '').trim();
    if (!raw) return;
    const verified = buildManualColorVerification(
      stone.certLab,
      stone.certNumber,
      raw
    );
    if (!verified) return;

    const updated = applyVerifiedColorToDiamond(stone, verified, {
      useStudioPhoto: photoPolicy !== 'keep',
      source: 'manual',
    });
    onBatchApplyDiamonds([updated]);
    setManualItems((prev) => prev.filter((row) => row.stone.id !== stone.id));
    setManualInputs((prev) => {
      const next = { ...prev };
      delete next[stone.id];
      return next;
    });
    setAppliedSummary(
      `Подтверждён цвет «${verified.normalizedColor}» для ${stone.sku} (${stone.certLab} #${stone.certNumber}).`
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4 md:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Верификация цветов по сертификатам"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isRunning) onClose();
      }}
    >
      <div className="bg-white border border-[#E4E6EB] rounded-xl max-w-2xl w-full overflow-hidden shadow-2xl my-auto">
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-[#E4E6EB]">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-[#1B365D] shrink-0" />
            <div>
              <h2 className="text-lg font-semibold text-[#111317]">
                Верификация цвета по сертификатам
              </h2>
              <p className="text-xs text-[#5A606D]">
                Автоматическая проверка цвета на сайтах GIA, IGI, HRD, GRS и
                калибровка студийных фото
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isRunning}
            onClick={onClose}
            aria-label="Закрыть окно верификации"
            className="w-9 h-9 rounded-lg border border-[#E4E6EB] flex items-center justify-center text-[#5A606D] hover:text-[#111317] disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[78vh] overflow-y-auto text-xs">
          {/* Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block font-medium text-[#5A606D]">Область проверки</label>
              <div className="inline-flex items-center gap-1 p-1 bg-[#F1F3F5] rounded-lg w-full">
                <button
                  type="button"
                  disabled={isRunning}
                  onClick={() => setScope('filtered')}
                  className={`flex-1 py-1.5 px-2.5 text-xs font-medium rounded-md transition-colors tabular-nums ${
                    scope === 'filtered'
                      ? 'bg-white text-[#111317] shadow-sm'
                      : 'text-[#5A606D]'
                  }`}
                >
                  Выборка ({filteredStones.length.toLocaleString('ru-RU')})
                </button>
                <button
                  type="button"
                  disabled={isRunning}
                  onClick={() => setScope('all')}
                  className={`flex-1 py-1.5 px-2.5 text-xs font-medium rounded-md transition-colors tabular-nums ${
                    scope === 'all'
                      ? 'bg-white text-[#111317] shadow-sm'
                      : 'text-[#5A606D]'
                  }`}
                >
                  Весь реестр ({allStones.length.toLocaleString('ru-RU')})
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="cert-batch-limit"
                className="block font-medium text-[#5A606D]"
              >
                Лимит за один запуск
              </label>
              <select
                id="cert-batch-limit"
                disabled={isRunning}
                value={maxBatchCount}
                onChange={(e) => setMaxBatchCount(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs font-mono bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg text-[#111317]"
              >
                <option value={20}>До 20 сертификатов</option>
                <option value={50}>До 50 сертификатов</option>
                <option value={100}>До 100 сертификатов</option>
                <option value={250}>До 250 сертификатов</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor="cert-photo-policy"
                className="block font-medium text-[#5A606D]"
              >
                Правило назначения студийного фото
              </label>
              <select
                id="cert-photo-policy"
                disabled={isRunning}
                value={photoPolicy}
                onChange={(e) =>
                  setPhotoPolicy(
                    e.target.value as 'smart' | 'always-studio' | 'keep'
                  )
                }
                className="w-full px-3 py-2 text-xs bg-[#FAFAFA] border border-[#D5D9E0] rounded-lg text-[#111317]"
              >
                <option value="smart">
                  Автоматически (если нет фото или цвет отличался)
                </option>
                <option value="always-studio">
                  Всегда включать студийное фото под подтверждённый цвет
                </option>
                <option value="keep">
                  Обновлять только цвет, фото не переключать
                </option>
              </select>
            </div>

            <div className="flex items-end pb-1.5">
              <label className="inline-flex items-center gap-2 text-xs text-[#111317] cursor-pointer">
                <input
                  type="checkbox"
                  disabled={isRunning}
                  checked={onlyUnverified}
                  onChange={(e) => setOnlyUnverified(e.target.checked)}
                  className="w-4 h-4 accent-[#1B365D]"
                />
                Проверять только ещё не подтверждённые камни
              </label>
            </div>
          </div>

          {/* Progress Strip */}
          {progress && (
            <div className="p-3.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-[#111317]">
                  {isRunning
                    ? 'Идёт обращение к сайтам лабораторий...'
                    : 'Проверка завершена'}
                </span>
                <span className="font-mono tabular-nums font-semibold text-[#1B365D]">
                  {progress.completed} / {progress.total}
                </span>
              </div>
              <div className="h-1.5 bg-[#E2E8F0] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#1B365D] transition-all duration-150"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round(
                        (progress.completed / Math.max(1, progress.total)) * 100
                      )
                    )}%`,
                  }}
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#5A606D] tabular-nums">
                <span className="text-[#065F46] font-medium">
                  Подтверждено автоматически: {progress.verifiedCount}
                </span>
                <span>Требует открытия бланка: {progress.manualCount}</span>
                {progress.notFoundCount > 0 && (
                  <span>Не найдено: {progress.notFoundCount}</span>
                )}
              </div>
            </div>
          )}

          {appliedSummary && (
            <div className="p-3 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] text-xs text-[#065F46] flex items-center gap-2">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>{appliedSummary}</span>
            </div>
          )}

          {/* Manual Confirmation Queue (for labs protected by browser CAPTCHA) */}
          {manualItems.length > 0 && (
            <div className="space-y-2.5 pt-2 border-t border-[#E4E6EB]">
              <div className="font-semibold text-[#111317]">
                Быстрое подтверждение по бланкам ({manualItems.length})
              </div>
              <p className="text-[11px] text-[#5A606D] leading-snug">
                Откройте официальный сертификат по ссылке и введите указанный в нём
                цвет (например: <span className="font-mono">FIP</span>,{' '}
                <span className="font-mono">Fancy Intense Pink</span>,{' '}
                <span className="font-mono">FVOP</span> или{' '}
                <span className="font-mono">E</span>) — система распознает оттенок и
                подберёт студийное фото.
              </p>

              <div className="divide-y divide-[#E4E6EB] border border-[#E4E6EB] rounded-lg max-h-64 overflow-y-auto">
                {manualItems.slice(0, 30).map(({ stone, result }) => (
                  <div
                    key={stone.id}
                    className="p-2.5 flex flex-wrap items-center justify-between gap-2 bg-white"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-[#111317] truncate">
                        {SHAPE_SHORT_RU[stone.shape]} {stone.carat.toFixed(2)} ct ·{' '}
                        <span className="font-mono text-[#5A606D]">{stone.color}</span>
                      </div>
                      <div className="text-[11px] font-mono text-[#5A606D] flex items-center gap-2">
                        <span>
                          {stone.certLab} #{stone.certNumber}
                        </span>
                        <a
                          href={result.verifyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 text-[#1B365D] hover:underline"
                        >
                          Бланк
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={manualInputs[stone.id] || ''}
                        onChange={(e) =>
                          setManualInputs((prev) => ({
                            ...prev,
                            [stone.id]: e.target.value,
                          }))
                        }
                        placeholder="FIP / Fancy Vivid..."
                        className="w-40 px-2 py-1 text-xs font-mono bg-[#FAFAFA] border border-[#D5D9E0] rounded text-[#111317]"
                      />
                      <button
                        type="button"
                        disabled={!(manualInputs[stone.id] || '').trim()}
                        onClick={() => handleConfirmManualRow(stone)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-[#1B365D] text-white hover:bg-[#142947] disabled:opacity-40 whitespace-nowrap"
                      >
                        <Check className="w-3 h-3" />
                        Ок
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[#E4E6EB] flex flex-wrap items-center justify-between gap-3 bg-[#FAFAFA]">
          <div className="text-xs text-[#5A606D] tabular-nums">
            Доступно к проверке:{' '}
            <strong className="font-mono text-[#111317]">
              {candidateStones.length.toLocaleString('ru-RU')}
            </strong>{' '}
            (в пакете: {targetStones.length})
          </div>
          <div className="flex items-center gap-2">
            {isRunning ? (
              <button
                type="button"
                onClick={handleStop}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg border border-[#FECACA] bg-[#FEF2F2] text-[#991B1B] hover:bg-[#FEE2E2]"
              >
                <Square className="w-3.5 h-3.5" />
                Остановить
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium rounded-lg border border-[#D5D9E0] bg-white text-[#111317] hover:bg-[#F7F8FA]"
                >
                  Закрыть
                </button>
                <button
                  type="button"
                  disabled={targetStones.length === 0}
                  onClick={handleStart}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-[#1B365D] text-white hover:bg-[#142947] disabled:opacity-45"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Запустить проверку ({targetStones.length})
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
