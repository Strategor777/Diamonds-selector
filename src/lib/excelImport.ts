import type * as XLSXType from 'xlsx';

export interface ParsedExcelSheet {
  name: string;
  rows: string[][];
}

export interface ParsedExcelWorkbook {
  fileName: string;
  sheets: ParsedExcelSheet[];
}

export function extractSheetRowsFast(
  XLSX: typeof XLSXType,
  worksheet: XLSXType.WorkSheet
): string[][] {
  const ref = worksheet['!ref'];
  if (!ref) return [];

  const range = XLSX.utils.decode_range(ref);
  const rawMatrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    raw: false,
    defval: '',
    blankrows: true,
  });

  // Fast sparse pass ONLY over worksheet keys to preserve embedded cell hyperlinks
  // (avoids calling encode_cell 1,000,000+ times on 50,000-row spreadsheets)
  const keys = Object.keys(worksheet);
  for (let k = 0; k < keys.length; k++) {
    const addr = keys[k];
    if (addr.charCodeAt(0) === 33) continue; // skip '!ref', '!merges', etc.
    const cell = worksheet[addr] as XLSXType.CellObject | undefined;
    const linkTarget = cell?.l?.Target ? String(cell.l.Target).trim() : '';
    if (
      linkTarget &&
      (linkTarget.startsWith('http://') || linkTarget.startsWith('https://'))
    ) {
      const decoded = XLSX.utils.decode_cell(addr);
      const rIdx = decoded.r - range.s.r;
      const cIdx = decoded.c - range.s.c;
      if (rIdx >= 0 && rIdx < rawMatrix.length && cIdx >= 0) {
        const row = rawMatrix[rIdx];
        if (row) {
          const currentVal = String(row[cIdx] ?? '').trim();
          if (!currentVal.startsWith('http')) {
            row[cIdx] = linkTarget;
          }
        }
      }
    }
  }

  const rows: string[][] = [];
  for (let r = 0; r < rawMatrix.length; r++) {
    const rawRow = rawMatrix[r];
    if (!rawRow || rawRow.length === 0) continue;
    let hasContent = false;
    const cleaned = new Array<string>(rawRow.length);
    for (let c = 0; c < rawRow.length; c++) {
      const val = rawRow[c] !== undefined && rawRow[c] !== null
        ? String(rawRow[c]).trim()
        : '';
      if (val !== '') hasContent = true;
      cleaned[c] = val;
    }
    if (hasContent) {
      rows.push(cleaned);
    }
  }

  return rows;
}

async function loadXlsx(): Promise<typeof XLSXType> {
  const mod = (await import('xlsx')) as unknown as {
    read?: typeof XLSXType.read;
    default?: typeof XLSXType;
  };
  return (mod.read ? mod : mod.default || mod) as typeof XLSXType;
}

export async function parseExcelBuffer(
  buffer: ArrayBuffer,
  fileName: string
): Promise<ParsedExcelWorkbook> {
  const XLSX = await loadXlsx();
  const workbook = XLSX.read(buffer, {
    type: 'array',
    dense: false,
    cellFormula: false,
    cellHTML: false,
    cellStyles: false,
  });

  const sheets: ParsedExcelSheet[] = [];
  for (let i = 0; i < workbook.SheetNames.length; i++) {
    const name = workbook.SheetNames[i];
    const worksheet = workbook.Sheets[name];
    if (!worksheet) continue;
    const rows = extractSheetRowsFast(XLSX, worksheet);
    if (rows.length > 0) {
      sheets.push({ name, rows });
    }
  }

  if (sheets.length === 0) {
    throw new Error('В выбранном файле не найдено заполненных листов.');
  }

  return {
    fileName,
    sheets,
  };
}

export async function parseExcelFile(file: File): Promise<ParsedExcelWorkbook> {
  const buffer = await file.arrayBuffer();
  return parseExcelBuffer(buffer, file.name);
}

export async function downloadSampleXlsx(): Promise<void> {
  const XLSX = await loadXlsx();
  const rows = [
    [
      'SKU',
      'Shape',
      'Carat',
      'Color',
      'Clarity',
      'Cut',
      'Price_USD',
      'Cert_Lab',
      'Cert_Number',
      'Measurements',
      'Depth_%',
      'Table_%',
      'Origin',
      'Cert_URL',
      'Photo',
      'Video',
    ],
    [
      'SUP-RD-175E',
      'Round',
      '1.75',
      'E',
      'VVS1',
      'Ideal',
      '23900',
      'GIA',
      '2490123456',
      '7.74 x 7.77 x 4.76',
      '61.4',
      '57.0',
      'Антверпен',
      'https://www.gia.edu/report-check?reportno=2490123456',
      '',
      '',
    ],
    [
      'SUP-OV-210D',
      'Oval',
      '2.10',
      'D',
      'VS1',
      'Excellent',
      '29400',
      'GIA',
      '5240987654',
      '10.22 x 7.24 x 4.49',
      '62.0',
      '58.0',
      'Женева',
      'https://www.gia.edu/report-check?reportno=5240987654',
      '',
      '',
    ],
    [
      'SUP-EM-145F',
      'Emerald',
      '1.45',
      'F',
      'IF',
      'Excellent',
      '15800',
      'IGI',
      '638901234',
      '7.82 x 5.54 x 3.60',
      '65.0',
      '63.0',
      'Мумбаи',
      'https://www.igi.org/Verify-Your-Report/?r=638901234',
      '',
      '',
    ],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Diamonds');
  XLSX.writeFile(workbook, 'diamonds_template.xlsx');
}
