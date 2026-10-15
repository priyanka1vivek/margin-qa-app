import { userDatabase, jsonError, HttpError, dbResult } from '@/lib/api';
export const runtime = 'nodejs';
export async function DELETE(request, { params }) {
  try {
    const { id } = await params; const { db } = await userDatabase(request);
    const document = dbResult(await db.from('documents').select('id,storage_path').eq('id', id).maybeSingle());
    if (!document) throw new HttpError(404, 'Document not found');
    const removed = await db.storage.from('documents').remove([document.storage_path]);
    if (removed.error) throw new HttpError(502, removed.error.message);
    dbResult(await db.from('documents').delete().eq('id', id));
    return Response.json({ deleted: true });
  } catch (error) { return jsonError(error); }
}
