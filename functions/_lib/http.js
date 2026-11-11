export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

// Lee el cuerpo JSON con límite de tamaño. Devuelve {} si viene vacío.
export async function readJson(request, maxChars = 20000) {
  const text = await request.text();
  if (text.length > maxChars) throw new HttpError(413, 'Solicitud demasiado grande.');
  if (!text.trim()) return {};
  try {
    const data = JSON.parse(text);
    return data && typeof data === 'object' ? data : {};
  } catch {
    throw new HttpError(400, 'JSON inválido.');
  }
}

export const clientIp = (request) => request.headers.get('CF-Connecting-IP') || 'local';

export function baseUrl(env, request) {
  return (env.PUBLIC_URL || new URL(request.url).origin).replace(/\/$/, '');
}
