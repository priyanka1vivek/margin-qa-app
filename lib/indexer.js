import { chunkPages, MAX_CHUNKS } from './chunk.js';
import { extractPages, fileType } from './extract.js';
import { embedTexts } from './ai.js';

export async function indexDocument(db, document, bytes) {
  try {
    const pages = await extractPages(bytes, fileType(document.filename));
    const chunks = chunkPages(pages);
    if (!chunks.length) throw new Error('No searchable text found. Scanned images need OCR and are not supported.');
    const embeddings = [];
    for (let i = 0; i < chunks.length; i += 20) embeddings.push(...await embedTexts(chunks.slice(i, i + 20).map(c => c.content)));
    const removed = await db.from('document_chunks').delete().eq('document_id', document.id);
    if (removed.error) throw removed.error;
    for (let i = 0; i < chunks.length; i += 20) {
      const rows = chunks.slice(i, i + 20).map((c, offset) => ({ ...c, document_id: document.id, user_id: document.user_id, embedding: `[${embeddings[i + offset].join(',')}]` }));
      const inserted = await db.from('document_chunks').insert(rows);
      if (inserted.error) throw inserted.error;
    }
    const updated = await db.from('documents').update({ status: 'ready', error: null, page_count: pages.length, chunk_count: chunks.length, indexed_at: new Date().toISOString() }).eq('id', document.id);
    if (updated.error) throw updated.error;
    return { ...document, status: 'ready', page_count: pages.length, chunk_count: Math.min(chunks.length, MAX_CHUNKS), error: null };
  } catch (error) {
    await db.from('document_chunks').delete().eq('document_id', document.id);
    const message = String(error.message || 'Indexing failed').slice(0, 350);
    await db.from('documents').update({ status: 'failed', error: message }).eq('id', document.id);
    return { ...document, status: 'failed', error: message };
  }
}
