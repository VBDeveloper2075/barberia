// PATCH /api/admin/bookings/:id  { "status": "completed" | "cancelled" | "confirmed" }
import { requireAdmin } from '../../../_lib/auth.js';
import { HttpError, json, readJson } from '../../../_lib/http.js';

export async function onRequestPatch({ request, env, params }) {
  await requireAdmin(env, request);

  const { status } = await readJson(request);
  if (!['completed', 'cancelled', 'confirmed'].includes(status)) throw new HttpError(400, 'Estado inválido.');

  const booking = await env.DB.prepare('SELECT id, status FROM bookings WHERE id = ?').bind(Number(params.id)).first();
  if (!booking) throw new HttpError(404, 'Turno no encontrado.');
  if (booking.status === 'pending') throw new HttpError(409, 'El turno todavía no tiene la seña paga.');

  await env.DB.prepare('UPDATE bookings SET status = ? WHERE id = ?').bind(status, booking.id).run();
  return json({ ok: true });
}
