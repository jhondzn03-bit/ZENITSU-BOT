import { aiText } from '../lib/api.js';
import { routeLocally } from '../lib/router.js';
import { withWatermark } from '../lib/utils.js';

// ─── .opencode: IA que ejecuta comandos en lenguaje natural ───────────────
// El usuario escribe ".opencode bájame la canción despacito", la IA elige
// el comando correcto de la lista (.play despacito) y el bot lo ejecuta
// pasando por TODAS las compuertas normales (owner, admin, grupo…), igual
// que si el usuario lo hubiera escrito él mismo.

// Enfriamiento simple por usuario (la IA tarda ~5s y no debe spamearse).
const COOLDOWN_MS = 10 * 1000;
const cooldowns = new Map();

// Caché de respuestas de la IA: pedidos repetidos no vuelven a consultarla.
const aiCache = new Map();

// Limpia la respuesta de la IA y extrae la línea de comando.
//   "`.play despacito`"  → ".play despacito"
//   "NADA"               → ""
export function extractCommandLine(raw, prefix) {
  let line = String(raw || '')
    .replace(/```[a-z]*|```/gi, '')
    .replace(/[`*]/g, '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)[0] || '';
  line = line.replace(/^["'\s]+|["'\s.,;]+$/g, '');
  if (line.toUpperCase() === 'NADA') return '';
  if (!line.startsWith(prefix)) {
    const i = line.indexOf(prefix);
    if (i > 0) line = line.slice(i);
    else return '';
  }
  // Solo el primer renglón y un largo razonable.
  return line.split('\n')[0].slice(0, 300);
}

// Catálogo compacto de comandos para el prompt, filtrado por permisos.
// Se cachea: el catálogo solo cambia al reiniciar o al cambiar permisos.
const catalogCache = new Map();

function buildCatalog(ctx) {
  const key = `${ctx.prefix}|${ctx.isOwner ? 'owner' : 'user'}|${ctx.commands.length}`;
  const cached = catalogCache.get(key);
  if (cached) return cached;

  const byCategory = new Map();
  for (const cmd of ctx.commands) {
    if (cmd.hidden) continue;
    if (cmd.owner && !ctx.isOwner) continue;
    if (cmd.name === 'opencode') continue; // sin recursión
    if (cmd.category === 'nsfw') continue; // retirados: la IA no los ofrece
    if (!byCategory.has(cmd.category)) byCategory.set(cmd.category, []);
    const desc = String(cmd.desc || '').split(/[.\n]/)[0].slice(0, 34).trim();
    byCategory.get(cmd.category).push(`${ctx.prefix}${cmd.name}${desc ? `(${desc})` : ''}`);
  }

  // Una sola línea por categoría: prompt mucho más corto = IA más rápida.
  const lines = [];
  for (const [cat, items] of byCategory) lines.push(`[${cat}] ${items.join(', ')}`);
  const catalog = lines.join('\n');
  if (catalogCache.size > 8) catalogCache.clear();
  catalogCache.set(key, catalog);
  return catalog;
}

function systemPrompt(prefix) {
  return [
    'Eres el router de IA de ZENITSU BOT (un bot de WhatsApp).',
    `Recibes peticiones en lenguaje natural y respondes SOLO con la línea de comando que la cumple, usando el prefijo "${prefix}".`,
    '',
    'Reglas:',
    '1. Responde UNICAMENTE la línea de comando. Sin explicaciones, sin comillas, sin backticks.',
    '2. Conserva los argumentos: nombres de canciones/videos, números, enlaces, texto entre comillas del usuario.',
    '3. Si el usuario cita un mensaje o imagen, eso ya viaja con el comando (ej: sticker, tomp3 funcionarán sobre lo citado).',
    '4. Traduce abreviaturas y jerga: "bájate esa rola" → play, "ponme el video" → ytmp4 con su enlace, "sticker del que cité" → sticker.',
    '5. Si NINGÚN comando aplica, responde exactamente: NADA',
    '',
    'Ejemplos:',
    'usuario: descargame la cancion despacito',
    `respuesta: ${prefix}play despacito`,
    'usuario: quiero ese video de tiktok https://vm.tiktok.com/xxx',
    `respuesta: ${prefix}tiktok https://vm.tiktok.com/xxx`,
    'usuario: dime el clima de san salvador',
    `respuesta: ${prefix}weather san salvador`,
  ].join('\n');
}

export default [
  {
    name: 'opencode',
    aliases: ['aiexec', 'hazlo', 'automata'],
    category: 'ai',
    desc: 'IA que ejecuta comandos del bot en lenguaje natural (ej: .opencode bájame la canción X).',
    usage: 'opencode <qué quieres que haga>',
    async execute(ctx) {
      const request = String(ctx.text || '').trim();
      if (!request) {
        await ctx.reply(
          withWatermark(
            `🧠 *IA DEL BOT — OPENCODE*\n\n` +
              `Dime qué quieres en tus palabras y yo elijo el comando:\n\n` +
              `▸ *${ctx.prefix}opencode bájame la canción despacito*\n` +
              `▸ *${ctx.prefix}opencode ponle sticker a lo que cité*\n` +
              `▸ *${ctx.prefix}opencode traduce "hola" al inglés*\n\n` +
              `_Funciona con los ${ctx.commands.length} comandos del bot._`,
          ),
        );
        return;
      }

      // Enfriamiento por usuario.
      const now = Date.now();
      const last = cooldowns.get(ctx.sender) || 0;
      if (now - last < COOLDOWN_MS) {
        await ctx.reply(
          withWatermark(`⏳ Espera un momentito, la IA está pensando tu pedido anterior...`),
        );
        return;
      }
      if (cooldowns.size > 100) cooldowns.clear();
      cooldowns.set(ctx.sender, now);

      await ctx.react('🧠');

      // ⚡ 1) Router local: resuelve la mayoría de pedidos al instante,
      //    sin IA y sin gastar el límite de las APIs.
      const local = routeLocally(request, ctx.commandMap, ctx.prefix);
      if (local) {
        await dispatchCommand(ctx, local.line);
        return;
      }

      // 2) Caché de respuestas de la IA (5 min) para pedidos repetidos.
      const cacheKey = String(request).toLowerCase().trim();
      const cachedLine = aiCache.get(cacheKey);
      if (cachedLine && Date.now() - cachedLine.at < 5 * 60 * 1000) {
        const cachedCmd = ctx.commandMap.get(cachedLine.cmd);
        if (cachedCmd && cachedCmd.name !== 'opencode') {
          await dispatchCommand(ctx, cachedLine.line);
          return;
        }
      }

      let answer;
      try {
        answer = await aiText(
          `COMANDOS:\n${buildCatalog(ctx)}\n\nPETICIÓN: ${request}`,
          { system: systemPrompt(ctx.prefix) },
        );
      } catch (err) {
        const msg = String(err?.message || '');
        const friendly = /402|limit|rate/i.test(msg)
          ? `⏳ La IA gratis está saturada (1 consulta cada 45s).\n\n_Escríbelo directo mientras tanto:_\n▸ *${ctx.prefix}play canción*\n▸ *${ctx.prefix}sticker* (respondiendo a una imagen)`
          : `❌ La IA no respondió ahora mismo (${msg || 'sin conexión'}).\n_Inténtalo de nuevo o usa_ *${ctx.prefix}menu*`;
        await ctx.reply(withWatermark(friendly));
        return;
      }

      const line = extractCommandLine(answer, ctx.prefix);
      if (!line) {
        await ctx.reply(
          withWatermark(
            `🤔 La IA no encontró un comando para eso.\n\n` +
              `_${request.slice(0, 100)}_\n\n` +
              `💡 Escríbelo más directo o mira *${ctx.prefix}menu*`,
          ),
        );
        return;
      }

      // Validación antes de despachar.
      const [cmdName] = line.slice(ctx.prefix.length).split(/\s+/);
      const target = ctx.commandMap.get(cmdName.toLowerCase());
      if (!target) {
        await ctx.reply(
          withWatermark(
            `❓ La IA eligió *${line.split(/\s+/)[0]}* pero no existe.\n\n` +
              `💡 Pídeselo con el nombre del comando: *${ctx.prefix}opencode usa ${ctx.prefix}play <canción>*`,
          ),
        );
        return;
      }
      if (target.name === 'opencode') {
        await ctx.reply(withWatermark(`🌀 La IA intentó usarme a mí mismo... eso no. 😄`));
        return;
      }

      await dispatchCommand(ctx, line);
    },
  },
];

// Despacha una línea de comando por el pipeline COMPLETO: el clon del
// mensaje mantiene el chat, el remitente (para permisos) y la cita (para
// comandos que usan lo respondido: sticker, tomp3, etc.).
async function dispatchCommand(ctx, line) {
  await ctx.reply(
    withWatermark(`🧠 *OPENCODE* entendió:\n\n⚡ \`${line}\`\n\n_Ejecutando..._`),
  );

  const { handleMessage } = await import('../handlers/message.js');
  const raw = ctx.msg?.message || {};
  const rawType = Object.keys(raw)[0];
  const originalContext = raw[rawType]?.contextInfo || null;
  const clone = {
    ...ctx.msg,
    key: {
      ...ctx.msg.key,
      id: `OPENCODE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    },
    message: {
      extendedTextMessage: {
        text: line,
        ...(originalContext ? { contextInfo: originalContext } : {}),
      },
    },
  };
  handleMessage(ctx.sock, clone).catch((err) => {
    console.error('[OPENCODE]', err?.message || err);
  });
}
