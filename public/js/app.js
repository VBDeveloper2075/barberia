const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAYS_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

let cfg;
const state = { service: null, date: null, time: null };

const utcDate = (str) => new Date(`${str}T00:00:00Z`);
const addDays = (str, n) => {
  const d = utcDate(str);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const prettyDate = (str) => {
  const d = utcDate(str);
  return `${DAYS_LONG[d.getUTCDay()]} ${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]}`;
};

async function api(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ocurrió un error. Intentá de nuevo.');
  return data;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

/* ---------- Tabs ---------- */
function activateTab(name) {
  for (const tab of $$('.tab')) tab.setAttribute('aria-selected', String(tab.dataset.tab === name));
  for (const panel of $$('.tabpanel')) panel.hidden = panel.id !== `panel-${name}`;
}

function goToTab(name) {
  activateTab(name);
  $('#servicios-promos').scrollIntoView();
  history.replaceState(null, '', `#${name}`);
}

function setupTabs() {
  for (const tab of $$('.tab')) tab.addEventListener('click', () => activateTab(tab.dataset.tab));
  $('.tabs').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const tabs = $$('.tab');
    const next = tabs[(tabs.findIndex((t) => t === document.activeElement) + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    next.focus();
    activateTab(next.dataset.tab);
  });
  for (const link of $$('[data-tab-link]')) {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      goToTab(link.dataset.tabLink);
    });
  }
  const initial = location.hash.replace('#', '');
  if (initial === 'promos' || initial === 'servicios') {
    activateTab(initial);
    requestAnimationFrame(() => $('#servicios-promos').scrollIntoView());
  }
}

/* ---------- Servicios ---------- */
function renderServices() {
  const grid = $('#service-grid');
  grid.replaceChildren(
    ...cfg.services.map((s) =>
      el(
        'article',
        { class: 'service-card' },
        el('h3', {}, s.name),
        el('p', {}, s.short),
        el(
          'div',
          { class: 'service-meta' },
          el('span', { class: 'price' }, money.format(s.price)),
          el('span', { class: 'duration' }, `${s.duration} min`),
        ),
        el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => openService(s.id) }, 'Ver descripción'),
      ),
    ),
  );
}

/* ---------- Promos ---------- */
function renderStamps() {
  const wrap = $('#stamps');
  const total = cfg.loyaltyStamps;
  const filled = Math.max(0, total - 1); // ejemplo: a un sello del corte gratis
  const nodes = [];
  for (let i = 0; i < total; i++) {
    const stamp = el('div', { class: i < filled ? 'stamp' : 'stamp empty', 'aria-hidden': 'true' });
    if (i < filled) stamp.innerHTML = '<svg viewBox="0 0 200 200"><use href="#logo"/></svg>';
    nodes.push(stamp);
  }
  nodes.push(el('div', { class: 'stamp free' }, 'Corte', el('br'), 'gratis'));
  wrap.replaceChildren(...nodes);
  $('#stamp-count').textContent = total;
}

/* ---------- Reserva ---------- */
const dlg = $('#booking');

function setStep(n) {
  for (const p of $$('.step')) p.hidden = p.dataset.panel !== String(n);
  for (const li of $$('.steps li')) {
    const s = Number(li.dataset.step);
    li.classList.toggle('current', s === n);
    li.classList.toggle('done', s < n);
  }
  dlg.scrollTop = 0;
}

function openService(id) {
  state.service = cfg.services.find((s) => s.id === id);
  state.date = null;
  state.time = null;
  const s = state.service;
  $('#booking-title').textContent = s.name;
  $('#svc-desc').textContent = s.description;
  $('#svc-duration').textContent = `${s.duration} min`;
  $('#svc-price').textContent = money.format(s.price);
  $('#svc-deposit').textContent = money.format(cfg.deposit);
  setStep(1);
  if (!dlg.open) dlg.showModal();
}

function renderDates() {
  const strip = $('#date-strip');
  const chips = [];
  for (let i = 0; i <= cfg.daysAhead; i++) {
    const date = addDays(cfg.today, i);
    const d = utcDate(date);
    if (!cfg.hours[d.getUTCDay()]) continue;
    chips.push(
      el(
        'button',
        { class: 'date-chip', type: 'button', role: 'option', 'aria-selected': 'false', 'data-date': date, onclick: () => pickDate(date) },
        el('span', { class: 'dow' }, i === 0 ? 'Hoy' : DAYS[d.getUTCDay()]),
        el('span', { class: 'day' }, String(d.getUTCDate())),
        el('span', { class: 'mon' }, MONTHS[d.getUTCMonth()]),
      ),
    );
  }
  strip.replaceChildren(...chips);
}

async function pickDate(date) {
  state.date = date;
  state.time = null;
  $('#go-step-3').disabled = true;
  for (const c of $$('.date-chip')) c.setAttribute('aria-selected', String(c.dataset.date === date));
  const grid = $('#time-grid');
  grid.replaceChildren(el('p', { class: 'muted' }, 'Buscando horarios…'));
  try {
    const { slots } = await api(`/api/slots?serviceId=${encodeURIComponent(state.service.id)}&date=${date}`);
    if (state.date !== date) return;
    const free = slots.filter((s) => s.available);
    if (!free.length) {
      grid.replaceChildren(el('p', { class: 'muted' }, 'No quedan horarios este día. Probá con otro.'));
      return;
    }
    grid.replaceChildren(
      ...slots.map((s) =>
        el(
          'button',
          { class: 'time-btn', type: 'button', 'aria-pressed': 'false', 'data-time': s.time, onclick: () => pickTime(s.time) },
          s.time,
        ),
      ),
    );
    slots.forEach((s, i) => { if (!s.available) grid.children[i].disabled = true; });
  } catch (err) {
    grid.replaceChildren(el('p', { class: 'form-error' }, err.message));
  }
}

function pickTime(time) {
  state.time = time;
  for (const b of $$('.time-btn')) b.setAttribute('aria-pressed', String(b.dataset.time === time));
  $('#go-step-3').disabled = false;
}

function renderSummary() {
  const s = state.service;
  const rows = [
    ['Servicio', s.name],
    ['Día', prettyDate(state.date)],
    ['Hora', `${state.time} h`],
    ['Valor del servicio', money.format(s.price)],
  ];
  const box = $('#summary');
  box.replaceChildren(
    ...rows.map(([k, v]) => el('div', {}, el('span', { class: 'k' }, k), el('span', {}, v))),
    el('div', { class: 'total' }, el('span', {}, 'Seña a pagar ahora'), el('span', {}, money.format(cfg.deposit))),
  );
  $('#pay-btn').textContent = `Pagar seña ${money.format(cfg.deposit)}`;
  $('#demo-banner').hidden = !cfg.demoMode;
}

async function submitBooking(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const err = $('#form-error');
  err.hidden = true;
  const data = Object.fromEntries(new FormData(form));
  const btn = $('#pay-btn');
  btn.disabled = true;
  btn.textContent = 'Procesando…';
  try {
    const res = await api('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceId: state.service.id, date: state.date, time: state.time, ...data }),
    });
    location.href = res.checkoutUrl;
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
    btn.disabled = false;
    renderSummary();
  }
}

function setupBooking() {
  $('#go-step-2').addEventListener('click', () => {
    $('#step2-title').textContent = state.service.name;
    renderDates();
    $('#time-grid').replaceChildren(el('p', { class: 'muted' }, 'Elegí un día para ver los horarios.'));
    $('#go-step-3').disabled = true;
    setStep(2);
  });
  $('#go-step-3').addEventListener('click', () => {
    renderSummary();
    setStep(3);
  });
  for (const b of $$('[data-back]')) b.addEventListener('click', () => setStep(Number(b.dataset.back)));
  for (const b of $$('[data-close]')) b.addEventListener('click', () => dlg.close());
  $('#booking-close').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  $('#booking-form').addEventListener('submit', submitBooking);
}

/* ---------- Inicio ---------- */
function renderHours() {
  const open = Object.entries(cfg.hours).filter(([, h]) => h);
  if (!open.length) return;
  const same = open.every(([, h]) => h[0] === open[0][1][0] && h[1] === open[0][1][1]);
  const names = open.map(([d]) => DAYS_LONG[d]);
  if (same) {
    const [from, to] = open[0][1];
    const label = names.length > 1 ? `${names[0]} a ${names[names.length - 1]}` : names[0];
    $('#hours-text').textContent = `${label[0].toUpperCase()}${label.slice(1)} de ${from.replace(':00', '')} a ${to.replace(':00', '')} h`;
  }
}

async function init() {
  setupTabs();
  setupBooking();
  try {
    cfg = await api('/api/config');
  } catch (err) {
    $('#service-grid').replaceChildren(el('p', { class: 'form-error' }, 'No pudimos cargar los servicios. Recargá la página.'));
    return;
  }
  $('#deposit-note').textContent = money.format(cfg.deposit);
  $('#ig-link').href = cfg.business.instagram;
  $('#ig-link').textContent = cfg.business.instagramHandle;
  renderHours();
  renderServices();
  renderStamps();
}

init();
