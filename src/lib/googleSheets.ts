import {
  analyzeColumns,
  detectHeaderRowIndex,
  mapRowsToDiamonds,
} from './diamondMapper';
import {
  Diamond,
  PriceDropNotification,
} from '../types/diamond';

export interface SheetTabInfo {
  sheetId: number;
  title: string;
  rowCount: number;
  columnCount: number;
}

export interface SpreadsheetMeta {
  spreadsheetId: string;
  title: string;
  sheets: SheetTabInfo[];
}

export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return trimmed;
}

async function parseGoogleError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (data?.error?.message) {
      return data.error.message;
    }
  } catch {
    // ignore json parse failure
  }
  return `HTTP ${res.status}`;
}

export async function fetchSpreadsheetMeta(
  accessToken: string,
  rawIdOrUrl: string
): Promise<SpreadsheetMeta> {
  const spreadsheetId = extractSpreadsheetId(rawIdOrUrl);
  if (!spreadsheetId) {
    throw new Error('Укажите ссылку или ID таблицы Google Sheets.');
  }

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}?fields=spreadsheetId,properties.title,sheets.properties`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    const msg = await parseGoogleError(res);
    throw new Error(`Не удалось загрузить таблицу: ${msg}`);
  }

  const data = await res.json();
  const sheets: SheetTabInfo[] = (data.sheets || []).map((s: any) => ({
    sheetId: s.properties?.sheetId ?? 0,
    title: s.properties?.title ?? 'Лист',
    rowCount: s.properties?.gridProperties?.rowCount ?? 1000,
    columnCount: s.properties?.gridProperties?.columnCount ?? 26,
  }));

  return {
    spreadsheetId: data.spreadsheetId || spreadsheetId,
    title: data.properties?.title || 'Google Таблица',
    sheets,
  };
}

export async function readDiamondsFromSheet(
  accessToken: string,
  spreadsheetId: string,
  sheetTitle: string
): Promise<{ diamonds: Diamond[]; rawRowCount: number }> {
  const encodedRange = encodeURIComponent(`'${sheetTitle.replace(/'/g, "''")}'!A1:Z500`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodedRange}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    const msg = await parseGoogleError(res);
    throw new Error(`Ошибка чтения листа «${sheetTitle}»: ${msg}`);
  }

  const data = await res.json();
  const rows: string[][] = data.values || [];
  if (rows.length < 2) {
    return { diamonds: [], rawRowCount: rows.length };
  }

  const headerRowIdx = detectHeaderRowIndex(rows);
  const { mapping } = analyzeColumns(rows, headerRowIdx);
  const { diamonds } = mapRowsToDiamonds(rows, mapping, 'sheets', headerRowIdx);

  return { diamonds, rawRowCount: Math.max(0, rows.length - headerRowIdx - 1) };
}

export function diamondsToSheetRows(diamonds: Diamond[]): string[][] {
  const header = [
    'SKU',
    'Stone_Type',
    'Shape',
    'Carat',
    'Color',
    'Color_Family',
    'Clarity',
    'Cut',
    'Price',
    'Currency',
    'Previous_Price',
    'Cert_Lab',
    'Cert_Number',
    'Cert_URL',
    'Length_mm',
    'Width_mm',
    'Depth_mm',
    'Depth_%',
    'Table_%',
    'Origin',
  ];
  const body = diamonds.map((d) => [
    d.sku,
    d.stoneType || 'Бриллиант',
    d.shape,
    d.carat.toFixed(2),
    d.color,
    d.colorFamily || '',
    d.clarity,
    d.cut,
    String(d.priceUsd),
    d.currency || 'USD',
    d.previousPriceUsd ? String(d.previousPriceUsd) : '',
    d.certLab,
    d.certNumber,
    d.certUrl,
    d.lengthMm.toFixed(2),
    d.widthMm.toFixed(2),
    d.depthMm.toFixed(2),
    d.depthPercent.toFixed(1),
    d.tablePercent.toFixed(1),
    d.origin,
  ]);
  return [header, ...body];
}

export function alertsToSheetRows(
  notifications: PriceDropNotification[]
): string[][] {
  const header = [
    'Timestamp',
    'SKU',
    'Shape',
    'Carat',
    'Color',
    'Clarity',
    'Old_Price_USD',
    'New_Price_USD',
    'Drop_%',
  ];
  const body = notifications.map((n) => [
    n.timestamp,
    n.sku,
    n.shape,
    n.carat.toFixed(2),
    n.color,
    n.clarity,
    String(n.oldPriceUsd),
    String(n.newPriceUsd),
    `${n.dropPercent}%`,
  ]);
  return [header, ...body];
}

export async function createDiamondSpreadsheet(
  accessToken: string,
  title: string,
  sheetTitle: string,
  rows: string[][]
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [{ properties: { title: sheetTitle } }],
    }),
  });

  if (!createRes.ok) {
    const msg = await parseGoogleError(createRes);
    throw new Error(`Не удалось создать таблицу: ${msg}`);
  }

  const created = await createRes.json();
  const spreadsheetId: string = created.spreadsheetId;
  const spreadsheetUrl: string = created.spreadsheetUrl;

  await updateSheetValues(accessToken, spreadsheetId, sheetTitle, rows);

  return { spreadsheetId, spreadsheetUrl };
}

export async function updateSheetValues(
  accessToken: string,
  spreadsheetId: string,
  sheetTitle: string,
  rows: string[][]
): Promise<void> {
  const range = `'${sheetTitle.replace(/'/g, "''")}'!A1`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: rows }),
    }
  );

  if (!res.ok) {
    const msg = await parseGoogleError(res);
    throw new Error(`Ошибка записи данных в Google Sheets: ${msg}`);
  }
}
