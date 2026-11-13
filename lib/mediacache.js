// ─── Caché de imágenes procesadas ──────────────────────────────────────────
// WhatsApp recomprime las imágenes que se envían como foto y les vuelve a
// poner fondo (JPEG). Cuando .sinfondo manda un PNG transparente, guardamos
// el PNG ORIGINAL en memoria asociado al ID del mensaje enviado. Si el usuario
// responde a esa foto con .hd/.hd2/.hd3/.hd4, se usa el PNG original y la
// transparencia se conserva de verdad.

const TTL_MS = 60 * 60 * 1000; // 1 hora
const MAX_ITEMS = 60;

const cache = new Map(); // id → { buffer, mime, at }
const lastTransparent = new Map(); // chat|usuario → { buffer, mime, at }

const LAST_TTL_MS = 30 * 60 * 1000; // 30 minutos
const LAST_MAX = 30;

function purge() {
  const now = Date.now();
  for (const [id, item] of cache) {
    if (!item || now - item.at > TTL_MS) cache.delete(id);
  }
  // Si sigue creciendo, se eliminan los más viejos (Map conserva el orden).
  while (cache.size > MAX_ITEMS) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
  for (const [key, item] of lastTransparent) {
    if (!item || now - item.at > LAST_TTL_MS) lastTransparent.delete(key);
  }
  while (lastTransparent.size > LAST_MAX) {
    const oldest = lastTransparent.keys().next().value;
    lastTransparent.delete(oldest);
  }
}

// Guarda el último PNG transparente de un chat/usuario. Sirve de respaldo
// cuando WhatsApp ya aplanó la foto y el ID del mensaje no coincide.
export function rememberLastTransparent(key, buffer, mime = 'image/png') {
  const clean = String(key || '').trim();
  if (!clean || !Buffer.isBuffer(buffer) || !buffer.length) return false;
  lastTransparent.set(clean, { buffer, mime, at: Date.now() });
  purge();
  return true;
}

export function recallLastTransparent(key) {
  const clean = String(key || '').trim();
  if (!clean) return null;
  const item = lastTransparent.get(clean);
  if (!item) return null;
  if (Date.now() - item.at > LAST_TTL_MS) {
    lastTransparent.delete(clean);
    return null;
  }
  return { buffer: item.buffer, mime: item.mime };
}

// Guarda una imagen procesada. `id` es el key.id del mensaje enviado.
export function rememberMedia(id, buffer, mime = 'image/png') {
  const key = String(id || '').trim();
  if (!key || !Buffer.isBuffer(buffer) || !buffer.length) return false;
  cache.set(key, { buffer, mime, at: Date.now() });
  purge();
  return true;
}

// Recupera la imagen original de un mensaje citado (o null si no está).
export function recallMedia(id) {
  const key = String(id || '').trim();
  if (!key) return null;
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.at > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return { buffer: item.buffer, mime: item.mime };
}

export function mediaCacheSize() {
  purge();
  return cache.size;
}
