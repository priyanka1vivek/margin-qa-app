import { cleanText } from './chunk.js';

export function fileType(filename) {
  const name = filename.toLowerCase();
  if (name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.docx')) return 'docx';
  if (name.endsWith('.txt')) return 'txt';
  if (name.endsWith('.md')) return 'md';
  return null;
}
export async function extractPages(buffer, type) {
  if (type === 'txt' || type === 'md') return [{ page: null, text: cleanText(new TextDecoder('utf-8', { fatal: true }).decode(buffer)) }];
  if (type === 'docx') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
    return [{ page: null, text: cleanText(result.value) }];
  }
  if (type === 'pdf') {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, isEvalSupported: false });
    let pdf;
    try {
      pdf = await task.promise;
      const pages = [];
      for (let p = 1; p <= Math.min(pdf.numPages, 100); p++) {
        const page = await pdf.getPage(p);
        const text = await page.getTextContent();
        pages.push({ page: p, text: cleanText(text.items.map(item => item.str + (item.hasEOL ? '\n' : ' ')).join('')) });
        page.cleanup();
      }
      return pages;
    } finally { if (pdf) await pdf.destroy(); else await task.destroy(); }
  }
  throw new Error('Unsupported file type');
}
