import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB safety limit
const MAX_PDF_PAGES = 6;

interface PdfTextToken {
  str: string;
  x: number;
  y: number;
}

/**
 * Extracts readable text from an official IGI PDF certificate completely locally
 * in the browser (never uploading binary files to external servers), preserving
 * visual rows so tabular labels ("Carat Weight 1.01 Carat") stay paired cleanly.
 */
export async function extractTextFromIgiPdfFile(file: File): Promise<string> {
  if (!file) {
    throw new Error('Файл не выбран.');
  }

  const lowerName = file.name.toLowerCase();
  const isPdfType =
    file.type === 'application/pdf' || lowerName.endsWith('.pdf');
  if (!isPdfType) {
    throw new Error('Поддерживаются только PDF-файлы официальных сертификатов IGI.');
  }

  if (file.size <= 0 || file.size > MAX_PDF_SIZE_BYTES) {
    throw new Error('Размер PDF-файла должен быть не более 10 МБ.');
  }

  const buffer = await file.arrayBuffer();
  const header = new TextDecoder('ascii').decode(new Uint8Array(buffer, 0, 5));
  if (!header.startsWith('%PDF-')) {
    throw new Error('Файл не является корректным PDF-документом.');
  }

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  });

  const pdfDoc = await loadingTask.promise;
  const pageCount = Math.min(pdfDoc.numPages, MAX_PDF_PAGES);
  const pageTexts: string[] = [];

  try {
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();

      const tokens: PdfTextToken[] = [];
      for (const item of textContent.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        const transform = Array.isArray(item.transform) ? item.transform : [1, 0, 0, 1, 0, 0];
        tokens.push({
          str: item.str,
          x: Number(transform[4]) || 0,
          y: Number(transform[5]) || 0,
        });
      }

      // Group tokens into visual lines (tolerance 3.5 pt in Y) sorted top-to-bottom, left-to-right
      tokens.sort((a, b) => {
        if (Math.abs(b.y - a.y) > 3.5) return b.y - a.y;
        return a.x - b.x;
      });

      const lines: { y: number; items: PdfTextToken[] }[] = [];
      for (const tok of tokens) {
        const existing = lines.find((line) => Math.abs(line.y - tok.y) <= 3.5);
        if (existing) {
          existing.items.push(tok);
        } else {
          lines.push({ y: tok.y, items: [tok] });
        }
      }

      const formattedLines = lines.map((line) => {
        line.items.sort((a, b) => a.x - b.x);
        return line.items.map((t) => t.str.trim()).join(' ');
      });

      pageTexts.push(formattedLines.join('\n'));
    }
  } finally {
    await loadingTask.destroy();
  }

  return pageTexts.join('\n\n').trim();
}
