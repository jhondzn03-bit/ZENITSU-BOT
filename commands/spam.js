import {
  extractAllInviteCodes,
  extractInviteCode,
  joinSpamGroup,
  listSpamGroups,
  removeSpamGroup,
  setSpamIntervalMinutes,
  setSpamMessage,
  spamSendOnce,
  spamStatus,
  startSpam,
  stopSpam,
} from '../lib/spam.js';

// ─── .spam — anuncios y fila de enlaces ───────────────────────────────────
// Lo principal: pegas UNA fila de enlaces de grupo y el bot entra a TODOS,
// uno por uno, con pausa para no disparar los límites de WhatsApp.

const BATCH_DELAY_MS = 4000; // pausa entre grupo y grupo

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function helpText(prefix) {
  const status = spamStatus();
  const groups = listSpamGroups();
  const list = groups.length
    ? groups.map((g, i) => `  ${i + 1}. ${g.name}`).join('\n')
    : '  _(ninguno todavía)_';

  return (
    `📣 *SPAM — ANUNCIOS DE ZENITSU*\n\n` +
    `▸ Estado: ${status.enabled ? '🟢 ACTIVO' : status.persisted ? '🟡 detenido (configurado)' : '🔴 apagado'}\n` +
    `▸ Grupos: *${groups.length}*\n` +
    `▸ Cada: *${status.intervalMinutes} minuto(s)*\n` +
    `▸ Mensaje: ${status.message ? `_"${status.message.slice(0, 70)}"_` : '_(sin configurar)_'}\n\n` +
    `📋 *GRUPOS*\n${list}\n\n` +
    `⚙️ *CÓMO SE USA*\n` +
    `▸ ${prefix}spam <enlace> — entra a un grupo y lo guarda\n` +
    `▸ ${prefix}spam <enlace> <enlace> <enlace>… — 🔥 entra a TODOS de una\n` +
    `▸ ${prefix}spam msg <texto> — fija el mensaje a enviar\n` +
    `▸ ${prefix}spam start — arranca el envío automático\n` +
    `▸ ${prefix}spam stop — lo detiene (todo queda guardado)\n` +
    `▸ ${prefix}spam now — envía una vez ahora mismo\n` +
    `▸ ${prefix}spam list — ver los grupos\n` +
    `▸ ${prefix}spam remove <nº|enlace> — quitar un grupo\n` +
    `▸ ${prefix}spam interval <min> — cambiar la frecuencia\n\n` +
    `⚠️ _Muy seguido puede hacer que WhatsApp bloquee el número._`
  );
}

export default [
  {
    name: 'spam',
    aliases: ['spamgrupos', 'autopost', 'anuncios'],
    category: 'owner',
    desc: 'Anuncios automáticos: pega una fila de enlaces y entra a todos los grupos.',
    usage: 'spam <enlace…> | msg | start | stop | now | list | remove | interval',
    owner: true,

    async execute(ctx) {
      const raw = String(ctx.rawArgs || '').trim();
      const sub = String(ctx.args[0] || '').toLowerCase();
      const rest = raw.split(/\s+/).slice(1).join(' ').trim();
      const prefix = ctx.prefix;

      // Sin argumentos o ayuda/estado.
      if (!sub || ['ayuda', 'help', 'status', 'estado', 'info'].includes(sub)) {
        await ctx.reply(helpText(prefix));
        return;
      }

      // ── stop ────────────────────────────────────────────────────────────
      if (['stop', 'off', 'detener', 'parar', 'pause'].includes(sub)) {
        stopSpam();
        await ctx.reply(
          `🛑 *ANUNCIOS DETENIDOS*\n\n` +
            `Los grupos y el mensaje quedaron guardados.\n` +
            `▸ Reanuda con *${prefix}spam start*`,
        );
        return;
      }

      // ── start ───────────────────────────────────────────────────────────
      if (['start', 'on', 'iniciar', 'arrancar', 'go'].includes(sub)) {
        try {
          const minutes = startSpam(ctx.sock, { immediate: false });
          const status = spamStatus();
          await ctx.reply(
            `🟢 *ANUNCIOS ACTIVADOS*\n\n` +
              `▸ Grupos: *${status.groups}*\n` +
              `▸ Cada: *${minutes} minuto(s)*\n` +
              `▸ Mensaje: ${status.message ? `_"${status.message.slice(0, 70)}"_` : '❌ falta'}\n\n` +
              `_El primer envío saldrá en unos segundos._\n` +
              `▸ Detén con *${prefix}spam stop*`,
          );
        } catch (err) {
          await ctx.reply(`❌ No pude arrancar: ${err.message}`);
        }
        return;
      }

      // ── now ─────────────────────────────────────────────────────────────
      if (['now', 'ahora', 'enviar', 'prueba', 'test'].includes(sub)) {
        try {
          await ctx.reply('📤 Enviando a todos los grupos...');
          const result = await spamSendOnce(ctx.sock);
          const ok = result?.sent ?? 0;
          const fail = result?.failed?.length ?? 0;
          await ctx.reply(
            `📊 *ENVÍO REALIZADO*\n\n` +
              `✅ Enviados: *${ok}*\n` +
              (fail ? `❌ Fallidos: *${fail}*\n` : '') +
              `\n▸ Sigue automático con *${prefix}spam start*`,
          );
        } catch (err) {
          await ctx.reply(`❌ ${err.message}`);
        }
        return;
      }

      // ── msg ─────────────────────────────────────────────────────────────
      if (['msg', 'mensaje', 'texto'].includes(sub)) {
        if (!rest) {
          await ctx.reply(
            `✍️ *FIJAR MENSAJE*\n\n` +
              `▸ *${prefix}spam msg Hola, únete a mi canal:*\n` +
              `https://whatsapp.com/channel/…\n\n` +
              `_Puedes usar varias líneas: todo el texto se guarda._`,
          );
          return;
        }
        setSpamMessage(rest);
        await ctx.reply(
          `✅ *MENSAJE GUARDADO*\n\n_"${rest.slice(0, 120)}"_\n\n` +
            `▸ Arranca con *${prefix}spam start*`,
        );
        return;
      }

      // ── list ────────────────────────────────────────────────────────────
      if (['list', 'lista', 'grupos'].includes(sub)) {
        const groups = listSpamGroups();
        if (!groups.length) {
          await ctx.reply(
            `📭 *SIN GRUPOS*\n\n` +
              `Pega uno o varios enlaces:\n` +
              `▸ *${prefix}spam https://chat.whatsapp.com/…*`,
          );
          return;
        }
        await ctx.reply(
          `📋 *GRUPOS GUARDADOS (${groups.length})*\n\n` +
            groups.map((g, i) => `${i + 1}. *${g.name}*\n   ${g.jid}`).join('\n\n'),
        );
        return;
      }

      // ── remove ──────────────────────────────────────────────────────────
      if (['remove', 'rm', 'quitar', 'del', 'delete'].includes(sub)) {
        if (!rest) {
          await ctx.reply(`Uso: *${prefix}spam remove <número o enlace>*`);
          return;
        }
        const removed = removeSpamGroup(rest);
        await ctx.reply(
          removed
            ? `🗑️ *ELIMINADO:* ${removed.name}\n▸ Quedan ${listSpamGroups().length} grupo(s)`
            : `❌ No encontré ese grupo. Mira la lista con *${prefix}spam list*`,
        );
        return;
      }

      // ── interval ────────────────────────────────────────────────────────
      if (['interval', 'intervalo', 'cada', 'frecuencia'].includes(sub)) {
        try {
          const minutes = setSpamIntervalMinutes(rest);
          stopSpam();
          await ctx.reply(
            `⏱️ *INTERVALO GUARDADO:* cada *${minutes} minuto(s)*\n\n` +
              `_Los anuncios quedaron detenidos. Reanuda con_ *${prefix}spam start*`,
          );
        } catch (err) {
          await ctx.reply(`❌ ${err.message}`);
        }
        return;
      }

      // ── FILA DE ENLACES (lo principal) ──────────────────────────────────
      const codes = extractAllInviteCodes(raw);
      if (codes.length) {
        // Un solo enlace: respuesta corta.
        if (codes.length === 1) {
          try {
            await ctx.reply('⏳ Entrando al grupo...');
            const { jid, name, repeated } = await joinSpamGroup(ctx.sock, raw);
            await ctx.reply(
              `${repeated ? 'ℹ️ *YA ESTABA EN LA LISTA*' : '✅ *GRUPO AGREGADO*'}\n\n` +
                `📣 *${name}*\n🆔 ${jid}\n\n` +
                `▸ Total: *${listSpamGroups().length}* grupo(s)\n` +
                `▸ Siguiente: fija el mensaje con *${prefix}spam msg <texto>*`,
            );
          } catch (err) {
            await ctx.reply(`❌ ${err.message}`);
          }
          return;
        }

        // Varios enlaces: entrar a todos con reporte final.
        await ctx.reply(
          `🔥 *FILA DETECTADA:* ${codes.length} enlaces\n\n` +
            `_Entro a todos en orden, uno cada ${BATCH_DELAY_MS / 1000}s..._`,
        );

        const added = [];
        const already = [];
        const failed = [];

        for (let i = 0; i < codes.length; i++) {
          try {
            const { name, repeated } = await joinSpamGroup(ctx.sock, codes[i]);
            if (repeated) already.push(name);
            else added.push(name);
          } catch (err) {
            failed.push(`▸ ${codes[i].slice(0, 10)}… — ${String(err.message).slice(0, 45)}`);
          }
          if (i < codes.length - 1) {
            await ctx.reply(`📥 _Grupo ${i + 2} de ${codes.length}..._`);
            await sleep(BATCH_DELAY_MS);
          }
        }

        const lines = [`📊 *RESULTADO DE LA FILA (${codes.length})*`, ''];
        lines.push(`✅ *Nuevos: ${added.length}*`);
        if (added.length) lines.push(added.map((n) => `   ▸ ${n}`).join('\n'));
        if (already.length) {
          lines.push(`ℹ️ *Ya estaban: ${already.length}*`);
          lines.push(already.map((n) => `   ▸ ${n}`).join('\n'));
        }
        if (failed.length) {
          lines.push(`❌ *Fallidos: ${failed.length}*`);
          lines.push(failed.join('\n'));
        }
        lines.push('', `📋 Total en la lista: *${listSpamGroups().length}* grupo(s)`);
        lines.push(`🚀 Arranca el envío con *${prefix}spam start*`);

        await ctx.reply(lines.join('\n'));
        return;
      }

      // Enlace suelto que no cumplió el patrón exacto (por si viene partido).
      if (extractInviteCode(raw)) {
        try {
          await ctx.reply('⏳ Entrando al grupo...');
          const { jid, name, repeated } = await joinSpamGroup(ctx.sock, raw);
          await ctx.reply(
            `${repeated ? 'ℹ️ Ya estaba en la lista.' : '✅ Grupo agregado.'}\n\n` +
              `📣 *${name}*\n🆔 ${jid}\n▸ Total: *${listSpamGroups().length}*`,
          );
        } catch (err) {
          await ctx.reply(`❌ ${err.message}`);
        }
        return;
      }

      await ctx.reply(
        `❓ No entendí *${sub}*.\n\n` +
          `▸ Mira todo con *${prefix}spam*\n` +
          `▸ O pega enlaces: *${prefix}spam <enlace> <enlace> …*`,
      );
    },
  },
];
