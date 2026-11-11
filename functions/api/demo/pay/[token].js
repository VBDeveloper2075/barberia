// POST /api/demo/pay/:token — simula la aprobación del pago. Solo existe con DEMO_MODE=true.
import { getByToken, publicBooking } from '../../../_lib/bookings.js';
import { HttpError, json } from '../../../_lib/http.js';
import { applyDemoPayment, isDemoMode } from '../../../_lib/payments.js';

export async function onRequestPost({ env, params }) {
  if (!isDemoMode(env)) throw new HttpError(404, 'No disponible.');
  const booking = await getByToken(env.DB, params.token);
  if (!booking) throw new HttpError(404, 'Turno no encontrado.');
  if (booking.status === 'pending' && booking.expires_at <= Date.now()) {
    throw new HttpError(410, 'La reserva venció. Volvé a elegir tu turno.');
  }
  return json(publicBooking(env, await applyDemoPayment(env.DB, booking)));
}
