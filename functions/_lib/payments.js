import { config } from './config.js';
import { HttpError } from './http.js';
import { slotConflicts } from './slots.js';

const MP_API = 'https://api.mercadopago.com';

export const hasMercadoPago = (env) => Boolean(env.MP_ACCESS_TOKEN);
// El modo demo (pago simulado) solo se activa de forma explícita con DEMO_MODE=true.
export const isDemoMode = (env) => !env.MP_ACCESS_TOKEN && env.DEMO_MODE === 'true';

// Crea el cobro de la seña. Devuelve la URL a la que se redirige al cliente.
export async function createCheckout(env, booking, base) {
  if (isDemoMode(env)) {
    return `${base}/pago-demo?t=${booking.token}`;
  }
  if (!hasMercadoPago(env)) {
    throw new HttpError(503, 'Los pagos todavía no están configurados.');
  }

  const https = base.startsWith('https://');
  const back = `${base}/reserva?t=${booking.token}`;
  const body = {
    items: [
      {
        id: booking.service_id,
        title: `Seña de turno - ${booking.service_name}`,
        description: `${booking.date} ${booking.time} - ${config.business.name}`,
        quantity: 1,
        currency_id: 'ARS',
        unit_price: booking.deposit,
      },
    ],
    external_reference: booking.token,
    back_urls: { success: back, failure: back, pending: back },
    statement_descriptor: 'CHIVAS BARBERIA',
    expires: true,
    expiration_date_to: new Date(booking.expires_at + 5 * 60 * 1000).toISOString(),
  };
  if (https) {
    body.auto_return = 'approved';
    body.notification_url = `${base}/api/mp/webhook`;
  }

  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Mercado Pago respondió ${res.status}: ${await res.text()}`);
  return (await res.json()).init_point;
}

export async function fetchPayment(env, paymentId) {
  if (!/^\d+$/.test(String(paymentId))) return null;
  const res = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` },
  });
  return res.ok ? res.json() : null;
}

const byToken = (db, token) => db.prepare('SELECT * FROM bookings WHERE token = ?').bind(token).first();

async function confirm(db, booking, paymentId) {
  // Si la reserva venció y otro cliente tomó el horario, queda para reembolso.
  const conflict = await slotConflicts(db, booking.date, booking.start_min, booking.duration, booking.id);
  await db
    .prepare(
      `UPDATE bookings SET status = ?, payment_id = ?, payment_status = 'approved', paid_at = ?
       WHERE id = ? AND status = 'pending'`,
    )
    .bind(conflict ? 'refund' : 'confirmed', paymentId, Date.now(), booking.id)
    .run();
  return byToken(db, booking.token);
}

// Aplica un pago aprobado a su turno, validando estado, moneda y monto con los datos de Mercado Pago.
export async function applyApprovedPayment(db, payment) {
  if (!payment || payment.status !== 'approved') return null;
  const booking = await byToken(db, String(payment.external_reference));
  if (!booking) return null;
  if (booking.status !== 'pending') return booking;
  if (payment.currency_id !== 'ARS' || Number(payment.transaction_amount) < config.depositAmount) return booking;
  return confirm(db, booking, String(payment.id));
}

// Pago simulado (solo modo demo).
export async function applyDemoPayment(db, booking) {
  if (booking.status !== 'pending') return booking;
  return confirm(db, booking, `demo-${Date.now()}`);
}
