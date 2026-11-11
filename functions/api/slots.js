// GET /api/slots?serviceId=...&date=AAAA-MM-DD
import { getService } from '../_lib/config.js';
import { HttpError, json } from '../_lib/http.js';
import { buildSlots } from '../_lib/slots.js';
import { isValidDate } from '../_lib/time.js';

export async function onRequestGet({ request, env }) {
  const params = new URL(request.url).searchParams;
  const service = getService(String(params.get('serviceId')));
  const date = String(params.get('date'));
  if (!service || !isValidDate(date)) throw new HttpError(400, 'Datos inválidos.');
  return json({ slots: await buildSlots(env.DB, date, service) });
}
