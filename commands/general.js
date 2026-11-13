import fs from 'node:fs';
import { config } from '../config.js';
import { db, getUser, isOwnerNumber } from '../lib/db.js';
import {
  formatDuration,
  formatNumber,
  getUptime,
  jidToNumber,
  numberToJid,
  osInfo,
  pick,
  sleep,
  withWatermark,
} from '../lib/utils.js';
import { buildMenu, buildCommandHelp, DEFAULT_MENU_STYLE } from '../lib/menu.js';
import { listCustom } from '../lib/customcmd.js';
import { participantJid } from '../lib/targets.js';
import { effectiveSettings } from '../lib/settings.js';

const ZENITSU_QUOTES = [
  '⚡ "El trueno solo asusta a quienes no confían en su corazón." — Zenitsu Agatsuma',
  '🌩️ "Aunque tenga miedo, seguiré adelante. ¡Primera forma: Trueno y Relámpago!" — Zenitsu',
  '⚡ "No soy fuerte, pero puedo ser valiente cuando alguien que quiero está en peligro." — Zenitsu',
  '🌩️ "La respiración del trueno no perdona. ¡Séptima forma: Fuego de Trueno!" — Zenitsu',
  '⚡ "Incluso el cobarde más grande puede convertirse en un héroe." — Zenitsu',
  '🌩️ "¡No llores! El trueno retumba para los valientes." — Zenitsu',
  '⚡ "El miedo es solo el preludio de la velocidad." — Zenitsu',
  '🌩️ "Cuando cierro los ojos, el trueno me guía." — Zenitsu',
];

function uptimeText() {
  return formatDuration(getUptime());
}

async function sendMenu(ctx) {
  const store = db();
  const settings = effectiveSettings(ctx.subbot);
  const isOwner = Boolean(ctx.isOwner ?? isOwnerNumber(ctx.senderNumber));
  // El owner de un subbot ve SOLO los comandos de personalización (subOwner);
  // el owner global ve todos los comandos de owner.
  const canSeeOwnerCommand = (c) => isOwner || (ctx.isSubOwner && c.subOwner);
  // En subbots normales se ocultan los comandos premium (descargas e IA).
  // El owner, los subbots premium y el bot principal ven el menú completo.
  const hidePremium = ctx.isSubbot && !ctx.isSubbotPremium && !ctx.isSubbotPrimary;
  const isPremiumCmd = (c) =>
    Boolean(c.premium || config.premiumCategories.includes(c.category));
  const available = (ctx.commands || []).filter(
    (c) =>
      !c.hidden &&
      // Los comandos +18 fueron retirados: ni en el menú ni contados.
      c.category !== 'nsfw' &&
      (c.category !== 'owner' || canSeeOwnerCommand(c)) &&
      (!hidePremium || !isPremiumCmd(c)),
  );
  // En un grupo, el menú también muestra los comandos de VENTAS propios
  // de ese grupo (los creados con .crearcmd).
  if (ctx.isGroup) {
    try {
      const customs = listCustom(ctx.chat);
      for (const c of customs) {
        available.push({
          name: c.name,
          category: 'ventas',
          desc: (c.content || 'comando de este grupo').slice(0, 40),
        });
      }
    } catch {}
  }
  const botName = settings.botName || config.botName;
  // Datos reales del bot para el menú Luna Edition.
  const sys = osInfo();
  // En Termux osInfo() devuelve "android arm64": se reconoce por prefijo
  // para mostrar el nombre bonito y no el crudo en el menú.
  const rawPlatform = String(sys.platform || '');
  const platform = rawPlatform.startsWith('android')
    ? 'Android · Linux (Termux)'
    : rawPlatform || 'Linux';
  // El menú NO muestra el enlace del repositorio.
  const text = buildMenu({
    commands: available,
    prefix: settings.prefix || config.prefix,
    botName,
    pushName: ctx.pushName,
    isOwner,
    mode: store.mode || 'public',
    uptime: getUptime(),
    totalCommands: available.length,
    menuLink: settings.menuLink || '',
    style: settings.menuStyle || DEFAULT_MENU_STYLE,
    christmas: settings.christmas !== false,
    version: config.version,
    ownerName: config.ownerName,
    platform,
    senderNumber: ctx.senderNumber,
  });
  // El saludo del menú menciona de verdad a quien lo pidió.
  const mentionTag = ctx.senderNumber ? `@${ctx.senderNumber}` : '';
  const mentions =
    mentionTag && text.includes(mentionTag)
      ? [ctx.senderJid || ctx.sender].filter(Boolean)
      : undefined;
  // Estado del subbot al final del menú.
  let footerNote = '';
  if (hidePremium) {
    footerNote = `\n\n💎 *Subbot normal:* las 📥 descargas y la 🤖 IA son PREMIUM.\nPide el tuyo con *${ctx.prefix}upgrade*.`;
  } else if (ctx.isSubbotPrimary) {
    footerNote = '\n\n👑 *Bot principal:* todo desbloqueado.';
  } else if (ctx.isSubbotPremium) {
    footerNote = '\n\n💎 *Subbot PREMIUM activo:* descargas e IA desbloqueadas.';
  }

  // La imagen/video del banner y el menú van SIEMPRE en el mismo mensaje.
  // Cada subbot usa su propio banner si lo configuró; si no, el global.
  const banner = settings.banner;
  if (banner && fs.existsSync(banner)) {
    try {
      const buffer = fs.readFileSync(banner);
      const isVideo =
        settings.bannerType === 'video' || /\.(mp4|webm)$/i.test(String(banner));
      if (isVideo) {
        await ctx.send({ video: buffer, gifPlayback: true, caption: text + footerNote, mentions });
      } else {
        await ctx.send({ image: buffer, caption: text + footerNote, mentions });
      }
      return;
    } catch (err) {
      console.error('[MENU] No se pudo enviar el banner con el menú:', err?.message || err);
    }
  }
  await ctx.send({ text: text + footerNote, mentions });
}

export default [
  {
    name: 'menu',
    aliases: ['help', 'comandos', 'allmenu', 'menú', 'ayuda'],
    category: 'general',
    desc: 'Muestra el menú completo de comandos del bot.',
    usage: 'menu',
    async execute(ctx) {
      if (ctx.args[0]) {
        const target = ctx.commandMap.get(ctx.args[0].replace(/^[.!/]/, '').toLowerCase());
        if (!target) {
          await ctx.reply(`❌ No existe el comando *${ctx.args[0]}*.`);
          return;
        }
        // Los comandos +18 están retirados: su ayuda tampoco se muestra.
        if (target.category === 'nsfw') {
          await ctx.reply('🌙 *Comando retirado* ✨\n\nEste contenido ya no forma parte del bot.');
          return;
        }
        await ctx.reply(
          buildCommandHelp(target, ctx.prefix, {
            subbot: ctx.isSubbot,
            subbotPremium: ctx.isSubbotPremium,
          }),
        );
        return;
      }
      await sendMenu(ctx);
    },
  },
  {
    name: 'upgrade',
    aliases: ['vip', 'serpremium'],
    category: 'general',
    desc: 'Muestra qué incluye un subbot premium y cómo conseguirlo.',
    usage: 'upgrade',
    async execute(ctx) {
      const store = db();
      const subbot = ctx.subbot;
      const esPremium = ctx.isSubbotPremium;
      const estado = !subbot
        ? '🤖 Este bot es el *principal*: tiene todo desbloqueado.'
        : ctx.isSubbotPrimary
          ? '👑 Este subbot es el *BOT PRINCIPAL*: todo desbloqueado y no se puede silenciar.'
          : esPremium
            ? '💎 Tu subbot es *PREMIUM*: todo desbloqueado.'
            : '🆓 Tu subbot es *normal*: descargas e IA bloqueadas.';
      const lista = (config.premiumCategories || [])
        .map((c) => {
          const names = {
            downloads: '📥 Descargas (.play, .ytmp3, .ytmp4, .tiktok…)',
            ai: '🤖 IA (.ai, .gemini, .imagine, .aichat…)',
          };
          return names[c] || `✨ ${c}`;
        })
        .join('\n');
      await ctx.reply(
        `💎 *SUBBOT PREMIUM*\n\n${estado}\n\n` +
          `*Un subbot PREMIUM desbloquea:*\n${lista || '✨ Funciones exclusivas'}\n\n` +
          `*Subbot NORMAL incluye:*\n⚡ Menú, grupos, stickers, anime, economía, herramientas y más\n\n` +
          `👑 Para activarlo, el owner usa:\n*${ctx.prefix}prem <número> [días]*\n\n` +
          `📱 Contacto: ${config.support}`,
      );
    },
  },
  {
    name: 'ping',
    aliases: ['pong'],
    category: 'general',
    desc: 'Comprueba la latencia del bot.',
    usage: 'ping',
    async execute(ctx) {
      const start = Date.now();
      const sent = await ctx.reply('⚡ *Ping...*');
      const ms = Date.now() - start;
      try {
        await ctx.sock.sendMessage(
          ctx.chat,
          { text: withWatermark(`🏓 *Pong!*\n\n⚡ Latencia: *${ms} ms*\n🌩️ ZENITSU BOT está listo.`), edit: sent?.key },
        );
      } catch {
        await ctx.reply(`🏓 *Pong!*\n\n⚡ Latencia: *${ms} ms*`);
      }
    },
  },
  {
    name: 'speed',
    aliases: ['latencia'],
    category: 'general',
    desc: 'Mide la velocidad de respuesta del bot.',
    usage: 'speed',
    async execute(ctx) {
      const t1 = Date.now();
      await sleep(10);
      const t2 = Date.now();
      await ctx.reply(`⚡ *Velocidad del trueno*\n\n🛰️ Respuesta: *${t2 - t1} ms*\n⏱️ Activo: *${uptimeText()}*`);
    },
  },
  {
    name: 'info',
    aliases: ['infobot', 'botinfo'],
    category: 'general',
    desc: 'Muestra información general del bot.',
    usage: 'info',
    async execute(ctx) {
      const store = db();
      const info = osInfo();
      const total = (ctx.commands || []).filter((c) => !c.hidden).length;
      const text = [
        '╭━━━ ⚡ ━━━╮',
        `   *${store.botName || config.botName}*`,
        '╰━━━ ⚡ ━━━╯',
        '',
        `📦 Versión: *${config.version}*`,
        `👑 Owner: *+${store.owners?.[0] || config.ownerNumber}*`,
        `⚙️ Prefijo: *${store.prefix || config.prefix}*`,
        `📡 Modo: *${store.mode || 'public'}*`,
        `🧩 Comandos: *${total}*`,
        `⏱️ Activo: *${uptimeText()}*`,
        '',
        '🖥️ *Sistema*',
        `▸ Plataforma: ${info.platform}`,
        `▸ Node.js: ${info.node}`,
        `▸ Memoria: ${info.memory}`,
        `▸ CPUs: ${info.cpus}`,
        '',
        '🌩️ *Baileys + WhatsApp*',
        `▸ Marca de agua: ${config.watermark || 'ninguna'}`,
      ].join('\n');
      await ctx.reply(text);
    },
  },
  {
    name: 'owner',
    aliases: ['creador', 'contacto', 'contact'],
    category: 'general',
    desc: 'Muestra el contacto del owner.',
    usage: 'owner',
    async execute(ctx) {
      const num = db().owners?.[0] || config.ownerNumber;
      await ctx.reply(
        `👑 *OWNER DE ZENITSU BOT*\n\n📱 Número: *+${num}*\n💬 WhatsApp: https://wa.me/${num}\n\n⚡ _Para soporte, reportes o pedidos._`,
      );
    },
  },
  {
    name: 'uptime',
    aliases: ['runtime', 'activo'],
    category: 'general',
    desc: 'Muestra cuánto tiempo lleva activo el bot.',
    usage: 'uptime',
    async execute(ctx) {
      await ctx.reply(`⏱️ *Tiempo activo:* ${uptimeText()}\n⚡ ZENITSU BOT sigue en pie.`);
    },
  },
  {
    name: 'id',
    aliases: ['chatid', 'jid'],
    category: 'general',
    desc: 'Muestra los identificadores del chat y del usuario.',
    usage: 'id',
    async execute(ctx) {
      await ctx.reply(
        [
          '🆔 *Identificadores*',
          '',
          `💬 Chat: \`${ctx.chat}\``,
          `👤 Tú: \`${ctx.sender}\``,
          `🤖 Bot: \`${ctx.sock.user?.id || 'desconocido'}\``,
          `👥 Grupo: *${ctx.isGroup ? 'Sí' : 'No'}*`,
          `🛡️ Admin: *${ctx.isAdmin ? 'Sí' : 'No'}*`,
        ].join('\n'),
      );
    },
  },
  {
    name: 'profile',
    aliases: ['perfil', 'me', 'yo'],
    category: 'general',
    desc: 'Muestra tu perfil, nivel y monedas.',
    usage: 'profile',
    async execute(ctx) {
      const u = getUser(ctx.sender);
      const num = ctx.senderNumber;
      let pp = '';
      try {
        pp = await ctx.sock.profilePictureUrl(ctx.sender, 'image');
      } catch {}
      const text = [
        '╭━━━ ⚡ PERFIL ━━━╮',
        '',
        `👤 Nombre: *${ctx.pushName || 'Cazador'}*`,
        `📱 Número: *+${num}*`,
        `⚡ Nivel: *${u.level}*`,
        `✨ XP: *${formatNumber(u.xp)}*`,
        `💰 Monedas: *${formatNumber(u.coins)}*`,
        `⚠️ Advertencias: *${u.warns || 0}*`,
        `🎒 Inventario: *${Object.keys(u.inventory || {}).length} objetos*`,
        '',
        '╰━━━━━━━━━━━━━━╯',
      ].join('\n');
      if (pp) {
        try {
          await ctx.send({ image: { url: pp }, caption: text });
          return;
        } catch {}
      }
      await ctx.reply(text);
    },
  },
  {
    name: 'rules',
    aliases: ['reglas', 'normas'],
    category: 'general',
    desc: 'Muestra las reglas de uso del bot.',
    usage: 'rules',
    async execute(ctx) {
      await ctx.reply(
        [
          '📜 *REGLAS DE ZENITSU BOT*',
          '',
          '1️⃣ Respeta a todos los usuarios.',
          '2️⃣ No uses el bot para spam o acoso.',
          '3️⃣ No intentes vulnerar el bot ni sus comandos de owner.',
          '4️⃣ Los comandos de administración son responsabilidad del admin.',
          '5️⃣ No compartas tu sesión ni tu código de vinculación.',
          '6️⃣ Usa el bot con moderación.',
          '',
          '⚡ _Respira profundo y usa el trueno con honor._',
        ].join('\n'),
      );
    },
  },
  {
    name: 'report',
    aliases: ['reportar', 'soporte'],
    category: 'general',
    desc: 'Envía un reporte o sugerencia al owner.',
    usage: 'report <mensaje>',
    async execute(ctx) {
      const text = ctx.text;
      if (!text) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}report* <mensaje>`);
        return;
      }
      const ownerJid = numberToJid(db().owners?.[0] || config.ownerNumber);
      const report = [
        '📩 *NUEVO REPORTE*',
        '',
        `👤 De: ${ctx.pushName || 'Usuario'} (+${ctx.senderNumber})`,
        `💬 Chat: ${ctx.isGroup ? ctx.chat : 'Privado'}`,
        `🕒 Fecha: ${new Date().toLocaleString('es-ES', { timeZone: config.timezone })}`,
        '',
        `📝 Mensaje:`,
        text,
      ].join('\n');
      try {
        await ctx.sock.sendMessage(ownerJid, { text: withWatermark(report) });
        await ctx.reply('✅ Tu reporte fue enviado al owner. ¡Gracias!');
      } catch {
        await ctx.reply('❌ No pude enviar el reporte. Intenta de nuevo más tarde.');
      }
    },
  },
  {
    name: 'donate',
    aliases: ['donar', 'apoyar'],
    category: 'general',
    desc: 'Muestra cómo apoyar al bot.',
    usage: 'donate',
    async execute(ctx) {
      const num = db().owners?.[0] || config.ownerNumber;
      await ctx.reply(
        `💛 *APOYA A ZENITSU BOT*\n\nTu apoyo ayuda a mantener el bot activo 24/7.\n\n📱 Contacto: https://wa.me/${num}\n\n⚡ _Gracias por usar ZENITSU BOT._`,
      );
    },
  },
  {
    name: 'repo',
    aliases: ['source'],
    category: 'general',
    desc: 'Muestra el enlace del proyecto.',
    usage: 'repo',
    async execute(ctx) {
      await ctx.reply(`📦 *ZENITSU BOT*\n\n🌐 Repositorio: ${config.repo}\n💬 Soporte: ${config.support}\n\n⚡ Hecho con Baileys y mucho trueno.`);
    },
  },
  {
    name: 'zenitsu',
    aliases: ['frase', 'quotezenitsu'],
    category: 'general',
    desc: 'Muestra una frase de Zenitsu.',
    usage: 'zenitsu',
    async execute(ctx) {
      await ctx.reply(pick(ZENITSU_QUOTES));
    },
  },
  {
    name: 'n',
    aliases: ['tag', 'hidetag', 'notify', 'everyone', 'todos'],
    category: 'general',
    desc: 'Menciona a todos sin mostrar sus números (mención fantasma).',
    usage: 'n <mensaje>',
    group: true,
    admin: true,
    async execute(ctx) {
      const meta = await ctx.getGroupMeta();
      const ids = meta.participants.map((p) => participantJid(p)).filter(Boolean);
      const text = ctx.text || '⚡ ¡Atención a todos los cazadores!';
      // Mención fantasma: se notifica a todos con "mentions", pero el texto
      // no incluye "@número". Así no se ve la lista de usuarios mencionados.
      await ctx.send({ text, mentions: ids });
    },
  },
  {
    name: 'tagadmins',
    aliases: ['nadmin', 'advertir'],
    category: 'general',
    desc: 'Menciona solo a los administradores del grupo.',
    usage: 'tagadmins <mensaje>',
    group: true,
    admin: true,
    async execute(ctx) {
      const meta = await ctx.getGroupMeta();
      const admins = meta.participants
        .filter((p) => p.admin)
        .map((p) => participantJid(p))
        .filter(Boolean);
      if (!admins.length) {
        await ctx.reply('⚠️ Este grupo no tiene administradores.');
        return;
      }
      const text = ctx.text || '⚡ Aviso para los administradores.';
      await ctx.send({
        text: `${text}\n\n${admins.map((id) => `@${jidToNumber(id)}`).join(' ')}`,
        mentions: admins,
      });
    },
  },
];
