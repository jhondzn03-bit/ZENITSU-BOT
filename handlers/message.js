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
import { aiText } from '../lib/api.js';

const messageCache = new Map();
const spamMap = new Map();
const aiHistory = new Map();
const aiCooldown = new Map();

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

function adminFlags(meta, sock, senderNumber) {
  const botNumber = jidToNumber(sock.user?.id);
  const participant = meta?.participants?.find((p) => jidToNumber(p.id) === senderNumber);
  const bot = meta?.participants?.find((p) => jidToNumber(p.id) === botNumber);
  return {
    isAdmin: participant?.admin === 'admin' || participant?.admin === 'superadmin',
    isBotAdmin: bot?.admin === 'admin' || bot?.admin === 'superadmin',
    botParticipant: bot,
    participant,
  };
}

async function makeContext(sock, msg, m, extra = {}) {
  const { isAdmin = false, isBotAdmin = false, groupMeta = null } = extra;
  const isOwner = isOwnerNumber(m.senderNumber);
  const prefix = db().prefix || config.prefix;

  const send = async (content, options = {}) => {
    const prepared = watermarkContent({ ...content });
    const sent = await sock.sendMessage(m.chat, prepared, { quoted: msg, ...options });
    trackSent(sent);
    return sent;
  };

  const reply = async (text, extraContent = {}) => {
    const { options = {}, ...content } = extraContent || {};
    return send({ text: withWatermark(text), ...content }, options);
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
  };

  return ctx;
}

async function handleAutoAi(sock, msg, m) {
  const chatCfg = getChat(m.chat);
  if (!chatCfg.aiChat) return false;
  if (m.fromMe || m.isStatus) return false;
  const last = aiCooldown.get(m.chat) || 0;
  if (Date.now() - last < 6000) return true;
  aiCooldown.set(m.chat, Date.now());

  try {
    const history = aiHistory.get(m.chat) || [];
    const answer = await aiText(m.body, { history });
    history.push({ role: 'user', content: m.body });
    history.push({ role: 'assistant', content: answer });
    while (history.length > 12) history.shift();
    aiHistory.set(m.chat, history);
    const sent = await sock.sendMessage(
      m.chat,
      { text: withWatermark(answer) },
      { quoted: msg },
    );
    trackSent(sent);
  } catch (err) {
    const sent = await sock.sendMessage(
      m.chat,
      { text: withWatermark(`⚠️ La IA no respondió: ${err.message}`) },
      { quoted: msg },
    );
    trackSent(sent);
  }
  return true;
}

export async function handleMessage(sock, msg) {
  if (!msg?.message) return;
  if (msg.key.remoteJid === 'status@broadcast') {
    if (db().autoStatus) {
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

  const store = db();
  store.stats.messages = (store.stats.messages || 0) + 1;

  const owner = isOwnerNumber(m.senderNumber);
  if (!owner && store.users[m.sender]?.banned) return;

  const group = m.isGroup ? getGroup(m.chat) : null;

  let groupMeta = null;
  let isAdmin = false;
  let isBotAdmin = false;
  if (m.isGroup) {
    try {
      groupMeta = await getGroupMetadata(sock, m.chat);
      const flags = adminFlags(groupMeta, sock, m.senderNumber);
      isAdmin = flags.isAdmin;
      isBotAdmin = flags.isBotAdmin;
    } catch {}
  }

  // Modo de uso.
  if (store.mode === 'self' && !owner) return;
  if (store.mode === 'group' && !m.isGroup && !owner) return;

  // Grupo silenciado.
  if (group?.muted && !owner && !isAdmin) return;

  const ctx = await makeContext(sock, msg, m, { isAdmin, isBotAdmin, groupMeta });
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
  if (
    m.isGroup &&
    group?.antiLink &&
    !ctx.isAdmin &&
    /(https?:\/\/|wa\.me\/|chat\.whatsapp\.com\/)/i.test(m.body)
  ) {
    try {
      await ctx.deleteMsg();
    } catch {}
    const u = getUser(m.sender);
    u.warns = (u.warns || 0) + 1;
    save();
    await ctx.reply(
      `🚫 *Enlaces no permitidos*\n\n@${m.senderNumber} has recibido una advertencia (${u.warns}/${group.warnLimit}).`,
      { mentions: [m.sender] },
    );
    if (u.warns >= (group.warnLimit || config.maxWarns) && isBotAdmin) {
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

  const prefix = store.prefix || config.prefix;
  if (!m.body.startsWith(prefix)) {
    await handleAutoAi(sock, msg, m);
    return;
  }

  const raw = m.body.slice(prefix.length).trim();
  if (!raw) return;
  const [rawCommand, ...args] = raw.split(/\s+/);
  const commandName = rawCommand.toLowerCase();
  const cmd = commandMap.get(commandName);
  if (!cmd) return;

  ctx.command = commandName;
  ctx.args = args;
  ctx.text = args.join(' ');
  ctx.rawArgs = raw;
  store.stats.commands = (store.stats.commands || 0) + 1;

  if (cmd.owner && !owner) {
    await ctx.reply('👑 Este comando es exclusivo del *owner*.');
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

  try {
    await cmd.execute(ctx);
  } catch (err) {
    console.error(`[CMD:${commandName}]`, err);
    const extra = owner && err?.stack ? `\n\n\`\`\`${truncate(err.stack, 800)}\`\`\`` : '';
    try {
      await ctx.reply(`⚠️ *Error al ejecutar ${prefix}${commandName}*\n\n${err.message || 'Error desconocido'}${extra}`);
    } catch {}
  }
}

export { messageCache };
