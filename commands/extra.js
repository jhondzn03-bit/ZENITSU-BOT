import {
  downloadContentFromMessage,
} from '@whiskeysockets/baileys';
import { db, getUser, save } from '../lib/db.js';
import { formatNumber, jidToNumber, randomInt, sleep } from '../lib/utils.js';

const MORSE = {
  a: '.-', b: '-...', c: '-.-.', d: '-..', e: '.', f: '..-.', g: '--.', h: '....',
  i: '..', j: '.---', k: '-.-', l: '.-..', m: '--', n: '-.', o: '---', p: '.--.',
  q: '--.-', r: '.-.', s: '...', t: '-', u: '..-', v: '...-', w: '.--', x: '-..-',
  y: '-.--', z: '--..', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-',
  5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
};
const MORSE_REVERSE = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));

function textOf(ctx) {
  return String(ctx.text || '').trim();
}

function transformCommand(name, aliases, desc, fn) {
  return {
    name,
    aliases,
    category: 'tools',
    desc,
    usage: `${name} <texto>`,
    async execute(ctx) {
      const text = textOf(ctx);
      if (!text) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}${name}* <texto>`);
        return;
      }
      await ctx.reply(fn(text));
    },
  };
}

export default [
  transformCommand('reverse', [], 'Invierte un texto.', (t) => [...t].reverse().join('')),
  transformCommand('upper', ['mayusculas'], 'Convierte el texto a MAYÚSCULAS.', (t) => t.toUpperCase()),
  transformCommand('lower', ['minusculas'], 'Convierte el texto a minúsculas.', (t) => t.toLowerCase()),
  transformCommand('title', ['titulo'], 'Pone el texto en Formato Título.', (t) =>
    t.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()),
  ),
  transformCommand('mock', ['burlar', 'spongebob'], 'Convierte el texto en burla alternando mayúsculas.', (t) =>
    [...t].map((c, i) => (i % 2 ? c.toUpperCase() : c.toLowerCase())).join(''),
  ),
  transformCommand('vaporwave', ['aesthetic'], 'Convierte el texto a estilo vaporwave.', (t) => {
    const map = { a: 'ａ', b: 'ｂ', c: 'ｃ', d: 'ｄ', e: 'ｅ', f: 'ｆ', g: 'ｇ', h: 'ｈ', i: 'ｉ', j: 'ｊ', k: 'ｋ', l: 'ｌ', m: 'ｍ', n: 'ｎ', o: 'ｏ', p: 'ｐ', q: 'ｑ', r: 'ｒ', s: 'ｓ', t: 'ｔ', u: 'ｕ', v: 'ｖ', w: 'ｗ', x: 'ｘ', y: 'ｙ', z: 'ｚ' };
    return [...t.toLowerCase()].map((c) => map[c] || c).join(' ') + '  ✨';
  }),
  transformCommand('clap', ['aplaudir'], 'Separa las palabras con aplausos.', (t) => t.split(/\s+/).join(' 👏 ')),
  transformCommand('spoiler', ['ocultar'], 'Oculta un texto como spoiler de WhatsApp.', (t) => `||${t}||`),
  transformCommand('emojify', ['emojis'], 'Convierte letras en emojis cuadrados.', (t) => {
    const map = { a: '🅰️', b: '🅱️', c: '🇨', d: '🇩', e: '🇪', f: '🇫', g: '🇬', h: '🇭', i: '🇮', j: '🇯', k: '🇰', l: '🇱', m: '🇲', n: '🇳', o: '🅾️', p: '🇵', q: '🇶', r: '🇷', s: '🇸', t: '🇹', u: '🇺', v: '🇻', w: '🇼', x: '🇽', y: '🇾', z: '🇿' };
    return [...t.toLowerCase()].map((c) => map[c] || c).join('');
  }),
  {
    name: 'binary',
    aliases: ['binario'],
    category: 'tools',
    desc: 'Convierte texto a binario.',
    usage: 'binary <texto>',
    async execute(ctx) {
      const text = textOf(ctx);
      if (!text) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}binary* hola`);
        return;
      }
      const out = [...text].map((c) => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
      await ctx.reply(`💻 *Binario*\n\n\`${out}\``);
    },
  },
  {
    name: 'unbinary',
    aliases: ['debinario'],
    category: 'tools',
    desc: 'Convierte binario a texto.',
    usage: 'unbinary <binario>',
    async execute(ctx) {
      const text = textOf(ctx);
      if (!text) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}unbinary* 01101000 01101111`);
        return;
      }
      try {
        const out = text
          .split(/\s+/)
          .filter(Boolean)
          .map((b) => String.fromCharCode(parseInt(b, 2)))
          .join('');
        await ctx.reply(`📝 *Texto*\n\n${out}`);
      } catch {
        await ctx.reply('❌ Ese binario no es válido.');
      }
    },
  },
  {
    name: 'morse',
    aliases: ['codigomorse'],
    category: 'tools',
    desc: 'Convierte texto a código Morse.',
    usage: 'morse <texto>',
    async execute(ctx) {
      const text = textOf(ctx);
      if (!text) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}morse* hola`);
        return;
      }
      const out = [...text.toLowerCase()]
        .map((c) => (c === ' ' ? '/' : MORSE[c] || c))
        .join(' ');
      await ctx.reply(`📡 *Morse*\n\n\`${out}\``);
    },
  },
  {
    name: 'unmorse',
    aliases: ['demorse'],
    category: 'tools',
    desc: 'Convierte código Morse a texto.',
    usage: 'unmorse <morse>',
    async execute(ctx) {
      const text = textOf(ctx);
      if (!text) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}unmorse* .... --- .-.. .-`);
        return;
      }
      const out = text
        .trim()
        .split(/\s+/)
        .map((part) => (part === '/' ? ' ' : MORSE_REVERSE[part] || '?'))
        .join('');
      await ctx.reply(`📝 *Texto*\n\n${out}`);
    },
  },
  {
    name: 'choose',
    aliases: ['elegir', 'escoge'],
    category: 'fun',
    desc: 'Elige una opción al azar separada por comas o |.',
    usage: 'choose pizza, sushi, tacos',
    async execute(ctx) {
      const options = textOf(ctx)
        .split(/[,|]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (options.length < 2) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}choose* pizza, sushi, tacos`);
        return;
      }
      await ctx.reply(`🎲 *Elijo:* ${options[randomInt(0, options.length - 1)]}`);
    },
  },
  {
    name: 'color',
    aliases: ['colorinfo'],
    category: 'tools',
    desc: 'Muestra información de un color HEX o RGB.',
    usage: 'color #ff0000 | rgb(255,0,0)',
    async execute(ctx) {
      const text = textOf(ctx);
      if (!text) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}color* #ff0000`);
        return;
      }
      let r;
      let g;
      let b;
      const hex = text.match(/^#?([0-9a-f]{6})$/i);
      const rgb = text.match(/rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/i);
      if (hex) {
        r = parseInt(hex[1].slice(0, 2), 16);
        g = parseInt(hex[1].slice(2, 4), 16);
        b = parseInt(hex[1].slice(4, 6), 16);
      } else if (rgb) {
        [r, g, b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
      } else {
        await ctx.reply('❌ Usa un HEX (#ff0000) o RGB (rgb(255,0,0)).');
        return;
      }
      const toHex = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
      const h = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
      await ctx.reply(`🎨 *COLOR*\n\n▸ HEX: *${h}*\n▸ RGB: *${r}, ${g}, ${b}*`);
    },
  },
  {
    name: 'groupid',
    aliases: ['gid', 'idgrupo'],
    category: 'general',
    desc: 'Muestra el ID del grupo actual.',
    usage: 'groupid',
    group: true,
    async execute(ctx) {
      const meta = await ctx.getGroupMeta();
      await ctx.reply(`🆔 *ID del grupo*\n\n${ctx.chat}\n\n📝 Nombre: *${meta.subject || 'Sin nombre'}*`);
    },
  },
  {
    name: 'getpp',
    aliases: ['pfp', 'fotoperfil', 'getpic'],
    category: 'general',
    desc: 'Muestra la foto de perfil de un usuario.',
    usage: 'getpp [@usuario | responde]',
    async execute(ctx) {
      const jid = ctx.mentioned?.[0] || ctx.quoted?.sender || ctx.sender;
      try {
        const url = await ctx.sock.profilePictureUrl(jid, 'image');
        await ctx.send({ image: { url }, caption: `🖼️ Foto de perfil de @${jidToNumber(jid)}`, mentions: [jid] });
      } catch {
        await ctx.reply('❌ Ese usuario no tiene foto de perfil visible.');
      }
    },
  },
  {
    name: 'afk',
    aliases: ['ausente'],
    category: 'general',
    desc: 'Marca tu estado como ausente con un motivo.',
    usage: 'afk <motivo | off>',
    async execute(ctx) {
      const u = getUser(ctx.sender);
      const reason = textOf(ctx);
      if (reason.toLowerCase() === 'off' || reason.toLowerCase() === 'no') {
        u.afk = null;
        save();
        await ctx.reply('✅ Ya no estás ausente.');
        return;
      }
      u.afk = { reason: reason || 'Sin motivo', since: Date.now() };
      save();
      await ctx.reply(`💤 *AFK activado*\n\n📝 Motivo: ${u.afk.reason}`);
    },
  },
  {
    name: 'beg',
    aliases: ['mendigar', 'pedir'],
    category: 'economy',
    desc: 'Pide unas monedas con un pequeño tiempo de espera.',
    usage: 'beg',
    async execute(ctx) {
      const u = getUser(ctx.sender);
      const wait = 60 * 1000 - (Date.now() - Number(u.lastBeg || 0));
      if (wait > 0) {
        await ctx.reply(`⏳ Espera *${Math.ceil(wait / 1000)}s* antes de volver a mendigar.`);
        return;
      }
      u.lastBeg = Date.now();
      const amount = randomInt(10, 80);
      u.coins = (u.coins || 0) + amount;
      save();
      await ctx.reply(`🥺 *Mendigaste* y conseguiste *${formatNumber(amount)} monedas*.\n\n💰 Balance: *${formatNumber(u.coins)}*`);
    },
  },
  {
    name: 'gamble',
    aliases: ['apuesta'],
    category: 'economy',
    desc: 'Apuesta monedas al 50/50.',
    usage: 'gamble <cantidad | all>',
    async execute(ctx) {
      const u = getUser(ctx.sender);
      const arg = String(ctx.args[0] || '').toLowerCase();
      const balance = Number(u.coins || 0);
      if (!arg) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}gamble* 100\n💡 Tienes *${formatNumber(balance)}* monedas.`);
        return;
      }
      let amount = arg === 'all' || arg === 'todo' ? balance : Number(arg.replace(/\D/g, ''));
      if (!amount || amount < 50) {
        await ctx.reply('❌ La apuesta mínima es *50 monedas*.');
        return;
      }
      if (amount > balance) {
        await ctx.reply(`❌ No tienes suficientes monedas. Balance: *${formatNumber(balance)}*`);
        return;
      }
      const win = Math.random() < 0.45;
      u.coins = win ? balance + amount : balance - amount;
      save();
      await ctx.reply(
        win
          ? `🎉 *¡GANASTE!*\n\n▸ Apuesta: *${formatNumber(amount)}*\n▸ Ganancia: *+${formatNumber(amount)}*\n💰 Balance: *${formatNumber(u.coins)}*`
          : `💀 *PERDISTE*\n\n▸ Apuesta: *${formatNumber(amount)}*\n▸ Perdiste: *-${formatNumber(amount)}*\n💰 Balance: *${formatNumber(u.coins)}*`,
      );
    },
  },
  {
    name: 'shrug',
    aliases: ['nolose'],
    category: 'fun',
    desc: 'Envía un encogimiento de hombros.',
    usage: 'shrug',
    async execute(ctx) {
      await ctx.reply('¯\\_(ツ)_/¯');
    },
  },
  {
    name: 'tableflip',
    aliases: ['flipmesa'],
    category: 'fun',
    desc: 'Voltea la mesa.',
    usage: 'tableflip',
    async execute(ctx) {
      await ctx.reply('(╯°□°）╯︵ ┻━┻');
    },
  },
  {
    name: 'unflip',
    aliases: ['arreglarmesa'],
    category: 'fun',
    desc: 'Vuelve a poner la mesa en su lugar.',
    usage: 'unflip',
    async execute(ctx) {
      await ctx.reply('┬─┬ノ( º _ ºノ)');
    },
  },
  {
    name: 'lenny',
    aliases: ['caralenny'],
    category: 'fun',
    desc: 'Envía la cara Lenny.',
    usage: 'lenny',
    async execute(ctx) {
      await ctx.reply('( ͡° ͜ʖ ͡°)');
    },
  },
  {
    name: 'read',
    aliases: ['marcarleido'],
    category: 'general',
    desc: 'Marca el chat actual como leído.',
    usage: 'read',
    async execute(ctx) {
      try {
        await ctx.sock.readMessages([ctx.msg.key]);
        await ctx.reply('✅ Chat marcado como leído.');
      } catch {
        await ctx.reply('❌ No pude marcar el chat como leído.');
      }
    },
  },
  {
    name: 'ver',
    aliases: ['vv', 'viewonce', 'veronce', 'revelar'],
    category: 'tools',
    desc: 'Abre y reenvía una foto, video o audio de una sola visualización.',
    usage: 'ver (responde al mensaje de una sola visualización)',
    async execute(ctx) {
      // Tipos de WhatsApp → tipo que espera el desencriptado.
      const TYPE_MAP = {
        imageMessage: 'image',
        videoMessage: 'video',
        ptvMessage: 'video',
        audioMessage: 'audio',
        documentMessage: 'document',
        stickerMessage: 'sticker',
      };

      // serialize() ya desenvuelve viewOnceMessage / viewOnceMessageV2 /
      // viewOnceMessageV2Extension: ctx.quoted.content es el medio real.
      let target = null;
      if (ctx.quoted && TYPE_MAP[ctx.quoted.type]) target = ctx.quoted;
      else if (ctx.m && TYPE_MAP[ctx.m.type]) target = ctx.m;

      if (!target) {
        await ctx.reply(
          `👁️ *VER UNA SOLA VISUALIZACIÓN*\n\n` +
            `Responde a una foto, video o audio de “una sola visualización” con *${ctx.prefix}ver*.\n\n` +
            `💡 También funciona con fotos, videos y audios normales.`,
        );
        return;
      }

      const mediaType = TYPE_MAP[target.type];
      const download = async () => {
        if (!target.content) throw new Error('El mensaje no tiene multimedia');
        const stream = await downloadContentFromMessage(target.content, mediaType);
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const out = Buffer.concat(chunks);
        if (!out.length) throw new Error('WhatsApp devolvió un archivo vacío');
        return out;
      };

      let buffer = null;
      let reason = '';
      try {
        buffer = await download();
      } catch (err) {
        reason = err?.message || String(err);
      }

      // Si el medio ya se borró del servidor (típico de "una sola vez"),
      // se le pide al teléfono que lo vuelva a subir y se reintenta.
      if (!buffer?.length) {
        try {
          const ci = ctx.m?.contextInfo || {};
          const rawQuoted = ci.quotedMessage || null;
          const quotedId = ci.stanzaId || ctx.quoted?.key?.id;
          if (rawQuoted && quotedId && typeof ctx.sock.updateMediaMessage === 'function') {
            await ctx.sock.updateMediaMessage({
              key: {
                remoteJid: ctx.chat,
                id: quotedId,
                fromMe: false,
                participant: ci.participant || ctx.quoted?.key?.participant,
              },
              message: rawQuoted,
            });
            await sleep(1200);
            buffer = await download();
            reason = '';
          }
        } catch (err2) {
          reason = err2?.message || reason;
        }
      }

      if (!buffer?.length) {
        await ctx.reply(
          `❌ No pude abrir ese contenido.\n\n` +
            (reason ? `📝 Motivo: ${reason}\n\n` : '') +
            `💡 Pídele a quien lo envió que lo reenvíe y respóndele rápido con *${ctx.prefix}ver*.`,
        );
        return;
      }

      const caption = '👁️ *Contenido revelado* ⚡';
      if (mediaType === 'image') {
        await ctx.send({ image: buffer, caption });
      } else if (mediaType === 'video') {
        await ctx.send({ video: buffer, caption, mimetype: 'video/mp4' });
      } else if (mediaType === 'audio') {
        await ctx.send({ audio: buffer, mimetype: 'audio/mp4', fileName: 'zenitsu-audio.m4a' });
      } else if (mediaType === 'sticker') {
        await ctx.send({ sticker: buffer });
      } else {
        const content = target.content || {};
        await ctx.send({
          document: buffer,
          mimetype: content.mimetype || 'application/octet-stream',
          fileName: content.fileName || 'zenitsu-archivo',
        });
      }
    },
  },
];
