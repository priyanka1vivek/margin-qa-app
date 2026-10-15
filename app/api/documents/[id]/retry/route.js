import { userDatabase, jsonError, HttpError, dbResult } from '@/lib/api';
import { indexDocument } from '@/lib/indexer';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request, { params }) {
  try {
    const { id } = await params; const { db } = await userDatabase(request);
    const document = dbResult(await db.from('documents').select('*').eq('id', id).maybeSingle());
    if (!document) throw new HttpError(404, 'Document not found');
    if (document.status !== 'failed') throw new HttpError(409, 'Only failed documents can be reprocessed');
    const downloaded = await db.storage.from('documents').download(document.storage_path);
    if (downloaded.error) throw new HttpError(502, downloaded.error.message);
    dbResult(await db.from('documents').update({ status: 'processing', error: null }).eq('id', id));
    const result = await indexDocument(db, document, Buffer.from(await downloaded.data.arrayBuffer()));
    return Response.json({ document: result }, { status: result.status === 'ready' ? 200 : 422 });
  } catch (error) { return jsonError(error); }
}
