import {
  channelAutoUpdates,
  extractChannelCode,
  getChannelInfo,
  getChannelJid,
  getStickerTargets,
  isNewsletterJid,
  resolveChannelTarget,
  sendToChannel,
  setChannel,
  setChannelAutoUpdates,
} from '../lib/channel.js';
import { db, save } from '../lib/db.js';
import { extractInviteCode } from '../lib/spam.js';
import { jidToNumber, sleep, toJid, withWatermark } from '../lib/utils.js';
import { getGroupMetadata, invalidateGroupMeta, trackSent } from '../lib/state.js';
import { collectImageUrls, sendStickerBatch } from '../lib/stickers.js';

// ─── Stickers aleatorios ──────────────────────────────────────────────────
// La lógica de envío real vive en lib/stickers.js (se reutiliza para mandar
// al canal o a un grupo por link cuando el bot ya es admin).

// ── Envío a uno o varios canales ───────────────────────────────────────────
// Junta las imágenes UNA vez y las reutiliza en todos los canales destino:
// así los dos canales reciben los mismos stickers y no se descarga doble.
async function sendStickersToChannels(ctx, jids, count) {
  const targets = [...new Set((jids || []).filter(Boolean))];
  if (!targets.length) return;

  const label = (jid) => {
    const info = getChannelInfo();
    return info.jid === jid && info.name ? `${info.name} (${jid})` : jid;
  };

  await ctx.reply(
    withWatermark(
      `⏳ *PREPARANDO ${count} STICKERS...*\n\n` +
        `📢 Canales destino: *${targets.length}*\n` +
        targets.map((j) => `▸ ${label(j)}`).join('\n') +
        `\n\n_El bot debe ser administrador en cada canal._` +
        `\n_Buscando imágenes y convirtiéndolas._`,
    ),
  );

  const candidates = await collectImageUrls(Math.min(240, count * 4));
  if (!candidates.length) {
    await ctx.reply(
      withWatermark('❌ No pude obtener imágenes para convertir en stickers. Inténtalo de nuevo.'),
    );
    return;
  }

  let totalSent = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  const failed = [];

  for (const jid of targets) {
    const r = await sendStickerBatch(ctx.sock, jid, count, { candidates });
    totalSent += r.sent || 0;
    totalSkipped += r.skipped || 0;
    totalFailed += r.failed || 0;
    if (!r.sent) failed.push(jid);
  }

  if (!totalSent) {
    await ctx.reply(
      withWatermark(
        `⚠️ No pude subir stickers nuevos.\n\n` +
          (totalSkipped ? `🔁 Repetidos omitidos: *${totalSkipped}*\n` : '') +
          (totalFailed ? `❌ Fallidos: *${totalFailed}*\n` : '') +
          `\n💡 Vuelve a intentarlo en unos segundos.`,
      ),
    );
    return;
  }

  await ctx.reply(
    withWatermark(
      `✅ *STICKERS SUBIDOS*\n\n` +
        `📢 Canales: *${targets.length}*\n` +
        `📤 Enviados de verdad: *${totalSent}*\n` +
        (totalSkipped ? `🔁 Repetidos omitidos: *${totalSkipped}*\n` : '') +
        (totalFailed ? `⚠️ Fallidos: *${totalFailed}*\n` : '') +
        (failed.length ? `\n❌ Sin envíos en: ${failed.map(label).join(', ')}\n` : '') +
        `\n_Stickers enviados solos, sin el banner «Reenviado desde…»._`,
    ),
  );
}

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
  console.log(`[STICKERS] link de grupo | code=${code} | cantidad=${count}`);

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
        if (!jid) throw new Error('WhatsApp no confirmó la entrada (¿el grupo pide aprobación?)');
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

  if (!group?.id) {
    await ctx.reply(
      withWatermark(
        `❌ No pude obtener el ID del grupo.\n\n💡 Si el grupo pide aprobación para entrar, un admin debe aceptarme primero.`,
      ),
    );
    return;
  }

  const groupJid = group.id;
  const groupName = group.subject || info?.subject || 'el grupo';
  console.log(`[STICKERS] grupo resuelto → ${groupJid} | nombre="${groupName}"`);

  await deliverStickersToGroup(ctx, groupJid, groupName, count, { waitAutoAdmin: true });
}

// Entrega los stickers a un grupo:
//  - Si el bot NO es admin: pide "hazme admin" y deja el trabajo pendiente.
//  - Si YA es admin: avisa en el grupo y manda los stickers de verdad.
// `waitAutoAdmin` espera un poco tras entrar por link, porque .autoadmin
// puede ascender al bot solo en ese momento.
async function deliverStickersToGroup(
  ctx,
  groupJid,
  groupName,
  count,
  { waitAutoAdmin = false } = {},
) {
  if (waitAutoAdmin) {
    // Espera corta: si .autoadmin está prendido, el bot puede ascenderse solo
    // justo al entrar. Se revisa la metadata fresca después.
    await sleep(2500);
  }
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
  // Si el comando se usó dentro del mismo grupo, no duplicamos mensajes:
  // el grupo ya recibe el aviso directo.
  const replyingInGroup = String(ctx.chat || '') === String(groupJid);
  console.log(
    `[STICKERS] bot en ${groupJid} | encontrado=${Boolean(me)} | admin=${isAdmin} (${me?.admin || 'ninguno'})`,
  );

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
    if (!replyingInGroup) {
      await ctx.reply(
        withWatermark(
          `👑 *PIDIENDO ADMIN EN ${groupName}*\n\n` +
            `▸ Ya entré al grupo y pedí que me hagan admin\n` +
            `▸ Cuando me asciendan, aviso en el grupo y mando los *${count} stickers* de verdad`,
        ),
      );
    }
    return;
  }

  // Ya soy admin: avisar en el grupo y mandar de verdad.
  try {
    const sent = await ctx.sock.sendMessage(groupJid, {
      text: withWatermark(`⚡ *Ya soy admin.* Mandando los *${count} stickers* que prometí... 🌩️`),
    });
    trackSent(sent);
  } catch {}
  if (!replyingInGroup) {
    await ctx.reply(withWatermark(`⏳ Mandando *${count} stickers* a *${groupName}*...`));
  }

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
    desc: 'Manda stickers aleatorios DE VERDAD a los canales del bot (por defecto a los dos).',
    usage: 'canalsticker [cantidad] [canal|<ID>|<enlace de canal>|<link de grupo>|grupo]',
    owner: true,
    async execute(ctx) {
      const args = (ctx.args || []).map((a) => String(a).trim()).filter(Boolean);

      const groupLink = args.find((a) => /chat\.whatsapp\.com\//i.test(a)) || '';
      const channelLink = args.find((a) => /whatsapp\.com\/channel\//i.test(a)) || '';
      const channelId = args.find((a) => isNewsletterJid(a)) || '';
      const rawCount = Number.parseInt(args.find((a) => /^\d+$/.test(a)) || '', 10);
      const count = Math.min(50, Math.max(1, Number.isFinite(rawCount) ? rawCount : 20));
      const forceChannels = args.some((a) =>
        /^(canal|canales|channel|channels|todos|todo|ambos|both)$/i.test(a),
      );
      const forceGroup = args.some((a) =>
        /^(grupo|aqui|aquí|este|estegrupo|este-grupo)$/i.test(a),
      );

      console.log(
        `[STICKERS] comando .stickercanal | args=${JSON.stringify(args)} | ` +
          `chat=${ctx.chat} | link=${groupLink || 'NO'} | canal=${channelId || channelLink || 'NO'} | ` +
          `cantidad=${count}`,
      );

      // ── Destino: link de grupo (pidiendo admin), canal concreto o canales ──
      if (groupLink && !forceChannels && !channelLink && !channelId) {
        await sendStickersToLinkedGroup(ctx, groupLink, count);
        return;
      }

      // Por defecto SIEMPRE van a los canales. Para el grupo actual hay que
      // pedirlo explícitamente con "grupo" (o pasar el enlace del grupo).
      if (forceGroup && ctx.isGroup && !channelLink && !channelId) {
        const meta = await getGroupMetadata(ctx.sock, ctx.chat).catch(() => null);
        await deliverStickersToGroup(ctx, ctx.chat, meta?.subject || 'este grupo', count);
        return;
      }

      // Canal concreto por ID o enlace.
      if (channelId || channelLink) {
        let jid = channelId;
        if (!jid) {
          try {
            jid = await resolveChannelTarget(ctx.sock, channelLink);
          } catch (err) {
            await ctx.reply(withWatermark(`❌ ${err?.message || err}`));
            return;
          }
        }
        await sendStickersToChannels(ctx, [jid], count);
        return;
      }

      // Sin destino explícito: TODOS los canales del bot (los dos IDs fijos
      // del owner + el canal configurado, sin duplicados).
      const targets = await getStickerTargets(ctx.sock);
      if (!targets.length) {
        await ctx.reply(
          withWatermark(
            `⚠️ No hay canales destino.\n\n💡 Usa *${ctx.prefix}canalsticker 20 <ID>@newsletter*`,
          ),
        );
        return;
      }
      await sendStickersToChannels(ctx, targets, count);
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
  {
    name: 'checkchannel',
    aliases: ['checkcanal', 'verificarcanal', 'canalcheck', 'infocanal'],
    category: 'tools',
    desc: 'Verifica un canal por su enlace: ID de newsletter, seguidores, estado y datos.',
    usage: 'checkchannel https://whatsapp.com/channel/0029Vb...',
    async execute(ctx) {
      const raw = String(ctx.rawArgs || '').trim();
      const code =
        extractChannelCode(raw) ||
        (raw.split(/\s+/).find((a) => /^[A-Za-z0-9_-]{10,}$/.test(a)) || '') ||
        (raw ? raw : getChannelInfo().invite || '');

      if (!code) {
        await ctx.reply(
          withWatermark(
            `🔎 *VERIFICAR CANAL*\n\n` +
              `▸ Uso: *${ctx.prefix}checkchannel <enlace>*\n` +
              `▸ Ejemplo: *${ctx.prefix}checkchannel https://whatsapp.com/channel/0029Vb...*\n\n` +
              `_Sin enlace reviso el canal configurado del bot._`,
          ),
        );
        return;
      }

      await ctx.reply(withWatermark(`🔎 *Verificando canal...*`));

      let meta;
      try {
        meta = await ctx.sock.newsletterMetadata('invite', code);
      } catch (err) {
        await ctx.reply(
          withWatermark(
            `❌ *CANAL NO VÁLIDO*\n\n` +
              `▸ Código: ${code}\n` +
              `▸ Error: ${err?.message || err}\n\n` +
              `💡 Revisa que el enlace sea de un canal público y esté completo.`,
          ),
        );
        return;
      }

      if (!meta?.id) {
        await ctx.reply(withWatermark(`❌ No encontré ese canal. ¿El enlace está completo?`));
        return;
      }

      const thread = meta.thread_metadata || meta.threadMetadata || meta || {};
      const pick = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== '');
      const textOf = (v) => (typeof v === 'string' ? v : v?.text || v?.id || '');

      const name = textOf(pick(thread.name, meta.name)) || '(sin nombre)';
      const jid = String(pick(meta.id, thread.id) || '');
      const subs = pick(
        thread.subscribers_count,
        thread.subscribersCount,
        meta.subscribers,
        meta.subscribers_count,
      );
      const created = Number(pick(thread.creation_time, meta.creation_time) || 0);
      const invite = String(pick(thread.invite, meta.invite, code) || code);
      const desc = textOf(pick(thread.description, meta.description)).trim();
      const stateRaw = String(
        pick(
          typeof meta.state?.type === 'string' ? meta.state.type : undefined,
          typeof thread.state?.type === 'string' ? thread.state.type : undefined,
          typeof meta.state === 'string' ? meta.state : undefined,
          typeof thread.state === 'string' ? thread.state : undefined,
        ) || '',
      );
      const state =
        stateRaw === 'ACTIVE'
          ? '✅ Activo'
          : stateRaw
            ? `⚠️ ${stateRaw.replace(/_/g, ' ')}`
            : '❔ Desconocido';
      const verified = /VERIFIED/i.test(
        String(pick(thread.verification, meta.verification) || ''),
      );
      const role = String(pick(meta.viewer_metadata?.view_role, thread.viewer_metadata?.view_role) || '');
      const followers =
        subs !== undefined && Number.isFinite(Number(subs))
          ? Number(subs).toLocaleString('es-ES')
          : '?';

      const lines = [
        `🔎 *CANAL VERIFICADO*`,
        '',
        `▸ Nombre: *${name}*`,
        `▸ ID newsletter: \`${jid}\``,
        `▸ Código: \`${invite}\``,
        `▸ Seguidores: *${followers}*`,
        `▸ Estado: ${state}`,
        `▸ Verificado por WhatsApp: ${verified ? '✅ Sí' : '❌ No'}`,
      ];
      if (created) {
        lines.push(
          `▸ Creado: ${new Date(created * 1000).toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })}`,
        );
      }
      if (role) lines.push(`▸ Tu rol: ${role}`);
      if (desc) {
        const clean = desc.replace(/\s+/g, ' ').slice(0, 280);
        lines.push('', `📝 *Descripción:*`, `_${clean}${desc.length > 280 ? '…' : ''}_`);
      }
      lines.push('', `🔗 https://whatsapp.com/channel/${invite}`);
      lines.push('', `_🌩️ Respiración del Trueno._`);

      await ctx.reply(withWatermark(lines.join('\n')));
    },
  },
];
