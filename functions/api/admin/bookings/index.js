// GET /api/admin/bookings?scope=upcoming|today|past|pending|attention|cancelled&q=texto
import { requireAdmin } from '../../../_lib/auth.js';
import { config } from '../../../_lib/config.js';
import { json } from '../../../_lib/http.js';
import { localNow } from '../../../_lib/time.js';

// today y now los genera el servidor (no vienen del usuario), por eso se pueden incrustar en el SQL.
const scopes = (today, now) => ({
  upcoming: { where: `status = 'confirmed' AND date >= '${today}'`, order: 'date ASC, start_min ASC' },
  today: { where: `status IN ('confirmed','completed') AND date = '${today}'`, order: 'start_min ASC' },
  past: { where: `status IN ('confirmed','completed') AND date < '${today}'`, order: 'date DESC, start_min DESC' },
  attention: { where: `status = 'refund'`, order: 'date ASC, start_min ASC' },
  pending: { where: `status = 'pending' AND expires_at > ${Number(now)}`, order: 'created_at DESC' },
  cancelled: { where: `status = 'cancelled'`, order: 'date DESC, start_min DESC' },
});

export async function onRequestGet({ request, env }) {
  await requireAdmin(env, request);

  const url = new URL(request.url);
  const today = localNow().date;
  const all = scopes(today, Date.now());
  const scope = all[url.searchParams.get('scope')] || all.upcoming;
  const q = (url.searchParams.get('q') || '').trim().replace(/[%_]/g, '').slice(0, 80);

  let where = scope.where;
  const binds = [];
  if (q) {
    where += ' AND (name LIKE ?1 OR last_name LIKE ?1 OR phone LIKE ?1 OR email LIKE ?1)';
    binds.push(`%${q}%`);
  }

  const rows = await env.DB
    .prepare(
      `SELECT b.id, b.service_name, b.service_price, b.date, b.time, b.name, b.last_name, b.phone, b.email, b.status,
              b.deposit, b.payment_id, b.paid_at,
              (SELECT COUNT(*) FROM bookings x WHERE x.phone_norm = b.phone_norm AND x.status = 'completed') AS completed_count
       FROM bookings b WHERE ${where} ORDER BY ${scope.order} LIMIT 500`,
    )
    .bind(...binds)
    .all();

  const stats = await env.DB
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN status IN ('confirmed','completed') AND date = '${today}' THEN 1 ELSE 0 END), 0) AS today,
         COALESCE(SUM(CASE WHEN status = 'confirmed' AND date >= '${today}' THEN 1 ELSE 0 END), 0) AS upcoming,
         COALESCE(SUM(CASE WHEN status = 'refund' THEN 1 ELSE 0 END), 0) AS attention,
         COALESCE(SUM(CASE WHEN status IN ('confirmed','completed') AND date >= '${today.slice(0, 7)}-01' THEN deposit ELSE 0 END), 0) AS deposits_month
       FROM bookings`,
    )
    .first();

  return json({ bookings: rows.results, stats, loyaltyStamps: config.loyaltyStamps });
}
