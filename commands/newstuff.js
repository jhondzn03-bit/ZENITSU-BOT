import {
  addReminder,
  humanDuration,
  listReminders,
  parseDuration,
  removeReminder,
} from '../lib/reminders.js';
import { fetchBuffer, truncate, withWatermark } from '../lib/utils.js';

// ─── Comandos de la tanda de actualizaciones ─────────────────────────────
// .remind  — recordatorios programados persistentes
// .steam   — búsqueda de juegos en Steam (precio y puntaje)
// .nowa    — averigua si un número tiene WhatsApp
// .readmore — texto oculto tras "leer más"

export default [
  {
    name: 'remind',
    aliases: ['recordar', 'recordatorio', 'alarm'],
    category: 'tools',
    desc: 'Te recuerda algo después de un tiempo (30m, 2h, 1d...). Sobrevive reinicios.',
    usage: 'remind <10m|2h|1d> <texto> | remind list | remind del <id>',
    async execute(ctx) {
      const sub = String(ctx.args[0] || '').toLowerCase();

      if (!sub) {
        await ctx.reply(
          withWatermark(
            `⏰ *RECORDATORIOS*\n\n` +
              `▸ *${ctx.prefix}remind 30m tomar agua* — te aviso en 30 minutos\n` +
              `▸ *${ctx.prefix}remind 2h reunión* — en 2 horas\n` +
              `▸ *${ctx.prefix}remind 1d entregar tarea* — mañana a esta hora\n` +
              `▸ *${ctx.prefix}remind list* — ver tus recordatorios activos\n` +
              `▸ *${ctx.prefix}remind del 2* — cancelar el número 2\n\n` +
              `_Acepta combinaciones: 1h30m = 1 hora y 30 minutos._\n` +
              `_Si el bot se reinicia, no se pierden._`,
          ),
        );
        return;
      }

      if (sub === 'list' || sub === 'lista') {
        const mine = listReminders(ctx.sender).filter((r) => r.remaining > -10000);
        if (!mine.length) {
          await ctx.reply(withWatermark('📭 No tienes recordatorios activos.\n\n_Crea uno con_ *.remind 30m texto*'));
          return;
        }
        const list = mine
          .map(
            (r) =>
              `▸ *#${r.id}* — ${truncate(r.text, 60)}\n` +
              `   ⏳ falta ${humanDuration(Math.max(r.remaining, 0))}`,
          )
          .join('\n');
        await ctx.reply(
          withWatermark(`⏰ *TUS RECORDATORIOS (${mine.length})*\n\n${list}\n\n_Cancela con_ *${ctx.prefix}remind del <id>*`),
        );
        return;
      }

      if (sub === 'del' || sub === 'rm' || sub === 'cancelar') {
        const id = Number(String(ctx.args[1] || '').replace(/\D/g, ''));
        const removed = id ? removeReminder(id, ctx.sender) : null;
        if (!removed) {
          await ctx.reply(withWatermark(`❌ No encontré ese recordatorio tuyo.\n\n_Revisa con_ *${ctx.prefix}remind list*`));
          return;
        }
        await ctx.reply(withWatermark(`🗑️ Recordatorio *#${removed.id}* cancelado.\n\n_${truncate(removed.text, 60)}_`));
        return;
      }

      // .remind 30m texto
      const durationMs = parseDuration(ctx.rawArgs);
      if (!durationMs) {
        await ctx.reply(
          withWatermark(
            `❌ No entendí el tiempo.\n\n` +
              `💡 Ejemplo: *${ctx.prefix}remind 30m tomar agua*\n` +
              `_Unidades: s (segundos), m (minutos), h (horas), d (días)_`,
          ),
        );
        return;
      }
      // El texto es todo lo que sigue al tiempo.
      const text = ctx.rawArgs
        .replace(/^\S+\s*/, '') // quita "remind"
        .replace(/^\d+\s*(s|m|h|d)(\d+\s*(s|m|h|d))*\s*/i, '') // quita "1h30m"
        .trim();
      if (!text) {
        await ctx.reply(withWatermark(`💡 Falta el texto: *${ctx.prefix}remind 30m tomar agua*`));
        return;
      }
      const entry = addReminder(ctx.chat, ctx.sender, durationMs, text);
      await ctx.reply(
        withWatermark(
          `⏰ *RECORDATORIO CREADO (#${entry.id})*\n\n` +
            `📝 ${text}\n⏳ Te aviso en *${humanDuration(durationMs)}*\n\n` +
            `_Si lo pediste en un grupo, también te escribo al privado._`,
        ),
      );
    },
  },
  {
    name: 'steam',
    aliases: ['steamsearch', 'juegos'],
    category: 'tools',
    desc: 'Busca juegos en Steam con precio y puntaje.',
    usage: 'steam <nombre del juego>',
    async execute(ctx) {
      const query = ctx.text?.trim();
      if (!query) {
        await ctx.reply(withWatermark(`💡 Uso: *${ctx.prefix}steam God of War*`));
        return;
      }
      await ctx.react('⏳');
      try {
        const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(query)}&cc=us&l=en`;
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) throw new Error('Steam no respondió');
        const data = await res.json();
        const items = (data.items || []).slice(0, 5);
        if (!items.length) {
          await ctx.reply(withWatermark(`📭 Sin resultados para *${query}* en Steam.`));
          return;
        }
        const lines = items
          .map((g) => {
            const price = g.price
              ? g.price.final === 0
                ? 'GRATIS'
                : `$${(g.price.final / 100).toFixed(2)}`
              : 'no disponible';
            const score = g.metascore ? ` · 🎯 ${g.metascore}/100` : '';
            return `▸ *${g.name}*\n   💰 ${price}${score}`;
          })
          .join('\n');
        // Portada del primer resultado (si se puede descargar).
        try {
          const img = items[0].tiny_image || '';
          if (img) {
            const buffer = await fetchBuffer(img, {}, 15000);
            await ctx.send({
              image: buffer,
              caption: withWatermark(`🎮 *STEAM — "${query}"*\n\n${lines}\n\n🔗 https://store.steampowered.com/app/${items[0].id}`),
            });
            return;
          }
        } catch {}
        await ctx.reply(withWatermark(`🎮 *STEAM — "${query}"*\n\n${lines}\n\n🔗 https://store.steampowered.com/app/${items[0].id}`));
      } catch (err) {
        await ctx.reply(withWatermark(`❌ No pude buscar en Steam ahora (${err.message || err}).\n_Intenta de nuevo en un momento._`));
      }
    },
  },
  {
    name: 'nowa',
    aliases: ['whatsappcheck', 'wpcheck', 'esanumero'],
    category: 'tools',
    desc: 'Averigua si un número tiene WhatsApp.',
    usage: 'nowa <número>',
    async execute(ctx) {
      const raw = String(ctx.text || '').replace(/\D/g, '');
      if (!raw || raw.length < 7) {
        await ctx.reply(
          withWatermark(`💡 Uso: *${ctx.prefix}nowa 50312345678*\n\n_Con código de país, sin espacios ni +_`),
        );
        return;
      }
      try {
        const [result] = await ctx.sock.onWhatsApp(`${raw}@s.whatsapp.net`);
        if (!result) {
          await ctx.reply(withWatermark(`❓ *+${raw}* — no pude verificarlo ahora.`));
          return;
        }
        await ctx.reply(
          withWatermark(
            result.exists
              ? `✅ *+${raw}* SÍ tiene WhatsApp.\n\nwa.me/${raw}`
              : `🚫 *+${raw}* NO tiene WhatsApp.`,
          ),
        );
      } catch {
        await ctx.reply(withWatermark(`❓ No pude verificar *+${raw}* ahora mismo. Inténtalo de nuevo.`));
      }
    },
  },
  {
    name: 'readmore',
    aliases: ['leermas', 'leermás', 'vermas'],
    category: 'tools',
    desc: 'Oculta texto largo detrás de un botón "leer más".',
    usage: 'readmore <texto corto> | <texto oculto>',
    async execute(ctx) {
      const raw = ctx.text || '';
      if (!raw.includes('|')) {
        await ctx.reply(
          withWatermark(
            `💡 Uso: *${ctx.prefix}readmore texto corto | texto largo oculto*\n\n` +
              `Se envía con un botón de "leer más" que oculta la parte larga.`,
          ),
        );
        return;
      }
      const [visible, hidden = ''] = raw.split('|');
      // Truco "leer más": relleno invisible (U+200E) que hace que WhatsApp
      // colapse el mensaje tras el primer bloque.
      const padding = String.fromCharCode(8206).repeat(4001);
      await ctx.send({
        text: `${visible.trim()}${padding}${hidden.trim()}`,
      });
    },
  },
];
