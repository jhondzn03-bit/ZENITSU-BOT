import {
  channelAutoUpdates,
  getChannelInfo,
  getChannelJid,
  sendToChannel,
  setChannel,
  setChannelAutoUpdates,
} from '../lib/channel.js';
import { db, save } from '../lib/db.js';
import { extractInviteCode } from '../lib/spam.js';
import { jidToNumber, sleep, toJid, withWatermark } from '../lib/utils.js';
import { getGroupMetadata, invalidateGroupMeta, trackSent } from '../lib/state.js';
import { sendStickerBatch } from '../lib/stickers.js';

// ─── Stickers aleatorios ──────────────────────────────────────────────────
// La lógica de envío real vive en lib/stickers.js (se reutiliza para mandar
// al canal o a un grupo por link cuando el bot ya es admin).

// ── .stickercanal <link de grupo> ──────────────────────────────────────────
// El bot entra al grupo (si no está); si no es admin pide "hazme admin" y
// deja el trabajo pendiente: en cuanto lo asciendan, avisa en el grupo y
// manda los stickers DE VERDAD. Si ya es admin, avisa y los manda al toque.
async function sendStickersToLinkedGroup(ctx, link, count) {
  const code = extractInviteCode(link);
  if (!code) {
    await ctx.reply(
      withWatermark(
        '❌ Ese link de grupo no es válido.\n\n💡 Copia el enlace completo: https://chat.whatsapp.com/...',
      ),
    );
    return;
  }

  await ctx.reply(withWatermark('🔎 *REVISANDO EL GRUPO...*'));

  // Nombre del grupo (si WhatsApp deja consultarlo).
  let info = null;
  try {
    info = await ctx.sock.groupGetInviteInfo(code);
  } catch {}

  // ¿Ya estoy dentro? (por id o por nombre).
  let group = null;
  try {
    const groups = await ctx.sock.groupFetchAllParticipating();
    if (info?.id) group = groups?.[info.id] || null;
    const wanted = String(info?.subject || '').trim().toLowerCase();
    if (!group && wanted) {
      group =
        Object.values(groups || {}).find(
          (g) => String(g?.subject || '').trim().toLowerCase() === wanted,
        ) || null;
    }
  } catch {}

  // Entrar con el link.
  if (!group) {
    let lastErr = null;
    for (let attempt = 1; attempt <= 3 && !group; attempt++) {
      try {
        const jid = await ctx.sock.groupAcceptInvite(code);
        group = { id: jid, subject: info?.subject || '' };
      } catch (err) {
        lastErr = err;
        const msg = String(err?.message || '');
        if (/already|conflict|409/i.test(msg)) {
          try {
            const groups = await ctx.sock.groupFetchAllParticipating();
            const wanted = String(info?.subject || '').trim().toLowerCase();
            group =
              (wanted &&
                Object.values(groups || {}).find(
                  (g) => String(g?.subject || '').trim().toLowerCase() === wanted,
                )) ||
              null;
          } catch {}
          break;
        }
        if (attempt < 3) await sleep(1500 * attempt);
      }
    }
    if (!group) {
      await ctx.reply(
        withWatermark(
          `❌ No pude unirme al grupo.\n\n` +
            (lastErr ? `▸ ${String(lastErr.message || lastErr)}\n\n` : '') +
            `💡 Verifica que el link siga activo.`,
        ),
      );
      return;
    }
  }

  const groupJid = group.id;
  const groupName = group.subject || info?.subject || 'el grupo';

  // Espera corta: si .autoadmin está prendido, el bot puede ascenderse solo
  // justo al entrar. Se revisa la metadata fresca después.
  await sleep(2500);
  invalidateGroupMeta(groupJid);
  const meta = await getGroupMetadata(ctx.sock, groupJid).catch(() => null);
  const botNum = jidToNumber(ctx.sock.user?.id);
  const botLidRaw = toJid(ctx.sock.user?.lid);
  const botLidNumber = botLidRaw
    ? jidToNumber(botLidRaw.endsWith('@lid') ? botLidRaw : `${botLidRaw.replace(/\D/g, '')}@lid`)
    : '';
  const me = (meta?.participants || []).find((p) => {
    const ids = [p?.id, p?.lid, p?.phoneNumber, p?.pn]
      .filter(Boolean)
      .map(jidToNumber);
    return ids.includes(botNum) || (botLidNumber && ids.includes(botLidNumber));
  });
  const isAdmin = me?.admin === 'admin' || me?.admin === 'superadmin';

  if (!isAdmin) {
    // Pedir admin en el grupo y dejar el trabajo pendiente.
    const data = db();
    if (!data.pendingStickerJobs || typeof data.pendingStickerJobs !== 'object') {
      data.pendingStickerJobs = {};
    }
    data.pendingStickerJobs[groupJid] = { count, at: Date.now() };
    save();
    try {
      const sent = await ctx.sock.sendMessage(groupJid, {
        text: withWatermark(
          `⚡ *ZENITSU BOT* ⚡\n\n` +
            `👑 *Hazme admin* y te mando *${count} stickers* de verdad.\n\n` +
            `_En cuanto me asciendan, aviso aquí y empiezo a mandarlos._`,
        ),
      });
      trackSent(sent);
    } catch {}
    await ctx.reply(
      withWatermark(
        `👑 *PIDIENDO ADMIN EN ${groupName}*\n\n` +
          `▸ Ya entré al grupo y pedí que me hagan admin\n` +
          `▸ Cuando me asciendan, aviso en el grupo y mando los *${count} stickers* de verdad`,
      ),
    );
    return;
  }

  // Ya soy admin: avisar en el grupo y mandar de verdad.
  try {
    const sent = await ctx.sock.sendMessage(groupJid, {
      text: withWatermark(`⚡ *Ya soy admin.* Mandando los *${count} stickers* que prometí... 🌩️`),
    });
    trackSent(sent);
  } catch {}
  await ctx.reply(withWatermark(`⏳ Mandando *${count} stickers* a *${groupName}*...`));

  const r = await sendStickerBatch(ctx.sock, groupJid, count, {
    onProgress: async (sent, total) => {
      if (sent % 10 === 0 && sent < total) {
        try {
          await ctx.reply(`📤 *${sent}/${total}* stickers enviados al grupo...`);
        } catch {}
      }
    },
  });

  if (r.noImages) {
    await ctx.reply(withWatermark('❌ No pude obtener imágenes para convertir en stickers.'));
    return;
  }

  await ctx.reply(
    withWatermark(
      `✅ *STICKERS ENVIADOS A ${groupName}*\n\n` +
        `📤 Enviados de verdad: *${r.sent}/${count}*\n` +
        (r.skipped ? `🔁 Repetidos omitidos: *${r.skipped}*\n` : '') +
        (r.failed ? `⚠️ Fallidos: *${r.failed}*\n` : ''),
    ),
  );
}



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
    name: 'canalsticker',
    aliases: ['stickercanal', 'canalstickers', 'subirstickers', 'stickersalcanal'],
    category: 'owner',
    desc: 'Manda stickers aleatorios de verdad: al canal o a un grupo por su link (pidiendo admin primero).',
    usage: 'canalsticker [cantidad] [link de grupo]',
    owner: true,
    async execute(ctx) {
      const link =
        (ctx.args || []).find((a) => /chat\.whatsapp\.com\//i.test(String(a))) || '';
      const rawCount = Number.parseInt(
        (ctx.args || []).find((a) => /^\d+$/.test(String(a))) || '',
        10,
      );
      const count = Math.min(50, Math.max(1, Number.isFinite(rawCount) ? rawCount : 50));

      // ── Destino: link de grupo (pidiendo admin) o el canal del bot ──────
      if (link) {
        await sendStickersToLinkedGroup(ctx, link, count);
        return;
      }

      const jid = await getChannelJid(ctx.sock).catch(() => null);
      if (!jid) {
        await ctx.reply(
          withWatermark(
            `⚠️ No hay canal configurado.\n\n💡 Configúralo con *${ctx.prefix}canal set <enlace>*`,
          ),
        );
        return;
      }

      await ctx.reply(
        withWatermark(
          `⏳ *PREPARANDO ${count} STICKERS...*\n\n` +
            `Buscando imágenes aleatorias y convirtiéndolas. Puede tardar un poco.`,
        ),
      );

      const r = await sendStickerBatch(ctx.sock, jid, count, {
        onProgress: async (sent, total) => {
          if (sent % 10 === 0 && sent < total) {
            await ctx.reply(`📤 *${sent}/${total}* stickers subidos al canal...`);
          }
        },
      });

      if (r.noImages) {
        await ctx.reply(
          withWatermark('❌ No pude obtener imágenes para convertir en stickers. Inténtalo de nuevo.'),
        );
        return;
      }

      if (!r.sent) {
        await ctx.reply(
          withWatermark(
            `⚠️ No pude subir stickers nuevos.\n\n` +
              (r.skipped ? `🔁 Repetidos omitidos: *${r.skipped}*\n` : '') +
              (r.failed ? `❌ Fallidos: *${r.failed}*\n` : '') +
              `\n💡 Vuelve a intentarlo en unos segundos.`,
          ),
        );
        return;
      }

      await ctx.reply(
        withWatermark(
          `✅ *STICKERS SUBIDOS AL CANAL*\n\n` +
            `📤 Enviados de verdad: *${r.sent}*\n` +
            (r.skipped ? `🔁 Repetidos omitidos: *${r.skipped}*\n` : '') +
            (r.failed ? `⚠️ Fallidos: *${r.failed}*\n` : '') +
            `\n_Los stickers se enviaron solos, sin el banner «Reenviado desde…»._`,
        ),
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
