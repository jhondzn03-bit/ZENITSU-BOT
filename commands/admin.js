import fs from 'node:fs';
import { config } from '../config.js';
import { db, getGroup, save } from '../lib/db.js';
import {
  fetchBuffer,
  formatDate,
  isUrl,
  jidToNumber,
  numberToJid,
  withWatermark,
} from '../lib/utils.js';
import {
  getTargetJid,
  getTargetJids,
  isGroupAdmin,
  participantJid,
} from '../lib/targets.js';

async function getImageBuffer(ctx) {
  if (ctx.quoted?.mediaType === 'image') return ctx.downloadQuoted();
  if (ctx.m.mediaType === 'image') return ctx.downloadMedia();
  const url = ctx.args.find((a) => isUrl(a));
  if (url) return fetchBuffer(url);
  return null;
}

function groupToggle(name, key, label, aliases = []) {
  return {
    name,
    aliases,
    category: 'admin',
    desc: `Activa o desactiva ${label} en este grupo.`,
    usage: `${name} on|off`,
    group: true,
    admin: true,
    async execute(ctx) {
      const g = getGroup(ctx.chat);
      const value = String(ctx.args[0] || '').toLowerCase();
      if (!value) {
        await ctx.reply(
          `⚙️ *${label}:* ${g[key] ? '✅ ON' : '❌ OFF'}\n\n💡 Uso: ${ctx.prefix}${name} on|off`,
        );
        return;
      }
      if (['on', 'si', 'sí', '1', 'true', 'activar'].includes(value)) g[key] = true;
      else if (['off', 'no', '0', 'false', 'desactivar'].includes(value)) g[key] = false;
      else {
        await ctx.reply('❌ Valor inválido. Usa *on* u *off*.');
        return;
      }
      save();
      await ctx.reply(`⚙️ *${label}:* ${g[key] ? '✅ ON' : '❌ OFF'}`);
    },
  };
}

export default [
  {
    name: 'kick',
    aliases: ['expulsar', 'sacar', 'remove'],
    category: 'admin',
    desc: 'Expulsa a uno o varios miembros del grupo.',
    usage: 'kick @usuario',
    group: true,
    admin: true,
    botAdmin: true,
    async execute(ctx) {
      const targets = getTargetJids(ctx);
      if (!targets.length) {
        await ctx.reply(`💡 Menciona o responde al usuario que quieres expulsar.`);
        return;
      }
      if (targets.some((t) => isGroupAdmin(ctx.groupMeta, t))) {
        await ctx.reply('⚠️ No puedo expulsar a un administrador.');
        return;
      }
      const result = await ctx.sock.groupParticipantsUpdate(ctx.chat, targets, 'remove');
      const ok = result.filter((r) => r.status === '200').length;
      await ctx.reply(`👢 Expulsados: *${ok}/${targets.length}*`);
    },
  },
  {
    name: 'add',
    aliases: ['agregar', 'invitar'],
    category: 'admin',
    desc: 'Agrega un número al grupo.',
    usage: 'add 503XXXXXXXX',
    group: true,
    admin: true,
    botAdmin: true,
    async execute(ctx) {
      const num = String(ctx.args[0] || '').replace(/\D/g, '');
      if (num.length < 7) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}add* 503XXXXXXXX`);
        return;
      }
      const jid = numberToJid(num);
      const result = await ctx.sock.groupParticipantsUpdate(ctx.chat, [jid], 'add');
      const status = result?.[0]?.status || 'desconocido';
      if (status === '200') await ctx.reply(`✅ *+${num}* fue agregado al grupo.`);
      else if (status === '403') await ctx.reply(`⚠️ No pude agregar a *+${num}*. Su privacidad lo impide.\n\n💡 Pídele que me escriba o comparte el enlace del grupo.`);
      else await ctx.reply(`⚠️ Resultado: *${status}*`);
    },
  },
  {
    name: 'promote',
    aliases: ['promover', 'admin'],
    category: 'admin',
    desc: 'Hace administrador a un miembro.',
    usage: 'promote @usuario',
    group: true,
    admin: true,
    botAdmin: true,
    async execute(ctx) {
      const targets = getTargetJids(ctx);
      if (!targets.length) {
        await ctx.reply(`💡 Menciona o responde al usuario.`);
        return;
      }
      const result = await ctx.sock.groupParticipantsUpdate(ctx.chat, targets, 'promote');
      const ok = result.filter((r) => r.status === '200').length;
      await ctx.reply(`👑 Promovidos: *${ok}/${targets.length}*`);
    },
  },
  {
    name: 'demote',
    aliases: ['quitaradmin', 'degradar'],
    category: 'admin',
    desc: 'Quita el rol de administrador a un miembro.',
    usage: 'demote @usuario',
    group: true,
    admin: true,
    botAdmin: true,
    async execute(ctx) {
      const targets = getTargetJids(ctx);
      if (!targets.length) {
        await ctx.reply(`💡 Menciona o responde al usuario.`);
        return;
      }
      const result = await ctx.sock.groupParticipantsUpdate(ctx.chat, targets, 'demote');
      const ok = result.filter((r) => r.status === '200').length;
      await ctx.reply(`⬇️ Degradados: *${ok}/${targets.length}*`);
    },
  },
  {
    name: 'mute',
    aliases: ['botoff'],
    category: 'admin',
    desc: 'Silencia el bot en este grupo (solo admins podrán usar comandos).',
    usage: 'mute',
    group: true,
    admin: true,
    async execute(ctx) {
      const g = getGroup(ctx.chat);
      g.muted = true;
      save();
      await ctx.reply('🔇 *Bot silenciado.*\n\nSolo los administradores podrán usar comandos.');
    },
  },
  {
    name: 'unmute',
    aliases: ['activar', 'boton'],
    category: 'admin',
    desc: 'Reactiva el bot en este grupo.',
    usage: 'unmute',
    group: true,
    admin: true,
    async execute(ctx) {
      const g = getGroup(ctx.chat);
      g.muted = false;
      save();
      await ctx.reply('🔊 *Bot activado.*\n\nTodos pueden usar comandos nuevamente.');
    },
  },
  {
    name: 'groupinfo',
    aliases: ['grupo', 'infogrupo', 'gcinfo'],
    category: 'admin',
    desc: 'Muestra la información del grupo.',
    usage: 'groupinfo',
    group: true,
    async execute(ctx) {
      const meta = await ctx.getGroupMeta();
      const admins = meta.participants.filter((p) => p.admin);
      const creation = meta.creation ? formatDate(new Date(meta.creation * 1000)) : 'Desconocida';
      const owner = meta.owner ? `+${jidToNumber(meta.owner)}` : 'Desconocido';
      const text = [
        '╭━━━ ⚡ GRUPO ━━━╮',
        '',
        `📛 Nombre: *${meta.subject}*`,
        `🆔 ID: \`${meta.id}\``,
        `👑 Creador: ${owner}`,
        `📅 Creado: ${creation}`,
        `👥 Miembros: *${meta.participants.length}*`,
        `🛡️ Admins: *${admins.length}*`,
        `🔒 Anuncios: *${meta.announce ? 'Solo admins' : 'Todos'}*`,
        `✏️ Editar info: *${meta.restrict ? 'Solo admins' : 'Todos'}*`,
        '',
        `📜 *Descripción:*`,
        meta.desc || '_Sin descripción._',
        '',
        '╰━━━━━━━━━━━━━━╯',
      ].join('\n');
      await ctx.reply(text);
    },
  },
  {
    name: 'admins',
    aliases: ['listadmins', 'administradores'],
    category: 'admin',
    desc: 'Lista los administradores del grupo.',
    usage: 'admins',
    group: true,
    async execute(ctx) {
      const meta = await ctx.getGroupMeta();
      const admins = meta.participants.filter((p) => p.admin);
      if (!admins.length) {
        await ctx.reply('⚠️ Este grupo no tiene administradores.');
        return;
      }
      const list = admins
        .map(
          (p, i) =>
            `${i + 1}. @${jidToNumber(participantJid(p))} ${p.admin === 'superadmin' ? '👑' : '🛡️'}`,
        )
        .join('\n');
      await ctx.send({
        text: `🛡️ *ADMINISTRADORES DE ${meta.subject}*\n\n${list}`,
        mentions: admins.map((p) => participantJid(p)),
      });
    },
  },
  {
    name: 'linkgc',
    aliases: ['link', 'enlace', 'invitelink'],
    category: 'admin',
    desc: 'Obtiene el enlace de invitación del grupo.',
    usage: 'linkgc',
    group: true,
    admin: true,
    botAdmin: true,
    async execute(ctx) {
      const code = await ctx.sock.groupInviteCode(ctx.chat);
      await ctx.reply(`🔗 *Enlace del grupo*\n\nhttps://chat.whatsapp.com/${code}`);
    },
  },
  {
    name: 'revoke',
    aliases: ['resetlink', 'nuevolink'],
    category: 'admin',
    desc: 'Restablece el enlace de invitación del grupo.',
    usage: 'revoke',
    group: true,
    admin: true,
    botAdmin: true,
    async execute(ctx) {
      const code = await ctx.sock.groupRevokeInvite(ctx.chat);
      await ctx.reply(`♻️ *Enlace restablecido*\n\nhttps://chat.whatsapp.com/${code}`);
    },
  },
  {
    name: 'setnamegc',
    aliases: ['setgname', 'nombregrupo'],
    category: 'admin',
    desc: 'Cambia el nombre del grupo.',
    usage: 'setnamegc <nombre>',
    group: true,
    admin: true,
    botAdmin: true,
    async execute(ctx) {
      const name = ctx.text.trim();
      if (!name) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}setnamegc* <nombre>`);
        return;
      }
      await ctx.sock.groupUpdateSubject(ctx.chat, name);
      await ctx.reply(`✅ Nombre del grupo cambiado a: *${name}*`);
    },
  },
  {
    name: 'setdesc',
    aliases: ['setdescgc', 'descripcion'],
    category: 'admin',
    desc: 'Cambia la descripción del grupo.',
    usage: 'setdesc <texto>',
    group: true,
    admin: true,
    botAdmin: true,
    async execute(ctx) {
      const desc = ctx.text.trim();
      if (!desc) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}setdesc* <texto>`);
        return;
      }
      await ctx.sock.groupUpdateDescription(ctx.chat, desc);
      await ctx.reply('✅ Descripción del grupo actualizada.');
    },
  },
  {
    name: 'setppgc',
    aliases: ['fotogrupo', 'setgpp'],
    category: 'admin',
    desc: 'Cambia la foto del grupo.',
    usage: 'setppgc (responde a una imagen o pasa URL)',
    group: true,
    admin: true,
    botAdmin: true,
    async execute(ctx) {
      const buffer = await getImageBuffer(ctx);
      if (!buffer) {
        await ctx.reply(`💡 Responde a una imagen o usa *${ctx.prefix}setppgc* <url>`);
        return;
      }
      await ctx.sock.updateProfilePicture(ctx.chat, buffer);
      await ctx.reply('✅ Foto del grupo actualizada.');
    },
  },
  {
    name: 'warn',
    aliases: ['warning'],
    category: 'admin',
    desc: 'Advierte a un miembro. Al llegar al límite será expulsado.',
    usage: 'warn @usuario [motivo]',
    group: true,
    admin: true,
    async execute(ctx) {
      const jid = getTargetJid(ctx);
      if (!jid) {
        await ctx.reply(`💡 Menciona o responde al usuario.`);
        return;
      }
      if (isGroupAdmin(ctx.groupMeta, jid)) {
        await ctx.reply('⚠️ No puedo advertir a un administrador.');
        return;
      }
      const g = getGroup(ctx.chat);
      const key = jidToNumber(jid);
      g.warns[key] = (g.warns[key] || 0) + 1;
      const count = g.warns[key];
      const limit = g.warnLimit || config.maxWarns;
      const reason = ctx.args.slice(1).join(' ').replace(/@\d+/g, '').trim();
      save();

      if (count >= limit && ctx.isBotAdmin) {
        try {
          await ctx.sock.groupParticipantsUpdate(ctx.chat, [jid], 'remove');
        } catch {}
        delete g.warns[key];
        save();
        await ctx.send({
          text: `🚫 @${key} alcanzó *${limit}/${limit}* advertencias y fue expulsado.${reason ? `\n\n📝 Motivo: ${reason}` : ''}`,
          mentions: [jid],
        });
        return;
      }

      await ctx.send({
        text: `⚠️ @${key} recibió una advertencia.\n\n📊 Advertencias: *${count}/${limit}*${reason ? `\n📝 Motivo: ${reason}` : ''}`,
        mentions: [jid],
      });
    },
  },
  {
    name: 'unwarn',
    aliases: ['quitarwarn'],
    category: 'admin',
    desc: 'Quita una advertencia a un miembro.',
    usage: 'unwarn @usuario',
    group: true,
    admin: true,
    async execute(ctx) {
      const jid = getTargetJid(ctx);
      if (!jid) {
        await ctx.reply(`💡 Menciona o responde al usuario.`);
        return;
      }
      const g = getGroup(ctx.chat);
      const key = jidToNumber(jid);
      g.warns[key] = Math.max(0, (g.warns[key] || 0) - 1);
      if (!g.warns[key]) delete g.warns[key];
      save();
      await ctx.send({
        text: `✅ Advertencia retirada a @${key}.\n\n📊 Advertencias: *${g.warns[key] || 0}*`,
        mentions: [jid],
      });
    },
  },
  {
    name: 'warns',
    aliases: ['advertencias'],
    category: 'admin',
    desc: 'Muestra las advertencias del grupo.',
    usage: 'warns',
    group: true,
    admin: true,
    async execute(ctx) {
      const g = getGroup(ctx.chat);
      const entries = Object.entries(g.warns || {}).filter(([, n]) => n > 0);
      if (!entries.length) {
        await ctx.reply('✅ Este grupo no tiene advertencias activas.');
        return;
      }
      const list = entries
        .sort((a, b) => b[1] - a[1])
        .map(([num, n], i) => `${i + 1}. +${num} — *${n}/${g.warnLimit || config.maxWarns}*`)
        .join('\n');
      await ctx.reply(`⚠️ *ADVERTENCIAS DEL GRUPO*\n\n${list}`);
    },
  },
  {
    name: 'resetwarns',
    aliases: ['limpiarwarns'],
    category: 'admin',
    desc: 'Limpia todas las advertencias del grupo.',
    usage: 'resetwarns',
    group: true,
    admin: true,
    async execute(ctx) {
      const g = getGroup(ctx.chat);
      g.warns = {};
      save();
      await ctx.reply('✅ Advertencias del grupo reiniciadas.');
    },
  },
  {
    name: 'setwarnlimit',
    aliases: ['warnlimit'],
    category: 'admin',
    desc: 'Cambia el límite de advertencias del grupo.',
    usage: 'setwarnlimit <1-10>',
    group: true,
    admin: true,
    async execute(ctx) {
      const n = Number(ctx.args[0]);
      if (!Number.isInteger(n) || n < 1 || n > 10) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}setwarnlimit* <1-10>`);
        return;
      }
      const g = getGroup(ctx.chat);
      g.warnLimit = n;
      save();
      await ctx.reply(`✅ Límite de advertencias: *${n}*`);
    },
  },
  {
    name: 'del',
    aliases: ['borrar', 'delete'],
    category: 'admin',
    desc: 'Elimina el mensaje citado.',
    usage: 'del (responde al mensaje)',
    group: true,
    admin: true,
    botAdmin: true,
    async execute(ctx) {
      if (!ctx.quoted?.key?.id) {
        await ctx.reply(`💡 Responde al mensaje que quieres eliminar.`);
        return;
      }
      const key = {
        remoteJid: ctx.chat,
        fromMe: jidToNumber(ctx.quoted.sender) === jidToNumber(ctx.sock.user?.id),
        id: ctx.quoted.key.id,
        participant: ctx.quoted.sender || undefined,
      };
      await ctx.sock.sendMessage(ctx.chat, { delete: key });
      try {
        await ctx.deleteMsg();
      } catch {}
    },
  },
  {
    name: 'poll',
    aliases: ['encuesta', 'votacion'],
    category: 'admin',
    desc: 'Crea una encuesta en el grupo.',
    usage: 'poll Pregunta | Opción 1 | Opción 2',
    group: true,
    admin: true,
    async execute(ctx) {
      const parts = ctx.text.split('|').map((s) => s.trim()).filter(Boolean);
      if (parts.length < 3) {
        await ctx.reply(
          `💡 Uso: *${ctx.prefix}poll* Pregunta | Opción 1 | Opción 2\n\nEjemplo:\n${ctx.prefix}poll ¿Qué anime es mejor? | Demon Slayer | Naruto | One Piece`,
        );
        return;
      }
      const [name, ...values] = parts;
      const sent = await ctx.sock.sendMessage(ctx.chat, {
        poll: {
          name: withWatermark(`📊 ${name}`),
          values: values.slice(0, 12),
          selectableCount: 1,
        },
      });
      if (sent) {
        const { trackSent } = await import('../lib/state.js');
        trackSent(sent);
      }
    },
  },
  {
    name: 'close',
    aliases: ['cerrar', 'soloAdmin'],
    category: 'admin',
    desc: 'Cierra el grupo para que solo los admins escriban.',
    usage: 'close',
    group: true,
    admin: true,
    botAdmin: true,
    async execute(ctx) {
      await ctx.sock.groupSettingUpdate(ctx.chat, 'announcement');
      await ctx.reply('🔒 *Grupo cerrado.*\n\nSolo los administradores pueden enviar mensajes.');
    },
  },
  {
    name: 'open',
    aliases: ['abrir'],
    category: 'admin',
    desc: 'Abre el grupo para que todos escriban.',
    usage: 'open',
    group: true,
    admin: true,
    botAdmin: true,
    async execute(ctx) {
      await ctx.sock.groupSettingUpdate(ctx.chat, 'not_announcement');
      await ctx.reply('🔓 *Grupo abierto.*\n\nTodos los miembros pueden enviar mensajes.');
    },
  },
  {
    name: 'membercount',
    aliases: ['miembros', 'count'],
    category: 'admin',
    desc: 'Muestra cuántos miembros tiene el grupo.',
    usage: 'membercount',
    group: true,
    async execute(ctx) {
      const meta = await ctx.getGroupMeta();
      const admins = meta.participants.filter((p) => p.admin).length;
      await ctx.reply(`👥 *${meta.subject}*\n\n▸ Miembros: *${meta.participants.length}*\n▸ Administradores: *${admins}*\n▸ Miembros normales: *${meta.participants.length - admins}*`);
    },
  },
  {
    name: 'setwelcome',
    aliases: ['bienvenida'],
    category: 'admin',
    desc: 'Personaliza el mensaje de bienvenida.',
    usage: 'setwelcome <texto con {user} {group} {count} {desc}>',
    group: true,
    admin: true,
    async execute(ctx) {
      const g = getGroup(ctx.chat);
      const text = ctx.text.trim();
      if (!text) {
        await ctx.reply(
          `👋 *Bienvenida actual:*\n\n${g.welcomeText || '_Mensaje predeterminado_'}\n\n💡 Variables: {user} {group} {count} {desc}\n\n💡 Uso: ${ctx.prefix}setwelcome Hola {user}, bienvenido a {group}`,
        );
        return;
      }
      g.welcomeText = text;
      save();
      await ctx.reply('✅ Mensaje de bienvenida actualizado.');
    },
  },
  {
    name: 'setgoodbye',
    aliases: ['despedida'],
    category: 'admin',
    desc: 'Personaliza el mensaje de despedida.',
    usage: 'setgoodbye <texto con {user} {group} {count}>',
    group: true,
    admin: true,
    async execute(ctx) {
      const g = getGroup(ctx.chat);
      const text = ctx.text.trim();
      if (!text) {
        await ctx.reply(
          `👋 *Despedida actual:*\n\n${g.goodbyeText || '_Mensaje predeterminado_'}\n\n💡 Variables: {user} {group} {count}\n\n💡 Uso: ${ctx.prefix}setgoodbye Adiós {user}`,
        );
        return;
      }
      g.goodbyeText = text;
      save();
      await ctx.reply('✅ Mensaje de despedida actualizado.');
    },
  },
  groupToggle('welcome', 'welcome', 'Bienvenida', ['bienvenidas']),
  groupToggle('goodbye', 'goodbye', 'Despedida', ['despedidas']),
  groupToggle('antilink', 'antiLink', 'Anti enlaces', ['antienlaces']),
  groupToggle('antispam', 'antiSpam', 'Anti spam', ['antiflood']),
];
