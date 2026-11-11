// POST /api/bookings — crea una reserva pendiente y devuelve la URL de pago de la seña.
import { allowAttempt } from '../../_lib/auth.js';
import { config, getService } from '../../_lib/config.js';
import { HttpError, baseUrl, clientIp, json, readJson } from '../../_lib/http.js';
import { createCheckout } from '../../_lib/payments.js';
import { insertBookingIfFree, slotIsAvailable } from '../../_lib/slots.js';
import { isValidDate, toMin } from '../../_lib/time.js';

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  const ip = clientIp(request);
  if (!(await allowAttempt(db, `booking:${ip}`, 8, 10 * 60 * 1000))) {
    throw new HttpError(429, 'Demasiados intentos. Probá de nuevo en unos minutos.');
  }

  const { serviceId, date, time, name, phone, email } = await readJson(request);
  const service = getService(serviceId);
  if (!service) throw new HttpError(400, 'Servicio inválido.');
  if (!isValidDate(date) || !/^\d{2}:\d{2}$/.test(String(time))) throw new HttpError(400, 'Fecha u horario inválido.');

  const cleanName = String(name || '').trim().replace(/\s+/g, ' ');
  const phoneNorm = String(phone || '').replace(/\D/g, '');
  const cleanEmail = String(email || '').trim();
  if (cleanName.length < 2 || cleanName.length > 80) throw new HttpError(400, 'Ingresá tu nombre.');
  if (phoneNorm.length < 8 || phoneNorm.length > 15) throw new HttpError(400, 'Ingresá un teléfono válido.');
  if (cleanEmail && (cleanEmail.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail))) {
    throw new HttpError(400, 'El email no es válido.');
  }

  // Horario dentro de la agenda (días, horas, anticipación)...
  const taken = new HttpError(409, 'Ese horario ya no está disponible. Elegí otro.');
  if (!(await slotIsAvailable(db, date, time, service))) throw taken;

  const now = Date.now();
  const booking = {
    token: crypto.randomUUID().replaceAll('-', ''),
    service_id: service.id,
    service_name: service.name,
    service_price: service.price,
    duration: service.duration,
    date,
    time,
    start_min: toMin(time),
    name: cleanName,
    phone: String(phone).trim().slice(0, 30),
    phone_norm: phoneNorm,
    email: cleanEmail || null,
    deposit: config.depositAmount,
    expires_at: now + config.holdMinutes * 60 * 1000,
    created_at: now,
  };

  // ...y alta atómica: si otro cliente ganó el horario en el mismo instante, no se inserta.
  if (!(await insertBookingIfFree(db, booking))) throw taken;

  try {
    const checkoutUrl = await createCheckout(env, booking, baseUrl(env, request));
    return json({ token: booking.token, checkoutUrl }, 201);
  } catch (err) {
    console.error('No se pudo crear el cobro:', err.message);
    await db.prepare(`UPDATE bookings SET status = 'cancelled' WHERE token = ?`).bind(booking.token).run();
    if (err instanceof HttpError) throw err;
    throw new HttpError(502, 'No pudimos iniciar el pago. Intentá de nuevo en unos minutos.');
  }
}
