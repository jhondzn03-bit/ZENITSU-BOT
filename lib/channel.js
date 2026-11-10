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

// Resuelve el JID del canal a partir de su código de invitación.
export async function resolveChannelJid(sock, code) {
  const meta = await sock.newsletterMetadata('invite', code);
  if (!meta?.id) throw new Error('no encontré ese canal (¿el enlace es correcto?)');
  return { jid: meta.id, meta };
}

// Configura el canal del bot (enlace de invitación) y guarda su JID.
export async function setChannel(sock, link) {
  const code = extractChannelCode(link) || String(link || '').trim();
  if (!code || code.length < 10) {
    throw new Error('ese no es un enlace válido de canal (whatsapp.com/channel/...)');
  }
  const { jid } = await resolveChannelJid(sock, code);
  const c = channelStore();
  c.invite = code;
  c.jid = jid;
  save();
  return jid;
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
