import { config } from './config.js';
import { db, ACTIVE_SQL } from './db.js';
import { localNow, addDays, isValidDate, weekday, toMin, toHHMM } from './time.js';

function busyRanges(date, excludeId = -1) {
  return db
    .prepare(`SELECT start_min, duration FROM bookings WHERE date = ? AND id != ? AND ${ACTIVE_SQL}`)
    .all(date, excludeId, Date.now());
}

function isFree(busy, start, duration) {
  const end = start + duration;
  const overlapping = busy.filter((b) => start < b.start_min + b.duration && end > b.start_min).length;
  return overlapping < config.capacity;
}

// Horarios del día para un servicio, indicando cuáles siguen disponibles.
export function buildSlots(date, service) {
  if (!isValidDate(date)) return [];
  const now = localNow();
  if (date < now.date || date > addDays(now.date, config.daysAhead)) return [];
  const hours = config.hours[weekday(date)];
  if (!hours) return [];

  const open = toMin(hours[0]);
  const close = toMin(hours[1]);
  const busy = busyRanges(date);
  const slots = [];
  for (let start = open; start + service.duration <= close; start += config.slotStepMin) {
    const past = date === now.date && start < now.minutes + config.leadMinutes;
    slots.push({ time: toHHMM(start), available: !past && isFree(busy, start, service.duration) });
  }
  return slots;
}

export function slotIsAvailable(date, time, service) {
  const slot = buildSlots(date, service).find((s) => s.time === time);
  return Boolean(slot && slot.available);
}

// ¿Hay otro turno activo que se superpone con este rango?
export function slotConflicts(date, startMin, duration, excludeId) {
  return !isFree(busyRanges(date, excludeId), startMin, duration);
}
