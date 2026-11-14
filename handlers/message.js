import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { config } from '../config.js';
import { db, getUser, getGroup, getChat, isOwnerNumber, save } from '../lib/db.js';
import {
  withWatermark,
  watermarkContent,
  jidToNumber,
  numberToJid,
  sleep,
  pick,
  levelFromXp,
  truncate,
  fetchBuffer,
  formatDuration,
} from '../lib/utils.js';
import { commandMap, commands } from '../commands/index.js';
import { buildMenu, buildCommandHelp } from '../lib/menu.js';
import { serializeMessage } from '../lib/serialize.js';
import { trackSent, wasSent, getGroupMetadata } from '../lib/state.js';
import { findParticipant } from '../lib/targets.js';
import { handleCustomCommand } from '../lib/customcmd.js';
import { decorateText } from '../lib/theme.js';
import { aiText } from '../lib/api.js';
import { effectiveSettings, subbotForSock } from '../lib/settings.js';

const messageCache = new Map();
const spamMap = new Map();

// ── Detección de enlaces para .antilink ────────────────────────────────────
// Antes solo miraba http(s)://, wa.me y chat.whatsapp.com. Ahora también
// detecta enlaces "pelados" (www., t.me, discord.gg) y dominios sueltos
// como "minecraft.net/regalo" o "bit.ly/abc". Los correos NO cuentan.
const LINK_TLDS =
  'com|net|org|io|me|ly|gg|tv|xyz|info|link|site|online|app|dev|co|pe|mx|ar|es|to|cc|ru|tk|ml|ga|cf|gq|biz|club|store|shop|live|pro|top|icu|vip|win|cloud|page|blog|wiki|shop|lat|click|download|stream|site';
const LINK_RE = new RegExp(
  '(?:https?:\\/\\/|www\\.|wa\\.me\\/|chat\\.whatsapp\\.com\\/|t\\.me\\/|telegram\\.me\\/|discord\\.(?:gg|com\\/invite)\\/)' +
    '|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.(?:' +
    LINK_TLDS +
    ')(?![a-z0-9-]))',
  'i',
);

function containsLink(text = '') {
  // Quita correos electrónicos para no castigar a quien escribe uno.
  const clean = String(text).replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, ' ');
  return LINK_RE.test(clean);
}

/* ─────────── "¿quisiste decir?" — comandos mal escritos ─────────── */

// Distancia de Levenshtein (cuántos caracteres hay que cambiar para que dos
// palabras sean iguales). Versión compacta con dos filas.
function editDistance(a, b) {
  a = a.toLowerCase();
  b = b.toLowerCase();
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1, // borrar
        cur[j - 1] + 1, // insertar
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1), // cambiar
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

// Busca el comando más parecido al que el usuario escribió mal.
// Prioriza errores de tipeo (distancia pequeña), luego "por dónde empieza"
// y "lo contiene". Solo sugiere si hay UN candidato claro.
function suggestCommand(typed, prefix) {
  const q = typed.toLowerCase();
  if (q.length < 3) return null;
  const scored = [];
  const seen = new Set();
  for (const cmd of commands) {
    // Cada comando cuenta una sola vez (sus alias no participan del concurso,
    // o terminaríamos compitiendo "sticker" contra "sticker").
    const canonical = cmd.name.toLowerCase();
    if (seen.has(canonical)) continue;
    // Los comandos +18 están retirados: no se sugieren.
    if (cmd.category === 'nsfw') continue;
    seen.add(canonical);
    let score = Infinity;
    const d = editDistance(q, canonical);
    // Se permite fallar ~1 tecla por cada 4 letras del comando real.
    const tolerance = Math.max(canonical.length >= 4 ? 1 : 0, Math.floor(canonical.length / 4));
    if (d <= tolerance) score = d * 2;
    else if (canonical.startsWith(q) && q.length >= 4) score = 10;
    else if (q.length >= 5 && canonical.includes(q)) score = 20;
    if (score < Infinity) scored.push({ score, name: canonical });
  }
  if (!scored.length) return null;
  scored.sort((a, b) => a.score - b.score || a.name.length - b.name.length);
  // Los empates perfectos muestran dos opciones; el resto, solo la mejor.
  if (scored.length > 1 && scored[1].score === scored[0].score) {
    return `${prefix}${scored[0].name} *o* ${prefix}${scored[1].name}`;
  }
  return `${prefix}${scored[0].name}`;
}
const aiHistory = new Map();
const aiCooldown = new Map();

// Los historiales de IA ocupan memoria por chat. Mantener solo los chats más
// recientes evita que crezca sin límite en bots con muchos grupos activos.
const AI_HISTORY_MAX_CHATS = 80;

function pruneAiMemory() {
  if (aiHistory.size > AI_HISTORY_MAX_CHATS) {
    // Map conserva el orden de inserción: los primeros son los más viejos.
    for (const key of aiHistory.keys()) {
      aiHistory.delete(key);
      if (aiHistory.size <= AI_HISTORY_MAX_CHATS) break;
    }
  }
  // Cooldowns de más de un día ya no sirven para nada.
  const cutoff = Date.now() - 86400000;
  for (const [key, at] of aiCooldown) {
    if (at < cutoff) aiCooldown.delete(key);
  }
}

function cacheMessage(m) {
  if (!m?.id) return;
  if (!m.body && !m.hasMedia && !m.quoted) return;
  messageCache.set(m.id, {
    id: m.id,
    chat: m.chat,
    sender: m.sender,
    senderNumber: m.senderNumber,
    pushName: m.pushName,
    body: m.body,
    type: m.type,
    mediaType: m.mediaType,
    hasMedia: m.hasMedia,
    timestamp: m.timestamp,
  });
  if (messageCache.size > config.maxMessageCache) {
    const first = messageCache.keys().next().value;
    messageCache.delete(first);
  }
}

export function handleDeletedMessage(sock, key) {
  if (!db().antiDelete) return;
  const cached = messageCache.get(key?.id);
  if (!cached) return;
  messageCache.delete(key.id);
  const text = cached.body
    ? `🗑️ *Mensaje eliminado*\n\n👤 @${jidToNumber(cached.sender)}\n\n${cached.body}`
    : `🗑️ *Mensaje eliminado*\n\n👤 @${jidToNumber(cached.sender)}\n📎 Tipo: ${cached.mediaType || cached.type}`;
  return sock
    .sendMessage(cached.chat, { text: withWatermark(text), mentions: [cached.sender] })
    .then(trackSent)
    .catch(() => {});
}

function isSpamming(key) {
  const now = Date.now();
  const arr = (spamMap.get(key) || []).filter((t) => now - t < 10000);
  arr.push(now);
  spamMap.set(key, arr);
  if (spamMap.size > 1000) {
    for (const [k, v] of spamMap) {
      if (!v.length || now - v[v.length - 1] > 60000) spamMap.delete(k);
    }
  }
  return arr.length > 9;
}

function adminFlags(meta, sock, senderIds) {
  // WhatsApp puede identificar al mismo usuario con PN (@s.whatsapp.net) o LID (@lid).
  const participant = (Array.isArray(senderIds) ? senderIds : [senderIds])
    .filter(Boolean)
    .map((value) => findParticipant(meta, value))
    .find(Boolean);
  const botIds = [sock.user?.id, sock.user?.phoneNumber, sock.user?.lid].filter(Boolean);
  const bot = botIds
    .map((value) => findParticipant(meta, value))
    .find(Boolean);
  return {
    isAdmin: participant?.admin === 'admin' || participant?.admin === 'superadmin',
    isBotAdmin: bot?.admin === 'admin' || bot?.admin === 'superadmin',
    botParticipant: bot,
    participant,
  };
}

async function makeContext(sock, msg, m, extra = {}) {
  const {
    isAdmin = false,
    isBotAdmin = false,
    groupMeta = null,
    subbot = null,
    isOwner = isOwnerNumber(m.senderNumber),
    isSubOwner = false,
    settings = null,
  } = extra;
  const eff = settings || effectiveSettings(subbot);
  const prefix = eff.prefix || config.prefix;

  const send = async (content, options = {}) => {
    const prepared = watermarkContent({ ...content });
    const sent = await sock.sendMessage(m.chat, prepared, { quoted: msg, ...options });
    trackSent(sent);
    return sent;
  };

  const reply = async (text, extraContent = {}) => {
    const { options = {}, ...content } = extraContent || {};
    // Tema global: solo texto puro (sin imágenes/archivos) y sin menús ya
    // enmarcados. Si no hay tema activo, decorateText devuelve lo mismo.
    const isPlainText = Object.keys(content).length === 0;
    const themed = isPlainText ? decorateText(text, effectiveSettings(subbot).theme) : text;
    return send({ text: withWatermark(themed), ...content }, options);
  };

  const react = async (emoji, key = m.key) => {
    try {
      const sent = await sock.sendMessage(m.chat, { react: { text: emoji, key } });
      trackSent(sent);
    } catch {}
  };

  const downloadMedia = async (target = m) => {
    const mediaType = target.mediaType === 'ptv' ? 'video' : target.mediaType;
    if (!target?.content || !mediaType) throw new Error('No hay multimedia en el mensaje');
    const stream = await downloadContentFromMessage(target.content, mediaType);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    if (!buffer.length) throw new Error('No se pudo descargar el archivo');
    return buffer;
  };

  const downloadQuoted = async () => {
    if (!m.quoted) throw new Error('Responde a un archivo multimedia');
    return downloadMedia(m.quoted);
  };

  const downloadUrl = async (url) => fetchBuffer(url);

  const deleteMsg = async (key = m.key) => {
    try {
      await sock.sendMessage(m.chat, { delete: key });
    } catch (err) {
      throw new Error('No pude eliminar el mensaje. ¿Soy administrador?');
    }
  };

  const getGroupMeta = async () => {
    if (!m.isGroup) throw new Error('Este comando solo funciona en grupos');
    return getGroupMetadata(sock, m.chat);
  };

  const ctx = {
    sock,
    msg,
    m,
    db: db(),
    config,
    commands,
    commandMap,
    chat: m.chat,
    sender: m.sender,
    senderNumber: m.senderNumber,
    senderJid: m.sender,
    pushName: m.pushName,
    isGroup: m.isGroup,
    isOwner,
    isGlobalOwner: isOwner,
    isSubOwner,
    isAdmin: isOwner || isAdmin,
    isBotAdmin,
    isCreator: isOwner,
    groupMeta,
    prefix,
    body: m.body,
    text: m.body,
    args: [],
    command: '',
    mentioned: m.mentioned,
    quoted: m.quoted,
    quotedSender: m.quotedSender,
    reply,
    send,
    react,
    downloadMedia,
    downloadQuoted,
    downloadUrl,
    deleteMsg,
    getGroupMeta,
    withWatermark,
    truncate,
    save,
    jidToNumber,
    numberToJid,
    buildMenu,
    buildCommandHelp,
    subbot,
    isSubbot: Boolean(subbot),
    // Premium vigente: sin fecha límite o con días restantes.
    isSubbotPremium: Boolean(
      subbot?.premium && (!subbot.premiumUntil || subbot.premiumUntil > Date.now()),
    ),
    // Bot principal: todo desbloqueado, no se puede silenciar.
    isSubbotPrimary: Boolean(subbot?.primary),
  };

  return ctx;
}

// Reacciona al mensaje del usuario sin romper nada si falla (grupo sin
// permisos, mensaje ya borrado, etc.). Con texto vacío se quita la reacción.
async function reactStatus(sock, m, emoji) {
  try {
    await sock.sendMessage(m.chat, { react: { text: emoji, key: m.key } });
  } catch {}
}

async function handleAutoAi(sock, msg, m) {
  const chatCfg = getChat(m.chat);
  if (!chatCfg.aiChat) return false;
  if (m.fromMe || m.isStatus) return false;
  const last = aiCooldown.get(m.chat) || 0;
  if (Date.now() - last < 6000) return true;
  aiCooldown.set(m.chat, Date.now());

  // Reacción de "pensando" mientras la IA responde.
  await reactStatus(sock, m, '⏳');
  try {
    const history = aiHistory.get(m.chat) || [];
    const answer = await aiText(m.body, { history });
    history.push({ role: 'user', content: m.body });
    history.push({ role: 'assistant', content: answer });
    while (history.length > 12) history.shift();
    aiHistory.set(m.chat, history);
    pruneAiMemory();
    const sent = await sock.sendMessage(
      m.chat,
      { text: withWatermark(answer) },
      { quoted: msg },
    );
    trackSent(sent);
    await reactStatus(sock, m, '✅');
  } catch (err) {
    const sent = await sock.sendMessage(
      m.chat,
      { text: withWatermark(`⚠️ La IA no respondió: ${err.message}`) },
      { quoted: msg },
    );
    trackSent(sent);
    await reactStatus(sock, m, '❌');
  }
  return true;
}

// Palabras aceptadas para encender un subbot con .bot on.
const BOT_ON_WORDS = new Set(['on', 'encender', 'prender', 'activar', 'start', '1']);

// Todos los números posibles del remitente (PN directo, alt y metadata del
// grupo si llegó como LID).
async function senderNumbers(sock, m) {
  const numbers = new Set(
    [m.senderNumber, jidToNumber(m.sender), jidToNumber(m.senderAlt)].filter(Boolean),
  );
  if (m.isGroup) {
    try {
      const meta = await getGroupMetadata(sock, m.chat);
      const p =
        findParticipant(meta, m.sender) ||
        findParticipant(meta, m.senderAlt) ||
        findParticipant(meta, m.senderNumber);
      const real = jidToNumber(p?.phoneNumber || p?.id || p?.lid);
      if (real) numbers.add(real);
    } catch {}
  }
  return [...numbers];
}

// ¿Es ".bot on" de un owner (global o del propio subbot)? Es lo ÚNICO que
// atiende un subbot apagado: no lee, no reacciona y no ejecuta nada más.
async function isWakeRequest(sock, m, prefix, subbot) {
  if (!m.body.startsWith(prefix)) return false;
  const parts = m.body.slice(prefix.length).trim().split(/\s+/);
  if (String(parts[0] || '').toLowerCase() !== 'bot') return false;
  if (!BOT_ON_WORDS.has(String(parts[1] || '').toLowerCase())) return false;
  const numbers = await senderNumbers(sock, m);
  if (numbers.some((n) => isOwnerNumber(n))) return true;
  const owner = String(subbot?.owner || '').replace(/\D/g, '');
  return Boolean(owner) && numbers.includes(owner);
}

export async function handleMessage(sock, msg) {
  if (!msg?.message) return;

  const store = db();
  const subbot = subbotForSock(sock);
  const settings = effectiveSettings(subbot);
  const prefix = settings.prefix || config.prefix;

  // Subbot apagado (.bot off): silencio total. Sigue conectado para poder
  // recibir .bot on, pero no marca leído, no reacciona, no responde la IA ni
  // ejecuta comandos. Solo se atiende .bot on de su owner o de un owner global.
  let wakeRequest = false;
  if (subbot?.paused) {
    if (msg.key.remoteJid === 'status@broadcast') return;
    if (msg.key.remoteJid?.endsWith('@newsletter')) return;
    if (msg.key.fromMe && wasSent(msg.key.id)) return;
    const wakeMsg = serializeMessage(sock, msg);
    if (!wakeMsg) return;
    wakeRequest = await isWakeRequest(sock, wakeMsg, prefix, subbot);
    if (!wakeRequest) return;
  }

  if (msg.key.remoteJid === 'status@broadcast') {
    // Con .autoread o .autostatus activos, el bot marca los estados como vistos.
    if (db().autoStatus || db().autoRead) {
      try {
        await sock.readMessages([msg.key]);
      } catch {}
    }
    return;
  }
  if (msg.key.remoteJid?.endsWith('@newsletter')) return;
  if (msg.key.fromMe && wasSent(msg.key.id)) return;

  const m = serializeMessage(sock, msg);
  if (!m) return;

  // Anti-eliminar: guarda copia de cada mensaje.
  cacheMessage(m);

  // Revocación de mensajes (protocolMessage REVOKE).
  const protocol = m.message?.protocolMessage;
  if (protocol && (protocol.type === 0 || protocol.type === 'REVOKE')) {
    await handleDeletedMessage(sock, protocol.key);
    return;
  }

  store.stats.messages = (store.stats.messages || 0) + 1;

  const isCommand = m.body.startsWith(prefix);

  let owner = isOwnerNumber(m.senderNumber);
  if (!owner && store.users[m.sender]?.banned) return;

  const group = m.isGroup ? getGroup(m.chat) : null;

  // Si el grupo tiene usuarios silenciados, hay que resolver su número real
  // (puede llegar como LID) y saber si el bot es admin para borrar mensajes.
  const hasMutedUsers = Boolean(
    group?.mutedUsers && Object.keys(group.mutedUsers).length > 0,
  );

  // La metadata del grupo (una llamada a WhatsApp) solo se pide cuando de
  // verdad hace falta: comandos, grupo silenciado, anti-enlace/anti-spam o
  // modo privado. Así la charla normal no espera a la red en cada mensaje.
  const needsGroupMeta =
    m.isGroup &&
    (isCommand ||
      group?.muted ||
      group?.antiLink ||
      group?.antiSpam ||
      hasMutedUsers ||
      store.mode === 'self');

  let groupMeta = null;
  let isAdmin = false;
  let isBotAdmin = false;
  let senderRealNumber = '';
  if (needsGroupMeta) {
    try {
      groupMeta = await getGroupMetadata(sock, m.chat);
      const flags = adminFlags(groupMeta, sock, [m.sender, m.senderAlt, m.senderNumber]);
      isAdmin = flags.isAdmin;
      isBotAdmin = flags.isBotAdmin;
      // Si el remitente llegó como LID, usa el número real del participante
      // para reconocer al owner y para los silenciados (.mute).
      if (flags.participant) {
        senderRealNumber = jidToNumber(
          flags.participant.phoneNumber || flags.participant.id || flags.participant.lid,
        );
        if (!owner && isOwnerNumber(senderRealNumber)) owner = true;
      }
    } catch {}
  }

  // Owner propio del subbot: puede personalizarlo y usar .bot / .setowner,
  // pero no los comandos peligrosos del owner global.
  let subOwner = false;
  if (subbot?.owner) {
    const ownerNumber = String(subbot.owner).replace(/\D/g, '');
    const candidates = [
      m.senderNumber,
      senderRealNumber,
      jidToNumber(m.sender),
      jidToNumber(m.senderAlt),
    ].filter(Boolean);
    subOwner = candidates.includes(ownerNumber);
  }

  // Modo de uso. Un .bot on autorizado siempre pasa, para poder reactivar
  // un subbot apagado incluso si el modo es restrictivo.
  if (!wakeRequest && store.mode === 'self' && !owner) return;
  if (!wakeRequest && store.mode === 'group' && !m.isGroup && !owner) return;

  // Grupo silenciado.
  if (!wakeRequest && group?.muted && !owner && !isAdmin) return;

  // Usuario silenciado con .mute: el bot lo ignora por completo y, si es
  // admin del grupo, borra sus mensajes (así el "mute" sí se nota).
  if (group?.mutedUsers && !owner && !isAdmin) {
    const mutedKey = [
      m.senderNumber,
      senderRealNumber,
      jidToNumber(m.sender),
      jidToNumber(m.senderAlt),
    ].find((n) => n && group.mutedUsers[n]);
    if (mutedKey) {
      if (isBotAdmin) {
        // Se saca del caché antes de borrar: si no, el anti-eliminar volvería
        // a publicar el mensaje del usuario silenciado como "eliminado".
        messageCache.delete(m.id);
        try {
          await sock.sendMessage(m.chat, { delete: m.key });
        } catch {}
      }
      return;
    }
  }

  // ¿Este mensaje lo está respondiendo un subbot? Si es normal (no premium)
  // no puede usar las categorías premium (descargas e IA por defecto).
  const subbotPremium = Boolean(
    subbot?.premium && (!subbot.premiumUntil || subbot.premiumUntil > Date.now()),
  );
  const isPremiumCommand = (c) =>
    Boolean(c.premium || config.premiumCategories.includes(c.category));

  // Subbot silenciado por el owner (.silenciarsubbs): NO responde a nadie,
  // ni siquiera al owner. Se controla desde el bot principal (.activarsubbs).
  // El bot principal (primary) nunca se silencia. Un .bot on autorizado sí
  // se responde, para que el owner sepa que quedó encendido.
  if (!wakeRequest && subbot?.muted && !subbot?.primary) return;

  const ctx = await makeContext(sock, msg, m, {
    isAdmin,
    isBotAdmin,
    groupMeta,
    subbot,
    isOwner: owner,
    isSubOwner: subOwner,
    settings,
  });
  ctx.isAdmin = owner || isAdmin;

  // Auto lectura.
  if (store.autoRead) {
    try {
      await sock.readMessages([msg.key]);
    } catch {}
  }

  // Auto reacción.
  if (store.autoReact && !m.fromMe) {
    await ctx.react(pick(['⚡', '🌩️', '🔥', '💛', '👀', '✨', '⚔️']));
  }

  // Anti-enlace.
  if (m.isGroup && group?.antiLink && !ctx.isAdmin && containsLink(m.body)) {
    try {
      await ctx.deleteMsg();
    } catch {}
    const u = getUser(m.sender);
    u.warns = (u.warns || 0) + 1;
    save();
    const limit = group.warnLimit || config.maxWarns || 3;
    await ctx.reply(
      `🚫 *ANTI-ENLACES ACTIVADO*\n\n` +
        `@${m.senderNumber}, los enlaces están prohibidos en este grupo.\n` +
        `▸ Advertencia: *${u.warns}/${limit}*\n` +
        (u.warns >= limit
          ? '▸ Llegaste al límite: serás expulsado si soy administrador.'
          : `▸ Si llegas a ${limit}, serás expulsado.`),
      { mentions: [m.sender] },
    );
    if (u.warns >= limit && isBotAdmin) {
      try {
        await sock.groupParticipantsUpdate(m.chat, [m.sender], 'remove');
      } catch {}
      u.warns = 0;
      save();
    }
    return;
  }

  // Anti-spam.
  if (m.isGroup && group?.antiSpam && !ctx.isAdmin && isSpamming(`${m.chat}:${m.senderNumber}`)) {
    try {
      await ctx.deleteMsg();
    } catch {}
    return;
  }

  // XP por actividad.
  if (!m.fromMe) {
    const u = getUser(m.sender);
    const oldLevel = levelFromXp(u.xp || 0);
    u.xp = (u.xp || 0) + 5;
    const newLevel = levelFromXp(u.xp);
    if (newLevel > oldLevel) {
      u.level = newLevel;
      u.coins = (u.coins || 0) + newLevel * 50;
      save();
      try {
        await ctx.reply(
          `🎉 *¡Subiste de nivel!*\n\n⚡ Nivel: *${newLevel}*\n💰 Recompensa: *${newLevel * 50} monedas*`,
        );
      } catch {}
    } else {
      save();
    }
  }

  if (!isCommand) {
    await handleAutoAi(sock, msg, m);
    return;
  }

  const raw = m.body.slice(prefix.length).trim();
  if (!raw) return;
  const [rawCommand, ...args] = raw.split(/\s+/);
  const commandName = rawCommand.toLowerCase();
  const cmd = commandMap.get(commandName);
  if (!cmd) {
    // Comandos personalizados del grupo: .stock, .addstock, .setstock, .delstock
    try {
      const handled = await handleCustomCommand(ctx, commandName, args);
      if (handled) return;
    } catch (err) {
      console.error('[CUSTOMCMD]', err);
      try {
        await ctx.reply(`⚠️ No pude ejecutar *${prefix}${commandName}*: ${err.message}`);
      } catch {}
      return;
    }
    // ¿Quisiste decir...? — solo si el comando tipeado se parece a uno real,
    // para no responder ante cualquier texto que empiece con el prefijo.
    const suggestion = suggestCommand(commandName, prefix);
    if (suggestion) {
      await ctx.reply(
        `❓ *No conozco ese comando*\n\n` +
          `▸ Escribiste: *${prefix}${commandName}*\n` +
          `✨ ¿Quisiste decir...? *${suggestion}*\n\n` +
          `💡 Escribe *${prefix}menu* para ver todo lo que sé hacer ⚡`,
      );
    }
    return;
  }

  // ── Bloqueo permanente de contenido +18 ──────────────────────────────────
  // Los comandos NSFW fueron retirados del bot: no se ofrecen ni se ejecutan
  // para nadie (ni siquiera owner).
  if (cmd.category === 'nsfw') {
    await ctx.reply(
      '🌙 *Comando retirado* ✨\n\nEste contenido ya no forma parte del bot.',
    );
    return;
  }

  ctx.command = commandName;
  ctx.args = args;
  ctx.text = args.join(' ');
  ctx.rawArgs = raw;
  store.stats.commands = (store.stats.commands || 0) + 1;

  if (subbot && isPremiumCommand(cmd) && !subbotPremium && !subbot.primary) {
    await ctx.reply(
      `💎 *Comando PREMIUM*\n\n` +
        `Este subbot es *normal* y no incluye las descargas ni la IA.\n\n` +
        `👑 Pídele al owner que active el premium con:\n` +
        `*${prefix}prem ${subbot.number}*\n\n` +
        `💡 Más info: *${prefix}upgrade*`,
    );
    return;
  }

  // Los comandos de personalización marcados con subOwner también los puede
  // usar el owner del subbot; el resto sigue siendo solo para owners globales.
  const canUseOwnerCommand = owner || (cmd.subOwner && subOwner);
  if (cmd.owner && !canUseOwnerCommand) {
    await ctx.reply(
      cmd.subOwner
        ? '👑 Este comando es del *owner* de este subbot.'
        : '👑 Este comando es exclusivo del *owner*.',
    );
    return;
  }
  if (cmd.group && !m.isGroup) {
    await ctx.reply('👥 Este comando solo funciona en *grupos*.');
    return;
  }
  if (cmd.admin && !ctx.isAdmin) {
    await ctx.reply('🛡️ Este comando es solo para *administradores*.');
    return;
  }
  if (cmd.botAdmin && !isBotAdmin) {
    await ctx.reply('🤖 Primero hazme *administrador* del grupo para usar esto.');
    return;
  }

  // Reacción de "trabajando" mientras corre el comando y "listo" al terminar.
  await reactStatus(sock, m, '⏳');
  try {
    await cmd.execute(ctx);
    await reactStatus(sock, m, '✅');
  } catch (err) {
    await reactStatus(sock, m, '❌');
    console.error(`[CMD:${commandName}]`, err);
    const extra = owner && err?.stack ? `\n\n\`\`\`${truncate(err.stack, 800)}\`\`\`` : '';
    try {
      await ctx.reply(`⚠️ *Error al ejecutar ${prefix}${commandName}*\n\n${err.message || 'Error desconocido'}${extra}`);
    } catch {}
  }
}

export { messageCache };
