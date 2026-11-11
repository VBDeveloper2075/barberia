// POST /api/admin/login — credenciales en las variables secretas ADMIN_USER y ADMIN_PASSWORD.
import { allowAttempt, createSessionCookie, safeEqual } from '../../_lib/auth.js';
import { HttpError, clientIp, json, readJson } from '../../_lib/http.js';

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_USER || !env.ADMIN_PASSWORD) {
    throw new HttpError(500, 'Falta configurar ADMIN_USER y ADMIN_PASSWORD en el servidor.');
  }
  if (!(await allowAttempt(env.DB, `login:${clientIp(request)}`, 10, 15 * 60 * 1000))) {
    throw new HttpError(429, 'Demasiados intentos. Esperá unos minutos.');
  }

  const { username, password } = await readJson(request);
  // Se evalúan ambas comparaciones siempre, para no revelar cuál falló.
  const userOk = await safeEqual(username ?? '', env.ADMIN_USER);
  const passOk = await safeEqual(password ?? '', env.ADMIN_PASSWORD);
  if (!userOk || !passOk) throw new HttpError(401, 'Usuario o clave incorrectos.');

  return json({ username: env.ADMIN_USER }, 200, {
    'Set-Cookie': await createSessionCookie(env, request, env.ADMIN_USER),
  });
}
