import { config } from '../config.js';
import { db, save } from './db.js';
import { withWatermark } from './utils.js';

// ─── Canal de WhatsApp (newsletter) del bot ───────────────────────────────
// El bot publica sus actualizaciones (arranques, comandos nuevos) en el
// canal configurado. El JID del canal se resuelve UNA vez desde el enlace
// de invitación y queda guardado en la DB.

// El canal se configura con .canal set <enlace>. Este valor es solo el
// respaldo inicial por defecto.
const DEFAULT_INVITE = '0029Vb92GxkL2ATy9RuiAC1F';

// ─── Canales destino de stickers ──────────────────────────────────────────
// El owner dejó estos IDs de newsletter para que el bot envíe stickers a sus
// canales sin depender de enlaces de invitación. Se aceptan tal cual.
export const STICKER_CHANNELS = [
  '120363431599923923@newsletter',
  '120363434730135261@newsletter',
];

// Devuelve una copia de la lista de canales destino.
export function getStickerChannels() {
  return [...STICKER_CHANNELS];
}

// ¿Es un JID de canal (newsletter)?
export function isNewsletterJid(value) {
  return /^\d{10,}@newsletter$/.test(String(value || '').trim());
}

// Acepta un JID, un enlace de canal o un código de invitación y devuelve el
// JID del canal. Lanza error si no se puede resolver.
export async function resolveChannelTarget(sock, raw) {
  const value = String(raw || '').trim();
  if (!value) throw new Error('canal vacío');
  if (isNewsletterJid(value)) return value;
  const code = extractChannelCode(value) || value;
  if (!/^[A-Za-z0-9_-]{10,}$/.test(code)) {
    throw new Error('no es un canal válido (usa el ID …@newsletter o el enlace)');
  }
  const { jid } = await resolveChannelJid(sock, code);
  return jid;
}

// Lista de canales donde mandar stickers: el configurado (si lo hay) y los
// dos IDs fijos del owner. Sin duplicados.
export async function getStickerTargets(sock) {
  const targets = [];
  const add = (jid) => {
    const clean = String(jid || '').trim();
    if (clean && !targets.includes(clean)) targets.push(clean);
  };
  try {
    add(await getChannelJid(sock));
  } catch {}
  for (const jid of STICKER_CHANNELS) add(jid);
  return targets;
}

function channelStore() {
  const data = db();
  if (typeof data.channel !== 'object' || data.channel === null || Array.isArray(data.channel)) {
    data.channel = { invite: '', jid: '', autoUpdates: true };
  }
  const c = data.channel;
  if (typeof c.invite !== 'string') c.invite = '';
  if (typeof c.jid !== 'string') c.jid = '';
  if (typeof c.autoUpdates !== 'boolean') c.autoUpdates = true;
  return c;
}

// Extrae el código de invitación de un enlace de canal:
// https://whatsapp.com/channel/0029Vb92GxkL2ATy9RuiAC1F → 0029Vb92GxkL2ATy9RuiAC1F
export function extractChannelCode(text) {
  const match = String(text || '').match(/whatsapp\.com\/channel\/([A-Za-z0-9_-]{10,})/);
  return match ? match[1] : '';
}

// Nombre visible del canal dentro de la metadata de WhatsApp.
function channelNameFromMeta(meta) {
  const thread = meta?.thread_metadata || meta?.threadMetadata || {};
  return String(thread?.name?.text || thread?.name || meta?.name || '').trim();
}

// Resuelve el JID del canal a partir de su código de invitación.
export async function resolveChannelJid(sock, code) {
  const meta = await sock.newsletterMetadata('invite', code);
  if (!meta?.id) throw new Error('no encontré ese canal (¿el enlace es correcto?)');
  return { jid: meta.id, meta };
}

// Configura el canal del bot (enlace de invitación) y guarda su JID y nombre.
// El nombre es el que aparece en el banner "⮩ Reenviado desde …".
export async function setChannel(sock, link) {
  const code = extractChannelCode(link) || String(link || '').trim();
  if (!code || code.length < 10) {
    throw new Error('ese no es un enlace válido de canal (whatsapp.com/channel/...)');
  }
  const { jid, meta } = await resolveChannelJid(sock, code);
  const c = channelStore();
  c.invite = code;
  c.jid = jid;
  const name = channelNameFromMeta(meta);
  if (name) c.name = name;
  save();
  return { jid, name: c.name || name || '' };
}

// Datos actuales del canal configurado (para mostrarlos en los comandos).
export function getChannelInfo() {
  const c = channelStore();
  return {
    invite: c.invite || '',
    jid: c.jid || '',
    name: c.name || '',
    autoUpdates: Boolean(c.autoUpdates),
  };
}

// Devuelve el JID del canal, resolviéndolo si es la primera vez.
// Devuelve null si no hay canal configurado/accesible.
export async function getChannelJid(sock) {
  const c = channelStore();
  if (c.jid) return c.jid;
  const code = c.invite || (typeof config.channelInvite === 'string' ? config.channelInvite : '') || DEFAULT_INVITE;
  if (!code) return null;
  try {
    const { jid } = await resolveChannelJid(sock, code);
    c.invite = code;
    c.jid = jid;
    save();
    return jid;
  } catch {
    return null;
  }
}

// Guarda el NOMBRE del canal en la DB: lo usa el banner "Reenviado desde..."
// que llevan todos los mensajes del bot (forwardedNewsletterMessageInfo).
export async function refreshChannelName(sock) {
  try {
    const c = channelStore();
    const code = c.invite || DEFAULT_INVITE;
    if (!code) return false;
    // resolveChannelJid usa newsletterMetadata('invite', …), el mismo camino
    // que ya funciona con {prefix}canal set, y devuelve el meta completo.
    const { meta } = await resolveChannelJid(sock, code);
    const thread = meta?.thread_metadata || meta?.threadMetadata || {};
    const name = thread?.name?.text || thread?.name || meta?.name || '';
    if (!name) return false;
    c.name = String(name);
    save();
    return true;
  } catch (err) {
    console.error('[CHANNEL-NAME]', err?.message || err);
    return false;
  }
}

// Envía un texto al canal configurado. Devuelve true si se publicó.
export async function sendToChannel(sock, text) {
  try {
    const jid = await getChannelJid(sock);
    if (!jid) return false;
    await sock.sendMessage(jid, { text: withWatermark(text) });
    return true;
  } catch {
    return false;
  }
}

// ¿El owner quiere que el bot publique actualizaciones automáticamente?
export function channelAutoUpdates() {
  return Boolean(channelStore().autoUpdates);
}

export function setChannelAutoUpdates(on) {
  const c = channelStore();
  c.autoUpdates = Boolean(on);
  save();
  return c.autoUpdates;
}

// La misma novedad que recibe el owner al arrancar, versión canal.
export function buildChannelUpdate({ prefix, totalCommands, updates }) {
  const lines = [
    '⚡ *ZENITSU BOT — ACTUALIZACIÓN*',
    '',
    `📦 Comandos: ${totalCommands}`,
    '',
    '🆕 *NOVEDADES:*',
  ];
  for (const u of updates || []) lines.push(`▸ ${u}`);
  lines.push('');
  lines.push(`_Prefijo: ${prefix} · Menú: ${prefix}menu_`);
  lines.push('_🌩️ Respiración del Trueno._');
  return lines.join('\n');
}
