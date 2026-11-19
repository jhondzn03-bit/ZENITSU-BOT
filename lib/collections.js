// ─── Colecciones de TikTok programadas (.coleccion) ───────────────────────
// El usuario abre una colección con un nombre (y opcionalmente una hora), va
// pegando links de TikTok y el bot los va guardando. A la hora elegida se
// publica la colección en el chat donde se creó. Persiste en la DB y se
// reprograma sola al reiniciar el bot.
import { db, save } from './db.js';
import { withWatermark } from './utils.js';

const MAX_LINKS = 60;
const SESSION_TTL = 2 * 60 * 60 * 1000; // 2 h sin links = sesión cerrada
const MAX_MS = 30 * 24 * 60 * 60 * 1000;

let currentSock = null;
const timers = new Map();

const TIKTOK_RE = /https?:\/\/(?:[a-z0-9-]+\.)*tiktok\.com\/[^\s<>"']+/i;
const TIME_TOKEN_RE = /^\d{1,2}(?::\d{2})?(?:am|pm)?$/i;

const TIMEZONES = {
  MX: 'America/Mexico_City',
  SV: 'America/El_Salvador',
  GT: 'America/Guatemala',
  HN: 'America/Tegucigalpa',
  NI: 'America/Managua',
  CR: 'America/Costa_Rica',
  PA: 'America/Panama',
  US: 'America/New_York',
  ES: 'Europe/Madrid',
};

export function extractTiktokLink(text) {
  const found = String(text || '').match(TIKTOK_RE);
  return found ? found[0].replace(/[.,;)]+$/, '') : '';
}

const TIKTOK_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  referer: 'https://www.tiktok.com/',
  accept: 'text/html,application/xhtml+xml',
};

function looksLikeCollection(raw) {
  return /\/collection\/[^?#]+/i.test(String(raw || ''));
}

// Los links cortos (vt/vm) hay que seguirlos para saber si son un video suelto
// o una colección completa. Devolvemos el link ORIGINAL para publicarlo bonito.
export async function resolveTiktokLink(raw) {
  const original = extractTiktokLink(raw);
  if (!original) return { original: '', collection: false };
  if (looksLikeCollection(original)) return { original, collection: true };
  if (!/(?:vm|vt)\.tiktok\.com\//i.test(original)) return { original, collection: false };
  try {
    const res = await fetch(original, {
      redirect: 'follow',
      headers: TIKTOK_HEADERS,
      signal: AbortSignal.timeout(9000),
    });
    return { original, collection: looksLikeCollection(res.url || original) };
  } catch {
    return { original, collection: false };
  }
}

function store() {
  const data = db();
  if (!Array.isArray(data.collections)) data.collections = [];
  return data.collections;
}

function findById(id) {
  return store().find((c) => c.id === id) || null;
}

function partsInZone(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const out = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== 'literal') out[part.type] = Number(part.value);
  }
  return out;
}

function zoneOffset(year, month, day, hour, minute, timeZone) {
  const utc = Date.UTC(year, month - 1, day, hour, minute);
  const p = partsInZone(new Date(utc), timeZone);
  const asLocal = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return asLocal - utc;
}

// "6:00PM MX", "18:00", "6 pm sv" → { at, ms, timezone, label }
export function parseSchedule(text, fallbackZone = 'America/El_Salvador') {
  const s = String(text || '').trim();
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?:\s+([A-Za-z]{2,}))?$/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2] || 0);
  const ampm = String(m[3] || '').toLowerCase();
  if (!Number.isFinite(hour) || hour > 23 || minute > 59) return null;
  if (ampm) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (ampm === 'pm' ? 12 : 0);
  }
  const rawCode = String(m[4] || '').toUpperCase();
  const timeZone = rawCode ? TIMEZONES[rawCode] : fallbackZone;
  if (!timeZone) return null;

  const now = Date.now();
  for (let day = 0; day < 3; day++) {
    const p = partsInZone(new Date(now + day * 86400000), timeZone);
    const offset = zoneOffset(p.year, p.month, p.day, hour, minute, timeZone);
    const at = Date.UTC(p.year, p.month - 1, p.day, hour, minute) - offset;
    if (at > now + 30000 && at - now <= MAX_MS) {
      return {
        at,
        ms: at - now,
        timezone: timeZone,
        code: rawCode || (timeZone === 'America/Mexico_City' ? 'MX' : 'SV'),
        label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${rawCode || timeZone}`,
      };
    }
  }
  return null;
}

// Separa ".coleccion NOMBRE 6:00PM MX" en nombre y texto de horario.
export function splitNameAndSchedule(tokens = []) {
  const list = tokens.map((t) => String(t || '').trim()).filter(Boolean);
  for (let i = list.length - 1; i >= 0; i--) {
    if (TIME_TOKEN_RE.test(list[i])) {
      return { name: list.slice(0, i).join(' ').trim(), scheduleText: list.slice(i).join(' ') };
    }
  }
  return { name: list.join(' ').trim(), scheduleText: '' };
}

function nextId() {
  return store().reduce((max, c) => Math.max(max, c.id || 0), 0) + 1;
}

function activeFor(sender, chat) {
  const now = Date.now();
  return (
    store()
      .filter(
        (c) =>
          c.status === 'active' &&
          c.sender === sender &&
          (!chat || c.chat === chat) &&
          now - (c.lastLinkAt || c.createdAt) < SESSION_TTL,
      )
      .sort((a, b) => b.createdAt - a.createdAt)[0] || null
  );
}

function schedule(item) {
  if (!item.scheduledAt) return;
  const id = setTimeout(() => fire(item.id), Math.max(item.scheduledAt - Date.now(), 0));
  timers.set(item.id, id);
}

export function startCollection({ sender, senderNumber, chat, name, scheduleInfo = null }) {
  const cleanName = String(name || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\p{L}\p{N} _.-]/gu, '')
    .trim()
    .slice(0, 48);
  if (!cleanName) throw new Error('ponle un nombre a la colección');

  // Solo una colección activa a la vez por persona en ese chat.
  for (const c of store()) {
    if (c.status === 'active' && c.sender === sender && c.chat === chat) c.status = 'canceled';
  }
  const item = {
    id: nextId(),
    name: cleanName,
    sender,
    senderNumber: String(senderNumber || ''),
    chat,
    links: [],
    collectionLink: null, // link único de colección de TikTok, si lo mandaron
    status: 'active',
    createdAt: Date.now(),
    lastLinkAt: Date.now(),
    scheduledAt: scheduleInfo?.at || null,
    scheduleLabel: scheduleInfo?.label || '',
    timezone: scheduleInfo?.timezone || '',
  };
  store().push(item);
  save();
  schedule(item);
  return item;
}

export function addLink(sender, chat, url, isCollection = false) {
  const item = activeFor(sender, chat);
  if (!item) return null;
  const clean = extractTiktokLink(url);
  if (!clean) return null;
  if (item.links.includes(clean)) return { item, duplicate: true };
  if (item.links.length >= MAX_LINKS) return { item, full: true };
  item.links.push(clean);
  // Un link de colección de TikTok reúne todos los videos: al publicar se
  // manda SOLO ese enlace, no la lista de links en texto.
  if (isCollection) item.collectionLink = clean;
  item.lastLinkAt = Date.now();
  save();
  return { item, duplicate: false };
}

export function hasActiveCollection(sender, chat) {
  return Boolean(activeFor(sender, chat));
}

export function listCollections(sender) {
  return store()
    .filter((c) => !sender || c.sender === sender)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 20);
}

export function cancelCollection(sender, chat) {
  const item = activeFor(sender, chat);
  if (!item) return null;
  item.status = 'canceled';
  save();
  const timer = timers.get(item.id);
  if (timer) clearTimeout(timer);
  timers.delete(item.id);
  return item;
}

function collectionText(item) {
  // Si el usuario pegó un link de colección de TikTok, publicamos SOLO ese
  // enlace (ahí están todos los videos juntos), no una lista de textos.
  if (item.collectionLink) {
    return (
      `🎬 *COLECCIÓN TIKTOK: ${item.name}*\n\n` +
      (item.scheduleLabel ? `🕐 ${item.scheduleLabel}\n\n` : '') +
      `▶️ *Abre la colección completa aquí:*\n${item.collectionLink}\n\n` +
      `_Guardada por @${item.senderNumber || 'un usuario'}.`
    );
  }
  const lines = item.links.map((link, i) => `${i + 1}. ${link}`);
  return (
    `🎬 *COLECCIÓN TIKTOK: ${item.name}*\n\n` +
    `📹 ${item.links.length} videos\n` +
    (item.scheduleLabel ? `🕐 ${item.scheduleLabel}\n` : '') +
    `\n${lines.join('\n')}\n\n` +
    `_Guardada por @${item.senderNumber || 'un usuario'}.`
  );
}

export function sendCollectionById(id, sender = null) {
  const item = findById(id);
  if (!item || (sender && item.sender !== sender)) return null;
  if (!currentSock || !item.chat) return null;
  currentSock.sendMessage(item.chat, { text: withWatermark(collectionText(item)) }).catch((err) => {
    console.error('[COLECCION] envío falló:', err?.message || err);
  });
  item.status = 'sent';
  item.sentAt = Date.now();
  save();
  const timer = timers.get(item.id);
  if (timer) clearTimeout(timer);
  timers.delete(item.id);
  return item;
}

export function sendCollectionByName(name, sender = null) {
  const clean = String(name || '').trim().toLowerCase();
  const item = store()
    .filter((c) => c.status === 'active' && (!sender || c.sender === sender))
    .sort((a, b) => b.createdAt - a.createdAt)
    .find((c) => String(c.name || '').toLowerCase() === clean);
  return item ? sendCollectionById(item.id, sender) : null;
}

function fire(id) {
  const item = findById(id);
  if (!item || item.status !== 'active') return;
  sendCollectionById(id);
}

// Al arrancar: reprograma las pendientes. Si la hora ya pasó mientras el bot
// estaba apagado, se publica de inmediato (como hacen los recordatorios).
export function resumeCollections(sock) {
  currentSock = sock;
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  let scheduled = 0;
  let sent = 0;
  for (const item of store()) {
    if (item.status !== 'active' || !item.scheduledAt) continue;
    const delay = item.scheduledAt - Date.now();
    if (delay <= 0) {
      sendCollectionById(item.id);
      sent++;
    } else {
      schedule(item);
      scheduled++;
    }
  }
  return { scheduled, sent };
}

export function setCollectionSock(sock) {
  currentSock = sock;
}

// Lo llama el handler con cada mensaje que NO es comando. Si hay una
// colección activa y el mensaje trae un link de TikTok, lo guarda y solo
// REACCIONA al mensaje: ✅ si se pudo, ❌ si estaba duplicado o lleno.
// Antes se respondía con un texto por link y eso llenaba el chat de avisos
// con el tema GLACIAL; ahora no se envía ningún mensaje.
export async function captureCollectionLink(ctx, m) {
  if (!ctx || !m || m.fromMe) return false;
  const link = await resolveTiktokLink(m.body);
  if (!link.original) return false;
  const item = activeFor(m.sender, m.chat);
  if (!item) return false;
  const result = addLink(m.sender, m.chat, link.original, link.collection);
  if (!result) return false;
  // ctx.react ya trapea errores (mensaje borrado, sin permisos, etc.).
  await ctx.react?.(result.full || result.duplicate ? '❌' : '✅');
  return true;
}
