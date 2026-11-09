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
  truncate,
  withWatermark,
} from '../lib/utils.js';
import { getTargetJid } from '../lib/targets.js';
import { gifToMp4 } from '../lib/sticker.js';
import { DEFAULT_MENU_STYLE, MENU_STYLES } from '../lib/menu.js';
import * as api from '../lib/api.js';
import * as utils from '../lib/utils.js';

const require = createRequire(import.meta.url);

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

export default [
  {
    name: 'setname',
    aliases: ['setbotname', 'nombrebot'],
    category: 'owner',
    desc: 'Cambia el nombre interno del bot.',
    usage: 'setname <nombre>',
    owner: true,
    async execute(ctx) {
      const name = ctx.text.trim();
      if (name.length < 2 || name.length > 40) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}setname* <nombre> (2 a 40 caracteres)`);
        return;
      }
      db().botName = name;
      save();
      await ctx.reply(`✅ Nombre del bot actualizado a:\n\n⚡ *${name}*`);
    },
  },
  {
    name: 'setbanner',
    aliases: ['banner', 'bannermenu'],
    category: 'owner',
    desc: 'Cambia la imagen, GIF o video (máx. 15s) del menú.',
    usage: 'setbanner <url | responde a imagen/gif/video | reset>',
    owner: true,
    async execute(ctx) {
      const arg = String(ctx.args[0] || '').toLowerCase();
      if (arg === 'reset' || arg === 'delete' || arg === 'borrar') {
        db().banner = null;
        db().bannerType = 'image';
        save();
        await ctx.reply('🗑️ Banner eliminado. El menú se enviará como texto.');
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
      const target = path.join(config.assetsDir, isVideo ? 'banner.mp4' : 'banner.jpg');
      fs.mkdirSync(config.assetsDir, { recursive: true });
      fs.writeFileSync(target, buffer);
      db().banner = target;
      db().bannerType = isVideo ? 'video' : 'image';
      save();

      const caption = isVideo
        ? `✅ *Banner actualizado*\n\n🎬 Video/GIF${seconds ? ` de *${seconds.toFixed(1)}s*` : ''}\nAsí se verá el menú de ZENITSU BOT.`
        : '✅ *Banner actualizado*\n\n🖼️ Imagen del menú de ZENITSU BOT.';
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
    async execute(ctx) {
      const value = ctx.text.trim();
      if (!value || ['reset', 'borrar', 'delete'].includes(value.toLowerCase())) {
        db().menuLink = '';
        save();
        await ctx.reply('🗑️ Enlace del menú eliminado.');
        return;
      }
      if (!/^https?:\/\/\S+$/i.test(value)) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}setlink* https://github.com/jhondzn03-bit/ZENITSU-BOT`);
        return;
      }
      db().menuLink = value;
      save();
      await ctx.reply(`✅ Enlace del menú actualizado:\n\n🔗 ${value}`);
    },
  },
  {
    name: 'setmenu',
    aliases: ['menustyle', 'estilomenu', 'estilo'],
    category: 'owner',
    desc: 'Cambia el estilo visual del menú.',
    usage: 'setmenu <estilo>',
    owner: true,
    async execute(ctx) {
      const style = String(ctx.args[0] || '').toLowerCase();
      const current = db().menuStyle || DEFAULT_MENU_STYLE;
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
        db().menuStyle = DEFAULT_MENU_STYLE;
        save();
        await ctx.reply(`✅ Estilo del menú restablecido a *${DEFAULT_MENU_STYLE}*.`);
        return;
      }

      if (!MENU_STYLES[style]) {
        await ctx.reply(
          `❌ Estilo *${style}* no existe.\n\n${list}\n\n💡 Uso: *${ctx.prefix}setmenu galactico*`,
        );
        return;
      }

      db().menuStyle = style;
      save();
      const meta = MENU_STYLES[style];
      await ctx.reply(
        `✅ Estilo del menú cambiado a ${meta.emoji} *${meta.label}*.\n\nEscribe *${ctx.prefix}menu* para verlo.`,
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
    async execute(ctx) {
      const p = String(ctx.args[0] || '').trim();
      if (!p || p.length > 3 || /\s/.test(p)) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}setprefix* <prefijo> (ej: . ! # /)`);
        return;
      }
      db().prefix = p;
      save();
      await ctx.reply(`✅ Prefijo cambiado a: *${p}*\n\nEjemplo: *${p}menu*`);
    },
  },
  {
    name: 'setowner',
    aliases: ['ownerprincipal'],
    category: 'owner',
    desc: 'Cambia el owner principal del bot.',
    usage: 'setowner <número>',
    owner: true,
    async execute(ctx) {
      const num = String(ctx.args[0] || '').replace(/\D/g, '');
      if (num.length < 7) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}setowner* 503XXXXXXXX`);
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
    async execute(ctx) {
      const sub = String(ctx.args[0] || '').toLowerCase();
      const value = ctx.args.slice(1).join(' ').trim();
      if (sub === 'pack' && value) {
        db().stickerPack = value;
        save();
        await ctx.reply(`✅ Pack de stickers: *${value}*`);
        return;
      }
      if ((sub === 'author' || sub === 'autor') && value) {
        db().stickerAuthor = value;
        save();
        await ctx.reply(`✅ Autor de stickers: *${value}*`);
        return;
      }
      await ctx.reply(
        `🎨 *Configuración de stickers*\n\n▸ Pack: *${db().stickerPack}*\n▸ Autor: *${db().stickerAuthor}*\n\n💡 ${ctx.prefix}setsticker pack Mi Pack\n💡 ${ctx.prefix}setsticker author Mi Nombre`,
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
    category: 'owner',
    desc: 'Genera al instante el código de vinculación de un subbot.',
    usage: 'code [número] [nombre]',
    owner: true,
    async execute(ctx) {
      // Si no se pasa número, usa el número de quien escribe el comando.
      const raw = String(ctx.args[0] || '').replace(/\D/g, '');
      const number =
        raw.length >= 7 ? raw : String(ctx.senderNumber || '').replace(/\D/g, '');
      if (number.length < 7) {
        await ctx.reply(
          `💡 No pude detectar tu número.\n\nUsa: *${ctx.prefix}code 503XXXXXXXX*`,
        );
        return;
      }
      const name =
        raw.length >= 7 ? ctx.args.slice(1).join(' ').trim() : ctx.args.join(' ').trim();
      const { addSubbot, startSubbot, isSubbotRunning } = await import('../lib/subbots.js');

      if (isSubbotRunning(number)) {
        await ctx.reply(`ℹ️ El subbot *+${number}* ya está activo.`);
        return;
      }

      const record = addSubbot(number, name);

      try {
        const result = await startSubbot(number);
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
          await ctx.reply(
            `🔗 *VINCULA EL SUBBOT*\n\n📱 Número: *+${number}*\n🔢 Código: *${outcome.code}*\n\n1. Abre WhatsApp en el *+${number}*.\n2. Dispositivos vinculados → Vincular dispositivo.\n3. Elige “Vincular con número de teléfono”.\n4. Escribe: *${outcome.code}*\n\n⚠️ El código caduca en ~60 segundos.`,
          );
        } else if (outcome.timeout) {
          await ctx.reply(
            `⌛ El subbot *${record.name}* sigue esperando vinculación.\n\nCuando tengas el código, revisa la consola o vuelve a usar *${ctx.prefix}code ${number}*.`,
          );
        } else {
          await ctx.reply(
            `❌ No se pudo generar el código del subbot.\n\n${outcome.error?.message || 'Error desconocido'}\n\n💡 Verifica que el número *+${number}* exista y tenga WhatsApp.`,
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
    desc: 'Muestra cuántos bots hay registrados y su estado.',
    usage: 'bots',
    owner: true,
    async execute(ctx) {
      const {
        listSubbots,
        isSubbotRunning,
        isSubbotRegistered,
      } = await import('../lib/subbots.js');
      const list = listSubbots();
      if (!list.length) {
        await ctx.reply(
          `🤖 *BOTS REGISTRADOS*\n\n📊 Total: *0*\n\n💡 Crea uno con *${ctx.prefix}code 503XXXXXXXX*`,
        );
        return;
      }
      const runningCount = list.filter((s) => isSubbotRunning(s.number)).length;
      const registeredCount = list.filter((s) => isSubbotRegistered(s.number)).length;
      const lines = list.map((s) => {
        const running = isSubbotRunning(s.number);
        const linked = isSubbotRegistered(s.number);
        return `${running ? '🟢' : '⚪'} *${s.name}* · +${s.number}${linked ? ' ✅' : ' ⏳'}${s.jid ? `\n   🆔 ${s.jid}` : ''}`;
      });
      await ctx.reply(
        `🤖 *BOTS REGISTRADOS*\n\n` +
          `📊 Total: *${list.length}*\n` +
          `🟢 Activos: *${runningCount}*\n` +
          `✅ Vinculados: *${registeredCount}*\n\n` +
          `${lines.join('\n\n')}\n\n` +
          `🟢 Activo · ⚪ Detenido · ✅ Vinculado · ⏳ Sin vincular`,
      );
    },
  },
  {
    name: 'delsubbot',
    aliases: ['delsub', 'removesubbot'],
    category: 'owner',
    desc: 'Elimina un subbot y borra su sesión.',
    usage: 'delsubbot <número>',
    owner: true,
    async execute(ctx) {
      const number = String(ctx.args[0] || '').replace(/\D/g, '');
      if (!number) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}delsubbot* 503XXXXXXXX`);
        return;
      }
      const { findSubbot, removeSubbot } = await import('../lib/subbots.js');
      const record = findSubbot(number);
      if (!record) {
        await ctx.reply(`ℹ️ No existe un subbot con el número *+${number}*.`);
        return;
      }
      await removeSubbot(number);
      await ctx.reply(`🗑️ Subbot *${record.name}* (+${number}) eliminado.\n\nSu sesión fue borrada.`);
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
    name: 'leave',
    aliases: ['salir'],
    category: 'owner',
    desc: 'Hace que el bot salga del grupo actual o de un grupo indicado.',
    usage: 'leave',
    owner: true,
    group: true,
    async execute(ctx) {
      await ctx.reply('👋 *ZENITSU BOT se despide.*\n\n_Respiración del Trueno, retirada._');
      await sleep(800);
      await ctx.sock.groupLeave(ctx.chat);
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
