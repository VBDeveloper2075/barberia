import { config } from './config.js';
import { db } from './db.js';
import { slotConflicts } from './slots.js';

const MP_API = 'https://api.mercadopago.com';

export const isDemoMode = () => !process.env.MP_ACCESS_TOKEN;

export function publicBaseUrl(req) {
  return (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

// Crea el cobro de la seña. Devuelve la URL a la que se redirige al cliente.
export async function createCheckout(booking, baseUrl) {
  if (isDemoMode()) {
    return `${baseUrl}/pago-demo.html?t=${booking.token}`;
  }

  const https = baseUrl.startsWith('https://');
  const back = `${baseUrl}/reserva.html?t=${booking.token}`;
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
    body.notification_url = `${baseUrl}/api/mp/webhook`;
  }

  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Mercado Pago respondió ${res.status}: ${await res.text()}`);
  }
  const pref = await res.json();
  return pref.init_point;
}

export async function fetchPayment(paymentId) {
  if (!/^\d+$/.test(String(paymentId))) return null;
  const res = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
  });
  return res.ok ? res.json() : null;
}

// Aplica un pago aprobado a su turno. Valida monto y moneda con los datos de Mercado Pago.
export function applyApprovedPayment(payment) {
  if (!payment || payment.status !== 'approved') return null;
  const booking = db.prepare('SELECT * FROM bookings WHERE token = ?').get(payment.external_reference);
  if (!booking) return null;
  if (booking.status !== 'pending') return booking;
  if (payment.currency_id !== 'ARS' || Number(payment.transaction_amount) < config.depositAmount) return booking;

  // Si la reserva venció y otro cliente tomó el horario, queda para reembolso.
  const conflict = slotConflicts(booking.date, booking.start_min, booking.duration, booking.id);
  const status = conflict ? 'refund' : 'confirmed';
  db.prepare(
    'UPDATE bookings SET status = ?, payment_id = ?, payment_status = ?, paid_at = ? WHERE id = ?',
  ).run(status, String(payment.id), 'approved', Date.now(), booking.id);
  return db.prepare('SELECT * FROM bookings WHERE id = ?').get(booking.id);
}

// Pago simulado (solo modo demo).
export function applyDemoPayment(booking) {
  if (booking.status !== 'pending') return booking;
  const conflict = slotConflicts(booking.date, booking.start_min, booking.duration, booking.id);
  db.prepare(
    'UPDATE bookings SET status = ?, payment_id = ?, payment_status = ?, paid_at = ? WHERE id = ?',
  ).run(conflict ? 'refund' : 'confirmed', `demo-${Date.now()}`, 'approved', Date.now(), booking.id);
  return db.prepare('SELECT * FROM bookings WHERE id = ?').get(booking.id);
}
