import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../config.js';

export const WATERMARK = config.watermark;

const execFileAsync = promisify(execFile);

/* ─────────────────────────── Texto / marca de agua ────────────────────────── */

export function withWatermark(text = '') {
  const t = String(text ?? '').trimEnd();
  // Sin marca configurada el texto sale limpio: el banner del canal se
  // aplica aparte en watermarkContent.
  if (!WATERMARK) return t;
  if (!t) return WATERMARK;
  if (t.endsWith(WATERMARK)) return t;
  return `${t}\n\n${WATERMARK}`;
}

import { db } from './db.js';

export function watermarkContent(content) {
  if (!content || typeof content !== 'object') return content;
  if (typeof content.text === 'string') content.text = withWatermark(content.text);
  if (typeof content.caption === 'string') content.caption = withWatermark(content.caption);
  // Apariencia "⮩ Reenviado desde <canal>" en TODOS los mensajes del bot.
  // WhatsApp renderiza el banner con el nombre del canal y su enlace.
  try {
    const c = db().channel;
    if (c?.jid) {
      content.contextInfo = {
        ...(content.contextInfo || {}),
        isForwarded: true,
        forwardingScore: 999,
        forwardedNewsletterMessageInfo: {
          newsletterJid: c.jid,
          newsletterName: c.name || 'ZENITSU',
          serverMessageId: 1,
          contentType: 1,
          accessibilityText: 'Update',
        },
      };
    }
  } catch {}
  return content;
}

// Tipos de contenido que aceptan contextInfo (banner de reenvío). Se dejan
// fuera reacciones, borrados, presencia, pins y demás mensajes de protocolo.
const BANNER_CONTENT_KEYS = new Set([
  'text',
  'image',
  'video',
  'audio',
  'document',
  'sticker',
  'album',
  'contacts',
  'location',
  'poll',
  'event',
]);

// Envuelve sock.sendMessage para que TODO mensaje salga "Reenviado desde" el
// canal configurado, aunque un comando llame al socket directamente en vez
// de usar ctx.send. Es idempotente: aplicar el banner dos veces no molesta.
export function applyChannelBanner(sock) {
  if (!sock || typeof sock.sendMessage !== 'function' || sock.__zenitsuBanner) return sock;
  const original = sock.sendMessage.bind(sock);
  sock.sendMessage = async (jid, content, options) => {
    try {
      const target = String(jid || '');
      const skip = /@newsletter$/i.test(target) || /^status@broadcast$/i.test(target);
      if (!skip && content && typeof content === 'object') {
        const key = Object.keys(content).find((k) => BANNER_CONTENT_KEYS.has(k));
        if (key) content = watermarkContent({ ...content });
      }
    } catch {}
    return original(jid, content, options);
  };
  sock.__zenitsuBanner = true;
  return sock;
}

export function truncate(text, max = 4000) {
  const s = String(text ?? '');
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n… (recortado)`;
}

/* ─────────────────────────────── Utilidades ──────────────────────────────── */

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function capitalize(s = '') {
  return String(s).charAt(0).toUpperCase() + String(s).slice(1);
}

export function formatNumber(n) {
  return Number(n || 0).toLocaleString('es-ES');
}

export function formatBytes(bytes = 0) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

export function formatDuration(ms = 0) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${sec}s`);
  return parts.join(' ');
}

export function levelFromXp(xp = 0) {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1);
}

export function xpForLevel(level = 1) {
  return Math.max(0, (level - 1) ** 2 * 100);
}

export function progressBar(value, max, size = 10) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const filled = Math.round(pct * size);
  return `${'█'.repeat(filled)}${'░'.repeat(Math.max(0, size - filled))} ${Math.round(pct * 100)}%`;
}

/* ─────────────────────────────── JIDs / URLs ─────────────────────────────── */

// Los eventos stub de grupo (promote/demote/add/remove) traen los
// participantes a veces como objeto {id, server} (formato LID de WhatsApp)
// en vez de JID string. Esto devuelve SIEMPRE un JID string "id@server"
// (o '' si no se puede), sin sufijo de dispositivo (:12).
export function toJid(x) {
  if (!x) return '';
  if (typeof x === 'string') {
    return x.replace(/:(\d+)@/, '@');
  }
  if (typeof x === 'object') {
    const id = typeof x.id === 'string' ? x.id : '';
    let server = typeof x.server === 'string' ? x.server : '';
    if (server === 'c.us') server = 's.whatsapp.net'; // alias de WhatsApp
    if (id) return `${id}@${server || 's.whatsapp.net'}`;
  }
  return '';
}

export function jidToNumber(jid = '') {
  const s = toJid(jid) || String(jid ?? '');
  return s.split('@')[0].split(':')[0].replace(/\D/g, '');
}

export function numberToJid(number) {
  const n = String(number || '').replace(/\D/g, '');
  return `${n}@s.whatsapp.net`;
}

export function normalizeJid(jid = '') {
  if (!jid) return '';
  if (jid.endsWith('@g.us') || jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid')) return jid;
  if (jid.includes('@')) return jid;
  return numberToJid(jid);
}

export function isUrl(text = '') {
  return /^https?:\/\/[^\s]+$/i.test(String(text).trim());
}

export function extractUrl(text = '') {
  const m = String(text).match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0] : '';
}

export function isImageMime(mime = '') {
  return /^image\//i.test(mime);
}

export function isVideoMime(mime = '') {
  return /^video\//i.test(mime);
}

export function isAudioMime(mime = '') {
  return /^audio\//i.test(mime);
}

export function extensionForMime(mime = '') {
  const map = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'application/pdf': 'pdf',
  };
  return map[String(mime).split(';')[0].trim()] || 'bin';
}

/* ──────────────────────────────── HTTP / APIs ────────────────────────────── */

export async function fetchWithTimeout(url, options = {}, timeout = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        // nekos.best y otros servicios bloquean User-Agents genéricos o con "Termux".
        // Un UA descriptivo del bot funciona y no dispara Cloudflare.
        'user-agent':
          'ZENITSU-BOT/2.0 (WhatsApp Bot; +https://github.com/jhondzn03-bit/ZENITSU-BOT)',
        accept: 'application/json, text/plain, */*',
        ...(options.headers || {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson(url, options = {}, timeout = 25000) {
  const res = await fetchWithTimeout(url, options, timeout);
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${new URL(url).hostname}`);
  return res.json();
}

export async function fetchText(url, options = {}, timeout = 25000) {
  const res = await fetchWithTimeout(url, options, timeout);
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${new URL(url).hostname}`);
  return res.text();
}

export async function fetchBuffer(url, options = {}, timeout = 60000) {
  const res = await fetchWithTimeout(url, options, timeout);
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${new URL(url).hostname}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

// Descarga una URL a disco sin cargar todo en RAM (películas, videos
// grandes). Devuelve el número de bytes escritos.
export async function downloadToFile(url, destPath, options = {}) {
  const { timeout = 15 * 60 * 1000, headers = {} } = options;
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  const res = await fetchWithTimeout(
    url,
    { headers: { 'user-agent': 'ZENITSU-BOT/2.5 (WhatsApp Bot)', ...headers } },
    timeout,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar`);
  if (!res.body) throw new Error('La descarga no devolvió datos');

  const { Readable } = await import('node:stream');
  const { pipeline } = await import('node:stream/promises');
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(destPath));
  const stat = await fs.promises.stat(destPath);
  if (!stat.size) throw new Error('El archivo descargado está vacío');
  return stat.size;
}

export function decodeHtml(text = '') {
  return String(text)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

export function stripHtml(text = '') {
  return decodeHtml(String(text).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}

export function collectUrls(obj, out = [], depth = 0) {
  if (depth > 8 || obj == null) return out;
  if (typeof obj === 'string') {
    if (/^https?:\/\//i.test(obj)) out.push(obj);
    return out;
  }
  if (Array.isArray(obj)) {
    for (const v of obj) collectUrls(v, out, depth + 1);
    return out;
  }
  if (typeof obj === 'object') {
    for (const v of Object.values(obj)) collectUrls(v, out, depth + 1);
  }
  return out;
}

export function findTitle(obj, depth = 0) {
  if (depth > 6 || obj == null) return '';
  if (typeof obj === 'object') {
    for (const key of ['title', 'name', 'filename', 'fileName', 'caption', 'description']) {
      if (typeof obj[key] === 'string' && obj[key].trim() && obj[key].length < 200) return obj[key].trim();
    }
    for (const v of Object.values(obj)) {
      const t = findTitle(v, depth + 1);
      if (t) return t;
    }
  }
  return '';
}

/* ───────────────────────────────── FFmpeg ───────────────────────────────── */

export function tmpFile(ext = 'bin') {
  fs.mkdirSync(config.tmpDir, { recursive: true });
  return path.join(config.tmpDir, `zenitsu-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`);
}

export async function runFfmpeg(args, timeout = 120000) {
  try {
    const bin = await ensureFfmpeg();
    const { stdout, stderr } = await execFileAsync(bin, ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
      timeout,
      maxBuffer: 8 * 1024 * 1024,
    });
    return { stdout, stderr };
  } catch (err) {
    throw new Error(err.stderr?.trim() || err.message || 'Error de ffmpeg');
  }
}

export async function probeDuration(filePath) {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath],
      { timeout: 30000, maxBuffer: 1024 * 1024 },
    );
    return Number(String(stdout).trim()) || 0;
  } catch {
    // Sin ffprobe (pasa en servidores que solo tienen ffmpeg) se lee la
    // duración de la cabecera que imprime ffmpeg -i.
    try {
      const bin = await ensureFfmpeg();
      const { stderr } = await execFileAsync(bin, ['-hide_banner', '-i', filePath], {
        timeout: 30000,
        maxBuffer: 4 * 1024 * 1024,
      }).catch((err) => ({ stderr: err.stderr || '' }));
      const m = String(stderr || '').match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    } catch {}
    return 0;
  }
}

// ── ffmpeg ────────────────────────────────────────────────────────────────
// En muchos paneles (HidenCloud incluido) ffmpeg no viene instalado y entonces
// fallan .play, .voz, .stickerly y la compresión de videos. Si falta, se baja
// un binario estático (comprimido en .gz) a tmp/bin y se usa ese.
let ffmpegResolved = null;
let ffmpegInstalling = null;

function ffmpegAssetName() {
  if (process.platform === 'linux') {
    if (process.arch === 'arm64') return 'ffmpeg-linux-arm64.gz';
    if (process.arch === 'arm') return 'ffmpeg-linux-arm.gz';
    if (process.arch === 'ia32') return 'ffmpeg-linux-ia32.gz';
    return 'ffmpeg-linux-x64.gz';
  }
  if (process.platform === 'darwin') {
    return process.arch === 'arm64' ? 'ffmpeg-darwin-arm64.gz' : 'ffmpeg-darwin-x64.gz';
  }
  if (process.platform === 'win32') return 'ffmpeg-win32-x64.gz';
  return '';
}

async function ffmpegVersion(bin) {
  try {
    const { stdout } = await execFileAsync(bin, ['-version'], { timeout: 15000 });
    return String(stdout || '').split('\n')[0].trim();
  } catch {
    return '';
  }
}

export async function ensureFfmpeg() {
  if (ffmpegResolved) return ffmpegResolved;
  if (ffmpegInstalling) return ffmpegInstalling;

  ffmpegInstalling = (async () => {
    const win = process.platform === 'win32';
    const localBin = path.join(config.tmpDir, 'bin', win ? 'ffmpeg.exe' : 'ffmpeg');
    const tmpBin = path.join(os.tmpdir(), win ? 'zenitsu-ffmpeg.exe' : 'zenitsu-ffmpeg');
    for (const bin of [process.env.FFMPEG_PATH, 'ffmpeg', localBin, tmpBin].filter(Boolean)) {
      if (await ffmpegVersion(bin)) {
        ffmpegResolved = bin;
        return bin;
      }
    }

    const asset = ffmpegAssetName();
    if (!asset) throw new Error('no hay un ffmpeg estático para esta plataforma');
    const url = `https://github.com/eugeneware/ffmpeg-static/releases/latest/download/${asset}`;
    const gz = `${localBin}.gz`;
    try {
      await fs.promises.mkdir(path.dirname(localBin), { recursive: true });
      await downloadToFile(url, gz, { timeout: 10 * 60 * 1000 });
      const { pipeline } = await import('node:stream/promises');
      const zlib = await import('node:zlib');
      await pipeline(fs.createReadStream(gz), zlib.createGunzip(), fs.createWriteStream(localBin));
      await fs.promises.rm(gz, { force: true });
      await fs.promises.chmod(localBin, 0o755);
    } catch (err) {
      throw new Error(`ffmpeg no está instalado y no pude descargarlo (${err.message})`);
    }

    // Igual que con yt-dlp: si la carpeta del proyecto es noexec, se prueba /tmp.
    for (const target of [localBin, tmpBin]) {
      try {
        if (target !== localBin) {
          await fs.promises.copyFile(localBin, target);
          await fs.promises.chmod(target, 0o755);
        }
        if (await ffmpegVersion(target)) {
          ffmpegResolved = target;
          return target;
        }
      } catch {}
    }
    throw new Error('descargué ffmpeg pero no pude ejecutarlo en el servidor');
  })();

  try {
    return await ffmpegInstalling;
  } finally {
    ffmpegInstalling = null;
  }
}


// o la ruta de un archivo ya descargado (mejor para videos grandes).
// Prueba varias calidades/recortes y devuelve el primero que quepa.
// Devuelve { buffer, bytes, seconds, trimmed, height } o null si no pudo.
export async function compressVideoForWhatsApp(input, { maxBytes = 45 * 1024 * 1024, maxSeconds = 600 } = {}) {
  const fromBuffer = Buffer.isBuffer(input);
  const source = fromBuffer ? tmpFile('mp4') : String(input);
  const output = tmpFile('mp4');
  try {
    if (fromBuffer) fs.writeFileSync(source, input);
    if (!fs.existsSync(source)) throw new Error('el video de entrada no existe');

    const duration = await probeDuration(source);
    const full = duration > 0 ? Math.min(duration, maxSeconds) : 0;
    const attempts = [
      { limit: full ? Math.ceil(full) : 0, height: 480, kbps: 400, audio: '64k', trimmed: false },
      { limit: full ? Math.ceil(full) : 0, height: 426, kbps: 280, audio: '48k', trimmed: false },
      { limit: Math.min(300, full ? Math.ceil(full) : 300), height: 480, kbps: 350, audio: '64k', trimmed: true },
      { limit: Math.min(120, full ? Math.ceil(full) : 120), height: 480, kbps: 300, audio: '48k', trimmed: true },
    ];

    for (const a of attempts) {
      const args = ['-i', source];
      if (a.limit > 0) args.push('-t', String(a.limit));
      args.push(
        '-map', '0:v:0',
        '-map', '0:a?',
        '-vf', `scale=-2:${a.height}`,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-b:v', `${a.kbps}k`,
        '-maxrate', `${a.kbps}k`,
        '-bufsize', `${a.kbps * 2}k`,
        '-c:a', 'aac',
        '-b:a', a.audio,
        '-movflags', '+faststart',
        '-pix_fmt', 'yuv420p',
        output,
      );
      try {
        await runFfmpeg(args, 420000);
      } catch {
        continue;
      }
      if (!fs.existsSync(output)) continue;
      const size = fs.statSync(output).size;
      if (size > 0 && size <= maxBytes) {
        return {
          buffer: fs.readFileSync(output),
          bytes: size,
          seconds: a.limit,
          trimmed: a.trimmed && duration > a.limit + 2,
          height: a.height,
        };
      }
      fs.rmSync(output, { force: true });
    }
    return null;
  } finally {
    fs.rmSync(output, { force: true });
    if (fromBuffer) fs.rmSync(source, { force: true });
  }
}

export async function execShell(command, timeout = 30000) {
  try {
    const { stdout, stderr } = await execFileAsync('/bin/sh', ['-c', command], {
      timeout,
      maxBuffer: 4 * 1024 * 1024,
    });
    return { ok: true, stdout, stderr };
  } catch (err) {
    return { ok: false, stdout: err.stdout || '', stderr: err.stderr || err.message };
  }
}

export async function cleanTmp(maxAgeMs = 30 * 60 * 1000) {
  try {
    fs.mkdirSync(config.tmpDir, { recursive: true });
    const now = Date.now();
    for (const f of fs.readdirSync(config.tmpDir)) {
      const p = path.join(config.tmpDir, f);
      try {
        if (now - fs.statSync(p).mtimeMs > maxAgeMs) fs.rmSync(p, { force: true });
      } catch {}
    }
  } catch {}
}

/* ──────────────────────────────── Varios ────────────────────────────────── */

export function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export function hashToPercent(seed = '') {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 101;
}

export function formatDate(date = new Date(), timeZone = config.timezone) {
  try {
    return new Intl.DateTimeFormat('es-ES', {
      dateStyle: 'full',
      timeStyle: 'medium',
      timeZone,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

export function getUptime() {
  return Date.now() - (globalThis.__ZENITSU_START__ || Date.now());
}

export function osInfo() {
  return {
    platform: `${os.platform()} ${os.arch()}`,
    node: process.version,
    memory: `${formatBytes(os.totalmem() - os.freemem())} / ${formatBytes(os.totalmem())}`,
    uptime: formatDuration(os.uptime() * 1000),
    cpus: os.cpus()?.length || 1,
  };
}

export { execFileAsync };
