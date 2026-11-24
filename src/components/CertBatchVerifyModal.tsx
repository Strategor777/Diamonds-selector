import React, { useMemo, useRef, useState } from 'react';
import {
  Check,
  ExternalLink,
  FileDown,
  FileText,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { SHAPE_SHORT_RU, getCertVerifyUrl } from '../data/diamonds';
import {
  applyVerifiedColorToDiamond,
  applyVerifiedParamsToDiamond,
  buildManualColorVerification,
  hasExternalSupplierPhoto,
  isVerifiableCertNumber,
} from '../lib/certVerification';
import type { CertVerifyResponse } from '../lib/certVerifyTypes';
import { extractTextFromIgiPdfFile } from '../lib/igiPdfReader';
import {
  buildIgiPdfUrl,
  buildVerifiedResponseFromParams,
  compareDiamondWithCertParams,
  parseIgiReportText,
  type CertParamDiff,
} from '../lib/igiReportParser';
import type { Diamond } from '../types/diamond';

interface CertBatchVerifyModalProps {
  open: boolean;
  allStones: Diamond[];
  filteredStones: Diamond[];
  onClose: () => void;
  onBatchApplyDiamonds: (updatedList: Diamond[]) => void;
}

interface PdfMatchItem {
  fileName: string;
  stone: Diamond | null;
  reportNumber?: string;
  verification?: CertVerifyResponse;
  diffs: CertParamDiff[];
  mismatchCount: number;
  error?: string;
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
  const [labFilter, setLabFilter] = useState<'all' | 'IGI' | 'other'>('IGI');
  const [onlyUnverified, setOnlyUnverified] = useState(true);
  const [photoPolicy, setPhotoPolicy] = useState<'smart' | 'always-studio' | 'keep'>(
    'smart'
  );
  const [manualInputs, setManualInputs] = useState<Record<string, string>>({});
  const [appliedSummary, setAppliedSummary] = useState<string | null>(null);

  // Batch local PDF parsing state (zero external API calls)
  const [pdfReading, setPdfReading] = useState(false);
  const [pdfMatches, setPdfMatches] = useState<PdfMatchItem[]>([]);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);

  const candidateStones = useMemo(() => {
    const base = scope === 'filtered' ? filteredStones : allStones;
    return base.filter((s) => {
      if (!isVerifiableCertNumber(s.certNumber)) return false;
      const lab = (s.certLab || '').trim().toUpperCase();
      if (labFilter === 'IGI' && lab !== 'IGI') return false;
      if (labFilter === 'other' && lab === 'IGI') return false;
      if (onlyUnverified && (s.certParamsVerified || s.certColorVerified)) return false;
      return true;
    });
  }, [scope, filteredStones, allStones, labFilter, onlyUnverified]);

  // Index stones by normalized cert number for instant PDF auto-matching
  const stoneByCertKey = useMemo(() => {
    const map = new Map<string, Diamond>();
    for (const s of allStones) {
      const clean = (s.certNumber || '').trim().toUpperCase();
      if (!clean) continue;
      map.set(clean, s);
      const stripped = clean.replace(/^LG/, '');
      if (stripped && !map.has(stripped)) {
        map.set(stripped, s);
      }
    }
    return map;
  }, [allStones]);

  if (!open) return null;

  const handleBatchPdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).slice(0, 30);
    e.target.value = '';

    setPdfReading(true);
    setAppliedSummary(null);
    const results: PdfMatchItem[] = [];

    try {
      for (const file of files) {
        try {
          const text = await extractTextFromIgiPdfFile(file);
          const parsed = parseIgiReportText(text);
          if (parsed.extractedCount === 0) {
            results.push({
              fileName: file.name,
              stone: null,
              reportNumber: parsed.params.reportNumber,
              diffs: [],
              mismatchCount: 0,
              error: 'Текстовые поля сертификата не распознаны в PDF.',
            });
            continue;
          }

          const fileCertMatch = file.name.match(/(LG\d{6,14}|\d{7,14})/i);
          const candidateCert = (
            parsed.params.reportNumber ||
            fileCertMatch?.[1] ||
            ''
          ).toUpperCase();

          const matchedStone =
            stoneByCertKey.get(candidateCert) ||
            stoneByCertKey.get(candidateCert.replace(/^LG/, '')) ||
            null;

          if (!matchedStone) {
            results.push({
              fileName: file.name,
              stone: null,
              reportNumber: candidateCert || undefined,
              diffs: [],
              mismatchCount: 0,
              error: candidateCert
                ? `Сертификат #${candidateCert} не найден в текущем каталоге.`
                : 'Не удалось определить номер сертификата для сопоставления с каталогом.',
            });
            continue;
          }

          const verification = buildVerifiedResponseFromParams(
            matchedStone.certLab || 'IGI',
            matchedStone.certNumber,
            parsed.params,
            'pdf-parse'
          );
          const diffs = compareDiamondWithCertParams(matchedStone, parsed.params);
          const mismatchCount = diffs.filter((d) => d.status === 'mismatch').length;

          results.push({
            fileName: file.name,
            stone: matchedStone,
            reportNumber: matchedStone.certNumber,
            verification,
            diffs,
            mismatchCount,
          });
        } catch (err) {
          results.push({
            fileName: file.name,
            stone: null,
            diffs: [],
            mismatchCount: 0,
            error: err instanceof Error ? err.message : 'Ошибка чтения PDF.',
          });
        }
      }

      setPdfMatches(results);
    } finally {
      setPdfReading(false);
    }
  };

  const handleApplyAllPdfMatches = () => {
    const valid = pdfMatches.filter((m) => m.stone && m.verification);
    if (valid.length === 0) return;

    const updatedStones = valid.map(({ stone, verification }) => {
      const s = stone!;
      const v = verification!;
      const colorChanged =
        Boolean(v.normalizedColor) &&
        s.color.trim().toLowerCase() !== (v.normalizedColor || '').trim().toLowerCase();
      const useStudio =
        photoPolicy === 'always-studio'
          ? true
          : photoPolicy === 'keep'
            ? false
            : s.useStudioPhoto || !hasExternalSupplierPhoto(s) || colorChanged;

      return applyVerifiedParamsToDiamond(s, v, {
        useStudioPhoto: useStudio,
        source: 'pdf',
      });
    });

    onBatchApplyDiamonds(updatedStones);
    setAppliedSummary(
      `Подтверждены и сохранены параметры для ${updatedStones.length} камн. из официальных PDF-бланков.`
    );
    setPdfMatches([]);
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
    setManualInputs((prev) => {
      const next = { ...prev };
      delete next[stone.id];
      return next;
    });
    setAppliedSummary(
      `Подтверждён цвет «${verified.normalizedColor}» для ${stone.sku} (${stone.certLab} #${stone.certNumber}).`
    );
  };

  const validPdfMatchCount = pdfMatches.filter((m) => m.stone && m.verification).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4 md:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Разовая верификация характеристик по сертификатам"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white border border-[#E4E6EB] rounded-xl max-w-3xl w-full overflow-hidden shadow-2xl my-auto">
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-[#E4E6EB]">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-[#1B365D] shrink-0" />
            <div>
              <h2 className="text-lg font-semibold text-[#111317]">
                Разовая верификация параметров по сертификатам
              </h2>
              <p className="text-xs text-[#5A606D]">
                Локальный разбор PDF-бланков и ручное подтверждение без обмена данными по
                API
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть окно верификации"
            className="w-9 h-9 rounded-lg border border-[#E4E6EB] flex items-center justify-center text-[#5A606D] hover:text-[#111317]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[78vh] overflow-y-auto text-xs">
          {/* Local One-Time PDF Verification Drop Block */}
          <div className="p-4 rounded-lg border border-dashed border-[#1B365D]/40 bg-[#F4F7FB]/50 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-1.5 font-semibold text-[#111317]">
                  <FileText className="w-4 h-4 text-[#1B365D]" />
                  <span>Сверка по официальным PDF-сертификатам</span>
                </div>
                <p className="text-[11px] text-[#5A606D] mt-0.5">
                  Выберите до 30 официальных PDF IGI — система локально извлечёт
                  характеристики, сопоставит по номеру отчёта и сохранит статус
                  верификации.
                </p>
              </div>
              <div>
                <input
                  ref={pdfInputRef}
                  type="file"
                  multiple
                  accept="application/pdf,.pdf"
                  onChange={handleBatchPdfUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={pdfReading}
                  onClick={() => pdfInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-[#1B365D] text-white hover:bg-[#142947] disabled:opacity-50 whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {pdfReading ? 'Разбор PDF...' : 'Загрузить PDF'}
                </button>
              </div>
            </div>

            {pdfMatches.length > 0 && (
              <div className="space-y-2.5 pt-2 border-t border-[#CBD5E1]">
                <div className="divide-y divide-[#E4E6EB] border border-[#E4E6EB] rounded-lg bg-white max-h-56 overflow-y-auto">
                  {pdfMatches.map((item, idx) => (
                    <div
                      key={`${item.fileName}-${idx}`}
                      className="p-2.5 flex flex-wrap items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-[#111317] truncate">
                          {item.stone ? (
                            <>
                              {SHAPE_SHORT_RU[item.stone.shape]} {item.stone.carat.toFixed(2)} ct ·{' '}
                              <span className="font-mono text-[#1B365D]">
                                {item.stone.certLab} #{item.stone.certNumber}
                              </span>
                            </>
                          ) : (
                            <span className="font-mono">{item.fileName}</span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#5A606D]">
                          {item.error ? (
                            <span className="text-[#991B1B]">{item.error}</span>
                          ) : (
                            <span>
                              Распознано {item.diffs.length} параметров ·{' '}
                              {item.mismatchCount > 0 ? (
                                <strong className="text-[#B45309]">
                                  расхождений: {item.mismatchCount}
                                </strong>
                              ) : (
                                <span className="text-[#065F46]">все совпадают</span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                      {item.stone && item.verification && (
                        <span className="text-[11px] font-medium text-[#065F46] whitespace-nowrap">
                          Готов к применению
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {validPdfMatchCount > 0 && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleApplyAllPdfMatches}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-[#065F46] text-white hover:bg-[#044935]"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Применить параметры для {validPdfMatchCount} камн.
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Filter controls for direct links & one-time manual confirmation */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block font-medium text-[#5A606D]">Лаборатория</label>
              <div className="inline-flex items-center gap-1 p-1 bg-[#F1F3F5] rounded-lg w-full">
                <button
                  type="button"
                  onClick={() => setLabFilter('IGI')}
                  className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-md transition-colors ${
                    labFilter === 'IGI'
                      ? 'bg-white text-[#111317] shadow-sm'
                      : 'text-[#5A606D]'
                  }`}
                >
                  IGI
                </button>
                <button
                  type="button"
                  onClick={() => setLabFilter('all')}
                  className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-md transition-colors ${
                    labFilter === 'all'
                      ? 'bg-white text-[#111317] shadow-sm'
                      : 'text-[#5A606D]'
                  }`}
                >
                  Все
                </button>
                <button
                  type="button"
                  onClick={() => setLabFilter('other')}
                  className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-md transition-colors ${
                    labFilter === 'other'
                      ? 'bg-white text-[#111317] shadow-sm'
                      : 'text-[#5A606D]'
                  }`}
                >
                  Другие
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block font-medium text-[#5A606D]">Область списка</label>
              <div className="inline-flex items-center gap-1 p-1 bg-[#F1F3F5] rounded-lg w-full">
                <button
                  type="button"
                  onClick={() => setScope('filtered')}
                  className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-md transition-colors tabular-nums ${
                    scope === 'filtered'
                      ? 'bg-white text-[#111317] shadow-sm'
                      : 'text-[#5A606D]'
                  }`}
                >
                  Выборка ({filteredStones.length.toLocaleString('ru-RU')})
                </button>
                <button
                  type="button"
                  onClick={() => setScope('all')}
                  className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-md transition-colors tabular-nums ${
                    scope === 'all'
                      ? 'bg-white text-[#111317] shadow-sm'
                      : 'text-[#5A606D]'
                  }`}
                >
                  Весь ({allStones.length.toLocaleString('ru-RU')})
                </button>
              </div>
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
                  Обновлять только параметры, фото не переключать
                </option>
              </select>
            </div>

            <div className="flex items-end pb-1.5">
              <label className="inline-flex items-center gap-2 text-xs text-[#111317] cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyUnverified}
                  onChange={(e) => setOnlyUnverified(e.target.checked)}
                  className="w-4 h-4 accent-[#1B365D]"
                />
                Показывать только ещё не подтверждённые камни
              </label>
            </div>
          </div>

          {appliedSummary && (
            <div className="p-3 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] text-xs text-[#065F46] flex items-center gap-2">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>{appliedSummary}</span>
            </div>
          )}

          {/* Direct Links & One-Time Manual Confirmation Queue */}
          <div className="space-y-2.5 pt-2 border-t border-[#E4E6EB]">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold text-[#111317]">
                Очередь разовой проверки ({candidateStones.length.toLocaleString('ru-RU')})
              </div>
              {candidateStones.length > 30 && (
                <span className="text-[11px] text-[#5A606D]">
                  Показаны первые 30 позиций
                </span>
              )}
            </div>

            {candidateStones.length === 0 ? (
              <div className="p-4 rounded-lg bg-[#FAFAFA] border border-[#E4E6EB] text-center text-[#5A606D]">
                Все камни в выбранной области уже подтверждены или не имеют номеров
                сертификатов.
              </div>
            ) : (
              <div className="divide-y divide-[#E4E6EB] border border-[#E4E6EB] rounded-lg max-h-64 overflow-y-auto">
                {candidateStones.slice(0, 30).map((stone) => {
                  const labUpper = (stone.certLab || 'GIA').trim().toUpperCase();
                  const verifyUrl =
                    stone.certUrl || getCertVerifyUrl(labUpper, stone.certNumber);
                  const pdfLink =
                    labUpper === 'IGI' ? buildIgiPdfUrl(stone.certNumber) : undefined;
                  return (
                    <div
                      key={stone.id}
                      className="p-2.5 flex flex-wrap items-center justify-between gap-2 bg-white"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-[#111317] truncate">
                          {SHAPE_SHORT_RU[stone.shape]} {stone.carat.toFixed(2)} ct ·{' '}
                          <span className="font-mono text-[#5A606D]">{stone.color}</span>
                        </div>
                        <div className="text-[11px] font-mono text-[#5A606D] flex flex-wrap items-center gap-2.5">
                          <span>
                            {labUpper} #{stone.certNumber}
                          </span>
                          <a
                            href={verifyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-[#1B365D] hover:underline"
                          >
                            Бланк
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          {pdfLink && (
                            <a
                              href={pdfLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 text-[#065F46] hover:underline"
                            >
                              <FileDown className="w-3 h-3" />
                              PDF IGI
                            </a>
                          )}
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
                          placeholder="Цвет: FIP / E..."
                          className="w-36 px-2 py-1 text-xs font-mono bg-[#FAFAFA] border border-[#D5D9E0] rounded text-[#111317]"
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
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-[#E4E6EB] flex items-center justify-between gap-3 bg-[#FAFAFA]">
          <div className="text-xs text-[#5A606D] tabular-nums">
            Неподтверждённых в выборке:{' '}
            <strong className="font-mono text-[#111317]">
              {candidateStones.length.toLocaleString('ru-RU')}
            </strong>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-lg border border-[#D5D9E0] bg-white text-[#111317] hover:bg-[#F7F8FA]"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
