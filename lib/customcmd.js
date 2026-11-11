// ─── Comandos personalizados por grupo ────────────────────────────────────
// .crearcmd stock  → crea la familia: .addstock .setstock .stock .delstock
// El contenido (texto y/o imagen) se guarda por grupo, así cada grupo tiene
// sus propios comandos.

import fs from 'node:fs';
import path from 'node:path';
import { db, save } from './db.js';

const ROOT = path.resolve('database', 'custom');
const MAX_TEXT = 4000;
const MAX_MEDIA = 12 * 1024 * 1024; // 12 MB

const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'application/pdf': 'pdf',
};

function sanitizeName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]/g, '');
}

function sanitizeJid(jid) {
  return String(jid || 'grupo').replace(/[^a-zA-Z0-9]/g, '_');
}

function store() {
  const d = db();
  if (!d.customCommands || typeof d.customCommands !== 'object') d.customCommands = {};
  return d.customCommands;
}

function groupStore(jid) {
  const s = store();
  if (!s[jid] || typeof s[jid] !== 'object') s[jid] = {};
  return s[jid];
}

export function listCustom(jid) {
  return Object.entries(groupStore(jid)).map(([name, data]) => ({ name, ...data }));
}

export function getCustom(jid, name) {
  return groupStore(jid)[sanitizeName(name)] || null;
}

export function createCustom(jid, name, by = '') {
  const key = sanitizeName(name);
  if (!key) throw new Error('nombre inválido');
  if (key.length > 20) throw new Error('el nombre es muy largo (máx. 20)');
  if (['menu', 'help', 'ping', 'info', 'crearcmd', 'delcmd', 'menucmd'].includes(key)) {
    throw new Error(`"${key}" es un comando del bot y no se puede usar`);
  }
  const g = groupStore(jid);
  if (g[key]) throw new Error(`el comando *${key}* ya existe en este grupo`);
  g[key] = {
    content: '',
    media: null,
    createdBy: by,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  save();
  return g[key];
}

export function deleteCustom(jid, name) {
  const key = sanitizeName(name);
  const g = groupStore(jid);
  if (!g[key]) return false;
  const media = g[key].media;
  if (media?.file) {
    try {
      fs.rmSync(media.file, { force: true });
    } catch {}
  }
  delete g[key];
  save();
  return true;
}

export function clearCustomContent(jid, name) {
  const key = sanitizeName(name);
  const g = groupStore(jid);
  if (!g[key]) return false;
  if (g[key].media?.file) {
    try {
      fs.rmSync(g[key].media.file, { force: true });
    } catch {}
  }
  g[key].content = '';
  g[key].media = null;
  g[key].updatedAt = Date.now();
  save();
  return true;
}

export function setCustomText(jid, name, text) {
  const key = sanitizeName(name);
  const g = groupStore(jid);
  if (!g[key]) return false;
  g[key].content = String(text || '').slice(0, MAX_TEXT);
  g[key].updatedAt = Date.now();
  save();
  return true;
}

export function setCustomMedia(jid, name, buffer, mimetype = '') {
  const key = sanitizeName(name);
  const g = groupStore(jid);
  if (!g[key]) return false;
  if (!buffer?.length) throw new Error('el archivo llegó vacío');
  if (buffer.length > MAX_MEDIA) throw new Error('el archivo pasa de 12 MB');

  const dir = path.join(ROOT, sanitizeJid(jid));
  fs.mkdirSync(dir, { recursive: true });
  const ext = EXT_BY_MIME[mimetype] || 'bin';
  const file = path.join(dir, `${key}.${ext}`);
  fs.writeFileSync(file, buffer);

  // Borra el archivo anterior si tenía otra extensión.
  if (g[key].media?.file && g[key].media.file !== file) {
    try {
      fs.rmSync(g[key].media.file, { force: true });
    } catch {}
  }

  g[key].media = { file, type: mediaTypeFor(mimetype), mimetype };
  g[key].updatedAt = Date.now();
  save();
  return true;
}

function mediaTypeFor(mimetype = '') {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  return 'document';
}

// ¿Este nombre es "addX", "setX", "delX" o "X" de un comando existente?
export function resolveCustomName(commandName, jid) {
  const name = String(commandName || '').toLowerCase();
  const g = groupStore(jid);

  // Coincidencia exacta: .stock
  if (g[name]) return { action: 'show', name };

  for (const prefix of ['add', 'set', 'del']) {
    if (!name.startsWith(prefix) || name.length <= prefix.length) continue;
    const base = name.slice(prefix.length);
    if (!g[base]) continue;
    return { action: prefix === 'add' ? 'add' : prefix === 'set' ? 'set' : 'del', name: base };
  }
  return null;
}

// Ejecuta el comando personalizado. Devuelve true si lo manejó.
export async function handleCustomCommand(ctx, commandName, args) {
  if (!ctx.chat?.endsWith('@g.us')) return false;
  const resolved = resolveCustomName(commandName, ctx.chat);
  if (!resolved) return false;

  const { action, name } = resolved;
  const prefix = ctx.prefix;
  const text = String(args.join(' ') || '').trim();

  if (action === 'show') {
    await sendCustom(ctx, name);
    return true;
  }

  if (!ctx.isAdmin) {
    await ctx.reply(`🛡️ Solo los *administradores* pueden usar *${prefix}${commandName}*.`);
    return true;
  }

  if (action === 'del') {
    clearCustomContent(ctx.chat, name);
    await ctx.reply(
      `🧹 *CONTENIDO BORRADO*\n\n▸ Comando: *${prefix}${name}*\n▸ La familia sigue existiendo.`,
    );
    return true;
  }

  // add / set: texto y/o multimedia.
  // ctx.m es el mensaje serializado: .hasMedia y .quoted.vienen de ahí.
  const ser = ctx.m || ctx.msg;
  const target = ser?.quoted?.hasMedia ? ser.quoted : ser?.hasMedia ? ser : null;
  let mediaSaved = false;
  if (target) {
    try {
      const buffer = await ctx.downloadMedia(target);
      const mimetype = target.content?.mimetype || '';
      setCustomMedia(ctx.chat, name, buffer, mimetype);
      mediaSaved = true;
    } catch (err) {
      await ctx.reply(`❌ No pude guardar el archivo: ${err.message}`);
      return true;
    }
  }

  if (text) setCustomText(ctx.chat, name, text);
  else if (!mediaSaved) {
    await ctx.reply(
      `✍️ *FALTA EL CONTENIDO*\n\n` +
        `▸ *${prefix}${commandName} tu texto*\n` +
        `▸ o envía/responder una imagen con el texto`,
    );
    return true;
  }

  const current = getCustom(ctx.chat, name);
  await ctx.reply(
    `✅ *${action === 'add' ? 'CONTENIDO AGREGADO' : 'CONTENIDO ACTUALIZADO'}*\n\n` +
      `▸ Comando: *${prefix}${name}*\n` +
      `▸ Texto: ${current?.content ? `_"${current.content.slice(0, 60)}"_` : '_(sin texto)_'}\n` +
      `▸ Archivo: ${current?.media ? `sí (${current.media.type})` : 'no'}\n\n` +
      `👁️ Pruébalo: *${prefix}${name}*`,
  );
  return true;
}

// Envía el contenido guardado (texto y/o archivo).
export async function sendCustom(ctx, name) {
  const data = getCustom(ctx.chat, name);
  if (!data) {
    await ctx.reply(`❌ El comando *${name}* no existe en este grupo.`);
    return;
  }
  if (!data.content && !data.media) {
    await ctx.reply(
      `📭 *${name}* todavía está vacío.\n\n` +
        `▸ Un admin lo llena con *${ctx.prefix}add${name} texto*`,
    );
    return;
  }

  if (data.media?.file && fs.existsSync(data.media.file)) {
    const buffer = fs.readFileSync(data.media.file);
    const payload = { [data.media.type]: buffer };
    if (data.content && data.media.type !== 'audio') payload.caption = data.content;
    if (data.media.mimetype) payload.mimetype = data.media.mimetype;
    if (data.media.type === 'audio') payload.ptt = false;
    await ctx.send(payload);
    if (data.media.type === 'audio' && data.content) await ctx.reply(data.content);
    return;
  }

  await ctx.reply(data.content);
}

export function customMenuText(prefix, jid) {
  const list = listCustom(jid);
  if (!list.length) {
    return (
      `📋 *COMANDOS DEL GRUPO*\n\n` +
      `_Todavía no hay ninguno._\n\n` +
      `▸ Crea el primero: *${prefix}crearcmd stock*`
    );
  }
  return (
    `📋 *COMANDOS DEL GRUPO (${list.length})*\n\n` +
    list
      .map((c, i) => {
        const icon = c.media ? (c.media.type === 'image' ? '🖼️' : c.media.type === 'video' ? '🎬' : '📎') : '📝';
        return `${i + 1}. ${icon} *${prefix}${c.name}*`;
      })
      .join('\n') +
    `\n\n▸ Ver uno: escribe su nombre, ej. *${prefix}${list[0].name}*\n▸ Lista completa: *${prefix}menucmd*`
  );
}

export function creatorHelp(prefix, name = 'stock') {
  return (
    `╭━〔🤖 SISTEMA DE COMANDOS〕━⬣\n` +
    `┃\n` +
    `┃ ✨ *¿Qué es esto?*\n` +
    `┃ Este sistema te permite crear comandos\n` +
    `┃ personalizados por grupo 📦\n` +
    `┃\n` +
    `╰━━━━━━━━━━━━━━━━⬣\n` +
    `╭━━〔 📌 CREACIÓN 〕━━⬣\n` +
    `┃\n` +
    `┃ 🛠️ *Crear comando*\n` +
    `┃ ${prefix}crearcmd ${name}\n` +
    `┃\n` +
    `┃ 📍 Ejemplo:\n` +
    `┃ ${prefix}crearcmd stock\n` +
    `┃\n` +
    `┃ 🔹 Se crearán:\n` +
    `┃ • ${prefix}add${name}\n` +
    `┃ • ${prefix}set${name}\n` +
    `┃ • ${prefix}${name}\n` +
    `┃ • ${prefix}del${name}\n` +
    `┃\n` +
    `╰━━━━━━━━━━━━━━━⬣\n` +
    `╭━━〔 ➕ AGREGAR CONTENIDO 〕━━⬣\n` +
    `┃\n` +
    `┃ ${prefix}add${name} texto / imagen\n` +
    `┃\n` +
    `┃ 📍 Ejemplo:\n` +
    `┃ ${prefix}add${name} Productos disponibles\n` +
    `┃\n` +
    `┃ 🖼️ También puedes:\n` +
    `┃ • Enviar imagen con texto\n` +
    `┃ • Responder una imagen\n` +
    `┃ • Solo imagen\n` +
    `┃\n` +
    `┃ ⚠️ Solo admins\n` +
    `┃\n` +
    `╰━━━━━━━━━━━━━━━━━⬣\n` +
    `╭━━━〔 ✏️ EDITAR 〕━━━⬣\n` +
    `┃\n` +
    `┃ ${prefix}set${name} nuevo contenido\n` +
    `┃\n` +
    `┃ 📍 Ejemplo:\n` +
    `┃ ${prefix}set${name} Nuevo stock actualizado\n` +
    `┃\n` +
    `┃ ✔️ Edita texto o imagen\n` +
    `┃ ⚠️ Solo admins\n` +
    `┃\n` +
    `╰━━━━━━━━━━━━━━━━━⬣\n` +
    `╭━━〔 📤 USAR COMANDO 〕━━⬣\n` +
    `┃\n` +
    `┃ ${prefix}${name}\n` +
    `┃\n` +
    `┃ 📍 Ejemplo:\n` +
    `┃ ${prefix}${name}\n` +
    `┃\n` +
    `┃ 👥 Lo pueden usar todos\n` +
    `┃\n` +
    `╰━━━━━━━━━━━━━━━━⬣\n` +
    `╭━〔 🗑️ ELIMINAR CONTENIDO 〕━⬣\n` +
    `┃\n` +
    `┃ ${prefix}del${name}\n` +
    `┃\n` +
    `┃ 📍 Ejemplo:\n` +
    `┃ ${prefix}del${name}\n` +
    `┃\n` +
    `┃ ⚠️ Solo admins\n` +
    `┃\n` +
    `╰━━━━━━━━━━━━━━━━━━⬣\n` +
    `╭━〔 🧹 ELIMINAR COMPLETO 〕━⬣\n` +
    `┃\n` +
    `┃ ${prefix}delcmd ${name}\n` +
    `┃\n` +
    `┃ 📍 Ejemplo:\n` +
    `┃ ${prefix}delcmd ${name}\n` +
    `┃\n` +
    `┃ ❌ Borra el comando totalmente\n` +
    `┃\n` +
    `╰━━━━━━━━━━━━━━━━━━⬣\n` +
    `╭━━〔 📋 VER COMANDOS 〕━━⬣\n` +
    `┃\n` +
    `┃ ${prefix}menucmd\n` +
    `┃\n` +
    `┃ 📍 Muestra todos los comandos\n` +
    `┃ del grupo 📦\n` +
    `┃\n` +
    `╰━━━━━━━━━━━━━━━━━━⬣\n` +
    `╭━━━〔 🎨 PLANTILLA 〕━━━⬣\n` +
    `┃\n` +
    `┃ Puedes usar este formato:\n` +
    `┃\n` +
    `┃ 📦 *STOCK DISPONIBLE*\n` +
    `┃ ───────────────\n` +
    `┃ 🛒 Producto 1\n` +
    `┃ 💰 Precio\n` +
    `┃ 📲 Contacto\n` +
    `┃\n` +
    `┃ ✨ Personalízalo como quieras\n` +
    `┃\n` +
    `╰━━━━━━━━━━━━━━━━⬣`
  );
}
