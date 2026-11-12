import { config } from './config.js';
import { localNow, addDays, isValidDate, weekday, toMin, toHHMM } from './time.js';

// Un turno ocupa lugar si está confirmado/completado, o pendiente con la reserva vigente.
export const ACTIVE_SQL = `(status IN ('confirmed','completed') OR (status = 'pending' AND expires_at > ?))`;

async function busyRanges(db, date, excludeId = -1) {
  const { results } = await db
    .prepare(`SELECT start_min, duration FROM bookings WHERE date = ? AND id != ? AND ${ACTIVE_SQL}`)
    .bind(date, excludeId, Date.now())
    .all();
  return results;
}

function isFree(busy, start, duration) {
  const end = start + duration;
  const overlapping = busy.filter((b) => start < b.start_min + b.duration && end > b.start_min).length;
  return overlapping < config.capacity;
}

// Horarios del día para un servicio, indicando cuáles siguen disponibles.
export async function buildSlots(db, date, service) {
  if (!isValidDate(date)) return [];
  const now = localNow();
  if (date < now.date || date > addDays(now.date, config.daysAhead)) return [];
  const hours = config.hours[weekday(date)];
  if (!hours) return [];

  const open = toMin(hours[0]);
  const close = toMin(hours[1]);
  const busy = await busyRanges(db, date);
  const slots = [];
  for (let start = open; start + service.duration <= close; start += config.slotStepMin) {
    const past = date === now.date && start < now.minutes + config.leadMinutes;
    slots.push({ time: toHHMM(start), available: !past && isFree(busy, start, service.duration) });
  }
  return slots;
}

export async function slotIsAvailable(db, date, time, service) {
  const slot = (await buildSlots(db, date, service)).find((s) => s.time === time);
  return Boolean(slot && slot.available);
}

// ¿Hay otro turno activo que se superponga con este rango?
export async function slotConflicts(db, date, startMin, duration, excludeId) {
  return !isFree(await busyRanges(db, date, excludeId), startMin, duration);
}

// Inserta el turno solo si el horario sigue libre. Es UNA sola sentencia SQL, por lo que
// la verificación y el alta son atómicas aunque lleguen dos reservas al mismo tiempo.
export async function insertBookingIfFree(db, b) {
  const end = b.start_min + b.duration;
  const result = await db
    .prepare(
      `INSERT INTO bookings (token, service_id, service_name, service_price, duration, date, time, start_min,
         name, last_name, phone, phone_norm, email, deposit, expires_at, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE (SELECT COUNT(*) FROM bookings
              WHERE date = ? AND start_min < ? AND start_min + duration > ? AND ${ACTIVE_SQL}) < ?`,
    )
    .bind(
      b.token, b.service_id, b.service_name, b.service_price, b.duration, b.date, b.time, b.start_min,
      b.name, b.last_name, b.phone, b.phone_norm, b.email, b.deposit, b.expires_at, b.created_at,
      b.date, end, b.start_min, Date.now(), config.capacity,
    )
    .run();
  return result.meta.changes > 0;
}
