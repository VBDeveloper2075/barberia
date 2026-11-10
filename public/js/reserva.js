const $ = (s) => document.querySelector(s);
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const DAYS_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function prettyDate(str) {
  const d = new Date(`${str}T00:00:00Z`);
  return `${DAYS_LONG[d.getUTCDay()]} ${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]}`;
}

function row(k, v) {
  const div = document.createElement('div');
  const a = document.createElement('span');
  a.className = 'k';
  a.textContent = k;
  const b = document.createElement('span');
  b.textContent = v;
  div.append(a, b);
  return div;
}

function show(title, message, bad = false, booking = null) {
  const t = $('#title');
  t.textContent = title;
  t.className = bad ? 'status-bad' : 'status-ok';
  $('#message').textContent = message;
  const box = $('#summary');
  if (booking) {
    box.replaceChildren(
      row('Servicio', booking.serviceName),
      row('Día', prettyDate(booking.date)),
      row('Hora', `${booking.time} h`),
      row('Seña abonada', money.format(booking.deposit)),
      row('A nombre de', booking.name),
    );
    box.hidden = false;
  }
}

async function main() {
  const params = new URLSearchParams(location.search);
  const token = params.get('t');
  const paymentId = params.get('payment_id') || params.get('collection_id');
  if (!token) return show('Reserva no encontrada', 'El enlace no es válido.', true);

  try {
    const res = await fetch(`/api/bookings/${encodeURIComponent(token)}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentId }),
    });
    const b = await res.json();
    if (!res.ok) return show('Reserva no encontrada', b.error || 'Intentá de nuevo.', true);

    if (b.status === 'confirmed' || b.status === 'completed') {
      return show('¡Turno confirmado!', 'Te esperamos en Pedro Lozano 4372. ¡Gracias por elegirnos!', false, b);
    }
    if (b.status === 'refund') {
      return show(
        'Pago recibido, horario ocupado',
        'Mientras pagabas, otra persona tomó ese horario. Contactanos por Instagram y te devolvemos la seña o te damos otro turno.',
        true,
      );
    }
    if (b.status === 'cancelled' || b.expired) {
      return show('Reserva no confirmada', 'El pago no se completó y el horario fue liberado. Podés volver a intentarlo.', true);
    }
    show('Pago pendiente', 'Todavía no recibimos la confirmación del pago. Cuando se acredite, tu turno quedará confirmado. Podés actualizar esta página en unos minutos.');
  } catch {
    show('No pudimos verificar el pago', 'Revisá tu conexión y actualizá la página.', true);
  }
}

main();
