import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { hashPassword } from './auth.js';

const dataDir = path.resolve('data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, 'chivas.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    service_id TEXT NOT NULL,
    service_name TEXT NOT NULL,
    service_price INTEGER NOT NULL,
    duration INTEGER NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    start_min INTEGER NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    phone_norm TEXT NOT NULL,
    email TEXT,
    -- pending | confirmed | completed | cancelled | refund
    status TEXT NOT NULL DEFAULT 'pending',
    deposit INTEGER NOT NULL,
    payment_id TEXT,
    payment_status TEXT,
    paid_at INTEGER,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date);
  CREATE INDEX IF NOT EXISTS idx_bookings_phone ON bookings(phone_norm);

  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
`);

// Crea el usuario del dueño la primera vez.
export function seedAdmin() {
  const exists = db.prepare('SELECT COUNT(*) AS n FROM admins').get().n;
  if (exists > 0) return;
  const username = process.env.ADMIN_USER || 'admin';
  let password = process.env.ADMIN_PASSWORD;
  let generated = false;
  if (!password) {
    password = crypto.randomBytes(9).toString('base64url');
    generated = true;
  }
  db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(username, hashPassword(password));
  console.log('\n=== Usuario del dueño creado ===');
  console.log(`Usuario: ${username}`);
  if (generated) console.log(`Clave (anotala, no se vuelve a mostrar): ${password}`);
  else console.log('Clave: la definida en ADMIN_PASSWORD');
  console.log('================================\n');
}

// Un turno ocupa lugar si está confirmado/completado o pendiente con reserva vigente.
export const ACTIVE_SQL = `(status IN ('confirmed','completed') OR (status = 'pending' AND expires_at > ?))`;
