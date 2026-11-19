import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
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
  parseExcelBuffer,
} from '../lib/excelImport';
import { Diamond, PricingConfig } from '../types/diamond';
import type {
  SheetSummary,
  WorkerInboundMessage,
  WorkerOutboundMessage,
} from '../workers/excelImport.worker';

interface ExcelImportModalProps {
  open: boolean;
  defaultTargetDirectory?: 'white' | 'fancy';
  pricingConfig: PricingConfig;
  onClose: () => void;
  onImport: (
    diamonds: Diamond[],
    replaceExisting: boolean,
    fileName: string,
    targetDirectory: 'white' | 'fancy'
  ) => void;
}

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({
  open,
  defaultTargetDirectory = 'white',
  pricingConfig,
  onClose,
  onImport,
}) => {
  const fileInputId = useId();
  const workerRef = useRef<Worker | null>(null);
  const workerHealthyRef = useRef<boolean>(false);
  const pendingFileRef = useRef<File | null>(null);
  const fallbackWorkbookRef = useRef<ParsedExcelWorkbook | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isMappingAll, setIsMappingAll] = useState(false);
  const [mapProgress, setMapProgress] = useState<{ processed: number; total: number } | null>(
    null
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [sheets, setSheets] = useState<SheetSummary[]>([]);
  const [selectedSheetIndex, setSelectedSheetIndex] = useState(0);
  const [headerRowIndex, setHeaderRowIndex] = useState(0);
  const [headers, setHeaders] = useState<string[]>([]);
  const [totalDataRows, setTotalDataRows] = useState(0);
  const [analysis, setAnalysis] = useState<ColumnAnalysisMeta | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);

  const [previewDiamonds, setPreviewDiamonds] = useState<Diamond[]>([]);
  const [estimatedValidCount, setEstimatedValidCount] = useState(0);
  const [estimatedSkippedCount, setEstimatedSkippedCount] = useState(0);

  const [showColumnMapper, setShowColumnMapper] = useState(false);
  const [replaceCatalog, setReplaceCatalog] = useState(false);
  const [targetDirectory, setTargetDirectory] = useState<'white' | 'fancy'>(
    defaultTargetDirectory
  );

  // Refs to read latest values inside worker callbacks cleanly
  const latestImportParamsRef = useRef({
    replaceCatalog,
    fileName,
    targetDirectory,
    onImport,
    onClose,
  });
  latestImportParamsRef.current = {
    replaceCatalog,
    fileName,
    targetDirectory,
    onImport,
    onClose,
  };

  useEffect(() => {
    if (open) {
      setTargetDirectory(defaultTargetDirectory);
    }
  }, [open, defaultTargetDirectory]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isMappingAll) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose, isMappingAll]);

  // Main-thread fallback parser (used automatically if Web Worker is blocked or fails)
  const parseOnMainThread = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const workbook = await parseExcelBuffer(buffer, file.name);
      fallbackWorkbookRef.current = workbook;
      const sheet = workbook.sheets[0];
      const detectedHeader = detectHeaderRowIndex(sheet.rows);
      const detectedAnalysis = analyzeColumns(sheet.rows, detectedHeader);
      const detectedHeaders = sheet.rows[detectedHeader] || [];

      setFileName(workbook.fileName);
      setSheets(workbook.sheets.map((s) => ({ name: s.name, rowCount: s.rows.length })));
      setSelectedSheetIndex(0);
      setHeaderRowIndex(detectedHeader);
      setHeaders(detectedHeaders);
      setAnalysis(detectedAnalysis);
      setMapping(detectedAnalysis.mapping);
      setTotalDataRows(Math.max(0, sheet.rows.length - detectedHeader - 1));
      setShowColumnMapper(
        detectedAnalysis.mapping.carat < 0 || detectedAnalysis.mapping.shape < 0
      );
      setIsParsing(false);
    } catch (err: any) {
      setIsParsing(false);
      setErrorMsg(
        err?.message ||
          'Не удалось прочитать файл. Убедитесь, что это корректный документ .xlsx, .xls или .csv.'
      );
    }
  };

  // Spin up dedicated Web Worker only while modal is open (with seamless fallback)
  useEffect(() => {
    if (!open) return;
    if (typeof Worker === 'undefined') {
      workerHealthyRef.current = false;
      return;
    }

    let worker: Worker | null = null;
    try {
      worker = new Worker(
        new URL('../workers/excelImport.worker.ts', import.meta.url),
        { type: 'module' }
      );
      workerRef.current = worker;
      workerHealthyRef.current = false;
    } catch {
      workerRef.current = null;
      workerHealthyRef.current = false;
      return;
    }

    worker.onmessage = (event: MessageEvent<WorkerOutboundMessage>) => {
      const msg = event.data;
      if (msg.type === 'ready') {
        workerHealthyRef.current = true;
        return;
      }
      if (msg.type === 'parsed') {
        pendingFileRef.current = null;
        fallbackWorkbookRef.current = null;
        setFileName(msg.fileName);
        setSheets(msg.sheets);
        setSelectedSheetIndex(msg.sheetIndex);
        setHeaderRowIndex(msg.headerRowIndex);
        setHeaders(msg.headers);
        setAnalysis(msg.analysis);
        setMapping(msg.analysis.mapping);
        setTotalDataRows(msg.totalDataRows);
        setIsParsing(false);
        setShowColumnMapper(
          msg.analysis.mapping.carat < 0 || msg.analysis.mapping.shape < 0
        );
      } else if (msg.type === 'analyzed') {
        setSelectedSheetIndex(msg.sheetIndex);
        setHeaderRowIndex(msg.headerRowIndex);
        setHeaders(msg.headers);
        setAnalysis(msg.analysis);
        setMapping(msg.analysis.mapping);
        setTotalDataRows(msg.totalDataRows);
        if (msg.analysis.mapping.carat < 0 || msg.analysis.mapping.shape < 0) {
          setShowColumnMapper(true);
        }
      } else if (msg.type === 'previewReady') {
        setPreviewDiamonds(msg.previewDiamonds);
        setEstimatedValidCount(msg.estimatedValidCount);
        setEstimatedSkippedCount(msg.estimatedSkippedCount);
        setTotalDataRows(msg.totalDataRows);
      } else if (msg.type === 'progress') {
        setMapProgress({ processed: msg.processed, total: msg.total });
      } else if (msg.type === 'mappedAll') {
        setIsMappingAll(false);
        setMapProgress(null);
        const latest = latestImportParamsRef.current;
        if (msg.diamonds.length > 0 && latest.fileName) {
          latest.onImport(
            msg.diamonds,
            latest.replaceCatalog,
            latest.fileName,
            latest.targetDirectory
          );
          setFileName(null);
          setSheets([]);
          setPreviewDiamonds([]);
          latest.onClose();
        } else {
          setErrorMsg('Не найдено валидных строк с весом в каратах для импорта.');
        }
      } else if (msg.type === 'error') {
        pendingFileRef.current = null;
        setIsParsing(false);
        setIsMappingAll(false);
        setMapProgress(null);
        setErrorMsg(msg.message);
      }
    };

    worker.onerror = () => {
      // Automatically switch to main-thread chunked mode without failing the user
      workerHealthyRef.current = false;
      workerRef.current = null;
      worker?.terminate();
      const pending = pendingFileRef.current;
      if (pending) {
        pendingFileRef.current = null;
        void parseOnMainThread(pending);
      } else {
        setIsParsing(false);
        setIsMappingAll(false);
        setMapProgress(null);
      }
    };

    return () => {
      worker?.terminate();
      workerRef.current = null;
      workerHealthyRef.current = false;
    };
  }, [open]);

  // Compute instant lightweight preview (first 120 rows) via worker or main-thread fallback
  useEffect(() => {
    if (!fileName || !mapping) return;
    const mapOptions = {
      defaultDirectory: targetDirectory,
      defaultStoneType:
        targetDirectory === 'fancy' ? 'Цветной бриллиант' : undefined,
      pricingConfig,
    };

    if (workerRef.current && workerHealthyRef.current && !fallbackWorkbookRef.current) {
      const msg: WorkerInboundMessage = {
        type: 'preview',
        sheetIndex: selectedSheetIndex,
        headerRowIndex,
        mapping,
        options: mapOptions,
      };
      workerRef.current.postMessage(msg);
      return;
    }

    const wb = fallbackWorkbookRef.current;
    if (!wb) return;
    const sheet = wb.sheets[selectedSheetIndex] || wb.sheets[0];
    if (!sheet) return;
    const dataCount = Math.max(0, sheet.rows.length - headerRowIndex - 1);
    const sampleEnd = Math.min(sheet.rows.length, headerRowIndex + 1 + 120);
    const sampleRows = sheet.rows.slice(0, sampleEnd);
    const sampleResult = mapRowsToDiamonds(
      sampleRows,
      mapping,
      'xlsx',
      headerRowIndex,
      mapOptions
    );
    const sampledCount = Math.max(1, sampleEnd - headerRowIndex - 1);
    const validRatio = sampleResult.diamonds.length / sampledCount;
    const estValid =
      dataCount <= 120
        ? sampleResult.diamonds.length
        : Math.round(dataCount * validRatio);
    const estSkipped =
      dataCount <= 120
        ? sampleResult.skippedRows
        : Math.max(0, dataCount - estValid);

    setPreviewDiamonds(sampleResult.diamonds.slice(0, 15));
    setEstimatedValidCount(estValid);
    setEstimatedSkippedCount(estSkipped);
    setTotalDataRows(dataCount);
  }, [fileName, selectedSheetIndex, headerRowIndex, mapping, targetDirectory, pricingConfig]);

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
    setPreviewDiamonds([]);
    fallbackWorkbookRef.current = null;

    if (workerRef.current && workerHealthyRef.current) {
      pendingFileRef.current = file;
      try {
        const buffer = await file.arrayBuffer();
        const msg: WorkerInboundMessage = {
          type: 'parse',
          buffer,
          fileName: file.name,
        };
        workerRef.current.postMessage(msg, [buffer]);
        return;
      } catch {
        pendingFileRef.current = null;
        workerHealthyRef.current = false;
      }
    }

    await parseOnMainThread(file);
  };

  const handleSheetChange = (nextIdx: number) => {
    setSelectedSheetIndex(nextIdx);
    if (workerRef.current && workerHealthyRef.current && !fallbackWorkbookRef.current) {
      const msg: WorkerInboundMessage = {
        type: 'analyze',
        sheetIndex: nextIdx,
      };
      workerRef.current.postMessage(msg);
      return;
    }
    const wb = fallbackWorkbookRef.current;
    if (!wb) return;
    const sheet = wb.sheets[nextIdx] || wb.sheets[0];
    if (!sheet) return;
    const detectedHeader = detectHeaderRowIndex(sheet.rows);
    const detectedAnalysis = analyzeColumns(sheet.rows, detectedHeader);
    setHeaderRowIndex(detectedHeader);
    setHeaders(sheet.rows[detectedHeader] || []);
    setAnalysis(detectedAnalysis);
    setMapping(detectedAnalysis.mapping);
    setTotalDataRows(Math.max(0, sheet.rows.length - detectedHeader - 1));
  };

  const handleHeaderRowChange = (nextRow: number) => {
    setHeaderRowIndex(nextRow);
    if (workerRef.current && workerHealthyRef.current && !fallbackWorkbookRef.current) {
      const msg: WorkerInboundMessage = {
        type: 'analyze',
        sheetIndex: selectedSheetIndex,
        headerRowIndex: nextRow,
      };
      workerRef.current.postMessage(msg);
      return;
    }
    const wb = fallbackWorkbookRef.current;
    if (!wb) return;
    const sheet = wb.sheets[selectedSheetIndex] || wb.sheets[0];
    if (!sheet) return;
    const detectedAnalysis = analyzeColumns(sheet.rows, nextRow);
    setHeaders(sheet.rows[nextRow] || []);
    setAnalysis(detectedAnalysis);
    setMapping(detectedAnalysis.mapping);
    setTotalDataRows(Math.max(0, sheet.rows.length - nextRow - 1));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void handleFile(file);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void handleFile(file);
    }
  };

  const handleConfirmImport = async () => {
    if (!mapping || !fileName || estimatedValidCount === 0) return;
    setErrorMsg(null);
    setIsMappingAll(true);
    setMapProgress({ processed: 0, total: totalDataRows });

    const mapOptions = {
      defaultDirectory: targetDirectory,
      defaultStoneType:
        targetDirectory === 'fancy' ? 'Цветной бриллиант' : undefined,
      pricingConfig,
    };

    if (workerRef.current && workerHealthyRef.current && !fallbackWorkbookRef.current) {
      const msg: WorkerInboundMessage = {
        type: 'mapAll',
        sheetIndex: selectedSheetIndex,
        headerRowIndex,
        mapping,
        options: mapOptions,
      };
      workerRef.current.postMessage(msg);
      return;
    }

    // Chunked async main-thread fallback (yields between batches so UI stays responsive)
    const wb = fallbackWorkbookRef.current;
    if (!wb) {
      setIsMappingAll(false);
      setErrorMsg('Файл не загружен. Выберите файл заново.');
      return;
    }
    const sheet = wb.sheets[selectedSheetIndex] || wb.sheets[0];
    if (!sheet) {
      setIsMappingAll(false);
      return;
    }

    const headerRow = sheet.rows[headerRowIndex] || [];
    const CHUNK_SIZE = 2500;
    const allDiamonds: Diamond[] = [];

    for (let start = headerRowIndex + 1; start < sheet.rows.length; start += CHUNK_SIZE) {
      const end = Math.min(sheet.rows.length, start + CHUNK_SIZE);
      const chunkRows = [headerRow, ...sheet.rows.slice(start, end)];
      const chunkRes = mapRowsToDiamonds(chunkRows, mapping, 'xlsx', 0, mapOptions);
      for (let j = 0; j < chunkRes.diamonds.length; j++) {
        const item = chunkRes.diamonds[j];
        item.id = `xlsx-${start + j}-${item.sku}`;
        allDiamonds.push(item);
      }
      setMapProgress({
        processed: Math.min(totalDataRows, end - headerRowIndex - 1),
        total: totalDataRows,
      });
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }

    setIsMappingAll(false);
    setMapProgress(null);

    if (allDiamonds.length > 0) {
      onImport(allDiamonds, replaceCatalog, fileName, targetDirectory);
      setFileName(null);
      setSheets([]);
      setPreviewDiamonds([]);
      fallbackWorkbookRef.current = null;
      onClose();
    } else {
      setErrorMsg('Не найдено валидных строк с весом в каратах для импорта.');
    }
  };

  const resetState = () => {
    setFileName(null);
    setSheets([]);
    setPreviewDiamonds([]);
    setEstimatedValidCount(0);
    setEstimatedSkippedCount(0);
    setErrorMsg(null);
    setShowColumnMapper(false);
    fallbackWorkbookRef.current = null;
    pendingFileRef.current = null;
  };

  const activeSheetRowCount = sheets[selectedSheetIndex]?.rowCount || 0;
  const maxHeaderRowOptions = Math.min(Math.max(0, activeSheetRowCount - 1), 14);
  const progressPct =
    mapProgress && mapProgress.total > 0
      ? Math.min(100, Math.round((mapProgress.processed / mapProgress.total) * 100))
      : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4 md:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Импорт бриллиантов из файла Excel (.xlsx)"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isMappingAll) onClose();
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
                Поддержка больших прайс-листов (до 50 000+ строк) с автодедупликацией,
                сортировкой белых и цветных камней и анализом заголовков (.xlsx, .xls, .csv)
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isMappingAll}
            onClick={onClose}
            aria-label="Закрыть окно импорта"
            className="w-10 h-10 rounded-lg border border-[#E4E6EB] flex items-center justify-center text-[#5A606D] hover:text-[#111317] hover:bg-[#F7F8FA] disabled:opacity-40 transition-colors shrink-0"
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

          {!fileName ? (
            <div className="space-y-4">
              {/* Native <label> + sr-only <input type="file"> ensures reliable OS file dialog without bubbling recursion */}
              <input
                id={fileInputId}
                type="file"
                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                disabled={isParsing}
                onChange={handleFileChange}
                className="sr-only"
              />
              <label
                htmlFor={fileInputId}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`block border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
                  isParsing
                    ? 'border-[#1B365D] bg-[#F4F7FB] cursor-wait'
                    : isDragging
                      ? 'border-[#1B365D] bg-[#F4F7FB] cursor-pointer'
                      : 'border-[#D5D9E0] bg-[#FAFAFA] hover:border-[#1B365D] cursor-pointer'
                }`}
              >
                <Upload className="w-9 h-9 text-[#1B365D] mx-auto mb-3" />
                <div className="text-sm font-semibold text-[#111317]">
                  {isParsing
                    ? 'Чтение и анализ структуры файла...'
                    : 'Перетащите файл .xlsx сюда или нажмите для выбора'}
                </div>
                <p className="text-xs text-[#5A606D] mt-1.5 max-w-md mx-auto">
                  Поддерживаются файлы .xlsx, .xls и .csv объёмом до 50 000 строк. Камни с
                  цветом D–J автоматически направляются в белые бриллианты, цветные — в
                  директорию цветных.
                </p>
                {!isParsing && (
                  <span className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-[#1B365D] text-white">
                    <Upload className="w-3.5 h-3.5" />
                    Выбрать файл на устройстве
                  </span>
                )}
              </label>

              <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-[#FAFAFA] border border-[#E4E6EB] rounded-lg">
                <div className="text-xs text-[#5A606D]">
                  Нужен готовый пример структуры таблицы? Скачайте шаблон с примерами
                  характеристик.
                </div>
                <button
                  type="button"
                  onClick={() => void downloadSampleXlsx()}
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
                    {fileName}
                  </div>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  {sheets.length > 1 && (
                    <select
                      value={selectedSheetIndex}
                      onChange={(e) => handleSheetChange(Number(e.target.value))}
                      aria-label="Выбор листа Excel"
                      className="px-3 py-1.5 text-xs bg-white border border-[#D5D9E0] rounded-lg"
                    >
                      {sheets.map((s, idx) => (
                        <option key={s.name} value={idx}>
                          Лист: {s.name} ({s.rowCount.toLocaleString('ru-RU')} строк)
                        </option>
                      ))}
                    </select>
                  )}

                  {maxHeaderRowOptions > 0 && (
                    <select
                      value={headerRowIndex}
                      onChange={(e) => handleHeaderRowChange(Number(e.target.value))}
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
                    disabled={isMappingAll}
                    onClick={resetState}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[#D5D9E0] bg-white text-[#5A606D] hover:text-[#111317] disabled:opacity-40 transition-colors whitespace-nowrap"
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
                    <span className="text-[#5A606D] font-mono tabular-nums">
                      Колонок: {headers.length} · Строк данных:{' '}
                      {totalDataRows.toLocaleString('ru-RU')}
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

              {/* Target Directory Selector + Summary & Mode */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-[#FAFAFA] border border-[#E4E6EB] rounded-lg">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-xs font-medium text-[#5A606D]">
                    Целевая директория:
                  </span>
                  <div className="inline-flex items-center gap-1 p-0.5 bg-[#EAECEF] rounded-md">
                    <button
                      type="button"
                      onClick={() => setTargetDirectory('white')}
                      className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                        targetDirectory === 'white'
                          ? 'bg-white text-[#111317] shadow-sm'
                          : 'text-[#5A606D] hover:text-[#111317]'
                      }`}
                    >
                      Белые бриллианты
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetDirectory('fancy')}
                      className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                        targetDirectory === 'fancy'
                          ? 'bg-white text-[#111317] shadow-sm'
                          : 'text-[#5A606D] hover:text-[#111317]'
                      }`}
                    >
                      Цветные бриллианты
                    </button>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs text-[#111317] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={replaceCatalog}
                    onChange={(e) => setReplaceCatalog(e.target.checked)}
                    className="accent-[#1B365D] w-4 h-4"
                  />
                  {targetDirectory === 'fancy'
                    ? 'Заменить цветные бриллианты директории (вместо добавления)'
                    : 'Заменить текущий каталог (вместо добавления)'}
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-[#0F5132]" />
                  <span className="font-semibold text-[#111317] font-mono tabular-nums">
                    К импорту: {estimatedValidCount.toLocaleString('ru-RU')} камней
                  </span>
                  {estimatedSkippedCount > 0 && (
                    <span className="text-xs text-[#5A606D] font-mono tabular-nums">
                      (ориентировочно пропущено без каратности:{' '}
                      {estimatedSkippedCount.toLocaleString('ru-RU')})
                    </span>
                  )}
                </div>
              </div>

              {/* Chunked Progress Bar during 30k-50k Import */}
              {isMappingAll && mapProgress && (
                <div className="p-4 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-[#111317]">
                      Обработка и дедупликация строк ассортимента...
                    </span>
                    <span className="font-mono tabular-nums text-[#1B365D] font-semibold">
                      {mapProgress.processed.toLocaleString('ru-RU')} /{' '}
                      {mapProgress.total.toLocaleString('ru-RU')} ({progressPct}%)
                    </span>
                  </div>
                  <div className="h-2 bg-[#E2E8F0] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#1B365D] transition-all duration-150"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Preview Table */}
              {previewDiamonds.length === 0 ? (
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
                          <th className="p-2.5 font-medium text-right">Входная (файл)</th>
                          <th className="p-2.5 font-medium text-right">
                            Клиент (
                            {pricingConfig.applyOnImport
                              ? pricingConfig.mode === 'multiplier'
                                ? `×${pricingConfig.value.toFixed(2)}`
                                : `+${pricingConfig.value}%`
                              : 'без наценки'}
                            )
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E4E6EB]">
                        {previewDiamonds.slice(0, 12).map((d) => (
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
                            <td className="p-2.5 font-mono tabular-nums text-[#5A606D] text-right">
                              {formatStonePrice(d.costPriceUsd ?? d.priceUsd, d.currency)}
                            </td>
                            <td className="p-2.5 font-mono tabular-nums font-semibold text-[#111317] text-right">
                              {formatStonePrice(d.priceUsd, d.currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {estimatedValidCount > 12 && (
                    <div className="px-3 py-2 bg-[#FAFAFA] border-t border-[#E4E6EB] text-xs text-[#5A606D] font-mono tabular-nums">
                      Предпросмотр: первые 12 из ~{estimatedValidCount.toLocaleString('ru-RU')} камней
                    </div>
                  )}
                </div>
              )}

              {/* Footer Import CTA */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={isMappingAll}
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium rounded-lg border border-[#D5D9E0] bg-white text-[#111317] hover:bg-[#F7F8FA] disabled:opacity-40 transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmImport()}
                  disabled={estimatedValidCount === 0 || isMappingAll}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-medium rounded-lg bg-[#1B365D] text-white hover:bg-[#142947] disabled:opacity-50 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {isMappingAll
                    ? `Загрузка... ${progressPct}%`
                    : replaceCatalog
                      ? targetDirectory === 'fancy'
                        ? `Заменить директорию «Цветные бриллианты» (~${estimatedValidCount.toLocaleString('ru-RU')})`
                        : `Заменить каталог (~${estimatedValidCount.toLocaleString('ru-RU')})`
                      : targetDirectory === 'fancy'
                        ? `Добавить в «Цветные бриллианты» (~${estimatedValidCount.toLocaleString('ru-RU')})`
                        : `Добавить в каталог (~${estimatedValidCount.toLocaleString('ru-RU')})`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
