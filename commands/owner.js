import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { config } from '../config.js';
import {
  db,
  save,
  saveNow,
  getUser,
  addOwner,
  removeOwner,
  setPrimaryOwner,
  isOwnerNumber,
  resetDb,
  DB_FILE,
} from '../lib/db.js';
import {
  cleanTmp,
  execShell,
  fetchBuffer,
  fetchWithTimeout,
  isUrl,
  jidToNumber,
  numberToJid,
  probeDuration,
  sleep,
  tmpFile,
  toJid,
  truncate,
  watermarkContent,
  withWatermark,
} from '../lib/utils.js';
import { getGroupMetadata, trackSent } from '../lib/state.js';
import { getTargetJid, findParticipant } from '../lib/targets.js';
import {
  clearSubbotBanner,
  effectiveSettings,
  getBotSetting,
  setBotSetting,
  setBotSettings,
  subbotBannerPath,
} from '../lib/settings.js';
import { gifToMp4 } from '../lib/sticker.js';
import { DEFAULT_MENU_STYLE, MENU_STYLES } from '../lib/menu.js';
import { DEFAULT_THEME, THEMES, themeList } from '../lib/theme.js';
import * as api from '../lib/api.js';
import * as utils from '../lib/utils.js';
import { autoAdminSweep } from '../handlers/group.js';

const require = createRequire(import.meta.url);

// ─── Despedida al salir de un grupo ────────────────────────────────────────
const ZENITSU_FAREWELL_QUOTES = [
  'Puede que sea un cobarde, ¡pero daré todo de mí!',
  'Estoy asustado... pero aunque esté asustado, ¡no me rendiré!',
  '¡No me digas que rendirse es la respuesta correcta!',
  'Me esforcé hasta el límite para no perder nada. Me esforcé tanto que sangraba.',
  'Solo quien se esfuerza hasta el final puede llamarse fuerte.',
  'Si tienes miedo, corre... pero nunca dejes de avanzar.',
  '¡Respiración del Trueno, Primera Forma: Trueno Relámpago y Destello!',
];

// Mensaje que el bot deja en el grupo antes de irse: despedida formal, una
// frase de Zenitsu al azar y el wa.me del owner por si lo quieren de vuelta.
function buildFarewell() {
  const quote = ZENITSU_FAREWELL_QUOTES[Math.floor(Math.random() * ZENITSU_FAREWELL_QUOTES.length)];
  const ownerNumber = jidToNumber(db().owners?.[0] || config.ownerNumber);
  return withWatermark(
    '╭━━━ ⚡ ZENITSU SE DESPIDE ━━━╮\n\n' +
      '🌩️ Llegó la hora de mi retirada,\n' +
      'pero el trueno siempre vuelve.\n\n' +
      `🗞️ _"${quote}"_\n\n` +
      '👤 ¿Quieres un bot como yo?\n' +
      '📲 Escríbele a mi creador:\n' +
      `🔗 https://wa.me/${ownerNumber}\n\n` +
      '╰━━━━━━━━━━━━━━━━━━━━╯\n\n' +
      '_🌩️ Respiración del Trueno, Séptima Forma: Trueno Llameante._',
  );
}

// Convierte un JID con número real (…@s.whatsapp.net) al teléfono.
function phoneFromJid(jid) {
  const s = String(jid || '');
  if (!s.endsWith('@s.whatsapp.net')) return '';
  const n = jidToNumber(s);
  return n.length >= 7 && n.length <= 15 ? n : '';
}

// Resuelve el teléfono real de un JID que puede venir como LID (…@lid).
// Prueba el mapeo de Baileys, la metadata del grupo y los subbots conocidos.
async function resolvePhoneFromJid(ctx, jid) {
  const direct = phoneFromJid(jid);
  if (direct) return direct;
  const s = String(jid || '');
  if (!s.endsWith('@lid')) return '';

  // 1. Metadata del grupo: el participante suele traer phoneNumber (rápido,
  // ya está cacheada por getGroupMeta).
  if (ctx.isGroup && ctx.getGroupMeta) {
    try {
      const meta = await ctx.getGroupMeta();
      const p = findParticipant(meta, s);
      for (const j of [p?.phoneNumber, p?.id, p?.lid]) {
        const n = phoneFromJid(j || '');
        if (n) return n;
      }
    } catch {}
  }

  // 2. Mapeo LID → PN de Baileys.
  try {
    const pn = await Promise.race([
      ctx.sock?.signalRepository?.lidMapping?.getPNForLID(s),
      sleep(6000).then(() => null),
    ]);
    const n = phoneFromJid(pn || '');
    if (n) return n;
  } catch {}

  // 3. Comparar con el LID de cada subbot registrado (PN → LID).
  try {
    const { listSubbots } = await import('../lib/subbots.js');
    for (const sub of listSubbots()) {
      const pnJid = String(sub.jid || '').endsWith('@s.whatsapp.net')
        ? sub.jid
        : `${sub.number}@s.whatsapp.net`;
      const lid = await Promise.race([
        ctx.sock?.signalRepository?.lidMapping?.getLIDForPN(pnJid),
        sleep(4000).then(() => null),
      ]);
      if (lid && jidToNumber(lid) === jidToNumber(s)) {
        return String(sub.number || '').replace(/\D/g, '');
      }
    }
  } catch {}

  return '';
}

// Resuelve a qué subbot apunta un comando de subbots. Acepta:
//   .prem @user        → el mencionado
//   .prem              (respondiendo a su mensaje) → el citado
//   .prem 50312345678  → el número escrito
// Siempre devuelve UN SOLO número (el real, nunca un LID) y, si existe,
// el registro del subbot para no crear entradas basura.
async function resolveSubbotTarget(ctx) {
  const candidates = [];
  if (ctx.mentioned?.length) candidates.push({ jid: ctx.mentioned[0], via: 'mención' });
  if (ctx.quotedSender) candidates.push({ jid: ctx.quotedSender, via: 'respuesta' });
  const arg = String(ctx.args[0] || '').replace(/\D/g, '');
  if (arg.length >= 7 && arg.length <= 15) candidates.push({ number: arg, via: 'número' });

  const { listSubbots } = await import('../lib/subbots.js');
  const known = listSubbots();
  const digitsOf = (v) => String(v || '').replace(/\D/g, '');
  const findRecord = (num) => known.find((s) => digitsOf(s.number) === num) || null;
  const canonical = (num, via) => {
    const record = findRecord(num);
    // Si ya existe, se devuelve el número guardado (siempre el real).
    return { number: record ? digitsOf(record.number) : num, via, record };
  };

  for (const c of candidates) {
    if (c.number) return canonical(c.number, c.via);
    const num = await resolvePhoneFromJid(ctx, c.jid);
    if (num) return canonical(num, c.via);
    // Último recurso: el JID coincide exacto con el guardado del subbot.
    const byJid = known.find((s) => String(s.jid || '') === String(c.jid || ''));
    if (byJid) {
      return { number: digitsOf(byJid.number), via: c.via, record: byJid };
    }
  }
  return null;
}

// Busca los días en los argumentos (.prem @user 30). Ignora el número largo
// del teléfono; 0 o ausente significa permanente.
function parseDays(args = []) {
  for (const a of args) {
    const d = String(a || '').replace(/\D/g, '');
    if (d && d.length <= 3 && Number(d) > 0) return Number(d);
  }
  return 0;
}

// Número real (PN) de quien escribe. WhatsApp puede entregar un LID interno
// (…@lid) en lugar del teléfono: un LID NUNCA sirve para pedir un código.
async function resolveSenderPhone(ctx) {
  const m = ctx.m || {};
  const candidates = [m.senderAlt, m.sender, m.chatAlt, m.chat].filter(Boolean);
  const phoneOf = (jid) => {
    const s = String(jid || '');
    if (!s.endsWith('@s.whatsapp.net')) return '';
    const n = jidToNumber(s);
    return n.length >= 7 && n.length <= 15 ? n : '';
  };
  // 1. JIDs que ya traen el teléfono real.
  for (const jid of candidates) {
    const n = phoneOf(jid);
    if (n) return n;
  }
  // 2. LID → PN con el mapeo interno de Baileys (con tope de tiempo: si el
  // servidor no responde, no se queda colgado).
  for (const jid of candidates) {
    if (!String(jid).endsWith('@lid')) continue;
    try {
      const pn = await Promise.race([
        ctx.sock?.signalRepository?.lidMapping?.getPNForLID(String(jid)),
        sleep(6000).then(() => null),
      ]);
      const n = phoneOf(pn || '');
      if (n) return n;
    } catch {}
  }
  // 3. Metadata del grupo (el participante trae phoneNumber y a veces lid).
  if (m.isGroup && ctx.getGroupMeta) {
    try {
      const meta = await ctx.getGroupMeta();
      const p =
        findParticipant(meta, m.sender) ||
        findParticipant(meta, m.senderAlt) ||
        findParticipant(meta, m.chatAlt);
      for (const jid of [p?.phoneNumber, p?.id, p?.lid]) {
        const n = phoneOf(jid || '');
        if (n) return n;
      }
      // Último recurso: resolver el LID del participante con Baileys.
      const lid = [p?.lid, p?.id, m.sender].find((j) => String(j || '').endsWith('@lid'));
      if (lid) {
        const pn = await Promise.race([
          ctx.sock?.signalRepository?.lidMapping?.getPNForLID(String(lid)),
          sleep(6000).then(() => null),
        ]);
        const n = phoneOf(pn || '');
        if (n) return n;
      }
    } catch {}
  }
  return '';
}

// Comprueba que el número exista en WhatsApp antes de generar el código.
// Si la consulta falla, no bloquea (se deja intentar igual).
async function numberOnWhatsApp(sock, number) {
  try {
    const res = await Promise.race([
      sock.onWhatsApp(number),
      sleep(8000).then(() => null),
    ]);
    if (!res) return true;
    return Boolean(res[0]?.exists);
  } catch {
    return true;
  }
}


function restartProcess() {
  saveNow();
  // Si start.sh nos está supervisando, basta con salir con error para que
  // el bucle nos vuelva a levantar (sin duplicar procesos).
  if (process.env.ZENITSU_SUPERVISED === '1') {
    process.exit(1);
  }
  if (process.env.pm_id || process.env.PM2_HOME) {
    process.exit(0);
  }
  try {
    const child = spawn(process.execPath, process.argv.slice(1), {
      cwd: process.cwd(),
      detached: true,
      stdio: 'inherit',
      env: process.env,
    });
    child.unref();
    process.exit(0);
  } catch (err) {
    console.error('No se pudo reiniciar:', err);
    process.exit(1);
  }
}

async function getImageBuffer(ctx) {
  if (ctx.quoted?.mediaType === 'image') return ctx.downloadQuoted();
  if (ctx.m.mediaType === 'image') return ctx.downloadMedia();
  const url = ctx.args.find((a) => isUrl(a));
  if (url) return fetchBuffer(url);
  return null;
}

async function getBannerMedia(ctx) {
  if (ctx.quoted?.mediaType === 'image' || ctx.quoted?.mediaType === 'video') {
    return { buffer: await ctx.downloadQuoted(), kind: ctx.quoted.mediaType };
  }
  if (ctx.m.mediaType === 'image' || ctx.m.mediaType === 'video') {
    return { buffer: await ctx.downloadMedia(), kind: ctx.m.mediaType };
  }
  const url = ctx.args.find((a) => isUrl(a));
  if (!url) return null;
  const res = await fetchWithTimeout(url, {}, 120000);
  if (!res.ok) throw new Error(`No pude descargar el banner (HTTP ${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const mime = String(res.headers.get('content-type') || api.guessMimeFromUrl(url)).toLowerCase();
  const kind = mime.includes('gif') ? 'gif' : mime.startsWith('video/') ? 'video' : 'image';
  return { buffer, kind };
}

function mask(value = '') {
  const v = String(value);
  if (v.length <= 8) return '••••••••';
  return `${v.slice(0, 4)}••••${v.slice(-4)}`;
}

function toggle(name, key, label, aliases = []) {
  return {
    name,
    aliases,
    category: 'owner',
    desc: `Activa o desactiva ${label}.`,
    usage: `${name} on|off`,
    owner: true,
    async execute(ctx) {
      const value = String(ctx.args[0] || '').toLowerCase();
      if (!value) {
        await ctx.reply(`⚙️ *${label}:* ${db()[key] ? '✅ ON' : '❌ OFF'}\n\n💡 Uso: ${ctx.prefix}${name} on|off`);
        return;
      }
      if (['on', 'si', 'sí', '1', 'true', 'activar'].includes(value)) db()[key] = true;
      else if (['off', 'no', '0', 'false', 'desactivar'].includes(value)) db()[key] = false;
      else {
        await ctx.reply(`❌ Valor inválido. Usa *on* u *off*.`);
        return;
      }
      save();
      await ctx.reply(`⚙️ *${label}:* ${db()[key] ? '✅ ON' : '❌ OFF'}`);
    },
  };
}

// ─── .kickall / .tumbargrupo ────────────────────────────────────────────────
// Demolición total del grupo: solo el owner, y con palabra de confirmación.
// .tumbargrupo lanza una lluvia de mensajes reenviados del canal y al final
// expulsa a todos; .kickall hace solo la expulsión.

const CONFIRM_WORDS = ['confirmar', 'confirma', 'confirm', 'si', 'sí', 'yes', 'ok'];

// Frases de la lluvia: rotan para que WhatsApp no aburra los mensajes
// idénticos tan rápido.
const RAID_PHRASES = [
  '⚡ ZENITSU DOMINA PERRES ⚡',
  '🔥 ZENITSU DOMINA PERRES 🔥',
  '⚡⚡ ZENITSU DOMINA PERRES ⚡⚡',
  '🌩️ ZENITSU DOMINA TODOS LOS PERRES 🌩️',
  '👑 ZENITSU DOMINA ESTE GRUPO, PERRES 👑',
  '🐉 SÉPTIMO ESTILO: ZENITSU DOMINA PERRES 🐉',
  '⚡ DIOS DEL TRUENO FLAMÍGERO: ZENITSU DOMINA PERRES ⚡',
  '🌩️ NADIE SE ME PONE DELANTE, PERRES 🌩️',
];

// Demoliciones en curso por grupo: mientras una corre, no entra otra en el
// mismo chat (dos lluvias cruzadas tumbarían al bot antes que al grupo).
const activeRaids = new Set();

// Jid para expulsar a un participante de la metadata: usa su id completo y,
// si llegara roto (dígitos sueltos), lo reconstruye con lid/pn.
function kickJidOf(p) {
  const id = typeof p?.id === 'string' ? p.id : '';
  if (id.includes('@')) return toJid(id);
  const lid = toJid(p?.lid);
  if (lid) return lid;
  const pn = [p?.pn, p?.phoneNumber].map(jidToNumber).find(Boolean);
  if (pn) return numberToJid(pn);
  if (id && typeof p?.server === 'string') return toJid({ id, server: p.server });
  return '';
}

// Número real de un participante: pn/phoneNumber directo, id @s.whatsapp.net
// o, si solo trae LID, lo resuelve con el almacén local de la sesión (lo
// llena el history sync de Baileys; no gasta red).
async function realNumberOf(ctx, p) {
  const direct = [p?.pn, p?.phoneNumber].map(jidToNumber).filter(Boolean)[0];
  if (direct) return direct;
  const id = toJid(p?.id);
  if (id && !id.endsWith('@lid')) return jidToNumber(id);
  const lid = toJid(p?.lid) || id || '';
  if (lid.endsWith('@lid')) {
    try {
      const pn = await ctx.sock?.signalRepository?.lidMapping?.getPNForLID?.(lid);
      const n = jidToNumber(pn);
      if (n) return n;
    } catch {}
  }
  return '';
}

// Expulsa a TODOS los participantes menos el creador del grupo (WhatsApp no
// lo permite), el propio bot y los owners. Va en tandas de 10 con pausa
// para que WhatsApp no lo tome como abuso. Devuelve el resumen del ataque.
async function kickEveryone(ctx) {
  const meta = await getGroupMetadata(ctx.sock, ctx.chat);
  const participants = meta?.participants || [];
  const botNumber = jidToNumber(ctx.sock?.user?.id);
  const botLidRaw = toJid(ctx.sock?.user?.lid);
  const botLidNumber = botLidRaw
    ? jidToNumber(botLidRaw.endsWith('@lid') ? botLidRaw : `${botLidRaw.replace(/\D/g, '')}@lid`)
    : '';
  const owners = new Set((db().owners || []).map((o) => String(o).replace(/\D/g, '')));
  const targets = [];
  let botAdmin = false;
  for (const p of participants) {
    if (p?.admin === 'superadmin') continue; // creador del grupo: intocable
    const ids = [p?.id, p?.lid, p?.pn, p?.phoneNumber].filter(Boolean).map(jidToNumber);
    if (ids.includes(botNumber) || (botLidNumber && ids.includes(botLidNumber))) {
      if (p?.admin === 'admin' || p?.admin === 'superadmin') botAdmin = true;
      continue; // el bot no se autodestruye
    }
    const real = await realNumberOf(ctx, p);
    if (real && owners.has(real)) continue; // owner a salvo
    const jid = kickJidOf(p);
    if (jid) targets.push(jid);
  }
  let kicked = 0;
  let failed = 0;
  for (let i = 0; i < targets.length; i += 10) {
    const batch = targets.slice(i, i + 10);
    try {
      const res = await ctx.sock.groupParticipantsUpdate(ctx.chat, batch, 'remove');
      const ok = (Array.isArray(res) ? res : []).filter((r) => r?.status === '200').length;
      kicked += ok;
      failed += batch.length - ok;
    } catch {
      failed += batch.length;
    }
    if (i + 10 < targets.length) await sleep(300);
  }
  return { total: participants.length, targets: targets.length, kicked, failed, botAdmin };
}

export default [
  {
    name: 'bot',
    aliases: ['botestado', 'estadobot', 'subbotestado'],
    category: 'owner',
    desc: 'Apaga o enciende ESTE subbot. Apagado no responde, no reacciona y no lee nada.',
    usage: 'bot on|off|estado',
    owner: true,
    subOwner: true,
    async execute(ctx) {
      if (!ctx.isSubbot) {
        await ctx.reply(
          `ℹ️ Este comando controla a un *subbot*.\n\n` +
            `En grupos usa *${ctx.prefix}botoff* / *${ctx.prefix}boton* para silenciar el bot solo en ese grupo.`,
        );
        return;
      }

      const { setSubbotPaused } = await import('../lib/subbots.js');
      const action = String(ctx.args[0] || '').toLowerCase();
      const record = ctx.subbot;

      if (!action || ['estado', 'status', 'info'].includes(action)) {
        await ctx.reply(
          `⚡ *ESTADO DE ESTE SUBBOT*\n\n` +
            `🤖 ${record.name} · +${record.number}\n` +
            `▸ Estado: ${record.paused ? '🔴 *APAGADO*' : '🟢 *ENCENDIDO*'}\n` +
            `▸ Owner: ${record.owner ? `+${record.owner}` : 'sin configurar'}\n\n` +
            `💡 ${ctx.prefix}bot off — no responde nada\n` +
            `💡 ${ctx.prefix}bot on — vuelve a responder`,
        );
        return;
      }

      if (['off', 'apagar', 'apagado', 'detener', 'stop', '0'].includes(action)) {
        setSubbotPaused(record.number, true);
        await ctx.reply(
          `🔴 *SUBBOT APAGADO*\n\n` +
            `🤖 ${record.name} · +${record.number}\n\n` +
            `Desde ahora *no lee, no reacciona y no responde nada* (ni comandos, ni IA, ni bienvenidas). ` +
            `Sigue conectado en segundo plano para que puedas encenderlo.\n\n` +
            `💡 Para encenderlo: *${ctx.prefix}bot on*`,
        );
        return;
      }

      if (['on', 'encender', 'prender', 'activar', 'start', '1'].includes(action)) {
        setSubbotPaused(record.number, false);
        await ctx.reply(
          `🟢 *SUBBOT ENCENDIDO*\n\n` +
            `🤖 ${record.name} · +${record.number}\n\n` +
            `Ya vuelve a responder comandos, IA y mensajes del grupo.\n\n` +
            `💡 Para apagarlo: *${ctx.prefix}bot off*`,
        );
        return;
      }

      await ctx.reply(
        `💡 Uso: *${ctx.prefix}bot on* · *${ctx.prefix}bot off* · *${ctx.prefix}bot estado*`,
      );
    },
  },
  {
    name: 'setname',
    aliases: ['setbotname', 'nombrebot'],
    category: 'owner',
    desc: 'Cambia el nombre interno del bot (o de este subbot).',
    usage: 'setname <nombre>',
    owner: true,
    subOwner: true,
    async execute(ctx) {
      const name = ctx.text.trim();
      if (name.length < 2 || name.length > 40) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}setname* <nombre> (2 a 40 caracteres)`);
        return;
      }
      setBotSetting(ctx.subbot, 'botName', name);
      await ctx.reply(
        `✅ Nombre ${ctx.isSubbot ? 'de este subbot' : 'del bot'} actualizado a:\n\n⚡ *${name}*`,
      );
    },
  },
  {
    name: 'setbanner',
    aliases: ['banner', 'bannermenu'],
    category: 'owner',
    desc: 'Cambia la imagen, GIF o video (máx. 15s) del menú.',
    usage: 'setbanner <url | responde a imagen/gif/video | reset>',
    owner: true,
    subOwner: true,
    async execute(ctx) {
      const arg = String(ctx.args[0] || '').toLowerCase();
      if (arg === 'reset' || arg === 'delete' || arg === 'borrar') {
        if (ctx.isSubbot) {
          clearSubbotBanner(ctx.subbot.number);
          setBotSettings(ctx.subbot, { banner: undefined, bannerType: undefined });
        } else {
          db().banner = null;
          db().bannerType = 'image';
          save();
        }
        await ctx.reply(
          ctx.isSubbot
            ? '🗑️ Banner propio eliminado. Este subbot usará el banner del bot principal.'
            : '🗑️ Banner eliminado. El menú se enviará como texto.',
        );
        return;
      }

      const media = await getBannerMedia(ctx);
      if (!media?.buffer?.length) {
        await ctx.reply(
          `💡 *Uso:*\n▸ Responde a una *imagen*, *GIF* o *video de máximo 15s* con *${ctx.prefix}setbanner*\n▸ ${ctx.prefix}setbanner https://...\n▸ ${ctx.prefix}setbanner reset`,
        );
        return;
      }
      if (media.buffer.length > config.maxFileSize) {
        await ctx.reply('❌ El archivo es demasiado grande para usarlo como banner.');
        return;
      }

      let buffer = media.buffer;
      let kind = media.kind;
      let seconds = 0;

      if (kind === 'gif') {
        await ctx.reply('🎞️ Convirtiendo el GIF al formato del menú...');
        buffer = await gifToMp4(buffer);
        kind = 'video';
      }

      if (kind === 'video') {
        const tmp = tmpFile('mp4');
        fs.writeFileSync(tmp, buffer);
        seconds = await probeDuration(tmp);
        try { fs.rmSync(tmp, { force: true }); } catch {}
        if (seconds > 15.5) {
          await ctx.reply(
            `❌ El video dura *${seconds.toFixed(1)}s* y el máximo es *15s*.\n\nRecórtalo o envía un GIF más corto.`,
          );
          return;
        }
      }

      const isVideo = kind === 'video';
      // El banner de un subbot se guarda con su número para no pisar el del
      // bot principal (assets/banner.jpg | banner.mp4).
      const target = ctx.isSubbot
        ? subbotBannerPath(ctx.subbot.number, isVideo)
        : path.join(config.assetsDir, isVideo ? 'banner.mp4' : 'banner.jpg');
      if (ctx.isSubbot) {
        const other = subbotBannerPath(ctx.subbot.number, !isVideo);
        try { fs.rmSync(other, { force: true }); } catch {}
      }
      fs.mkdirSync(config.assetsDir, { recursive: true });
      fs.writeFileSync(target, buffer);
      setBotSettings(ctx.subbot, {
        banner: target,
        bannerType: isVideo ? 'video' : 'image',
      });

      const botName = effectiveSettings(ctx.subbot).botName;
      const caption = isVideo
        ? `✅ *Banner actualizado*\n\n🎬 Video/GIF${seconds ? ` de *${seconds.toFixed(1)}s*` : ''}\nAsí se verá el menú de ${botName}.`
        : `✅ *Banner actualizado*\n\n🖼️ Imagen del menú de ${botName}.`;
      if (isVideo) {
        await ctx.send({ video: buffer, gifPlayback: true, caption });
      } else {
        await ctx.send({ image: buffer, caption });
      }
    },
  },
  {
    name: 'setlink',
    aliases: ['menulink', 'setenlace', 'enlacemenu'],
    category: 'owner',
    desc: 'Cambia el enlace que aparece en el menú.',
    usage: 'setlink <url | reset>',
    owner: true,
    subOwner: true,
    async execute(ctx) {
      const value = ctx.text.trim();
      if (!value || ['reset', 'borrar', 'delete'].includes(value.toLowerCase())) {
        setBotSetting(ctx.subbot, 'menuLink', '');
        await ctx.reply('🗑️ Enlace del menú eliminado.');
        return;
      }
      if (!/^https?:\/\/\S+$/i.test(value)) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}setlink* https://github.com/jhondzn03-bit/ZENITSU-BOT`);
        return;
      }
      setBotSetting(ctx.subbot, 'menuLink', value);
      await ctx.reply(`✅ Enlace del menú actualizado:\n\n🔗 ${value}`);
    },
  },
  {
    name: 'settheme',
    aliases: ['tema', 'theme', 'settema', 'estilototal'],
    category: 'owner',
    desc: 'Cambia el tema global: menú + estilo de todas las respuestas.',
    usage: 'settheme <estilo|off|lista>',
    owner: true,
    subOwner: true,
    async execute(ctx) {
      const style = String(ctx.args[0] || '').toLowerCase();
      const currentTheme = getBotSetting(ctx.subbot, 'theme') || DEFAULT_THEME;
      const currentMenu = getBotSetting(ctx.subbot, 'menuStyle') || DEFAULT_MENU_STYLE;
      const list = themeList(currentTheme === 'off' ? '' : currentTheme);

      if (!style || ['lista', 'list', 'ayuda', 'help'].includes(style)) {
        await ctx.reply(
          `🎨 *TEMAS DEL BOT*\n\n` +
            `${list}\n\n` +
            `▸ Tema actual: *${currentTheme}*\n` +
            `▸ Estilo del menú: *${currentMenu}*\n\n` +
            `💡 Cambiar: *${ctx.prefix}settheme zenitsu*\n` +
            `💡 Apagar marcos: *${ctx.prefix}settheme off*`,
        );
        return;
      }

      if (['off', 'ninguno', 'none', 'apagado'].includes(style)) {
        setBotSetting(ctx.subbot, 'theme', 'off');
        await ctx.reply('✅ Marcos de las respuestas *apagados*. El menú conserva su estilo.');
        return;
      }

      if (!THEMES[style]) {
        await ctx.reply(
          `❌ Tema *${style}* no existe.\n\n${list}\n\n💡 Uso: *${ctx.prefix}settheme galactico*`,
        );
        return;
      }

      // Un solo comando cambia TODO: menú + respuestas (solo en este subbot
      // si lo ejecuta su owner).
      setBotSettings(ctx.subbot, { theme: style, menuStyle: style });
      const meta = THEMES[style];
      // Este mismo mensaje ya sale con el tema nuevo: es la vista previa.
      await ctx.reply(
        `✅ *TEMA CAMBIADO:* ${meta.emoji} *${meta.label}*\n\n` +
          `✨ Este mensaje ya es una *vista previa*: así se verán todas mis respuestas.\n\n` +
          `▸ Menú nuevo: *${ctx.prefix}menu*\n` +
          `▸ Otro tema: *${ctx.prefix}settheme lista*\n` +
          `▸ Apagar marcos: *${ctx.prefix}settheme off*`,
      );
    },
  },
  {
    name: 'setmenu',
    aliases: ['menustyle', 'estilomenu', 'estilo'],
    category: 'owner',
    desc: 'Cambia el estilo visual del menú.',
    usage: 'setmenu <estilo>',
    owner: true,
    subOwner: true,
    async execute(ctx) {
      const style = String(ctx.args[0] || '').toLowerCase();
      const current = getBotSetting(ctx.subbot, 'menuStyle') || DEFAULT_MENU_STYLE;
      const list = Object.entries(MENU_STYLES)
        .map(([key, meta]) => `${key === current ? '✅' : '▸'} ${meta.emoji} *${key}* — ${meta.desc}`)
        .join('\n');

      if (!style || style === 'lista' || style === 'list') {
        await ctx.reply(
          `🎨 *ESTILOS DEL MENÚ*\n\n${list}\n\n💡 Uso: *${ctx.prefix}setmenu galactico*\n💡 Actual: *${current}*`,
        );
        return;
      }

      if (style === 'reset' || style === 'default') {
        setBotSetting(ctx.subbot, 'menuStyle', DEFAULT_MENU_STYLE);
        // El modo Navidad global tapaba el estilo elegido: al restablecer se
        // apaga para que el menú normal se vea de verdad.
        setBotSetting(ctx.subbot, 'christmas', false);
        await ctx.reply(`✅ Estilo del menú restablecido a *${DEFAULT_MENU_STYLE}*.`);
        return;
      }

      if (!MENU_STYLES[style]) {
        await ctx.reply(
          `❌ Estilo *${style}* no existe.\n\n${list}\n\n💡 Uso: *${ctx.prefix}setmenu galactico*`,
        );
        return;
      }

      setBotSetting(ctx.subbot, 'menuStyle', style);
      // Importante: el modo Navidad global se comía el estilo elegido (siempre
      // salía el mismo menú). Ahora cada estilo se ve tal cual y solo
      // "navideno" activa la edición navideña.
      setBotSetting(ctx.subbot, 'christmas', style === 'navideno');
      const meta = MENU_STYLES[style];
      await ctx.reply(
        `✅ Estilo del menú cambiado a ${meta.emoji} *${meta.label}*.\n\n` +
          (style === 'navideno'
            ? '🎄 Modo Navidad *activado*.'
            : `💡 Navidad global *desactivada* para que se vea este estilo.\nActívala con *${ctx.prefix}navidad on*.`) +
          `\n\nEscribe *${ctx.prefix}menu* para verlo.`,
      );
    },
  },
  {
    name: 'navidad',
    aliases: ['christmas', 'navideno', 'xmas', 'modonavidad'],
    category: 'owner',
    desc: 'Activa o desactiva el menú navideño (cambia solo al estilo navideno).',
    usage: 'navidad on|off|estado',
    owner: true,
    subOwner: true,
    async execute(ctx) {
      const sub = String(ctx.args[0] || '').toLowerCase();
      const current = getBotSetting(ctx.subbot, 'menuStyle') || DEFAULT_MENU_STYLE;
      const on = current === 'navideno';
      const estado =
        `🎄 *MENÚ NAVIDEÑO*\n\n` +
        `▸ Estado: ${on ? '🟢 ACTIVADO' : '🔴 DESACTIVADO'}\n` +
        `▸ Estilo actual: *${current}*\n` +
        `▸ Adorno: ⚡ rayos (sin estrellas)\n\n` +
        `💡 Uso: *${ctx.prefix}navidad on* · *${ctx.prefix}navidad off*\n` +
        `💡 Otros estilos: *${ctx.prefix}setmenu*`;

      if (!sub || sub === 'estado' || sub === 'status') {
        await ctx.reply(estado);
        return;
      }
      if (!['on', 'off', 'si', 'sí', 'no'].includes(sub)) {
        await ctx.reply(estado);
        return;
      }

      const value = sub === 'on' || sub === 'si' || sub === 'sí';
      // Solo cambia el ESTILO del menú. Antes activaba un modo global que
      // convertía todos los estilos en navideños y no dejaba elegir otro.
      if (value) {
        setBotSetting(ctx.subbot, 'menuStyle', 'navideno');
        setBotSetting(ctx.subbot, 'christmas', true);
      } else {
        setBotSetting(ctx.subbot, 'menuStyle', DEFAULT_MENU_STYLE);
        setBotSetting(ctx.subbot, 'christmas', false);
      }
      await ctx.reply(
        value
          ? `🎄 *MENÚ NAVIDEÑO ACTIVADO*\n\nEscribe *${ctx.prefix}menu* para verlo.\n_Para otro estilo:_ *${ctx.prefix}setmenu <estilo>*`
          : `🎅 *MENÚ NAVIDEÑO DESACTIVADO*\n\nVolvió al estilo *${DEFAULT_MENU_STYLE}*. Elige otro con *${ctx.prefix}setmenu*.`,
      );
    },
  },
  {
    name: 'setprefix',
    aliases: ['prefix', 'prefijo'],
    category: 'owner',
    desc: 'Cambia el prefijo de los comandos.',
    usage: 'setprefix <prefijo>',
    owner: true,
    subOwner: true,
    async execute(ctx) {
      const p = String(ctx.args[0] || '').trim();
      if (!p || p.length > 3 || /\s/.test(p)) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}setprefix* <prefijo> (ej: . ! # /)`);
        return;
      }
      setBotSetting(ctx.subbot, 'prefix', p);
      await ctx.reply(`✅ Prefijo cambiado a: *${p}*\n\nEjemplo: *${p}menu*`);
    },
  },
  {
    name: 'setprimary',
    aliases: ['setprincipal', 'botprincipal', 'primary'],
    category: 'owner',
    desc: 'Marca un subbot como BOT PRINCIPAL: por @mención, respuesta o número.',
    usage: 'setprimary <@user|número>',
    owner: true,
    async execute(ctx) {
      const target = await resolveSubbotTarget(ctx);
      if (!target) {
        await ctx.reply(
          `💡 *Uso:*\n${ctx.prefix}setprimary @user\n${ctx.prefix}setprimary 503XXXXXXXX\n${ctx.prefix}setprimary (respondiendo a su mensaje)`,
        );
        return;
      }
      const num = target.number;
      const { setSubbotPrimary, isSubbotRegistered } = await import('../lib/subbots.js');
      const record = setSubbotPrimary(num);
      if (!isSubbotRegistered(num)) {
        await ctx.reply(
          `👑 *+${num}* ahora es el BOT PRINCIPAL de los subbots.\n\n⚠️ Aún no está vinculado: usa *${ctx.prefix}code ${num}* para vincularlo.\n\n` +
            `Tendrá: ✅ todo desbloqueado (descargas, IA) y 🔇 no se puede silenciar.`,
        );
        return;
      }
      await ctx.reply(
        `👑 *BOT PRINCIPAL ESTABLECIDO*\n\n🤖 Subbot: *${record.name}*\n📱 +${record.number}\n\n` +
          `✅ Todo desbloqueado (incluye descargas e IA)\n` +
          `🔇 No se silencia con *${ctx.prefix}silenciarsubbs*\n` +
          `⚡ Solo puede haber un bot principal a la vez.\n▸ Detectado por ${target.via}`,
      );
    },
  },
  {
    name: 'setowner',
    aliases: ['ownerprincipal', 'dueño'],
    category: 'owner',
    desc: 'Cambia el owner: el global del bot o el propio de este subbot.',
    usage: 'setowner [número|@mención]',
    owner: true,
    subOwner: true,
    async execute(ctx) {
      let num = '';
      if (ctx.mentioned?.length) {
        num = await resolvePhoneFromJid(ctx, ctx.mentioned[0]);
      }
      if (!num && ctx.quotedSender) {
        num = await resolvePhoneFromJid(ctx, ctx.quotedSender);
      }
      if (!num) num = String(ctx.args[0] || '').replace(/\D/g, '');
      // En un subbot, sin argumentos se usa el número real de quien escribe.
      if (!num && ctx.isSubbot) num = await resolveSenderPhone(ctx);

      if (num.length < 7) {
        await ctx.reply(
          ctx.isSubbot
            ? `💡 Uso: *${ctx.prefix}setowner* 503XXXXXXXX\nTambién: *${ctx.prefix}setowner* (tú mismo) o mencionando a alguien.`
            : `💡 Uso: *${ctx.prefix}setowner* 503XXXXXXXX`,
        );
        return;
      }

      if (ctx.isSubbot) {
        const { setSubbotOwner } = await import('../lib/subbots.js');
        const record = setSubbotOwner(ctx.subbot.number, num);
        await ctx.reply(
          `👑 *OWNER DE ESTE SUBBOT ACTUALIZADO*\n\n` +
            `🤖 Subbot: *${record.name}*\n📱 +${record.number}\n` +
            `👤 Nuevo owner: *+${num}*\n\n` +
            `Ese owner ya puede usar *${ctx.prefix}bot on/off*, *${ctx.prefix}setname*, ` +
            `*${ctx.prefix}setbanner*, *${ctx.prefix}settheme* y los demás ajustes de este subbot.`,
        );
        return;
      }

      setPrimaryOwner(num);
      await ctx.reply(`✅ Owner principal actualizado a: *+${num}*`);
    },
  },
  {
    name: 'addowner',
    aliases: ['agregarowner'],
    category: 'owner',
    desc: 'Agrega un owner adicional.',
    usage: 'addowner <número>',
    owner: true,
    async execute(ctx) {
      const num = String(ctx.args[0] || '').replace(/\D/g, '');
      if (num.length < 7) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}addowner* 503XXXXXXXX`);
        return;
      }
      const added = addOwner(num);
      await ctx.reply(added ? `✅ Owner agregado: *+${num}*` : `ℹ️ *+${num}* ya es owner.`);
    },
  },
  {
    name: 'delowner',
    aliases: ['quitarowner'],
    category: 'owner',
    desc: 'Elimina un owner adicional.',
    usage: 'delowner <número>',
    owner: true,
    async execute(ctx) {
      const num = String(ctx.args[0] || '').replace(/\D/g, '');
      if (!num) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}delowner* 503XXXXXXXX`);
        return;
      }
      if (db().owners.length <= 1) {
        await ctx.reply('⚠️ No puedo eliminar al único owner.');
        return;
      }
      const removed = removeOwner(num);
      await ctx.reply(removed ? `✅ Owner eliminado: *+${num}*` : `ℹ️ *+${num}* no estaba en la lista.`);
    },
  },
  {
    name: 'owners',
    aliases: ['listaowners'],
    category: 'owner',
    desc: 'Lista todos los owners del bot.',
    usage: 'owners',
    owner: true,
    async execute(ctx) {
      const list = db().owners.map((o, i) => `${i === 0 ? '👑' : '⭐'} +${o}`).join('\n');
      await ctx.reply(`👑 *OWNERS DE ZENITSU BOT*\n\n${list}`);
    },
  },
  {
    name: 'setpp',
    aliases: ['setfoto', 'setbotpp'],
    category: 'owner',
    desc: 'Cambia la foto de perfil del bot.',
    usage: 'setpp (responde a una imagen o pasa URL)',
    owner: true,
    subOwner: true,
    async execute(ctx) {
      const buffer = await getImageBuffer(ctx);
      if (!buffer) {
        await ctx.reply(`💡 Responde a una imagen o usa *${ctx.prefix}setpp* <url>`);
        return;
      }
      await ctx.sock.updateProfilePicture(ctx.sock.user.id, buffer);
      await ctx.reply('✅ Foto de perfil del bot actualizada.');
    },
  },
  {
    name: 'setsticker',
    aliases: ['stickerpack', 'setpack'],
    category: 'owner',
    desc: 'Cambia el nombre y autor de los stickers.',
    usage: 'setsticker pack <nombre> | author <autor>',
    owner: true,
    subOwner: true,
    async execute(ctx) {
      const sub = String(ctx.args[0] || '').toLowerCase();
      const value = ctx.args.slice(1).join(' ').trim();
      if (sub === 'pack' && value) {
        setBotSetting(ctx.subbot, 'stickerPack', value);
        await ctx.reply(`✅ Pack de stickers: *${value}*`);
        return;
      }
      if ((sub === 'author' || sub === 'autor') && value) {
        setBotSetting(ctx.subbot, 'stickerAuthor', value);
        await ctx.reply(`✅ Autor de stickers: *${value}*`);
        return;
      }
      const current = effectiveSettings(ctx.subbot);
      await ctx.reply(
        `🎨 *Configuración de stickers*\n\n▸ Pack: *${current.stickerPack}*\n▸ Autor: *${current.stickerAuthor}*\n\n💡 ${ctx.prefix}setsticker pack Mi Pack\n💡 ${ctx.prefix}setsticker author Mi Nombre`,
      );
    },
  },
  {
    name: 'eval',
    aliases: ['ejecutar', 'js'],
    category: 'owner',
    desc: 'Ejecuta código JavaScript en el bot (solo owner).',
    usage: 'eval <código JavaScript>',
    owner: true,
    async execute(ctx) {
      const code = ctx.text.trim();
      if (!code) {
        await ctx.reply(
          `💡 *Uso:*\n${ctx.prefix}eval sock.user.id\n${ctx.prefix}eval await sock.groupMetadata(m.chat)\n${ctx.prefix}eval return 2+2`,
        );
        return;
      }
      const logs = [];
      const print = (...args) =>
        logs.push(args.map((a) => (typeof a === 'string' ? a : util.inspect(a, { depth: 2 }))).join(' '));

      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      const args = ['sock', 'm', 'msg', 'ctx', 'db', 'api', 'utils', 'config', 'require', 'print'];
      const values = [ctx.sock, ctx.m, ctx.msg, ctx, db(), api, utils, config, require, print];

      let fn;
      let mode = 'expression';
      try {
        fn = new AsyncFunction(...args, `return (${code})`);
      } catch {
        mode = 'statements';
        fn = new AsyncFunction(...args, code);
      }

      let result;
      try {
        result = await fn(...values);
      } catch (err) {
        if (mode === 'expression') {
          try {
            const fn2 = new AsyncFunction(...args, code);
            result = await fn2(...values);
          } catch (err2) {
            throw err2;
          }
        } else {
          throw err;
        }
      }

      const parts = [];
      if (logs.length) parts.push(logs.join('\n'));
      if (result !== undefined) {
        parts.push(typeof result === 'string' ? result : util.inspect(result, { depth: 3, colors: false }));
      }
      const output = parts.join('\n') || '✅ Ejecutado sin resultado.';
      await ctx.reply(`💻 *Resultado:*\n\n\`\`\`\n${truncate(output, 3500)}\n\`\`\``);
    },
  },
  {
    name: 'code',
    aliases: ['subbot', 'addsubbot', 'createsubbot'],
    category: 'subbots',
    desc: 'Genera el código de vinculación de un subbot (tu número real o el que indiques).',
    usage: 'code [número] [nombre]',
    async execute(ctx) {
      const argNumber = String(ctx.args[0] || '').replace(/\D/g, '');
      let number = argNumber.length >= 7 ? argNumber : '';
      const customName = (number ? ctx.args.slice(1) : ctx.args).join(' ').trim();

      // Teléfono REAL de quien crea el subbot: será su owner por defecto.
      const creatorNumber = await resolveSenderPhone(ctx);

      // Sin número: se usa el teléfono REAL de quien escribe, nunca el LID.
      if (!number) {
        number = creatorNumber;
        if (!number) {
          await ctx.reply(
            `❌ WhatsApp me entregó tu *LID* en vez de tu número real y no pude resolverlo.\n\n` +
              `💡 Escribe tu número con código de país:\n*${ctx.prefix}code 503XXXXXXXX*`,
          );
          return;
        }
      }

      if (!/^\d{7,15}$/.test(number)) {
        await ctx.reply(
          `❌ Número inválido: *${number}*\n\n` +
            `💡 Usa el formato internacional sin «+»: *${ctx.prefix}code 503XXXXXXXX*`,
        );
        return;
      }

      const {
        addSubbot,
        startSubbot,
        getSubbotEntry,
        isSubbotConnected,
        isSubbotRunning,
      } = await import('../lib/subbots.js');

      // El creador queda como owner del subbot si aún no tiene uno. Así el
      // subbot puede personalizarse y apagarse/encenderse por su dueño.
      const claimOwner = (record) => {
        if (record && !record.owner && creatorNumber) {
          record.owner = creatorNumber;
          save();
        }
        return record;
      };

      const pretty = (code) =>
        String(code || '').length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : String(code || '');
      const codeReply = (code) =>
        `🔗 *VINCULA TU SUBBOT*\n\n📱 Número: *+${number}*\n🔢 Código: *${pretty(code)}*\n\n` +
        `1. Abre WhatsApp en el *+${number}*.\n` +
        `2. Dispositivos vinculados → Vincular dispositivo.\n` +
        `3. Elige «Vincular con número de teléfono».\n` +
        `4. Escribe el código: *${pretty(code)}*\n\n` +
        `⚠️ Caduca en ~60 segundos. Si caduca, usa de nuevo *${ctx.prefix}code ${number}*.`;
      // El código va también en un mensaje aparte (2 mensajes en total),
      // para poder copiarlo rápido sin buscar dentro del texto.
      const sendCode = async (code) => {
        await ctx.reply(codeReply(code));
        await ctx.reply(`🔢 *CÓDIGO:* \`\`\`${pretty(code)}\`\`\``);
      };

      // Ya conectado: no hay nada que hacer.
      if (isSubbotConnected(number)) {
        const rec = claimOwner(addSubbot(number, customName || `Zenitsu${number.slice(-2)}`));
        const prem = rec.premium && (!rec.premiumUntil || rec.premiumUntil > Date.now());
        await ctx.reply(
          `✅ El subbot *${rec.name}* (+${number}) ya está *conectado*${prem ? ' · 💎 *PREMIUM*' : ''}.`,
        );
        return;
      }

      // Vinculación en curso: se reutiliza y, si el código caducó, se pide
      // uno nuevo (antes decía "ya está activo" y no mostraba ningún código).
      if (isSubbotRunning(number)) {
        claimOwner(addSubbot(number));
        const entry = getSubbotEntry(number);
        if (entry?.registered) {
          await ctx.reply(
            `⏳ El subbot *+${number}* ya está vinculado y se está conectando.\n\n` +
              `Prueba *${ctx.prefix}subbots* en unos segundos.`,
          );
          return;
        }
        const code = (await entry?.requestCode?.(true)) || entry?.pairingCode || '';
        if (code) {
          await sendCode(code);
        } else {
          await ctx.reply(
            `⏳ La vinculación de *+${number}* está en curso.\n\n` +
              `Espera unos segundos y vuelve a usar *${ctx.prefix}code ${number}*.`,
          );
        }
        return;
      }

      // Evita códigos inútiles para números que no tienen WhatsApp.
      const exists = await numberOnWhatsApp(ctx.sock, number);
      if (!exists) {
        await ctx.reply(
          `❌ El número *+${number}* no tiene WhatsApp.\n\n` +
            `💡 Revisa el código de país y vuelve a intentarlo.`,
        );
        return;
      }

      const autoName = `Zenitsu${number.slice(-2)}`;
      let record;
      try {
        record = claimOwner(addSubbot(number, customName || autoName));
      } catch (err) {
        await ctx.reply(`❌ ${err.message}`);
        return;
      }

      try {
        // fresh: borra credenciales a medio vincular que rompen el código.
        const result = await startSubbot(number, {
          fresh: true,
          notifyJid: ctx.chat,
        });

        if (result.registered) {
          const ready = await Promise.race([
            result.readyPromise.then(() => true).catch(() => false),
            sleep(20000).then(() => false),
          ]);
          await ctx.reply(
            ready
              ? `✅ Subbot *${record.name}* conectado.\n\n📱 +${number}\n🆔 ${result.sock?.user?.id || 'conectado'}`
              : `⏳ El subbot *${record.name}* ya estaba vinculado y se está conectando.\n\nPrueba *${ctx.prefix}subbots* en unos segundos.`,
          );
          return;
        }

        const outcome = await Promise.race([
          result.codePromise.then((code) => ({ code })).catch((error) => ({ error })),
          sleep(45000).then(() => ({ timeout: true })),
        ]);

        if (outcome.code) {
          await sendCode(outcome.code);
        } else if (outcome.timeout) {
          await ctx.reply(
            `⌛ No pude generar el código de *+${number}* a tiempo.\n\n` +
              `💡 Vuelve a intentarlo con *${ctx.prefix}code ${number}*.`,
          );
        } else {
          await ctx.reply(
            `❌ No se pudo generar el código del subbot *+${number}*.\n\n` +
              `${outcome.error?.message || 'Error desconocido'}\n\n` +
              `💡 Verifica que el número tenga WhatsApp y vuelve a intentarlo.`,
          );
        }
      } catch (err) {
        await ctx.reply(`❌ Error al iniciar el subbot:\n\n${err.message}`);
      }
    },
  },
  {
    name: 'bots',
    aliases: ['subbots', 'listsubbots', 'subs', 'listbots', 'botsregistrados'],
    category: 'owner',
    desc: 'Muestra SOLO los subbots conectados y limpia los que nunca se vincularon.',
    usage: 'bots',
    owner: true,
    async execute(ctx) {
      const {
        listSubbots,
        isSubbotConnected,
        isSubbotRunning,
        pruneUnlinkedSubbots,
      } = await import('../lib/subbots.js');

      // Los que nunca se vincularon se eliminan: solo quedan bots reales.
      const removed = await pruneUnlinkedSubbots();
      const all = listSubbots();
      // Solo se muestran los que tienen la conexión abierta.
      const list = all.filter((s) => isSubbotConnected(s.number));
      const pending = all.filter(
        (s) => !isSubbotConnected(s.number) && isSubbotRunning(s.number),
      ).length;
      const removedNote = removed.length
        ? `🧹 Eliminados: *${removed.length}* (nunca se vincularon)\n`
        : '';
      const pendingNote = pending ? `⏳ En vinculación: *${pending}*\n` : '';

      if (!list.length) {
        await ctx.reply(
          `🤖 *SUBBOTS CONECTADOS*\n\n📊 Total: *0*\n${removedNote}${pendingNote}\n` +
            `💡 Vincula uno con *${ctx.prefix}code* (tu número) o *${ctx.prefix}code 503XXXXXXXX*`,
        );
        return;
      }

      const premiumCount = list.filter(
        (s) => s.premium && (!s.premiumUntil || s.premiumUntil > Date.now()),
      ).length;
      const pausedCount = list.filter((s) => s.paused).length;
      const lines = list.map((s) => {
        const activo = s.premium && (!s.premiumUntil || s.premiumUntil > Date.now());
        const restante =
          activo && s.premiumUntil
            ? ` · ⏳ ${Math.max(1, Math.ceil((s.premiumUntil - Date.now()) / 86400000))} día(s)`
            : '';
        const premiumTag = activo ? `\n   💎 *PREMIUM*${s.premiumUntil ? restante : ' · ♾️ permanente'}` : '';
        const pausedTag = s.paused ? '\n   🔴 *APAGADO* · no responde (usa .bot on)' : '';
        const icon = s.paused ? '🔴' : s.primary ? '👑' : s.muted ? '🔇' : '🟢';
        return `${icon} *${s.name}* · +${s.number}${s.primary ? ' (PRINCIPAL)' : ''}${premiumTag}${pausedTag}${s.jid ? `\n   🆔 ${s.jid}` : ''}`;
      });
      await ctx.reply(
        `🤖 *SUBBOTS CONECTADOS*\n\n` +
          `${removedNote}${pendingNote}` +
          `📊 Total: *${list.length}*\n` +
          `💎 Premium: *${premiumCount}*\n` +
          (pausedCount ? `🔴 Apagados: *${pausedCount}*\n` : '') +
          `\n${lines.join('\n\n')}\n\n` +
          `👑 Principal · 🟢 Conectado · 🔇 Silenciado · 🔴 Apagado · 💎 Premium\n\n` +
          `💡 Da premium con *${ctx.prefix}prem <número> [días]* · Quítalo con *${ctx.prefix}unprem <número>* · Silencia a todos con *${ctx.prefix}silenciarsubbs* · Elige el bot principal con *${ctx.prefix}setprimary <número>* · Cada subbot se apaga con *${ctx.prefix}bot off*`,
      );
    },
  },
  {
    name: 'prem',
    aliases: ['setprem', 'darprem', 'premium'],
    category: 'owner',
    desc: 'Da PREMIUM a UN subbot: por @mención, respondiendo a su mensaje o por número. Solo a ese.',
    usage: 'prem <@user|número> [días]',
    owner: true,
    async execute(ctx) {
      const target = await resolveSubbotTarget(ctx);
      if (!target) {
        await ctx.reply(
          `💡 *Uso — elige una opción (solo afecta a ese usuario):*\n\n` +
            `${ctx.prefix}prem @user\n${ctx.prefix}prem 503XXXXXXXX\n${ctx.prefix}prem 30        (respondiendo a su mensaje)\n\n` +
            `Con días: *${ctx.prefix}prem @user 30*`,
        );
        return;
      }
      if (!target.record) {
        await ctx.reply(
          `❌ El número *+${target.number}* no es un subbot registrado.\n\n` +
            `Primero vincúlalo con *${ctx.prefix}code ${target.number}* y luego dale premium.\n` +
            `Así el premium se aplica al bot correcto (nunca a un LID).`,
        );
        return;
      }
      const days = parseDays(ctx.args);
      const { setSubbotPremium } = await import('../lib/subbots.js');
      const record = setSubbotPremium(target.number, days);
      const vigencia = days > 0 ? `*${days}* día(s)` : 'permanente ♾️';
      await ctx.reply(
        `💎 *PREMIUM ACTIVADO*\n\n` +
          `🤖 Subbot: *${record.name}*\n📱 +${record.number}\n⏳ Duración: ${vigencia}\n\n` +
          `✅ Ya aparece como *💎 PREMIUM* en *${ctx.prefix}subbots* y en su *${ctx.prefix}menu*.\n` +
          `Desbloqueado: 📥 descargas y 🤖 IA.\n` +
          `▸ Detectado por ${target.via} (nadie más recibió premium).`,
      );
    },
  },
  {
    name: 'unprem',
    aliases: ['quitaprem', 'noprem', 'removerprem'],
    category: 'owner',
    desc: 'Quita el premium de UN subbot: por @mención, respuesta o número.',
    usage: 'unprem <@user|número>',
    owner: true,
    async execute(ctx) {
      const target = await resolveSubbotTarget(ctx);
      if (!target) {
        await ctx.reply(
          `💡 *Uso:*\n${ctx.prefix}unprem @user\n${ctx.prefix}unprem 503XXXXXXXX\n${ctx.prefix}unprem (respondiendo a su mensaje)`,
        );
        return;
      }
      const { unsetSubbotPremium } = await import('../lib/subbots.js');
      const record = unsetSubbotPremium(target.number);
      if (!record) {
        await ctx.reply(`❌ Ese subbot no está registrado.\n\nCrea uno con *${ctx.prefix}code ${target.number}*`);
        return;
      }
      await ctx.reply(
        `🆓 *PREMIUM DESACTIVADO*\n\n🤖 Subbot: *${record.name}*\n📱 +${record.number}\n\nVuelve a ser *normal*: sin descargas ni IA.`,
      );
    },
  },
  {
    name: 'silenciarsubbs',
    aliases: ['silenciarsub', 'silenciar', 'mutesubbot', 'mutesub', 'mutebot', 'muteall'],
    category: 'owner',
    desc: 'Silencia TODOS los subbots a la vez (o solo uno si pasas un número). El owner conserva el control.',
    usage: 'silenciarsubbs [número]',
    owner: true,
    async execute(ctx) {
      const target = await resolveSubbotTarget(ctx);
      const { setSubbotMuted, listSubbots } = await import('../lib/subbots.js');
      const list = listSubbots();

      if (!list.length) {
        await ctx.reply(`🤖 No hay subbots registrados.\n\nCrea uno con *${ctx.prefix}code*`);
        return;
      }

      if (target) {
        const record = setSubbotMuted(target.number, true);
        if (!record) {
          await ctx.reply(`❌ Ese subbot no está registrado.\n\nCrea uno con *${ctx.prefix}code ${target.number}*`);
          return;
        }
        if (record.primary) {
          // El bot principal no se silencia: revertimos el cambio.
          setSubbotMuted(target.number, false);
          await ctx.reply(
            `👑 *${record.name}* (+${record.number}) es el BOT PRINCIPAL: no se puede silenciar.\n\n Usa *${ctx.prefix}setprimary <otro-número>* si quieres cambiar el principal.`,
          );
          return;
        }
        await ctx.reply(
          `🔇 *SUBBOT SILENCIADO*\n\n🤖 Subbot: *${record.name}*\n📱 +${record.number}\n\nIgnora a todos menos a ti.\nReactiva con *${ctx.prefix}activarsubbs ${record.number}*`,
        );
        return;
      }

      let count = 0;
      let primarySkipped = null;
      for (const s of list) {
        // El bot principal (.setprimary) nunca se silencia.
        if (s.primary) {
          primarySkipped = s;
          continue;
        }
        setSubbotMuted(s.number, true);
        count += 1;
      }
      await ctx.reply(
        `🔇 *SUBBOTS SILENCIADOS (${count})*\n\n` +
          `🤖 Todos los subbots ignoran los mensajes de los usuarios.\n\n` +
          `${primarySkipped ? `👑 Excepto el BOT PRINCIPAL: *${primarySkipped.name}* (+${primarySkipped.number}) sigue activo.\n\n` : ''}` +
          `⚡ *El bot principal de verdad* sigue normal y tú sigues pudiendo usar todo.\n\n` +
          `Reactiva todos con *${ctx.prefix}activarsubbs*`,
      );
    },
  },
  {
    name: 'activarsubbs',
    aliases: ['activarsub', 'desilenciar', 'unmutesubbot', 'unmutesub', 'unmutebot', 'unmuteall'],
    category: 'owner',
    desc: 'Reactiva TODOS los subbots silenciados a la vez (o solo uno si pasas un número).',
    usage: 'activarsubbs [número]',
    owner: true,
    async execute(ctx) {
      const target = await resolveSubbotTarget(ctx);
      const { setSubbotMuted, listSubbots } = await import('../lib/subbots.js');
      const list = listSubbots();

      if (!list.length) {
        await ctx.reply(`🤖 No hay subbots registrados.\n\nCrea uno con *${ctx.prefix}code*`);
        return;
      }

      if (target) {
        const record = setSubbotMuted(target.number, false);
        if (!record) {
          await ctx.reply(`❌ Ese subbot no está registrado.\n\nCrea uno con *${ctx.prefix}code ${target.number}*`);
          return;
        }
        await ctx.reply(
          `🔊 *SUBBOT ACTIVADO*\n\n🤖 Subbot: *${record.name}*\n📱 +${record.number}\n\nYa responde con normalidad ⚡`,
        );
        return;
      }

      let count = 0;
      for (const s of list) {
        setSubbotMuted(s.number, false);
        count += 1;
      }
      await ctx.reply(`🔊 *SUBBOTS REACTIVADOS (${count})*\n\n🤖 Todos vuelven a responder con normalidad ⚡`);
    },
  },
  {
    name: 'delsubbot',
    aliases: ['delsub', 'removesubbot'],
    category: 'owner',
    desc: 'Elimina un subbot y borra su sesión: por @mención, respuesta o número.',
    usage: 'delsubbot <@user|número>',
    owner: true,
    async execute(ctx) {
      const target = await resolveSubbotTarget(ctx);
      if (!target) {
        await ctx.reply(
          `💡 *Uso:*\n${ctx.prefix}delsubbot @user\n${ctx.prefix}delsubbot 503XXXXXXXX\n${ctx.prefix}delsubbot (respondiendo a su mensaje)`,
        );
        return;
      }
      const { findSubbot, removeSubbot } = await import('../lib/subbots.js');
      const record = findSubbot(target.number);
      if (!record) {
        await ctx.reply(`ℹ️ No existe un subbot con el número *+${target.number}*.`);
        return;
      }
      await removeSubbot(target.number);
      await ctx.reply(`🗑️ Subbot *${record.name}* (+${target.number}) eliminado.\n\nSu sesión fue borrada.`);
    },
  },
  {
    name: 'fix',
    aliases: ['restart', 'reiniciar'],
    category: 'owner',
    desc: 'Reinicia el bot para aplicar cambios.',
    usage: 'fix',
    owner: true,
    async execute(ctx) {
      await ctx.reply('♻️ *Reiniciando ZENITSU BOT...*\n\n_El trueno volverá en unos segundos._');
      saveNow();
      setTimeout(restartProcess, 900);
    },
  },
  {
    name: 'exec',
    aliases: ['shell', 'terminal'],
    category: 'owner',
    desc: 'Ejecuta un comando de la terminal (solo owner).',
    usage: 'exec <comando>',
    owner: true,
    async execute(ctx) {
      const command = ctx.text.trim();
      if (!command) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}exec* ls -la`);
        return;
      }
      const r = await execShell(command, 30000);
      const out = [r.stdout, r.stderr].filter(Boolean).join('\n').trim() || '(sin salida)';
      await ctx.reply(`💻 *Comando:* \`${command}\`\n\n\`\`\`\n${truncate(out, 3500)}\n\`\`\``);
    },
  },
  {
    name: 'broadcast',
    aliases: ['bc', 'comunicado'],
    category: 'owner',
    desc: 'Envía un comunicado a todos los grupos del bot.',
    usage: 'broadcast <mensaje>',
    owner: true,
    async execute(ctx) {
      const text = ctx.text.trim();
      if (!text) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}broadcast* <mensaje>`);
        return;
      }
      await ctx.reply('📢 Enviando comunicado a todos los grupos...');
      let sent = 0;
      let failed = 0;
      try {
        const groups = await ctx.sock.groupFetchAllParticipating();
        for (const jid of Object.keys(groups)) {
          try {
            const message = await ctx.sock.sendMessage(jid, {
              text: withWatermark(`📢 *COMUNICADO DE ZENITSU BOT*\n\n${text}`),
            });
            if (message) sent++;
          } catch {
            failed++;
          }
          await sleep(1200);
        }
        await ctx.reply(`✅ Comunicado enviado.\n\n📤 Enviados: *${sent}*\n❌ Fallidos: *${failed}*`);
      } catch (err) {
        await ctx.reply(`❌ Error: ${err.message}`);
      }
    },
  },
  {
    name: 'ban',
    aliases: ['banear'],
    category: 'owner',
    desc: 'Banea a un usuario para que no use el bot.',
    usage: 'ban <@usuario | responde | número>',
    owner: true,
    async execute(ctx) {
      const jid = getTargetJid(ctx);
      if (!jid) {
        await ctx.reply(`💡 Menciona, responde o escribe el número.`);
        return;
      }
      if (isOwnerNumber(jidToNumber(jid))) {
        await ctx.reply('⚠️ No puedo banear a un owner.');
        return;
      }
      const u = getUser(jid);
      u.banned = true;
      save();
      await ctx.reply(`🚫 Usuario baneado: *+${jidToNumber(jid)}*`);
    },
  },
  {
    name: 'unban',
    aliases: ['desbanear'],
    category: 'owner',
    desc: 'Desbanea a un usuario.',
    usage: 'unban <@usuario | responde | número>',
    owner: true,
    async execute(ctx) {
      const jid = getTargetJid(ctx);
      if (!jid) {
        await ctx.reply(`💡 Menciona, responde o escribe el número.`);
        return;
      }
      const u = getUser(jid);
      u.banned = false;
      save();
      await ctx.reply(`✅ Usuario desbaneado: *+${jidToNumber(jid)}*`);
    },
  },
  {
    name: 'block',
    aliases: ['bloquear'],
    category: 'owner',
    desc: 'Bloquea a un usuario en WhatsApp.',
    usage: 'block <@usuario | responde | número>',
    owner: true,
    async execute(ctx) {
      const jid = getTargetJid(ctx);
      if (!jid) {
        await ctx.reply(`💡 Menciona, responde o escribe el número.`);
        return;
      }
      await ctx.sock.updateBlockStatus(jid, 'block');
      await ctx.reply(`🚫 Usuario bloqueado: *+${jidToNumber(jid)}*`);
    },
  },
  {
    name: 'unblock',
    aliases: ['desbloquear'],
    category: 'owner',
    desc: 'Desbloquea a un usuario en WhatsApp.',
    usage: 'unblock <@usuario | responde | número>',
    owner: true,
    async execute(ctx) {
      const jid = getTargetJid(ctx);
      if (!jid) {
        await ctx.reply(`💡 Menciona, responde o escribe el número.`);
        return;
      }
      await ctx.sock.updateBlockStatus(jid, 'unblock');
      await ctx.reply(`✅ Usuario desbloqueado: *+${jidToNumber(jid)}*`);
    },
  },
  {
    name: 'join',
    aliases: ['entrar', 'unirse'],
    category: 'owner',
    desc: 'Hace que el bot entre a un grupo por enlace.',
    usage: 'join <enlace de invitación>',
    owner: true,
    async execute(ctx) {
      const raw = String(ctx.text || ctx.args.join(' ') || '').trim();
      if (!raw) {
        await ctx.reply(
          `💡 Uso: *${ctx.prefix}join* https://chat.whatsapp.com/XXXXXXXXXXXX\n\nTambién puedes pegar solo el código de invitación.`,
        );
        return;
      }

      const match = raw.match(/chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9_-]{10,})/i);
      const code = (match?.[1] || (/^[A-Za-z0-9_-]{10,}$/.test(raw) ? raw : '')).trim();
      if (!code) {
        await ctx.reply(
          `❌ No encontré un código válido.\n\n💡 Ejemplo: *${ctx.prefix}join https://chat.whatsapp.com/ABC123...*`,
        );
        return;
      }

      let info = null;
      try {
        info = await ctx.sock.groupGetInviteInfo(code);
      } catch (err) {
        const msg = String(err?.message || '');
        if (/item-not-found|not-found|invalid/i.test(msg)) {
          await ctx.reply(
            '❌ El enlace no es válido o ya expiró.\n\nPide un enlace nuevo al administrador del grupo.',
          );
          return;
        }
        // Algunos servidores no permiten consultar la info pero sí aceptar.
      }

      async function alreadyInGroup() {
        try {
          const groups = await ctx.sock.groupFetchAllParticipating();
          if (info?.id && groups?.[info.id]) return groups[info.id];
          const wanted = String(info?.subject || '').trim().toLowerCase();
          if (wanted) {
            return Object.values(groups || {}).find(
              (g) => String(g?.subject || '').trim().toLowerCase() === wanted,
            );
          }
        } catch {}
        return null;
      }

      const joined = await alreadyInGroup();
      if (joined) {
        await ctx.reply(`ℹ️ Ya estoy en *${joined.subject || 'ese grupo'}*.\n\n🆔 ${joined.id || info?.id || ''}`);
        return;
      }

      // WhatsApp a veces responde "not-authorized" de forma transitoria.
      // Reintentamos un par de veces antes de darlo por fallido.
      let lastError = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const jid = await ctx.sock.groupAcceptInvite(code);
          const name = info?.subject ? `*${info.subject}*` : 'el grupo';
          await ctx.reply(`✅ Me uní a ${name}.\n\n🆔 ${jid || info?.id || 'Grupo'}`);
          return;
        } catch (err) {
          lastError = err;
          const msg = String(err?.message || '');
          if (/already|conflict|409/i.test(msg)) {
            await ctx.reply('ℹ️ Ya estoy en ese grupo.');
            return;
          }
          if (attempt < 3) await sleep(1500 * attempt);
        }
      }

      const stillJoined = await alreadyInGroup();
      if (stillJoined) {
        await ctx.reply(`ℹ️ Ya estoy en *${stillJoined.subject || 'ese grupo'}*.`);
        return;
      }

      const msg = String(lastError?.message || '');
      if (/not-authorized|forbidden|401|403/i.test(msg)) {
        await ctx.reply(
          '❌ WhatsApp rechazó la invitación (*not-authorized*).\n\n' +
            'Esto pasa cuando:\n' +
            '▸ El enlace ya fue revocado o expiró.\n' +
            '▸ El grupo está lleno.\n' +
            '▸ El grupo requiere aprobación de un administrador.\n' +
            '▸ La cuenta del bot tiene restricciones para unirse.\n\n' +
            '💡 Pide un enlace nuevo o que un admin agregue al bot directamente.',
        );
        return;
      }
      await ctx.reply(`❌ No pude unirme al grupo.\n\n${msg || 'Enlace inválido o expirado.'}`);
    },
  },
  {
    name: 'grupos',
    aliases: ['groupslite', 'misgrupos', 'whereami'],
    category: 'owner',
    desc: 'Lista todos los grupos donde está el bot, con sus nombres.',
    usage: 'grupos',
    owner: true,
    async execute(ctx) {
      const map = await ctx.sock.groupFetchAllParticipating();
      const groups = Object.values(map || {});
      if (!groups.length) {
        await ctx.reply('📭 El bot no está en ningún grupo.');
        return;
      }
      groups.sort((a, b) => String(a.subject || '').localeCompare(String(b.subject || '')));
      const list = groups
        .map((g, i) => `${i + 1}. *${g.subject || 'Sin nombre'}*\n   👥 ${g.participants?.length || '?'} miembros`)
        .join('\n');
      await ctx.reply(
        `👥 *GRUPOS DEL BOT (${groups.length})*\n\n${list}\n\n` +
          `💡 Sal de uno con *${ctx.prefix}salir <número>* (ej: *${ctx.prefix}salir ${groups.length > 1 ? 2 : 1}*)`,
      );
    },
  },
  {
    name: 'leave',
    aliases: ['salir'],
    category: 'owner',
    desc: 'El bot se despide con una frase de Zenitsu, deja el contacto del owner y sale del grupo.',
    usage: 'leave [número de .grupos]',
    owner: true,
    async execute(ctx) {
      const selector = String(ctx.args[0] || '').replace(/\D/g, '');
      // .salir 5 — sale del grupo número 5 de la lista .grupos
      if (selector) {
        const map = await ctx.sock.groupFetchAllParticipating();
        const groups = Object.values(map || {}).sort((a, b) =>
          String(a.subject || '').localeCompare(String(b.subject || '')),
        );
        const index = Number(selector);
        if (index < 1 || index > groups.length) {
          await ctx.reply(
            `❌ Número fuera de la lista (hay ${groups.length} grupos).\n\nRevisa la lista con *${ctx.prefix}grupos*`,
          );
          return;
        }
        const target = groups[index - 1];
        await ctx.reply(`👋 Saliendo de *${target.subject}*...\n\n_Dejaré mi despedida en el grupo._`);
        // La despedida va al GRUPO, no al chat del owner.
        try {
          await ctx.sock.sendMessage(target.id, { text: buildFarewell() });
        } catch {}
        await sleep(800);
        await ctx.sock.groupLeave(target.id);
        // El chat no desaparece solo al salir: se archiva para que no quede
        // como fantasma en la lista de conversaciones del bot.
        try {
          await ctx.sock.chatModify({ archive: true, lastMessages: [] }, target.id);
        } catch {}
        return;
      }
      if (!ctx.isGroup) {
        await ctx.reply(
          `💡 Dos formas de usarlo:\n\n▸ *${ctx.prefix}salir* — dentro del grupo que quieres dejar\n▸ *${ctx.prefix}salir <n>* — por número de la lista *${ctx.prefix}grupos*`,
        );
        return;
      }
      const chat = ctx.chat;
      await ctx.reply(buildFarewell());
      await sleep(800);
      await ctx.sock.groupLeave(chat);
      try {
        await ctx.sock.chatModify({ archive: true, lastMessages: [] }, chat);
      } catch {}
    },
  },
  {
    name: 'mode',
    aliases: ['modo'],
    category: 'owner',
    desc: 'Cambia el modo de uso del bot.',
    usage: 'mode public|self|group',
    owner: true,
    async execute(ctx) {
      const mode = String(ctx.args[0] || '').toLowerCase();
      if (!['public', 'self', 'group'].includes(mode)) {
        await ctx.reply(
          `💡 *Modos disponibles:*\n\n▸ *public* — Todos pueden usar el bot.\n▸ *self* — Solo el owner.\n▸ *group* — Solo en grupos.\n\n💡 Uso: *${ctx.prefix}mode public*`,
        );
        return;
      }
      db().mode = mode;
      save();
      await ctx.reply(`✅ Modo cambiado a: *${mode}*`);
    },
  },
  toggle('autoread', 'autoRead', 'Auto lectura', ['leer']),
  toggle('autoreact', 'autoReact', 'Auto reacción', ['reaccionar']),
  toggle('autostatus', 'autoStatus', 'Auto ver estados', ['verestados']),
  toggle('antidelete', 'antiDelete', 'Anti eliminar', ['antieliminar']),
  toggle('anticall', 'antiCall', 'Anti llamadas', ['antillamadas']),
  {
    name: 'autoadmin',
    aliases: ['adminauto', 'autoadministrarse'],
    category: 'owner',
    desc: 'El bot y el owner se vuelven administradores automáticamente en los grupos.',
    usage: 'autoadmin on|off',
    owner: true,
    async execute(ctx) {
      const value = String(ctx.args[0] || '').toLowerCase();
      if (!value) {
        await ctx.reply(
          `👑 *AUTOADMIN:* ${db().autoAdmin ? '✅ ON' : '❌ OFF'}\n\n` +
            '▸ Al entrar a un grupo, intento hacerme admin\n' +
            '▸ Donde ya soy admin, asciendo al owner\n\n' +
            `💡 Uso: ${ctx.prefix}autoadmin on|off`,
        );
        return;
      }
      if (['on', 'si', 'sí', '1', 'true', 'activar'].includes(value)) db().autoAdmin = true;
      else if (['off', 'no', '0', 'false', 'desactivar'].includes(value)) db().autoAdmin = false;
      else {
        await ctx.reply('❌ Valor inválido. Usa *on* u *off*.');
        return;
      }
      save();
      // Al activarlo se actúa YA: en el grupo donde se ejecutó se asciende
      // al owner (si el bot puede). El feedback dice exactamente qué pasó.
      let extra = '';
      let mentions = [];
      if (db().autoAdmin && ctx.isGroup) {
        try {
          const r = await autoAdminSweep(ctx.sock, ctx.chat);
          if (r.botAdmin) {
            if (r.promotedOwners.length) {
              extra = `\n\n👑 En este grupo ya soy admin: ¡ascendí al owner! ✅`;
              mentions = r.promotedOwners.map((n) => numberToJid(n));
            } else {
              extra = '\n\n👑 En este grupo ya soy admin (y el owner ya tiene rango ✅)';
            }
          } else {
            extra =
              '\n\n⚠️ En este grupo *no soy admin* y WhatsApp no me deja ascenderme solo: solo los admins pueden ascender.\n' +
              '▸ Hazme admin desde *Ajustes del grupo → Participantes*\n' +
              '▸ Desde ese momento me encargo yo en todos los grupos';
          }
        } catch {}
      } else if (db().autoAdmin) {
        extra =
          '\n\n⚡ Cada vez que me hagan admin en un grupo, asciendo ahí al owner automáticamente';
      } else {
        extra = '\n\n📪 Ya no me hago admin ni asciendo a nadie automáticamente';
      }
      await ctx.reply(
        `👑 *AUTOADMIN:* ${db().autoAdmin ? '✅ ON' : '❌ OFF'}${extra}`,
        mentions.length ? { mentions } : {},
      );
    },
  },
  {
    name: 'kickall',
    aliases: ['expulsartodos', 'kicktodos', 'sacartodos'],
    category: 'owner',
    desc: 'Expulsa a TODOS los miembros del grupo (se salvan owner, bot y creador).',
    usage: 'kickall confirmar',
    owner: true,
    group: true,
    async execute(ctx) {
      const word = String(ctx.args[0] || '').toLowerCase().trim();
      if (!CONFIRM_WORDS.includes(word)) {
        await ctx.reply(
          '⚠️ *KICKALL* expulsa a TODOS los miembros de este grupo.\n' +
            '▸ Se salvan: el owner, el bot y el creador del grupo\n\n' +
            `💡 Si estás seguro, escribe: *${ctx.prefix}kickall confirmar*`,
        );
        return;
      }
      if (activeRaids.has(ctx.chat)) {
        await ctx.reply('⚠️ Hay una demolición en curso en este grupo.');
        return;
      }
      if (!ctx.isBotAdmin) {
        await ctx.reply(
          '❌ No soy admin del grupo: WhatsApp no me deja expulsar a nadie.\n\n' +
            '💡 Hazme admin y vuelve a intentarlo.',
        );
        return;
      }
      const r = await kickEveryone(ctx);
      await ctx.reply(
        `👢 *KICKALL TERMINADO*\n\n` +
          `▸ Participantes: *${r.total}*\n` +
          `▸ Expulsados: *${r.kicked}/${r.targets}*\n` +
          `▸ Fallidos: *${r.failed}*`,
      );
    },
  },
  {
    name: 'tumbargrupo',
    aliases: ['tumbar', 'tumbargpo', 'raid'],
    category: 'owner',
    desc: 'Tumba el grupo: lluvia de mensajes reenviados del canal y expulsa a todos.',
    usage: 'tumbargrupo [cantidad] confirmar',
    owner: true,
    group: true,
    async execute(ctx) {
      const args = (ctx.args || []).map((a) => String(a).toLowerCase().trim());
      let count = 200;
      let confirmed = false;
      for (const a of args) {
        if (/^\d+$/.test(a)) count = parseInt(a, 10);
        else if (CONFIRM_WORDS.includes(a)) confirmed = true;
      }
      count = Math.max(1, Math.min(500, count));
      if (!confirmed) {
        await ctx.reply(
          '💣 *TUMBARGRUPO* demuele este grupo sin vuelta atrás:\n' +
            `▸ ${count} mensajes en cadena reenviados del canal\n` +
            '▸ Al final expulsa a TODOS (se salvan owner, bot y creador)\n\n' +
            `💡 Para lanzarlo: *${ctx.prefix}tumbargrupo ${count} confirmar*`,
        );
        return;
      }
      if (activeRaids.has(ctx.chat)) {
        await ctx.reply('⚠️ Ya hay una demolición en curso en este grupo.');
        return;
      }
      // Se marca ANTES del primer await: otra demolición del mismo grupo
      // queda bloqueada al instante, sin carrera de por medio.
      activeRaids.add(ctx.chat);
      try {
        await ctx.reply(
          `⚡ *DEMOLICIÓN INICIADA*\n\n▸ ${count} mensajes en camino\n▸ Al final expulso a todos\n\n🌩️ ZENITSU DOMINA PERRES`,
        );
        let sent = 0;
        let failures = 0;
        let delay = 350;
        for (let i = 0; i < count; i++) {
          const phrase = RAID_PHRASES[i % RAID_PHRASES.length];
          try {
            // Envío directo (no ctx.send) para no citar el mensaje del
            // comando: cada mensaje cae con su banner del canal.
            const msg = await ctx.sock.sendMessage(ctx.chat, watermarkContent({ text: phrase }));
            trackSent(msg);
            sent++;
            failures = 0;
            delay = 350;
          } catch {
            failures++;
            if (failures >= 10) break; // WhatsApp está cortando: no insistir
            delay = Math.min(5000, delay * 2);
          }
          await sleep(delay);
        }
        // Expulsión final: con metadata fresca se comprueba si sigo siendo
        // admin (la lluvia tarda más de un minuto, las cosas cambian).
        const r = await kickEveryone(ctx);
        let kickReport;
        if (!r.botAdmin) kickReport = '▸ Expulsión omitida: no soy admin del grupo';
        else kickReport = `▸ Expulsados: *${r.kicked}/${r.targets}* (fallidos: ${r.failed})`;
        await ctx.reply(
          `⚡ *GRUPO TUMBADO*\n\n▸ Mensajes enviados: *${sent}/${count}*\n${kickReport}\n\n🌩️ ZENITSU DOMINA PERRES`,
        );
      } finally {
        activeRaids.delete(ctx.chat);
      }
    },
  },
  {
    name: 'setapi',
    aliases: ['apikey', 'setkey'],
    category: 'owner',
    desc: 'Guarda una API key para los comandos que la necesiten.',
    usage: 'setapi <nombre> <key>',
    owner: true,
    async execute(ctx) {
      const [name, ...rest] = ctx.args;
      const value = rest.join(' ').trim();
      if (!name) {
        await ctx.reply(
          `💡 *APIs disponibles:*\n▸ gemini — Google Gemini\n\n💡 Uso: ${ctx.prefix}setapi gemini TU_API_KEY`,
        );
        return;
      }
      if (!value) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}setapi* ${name} <key>`);
        return;
      }
      db().apis[name.toLowerCase()] = value;
      save();
      await ctx.reply(`✅ API *${name.toLowerCase()}* guardada: \`${mask(value)}\``);
    },
  },
  {
    name: 'apis',
    aliases: ['keys'],
    category: 'owner',
    desc: 'Lista las APIs configuradas.',
    usage: 'apis',
    owner: true,
    async execute(ctx) {
      const entries = Object.entries(db().apis || {});
      if (!entries.length) {
        await ctx.reply(`🔑 No hay APIs configuradas.\n\n💡 Usa *${ctx.prefix}setapi gemini TU_KEY*`);
        return;
      }
      const list = entries.map(([k, v]) => `▸ *${k}*: \`${mask(v)}\``).join('\n');
      await ctx.reply(`🔑 *APIs configuradas*\n\n${list}`);
    },
  },
  {
    name: 'backup',
    aliases: ['respaldo'],
    category: 'owner',
    desc: 'Envía un respaldo de la base de datos.',
    usage: 'backup',
    owner: true,
    async execute(ctx) {
      saveNow();
      const buffer = fs.readFileSync(DB_FILE);
      await ctx.sock.sendMessage(
        ctx.chat,
        {
          document: buffer,
          mimetype: 'application/json',
          fileName: `zenitsu-db-${Date.now()}.json`,
          caption: withWatermark('📦 *Respaldo de ZENITSU BOT*\n\nGuarda este archivo en un lugar seguro.'),
        },
        { quoted: ctx.msg },
      );
    },
  },
  {
    name: 'cleartmp',
    aliases: ['limpiartmp'],
    category: 'owner',
    desc: 'Limpia los archivos temporales del bot.',
    usage: 'cleartmp',
    owner: true,
    async execute(ctx) {
      let count = 0;
      try {
        fs.mkdirSync(config.tmpDir, { recursive: true });
        for (const f of fs.readdirSync(config.tmpDir)) {
          try {
            fs.rmSync(path.join(config.tmpDir, f), { force: true });
            count++;
          } catch {}
        }
      } catch {}
      await cleanTmp(0);
      await ctx.reply(`🧹 Archivos temporales eliminados: *${count}*`);
    },
  },
  {
    name: 'resetdb',
    aliases: ['reset'],
    category: 'owner',
    desc: 'Reinicia la base de datos del bot (requiere confirmación).',
    usage: 'resetdb confirm',
    owner: true,
    hidden: true,
    async execute(ctx) {
      if (String(ctx.args[0] || '').toLowerCase() !== 'confirm') {
        await ctx.reply(
          `⚠️ *Esto borrará usuarios, grupos, economía y configuración.*\n\nSi estás seguro escribe:\n*${ctx.prefix}resetdb confirm*`,
        );
        return;
      }
      resetDb();
      await ctx.reply('♻️ Base de datos reiniciada. El bot mantiene la sesión de WhatsApp.');
    },
  },
];
