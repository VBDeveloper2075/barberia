// Sesión del dueño sin estado (cookie firmada con HMAC-SHA256) y límite de intentos en D1.
import { HttpError } from './http.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

export const SESSION_COOKIE = 'chivas_admin';
export const SESSION_MS = 1000 * 60 * 60 * 8;

const toB64Url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromB64Url = (str) => {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
};

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

// Comparación en tiempo constante (se comparan los SHA-256 de ambos textos).
export async function safeEqual(a, b) {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(String(a))),
    crypto.subtle.digest('SHA-256', enc.encode(String(b))),
  ]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function hmac(env, data) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 16) {
    throw new HttpError(500, 'Falta configurar SESSION_SECRET en el servidor.');
  }
  const key = await crypto.subtle.importKey('raw', enc.encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

export async function createSessionCookie(env, request, username) {
  const payload = toB64Url(enc.encode(JSON.stringify({ u: username, exp: Date.now() + SESSION_MS })));
  const sig = await hmac(env, payload);
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${payload}.${sig}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${secure}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}

function getCookie(request, name) {
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

// Devuelve { username } si la cookie es válida y no venció; si no, null.
export async function readSession(env, request) {
  const raw = getCookie(request, SESSION_COOKIE);
  if (!raw) return null;
  const [payload, sig] = raw.split('.');
  if (!payload || !sig) return null;
  if (!(await safeEqual(sig, await hmac(env, payload)))) return null;
  try {
    const data = JSON.parse(dec.decode(fromB64Url(payload)));
    if (typeof data.exp !== 'number' || data.exp < Date.now()) return null;
    return { username: String(data.u) };
  } catch {
    return null;
  }
}

export async function requireAdmin(env, request) {
  const admin = await readSession(env, request);
  if (!admin) throw new HttpError(401, 'No autorizado.');
  return admin;
}

// Limitador por ventana fija guardado en D1. Devuelve true si todavía se permite el intento.
export async function allowAttempt(db, key, max, windowMs) {
  const now = Date.now();
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN window_start < ?3 THEN 1 ELSE count + 1 END,
         window_start = CASE WHEN window_start < ?3 THEN ?2 ELSE window_start END
       RETURNING count`,
    )
    .bind(key, now, now - windowMs)
    .first();
  return row.count <= max;
}
