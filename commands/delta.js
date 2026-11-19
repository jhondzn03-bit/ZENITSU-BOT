import { sleep, withWatermark } from '../lib/utils.js';
import {
  addDeltaDomain,
  allowedDeltaDomains,
  allowedPlatoboostDomains,
  checkPlatoboostKey,
  clearPlatoboostEndpoint,
  getPlatoboostEndpoint,
  inspectDeltaLink,
  parseAllowedHttpsUrl,
  removeDeltaDomain,
  setDeltaDomains,
  setPlatoboostEndpoint,
} from '../lib/delta.js';

const SIGN = '>  ByJhon!';

const REASON = {
  'not-configured': 'no hay un endpoint oficial de Platoboost configurado',
  'invalid-endpoint': 'el endpoint no está en la lista de dominios autorizados',
  timeout: 'se agotó el tiempo de espera (12 s)',
  network: 'sin conexión con Platoboost',
  'redirect-blocked': 'la redirección sale del dominio oficial de Platoboost',
  'verification-required': 'Platoboost pide completar su verificación oficial (CAPTCHA/anuncios)',
  'no-key': 'la interfaz oficial no devolvió ninguna clave',
};

function reasonText(result) {
  if (result.reason === 'network') return `${REASON.network} (${result.detail || 'error de red'})`;
  if (result.reason === 'http') return result.detail || `HTTP ${result.status}`;
  if (result.reason === 'no-key') return REASON['no-key'];
  return REASON[result.reason] || result.detail || 'error desconocido';
}

function finalText(result, isOwner) {
  const lines = ['🔑 *DELTA KEY*'];
  if (result.ok) {
    lines.push('🔗 Estado: Completada', `🔐 Key: ${result.key}`);
  } else {
    lines.push('🔗 Estado: Verificación');
    lines.push(`🔐 Key: (sin resultado: ${reasonText(result)})`);
  }
  lines.push(
    '',
    '📋 *CÓMO CONTINUAR*',
    '▸ Abre el enlace oficial de Platoboost/Delta en tu navegador.',
    '▸ Completa TÚ la verificación: CAPTCHA, anuncios obligatorios y controles de acceso.',
    '▸ Copia la clave que te entregue el sitio oficial. El bot NO la inventa ni la simula.',
  );
  if (!isOwner && result.reason === 'not-configured') {
    lines.push('▸ Pídele al owner que configure el endpoint con *.delta endpoint <url>*.');
  }
  if (isOwner && result.reason === 'not-configured') {
    lines.push('▸ Owner: configura el endpoint con *.delta endpoint <url>*.');
  }
  lines.push('', SIGN);
  return lines.join('\n');
}

function invalidText(domains) {
  return [
    '❌ *ENLACE NO VÁLIDO*',
    '',
    'Solo acepto enlaces HTTPS de dominios oficiales:',
    ...domains.map((d) => `▸ ${d}`),
    '',
    SIGN,
  ].join('\n');
}

async function runStages(ctx, endpoint) {
  await ctx.live({ text: '⚡ Conectando con los servidores de Platoboost...' });
  await sleep(350);
  await ctx.progress('🔎 Verificando solicitud...');
  await sleep(350);
  await ctx.progress('⚡ Procesando enlace de Delta...');
  await sleep(350);
  await ctx.progress('🔑 Consultando disponibilidad de la KEY...');
  return checkPlatoboostKey(endpoint);
}

export default [
  {
    name: 'delta',
    aliases: ['deltakey', 'verificardelta'],
    category: 'tools',
    desc: 'Consulta la KEY de Delta Executor mediante la interfaz oficial autorizada de Platoboost.',
    usage: 'delta | delta <link oficial> | delta endpoint <url> (owner)',
    async execute(ctx) {
      const isOwner = Boolean(ctx.isOwner || ctx.isGlobalOwner);
      const first = String(ctx.args[0] || '').toLowerCase();
      const raw = ctx.args.join(' ').trim();

      // ── Configuración del endpoint autorizado (solo owner) ───────────────
      if (first === 'endpoint' || first === 'api') {
        const value = ctx.args.slice(1).join(' ').trim();
        if (!isOwner) {
          await ctx.reply('🛡️ Solo el owner puede configurar el endpoint de Platoboost.');
          return;
        }
        if (!value || first === 'api') {
          const current = getPlatoboostEndpoint();
          await ctx.reply(
            [
              '🌐 *ENDPOINT DE PLATOBOOST*',
              '',
              `▸ Actual: ${current || '(sin configurar)'}`,
              `▸ Dominios permitidos: ${allowedPlatoboostDomains().join(', ')}`,
              '',
              '▸ *.delta endpoint <https://...>* — guardar',
              '▸ *.delta endpoint off* — quitar',
            ].join('\n'),
          );
          return;
        }
        if (value === 'off' || value === 'reset') {
          clearPlatoboostEndpoint();
          await ctx.reply('♻️ Endpoint de Platoboost quitado.');
          return;
        }
        const saved = setPlatoboostEndpoint(value);
        await ctx.reply(
          saved
            ? `✅ Endpoint guardado: ${saved}\n\nEl bot solo hará peticiones GET a ese dominio autorizado.`
            : `❌ Endpoint no permitido. Debe ser HTTPS y estar en: ${allowedPlatoboostDomains().join(', ')}`,
        );
        return;
      }

      // ── Modo con link: compatible con la versión anterior ───────────────
      if (raw) {
        const platoboost = parseAllowedHttpsUrl(raw, allowedPlatoboostDomains());
        if (platoboost) {
          const result = await runStages(ctx, platoboost.url);
          await ctx.progress(finalText(result, isOwner));
          return;
        }
        const domains = allowedDeltaDomains();
        const parsed = parseAllowedHttpsUrl(raw, domains);
        if (!parsed) {
          await ctx.reply(invalidText([...domains, ...allowedPlatoboostDomains()]));
          return;
        }
        let result;
        try {
          result = await inspectDeltaLink(parsed.url, domains);
        } catch (err) {
          await ctx.reply(`⚠️ No pude comprobar el enlace: ${err?.message || 'error desconocido'}`);
          return;
        }
        if (result.ok && result.key) {
          await ctx.reply(
            ['🔑 *DELTA KEY*', '🔗 Estado: Completada', `🔐 Key: ${result.key}`, '', SIGN].join('\n'),
          );
        } else {
          await ctx.reply(
            [
              '🔑 *DELTA KEY*',
              '🔗 Estado: Verificación',
              '🔐 Key: (aún no disponible)',
              '',
              '▸ Completa la verificación oficial en el enlace y vuelve a consultar.',
              '',
              SIGN,
            ].join('\n'),
          );
        }
        return;
      }

      // ── Flujo normal: .delta sin argumentos ──────────────────────────────
      const endpoint = getPlatoboostEndpoint();
      const result = await runStages(ctx, endpoint);
      await ctx.progress(finalText(result, isOwner));
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
