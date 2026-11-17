import * as XLSX from 'xlsx';

export interface ParsedExcelSheet {
  name: string;
  rows: string[][];
}

export interface ParsedExcelWorkbook {
  fileName: string;
  sheets: ParsedExcelSheet[];
}

export async function parseExcelFile(file: File): Promise<ParsedExcelWorkbook> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  const sheets: ParsedExcelSheet[] = workbook.SheetNames.map((name) => {
    const worksheet = workbook.Sheets[name];
    const ref = worksheet['!ref'];
    if (!ref) {
      return { name, rows: [] };
    }

    const range = XLSX.utils.decode_range(ref);
    const rows: string[][] = [];

    for (let r = range.s.r; r <= range.e.r; r++) {
      const rowValues: string[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = worksheet[addr] as XLSX.CellObject | undefined;
        let val = '';

        if (cell) {
          // If cell has an embedded hyperlink (common in diamond lists for Video/Cert links)
          // and display text is just a label like "Video" or "GIA", prefer the hyperlink URL
          const linkTarget = cell.l?.Target ? String(cell.l.Target).trim() : '';
          const formatted =
            cell.w !== undefined && cell.w !== null
              ? String(cell.w).trim()
              : cell.v !== undefined && cell.v !== null
                ? String(cell.v).trim()
                : '';

          if (
            linkTarget &&
            (linkTarget.startsWith('http://') || linkTarget.startsWith('https://')) &&
            !formatted.startsWith('http')
          ) {
            val = linkTarget;
          } else {
            val = formatted;
          }
        }

        rowValues.push(val);
      }

      if (rowValues.some((cell) => cell !== '')) {
        rows.push(rowValues);
      }
    }

    return { name, rows };
  }).filter((s) => s.rows.length > 0);

  if (sheets.length === 0) {
    throw new Error('В выбранном файле не найдено заполненных листов.');
  }

  return {
    fileName: file.name,
    sheets,
  };
}

export function downloadSampleXlsx(): void {
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
