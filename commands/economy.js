import { randomInt as cryptoInt } from 'node:crypto';
import { config } from '../config.js';
import { db, getUser, save } from '../lib/db.js';
import {
  formatDuration,
  formatNumber,
  jidToNumber,
  levelFromXp,
  pick,
  progressBar,
  randomInt,
  xpForLevel,
} from '../lib/utils.js';
import { getTargetJid, participantJid } from '../lib/targets.js';

const SHOP = {
  pickaxe: { name: '⛏️ Pico de trueno', price: 500, desc: '+50% de recompensa en .mine' },
  rod: { name: '🎣 Caña de trueno', price: 400, desc: '+50% de recompensa en .fish' },
  rifle: { name: '🔫 Rifle de cazador', price: 1000, desc: '+50% de recompensa en .hunt' },
  charm: { name: '🍀 Amuleto de la suerte', price: 1500, desc: '+15% de éxito en .rob' },
  shield: { name: '🛡️ Escudo de cazador', price: 800, desc: 'Protege de un robo' },
};

const ORES = [
  { name: '🪨 Piedra', value: 20 },
  { name: '🪙 Cobre', value: 50 },
  { name: '⚙️ Hierro', value: 90 },
  { name: '🥈 Plata', value: 150 },
  { name: '🥇 Oro', value: 300 },
  { name: '💎 Diamante', value: 600 },
  { name: '🔮 Cristal de trueno', value: 1000 },
];

const FISH = [
  { name: '🐟 Pez común', value: 30 },
  { name: '🐠 Pez tropical', value: 70 },
  { name: '🦐 Camarón', value: 50 },
  { name: '🦀 Cangrejo', value: 90 },
  { name: '🐙 Pulpo', value: 140 },
  { name: '🦈 Tiburón', value: 350 },
  { name: '🐋 Ballena', value: 800 },
];

const ANIMALS = [
  { name: '🐗 Jabalí', value: 60 },
  { name: '🦌 Ciervo', value: 100 },
  { name: '🐺 Lobo', value: 180 },
  { name: '🐻 Oso', value: 300 },
  { name: '🐯 Tigre', value: 500 },
  { name: '🐉 Dragón de trueno', value: 1200 },
];

const JOBS = [
  'Repartiste paquetes bajo la lluvia',
  'Ayudaste en una tienda de ramen',
  'Entrenaste con tu espada todo el día',
  'Cuidaste gatos del vecindario',
  'Vendiste paraguas en una tormenta',
  'Reparaste un tejado',
  'Cantaste en la calle (mal, pero te pagaron)',
  'Encontraste monedas en el sofá',
  'Cortaste leña para una anciana',
  'Repartiste volantes de una tienda de katanas',
];

function cooldown(u, key, ms) {
  const last = Number(u[key] || 0);
  const diff = Date.now() - last;
  if (diff < ms) return ms - diff;
  return 0;
}

function has(u, item) {
  return (u.inventory?.[item] || 0) > 0;
}

function addCoins(u, amount) {
  u.coins = Math.max(0, (u.coins || 0) + amount);
  save();
}

function userLabel(jid) {
  return `+${jidToNumber(jid)}`;
}

/* ───────────────────────── 🎟️ Tokens ZENITSU ─────────────────────────────
 * El owner crea un token con una cantidad de monedas y un tiempo límite.
 * Cualquier usuario lo canjea UNA sola vez. Se guardan en la DB (db().tokens)
 * para que no se pierdan si el bot se reinicia.
 */
const TOKEN_PREFIX = 'ZENITSU';
const TOKEN_TTL = 2 * 60 * 1000; // 2 minutos por defecto
const TOKEN_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin O/0 ni I/1

function tokenStore() {
  const store = db();
  if (!store.tokens || typeof store.tokens !== 'object') store.tokens = {};
  return store.tokens;
}

// Borra tokens viejos: los usados duran 24 h (para avisar "ya fue usado") y
// los expirados sin usar se limpian 1 h después.
function pruneTokens(now = Date.now()) {
  const tokens = tokenStore();
  for (const [code, t] of Object.entries(tokens)) {
    const dead = t.used
      ? now - (t.usedAt || 0) > 24 * 60 * 60 * 1000
      : now - (t.expiresAt || 0) > 60 * 60 * 1000;
    if (dead) delete tokens[code];
  }
}

function nuevoTokenCode() {
  const tokens = tokenStore();
  for (let i = 0; i < 50; i++) {
    let body = '';
    for (let j = 0; j < 6; j++) body += TOKEN_CHARS[cryptoInt(TOKEN_CHARS.length)];
    const code = `${TOKEN_PREFIX}-${body}`;
    if (!tokens[code]) return code;
  }
  return `${TOKEN_PREFIX}-${Date.now().toString(36).toUpperCase()}`;
}

// "30s" · "5m" · "2h" · "2" (minutos). Devuelve ms o null si no es válido.
function parseTokenTime(raw) {
  if (!raw) return TOKEN_TTL;
  const m = /^(\d+)(s|seg|segs|segundos?|m|min|mins|minutos?|h|hr|horas?)?$/i.exec(String(raw).trim());
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = String(m[2] || 'm').toLowerCase();
  const ms = unit.startsWith('s') ? n * 1000 : unit.startsWith('h') ? n * 3600000 : n * 60000;
  if (ms < 5000 || ms > 24 * 60 * 60 * 1000) return null;
  return ms;
}

// Acepta "ZENITSU-ABC123", "zenitsu abc123" o solo "ABC123".
function normalizeToken(raw) {
  const s = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!s) return '';
  const body = s.startsWith(TOKEN_PREFIX) ? s.slice(TOKEN_PREFIX.length) : s;
  return body ? `${TOKEN_PREFIX}-${body}` : '';
}

function tokenClock(ts) {
  try {
    return new Date(ts).toLocaleTimeString('es-SV', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: config.timezone || undefined,
    });
  } catch {
    return '';
  }
}

export default [
  {
    name: 'daily',
    aliases: ['diario', 'reclamar'],
    category: 'economy',
    desc: 'Reclama tu recompensa diaria.',
    usage: 'daily',
    async execute(ctx) {
      const u = getUser(ctx.sender);
      const wait = cooldown(u, 'lastDaily', 24 * 60 * 60 * 1000);
      if (wait) {
        await ctx.reply(`⏳ Ya reclamaste tu recompensa diaria.\n\n▸ Vuelve en: *${formatDuration(wait)}*`);
        return;
      }
      const now = Date.now();
      const withinStreak = now - Number(u.lastDaily || 0) < 48 * 60 * 60 * 1000;
      u.dailyStreak = withinStreak ? (u.dailyStreak || 0) + 1 : 1;
      const base = 500;
      const random = randomInt(0, 200);
      const streakBonus = Math.min(1000, (u.dailyStreak - 1) * 75);
      const total = base + random + streakBonus;
      u.lastDaily = now;
      addCoins(u, total);
      await ctx.reply(
        `🎁 *RECOMPENSA DIARIA*\n\n▸ Base: *${base}* monedas\n▸ Bonus aleatorio: *${random}*\n▸ Racha: *${u.dailyStreak} días* (+${streakBonus})\n\n💰 Total: *${formatNumber(total)} monedas*\n\n💼 Balance: *${formatNumber(u.coins)}*`,
      );
    },
  },
  {
    name: 'work',
    aliases: ['trabajar', 'chamba'],
    category: 'economy',
    desc: 'Trabaja para ganar monedas.',
    usage: 'work',
    async execute(ctx) {
      const u = getUser(ctx.sender);
      const wait = cooldown(u, 'lastWork', 60 * 60 * 1000);
      if (wait) {
        await ctx.reply(`⏳ Estás cansado. Vuelve a trabajar en *${formatDuration(wait)}*.`);
        return;
      }
      const reward = randomInt(80, 280);
      u.lastWork = Date.now();
      addCoins(u, reward);
      await ctx.reply(
        `💼 *TRABAJO*\n\n${pick(JOBS)}.\n\n💰 Ganaste: *${formatNumber(reward)} monedas*\n💼 Balance: *${formatNumber(u.coins)}*`,
      );
    },
  },
  {
    name: 'crime',
    aliases: ['crimen', 'delito'],
    category: 'economy',
    desc: 'Comete un crimen (puede salir mal).',
    usage: 'crime',
    async execute(ctx) {
      const u = getUser(ctx.sender);
      const wait = cooldown(u, 'lastCrime', 2 * 60 * 60 * 1000);
      if (wait) {
        await ctx.reply(`⏳ La policía te está buscando. Espera *${formatDuration(wait)}*.`);
        return;
      }
      u.lastCrime = Date.now();
      const success = Math.random() < 0.6;
      if (success) {
        const reward = randomInt(150, 500);
        addCoins(u, reward);
        await ctx.reply(
          `🕶️ *CRIMEN EXITOSO*\n\nRobaste una tienda y escapaste.\n\n💰 Ganaste: *${formatNumber(reward)} monedas*\n💼 Balance: *${formatNumber(u.coins)}*`,
        );
      } else {
        const fine = Math.min(u.coins || 0, randomInt(50, 200));
        addCoins(u, -fine);
        await ctx.reply(
          `🚔 *TE ATRAPARON*\n\nLa policía te multó.\n\n💸 Perdiste: *${formatNumber(fine)} monedas*\n💼 Balance: *${formatNumber(u.coins)}*`,
        );
      }
    },
  },
  {
    name: 'rob',
    aliases: ['robar', 'atraco'],
    category: 'economy',
    desc: 'Intenta robarle monedas a otro usuario.',
    usage: 'rob @usuario',
    async execute(ctx) {
      const targetJid = getTargetJid(ctx);
      if (!targetJid) {
        await ctx.reply(`💡 Menciona o responde al usuario que quieres robar.`);
        return;
      }
      if (jidToNumber(targetJid) === ctx.senderNumber) {
        await ctx.reply('😅 No puedes robarte a ti mismo.');
        return;
      }
      const u = getUser(ctx.sender);
      const target = getUser(targetJid);
      const wait = cooldown(u, 'lastRob', 3 * 60 * 60 * 1000);
      if (wait) {
        await ctx.reply(`⏳ Estás escondido de la policía. Espera *${formatDuration(wait)}*.`);
        return;
      }
      if ((target.coins || 0) < 100) {
        await ctx.reply('💸 Ese usuario no tiene suficientes monedas para robar.');
        return;
      }
      if (has(target, 'shield')) {
        target.inventory.shield -= 1;
        if (!target.inventory.shield) delete target.inventory.shield;
        save();
        await ctx.reply(`🛡️ @${jidToNumber(targetJid)} usó un *Escudo de cazador* y bloqueó el robo.`, {
          mentions: [targetJid],
        });
        return;
      }
      u.lastRob = Date.now();
      const chance = has(u, 'charm') ? 0.6 : 0.45;
      if (Math.random() < chance) {
        const amount = Math.max(10, Math.floor(target.coins * (randomInt(10, 25) / 100)));
        target.coins -= amount;
        addCoins(u, amount);
        await ctx.send({
          text: `🕶️ *ROBO EXITOSO*\n\nLe robaste *${formatNumber(amount)} monedas* a @${jidToNumber(targetJid)}.\n\n💼 Tu balance: *${formatNumber(u.coins)}*`,
          mentions: [targetJid],
        });
      } else {
        const fine = Math.min(u.coins || 0, randomInt(80, 250));
        addCoins(u, -fine);
        await ctx.reply(
          `🚨 *ROBO FALLIDO*\n\nTe atraparon y pagaste una multa.\n\n💸 Perdiste: *${formatNumber(fine)} monedas*\n💼 Balance: *${formatNumber(u.coins)}*`,
        );
      }
    },
  },
  {
    name: 'pay',
    aliases: ['pagar', 'transferir', 'dar'],
    category: 'economy',
    desc: 'Transfiere monedas a otro usuario.',
    usage: 'pay @usuario <cantidad>',
    async execute(ctx) {
      const targetJid = getTargetJid(ctx);
      const amount = Number(ctx.args.find((a) => /^\d+$/.test(a)));
      if (!targetJid || !Number.isFinite(amount) || amount <= 0) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}pay* @usuario 100`);
        return;
      }
      if (jidToNumber(targetJid) === ctx.senderNumber) {
        await ctx.reply('😅 No puedes pagarte a ti mismo.');
        return;
      }
      const u = getUser(ctx.sender);
      if ((u.coins || 0) < amount) {
        await ctx.reply(`💸 No tienes suficientes monedas.\n\n▸ Tu balance: *${formatNumber(u.coins)}*`);
        return;
      }
      const target = getUser(targetJid);
      u.coins -= amount;
      target.coins = (target.coins || 0) + amount;
      save();
      await ctx.send({
        text: `💸 *TRANSFERENCIA*\n\n▸ De: @${ctx.senderNumber}\n▸ Para: @${jidToNumber(targetJid)}\n▸ Cantidad: *${formatNumber(amount)} monedas*`,
        mentions: [ctx.sender, targetJid],
      });
    },
  },
  {
    name: 'generar',
    aliases: ['gentoken', 'creartoken', 'generartoken', 'nuevotoken'],
    category: 'owner',
    desc: 'Crea un token ZENITSU con monedas y tiempo límite (solo owner).',
    usage: 'generar <monedas> [tiempo]',
    owner: true,
    async execute(ctx) {
      pruneTokens();
      // Se acepta ".generar token 9999" igual que ".generar 9999".
      const args = ctx.args.map((a) => String(a)).filter((a) => !/^tokens?$/i.test(a));
      const idx = args.findIndex((a) => /^\d+$/.test(a));
      const amount = idx >= 0 ? Number(args[idx]) : NaN;
      const timeRaw = idx >= 0 ? args.slice(idx + 1).join('').trim() : '';

      // Sin cantidad: lista de tokens activos + ayuda.
      if (!Number.isFinite(amount) || amount <= 0) {
        const now = Date.now();
        const active = Object.entries(tokenStore())
          .filter(([, t]) => !t.used && (t.expiresAt || 0) > now)
          .sort((a, b) => (a[1].expiresAt || 0) - (b[1].expiresAt || 0));
        const list = active.length
          ? active
              .slice(0, 15)
              .map(
                ([code, t]) =>
                  `▸ *${code}* · ${formatNumber(t.coins)} monedas · quedan ${formatDuration((t.expiresAt || 0) - now)}`,
              )
              .join('\n')
          : '▸ No hay tokens activos.';
        await ctx.reply(
          `🎟️ *TOKENS ZENITSU*\n\n` +
            `▸ Activos: *${active.length}*\n\n${list}\n\n` +
            `💡 Crear: *${ctx.prefix}generar 9999*\n` +
            `💡 Con tiempo: *${ctx.prefix}generar 9999 5m* (por defecto 2 minutos)\n` +
            `💡 Canjear: *${ctx.prefix}canjear ZENITSU-XXXXXX*`,
        );
        return;
      }

      if (amount > 1000000000) {
        await ctx.reply('❌ La cantidad máxima por token es *1,000,000,000* monedas.');
        return;
      }

      const ttl = parseTokenTime(timeRaw);
      if (ttl === null) {
        await ctx.reply(
          `❌ Tiempo inválido: *${timeRaw}*\n\n` +
            `Usa segundos, minutos u horas: *30s*, *5m*, *2h*.\n` +
            `Mínimo 5 segundos, máximo 24 horas.`,
        );
        return;
      }

      const coins = Math.floor(amount);
      const code = nuevoTokenCode();
      const now = Date.now();
      const expiresAt = now + ttl;
      tokenStore()[code] = {
        coins,
        createdAt: now,
        expiresAt,
        createdBy: ctx.senderNumber || '',
        used: false,
        usedBy: null,
        usedAt: 0,
      };
      save();

      const clock = tokenClock(expiresAt);
      await ctx.reply(
        `🎟️ *TOKEN ZENITSU CREADO*\n\n` +
          `▸ Código: *${code}*\n` +
          `▸ Monedas: *${formatNumber(coins)}*\n` +
          `▸ Expira en: *${formatDuration(ttl)}*${clock ? ` (${clock})` : ''}\n\n` +
          `💡 Que lo canjeen con:\n*${ctx.prefix}canjear ${code}*\n\n` +
          `_⏳ Un solo uso. Después de ${formatDuration(ttl)} ya no sirve._`,
      );
    },
  },
  {
    name: 'canjear',
    aliases: ['redeem', 'usartoken', 'canjearcodigo', 'redimirtoken'],
    category: 'economy',
    desc: 'Canjea un token ZENITSU y recibe monedas.',
    usage: 'canjear ZENITSU-XXXXXX',
    async execute(ctx) {
      const code = normalizeToken(ctx.args.join(''));
      if (!code) {
        await ctx.reply(
          `💡 Uso: *${ctx.prefix}canjear ZENITSU-XXXXXX*\n\n` +
            `_Pídele un token al owner del bot._`,
        );
        return;
      }

      pruneTokens();
      const tokens = tokenStore();
      const t = tokens[code];
      if (!t) {
        await ctx.reply(
          `❌ Token *${code}* inválido o expirado.\n\n` +
            `💡 Los tokens duran pocos minutos y se usan una sola vez.`,
        );
        return;
      }
      if (t.used) {
        await ctx.reply(
          `🎟️ Ese token ya fue usado${t.usedBy ? ` por *+${t.usedBy}*` : ''}.\n\n` +
            `💡 Pídele otro al owner.`,
        );
        return;
      }

      const now = Date.now();
      if ((t.expiresAt || 0) <= now) {
        delete tokens[code];
        save();
        await ctx.reply(
          `⌛ El token *${code}* expiró.\n\n` +
            `💡 Pídele uno nuevo al owner.`,
        );
        return;
      }

      const u = getUser(ctx.sender);
      const coins = Math.max(0, Math.floor(t.coins || 0));
      t.used = true;
      t.usedBy = ctx.senderNumber || '';
      t.usedAt = now;
      u.coins = (u.coins || 0) + coins;
      save();

      await ctx.reply(
        `🎟️ *TOKEN CANJEADO*\n\n` +
          `▸ Código: *${code}*\n` +
          `▸ Recibiste: *+${formatNumber(coins)} monedas*\n` +
          `▸ Tu balance: *${formatNumber(u.coins)}*\n\n` +
          `⚡ ¡Gracias por usar ZENITSU BOT!`,
      );
    },
  },
  {
    name: 'balance',
    aliases: ['bal', 'coins', 'dinero', 'cartera'],
    category: 'economy',
    desc: 'Muestra tu balance o el de otro usuario.',
    usage: 'balance [@usuario]',
    async execute(ctx) {
      const jid = ctx.mentioned?.[0] || ctx.quoted?.sender || ctx.sender;
      const u = getUser(jid);
      const level = levelFromXp(u.xp || 0);
      await ctx.send({
        text: [
          '💰 *CARTERA*',
          '',
          `👤 Usuario: @${jidToNumber(jid)}`,
          `▸ Monedas: *${formatNumber(u.coins)}*`,
          `▸ Nivel: *${level}*`,
          `▸ XP: *${formatNumber(u.xp)}*`,
          `▸ Inventario: *${Object.keys(u.inventory || {}).length} objetos*`,
        ].join('\n'),
        mentions: [jid],
      });
    },
  },
  {
    name: 'top',
    aliases: ['topcoins', 'ranking', 'ricos'],
    category: 'economy',
    desc: 'Ranking de los más ricos (solo quien usa el bot aquí).',
    usage: 'top',
    async execute(ctx) {
      let entries = Object.entries(db().users || {});
      // En un grupo: SOLO miembros de este grupo que han usado el bot.
      // (el ranking global mostraría gente de otros grupos: "personas externas")
      if (ctx.isGroup && ctx.groupMeta?.participants?.length) {
        const members = new Set(
          ctx.groupMeta.participants.map((p) => participantJid(p)).filter(Boolean),
        );
        entries = entries.filter(([jid]) => members.has(jid));
      }
      const users = entries
        .filter(([, u]) => (u.coins || 0) > 0)
        .map(([jid, u]) => ({ jid, coins: u.coins || 0 }))
        .sort((a, b) => b.coins - a.coins)
        .slice(0, 10);
      if (!users.length) {
        await ctx.reply('📊 Aún no hay usuarios con monedas por aquí.');
        return;
      }
      const medals = ['🥇', '🥈', '🥉'];
      const list = users
        .map((u, i) => `${medals[i] || `${i + 1}.`} ${userLabel(u.jid)} — *${formatNumber(u.coins)}*`)
        .join('\n');
      const scope = ctx.isGroup ? ' · este grupo' : '';
      await ctx.reply(`🏆 *TOP 10 MÁS RICOS${scope.toUpperCase()}*\n\n${list}\n\n_Solo cuenta la gente que usa el bot ⚡_`);
    },
  },
  {
    name: 'topxp',
    aliases: ['toplevel', 'rankingxp'],
    category: 'economy',
    desc: 'Ranking por experiencia (solo quien usa el bot aquí).',
    usage: 'topxp',
    async execute(ctx) {
      let entries = Object.entries(db().users || {});
      // En un grupo: SOLO miembros de este grupo que han usado el bot.
      if (ctx.isGroup && ctx.groupMeta?.participants?.length) {
        const members = new Set(
          ctx.groupMeta.participants.map((p) => participantJid(p)).filter(Boolean),
        );
        entries = entries.filter(([jid]) => members.has(jid));
      }
      const users = entries
        .filter(([, u]) => (u.xp || 0) > 0)
        .map(([jid, u]) => ({ jid, xp: u.xp || 0 }))
        .sort((a, b) => b.xp - a.xp)
        .slice(0, 10);
      if (!users.length) {
        await ctx.reply('📊 Aún no hay usuarios con experiencia.');
        return;
      }
      const medals = ['🥇', '🥈', '🥉'];
      const list = users
        .map((u, i) => `${medals[i] || `${i + 1}.`} ${userLabel(u.jid)} — *Nv.${levelFromXp(u.xp)}* (${formatNumber(u.xp)} XP)`)
        .join('\n');
      await ctx.reply(`⚡ *TOP 10 POR EXPERIENCIA*\n\n${list}`);
    },
  },
  {
    name: 'level',
    aliases: ['rank', 'nivel', 'xp'],
    category: 'economy',
    desc: 'Muestra tu nivel y progreso de experiencia.',
    usage: 'level [@usuario]',
    async execute(ctx) {
      const jid = ctx.mentioned?.[0] || ctx.quoted?.sender || ctx.sender;
      const u = getUser(jid);
      const level = levelFromXp(u.xp || 0);
      const currentBase = xpForLevel(level);
      const nextBase = xpForLevel(level + 1);
      const progress = (u.xp || 0) - currentBase;
      const needed = nextBase - currentBase;
      await ctx.send({
        text: [
          '⚡ *NIVEL DE CAZADOR*',
          '',
          `👤 @${jidToNumber(jid)}`,
          `▸ Nivel: *${level}*`,
          `▸ XP: *${formatNumber(u.xp)}*`,
          `▸ Progreso: ${progressBar(progress, needed, 12)}`,
          `▸ Siguiente nivel: *${formatNumber(Math.max(0, nextBase - (u.xp || 0)))} XP*`,
        ].join('\n'),
        mentions: [jid],
      });
    },
  },
  {
    name: 'mine',
    aliases: ['minar', 'mina'],
    category: 'economy',
    desc: 'Mina minerales para ganar monedas.',
    usage: 'mine',
    async execute(ctx) {
      const u = getUser(ctx.sender);
      const wait = cooldown(u, 'lastMine', 30 * 60 * 1000);
      if (wait) {
        await ctx.reply(`⏳ Tu pico está descansando. Vuelve en *${formatDuration(wait)}*.`);
        return;
      }
      u.lastMine = Date.now();
      const ore = pick(ORES);
      const multiplier = has(u, 'pickaxe') ? 1.5 : 1;
      const reward = Math.floor(ore.value * multiplier * (0.8 + Math.random() * 0.4));
      addCoins(u, reward);
      await ctx.reply(
        `⛏️ *MINERÍA*\n\nEncontraste: *${ore.name}*\n${multiplier > 1 ? '⛏️ Bonus de pico: *+50%*\n' : ''}\n💰 Ganaste: *${formatNumber(reward)} monedas*\n💼 Balance: *${formatNumber(u.coins)}*`,
      );
    },
  },
  {
    name: 'fish',
    aliases: ['pescar', 'pesca'],
    category: 'economy',
    desc: 'Pesca para ganar monedas.',
    usage: 'fish',
    async execute(ctx) {
      const u = getUser(ctx.sender);
      const wait = cooldown(u, 'lastFish', 20 * 60 * 1000);
      if (wait) {
        await ctx.reply(`⏳ Los peces se escondieron. Vuelve en *${formatDuration(wait)}*.`);
        return;
      }
      u.lastFish = Date.now();
      const fish = pick(FISH);
      const multiplier = has(u, 'rod') ? 1.5 : 1;
      const reward = Math.floor(fish.value * multiplier * (0.8 + Math.random() * 0.4));
      addCoins(u, reward);
      await ctx.reply(
        `🎣 *PESCA*\n\nAtrapaste: *${fish.name}*\n${multiplier > 1 ? '🎣 Bonus de caña: *+50%*\n' : ''}\n💰 Ganaste: *${formatNumber(reward)} monedas*\n💼 Balance: *${formatNumber(u.coins)}*`,
      );
    },
  },
  {
    name: 'hunt',
    aliases: ['cazar', 'caza'],
    category: 'economy',
    desc: 'Caza animales para ganar monedas.',
    usage: 'hunt',
    async execute(ctx) {
      const u = getUser(ctx.sender);
      const wait = cooldown(u, 'lastHunt', 30 * 60 * 1000);
      if (wait) {
        await ctx.reply(`⏳ Estás descansando de la cacería. Vuelve en *${formatDuration(wait)}*.`);
        return;
      }
      u.lastHunt = Date.now();
      const animal = pick(ANIMALS);
      const multiplier = has(u, 'rifle') ? 1.5 : 1;
      const reward = Math.floor(animal.value * multiplier * (0.8 + Math.random() * 0.4));
      addCoins(u, reward);
      await ctx.reply(
        `🏹 *CAZA*\n\nCazaste: *${animal.name}*\n${multiplier > 1 ? '🔫 Bonus de rifle: *+50%*\n' : ''}\n💰 Ganaste: *${formatNumber(reward)} monedas*\n💼 Balance: *${formatNumber(u.coins)}*`,
      );
    },
  },
  {
    name: 'slots',
    aliases: ['tragaperras', 'casino', 'apostar'],
    category: 'economy',
    desc: 'Juega a la tragamonedas con tus monedas.',
    usage: 'slots <apuesta>',
    async execute(ctx) {
      const u = getUser(ctx.sender);
      const bet = Math.max(10, Math.min(10000, Number(ctx.args[0]) || 50));
      if ((u.coins || 0) < bet) {
        await ctx.reply(`💸 No tienes suficientes monedas.\n\n▸ Apuesta: *${formatNumber(bet)}*\n▸ Balance: *${formatNumber(u.coins)}*`);
        return;
      }
      const symbols = ['🍒', '🍋', '🍊', '🔔', '⭐', '💎', '7️⃣'];
      const result = [pick(symbols), pick(symbols), pick(symbols)];
      u.coins -= bet;
      let win = 0;
      if (result[0] === result[1] && result[1] === result[2]) {
        win = bet * 5;
        u.coins += win;
      } else if (result[0] === result[1] || result[1] === result[2] || result[0] === result[2]) {
        win = bet * 2;
        u.coins += win;
      }
      save();
      const line = result.join(' ┃ ');
      const outcome =
        win > bet
          ? `🎉 *¡GANASTE ${formatNumber(win)} monedas!*`
          : win > 0
            ? `😐 *Recuperaste ${formatNumber(win)} monedas.*`
            : '💀 *Perdiste la apuesta.*';
      await ctx.reply(
        `🎰 *TRAGAMONEDAS*\n\n╔══════════╗\n   ${line}\n╚══════════╝\n\n▸ Apuesta: *${formatNumber(bet)}*\n▸ ${outcome}\n\n💼 Balance: *${formatNumber(u.coins)}*`,
      );
    },
  },
  {
    name: 'shop',
    aliases: ['tienda'],
    category: 'economy',
    desc: 'Muestra la tienda de objetos.',
    usage: 'shop',
    async execute(ctx) {
      const list = Object.entries(SHOP)
        .map(([id, item]) => `▸ *${id}* — ${item.name}\n   💰 ${formatNumber(item.price)} monedas\n   📝 ${item.desc}`)
        .join('\n\n');
      await ctx.reply(`🛒 *TIENDA DE ZENITSU BOT*\n\n${list}\n\n💡 Compra con *${ctx.prefix}buy <id>*`);
    },
  },
  {
    name: 'buy',
    aliases: ['comprar', 'adquirir'],
    category: 'economy',
    desc: 'Compra un objeto de la tienda.',
    usage: 'buy <id>',
    async execute(ctx) {
      const id = String(ctx.args[0] || '').toLowerCase();
      const item = SHOP[id];
      if (!item) {
        await ctx.reply(`❌ Objeto no encontrado. Usa *${ctx.prefix}shop* para ver la tienda.`);
        return;
      }
      const u = getUser(ctx.sender);
      if ((u.coins || 0) < item.price) {
        await ctx.reply(`💸 No tienes suficientes monedas.\n\n▸ Precio: *${formatNumber(item.price)}*\n▸ Balance: *${formatNumber(u.coins)}*`);
        return;
      }
      if (has(u, id)) {
        await ctx.reply(`ℹ️ Ya tienes *${item.name}*.`);
        return;
      }
      u.coins -= item.price;
      u.inventory[id] = (u.inventory[id] || 0) + 1;
      save();
      await ctx.reply(`✅ Compraste *${item.name}* por *${formatNumber(item.price)} monedas*.\n\n💼 Balance: *${formatNumber(u.coins)}*`);
    },
  },
  {
    name: 'inventory',
    aliases: ['inv', 'mochila', 'objetos'],
    category: 'economy',
    desc: 'Muestra tu inventario.',
    usage: 'inventory',
    async execute(ctx) {
      const u = getUser(ctx.sender);
      const entries = Object.entries(u.inventory || {}).filter(([, n]) => n > 0);
      if (!entries.length) {
        await ctx.reply(`🎒 Tu inventario está vacío.\n\n💡 Compra objetos con *${ctx.prefix}shop*`);
        return;
      }
      const list = entries
        .map(([id, n]) => `▸ ${SHOP[id]?.name || id} ×${n}`)
        .join('\n');
      await ctx.reply(`🎒 *INVENTARIO*\n\n${list}`);
    },
  },
];
