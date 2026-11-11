import { isDemoMode } from './payments.js';

export const getByToken = (db, token) =>
  db.prepare('SELECT * FROM bookings WHERE token = ?').bind(String(token)).first();

// Datos que ve el cliente (nunca teléfono ni email de otros).
export function publicBooking(env, b) {
  return {
    token: b.token,
    status: b.status,
    expired: b.status === 'pending' && b.expires_at <= Date.now(),
    serviceName: b.service_name,
    servicePrice: b.service_price,
    date: b.date,
    time: b.time,
    name: b.name,
    deposit: b.deposit,
    demoMode: isDemoMode(env),
  };
}
