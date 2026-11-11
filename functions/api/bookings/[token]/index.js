// GET /api/bookings/:token — estado de una reserva (para la página de retorno del pago).
import { getByToken, publicBooking } from '../../../_lib/bookings.js';
import { HttpError, json } from '../../../_lib/http.js';

export async function onRequestGet({ env, params }) {
  const booking = await getByToken(env.DB, params.token);
  if (!booking) throw new HttpError(404, 'Turno no encontrado.');
  return json(publicBooking(env, booking));
}
