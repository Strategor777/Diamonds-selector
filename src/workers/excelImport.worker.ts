import {
  ColumnAnalysisMeta,
  ColumnMapping,
  MapRowsOptions,
  analyzeColumns,
  detectHeaderRowIndex,
  mapRowsToDiamonds,
} from '../lib/diamondMapper';
import { ParsedExcelWorkbook, parseExcelBuffer } from '../lib/excelImport';
import { Diamond } from '../types/diamond';

export interface SheetSummary {
  name: string;
  rowCount: number;
}

export type WorkerInboundMessage =
  | {
      type: 'parse';
      buffer: ArrayBuffer;
      fileName: string;
    }
  | {
      type: 'preview';
      sheetIndex: number;
      headerRowIndex: number;
      mapping: ColumnMapping;
      options?: MapRowsOptions;
    }
  | {
      type: 'analyze';
      sheetIndex: number;
      headerRowIndex?: number;
    }
  | {
      type: 'mapAll';
      sheetIndex: number;
      headerRowIndex: number;
      mapping: ColumnMapping;
      options?: MapRowsOptions;
    };

export type WorkerOutboundMessage =
  | {
      type: 'ready';
    }
  | {
      type: 'parsed';
      fileName: string;
      sheets: SheetSummary[];
      sheetIndex: number;
      headerRowIndex: number;
      headers: string[];
      analysis: ColumnAnalysisMeta;
      totalDataRows: number;
    }
  | {
      type: 'analyzed';
      sheetIndex: number;
      headerRowIndex: number;
      headers: string[];
      analysis: ColumnAnalysisMeta;
      totalDataRows: number;
    }
  | {
      type: 'previewReady';
      previewDiamonds: Diamond[];
      estimatedValidCount: number;
      estimatedSkippedCount: number;
      totalDataRows: number;
    }
  | {
      type: 'progress';
      processed: number;
      total: number;
    }
  | {
      type: 'mappedAll';
      diamonds: Diamond[];
      skippedRows: number;
    }
  | {
      type: 'error';
      message: string;
    };

let cachedWorkbook: ParsedExcelWorkbook | null = null;

function getSheet(sheetIndex: number) {
  if (!cachedWorkbook) {
    throw new Error('Файл не загружен в обработчик.');
  }
  const sheet = cachedWorkbook.sheets[sheetIndex] || cachedWorkbook.sheets[0];
  if (!sheet) {
    throw new Error('Выбранный лист не найден.');
  }
  return sheet;
}

self.onmessage = async (event: MessageEvent<WorkerInboundMessage>) => {
  const msg = event.data;

  try {
    if (msg.type === 'parse') {
      cachedWorkbook = await parseExcelBuffer(msg.buffer, msg.fileName);
      const sheet = cachedWorkbook.sheets[0];
      const headerRowIndex = detectHeaderRowIndex(sheet.rows);
      const analysis = analyzeColumns(sheet.rows, headerRowIndex);
      const headers = sheet.rows[headerRowIndex] || [];
      const response: WorkerOutboundMessage = {
        type: 'parsed',
        fileName: cachedWorkbook.fileName,
        sheets: cachedWorkbook.sheets.map((s) => ({
          name: s.name,
          rowCount: s.rows.length,
        })),
        sheetIndex: 0,
        headerRowIndex,
        headers,
        analysis,
        totalDataRows: Math.max(0, sheet.rows.length - headerRowIndex - 1),
      };
      self.postMessage(response);
      return;
    }

    if (msg.type === 'analyze') {
      const sheet = getSheet(msg.sheetIndex);
      const headerRowIndex =
        typeof msg.headerRowIndex === 'number'
          ? msg.headerRowIndex
          : detectHeaderRowIndex(sheet.rows);
      const analysis = analyzeColumns(sheet.rows, headerRowIndex);
      const headers = sheet.rows[headerRowIndex] || [];
      const response: WorkerOutboundMessage = {
        type: 'analyzed',
        sheetIndex: msg.sheetIndex,
        headerRowIndex,
        headers,
        analysis,
        totalDataRows: Math.max(0, sheet.rows.length - headerRowIndex - 1),
      };
      self.postMessage(response);
      return;
    }

    if (msg.type === 'preview') {
      const sheet = getSheet(msg.sheetIndex);
      const totalDataRows = Math.max(0, sheet.rows.length - msg.headerRowIndex - 1);
      // Sample only the first 120 data rows for instantaneous preview even on 50,000-row files
      const sampleEnd = Math.min(sheet.rows.length, msg.headerRowIndex + 1 + 120);
      const sampleRows = sheet.rows.slice(0, sampleEnd);
      const sampleResult = mapRowsToDiamonds(
        sampleRows,
        msg.mapping,
        'xlsx',
        msg.headerRowIndex,
        msg.options
      );

      const sampledCount = Math.max(1, sampleEnd - msg.headerRowIndex - 1);
      const validRatio = sampleResult.diamonds.length / sampledCount;
      const estimatedValidCount =
        totalDataRows <= 120
          ? sampleResult.diamonds.length
          : Math.round(totalDataRows * validRatio);
      const estimatedSkippedCount =
        totalDataRows <= 120
          ? sampleResult.skippedRows
          : Math.max(0, totalDataRows - estimatedValidCount);

      const response: WorkerOutboundMessage = {
        type: 'previewReady',
        previewDiamonds: sampleResult.diamonds.slice(0, 15),
        estimatedValidCount,
        estimatedSkippedCount,
        totalDataRows,
      };
      self.postMessage(response);
      return;
    }

    if (msg.type === 'mapAll') {
      const sheet = getSheet(msg.sheetIndex);
      const totalDataRows = Math.max(0, sheet.rows.length - msg.headerRowIndex - 1);
      const headerRow = sheet.rows[msg.headerRowIndex] || [];

      const CHUNK_SIZE = 5000;
      const allDiamonds: Diamond[] = [];
      let totalSkipped = 0;

      for (let start = msg.headerRowIndex + 1; start < sheet.rows.length; start += CHUNK_SIZE) {
        const end = Math.min(sheet.rows.length, start + CHUNK_SIZE);
        const chunkRows = [headerRow, ...sheet.rows.slice(start, end)];
        const chunkRes = mapRowsToDiamonds(
          chunkRows,
          msg.mapping,
          'xlsx',
          0,
          msg.options
        );
        for (let j = 0; j < chunkRes.diamonds.length; j++) {
          const item = chunkRes.diamonds[j];
          item.id = `xlsx-${start + j}-${item.sku}`;
          allDiamonds.push(item);
        }
        totalSkipped += chunkRes.skippedRows;

        const progressMsg: WorkerOutboundMessage = {
          type: 'progress',
          processed: Math.min(totalDataRows, end - msg.headerRowIndex - 1),
          total: totalDataRows,
        };
        self.postMessage(progressMsg);
      }

      const response: WorkerOutboundMessage = {
        type: 'mappedAll',
        diamonds: allDiamonds,
        skippedRows: totalSkipped,
      };
      self.postMessage(response);
    }
  } catch (err: any) {
    const errorMsg: WorkerOutboundMessage = {
      type: 'error',
      message: err?.message || 'Ошибка обработки файла Excel.',
    };
    self.postMessage(errorMsg);
  }
};

const readyMsg: WorkerOutboundMessage = { type: 'ready' };
self.postMessage(readyMsg);
