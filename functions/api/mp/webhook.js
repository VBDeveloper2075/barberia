// POST /api/mp/webhook — notificaciones de Mercado Pago.
// No se confía en el contenido recibido: se vuelve a consultar el pago a la API de Mercado Pago.
import { json } from '../../_lib/http.js';
import { applyApprovedPayment, fetchPayment, hasMercadoPago } from '../../_lib/payments.js';

export async function onRequestPost({ request, env }) {
  if (!hasMercadoPago(env)) return json({ ok: true });

  const url = new URL(request.url);
  let body = {};
  try {
    body = await request.json();
  } catch {
    // MP también puede avisar solo con parámetros en la URL
  }
  const type = url.searchParams.get('type') || body.type;
  const id = url.searchParams.get('data.id') || body?.data?.id;
  if (type === 'payment' && id) {
    await applyApprovedPayment(env.DB, await fetchPayment(env, id));
  }
  return json({ ok: true });
}
