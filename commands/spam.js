import {
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

// ─── .spam: envío programado de mensajes a grupos ──────────────────────────
// El bot entra a los grupos por su enlace y les envía el mensaje configurado
// cada 2 minutos (o los que se fijen). Todo queda guardado en la DB.
export default [
  {
    name: 'spam',
    aliases: ['spamgrupos', 'autopost', 'broadcast2'],
    category: 'owner',
    desc: 'Envía un mensaje a los grupos de la lista cada 2 minutos (ver .spam ayuda).',
    usage: 'spam <enlace|msg|start|stop|list|remove|now|interval>',
    owner: true,
    async execute(ctx) {
      const sub = String(ctx.args[0] || '').toLowerCase();
      // rawArgs = "spam msg el texto" → rest salta "spam" y el subcomando.
      const rest = ctx.rawArgs.split(/\s+/).slice(2).join(' ').trim();

      // Sin argumentos: muestra el estado actual + ayuda corta.
      if (!sub) {
        const status = spamStatus();
        const groups = listSpamGroups();
        const list = groups.length
          ? groups.map((g, i) => `${i + 1}. ${g.name}`).join('\n')
          : '(ninguno — agrega con .spam <enlace del grupo>)';
        await ctx.reply(
          `📣 *SPAM PROGRAMADO*\n\n` +
            `▸ Estado: ${status.enabled ? '🟢 ACTIVO' : status.persisted ? '🟡 detenido (configurado)' : '🔴 apagado'}\n` +
            `▸ Grupos: ${status.groups}\n` +
            `▸ Cada: ${status.intervalMinutes} minuto(s)\n` +
            `▸ Mensaje: ${status.message ? `_\"${status.message.slice(0, 80)}\"_` : '(sin configurar)'}\n\n` +
            `*GRUPOS:*\n${list}\n\n` +
            `*USO:*\n` +
            `▸ ${ctx.prefix}spam <enlace> — une al grupo y lo agrega\n` +
            `▸ ${ctx.prefix}spam msg <texto> — fija el mensaje\n` +
            `▸ ${ctx.prefix}spam start / stop — iniciar / detener\n` +
            `▸ ${ctx.prefix}spam now — enviar ya una vez\n` +
            `▸ ${ctx.prefix}spam remove <nº|enlace> — quitar grupo\n` +
            `▸ ${ctx.prefix}spam interval <min> — cambiar frecuencia\n\n` +
            `⚠️ Enviar cada 2 min puede hacer que WhatsApp baneé el número.`,
        );
        return;
      }

      switch (sub) {
        case 'ayuda':
        case 'help': {
          await ctx.reply(
            `📣 *SPAM — ayuda completa*\n\n` +
              `1. ${ctx.prefix}spam https://chat.whatsapp.com/XXX — el bot entra al grupo y lo agrega a la lista\n` +
              `2. ${ctx.prefix}spam msg Hola, únete a mi canal — fija el mensaje que se enviará\n` +
              `3. ${ctx.prefix}spam start — comienza el envío cada 2 minutos\n` +
              `4. ${ctx.prefix}spam stop — lo detiene (grupos y mensaje quedan guardados)\n\n` +
              `Extra: ${ctx.prefix}spam now (prueba inmediata), ${ctx.prefix}spam list, ` +
              `${ctx.prefix}spam remove <nº>, ${ctx.prefix}spam interval <minutos>`,
          );
          return;
        }

        case 'msg':
        case 'mensaje':
        case 'texto': {
          if (!rest) {
            await ctx.reply(`💡 Uso: *${ctx.prefix}spam msg* el texto que se enviará a los grupos`);
            return;
          }
          setSpamMessage(rest);
          await ctx.reply(
            `✅ *Mensaje guardado*\n\n_"${rest.slice(0, 300)}"_\n\n` +
              `Inicia el envío con *${ctx.prefix}spam start*`,
          );
          return;
        }

        case 'start':
        case 'on':
        case 'iniciar': {
          try {
            const minutes = startSpam(ctx.sock);
            await ctx.reply(
              `🟢 *SPAM INICIADO*\n\n📣 Grupos: ${listSpamGroups().length}\n⏱️ Cada ${minutes} minuto(s)\n\n` +
                `Se envió la primera tanda ahora mismo.\nDetén con *${ctx.prefix}spam stop*`,
            );
          } catch (err) {
            await ctx.reply(`❌ ${err.message}`);
          }
          return;
        }

        case 'stop':
        case 'off':
        case 'detener':
        case 'pause': {
          stopSpam();
          await ctx.reply(
            `🔴 *SPAM DETENIDO*\n\nLa lista de grupos y el mensaje quedan guardados.\nReanuda con *${ctx.prefix}spam start*`,
          );
          return;
        }

        case 'now':
        case 'ya':
        case 'test': {
          const store = listSpamGroups();
          if (!store.length) {
            await ctx.reply(`❌ No hay grupos. Agrega uno con *${ctx.prefix}spam <enlace>*`);
            return;
          }
          await ctx.reply('📨 Enviando ahora a todos los grupos...');
          const { sent, failed } = await spamSendOnce(ctx.sock);
          await ctx.reply(
            `📨 *Envío manual terminado*\n\n✅ Enviados: ${sent}${failed.length ? `\n❌ Fallidos (quitados de la lista): ${failed.length}` : ''}`,
          );
          return;
        }

        case 'list':
        case 'lista':
        case 'grupos': {
          const groups = listSpamGroups();
          if (!groups.length) {
            await ctx.reply(`📭 No hay grupos en la lista.\n\nAgrega con *${ctx.prefix}spam <enlace del grupo>*`);
            return;
          }
          const status = spamStatus();
          const list = groups
            .map((g, i) => `${i + 1}. *${g.name}*\n   ${g.jid}`)
            .join('\n');
          await ctx.reply(
            `📋 *GRUPOS DE SPAM (${groups.length})* — ${status.enabled ? '🟢 activo' : '🔴 detenido'}\n\n${list}\n\n` +
              `Quita uno con *${ctx.prefix}spam remove <nº>*`,
          );
          return;
        }

        case 'remove':
        case 'rm':
        case 'quitar': {
          if (!rest) {
            await ctx.reply(`💡 Uso: *${ctx.prefix}spam remove* 1   (o el enlace del grupo)`);
            return;
          }
          const removed = removeSpamGroup(rest);
          if (!removed) {
            await ctx.reply(`❌ No encontré ese grupo en la lista. Revisa con *${ctx.prefix}spam list*`);
            return;
          }
          await ctx.reply(`🗑️ Grupo *${removed.name}* quitado.\n\nQuedan ${listSpamGroups().length}.`);
          return;
        }

        case 'interval':
        case 'intervalo':
        case 'cada': {
          if (!rest) {
            await ctx.reply(`💡 Uso: *${ctx.prefix}spam interval* 5   (minutos, entre 1 y 1440)`);
            return;
          }
          try {
            const minutes = setSpamIntervalMinutes(rest);
            const status = spamStatus();
            if (status.enabled) startSpam(ctx.sock, { immediate: false }); // reinicia con el nuevo ritmo
            await ctx.reply(`⏱️ Frecuencia actualizada: cada *${minutes} minuto(s)*.`);
          } catch (err) {
            await ctx.reply(`❌ ${err.message}`);
          }
          return;
        }

        default: {
          // .spam <enlace de grupo> — el uso principal.
          if (extractInviteCode(ctx.rawArgs)) {
            try {
              await ctx.reply('⏳ Entrando al grupo...');
              const { jid, name, repeated } = await joinSpamGroup(ctx.sock, ctx.rawArgs.trim());
              await ctx.reply(
                `${repeated ? 'ℹ️ Ese grupo ya estaba en la lista.' : '✅ *GRUPO AGREGADO*'}\n\n` +
                  `📣 ${name}\n🆔 ${jid}\n\nTotal: ${listSpamGroups().length} grupo(s)\n\n` +
                  `Fija el mensaje con *${ctx.prefix}spam msg <texto>* y arranca con *${ctx.prefix}spam start*`,
              );
            } catch (err) {
              await ctx.reply(`❌ ${err.message}`);
            }
            return;
          }
          await ctx.reply(
            `❓ Subcomando no válido: *${sub}*\n\nUsa *${ctx.prefix}spam ayuda* para ver todo lo que hace.`,
          );
        }
      }
    },
  },
];
