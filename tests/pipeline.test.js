import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chunkPages, mapCitations, cleanText, MAX_CHUNKS } from '../lib/chunk.js';
import { extractPages, fileType } from '../lib/extract.js';

const asset = name => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
test('PDF extraction retains actual page references', async () => {
  const pages = await extractPages(await readFile(asset('sample.pdf')), 'pdf');
  assert.equal(pages.length, 2);
  assert.match(pages[0].text, /30 June 2027/);
  assert.match(pages[1].text, /4500 dollars/);
  const chunks = chunkPages(pages);
  assert.equal(chunks[0].page_number, 1);
  assert.equal(chunks[1].page_number, 2);
});
test('DOCX and text extraction work without invented page numbers', async () => {
  const word = await extractPages(await readFile(asset('sample.docx')), 'docx');
  assert.match(word[0].text, /Warranty lasts 24 months/); assert.equal(word[0].page, null);
  const text = await extractPages(Buffer.from('A heading\n\nSome text here.'), 'txt');
  assert.match(text[0].text, /Some text/); assert.equal(text[0].page, null);
  assert.equal(fileType('report.PDF'), 'pdf'); assert.equal(fileType('payload.exe'), null);
});
test('chunking limits volume, preserves page boundaries and overlap', () => {
  const text = 'First fact. '.repeat(800);
  const chunks = chunkPages([{ page: 4, text }], 400, 80);
  assert.ok(chunks.length > 1 && chunks.length <= MAX_CHUNKS);
  assert.ok(chunks.every(c => c.page_number === 4 && c.content.length <= 400));
  assert.ok(chunks[0].content.slice(-45).length > 0);
  assert.equal(cleanText('\u0000  hello    world\n\n\n'), 'hello world');
});
test('citation mapping discards nonexistent and duplicate model references', () => {
  const matches = [{ document_id: 'a', document_name: 'Policy.pdf', page_number: 3, content: 'Renewal date is June 30.' }];
  const citations = mapCitations([1, 1, 42, -1], matches);
  assert.deepEqual(citations, [{ index: 1, documentId: 'a', documentName: 'Policy.pdf', page: 3, snippet: 'Renewal date is June 30.' }]);
});
