export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_TEXT_CHARS = 100000;
export const MAX_CHUNKS = 80;

export function cleanText(text) {
  return String(text || '').replace(/\u0000/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export function chunkPages(pages, size = 1150, overlap = 160) {
  if (!(size > overlap && overlap >= 0)) throw new Error('Invalid chunk settings');
  const chunks = [];
  let remaining = MAX_TEXT_CHARS;
  for (const { page, text } of pages) {
    let normalized = cleanText(text).slice(0, remaining);
    remaining -= normalized.length;
    if (!normalized) continue;
    let start = 0;
    while (start < normalized.length) {
      let end = Math.min(start + size, normalized.length);
      if (end < normalized.length) {
        const lastBreak = Math.max(normalized.lastIndexOf('\n', end), normalized.lastIndexOf('. ', end));
        if (lastBreak > start + Math.floor(size * .65)) end = lastBreak + 1;
      }
      const content = normalized.slice(start, end).trim();
      if (content.length >= 10) chunks.push({ page_number: page || null, content, chunk_index: chunks.length });
      if (chunks.length >= MAX_CHUNKS || end === normalized.length) break;
      start = Math.max(start + 1, end - overlap);
    }
    if (chunks.length >= MAX_CHUNKS || remaining <= 0) break;
  }
  return chunks;
}

export function citationContext(matches) {
  return matches.map((m, i) => `[${i + 1}] ${m.document_name}${m.page_number ? `, page ${m.page_number}` : ''}\n${m.content}`).join('\n\n---\n\n');
}
export function mapCitations(ids, matches) {
  return [...new Set(ids)].filter(n => Number.isInteger(n) && n >= 1 && n <= matches.length).map(n => {
    const m = matches[n - 1];
    return { index: n, documentId: m.document_id, documentName: m.document_name, page: m.page_number, snippet: m.content.slice(0, 330) };
  });
}
