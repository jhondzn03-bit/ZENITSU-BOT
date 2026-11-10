import { db, save } from './db.js';
import { trackSent } from './state.js';

// ─── Spam programado a grupos ───────────────────────────────────────────────
// El owner agrega grupos con su enlace de invitación y el bot les envía un
// mensaje cada N minutos (por defecto 2). Todo queda guardado en la DB, así
// que el ciclo sigue funcionando aunque el bot se reinicie.

const DEFAULT_INTERVAL = 120000; // 2 minutos
let timer = null;
let currentSock = null;

// Asegura que existan los campos del spam en la DB (migra viejas sin ellos).
function spamStore() {
  const data = db();
  if (!Array.isArray(data.spamGroups)) data.spamGroups = [];
  if (typeof data.spamMessage !== 'string') data.spamMessage = '';
  if (typeof data.spamEnabled !== 'boolean') data.spamEnabled = false;
  if (!Number(data.spamInterval)) data.spamInterval = DEFAULT_INTERVAL;
  return data;
}

// Extrae el código de un enlace de invitación de grupo.
//   https://chat.whatsapp.com/AbCdEf123456  →  AbCdEf123456
export function extractInviteCode(text) {
  const match = String(text || '').match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]{15,})/);
  return match ? match[1] : '';
}

// Extrae TODOS los enlaces de grupo de un texto (uno o muchos, en el
// orden en que aparecen). Se usa para ".spam link1 link2 link3...".
export function extractAllInviteCodes(text) {
  const matches = String(text || '').matchAll(/chat\.whatsapp\.com\/([A-Za-z0-9_-]{15,})/g);
  const codes = [];
  const seen = new Set();
  for (const m of matches) {
    if (seen.has(m[1])) continue; // el mismo enlace repetido cuenta 1 vez
    seen.add(m[1]);
    codes.push(m[1]);
  }
  return codes;
}

// Une al bot al grupo del enlace y lo agrega a la lista de spam.
// Devuelve { jid, name }.
export async function joinSpamGroup(sock, link) {
  const code = extractInviteCode(link);
  if (!code) throw new Error('ese no es un enlace válido de grupo (debe ser chat.whatsapp.com/...)');
  let jid;
  try {
    jid = await sock.groupAcceptInvite(code);
  } catch (err) {
    throw new Error(`no se pudo entrar al grupo (${err?.message || 'enlace expirado o eliminado del grupo'}). Usa un enlace nuevo.`);
  }
  if (!jid) throw new Error('WhatsApp no devolvió el grupo. El enlace puede estar revocado.');
  const store = spamStore();
  if (store.spamGroups.some((g) => g.jid === jid)) {
    return { jid, name: store.spamGroups.find((g) => g.jid === jid).name, repeated: true };
  }
  let name = 'Grupo';
  try {
    const meta = await sock.groupMetadata(jid);
    name = meta?.subject || name;
  } catch {}
  store.spamGroups.push({ jid, name, addedAt: Date.now() });
  save();
  return { jid, name, repeated: false };
}

// Quita un grupo de la lista por número de la lista, enlace o JID.
export function removeSpamGroup(selector) {
  const store = spamStore();
  const index = Number(selector);
  if (Number.isInteger(index) && index >= 1 && index <= store.spamGroups.length) {
    const [removed] = store.spamGroups.splice(index - 1, 1);
    save();
    return removed;
  }
  const code = extractInviteCode(selector);
  const i = store.spamGroups.findIndex((g) =>
    g.jid === selector || (code && g.jid && g.jid.includes(code)),
  );
  if (i === -1) return null;
  const [removed] = store.spamGroups.splice(i, 1);
  save();
  return removed;
}

export function listSpamGroups() {
  return spamStore().spamGroups;
}

export function setSpamMessage(text) {
  const store = spamStore();
  store.spamMessage = String(text || '').trim();
  save();
  return store.spamMessage;
}

export function setSpamIntervalMinutes(minutes) {
  const n = Number(minutes);
  if (!Number.isFinite(n) || n < 1 || n > 1440) throw new Error('los minutos deben estar entre 1 y 1440');
  const store = spamStore();
  store.spamInterval = Math.round(n * 60000);
  save();
  return Math.round(n);
}

// Envía el mensaje a todos los grupos de la lista. Los grupos de los que el
// bot fue eliminado se quitan solos de la lista.
async function sendSpamNow() {
  const store = spamStore();
  const groups = store.spamGroups;
  const message = store.spamMessage;
  if (!currentSock || !groups.length || !message) return { sent: 0, failed: [] };
  let sent = 0;
  const failed = [];
  for (const group of groups) {
    try {
      const msg = await currentSock.sendMessage(group.jid, { text: message });
      trackSent(msg);
      sent++;
    } catch {
      failed.push(group);
    }
    // Pausa corta entre grupos para no disparar el límite de mensajes.
    await new Promise((r) => setTimeout(r, 3000));
  }
  if (failed.length) {
    store.spamGroups = store.spamGroups.filter((g) => !failed.includes(g));
    save();
  }
  return { sent, failed };
}

// Inicia el ciclo (o lo reinicia con el intervalo nuevo).
export function startSpam(sock, { immediate = true } = {}) {
  const store = spamStore();
  if (!store.spamGroups.length) throw new Error('no hay grupos en la lista. Agrega uno con .spam <enlace>');
  if (!store.spamMessage) throw new Error('no hay mensaje configurado. Usa .spam msg <texto>');
  currentSock = sock;
  store.spamEnabled = true;
  save();
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    sendSpamNow().catch(() => {});
  }, store.spamInterval || DEFAULT_INTERVAL);
  if (immediate) sendSpamNow().catch(() => {});
  return Math.round((store.spamInterval || DEFAULT_INTERVAL) / 60000);
}

// Detiene el ciclo (los grupos y el mensaje quedan guardados).
export function stopSpam() {
  const store = spamStore();
  store.spamEnabled = false;
  save();
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function spamStatus() {
  const store = spamStore();
  return {
    enabled: Boolean(store.spamEnabled) && Boolean(timer),
    persisted: Boolean(store.spamEnabled),
    groups: store.spamGroups.length,
    intervalMinutes: Math.round((store.spamInterval || DEFAULT_INTERVAL) / 60000),
    message: store.spamMessage,
  };
}

// Al arrancar el bot: reanuda el ciclo si estaba activo (sin enviar de golpe,
// espera el primer intervalo para no spamear en cada reconexión).
export function resumeSpamIfEnabled(sock) {
  const store = spamStore();
  currentSock = sock;
  if (!store.spamEnabled) return false;
  if (timer) return true; // ya está corriendo
  timer = setInterval(() => {
    sendSpamNow().catch(() => {});
  }, store.spamInterval || DEFAULT_INTERVAL);
  return true;
}

// Prueba manual: envía ahora mismo sin tocar el ciclo.
export async function spamSendOnce(sock) {
  currentSock = sock;
  return sendSpamNow();
}
