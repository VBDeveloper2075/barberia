// POST /api/admin/login  { "password": "..." }
// La clave del dueño está en la variable secreta ADMIN_PASSWORD. Si coincide, se entrega
// una cookie de sesión firmada (HttpOnly) que el navegador envía sola en las siguientes llamadas.
import { allowAttempt, createSessionCookie, safeEqual } from '../../_lib/auth.js';
import { HttpError, clientIp, json, readJson } from '../../_lib/http.js';

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_PASSWORD) {
    throw new HttpError(500, 'Falta configurar la variable ADMIN_PASSWORD en el servidor.');
  }
  if (!(await allowAttempt(env.DB, `login:${clientIp(request)}`, 10, 15 * 60 * 1000))) {
    throw new HttpError(429, 'Demasiados intentos. Esperá unos minutos.');
  }

  const { password } = await readJson(request);
  if (!(await safeEqual(password ?? '', env.ADMIN_PASSWORD))) {
    throw new HttpError(401, 'Clave incorrecta.');
  }

  return json({ ok: true }, 200, {
    'Set-Cookie': await createSessionCookie(env, request, 'admin'),
  });
}
