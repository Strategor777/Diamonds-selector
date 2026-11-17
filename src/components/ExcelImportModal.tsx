import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Settings2,
  Upload,
  X,
} from 'lucide-react';
import { SHAPE_SHORT_RU, formatStonePrice } from '../data/diamonds';
import {
  ColumnAnalysisMeta,
  ColumnMapping,
  MAPPING_FIELDS,
  analyzeColumns,
  detectHeaderRowIndex,
  mapRowsToDiamonds,
} from '../lib/diamondMapper';
import {
  ParsedExcelWorkbook,
  downloadSampleXlsx,
  parseExcelFile,
} from '../lib/excelImport';
import { Diamond } from '../types/diamond';

interface ExcelImportModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (diamonds: Diamond[], replaceExisting: boolean, fileName: string) => void;
}

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({
  open,
  onClose,
  onImport,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [workbook, setWorkbook] = useState<ParsedExcelWorkbook | null>(null);
  const [selectedSheetIndex, setSelectedSheetIndex] = useState(0);
  const [headerRowIndex, setHeaderRowIndex] = useState(0);
  const [analysis, setAnalysis] = useState<ColumnAnalysisMeta | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [showColumnMapper, setShowColumnMapper] = useState(false);
  const [replaceCatalog, setReplaceCatalog] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const activeSheet = useMemo(() => {
    if (!workbook) return null;
    return workbook.sheets[selectedSheetIndex] || workbook.sheets[0] || null;
  }, [workbook, selectedSheetIndex]);

  // Automatically locate the real header row whenever sheet changes
  useEffect(() => {
    if (!activeSheet || activeSheet.rows.length === 0) {
      setHeaderRowIndex(0);
      return;
    }
    const detectedRow = detectHeaderRowIndex(activeSheet.rows);
    setHeaderRowIndex(detectedRow);
  }, [activeSheet]);

  const headers = useMemo(() => {
    if (!activeSheet || activeSheet.rows.length <= headerRowIndex) return [];
    return activeSheet.rows[headerRowIndex] || [];
  }, [activeSheet, headerRowIndex]);

  // Analyze headers + cell content whenever sheet or headerRowIndex changes
  useEffect(() => {
    if (!activeSheet || activeSheet.rows.length === 0) {
      setAnalysis(null);
      setMapping(null);
      return;
    }
    const result = analyzeColumns(activeSheet.rows, headerRowIndex);
    setAnalysis(result);
    setMapping(result.mapping);
    // Open column mapper automatically if required columns weren't recognized
    if (result.mapping.carat < 0 || result.mapping.shape < 0) {
      setShowColumnMapper(true);
    }
  }, [activeSheet, headerRowIndex]);

  const parsedResult = useMemo(() => {
    if (!activeSheet || !mapping || activeSheet.rows.length <= headerRowIndex + 1) {
      return { diamonds: [], skippedRows: 0 };
    }
    return mapRowsToDiamonds(activeSheet.rows, mapping, 'xlsx', headerRowIndex);
  }, [activeSheet, mapping, headerRowIndex]);

  const detectedSectionSummary = useMemo(() => {
    if (!mapping || !analysis) return [];
    return MAPPING_FIELDS.filter((f) => mapping[f.key] >= 0).map((f) => ({
      key: f.key,
      label: f.label,
      headerName: headers[mapping[f.key]] || `Колонка ${mapping[f.key] + 1}`,
      reason: analysis.reasons[f.key],
      sample: analysis.samples[f.key],
    }));
  }, [mapping, analysis, headers]);

  if (!open) return null;

  const handleFile = async (file: File) => {
    setErrorMsg(null);
    setIsParsing(true);
    try {
      const parsed = await parseExcelFile(file);
      setWorkbook(parsed);
      setSelectedSheetIndex(0);
      setShowColumnMapper(false);
    } catch (err: any) {
      setErrorMsg(
        err?.message ||
          'Не удалось прочитать файл. Убедитесь, что это корректный документ .xlsx, .xls или .csv.'
      );
      setWorkbook(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleConfirmImport = () => {
    if (parsedResult.diamonds.length === 0 || !workbook) return;
    onImport(parsedResult.diamonds, replaceCatalog, workbook.fileName);
    setWorkbook(null);
    onClose();
  };

  const resetState = () => {
    setWorkbook(null);
    setErrorMsg(null);
    setShowColumnMapper(false);
  };

  const maxHeaderRowOptions = activeSheet ? Math.min(activeSheet.rows.length - 1, 14) : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4 md:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Импорт бриллиантов из файла Excel (.xlsx)"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white border border-[#E4E6EB] rounded-xl max-w-4xl w-full overflow-hidden shadow-2xl my-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-[#E4E6EB]">
          <div className="flex items-center gap-3 min-w-0">
            <FileSpreadsheet className="w-6 h-6 text-[#1B365D] shrink-0" />
            <div>
              <h2 className="text-2xl font-semibold text-[#111317]">
                Импорт каталога камней из .xlsx
              </h2>
              <p className="text-xs text-[#5A606D]">
                Автоматический анализ строки заголовков, типов данных и разделов файла
                (.xlsx, .xls, .csv)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть окно импорта"
            className="w-10 h-10 rounded-lg border border-[#E4E6EB] flex items-center justify-center text-[#5A606D] hover:text-[#111317] hover:bg-[#F7F8FA] transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3.5 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#991B1B] flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {!workbook ? (
            <div className="space-y-4">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                  isDragging
                    ? 'border-[#1B365D] bg-[#F4F7FB]'
                    : 'border-[#D5D9E0] bg-[#FAFAFA] hover:border-[#1B365D]'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Upload className="w-9 h-9 text-[#1B365D] mx-auto mb-3" />
                <div className="text-sm font-semibold text-[#111317]">
                  {isParsing
                    ? 'Изучение структуры и заголовков файла...'
                    : 'Перетащите файл .xlsx сюда или нажмите для выбора'}
                </div>
                <p className="text-xs text-[#5A606D] mt-1.5 max-w-md mx-auto">
                  Система изучит заголовки и значения столбцов (даже если перед таблицей
                  есть шапка прайс-листа) и подберёт нужные разделы.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-[#FAFAFA] border border-[#E4E6EB] rounded-lg">
                <div className="text-xs text-[#5A606D]">
                  Нужен готовый пример структуры таблицы? Скачайте шаблон с примерами
                  характеристик.
                </div>
                <button
                  type="button"
                  onClick={downloadSampleXlsx}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-[#D5D9E0] bg-white text-[#111317] hover:bg-[#F7F8FA] transition-colors whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5 text-[#1B365D]" />
                  Скачать шаблон .xlsx
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Loaded Workbook Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-[#FAFAFA] border border-[#E4E6EB] rounded-lg">
                <div className="space-y-0.5">
                  <div className="text-xs text-[#5A606D]">Загруженный файл</div>
                  <div className="text-sm font-semibold text-[#111317] font-mono">
                    {workbook.fileName}
                  </div>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  {workbook.sheets.length > 1 && (
                    <select
                      value={selectedSheetIndex}
                      onChange={(e) => setSelectedSheetIndex(Number(e.target.value))}
                      aria-label="Выбор листа Excel"
                      className="px-3 py-1.5 text-xs bg-white border border-[#D5D9E0] rounded-lg"
                    >
                      {workbook.sheets.map((s, idx) => (
                        <option key={s.name} value={idx}>
                          Лист: {s.name} ({s.rows.length} строк)
                        </option>
                      ))}
                    </select>
                  )}

                  {maxHeaderRowOptions > 0 && (
                    <select
                      value={headerRowIndex}
                      onChange={(e) => setHeaderRowIndex(Number(e.target.value))}
                      aria-label="Выбор строки заголовков"
                      className="px-3 py-1.5 text-xs bg-white border border-[#D5D9E0] rounded-lg"
                    >
                      {Array.from({ length: maxHeaderRowOptions + 1 }, (_, r) => (
                        <option key={r} value={r}>
                          Заголовки: строка {r + 1}
                        </option>
                      ))}
                    </select>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowColumnMapper((v) => !v)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                      showColumnMapper
                        ? 'bg-[#1B365D] border-[#1B365D] text-white'
                        : 'bg-white border-[#D5D9E0] text-[#111317] hover:bg-[#F7F8FA]'
                    }`}
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                    Настроить разделы ({detectedSectionSummary.length})
                  </button>

                  <button
                    type="button"
                    onClick={resetState}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[#D5D9E0] bg-white text-[#5A606D] hover:text-[#111317] transition-colors whitespace-nowrap"
                  >
                    Другой файл
                  </button>
                </div>
              </div>

              {/* Analyzed Headers & Detected Sections Summary */}
              {detectedSectionSummary.length > 0 && (
                <div className="p-4 bg-[#FAFAFA] border border-[#E4E6EB] rounded-lg space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-[#111317]">
                      Определённые разделы по заголовкам (строка {headerRowIndex + 1})
                    </span>
                    <span className="text-[#5A606D]">
                      Всего колонок в файле: {headers.length}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
                    {detectedSectionSummary.map((item) => (
                      <div
                        key={item.key}
                        className="flex items-baseline justify-between gap-2 py-1 border-b border-[#E4E6EB]/70"
                      >
                        <span className="text-[#5A606D] truncate">{item.label}</span>
                        <span className="font-mono text-[#111317] font-medium truncate max-w-[150px]">
                          {item.headerName}
                          {item.reason === 'content' ? ' (по данным)' : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Manual Column Mapping Override */}
              {showColumnMapper && mapping && (
                <div className="p-4 bg-[#FAFAFA] border border-[#E4E6EB] rounded-lg space-y-3">
                  <div className="text-xs font-semibold text-[#111317]">
                    Ручная корректировка соответствия разделов
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {MAPPING_FIELDS.map((field) => (
                      <div key={field.key}>
                        <label className="block text-xs text-[#5A606D] mb-1">
                          {field.label}
                          {field.required ? ' *' : ''}
                        </label>
                        <select
                          value={mapping[field.key]}
                          onChange={(e) =>
                            setMapping((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    [field.key]: Number(e.target.value),
                                  }
                                : prev
                            )
                          }
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#D5D9E0] rounded-md"
                        >
                          <option value={-1}>— Не использовать —</option>
                          {headers.map((h, colIdx) => (
                            <option key={`${colIdx}-${h}`} value={colIdx}>
                              {h || `Колонка ${colIdx + 1}`}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Summary & Mode */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-[#0F5132]" />
                  <span className="font-semibold text-[#111317]">
                    Готово к импорту камней: {parsedResult.diamonds.length}
                  </span>
                  {parsedResult.skippedRows > 0 && (
                    <span className="text-xs text-[#5A606D]">
                      (пропущено строк без веса в каратах: {parsedResult.skippedRows})
                    </span>
                  )}
                </div>

                <label className="flex items-center gap-2 text-xs text-[#111317] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={replaceCatalog}
                    onChange={(e) => setReplaceCatalog(e.target.checked)}
                    className="accent-[#1B365D] w-4 h-4"
                  />
                  Заменить текущий каталог (вместо добавления)
                </label>
              </div>

              {/* Preview Table */}
              {parsedResult.diamonds.length === 0 ? (
                <div className="p-6 border border-[#E4E6EB] rounded-lg text-center text-xs text-[#5A606D]">
                  Не удалось распознать камни при выбранной строке заголовков.
                  Попробуйте выбрать другую строку заголовков выше или укажите столбцы
                  «Форма» и «Караты» вручную.
                </div>
              ) : (
                <div className="border border-[#E4E6EB] rounded-lg overflow-hidden">
                  <div className="overflow-x-auto max-h-64">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-[#FAFAFA] border-b border-[#E4E6EB] sticky top-0">
                        <tr className="text-[#5A606D]">
                          <th className="p-2.5 font-medium">SKU</th>
                          <th className="p-2.5 font-medium">Камень</th>
                          <th className="p-2.5 font-medium">Форма</th>
                          <th className="p-2.5 font-medium">Карат</th>
                          <th className="p-2.5 font-medium">Цвет</th>
                          <th className="p-2.5 font-medium">Чистота</th>
                          <th className="p-2.5 font-medium">Размеры (мм)</th>
                          <th className="p-2.5 font-medium">Сертификат</th>
                          <th className="p-2.5 font-medium text-right">Цена</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E4E6EB]">
                        {parsedResult.diamonds.slice(0, 12).map((d) => (
                          <tr key={d.id} className="hover:bg-[#FAFAFA]">
                            <td className="p-2.5 font-mono text-[#5A606D]">{d.sku}</td>
                            <td className="p-2.5 text-[#111317]">
                              {d.stoneType || 'Бриллиант'}
                            </td>
                            <td className="p-2.5 font-medium text-[#111317]">
                              {SHAPE_SHORT_RU[d.shape]}
                            </td>
                            <td className="p-2.5 font-mono tabular-nums">
                              {d.carat.toFixed(2)}
                            </td>
                            <td className="p-2.5 font-mono">{d.color}</td>
                            <td className="p-2.5 font-mono">{d.clarity}</td>
                            <td className="p-2.5 font-mono tabular-nums text-[#5A606D]">
                              {d.lengthMm.toFixed(2)}×{d.widthMm.toFixed(2)}×{d.depthMm.toFixed(2)}
                            </td>
                            <td className="p-2.5 font-mono">
                              {d.certLab} #{d.certNumber}
                            </td>
                            <td className="p-2.5 font-mono tabular-nums font-semibold text-right">
                              {formatStonePrice(d.priceUsd, d.currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {parsedResult.diamonds.length > 12 && (
                    <div className="px-3 py-2 bg-[#FAFAFA] border-t border-[#E4E6EB] text-xs text-[#5A606D]">
                      Показаны первые 12 из {parsedResult.diamonds.length} камней
                    </div>
                  )}
                </div>
              )}

              {/* Footer Import CTA */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium rounded-lg border border-[#D5D9E0] bg-white text-[#111317] hover:bg-[#F7F8FA] transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={parsedResult.diamonds.length === 0}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-medium rounded-lg bg-[#1B365D] text-white hover:bg-[#142947] disabled:opacity-50 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {replaceCatalog
                    ? `Заменить каталог (${parsedResult.diamonds.length} камней)`
                    : `Добавить в каталог (${parsedResult.diamonds.length} камней)`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
