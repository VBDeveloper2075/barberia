// Cualquier /api/... que no exista responde 404 en JSON.
import { json } from '../_lib/http.js';

export const onRequest = () => json({ error: 'No encontrado.' }, 404);
