import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardPaste,
  ExternalLink,
  FileDown,
  FileText,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import {
  applyVerifiedParamsToDiamond,
  hasExternalSupplierPhoto,
  isVerifiableCertNumber,
} from '../lib/certVerification';
import { extractTextFromIgiPdfFile } from '../lib/igiPdfReader';
import {
  buildIgiPdfUrl,
  buildIgiVerifyUrl,
  buildVerifiedResponseFromParams,
  compareDiamondWithCertParams,
  parseIgiReportText,
  type IgiParseResult,
} from '../lib/igiReportParser';
import type { Diamond } from '../types/diamond';

interface IgiCertVerificationPanelProps {
  diamond: Diamond;
  onUpdateDiamond?: (updated: Diamond) => void;
  onNotice?: (message: string) => void;
}

export const IgiCertVerificationPanel: React.FC<IgiCertVerificationPanelProps> = ({
  diamond,
  onUpdateDiamond,
  onNotice,
}) => {
  const [pastedText, setPastedText] = useState('');
  const [parseSource, setParseSource] = useState<'pdf-parse' | 'text-paste' | null>(null);
  const [parsedResult, setParsedResult] = useState<IgiParseResult | null>(null);
  const [pdfReading, setPdfReading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [applyStudioPhoto, setApplyStudioPhoto] = useState(
    () => !hasExternalSupplierPhoto(diamond)
  );
  const [appliedMessage, setAppliedMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const labUpper = (diamond.certLab || 'IGI').trim().toUpperCase();
  const isIgi = labUpper === 'IGI';
  const hasRealCert = isVerifiableCertNumber(diamond.certNumber);
  const verifyUrl = isIgi ? buildIgiVerifyUrl(diamond.certNumber) : diamond.certUrl;
  const igiPdfUrl = isIgi ? buildIgiPdfUrl(diamond.certNumber) : undefined;

  const activeParams = parsedResult?.params;
  const diffs = useMemo(() => {
    if (!activeParams) return [];
    return compareDiamondWithCertParams(diamond, activeParams);
  }, [diamond, activeParams]);

  const mismatchCount = useMemo(
    () => diffs.filter((d) => d.status === 'mismatch').length,
    [diffs]
  );

  const handleParsePastedText = () => {
    setParseError(null);
    setAppliedMessage(null);
    const trimmed = pastedText.trim();
    if (!trimmed) {
      setParseError(
        `Вставьте текст отчёта со страницы ${isIgi ? 'igi.org' : labUpper} (Ctrl+A → Ctrl+C → Ctrl+V).`
      );
      return;
    }
    const parsed = parseIgiReportText(trimmed, diamond.certNumber);
    if (parsed.extractedCount === 0) {
      setParseError(
        'Не удалось распознать параметры камня в тексте. Скопируйте таблицу характеристик с официального бланка (Shape, Carat Weight, Color Grade, Clarity Grade, Measurements...).'
      );
      return;
    }
    setParsedResult(parsed);
    setParseSource('text-paste');
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setPdfReading(true);
    setParseError(null);
    setAppliedMessage(null);
    try {
      const extractedText = await extractTextFromIgiPdfFile(file);
      const parsed = parseIgiReportText(extractedText, diamond.certNumber);
      if (parsed.extractedCount === 0) {
        setParseError(
          'PDF прочитан, но текстовые поля сертификата не найдены (возможно, это скан-картинка). Скопируйте характеристики со страницы лаборатории и вставьте в поле справа.'
        );
        return;
      }
      setParsedResult(parsed);
      setParseSource('pdf-parse');
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : 'Не удалось прочитать PDF-файл сертификата.'
      );
    } finally {
      setPdfReading(false);
    }
  };

  const handleApplyExtractedParams = () => {
    if (!onUpdateDiamond || !activeParams) return;
    const sourceMode = parseSource || 'text-paste';
    const verifiedResp = buildVerifiedResponseFromParams(
      diamond.certLab,
      diamond.certNumber,
      activeParams,
      sourceMode
    );
    const updated = applyVerifiedParamsToDiamond(diamond, verifiedResp, {
      useStudioPhoto: applyStudioPhoto,
      source: sourceMode === 'pdf-parse' ? 'pdf' : 'text',
    });
    onUpdateDiamond(updated);
    const summary = `Параметры камня обновлены и подтверждены по сертификату ${labUpper} #${diamond.certNumber} (${diffs.length} характеристик).`;
    setAppliedMessage(summary);
    onNotice?.(summary);
  };

  if (!hasRealCert) {
    return null;
  }

  return (
    <div className="border-t border-[#E4E6EB] pt-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-[#111317]">
            <ShieldCheck className="w-4 h-4 text-[#1B365D] shrink-0" />
            <span>Разовая верификация параметров по сертификату {labUpper}</span>
          </div>
          <p className="text-xs text-[#5A606D] mt-0.5 leading-relaxed">
            Откройте официальный бланк на сайте лаборатории, скачайте PDF или скопируйте
            текст отчёта — параметры сверятся локально в браузере без API-обмена.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={verifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[#1B365D] text-white hover:bg-[#142947] transition-colors whitespace-nowrap"
          >
            Открыть на {isIgi ? 'igi.org' : labUpper}
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          {igiPdfUrl && (
            <a
              href={igiPdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[#D5D9E0] bg-white text-[#111317] hover:bg-[#F7F8FA] transition-colors whitespace-nowrap"
            >
              <FileDown className="w-3.5 h-3.5 text-[#1B365D]" />
              Скачать PDF IGI
            </a>
          )}
        </div>
      </div>

      {/* Two local one-time verification inputs: Official PDF upload OR Pasted text */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="p-3.5 rounded-lg border border-dashed border-[#CBD5E1] bg-[#FAFAFA] flex flex-col justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#111317]">
              <FileText className="w-3.5 h-3.5 text-[#1B365D]" />
              <span>1. Загрузить PDF-бланк {labUpper}</span>
            </div>
            <p className="text-[11px] text-[#5A606D] mt-1 leading-snug">
              Выберите официальный PDF-файл сертификата — разбор выполняется локально в
              браузере (до 10 МБ).
            </p>
          </div>

          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={handlePdfUpload}
              className="hidden"
            />
            <button
              type="button"
              disabled={pdfReading}
              onClick={() => fileInputRef.current?.click()}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-[#1B365D] bg-white text-[#1B365D] hover:bg-[#F4F7FB] disabled:opacity-50 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              {pdfReading ? 'Чтение PDF...' : 'Выбрать PDF сертификата'}
            </button>
          </div>
        </div>

        <div className="p-3.5 rounded-lg border border-[#E4E6EB] bg-[#FAFAFA] flex flex-col justify-between gap-2.5">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#111317]">
              <ClipboardPaste className="w-3.5 h-3.5 text-[#1B365D]" />
              <span>2. Вставить текст со страницы {isIgi ? 'igi.org' : labUpper}</span>
            </div>
            <textarea
              rows={3}
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder={`Скопируйте текст со страницы ${labUpper} (Shape, Carat Weight, Color Grade, Clarity, Cut, Polish, Symmetry, Measurements...)`}
              className="mt-1.5 w-full px-2.5 py-1.5 text-[11px] font-mono bg-white border border-[#D5D9E0] rounded-md text-[#111317] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#1B365D] resize-y"
            />
          </div>
          <button
            type="button"
            disabled={!pastedText.trim()}
            onClick={handleParsePastedText}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[#1B365D] text-white hover:bg-[#142947] disabled:opacity-40 transition-colors"
          >
            Распознать и сверить параметры
          </button>
        </div>
      </div>

      {parseError && (
        <div className="p-2.5 rounded-md bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#991B1B]">
          {parseError}
        </div>
      )}

      {parsedResult?.warnings && parsedResult.warnings.length > 0 && (
        <div className="p-3 rounded-md bg-[#FEF2F2] border border-[#FCA5A5] text-xs text-[#991B1B] space-y-1">
          {parsedResult.warnings.map((w, idx) => (
            <div key={idx} className="flex items-start gap-1.5 font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {appliedMessage && (
        <div className="p-2.5 rounded-md bg-[#ECFDF5] border border-[#A7F3D0] text-xs text-[#065F46] flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{appliedMessage}</span>
        </div>
      )}

      {diffs.length > 0 && (
        <div className="rounded-lg border border-[#E4E6EB] overflow-hidden bg-white">
          <div className="px-3.5 py-2.5 bg-[#F8FAFC] border-b border-[#E4E6EB] flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold text-[#111317]">
              Результаты сверки ({diffs.length} параметров)
              {activeParams?.reportNumber && (
                <span className="ml-2 font-mono font-normal text-[#5A606D]">
                  #{activeParams.reportNumber}
                </span>
              )}
            </div>
            <div className="text-[11px] font-medium">
              {mismatchCount === 0 ? (
                <span className="text-[#065F46]">Все параметры совпадают</span>
              ) : (
                <span className="text-[#B45309]">
                  Найдено расхождений: {mismatchCount}
                </span>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E4E6EB] text-[11px] text-[#5A606D] bg-[#FAFAFA]">
                  <th className="py-2 px-3 font-medium">Параметр</th>
                  <th className="py-2 px-3 font-medium">В прайсе</th>
                  <th className="py-2 px-3 font-medium">В сертификате {labUpper}</th>
                  <th className="py-2 px-3 font-medium text-right">Статус</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F3F5]">
                {diffs.map((row) => (
                  <tr
                    key={row.field}
                    className={
                      row.status === 'mismatch' ? 'bg-[#FFFBEB]/60' : 'bg-white'
                    }
                  >
                    <td className="py-1.5 px-3 text-[#5A606D]">{row.label}</td>
                    <td className="py-1.5 px-3 font-mono text-[#111317]">
                      {row.currentValue}
                    </td>
                    <td className="py-1.5 px-3 font-mono font-semibold text-[#111317]">
                      {row.certValue}
                    </td>
                    <td className="py-1.5 px-3 text-right whitespace-nowrap">
                      {row.status === 'match' ? (
                        <span className="text-[#065F46] font-medium">Совпадает</span>
                      ) : row.status === 'added' ? (
                        <span className="text-[#1B365D] font-medium">Дополнит</span>
                      ) : (
                        <span className="text-[#B45309] font-semibold">Отличается</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {onUpdateDiamond && (
            <div className="px-3.5 py-3 bg-[#FAFAFA] border-t border-[#E4E6EB] flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex items-center gap-1.5 text-[11px] text-[#5A606D] cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyStudioPhoto}
                  onChange={(e) => setApplyStudioPhoto(e.target.checked)}
                  className="w-3.5 h-3.5 accent-[#1B365D]"
                />
                Синхронизировать студийное фото под подтверждённую форму и цвет
              </label>

              <button
                type="button"
                disabled={Boolean(parsedResult?.reportNumberMismatch)}
                onClick={handleApplyExtractedParams}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md bg-[#065F46] text-white hover:bg-[#044935] disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                <Check className="w-3.5 h-3.5" />
                Применить параметры из {labUpper}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
