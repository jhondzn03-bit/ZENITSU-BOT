import {
  channelAutoUpdates,
  getChannelInfo,
  getChannelJid,
  sendToChannel,
  setChannel,
  setChannelAutoUpdates,
} from '../lib/channel.js';
import { withWatermark } from '../lib/utils.js';

// ─── .canal: publica en el canal de WhatsApp del bot ──────────────────────
// El owner configura su canal UNA vez con .canal set <enlace> y el bot
// publica ahí las actualizaciones de cada arranque (o lo que se le mande).
export default [
  {
    name: 'canal',
    aliases: ['channel', 'newsletter'],
    category: 'owner',
    desc: 'Publica mensajes en el canal del bot (actualizaciones automáticas al arrancar).',
    usage: 'canal <texto> | canal set <enlace> | canal on/off | canal info',
    owner: true,
    async execute(ctx) {
      const sub = String(ctx.args[0] || '').toLowerCase();

      // ── Estado general ──
      if (!sub) {
        const jid = await getChannelJid(ctx.sock).catch(() => null);
        const auto = channelAutoUpdates();
        await ctx.reply(
          withWatermark(
            `📢 *CANAL DEL BOT*\n\n` +
              `▸ Estado: ${jid ? '✅ configurado' : '🔴 sin configurar'}\n` +
              `▸ Auto-actualizaciones: ${auto ? '🟢 activadas' : '🔴 desactivadas'}\n` +
              (jid ? `▸ JID: ${jid}\n` : '') +
              `\n*USO:*\n` +
              `▸ *${ctx.prefix}canal* <texto> — publica un mensaje\n` +
              `▸ *${ctx.prefix}canal set* <enlace> — configura tu canal\n` +
              `▸ *${ctx.prefix}canal on/off* — auto-actualizaciones al arrancar\n` +
              `▸ *${ctx.prefix}canal info* — datos del canal`,
          ),
        );
        return;
      }

      // ── Configurar canal ──
      if (sub === 'set' || sub === 'config' || sub === 'configurar') {
        const link = ctx.rawArgs.split(/\s+/).slice(2).join(' ').trim() || ctx.rawArgs.trim();
        if (!link || !link.includes('channel')) {
          await ctx.reply(
            withWatermark(`💡 Uso: *${ctx.prefix}canal set* https://whatsapp.com/channel/0029Vb...`),
          );
          return;
        }
        try {
          await ctx.reply('⏳ Verificando el canal...');
          const { jid, name } = await setChannel(ctx.sock, link);
          await ctx.reply(
            withWatermark(`✅ *CANAL CONFIGURADO*\n\n▸ Nombre: ${name || '(sin nombre)'}\n🆔 ${jid}\n\nCada vez que arranque publicaré las actualizaciones ahí.\n_Desactívalo con_ *${ctx.prefix}canal off*`),
          );
        } catch (err) {
          await ctx.reply(withWatermark(`❌ ${err.message || err}`));
        }
        return;
      }

      // ── Auto-actualizaciones on/off ──
      if (sub === 'on' || sub === 'off') {
        const value = setChannelAutoUpdates(sub === 'on');
        const jid = await getChannelJid(ctx.sock).catch(() => null);
        if (!jid) {
          await ctx.reply(withWatermark(`⚠️ Aún no hay canal configurado. Usa *${ctx.prefix}canal set <enlace>*`));
          return;
        }
        await ctx.reply(
          withWatermark(
            value
              ? `🟢 *AUTO-ACTUALIZACIONES ACTIVADAS*\n\nPublicaré las novedades en el canal en cada arranque.`
              : `🔴 *AUTO-ACTUALIZACIONES DESACTIVADAS*\n\nYa no publicaré solo; sigue mandando con *${ctx.prefix}canal <texto>*`,
          ),
        );
        return;
      }

      // ── Info del canal ──
      if (sub === 'info' || sub === 'datos') {
        const jid = await getChannelJid(ctx.sock).catch(() => null);
        if (!jid) {
          await ctx.reply(withWatermark(`⚠️ No hay canal configurado. Usa *${ctx.prefix}canal set <enlace>*`));
          return;
        }
        try {
          const meta = await ctx.sock.newsletterMetadata('id', jid);
          const thread = meta?.thread_metadata || meta?.threadMetadata || {};
          const name = thread?.name?.text || thread?.name || meta?.name || '(sin nombre)';
          const subs = thread?.subscribers_count || thread?.subscribersCount || meta?.subscribers;
          await ctx.reply(
            withWatermark(
              `📢 *INFO DEL CANAL*\n\n▸ Nombre: ${name}\n▸ Seguidores: ${subs ?? '?'}\n▸ JID: ${jid}`,
            ),
          );
        } catch (err) {
          await ctx.reply(withWatermark(`❌ No pude leer la info del canal (${err.message || err}).`));
        }
        return;
      }

      // ── Publicar texto ──
      const text = ctx.rawArgs.split(/\s+/).slice(1).join(' ').trim();
      if (!text) {
        await ctx.reply(withWatermark(`💡 Escribe el texto a publicar: *${ctx.prefix}canal* Hola a todos ⚡`));
        return;
      }
      const ok = await sendToChannel(ctx.sock, text);
      await ctx.reply(
        ok
          ? withWatermark(`📢 *Publicado en el canal.* ✅`)
          : withWatermark(`❌ No pude publicar (¿el canal está configurado?). Usa *${ctx.prefix}canal set <enlace>*`),
      );
    },
  },
  {
    name: 'setcanal',
    aliases: ['canalset', 'configurarcanal', 'cambiarcanal', 'nuevocanal'],
    category: 'owner',
    desc: 'Cambia el canal que aparece en el banner "Reenviado desde…" de los mensajes.',
    usage: 'setcanal https://whatsapp.com/channel/0029Vb...',
    owner: true,
    async execute(ctx) {
      const link = ctx.args.join(' ').trim();

      // Sin enlace: muestra el canal actual y cómo cambiarlo.
      if (!link) {
        const info = getChannelInfo();
        await ctx.reply(
          withWatermark(
            `📢 *CANAL ACTUAL*\n\n` +
              `▸ Nombre: ${info.name || '(sin nombre)'}\n` +
              `▸ JID: ${info.jid || '(sin configurar)'}\n` +
              `▸ Código: ${info.invite || '(ninguno)'}\n\n` +
              `💡 Cámbialo con:\n*${ctx.prefix}setcanal https://whatsapp.com/channel/0029Vb...*\n\n` +
              `_Ese canal aparecerá en el banner "⮩ Reenviado desde…" de todos los mensajes._`,
          ),
        );
        return;
      }

      await ctx.reply('⏳ *Verificando el canal...*');
      try {
        const { jid, name } = await setChannel(ctx.sock, link);
        await ctx.reply(
          withWatermark(
            `✅ *CANAL ACTUALIZADO*\n\n` +
              `▸ Nombre: ${name || '(sin nombre)'}\n` +
              `▸ JID: ${jid}\n\n` +
              `Desde ahora todos los mensajes llevarán el banner:\n` +
              `⮩ _Reenviado desde ${name || 'el canal'}_\n\n` +
              `💡 Compruébalo con *${ctx.prefix}canal info*.`,
          ),
        );
      } catch (err) {
        await ctx.reply(
          withWatermark(
            `❌ No pude cambiar el canal: ${err.message || err}\n\n` +
              `💡 Asegúrate de que sea un enlace tipo:\nhttps://whatsapp.com/channel/0029Vb...`,
          ),
        );
      }
    },
  },
];
