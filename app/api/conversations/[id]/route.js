import { userDatabase, jsonError, HttpError, dbResult, readJson } from '@/lib/api';
export async function GET(request, { params }) {
  try {
    const { id } = await params, { db } = await userDatabase(request);
    const conversation = dbResult(await db.from('conversations').select('id,title,document_ids,created_at,updated_at').eq('id', id).maybeSingle());
    if (!conversation) throw new HttpError(404, 'Conversation not found');
    const messages = dbResult(await db.from('messages').select('id,role,content,citations,created_at').eq('conversation_id', id).order('created_at', { ascending: true }).limit(100));
    return Response.json({ conversation, messages }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return jsonError(error); }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params, { db } = await userDatabase(request);
    const payload = await readJson(request);
    const title = typeof payload.title === 'string' ? payload.title.trim() : '';
    if (!title || title.length > 100) throw new HttpError(400, 'Title must be between 1 and 100 characters');
    const conversation = dbResult(await db.from('conversations').update({ title }).eq('id', id).select('id,title').maybeSingle());
    if (!conversation) throw new HttpError(404, 'Conversation not found');
    return Response.json({ conversation }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return jsonError(error); }
}
export async function DELETE(request, { params }) {
  try {
    const { id } = await params, { db } = await userDatabase(request);
    const deleted = dbResult(await db.from('conversations').delete().eq('id', id).select('id'));
    if (!deleted.length) throw new HttpError(404, 'Conversation not found');
    return Response.json({ deleted: true });
  } catch (error) { return jsonError(error); }
}
