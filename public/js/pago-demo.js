const $ = (s) => document.querySelector(s);
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const token = new URLSearchParams(location.search).get('t');

function row(k, v, cls = '') {
  const div = document.createElement('div');
  if (cls) div.className = cls;
  const a = document.createElement('span');
  a.className = 'k';
  a.textContent = k;
  const b = document.createElement('span');
  b.textContent = v;
  div.append(a, b);
  return div;
}

function fail(msg) {
  const e = $('#error');
  e.textContent = msg;
  e.hidden = false;
}

async function load() {
  if (!token) return fail('Enlace inválido.');
  const res = await fetch(`/api/bookings/${encodeURIComponent(token)}`);
  const b = await res.json();
  if (!res.ok) return fail(b.error);
  $('#summary').replaceChildren(
    row('Servicio', b.serviceName),
    row('Turno', `${b.date} ${b.time} h`),
    row('Seña', money.format(b.deposit), 'total'),
  );
}

$('#pay').addEventListener('click', async () => {
  const btn = $('#pay');
  btn.disabled = true;
  const res = await fetch(`/api/demo/pay/${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const data = await res.json();
  if (!res.ok) {
    btn.disabled = false;
    return fail(data.error);
  }
  location.href = `/reserva.html?t=${encodeURIComponent(token)}`;
});

load();
