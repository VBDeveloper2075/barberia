const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const STATUS = {
  confirmed: 'Confirmado',
  completed: 'Realizado',
  cancelled: 'Cancelado',
  pending: 'Esperando pago',
  refund: 'Reembolsar',
};

let scope = 'upcoming';
let searchTimer;

async function api(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && url !== '/api/admin/login') {
    showLogin();
    throw new Error('Sesión vencida.');
  }
  if (!res.ok) throw new Error(data.error || 'Ocurrió un error.');
  return data;
}

const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

function showLogin() {
  $('#dash-view').hidden = true;
  $('#login-view').hidden = false;
}

function showDash() {
  $('#login-view').hidden = true;
  $('#dash-view').hidden = false;
  load();
}

function cell(label, ...children) {
  const td = document.createElement('td');
  td.dataset.label = label;
  td.append(...children);
  return td;
}

function withSub(main, sub) {
  const wrap = document.createElement('div');
  wrap.append(main);
  if (sub) {
    const s = document.createElement('span');
    s.className = 'sub';
    s.textContent = sub;
    wrap.append(s);
  }
  return wrap;
}

function actionBtn(label, status, id) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.addEventListener('click', async () => {
    if (status === 'cancelled' && !confirm('¿Cancelar este turno? Si ya pagó la seña, el reembolso se hace desde Mercado Pago.')) return;
    b.disabled = true;
    try {
      await api(`/api/admin/bookings/${id}`, json('PATCH', { status }));
      load();
    } catch (err) {
      alert(err.message);
      b.disabled = false;
    }
  });
  return b;
}

function loyaltyCell(count, total) {
  const cycle = count % (total + 1);
  if (cycle >= total) {
    const badge = document.createElement('span');
    badge.className = 'badge free';
    badge.textContent = 'Corte gratis';
    return badge;
  }
  return document.createTextNode(`${cycle} / ${total}`);
}

function renderRows(data) {
  const rows = $('#rows');
  rows.replaceChildren();
  $('#empty').hidden = data.bookings.length > 0;
  $('#table').hidden = data.bookings.length === 0;

  for (const b of data.bookings) {
    const d = new Date(`${b.date}T00:00:00Z`);
    const [y, m, day] = b.date.split('-');
    const tr = document.createElement('tr');

    const phone = document.createElement('a');
    phone.href = `https://wa.me/${b.phone.replace(/\D/g, '')}`;
    phone.target = '_blank';
    phone.rel = 'noopener';
    phone.textContent = b.phone;

    const badge = document.createElement('span');
    badge.className = `badge ${b.status}`;
    badge.textContent = STATUS[b.status] || b.status;

    const actions = document.createElement('div');
    actions.className = 'row-actions';
    if (b.status === 'confirmed') actions.append(actionBtn('Realizado', 'completed', b.id), actionBtn('Cancelar', 'cancelled', b.id));
    else if (b.status === 'completed') actions.append(actionBtn('Deshacer', 'confirmed', b.id));
    else if (b.status === 'refund') actions.append(actionBtn('Cancelar', 'cancelled', b.id));

    const actionsTd = cell('', actions);
    actionsTd.className = 'actions-cell';

    tr.append(
      cell('Día', withSub(document.createTextNode(`${day}/${m}/${y}`), DAYS[d.getUTCDay()])),
      cell('Hora', document.createTextNode(`${b.time} h`)),
      cell('Cliente', document.createTextNode(b.name)),
      cell('Contacto', withSub(phone, b.email)),
      cell('Servicio', withSub(document.createTextNode(b.service_name), money.format(b.service_price))),
      cell('Seña', document.createTextNode(['confirmed', 'completed', 'refund'].includes(b.status) ? money.format(b.deposit) : '—')),
      cell('Fidelidad', loyaltyCell(b.completed_count, data.loyaltyStamps)),
      cell('Estado', badge),
      actionsTd,
    );
    rows.append(tr);
  }
}

async function load() {
  const q = $('#search').value.trim();
  try {
    const data = await api(`/api/admin/bookings?scope=${scope}&q=${encodeURIComponent(q)}`);
    $('#st-today').textContent = data.stats.today ?? 0;
    $('#st-upcoming').textContent = data.stats.upcoming ?? 0;
    $('#st-deposits').textContent = money.format(data.stats.deposits_month ?? 0);
    $('#st-attention').textContent = data.stats.attention ?? 0;
    $('#st-attention-box').hidden = !data.stats.attention;
    renderRows(data);
  } catch (err) {
    if (err.message !== 'Sesión vencida.') alert(err.message);
  }
}

async function init() {
  try {
    await api('/api/admin/me');
    showDash();
  } catch {
    showLogin();
  }
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const err = $('#login-error');
  err.hidden = true;
  const btn = $('#login-btn');
  btn.disabled = true;
  try {
    await api('/api/admin/login', json('POST', Object.fromEntries(new FormData(form))));
    form.reset();
    showDash();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  } finally {
    btn.disabled = false;
  }
});

$('#logout').addEventListener('click', async () => {
  await fetch('/api/admin/logout', json('POST'));
  showLogin();
});

for (const chip of $$('.chip')) {
  chip.addEventListener('click', () => {
    scope = chip.dataset.scope;
    for (const c of $$('.chip')) c.setAttribute('aria-pressed', String(c === chip));
    load();
  });
}

$('#search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(load, 250);
});

init();
