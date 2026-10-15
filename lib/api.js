import { createClient } from '@supabase/supabase-js';

export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export function jsonError(error) {
  const status = error instanceof HttpError ? error.status : 500;
  if (status === 500) console.error(error);
  return Response.json({ error: status === 500 ? 'Processing failed. Check the server log and try again.' : error.message }, { status, headers: { 'Cache-Control': 'no-store' } });
}
export async function userDatabase(request) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) throw new HttpError(401, 'Sign in to continue');
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) throw new HttpError(503, 'Supabase is not configured');
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) throw new HttpError(401, 'Session expired. Sign in again');
  return { db, user };
}
export function dbResult(result) { if (result.error) throw new HttpError(400, result.error.message); return result.data; }
export function safeName(name) { return String(name).replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 160); }
export async function readJson(request, max = 16000) {
  if (Number(request.headers.get('content-length')) > max) throw new HttpError(413, 'Request is too large');
  const raw = await request.text(); if (raw.length > max) throw new HttpError(413, 'Request is too large');
  try { return JSON.parse(raw); } catch { throw new HttpError(400, 'Invalid JSON'); }
}
