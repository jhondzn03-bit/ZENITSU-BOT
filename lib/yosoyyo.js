// ─── API Hub de YO SOY YO ──────────────────────────────────────────────────
// https://api-yosoyyo-api-ofc.onrender.com
// Se usa como respaldo cuando yt-dlp falla o cuando Pollinations está
// saturado. Requiere una API key: se configura con
//   .setapi yosoyyo TU_API_KEY
// o con la variable de entorno YOSOYYO_API_KEY.
import { db } from './db.js';
import { fetchJson, fetchBuffer, collectUrls, findTitle } from './utils.js';

const BASE = 'https://api-yosoyyo-api-ofc.onrender.com';

export function yosoyyoKey() {
  const fromEnv = String(process.env.YOSOYYO_API_KEY || '').trim();
  if (fromEnv) return fromEnv;
  try {
    const apis = db()?.apis || {};
    return String(apis.yosoyyo || apis.yosoyyyo || apis.yosoyyoKey || '').trim();
  } catch {
    return '';
  }
}

async function ysGet(path, params = {}, timeout = 90000) {
  const key = yosoyyoKey();
  if (!key) throw new Error('Falta la API key de YO SOY YO (.setapi yosoyyo TU_KEY)');
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  url.searchParams.set('apiKey', key);
  const data = await fetchJson(url.toString(), { headers: { accept: 'application/json' } }, timeout);
  if (data?.status === false) throw new Error(data.message || data.error || 'La API respondió con error');
  return data;
}

function pickAudioUrl(data) {
  const urls = collectUrls(data);
  const audio = urls.find((u) => /(?:mime|type)=audio|\.(?:m4a|mp3|opus|ogg|aac)(?:[?#]|$)/i.test(u));
  return audio || urls.find((u) => /(?:mime|type)=video|\.(?:mp4|webm|mkv)(?:[?#]|$)/i.test(u)) || urls[0] || '';
}

// Devuelve { audioUrl, title } usando /api/youtube/new (o /api/youtube/v2).
export async function yosoyyoYoutube(url) {
  let data;
  try {
    data = await ysGet('/api/youtube/new', { url });
  } catch (err) {
    data = await ysGet('/api/youtube/v2', { url });
  }
  const audioUrl = pickAudioUrl(data);
  if (!audioUrl) throw new Error('La API no devolvió un enlace de audio');
  return { audioUrl, title: findTitle(data) };
}

// Descarga el audio (o el video y le extrae el audio) como Buffer reproducible.
export async function yosoyyoAudioBuffer(url) {
  const { audioUrl, title } = await yosoyyoYoutube(url);
  const buffer = await fetchBuffer(
    audioUrl,
    { headers: { accept: '*/*' } },
    180000,
  );
  if (!buffer?.length) throw new Error('La API devolvió un archivo vacío');
  const looksAudio =
    /^ID3/.test(buffer.subarray(0, 3).toString('latin1')) ||
    buffer[0] === 0xff ||
    buffer.subarray(4, 8).toString('latin1') === 'ftyp' ||
    buffer.subarray(0, 4).toString('latin1') === 'OggS' ||
    buffer.subarray(0, 4).toString('latin1') === 'RIFF';
  if (looksAudio) return { buffer, title, audioUrl };
  const { mediaToAudio } = await import('./sticker.js');
  const mp3 = await mediaToAudio(buffer, 'mp4');
  return { buffer: mp3, title, audioUrl };
}

// Búsqueda de YouTube por texto.
export async function yosoyyoSearch(query, limit = 5) {
  const data = await ysGet('/api/ytsearch', { q: query });
  const list =
    data?.results || data?.videos || data?.data?.results || data?.data || (Array.isArray(data) ? data : []);
  const out = [];
  for (const item of Array.isArray(list) ? list : []) {
    const id = item?.videoId || item?.id || item?.video_id || '';
    const link =
      item?.url ||
      item?.link ||
      (id ? `https://www.youtube.com/watch?v=${id}` : '');
    if (!link || !/^https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(link)) continue;
    out.push({
      url: link,
      title: item?.title || item?.name || 'YouTube',
      author: item?.author || item?.channel || item?.uploader || '',
      duration: item?.duration || item?.timestamp || '',
      thumbnail: item?.thumbnail || item?.image || '',
    });
    if (out.length >= limit) break;
  }
  if (!out.length) throw new Error('La búsqueda de YouTube no devolvió resultados');
  return out;
}

// IA (DeepSeek) como respaldo de Pollinations.
export async function yosoyyoAi(prompt) {
  const data = await ysGet('/api/deepseek', { prompt }, 90000);
  const text =
    data?.result ||
    data?.response ||
    data?.answer ||
    data?.message ||
    data?.data?.response ||
    data?.data?.result ||
    (typeof data === 'string' ? data : '');
  if (!String(text || '').trim()) throw new Error('La IA no devolvió texto');
  return String(text).trim();
}
