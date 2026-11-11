// POST /api/admin/logout
import { clearSessionCookie } from '../../_lib/auth.js';
import { json } from '../../_lib/http.js';

export const onRequestPost = () => json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
