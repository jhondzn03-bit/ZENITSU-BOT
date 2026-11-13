// ─── Stickers aleatorios ────────────────────────────────────────────────────
// Fuente principal: Sticker.ly (PNG transparentes, stickers de verdad). Si
// falla, se usan imágenes SFW de nekos.best. Se convierten a WebP y se mandan
// DE VERDAD a un chat (canal o grupo). Solo cuenta como enviado el sticker que
// WhatsApp confirmó (con key.id); lo demás se reporta como fallido/omitido.
// El historial de hashes evita repetir stickers entre ejecuciones.
import crypto from 'node:crypto';
import { db, save } from './db.js';
import { fetchBuffer, fetchJson, sleep } from './utils.js';
import { collectStickerlyStickers } from './stickerly.js';
import { mediaToSticker } from './sticker.js';

const STICKER_CATEGORIES = ['waifu', 'neko', 'kitsune', 'husbando'];

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Junta hasta `limit` URLs de imágenes aleatorias (sin repetir) de nekos.best.
// Tope global de tiempo (45s por defecto): si la API está lenta o caída, se
// devuelve lo que haya en vez de dejar el comando colgado minutos.
export async function collectImageUrls(limit, deadlineMs = 45000, options = {}) {
  // 1) Sticker.ly: stickers buenos, transparentes y ya recortados.
  if (options.source !== 'nekos') {
    try {
      const found = await collectStickerlyStickers(limit, options.keyword || '');
      if (found.urls.length) {
        console.log(`[STICKERS] Sticker.ly "${found.query}" → ${found.urls.length} stickers`);
        return found.urls;
      }
    } catch (err) {
      console.log(`[STICKERS] Sticker.ly falló: ${err?.message || err}`);
    }
  }

  // 2) Respaldo: imágenes de nekos.best.
  const urls = [];
  const seen = new Set();
  const started = Date.now();
  for (let round = 0; round < 8 && urls.length < limit; round++) {
    for (const category of shuffle(STICKER_CATEGORIES)) {
      if (urls.length >= limit) break;
      if (Date.now() - started > deadlineMs) return urls;
      try {
        const data = await fetchJson(
          `https://nekos.best/api/v2/${category}?amount=20`,
          {},
          15000,
        );
        for (const item of data?.results || []) {
          const url = item?.url;
          if (!url || seen.has(url)) continue;
          seen.add(url);
          urls.push(url);
          if (urls.length >= limit) break;
        }
      } catch {}
    }
  }
  return urls;
}

// Envía hasta `count` stickers NUEVOS a `jid` y devuelve el conteo real.
//   onProgress(sent, count): se llama después de cada sticker confirmado.
//   candidates: opcional; imágenes ya descargadas para reutilizar entre varios
//               canales (así los dos canales reciben los mismos stickers).
// El historial se guarda POR DESTINO (jid|hash): un sticker enviado a un canal
// no se marca como repetido en el otro.
export async function sendStickerBatch(sock, jid, count, { onProgress, candidates } = {}) {
  const data = db();
  if (!Array.isArray(data.canalStickerHistory)) data.canalStickerHistory = [];
  const history = new Set(data.canalStickerHistory);
  const usedNow = new Set();
  const pack = data.stickerPack || 'ZENITSU BOT';
  const author = data.stickerAuthor || 'Zenitsu';
  const scope = String(jid || '');
  const keyOf = (hash) => `${scope}|${hash}`;

  const kind = String(jid || '').endsWith('@newsletter') ? 'CANAL' : 'GRUPO/CHAT';
  console.log(`[STICKERS] inicio → ${kind} ${jid} | pedidos=${count}`);

  const pool = Array.isArray(candidates) && candidates.length
    ? candidates
    : await collectImageUrls(Math.min(240, count * 4));
  if (!pool.length) {
    console.log(`[STICKERS] sin imágenes para ${jid} (nekos.best lento/caído)`);
    return { sent: 0, failed: 0, skipped: 0, noImages: true };
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let asImage = 0;
  const errors = [];

  for (const url of pool) {
    if (sent >= count) break;
    try {
      const image = await fetchBuffer(url, {}, 30000);
      const imageHash = crypto.createHash('sha256').update(image).digest('hex');
      if (usedNow.has(imageHash) || history.has(keyOf(imageHash))) {
        skipped++;
        continue;
      }

      const webp = await mediaToSticker(image, { pack, author });
      const webpHash = crypto.createHash('sha256').update(webp).digest('hex');
      if (usedNow.has(webpHash) || history.has(keyOf(webpHash))) {
        skipped++;
        continue;
      }

      // Envío real: si WhatsApp no devuelve key.id, no se cuenta.
      // En canales, si el sticker no está soportado, se manda el PNG original
      // (transparente) como imagen para que igual se vea el sticker.
      const isChannel = scope.endsWith('@newsletter');
      let msg = null;
      let lastErr = null;
      try {
        msg = await sock.sendMessage(jid, { sticker: webp });
      } catch (err) {
        lastErr = err;
        if (!isChannel) throw err;
      }
      if (!msg?.key?.id && isChannel) {
        try {
          msg = await sock.sendMessage(jid, { image, mimetype: 'image/png' });
          if (msg?.key?.id) asImage++;
        } catch (err) {
          lastErr = err;
        }
      }
      if (!msg?.key?.id) {
        throw lastErr || new Error('WhatsApp no confirmó el sticker');
      }

      usedNow.add(imageHash);
      usedNow.add(webpHash);
      data.canalStickerHistory.push(keyOf(imageHash), keyOf(webpHash));
      sent++;
      save();
      if (sent === 1) {
        console.log(`[STICKERS] primer sticker confirmado en ${jid} (key.id=${msg.key.id})`);
      }

      if (onProgress) {
        try {
          await onProgress(sent, count);
        } catch {}
      }
      // Pequeña pausa para no saturar el chat.
      await sleep(350);
    } catch (err) {
      failed++;
      if (errors.length < 3) errors.push(String(err?.message || err));
    }
  }

  // El historial no crece sin límite: se guardan los últimos 800 hashes.
  if (data.canalStickerHistory.length > 800) {
    data.canalStickerHistory = data.canalStickerHistory.slice(-800);
  }
  save();

  console.log(
    `[STICKERS] fin → ${kind} ${jid} | enviados=${sent} (imagen=${asImage}) fallidos=${failed} repetidos=${skipped}` +
      (errors.length ? ` | errores: ${errors.join(' ; ')}` : ''),
  );
  return { sent, failed, skipped, asImage, errors, noImages: false };
}
