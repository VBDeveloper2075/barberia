-- Turnos de Chivas Barbería (Cloudflare D1)

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  service_id TEXT NOT NULL,
  service_name TEXT NOT NULL,
  service_price INTEGER NOT NULL,
  duration INTEGER NOT NULL,
  date TEXT NOT NULL,            -- AAAA-MM-DD (hora de Argentina)
  time TEXT NOT NULL,            -- HH:MM
  start_min INTEGER NOT NULL,    -- minutos desde las 00:00
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  phone_norm TEXT NOT NULL,      -- solo dígitos
  email TEXT,
  -- pending | confirmed | completed | cancelled | refund
  status TEXT NOT NULL DEFAULT 'pending',
  deposit INTEGER NOT NULL,
  payment_id TEXT,
  payment_status TEXT,
  paid_at INTEGER,
  expires_at INTEGER NOT NULL,   -- vencimiento de la reserva sin pagar (ms)
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date, status);
CREATE INDEX IF NOT EXISTS idx_bookings_phone ON bookings(phone_norm);

-- Contadores para limitar intentos (login y reservas) entre instancias serverless.
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
