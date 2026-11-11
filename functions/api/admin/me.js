// GET /api/admin/me
import { requireAdmin } from '../../_lib/auth.js';
import { json } from '../../_lib/http.js';

export async function onRequestGet({ request, env }) {
  const admin = await requireAdmin(env, request);
  return json({ username: admin.username });
}
