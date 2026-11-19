import { withWatermark } from '../lib/utils.js';
import {
  addDeltaDomain,
  allowedDeltaDomains,
  inspectDeltaLink,
  removeDeltaDomain,
  setDeltaDomains,
} from '../lib/delta.js';

const SIGN = '>  ByJhon!';

function successText(result) {
  const lines = [
    '🔑 *DELTA KEY*',
    `🔗 Estado: ${result.status}`,
    `🔐 Key: ${result.key || '(aún no disponible)'}`,
    '',
    '📋 *CÓMO COMPLETAR LA VERIFICACIÓN OFICIAL*',
    '1️⃣ Abre el enlace oficial en tu navegador (usa el enlace que me enviaste).',
    '2️⃣ Completa TÚ la verificación de esa página: CAPTCHA, anuncios obligatorios y controles de acceso.',
    '3️⃣ Cuando el sitio te muestre la clave, cópiala desde la página oficial.',
  ];
  if (result.protected && !result.key) {
    lines.push('', '⚠️ El sitio tiene una protección de acceso activa. El bot NO la salta: haz la verificación en tu navegador.');
  }
  lines.push('', SIGN);
  return withWatermark(lines.join('\n'));
}

function invalidText(domains) {
  return withWatermark(
    [
      '❌ *ENLACE NO VÁLIDO*',
      '',
      'Solo acepto enlaces HTTPS de los dominios oficiales de Delta Executor:',
      ...domains.map((d) => `▸ ${d}`),
      '',
      'Ejemplo: *.delta https://delta.app/...*',
      '',
      SIGN,
    ].join('\n'),
  );
}

export default [
  {
    name: 'delta',
    aliases: ['deltakey', 'verificardelta'],
    category: 'tools',
    desc: 'Revisa un enlace oficial de verificación de Delta Executor y devuelve la clave si la página pública la muestra.',
    usage: 'delta <link oficial>',
    async execute(ctx) {
      const raw = ctx.args.join(' ').trim();
      if (!raw) {
        await ctx.reply(
          withWatermark(
            [
              '🔑 *DELTA KEY*',
              '',
              'Uso: *.delta <link oficial de verificación>*',
              '',
              'El bot solo abre la página públicamente, comprueba el estado y muestra la clave SI el sitio oficial la expone. No pide datos privados y no salta CAPTCHA ni anuncios.',
              '',
              SIGN,
            ].join('\n'),
          ),
        );
        return;
      }

      const domains = allowedDeltaDomains();
      let result;
      try {
        result = await inspectDeltaLink(raw, domains);
      } catch (err) {
        await ctx.reply(
          withWatermark(
            `⚠️ No pude comprobar el enlace: ${err?.message || 'error desconocido'}\n\n${SIGN}`,
          ),
        );
        return;
      }

      if (!result.ok) {
        if (result.reason === 'network') {
          await ctx.reply(
            withWatermark(
              `⚠️ No pude abrir la página oficial (${result.detail || 'sin conexión'}).\n\nIntenta de nuevo en unos segundos.\n\n${SIGN}`,
            ),
          );
          return;
        }
        await ctx.reply(invalidText(domains));
        return;
      }

      await ctx.reply(successText(result));
    },
  },
  {
    name: 'deltadomain',
    aliases: ['deltadominio'],
    category: 'owner',
    desc: 'Administra los dominios oficiales aceptados por .delta.',
    usage: 'deltadomain add <dominio> | del <dominio> | list | reset',
    owner: true,
    async execute(ctx) {
      const sub = String(ctx.args[0] || '').toLowerCase();
      const domain = ctx.args.slice(1).join(' ').trim();

      if (sub === 'add' || sub === 'agregar') {
        const added = addDeltaDomain(domain);
        await ctx.reply(
          added
            ? `✅ Dominio *${added}* agregado a la lista oficial de .delta.\n\nDominios: ${allowedDeltaDomains().join(', ')}`
            : '❌ Dominio no válido. Ejemplo: *.deltadomain add delta.app*',
        );
        return;
      }

      if (sub === 'del' || sub === 'deldominio' || sub === 'remove' || sub === 'quitar') {
        if (!domain) {
          await ctx.reply('❌ Uso: *.deltadomain del <dominio>*');
          return;
        }
        removeDeltaDomain(domain);
        await ctx.reply(`🗑️ Dominio *${domain}* quitado.\n\nDominios: ${allowedDeltaDomains().join(', ')}`);
        return;
      }

      if (sub === 'reset' || sub === 'limpiar') {
        setDeltaDomains([]);
        await ctx.reply(`♻️ Lista personalizada limpia. Dominios activos: ${allowedDeltaDomains().join(', ')}`);
        return;
      }

      await ctx.reply(
        `🌐 *DOMINIOS OFICIALES DE .delta*\n\n${allowedDeltaDomains().map((d) => `▸ ${d}`).join('\n')}\n\n` +
          `▸ *.deltadomain add <dominio>*\n▸ *.deltadomain del <dominio>*\n▸ *.deltadomain reset*`,
      );
    },
  },
];
