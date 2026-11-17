// ─── API Hub de YO SOY YO ──────────────────────────────────────────────────
// https://api-yosoyyo-api-ofc.onrender.com
// Se usa como respaldo cuando yt-dlp falla o cuando Pollinations está
// saturado. Requiere una API key: se configura con
//   .setapi yosoyyo TU_API_KEY
// o con la variable de entorno YOSOYYO_API_KEY.
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { db } from './db.js';
import { fetchJson, fetchBuffer, collectUrls, findTitle } from './utils.js';

const DEFAULT_BASE = 'https://api-yosoyyo-api-ofc.onrender.com';

// La URL base se puede cambiar con `.setapi youtube https://...` (el owner ya
// puede tenerla guardada así) o con la variable YOSOYYO_API_URL.
export function yosoyyoBase() {
  const fromEnv = String(process.env.YOSOYYO_API_URL || '').trim();
  const candidates = [fromEnv];
  try {
    const apis = db()?.apis || {};
    candidates.push(apis.youtube, apis.yosoyyoUrl, apis.yosoyyo_url);
  } catch {}
  for (const value of candidates) {
    const url = String(value || '').trim().replace(/\/+$/, '');
    if (/^https?:\/\//i.test(url)) return url;
  }
  return DEFAULT_BASE;
}

// La key también puede venir de un archivo local (assets/yosoyyo-key.txt),
// que NO se sube a GitHub. Así el owner la deja puesta sin tocar la base.
function yosoyyoKeyFile() {
  const custom = String(process.env.YOSOYYO_KEY_FILE || '').trim();
  const candidates = [custom, path.join(config.assetsDir, 'yosoyyo-key.txt')].filter(Boolean);
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const text = fs.readFileSync(file, 'utf8').trim();
      if (text) return text;
    } catch {}
  }
  return '';
}

export function yosoyyoKey() {
  const fromEnv = String(process.env.YOSOYYO_API_KEY || '').trim();
  if (fromEnv) return fromEnv;
  try {
    const apis = db()?.apis || {};
    const fromDb = String(apis.yosoyyo || apis.yosoyyyo || apis.yosoyyoKey || '').trim();
    if (fromDb) return fromDb;
  } catch {}
  return yosoyyoKeyFile();
}

async function ysGet(path, params = {}, timeout = 90000) {
  const key = yosoyyoKey();
  if (!key) throw new Error('Falta la API key de YO SOY YO (.setapi yosoyyo TU_KEY)');
  const url = new URL(path, yosoyyoBase());
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  url.searchParams.set('apiKey', key);
  const data = await fetchJson(url.toString(), { headers: { accept: 'application/json' } }, timeout);
  if (data?.status === false) throw new Error(data.message || data.error || 'La API respondió con error');
  return data;
}

// Comprueba la key con una búsqueda real: /api/status devuelve la web (HTML),
// así que la mejor prueba es /api/ytsearch.
export async function yosoyyoCheckKey() {
  if (!yosoyyoKey()) {
    return { configured: false, valid: false, message: 'sin key' };
  }
  try {
    const data = await ysGet('/api/ytsearch', { q: 'test' }, 45000);
    const results = Array.isArray(data?.result) ? data.result.length : 0;
    return {
      configured: true,
      valid: true,
      message: results ? `key válida (${results} resultados)` : 'key válida',
    };
  } catch (err) {
    return { configured: true, valid: false, message: err?.message || String(err) };
  }
}

function pickAudioUrl(data) {
  const urls = collectUrls(data);
  const audio = urls.find((u) => /(?:mime|type)=audio|\.(?:m4a|mp3|opus|ogg|aac)(?:[?#]|$)/i.test(u));
  return audio || urls.find((u) => /(?:mime|type)=video|\.(?:mp4|webm|mkv)(?:[?#]|$)/i.test(u)) || urls[0] || '';
}

// Descarga de YouTube. El proveedor movió el downloader a /api/youtube/new
// (v2 responde "usa /api/youtube/new"), así que se prueban los dos y se
// ignoran los enlaces que sean la propia página de YouTube.
export async function yosoyyoYoutube(url) {
  const attempts = [
    ['/api/youtube/new', { url }],
    ['/api/youtube/v2', { url, format: 'mp3' }],
    ['/api/youtube/v2', { url }],
  ];
  let lastError;
  for (const [endpoint, params] of attempts) {
    try {
      const data = await ysGet(endpoint, params, 120000);
      const audioUrl = pickAudioUrl(data);
      if (!audioUrl || /youtube\.com\/watch|youtu\.be\//i.test(audioUrl)) {
        throw new Error(data?.message || 'La API no devolvió un enlace de audio');
      }
      return { audioUrl, title: findTitle(data) };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('La API no devolvió un enlace de audio');
}

// Título de un video de YouTube sin descargarlo (para el respaldo de Spotify).
export async function yosoyyoYoutubeTitle(url) {
  try {
    const data = await ysGet('/api/ytlist', { url }, 60000);
    const first = data?.result?.videos?.[0];
    return String(first?.title || findTitle(data) || '').trim();
  } catch {
    return '';
  }
}

// Spotify: búsqueda de canciones.
export async function yosoyyoSpotifySearch(query, limit = 5) {
  const data = await ysGet('/api/spotifysearch', { q: query }, 60000);
  const result = data?.result || {};
  const tracks = Array.isArray(result.tracks) ? result.tracks : [];
  const out = [];
  for (const t of tracks) {
    const link = t?.url || (t?.id ? `https://open.spotify.com/track/${t.id}` : '');
    if (!link) continue;
    out.push({
      title: t?.name || 'Spotify',
      artist: (Array.isArray(t?.artists) ? t.artists : []).map((a) => a?.name).filter(Boolean).join(', '),
      url: link,
      cover: t?.images?.[0]?.url || t?.album?.images?.[0]?.url || '',
      durationMs: Number(t?.duration_ms) || 0,
    });
    if (out.length >= limit) break;
  }
  if (!out.length) throw new Error('Spotify no devolvió resultados');
  return out;
}

// Respaldo de audio cuando YouTube está bloqueado: busca la canción en
// Spotify y descarga el MP3. Sirve para música (la mayoría de .play).
export async function yosoyyoSpotifyAudio(query) {
  const tracks = await yosoyyoSpotifySearch(query, 5);
  let lastError;
  for (const track of tracks) {
    try {
      const data = await ysGet('/api/spotifydl', { url: track.url }, 120000);
      const dl = data?.result?.dl || data?.result?.download || '';
      if (!dl) throw new Error('Spotify no devolvió enlace de descarga');
      const buffer = await fetchBuffer(
        dl,
        { headers: { accept: '*/*', 'user-agent': 'Mozilla/5.0', referer: 'https://open.spotify.com/' } },
        180000,
      );
      if (!buffer?.length) throw new Error('La descarga de Spotify llegó vacía');
      return {
        buffer,
        title: data?.result?.title || track.title,
        artist: data?.result?.author || track.artist,
        audioUrl: dl,
      };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('No se pudo descargar la canción de Spotify');
}

// Descarga el audio (o el video y le extrae el audio) como Buffer reproducible.
export async function yosoyyoAudioBuffer(url) {
  try {
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
  } catch (ytError) {
    // Respaldo Spotify: la API de YouTube del proveedor puede fallar.
    const title = (await yosoyyoYoutubeTitle(url)) || '';
    try {
      const sp = await yosoyyoSpotifyAudio(title || url);
      return { ...sp, via: 'spotify' };
    } catch (spError) {
      throw new Error(
        `${ytError?.message || ytError} · Spotify: ${spError?.message || spError}`,
      );
    }
  }
}

// Búsqueda de YouTube por texto.
export async function yosoyyoSearch(query, limit = 5) {
  const data = await ysGet('/api/ytsearch', { q: query }, 60000);
  const list = Array.isArray(data?.result)
    ? data.result
    : data?.results || data?.videos || data?.data?.results || data?.data || [];
  const out = [];
  for (const item of Array.isArray(list) ? list : []) {
    const id = item?.videoId || item?.id || item?.video_id || '';
    const link =
      item?.videoUrl ||
      item?.url ||
      item?.link ||
      (id ? `https://www.youtube.com/watch?v=${id}` : '');
    if (!link || !/^https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(link)) continue;
    out.push({
      url: link,
      title: item?.title || item?.name || 'YouTube',
      author: item?.channelName || item?.author || item?.channel || item?.uploader || '',
      duration: item?.duration || item?.timestamp || '',
      thumbnail: item?.thumbnailUrl || item?.thumbnail || item?.image || '',
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
