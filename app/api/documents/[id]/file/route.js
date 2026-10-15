import { userDatabase, jsonError, HttpError, dbResult } from '@/lib/api';
export const runtime = 'nodejs';
export async function GET(request, { params }) {
  try {
    const { id } = await params; const { db } = await userDatabase(request);
    const document = dbResult(await db.from('documents').select('id,storage_path,file_type,filename').eq('id', id).maybeSingle());
    if (!document) throw new HttpError(404, 'Document not found');
    const result = await db.storage.from('documents').createSignedUrl(document.storage_path, 60);
    if (result.error || !result.data?.signedUrl) throw new HttpError(502, 'Could not open document');
    return Response.json({ url: result.data.signedUrl });
  } catch (error) { return jsonError(error); }
}
