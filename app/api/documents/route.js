import { userDatabase, jsonError, HttpError, dbResult, safeName } from '@/lib/api';
import { fileType } from '@/lib/extract';
import { MAX_FILE_BYTES } from '@/lib/chunk';
import { indexDocument } from '@/lib/indexer';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request) {
  try { const { db } = await userDatabase(request); const data = dbResult(await db.from('documents').select('id,filename,file_type,file_size,status,error,page_count,chunk_count,created_at,indexed_at').order('created_at', { ascending: false })); return Response.json({ documents: data }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return jsonError(error); }
}
export async function POST(request) {
  try {
    const { db, user } = await userDatabase(request);
    const form = await request.formData(); const file = form.get('file');
    if (!(file instanceof File)) throw new HttpError(400, 'Choose a document to upload');
    const type = fileType(file.name);
    if (!type) throw new HttpError(400, 'Choose a PDF, DOCX, TXT or Markdown file');
    if (!file.size || file.size > MAX_FILE_BYTES) throw new HttpError(413, 'Files must be between 1 byte and 5 MB');
    const bytes = Buffer.from(await file.arrayBuffer());
    const signature = bytes.subarray(0, 5).toString();
    if (type === 'pdf' && !signature.startsWith('%PDF-')) throw new HttpError(400, 'Invalid PDF file');
    if (type === 'docx' && bytes.subarray(0, 2).toString() !== 'PK') throw new HttpError(400, 'Invalid DOCX file');
    const id = crypto.randomUUID(), filename = safeName(file.name);
    const path = `${user.id}/${id}/${filename}`;
    const mime = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', txt: 'text/plain', md: 'text/markdown' }[type];
    const uploaded = await db.storage.from('documents').upload(path, bytes, { contentType: mime, upsert: false });
    if (uploaded.error) throw new HttpError(400, uploaded.error.message);
    let document;
    try { document = dbResult(await db.from('documents').insert({ id, user_id: user.id, filename, file_type: type, file_size: file.size, storage_path: path }).select().single()); }
    catch (error) { await db.storage.from('documents').remove([path]); throw error; }
    const result = await indexDocument(db, document, bytes);
    return Response.json({ document: result }, { status: result.status === 'ready' ? 201 : 422 });
  } catch (error) { return jsonError(error); }
}
