const B = 'http://127.0.0.1:8788';
const j = { 'Content-Type': 'application/json' };
const call = async (path, opts = {}) => {
  const r = await fetch(B + path, opts);
  let body = null;
  try { body = await r.json(); } catch {}
  return { status: r.status, body, headers: r.headers };
};
const ok = (name, cond, extra = '') => console.log(`${cond ? 'OK  ' : 'FAIL'} ${name} ${extra}`);

const cfg = await call('/api/config');
ok('config', cfg.status === 200 && cfg.body.services.length > 0, `demo=${cfg.body.demoMode}`);

// Primer día con atención (lunes-sábado) y con slots
let date = cfg.body.today, slots = [];
for (let i = 0; i < 7 && !slots.some((s) => s.available); i++) {
  const d = new Date(cfg.body.today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + i);
  date = d.toISOString().slice(0, 10);
  slots = (await call(`/api/slots?serviceId=corte-clasico&date=${date}`)).body.slots;
}
const time = slots.find((s) => s.available).time;
ok('slots', slots.length > 0, `${date} ${time}`);

const mk = (extra = {}) => call('/api/bookings', { method: 'POST', headers: j, body: JSON.stringify({ serviceId: 'corte-clasico', date, time, name: 'Test', lastName: 'Cliente', phone: '11 5555-1234', ...extra }) });
const a = await mk();
ok('reserva creada (201)', a.status === 201, a.body.checkoutUrl);
const b = await mk({ name: 'Otro' });
ok('doble reserva rechazada (409)', b.status === 409, b.body.error);
const bad = await call('/api/bookings', { method: 'POST', headers: j, body: JSON.stringify({ serviceId: 'x' }) });
ok('servicio inválido (400)', bad.status === 400);
const noJson = await call('/api/bookings', { method: 'POST', body: 'x' });
ok('sin content-type json (415)', noJson.status === 415);

const slots2 = (await call(`/api/slots?serviceId=corte-clasico&date=${date}`)).body.slots;
ok('horario ocupado en slots', slots2.find((s) => s.time === time).available === false);

const pend = await call(`/api/bookings/${a.body.token}`);
ok('estado pendiente', pend.body.status === 'pending');
const paid = await call(`/api/demo/pay/${a.body.token}`, { method: 'POST', headers: j, body: '{}' });
ok('pago demo -> confirmed', paid.body.status === 'confirmed');

ok('admin sin sesión (401)', (await call('/api/admin/bookings')).status === 401);
const bl = await call('/api/admin/login', { method: 'POST', headers: j, body: JSON.stringify({ password: 'mala' }) });
ok('login incorrecto (401)', bl.status === 401);
const lg = await call('/api/admin/login', { method: 'POST', headers: j, body: JSON.stringify({ password: 'chivas-local-1234' }) });
ok('login correcto', lg.status === 200);
const cookie = lg.headers.get('set-cookie').split(';')[0];
console.log('     cookie flags:', lg.headers.get('set-cookie').split(';').slice(1).join(';'));
const h = { ...j, Cookie: cookie };
ok('admin/me', (await call('/api/admin/me', { headers: h })).body.username === 'admin');
const list = await call('/api/admin/bookings?scope=upcoming', { headers: h });
ok('lista admin', list.body.bookings.some((x) => x.last_name === 'Cliente'), JSON.stringify(list.body.stats));
const id = list.body.bookings.find((x) => x.last_name === 'Cliente').id;
const pt = await call(`/api/admin/bookings/${id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ status: 'completed' }) });
ok('PATCH completar', pt.status === 200);
const tamper = await call('/api/admin/me', { headers: { Cookie: cookie.slice(0, -3) + 'aaa' } });
ok('cookie adulterada (401)', tamper.status === 401);
ok('logout', (await call('/api/admin/logout', { method: 'POST', headers: h, body: '{}' })).status === 200);
ok('ruta api inexistente (404 json)', (await call('/api/nada')).status === 404);

// Cancelar para dejar la DB limpia
await call(`/api/admin/bookings/${id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ status: 'cancelled' }) });

for (const p of ['/', '/admin', '/reserva', '/pago-demo']) {
  const r = await fetch(B + p);
  ok(`estático ${p}`, r.status === 200, `csp=${r.headers.has('content-security-policy')}`);
}
