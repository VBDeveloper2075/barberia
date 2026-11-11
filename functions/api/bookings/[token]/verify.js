// POST /api/bookings/:token/verify — consulta a Mercado Pago el pago informado y confirma el turno.
import { getByToken, publicBooking } from '../../../_lib/bookings.js';
import { HttpError, json, readJson } from '../../../_lib/http.js';
import { applyApprovedPayment, fetchPayment, hasMercadoPago } from '../../../_lib/payments.js';

export async function onRequestPost({ request, env, params }) {
  let booking = await getByToken(env.DB, params.token);
  if (!booking) throw new HttpError(404, 'Turno no encontrado.');

  const { paymentId } = await readJson(request);
  if (booking.status === 'pending' && paymentId && hasMercadoPago(env)) {
    const payment = await fetchPayment(env, paymentId);
    // El pago debe pertenecer a ESTE turno.
    if (payment && payment.external_reference === booking.token) {
      booking = (await applyApprovedPayment(env.DB, payment)) || booking;
    }
  }
  return json(publicBooking(env, booking));
}
