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
  if (!t) return WATERMARK;
  if (t.endsWith(WATERMARK)) return t;
  return `${t}\n\n${WATERMARK}`;
}

export function watermarkContent(content) {
  if (!content || typeof content !== 'object') return content;
  if (typeof content.text === 'string') content.text = withWatermark(content.text);
  if (typeof content.caption === 'string') content.caption = withWatermark(content.caption);
  return content;
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

export function jidToNumber(jid = '') {
  return String(jid).split('@')[0].split(':')[0].replace(/\D/g, '');
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
    const { stdout, stderr } = await execFileAsync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
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
    return 0;
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
