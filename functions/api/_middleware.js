// Se ejecuta antes de cada endpoint /api/*: valida el tipo de contenido,
// comprueba la base de datos y convierte cualquier error en una respuesta JSON.
import { HttpError, json } from '../_lib/http.js';

export async function onRequest({ request, env, next }) {
  try {
    const url = new URL(request.url);
    const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);

    // Solo se aceptan peticiones JSON (junto con SameSite=Strict, mitiga CSRF).
    // El webhook de Mercado Pago es la excepción.
    if (isWrite && url.pathname !== '/api/mp/webhook') {
      const type = request.headers.get('Content-Type') || '';
      if (!type.includes('application/json')) throw new HttpError(415, 'Content-Type inválido.');
    }

    if (!env.DB) throw new HttpError(500, 'Falta el binding de la base de datos (DB). Revisá wrangler.toml.');

    return await next();
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error(err);
    return json({ error: 'Error interno del servidor.' }, 500);
  }
}
