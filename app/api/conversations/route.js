import { userDatabase, jsonError, dbResult } from '@/lib/api';
export async function GET(request) {
  try {
    const { db } = await userDatabase(request);
    const conversations = dbResult(await db.from('conversations').select('id,title,document_ids,updated_at,created_at').order('updated_at', { ascending: false }).limit(50));
    return Response.json({ conversations }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return jsonError(error); }
}
