import {
  extractAllInviteCodes,
  listSpamGroups,
  removeSpamGroup,
  setSpamMessage,
  spamStatus,
} from '../lib/spam.js';

export default [
  {
    name: 'spam',
    aliases: ['spamgrupos', 'autopost', 'broadcast2'],
    category: 'owner',
    desc: 'Gestiona destinos autorizados para anuncios.',
    usage: 'spam <enlaces|list|msg|remove>',
    owner: true,

    async execute(ctx) {
      const raw = String(ctx.rawArgs || '');
      const sub = String(ctx.args[0] || '').toLowerCase();
      const rest = raw.split(/\s+/).slice(2).join(' ').trim();

      if (!sub || sub === 'list' || sub === 'lista') {
        const groups = listSpamGroups();
        const status = spamStatus();

        await ctx.reply(
          `📣 *ANUNCIOS ZENITSU*\n\n` +
          `▸ Destinos registrados: ${groups.length}\n` +
          `▸ Envíos automáticos: desactivados\n\n` +
          (groups.length
            ? groups.map((g, i) => `${i + 1}. ${g.name}`).join('\n')
            : 'No hay destinos registrados.') +
          `\n\n*USO:*\n` +
          `▸ ${ctx.prefix}spam <enlaces>\n` +
          `▸ ${ctx.prefix}spam list\n` +
          `▸ ${ctx.prefix}spam msg <texto>\n` +
          `▸ ${ctx.prefix}spam remove <número>`
        );
        return;
      }

      if (sub === 'msg' || sub === 'mensaje') {
        if (!rest) {
          await ctx.reply(`Uso: ${ctx.prefix}spam msg <texto>`);
          return;
        }

        setSpamMessage(rest);
        await ctx.reply('✅ Anuncio guardado.');
        return;
      }

      if (sub === 'remove' || sub === 'rm') {
        if (!rest) {
          await ctx.reply(`Uso: ${ctx.prefix}spam remove <número>`);
          return;
        }

        const removed = removeSpamGroup(rest);
        await ctx.reply(
          removed
            ? `🗑️ Destino eliminado: ${removed.name}`
            : '❌ No encontré ese destino.'
        );
        return;
      }

      const codes = extractAllInviteCodes(raw);

      if (!codes.length) {
        await ctx.reply(
          `❌ No encontré enlaces de invitación.\n\n` +
          `Pega los enlaces debajo de:\n${ctx.prefix}spam`
        );
        return;
      }

      const existing = listSpamGroups();
      const known = new Set(existing.map(g => g.inviteCode).filter(Boolean));
      const newCodes = codes.filter(code => !known.has(code));

      await ctx.reply(
        `📋 *ENLACES DETECTADOS*\n\n` +
        `▸ Enlaces encontrados: ${codes.length}\n` +
        `▸ Ya registrados: ${codes.length - newCodes.length}\n\n` +
        `Los enlaces quedan pendientes de autorización. ` +
        `No se entrará automáticamente a los grupos ni se enviarán mensajes.`
      );
    }
  }
];
