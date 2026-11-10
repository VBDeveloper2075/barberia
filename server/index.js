import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(path.resolve('.env'));
} catch {
  // .env es opcional
}

const { config, getService } = await import('./config.js');
const { db, seedAdmin } = await import('./db.js');
const { verifyPassword, sha256, randomToken, parseCookies, rateLimiter } = await import('./auth.js');
const { buildSlots, slotIsAvailable } = await import('./slots.js');
const { localNow, isValidDate, toMin } = await import('./time.js');
const pay = await import('./payments.js');

seedAdmin();

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '20kb' }));

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const SESSION_COOKIE = 'chivas_admin';
const SESSION_MS = 1000 * 60 * 60 * 8;

// --- Cabeceras de seguridad ---
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy':
      "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; script-src 'self'; frame-ancestors 'none'",
  });
  next();
});

// Los endpoints que modifican datos solo aceptan JSON (mitiga CSRF junto con SameSite).
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && !req.is('application/json') && req.path !== '/mp/webhook') {
    return res.status(415).json({ error: 'Content-Type inválido.' });
  }
  next();
});

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// --- API pública ---

app.get('/api/config', (req, res) => {
  const now = localNow();
  res.json({
    business: config.business,
    deposit: config.depositAmount,
    demoMode: pay.isDemoMode(),
    today: now.date,
    daysAhead: config.daysAhead,
    hours: config.hours,
    loyaltyStamps: config.loyaltyStamps,
    services: config.services.map(({ id, name, price, duration, short, description }) => ({
      id, name, price, duration, short, description,
    })),
  });
});

app.get('/api/slots', (req, res) => {
  const service = getService(String(req.query.serviceId));
  const date = String(req.query.date);
  if (!service || !isValidDate(date)) return res.status(400).json({ error: 'Datos inválidos.' });
  res.json({ slots: buildSlots(date, service) });
});

const bookingLimiter = rateLimiter(8, 10 * 60 * 1000);

app.post(
  '/api/bookings',
  asyncHandler(async (req, res) => {
    if (!bookingLimiter(req.ip)) {
      return res.status(429).json({ error: 'Demasiados intentos. Probá de nuevo en unos minutos.' });
    }
    const { serviceId, date, time, name, phone, email } = req.body || {};
    const service = getService(serviceId);
    if (!service) return res.status(400).json({ error: 'Servicio inválido.' });
    if (!isValidDate(date) || !/^\d{2}:\d{2}$/.test(String(time))) {
      return res.status(400).json({ error: 'Fecha u horario inválido.' });
    }
    const cleanName = String(name || '').trim().replace(/\s+/g, ' ');
    const phoneNorm = String(phone || '').replace(/\D/g, '');
    const cleanEmail = String(email || '').trim();
    if (cleanName.length < 2 || cleanName.length > 80) return res.status(400).json({ error: 'Ingresá tu nombre.' });
    if (phoneNorm.length < 8 || phoneNorm.length > 15) return res.status(400).json({ error: 'Ingresá un teléfono válido.' });
    if (cleanEmail && (cleanEmail.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail))) {
      return res.status(400).json({ error: 'El email no es válido.' });
    }

    // Verificación e inserción sin pausas entre medio: evita doble reserva del mismo horario.
    if (!slotIsAvailable(date, time, service)) {
      return res.status(409).json({ error: 'Ese horario ya no está disponible. Elegí otro.' });
    }
    const now = Date.now();
    const booking = {
      token: randomToken(16),
      service_id: service.id,
      service_name: service.name,
      service_price: service.price,
      duration: service.duration,
      date,
      time,
      start_min: toMin(time),
      name: cleanName,
      phone: String(phone).trim().slice(0, 30),
      phone_norm: phoneNorm,
      email: cleanEmail || null,
      deposit: config.depositAmount,
      expires_at: now + config.holdMinutes * 60 * 1000,
      created_at: now,
    };
    const info = db
      .prepare(
        `INSERT INTO bookings (token, service_id, service_name, service_price, duration, date, time, start_min,
          name, phone, phone_norm, email, deposit, expires_at, created_at)
         VALUES (:token, :service_id, :service_name, :service_price, :duration, :date, :time, :start_min,
          :name, :phone, :phone_norm, :email, :deposit, :expires_at, :created_at)`,
      )
      .run(booking);

    try {
      const checkoutUrl = await pay.createCheckout(booking, pay.publicBaseUrl(req));
      res.status(201).json({ token: booking.token, checkoutUrl });
    } catch (err) {
      console.error('No se pudo crear el cobro:', err.message);
      db.prepare(`UPDATE bookings SET status = 'cancelled' WHERE id = ?`).run(info.lastInsertRowid);
      res.status(502).json({ error: 'No pudimos iniciar el pago. Intentá de nuevo en unos minutos.' });
    }
  }),
);

function publicBooking(b) {
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
    demoMode: pay.isDemoMode(),
  };
}

const getByToken = (token) => db.prepare('SELECT * FROM bookings WHERE token = ?').get(String(token));

app.get('/api/bookings/:token', (req, res) => {
  const b = getByToken(req.params.token);
  if (!b) return res.status(404).json({ error: 'Turno no encontrado.' });
  res.json(publicBooking(b));
});

// La página de retorno consulta a Mercado Pago el pago informado y confirma el turno.
app.post(
  '/api/bookings/:token/verify',
  asyncHandler(async (req, res) => {
    let b = getByToken(req.params.token);
    if (!b) return res.status(404).json({ error: 'Turno no encontrado.' });
    const paymentId = req.body?.paymentId;
    if (b.status === 'pending' && paymentId && !pay.isDemoMode()) {
      const payment = await pay.fetchPayment(paymentId);
      if (payment && payment.external_reference === b.token) {
        b = pay.applyApprovedPayment(payment) || b;
      }
    }
    res.json(publicBooking(b));
  }),
);

app.post(
  '/api/mp/webhook',
  express.json({ type: () => true }),
  asyncHandler(async (req, res) => {
    res.sendStatus(200);
    if (pay.isDemoMode()) return;
    const type = req.query.type || req.body?.type;
    const id = req.query['data.id'] || req.body?.data?.id;
    if (type !== 'payment' || !id) return;
    // Se vuelve a consultar el pago a Mercado Pago: no se confía en el contenido recibido.
    const payment = await pay.fetchPayment(id);
    pay.applyApprovedPayment(payment);
  }),
);

// Solo modo demo: simula la aprobación del pago.
app.post('/api/demo/pay/:token', (req, res) => {
  if (!pay.isDemoMode()) return res.status(404).json({ error: 'No disponible.' });
  const b = getByToken(req.params.token);
  if (!b) return res.status(404).json({ error: 'Turno no encontrado.' });
  if (b.status === 'pending' && b.expires_at <= Date.now()) {
    return res.status(410).json({ error: 'La reserva venció. Volvé a elegir tu turno.' });
  }
  res.json(publicBooking(pay.applyDemoPayment(b)));
});

// --- API del dueño ---

const loginLimiter = rateLimiter(10, 15 * 60 * 1000);

function currentAdmin(req) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) return null;
  return (
    db
      .prepare(
        `SELECT a.id, a.username FROM sessions s JOIN admins a ON a.id = s.admin_id
         WHERE s.token_hash = ? AND s.expires_at > ?`,
      )
      .get(sha256(token), Date.now()) || null
  );
}

function requireAdmin(req, res, next) {
  const admin = currentAdmin(req);
  if (!admin) return res.status(401).json({ error: 'No autorizado.' });
  req.admin = admin;
  next();
}

app.post('/api/admin/login', (req, res) => {
  if (!loginLimiter(req.ip)) {
    return res.status(429).json({ error: 'Demasiados intentos. Esperá unos minutos.' });
  }
  const { username, password } = req.body || {};
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(String(username || ''));
  if (!admin || !verifyPassword(String(password || ''), admin.password_hash)) {
    return res.status(401).json({ error: 'Usuario o clave incorrectos.' });
  }
  const token = randomToken();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('INSERT INTO sessions (token_hash, admin_id, expires_at) VALUES (?, ?, ?)').run(
    sha256(token),
    admin.id,
    Date.now() + SESSION_MS,
  );
  const secure = (process.env.PUBLIC_URL || '').startsWith('https://') ? '; Secure' : '';
  res.set('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${secure}`);
  res.json({ username: admin.username });
});

app.post('/api/admin/logout', (req, res) => {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  res.set('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
  res.json({ ok: true });
});

app.get('/api/admin/me', (req, res) => {
  const admin = currentAdmin(req);
  if (!admin) return res.status(401).json({ error: 'No autorizado.' });
  res.json({ username: admin.username });
});

const SCOPES = {
  upcoming: { where: `status = 'confirmed' AND date >= :today`, order: 'date ASC, start_min ASC' },
  today: { where: `status IN ('confirmed','completed') AND date = :today`, order: 'start_min ASC' },
  past: { where: `status IN ('confirmed','completed') AND date < :today`, order: 'date DESC, start_min DESC' },
  attention: { where: `status = 'refund'`, order: 'date ASC, start_min ASC' },
  pending: { where: `status = 'pending' AND expires_at > :now`, order: 'created_at DESC' },
  cancelled: { where: `status = 'cancelled'`, order: 'date DESC, start_min DESC' },
};

app.get('/api/admin/bookings', requireAdmin, (req, res) => {
  const scope = SCOPES[req.query.scope] || SCOPES.upcoming;
  const q = String(req.query.q || '').trim();
  const params = { today: localNow().date, now: Date.now() };
  let where = scope.where;
  if (q) {
    where += ` AND (name LIKE :q OR phone LIKE :q OR email LIKE :q)`;
    params.q = `%${q.replace(/[%_]/g, '')}%`;
  }
  // node:sqlite rechaza parámetros con nombre que no aparecen en la consulta.
  for (const key of Object.keys(params)) {
    if (!where.includes(`:${key}`)) delete params[key];
  }
  const today = localNow().date;
  const rows = db
    .prepare(
      `SELECT b.id, b.service_name, b.service_price, b.date, b.time, b.name, b.phone, b.email, b.status,
              b.deposit, b.payment_id, b.paid_at,
              (SELECT COUNT(*) FROM bookings x WHERE x.phone_norm = b.phone_norm AND x.status = 'completed') AS completed_count
       FROM bookings b WHERE ${where} ORDER BY ${scope.order} LIMIT 500`,
    )
    .all(params);

  const stats = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status IN ('confirmed','completed') AND date = :today THEN 1 ELSE 0 END) AS today,
         SUM(CASE WHEN status = 'confirmed' AND date >= :today THEN 1 ELSE 0 END) AS upcoming,
         SUM(CASE WHEN status = 'refund' THEN 1 ELSE 0 END) AS attention,
         SUM(CASE WHEN status IN ('confirmed','completed') AND date >= :month THEN deposit ELSE 0 END) AS deposits_month
       FROM bookings`,
    )
    .get({ today, month: `${today.slice(0, 7)}-01` });

  res.json({ bookings: rows, stats, loyaltyStamps: config.loyaltyStamps });
});

app.patch('/api/admin/bookings/:id', requireAdmin, (req, res) => {
  const status = req.body?.status;
  if (!['completed', 'cancelled', 'confirmed'].includes(status)) {
    return res.status(400).json({ error: 'Estado inválido.' });
  }
  const b = db.prepare('SELECT * FROM bookings WHERE id = ?').get(Number(req.params.id));
  if (!b) return res.status(404).json({ error: 'Turno no encontrado.' });
  if (b.status === 'pending') return res.status(409).json({ error: 'El turno todavía no tiene la seña paga.' });
  db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, b.id);
  res.json({ ok: true });
});

// --- Sitio estático ---
app.use(express.static(publicDir, { extensions: ['html'] }));

app.use('/api', (req, res) => res.status(404).json({ error: 'No encontrado.' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`${config.business.name} en http://localhost:${port}`);
  console.log(pay.isDemoMode() ? 'Pagos: MODO DEMO (sin MP_ACCESS_TOKEN)' : 'Pagos: Mercado Pago');
});
