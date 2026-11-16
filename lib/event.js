// ─── 🎄 Evento de Navidad RPG ──────────────────────────────────────────────
// Un jefe global (Krampus) al que todos los chats atacan. Cada usuario tiene
// vida, daño acumulado, curaciones y cofres. El estado vive en la DB para que
// sobreviva reinicios: db().event.
import { db, getUser, save } from './db.js';
import { formatNumber, jidToNumber, progressBar, randomInt } from './utils.js';

const ATTACK_CD = 15 * 1000; // 15 s entre ataques
const HEAL_CD = 90 * 1000; // 90 s entre curaciones
const GIFT_CD = 12 * 60 * 60 * 1000; // un regalo cada 12 h
const BASE_BOSS_HP = 12000;

const BOSSES = [
  { name: 'Krampus, el Demonio de la Nieve', emoji: '👹' },
  { name: 'El Yeti de los Regalos Rotos', emoji: '🧊' },
  { name: 'La Bruja del Carbón', emoji: '🧙‍♀️' },
  { name: 'Grinch de las Sombras', emoji: '🟢' },
  { name: 'El Trineo Maldito', emoji: '🛷' },
];

export const EVENT_COMMANDS = 'atacar · curar · regalo · eventotop · evento';

function freshBoss(level = 1, hpOverride = 0) {
  const pick = BOSSES[(level - 1) % BOSSES.length];
  const maxHp = Math.max(1000, Math.round(hpOverride || BASE_BOSS_HP * 1.35 ** (level - 1)));
  return {
    name: pick.name,
    emoji: pick.emoji,
    hp: maxHp,
    maxHp,
    level,
    spawnedAt: Date.now(),
  };
}

function defaultEvent() {
  return {
    active: true,
    level: 1,
    boss: freshBoss(1),
    players: {},
    startedAt: Date.now(),
    lastDefeat: null,
    defeats: 0,
  };
}

// Devuelve el estado del evento, creándolo/migrándolo si hace falta.
export function getEvent() {
  const store = db();
  if (!store.event || typeof store.event !== 'object') store.event = defaultEvent();
  const ev = store.event;
  ev.players = ev.players && typeof ev.players === 'object' ? ev.players : {};
  ev.level = Math.max(1, Number(ev.level) || 1);
  ev.defeats = Math.max(0, Number(ev.defeats) || 0);
  ev.active = ev.active !== false;
  if (!ev.boss || typeof ev.boss !== 'object') ev.boss = freshBoss(ev.level);
  if (!Number.isFinite(Number(ev.boss.hp))) ev.boss.hp = Number(ev.boss.maxHp) || BASE_BOSS_HP;
  if (!Number.isFinite(Number(ev.boss.maxHp)) || Number(ev.boss.maxHp) <= 0) {
    ev.boss.maxHp = Math.max(1000, Number(ev.boss.hp) || BASE_BOSS_HP);
  }
  return ev;
}

export function resetEvent({ hp = 0, level = 1, active = true } = {}) {
  const store = db();
  store.event = {
    ...defaultEvent(),
    active,
    level: Math.max(1, Number(level) || 1),
    boss: freshBoss(Math.max(1, Number(level) || 1), hp),
  };
  save();
  return store.event;
}

// Jugador del evento (independiente de su economía normal).
export function eventPlayer(ev, jid) {
  const key = String(jid || '');
  if (!key) throw new Error('Jugador inválido');
  ev.players[key] ||= {
    damage: 0,
    hits: 0,
    heals: 0,
    gems: 0,
    hp: 100,
    lastAttack: 0,
    lastHeal: 0,
    lastGift: 0,
    joinedAt: Date.now(),
  };
  const p = ev.players[key];
  p.damage = Number(p.damage) || 0;
  p.hits = Number(p.hits) || 0;
  p.heals = Number(p.heals) || 0;
  p.gems = Number(p.gems) || 0;
  p.hp = Math.min(p.maxHp || maxHpOf(key), Math.max(0, Number(p.hp) || 0));
  p.lastAttack = Number(p.lastAttack) || 0;
  p.lastHeal = Number(p.lastHeal) || 0;
  p.lastGift = Number(p.lastGift) || 0;
  return p;
}

export function maxHpOf(jid) {
  const u = getUser(jid);
  return 100 + Math.max(0, (Number(u.level) || 1) - 1) * 12;
}

function waitText(ms) {
  const s = Math.ceil(ms / 1000);
  return s >= 120 ? `${Math.ceil(s / 60)} min` : `${s} s`;
}

function phaseOf(boss) {
  const pct = boss.maxHp > 0 ? boss.hp / boss.maxHp : 0;
  if (pct > 0.66) return { n: 1, name: 'Dormido', bonus: 0 };
  if (pct > 0.33) return { n: 2, name: 'Enojado', bonus: 0.25 };
  return { n: 3, name: '🔥 FURIA NAVIDEÑA', bonus: 0.6 };
}

// Ataque al jefe. Devuelve { ok, wait?, text } o datos para el mensaje.
export function attackBoss(ev, jid) {
  const p = eventPlayer(ev, jid);
  const boss = ev.boss;
  if (!ev.active) return { ok: false, text: '🔴 El evento está desactivado. El owner puede abrirlo con *.eventostart*.' };
  if (boss.hp <= 0) return { ok: false, text: '🎉 El jefe ya cayó. Espera al próximo con *.evento*.' };

  const since = Date.now() - p.lastAttack;
  if (since < ATTACK_CD) {
    return { ok: false, text: `⏳ Respira... vuelve a atacar en *${waitText(ATTACK_CD - since)}*.` };
  }
  if (p.hp <= 0) {
    return {
      ok: false,
      text: `💀 Estás noqueado. Usa *.curar* antes de volver a atacar.`,
    };
  }

  const u = getUser(jid);
  const phase = phaseOf(boss);
  const base = randomInt(35, 85) + (Number(u.level) || 1) * 6;
  const critical = Math.random() < 0.14;
  const combo = !critical && Math.random() < 0.22;
  let damage = Math.round(base * (1 + phase.bonus) * (critical ? 3 : combo ? 2 : 1));
  // Pequeña variación de Navidad: el 8% de los golpes son "regalo explosivo".
  const explosive = !critical && !combo && Math.random() < 0.08;
  if (explosive) damage = Math.round(damage * 2.2);

  boss.hp = Math.max(0, boss.hp - damage);
  p.damage += damage;
  p.hits += 1;
  p.lastAttack = Date.now();

  // Contraataque del jefe: nunca tan fuerte como para no poder jugar.
  let counter = 0;
  if (Math.random() < 0.18 + phase.n * 0.04) {
    counter = randomInt(6, 14) + phase.n * 3;
    p.hp = Math.max(0, Math.min(maxHpOf(jid), p.hp) - counter);
  }

  const lines = [];
  if (explosive) lines.push('🎁💥 *¡REGALO EXPLOSIVO!*');
  else if (critical) lines.push('⚡ *¡CRÍTICO DE TRUENO!*');
  else if (combo) lines.push('🌩️ *¡COMBO DOBLE!*');
  lines.push(`🗡️ Le hiciste *${formatNumber(damage)}* de daño a *${boss.name}*.`);
  if (counter) lines.push(`🩸 El jefe te devolvió *${counter}* de daño.`);
  lines.push('');
  lines.push(`👹 Vida del jefe: ${progressBar(boss.hp, boss.maxHp)}`);
  lines.push(`❤️ Tu vida: ${progressBar(p.hp, maxHpOf(jid))}`);

  let defeated = null;
  if (boss.hp <= 0) {
    defeated = defeatBoss(ev, jid);
  }
  save();
  return { ok: true, damage, counter, defeated, text: lines.join('\n') };
}

// Reparte recompensas cuando el jefe cae y genera el siguiente.
function defeatBoss(ev, finisherJid) {
  const boss = ev.boss;
  const players = Object.entries(ev.players)
    .map(([jid, p]) => ({ jid, damage: Number(p.damage) || 0 }))
    .filter((x) => x.damage > 0);
  const totalDamage = players.reduce((n, x) => n + x.damage, 0) || 1;
  const poolCoins = 2500 + ev.level * 1200;
  const poolXp = 300 + ev.level * 120;

  const winners = [];
  for (const { jid, damage } of players) {
    const share = damage / totalDamage;
    const bonus = jid === finisherJid ? Math.round(poolCoins * 0.12) : 0;
    const coins = Math.max(50, Math.round(poolCoins * share) + bonus);
    const xp = Math.max(10, Math.round(poolXp * share)) + (jid === finisherJid ? 60 : 0);
    const u = getUser(jid);
    u.coins = (Number(u.coins) || 0) + coins;
    u.xp = (Number(u.xp) || 0) + xp;
    // 20% de probabilidad de un cofre extra con un ítem de la tienda.
    let item = '';
    if (Math.random() < 0.2) {
      item = Math.random() < 0.5 ? 'shield' : 'charm';
      u.inventory[item] = (Number(u.inventory[item]) || 0) + 1;
    }
    winners.push({ jid, coins, xp, item, damage });
  }
  winners.sort((a, b) => b.damage - a.damage);

  ev.lastDefeat = {
    at: Date.now(),
    bossName: boss.name,
    level: ev.level,
    totalDamage,
    participants: players.length,
    winners: winners.slice(0, 10),
    finisher: finisherJid || '',
  };
  ev.defeats += 1;
  ev.level += 1;
  ev.boss = freshBoss(ev.level);
  ev.players = {};
  return ev.lastDefeat;
}

export function healPlayer(ev, jid) {
  const p = eventPlayer(ev, jid);
  const since = Date.now() - p.lastHeal;
  if (since < HEAL_CD) {
    return { ok: false, text: `⏳ Tu poción aún se está preparando. Espera *${waitText(HEAL_CD - since)}*.` };
  }
  const max = maxHpOf(jid);
  const missing = Math.max(0, max - Math.min(p.hp, max));
  if (missing <= 0) {
    return { ok: false, text: `❤️ Ya tienes la vida completa (*${max}*). ¡A atacar! *.atacar*` };
  }
  const amount = Math.max(35, Math.round(max * 0.6));
  p.hp = Math.min(max, Math.min(p.hp, max) + amount);
  p.heals += 1;
  p.lastHeal = Date.now();
  save();
  return {
    ok: true,
    text:
      `🍵 *CHOCOLATE CALIENTE* ☕\n\n` +
      `▸ Recuperaste: *+${formatNumber(amount)}* de vida\n` +
      `▸ Vida actual: ${progressBar(p.hp, max)}\n\n` +
      `⚔️ Vuelve a la batalla con *.atacar*`,
  };
}

const GIFTS = [
  { kind: 'coins', min: 120, max: 700, emoji: '💰', name: 'bolsa de monedas' },
  { kind: 'coins', min: 800, max: 1500, emoji: '🪙', name: 'cofre dorado' },
  { kind: 'xp', min: 25, max: 90, emoji: '⭐', name: 'estrella de experiencia' },
  { kind: 'item', item: 'shield', emoji: '🛡️', name: 'Escudo de cazador' },
  { kind: 'item', item: 'charm', emoji: '🍀', name: 'Amuleto de la suerte' },
  { kind: 'hp', emoji: '🍪', name: 'galleta de jengibre' },
];

export function claimGift(ev, jid) {
  const p = eventPlayer(ev, jid);
  const since = Date.now() - p.lastGift;
  if (since < GIFT_CD) {
    return { ok: false, text: `🎁 Ya abriste tu regalo. El siguiente llega en *${waitText(GIFT_CD - since)}*.` };
  }
  p.lastGift = Date.now();
  const u = getUser(jid);
  const gift = GIFTS[randomInt(0, GIFTS.length - 1)];
  let detail = '';
  if (gift.kind === 'coins') {
    const amount = randomInt(gift.min, gift.max);
    u.coins = (Number(u.coins) || 0) + amount;
    detail = `💰 *+${formatNumber(amount)} monedas*`;
  } else if (gift.kind === 'xp') {
    const amount = randomInt(gift.min, gift.max);
    u.xp = (Number(u.xp) || 0) + amount;
    detail = `⭐ *+${formatNumber(amount)} XP*`;
  } else if (gift.kind === 'item') {
    u.inventory[gift.item] = (Number(u.inventory[gift.item]) || 0) + 1;
    detail = `${gift.emoji} *${gift.name}* (a tu inventario)`;
  } else {
    const max = maxHpOf(jid);
    p.hp = max;
    detail = `❤️ Vida restaurada al máximo (*${max}*)`;
  }
  p.gems += 1;
  save();
  return {
    ok: true,
    text:
      `🎄 *REGALO DE NAVIDAD* 🎁\n\n` +
      `Santa Krampus dejó algo bajo el árbol...\n\n` +
      `▸ ${gift.emoji} ${detail}\n\n` +
      `_Vuelve en 12 horas por otro regalo._`,
  };
}

export function eventRanking(ev, limit = 10) {
  return Object.entries(ev.players)
    .map(([jid, p]) => ({
      jid,
      number: jidToNumber(jid),
      damage: Number(p.damage) || 0,
      hits: Number(p.hits) || 0,
      hp: Number(p.hp) || 0,
    }))
    .filter((x) => x.damage > 0)
    .sort((a, b) => b.damage - a.damage)
    .slice(0, Math.max(1, Math.min(30, Number(limit) || 10)));
}

export function eventSummary(ev, jid) {
  const boss = ev.boss;
  const phase = phaseOf(boss);
  const p = jid ? eventPlayer(ev, jid) : null;
  return { boss, phase, player: p, maxHp: jid ? maxHpOf(jid) : 0 };
}

export { ATTACK_CD, HEAL_CD, GIFT_CD, phaseOf, waitText };
