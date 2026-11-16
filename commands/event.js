// ─── 🎄 Comandos del Evento de Navidad RPG ─────────────────────────────────
// Global: el mismo jefe para todos los chats. Estado persistente en db().event.
import { db, getUser, save } from '../lib/db.js';
import {
  attackBoss,
  claimGift,
  eventRanking,
  eventSummary,
  getEvent,
  healPlayer,
  maxHpOf,
  resetEvent,
  EVENT_COMMANDS,
} from '../lib/event.js';
import { getTargetJid } from '../lib/targets.js';
import { formatNumber, jidToNumber, progressBar, truncate } from '../lib/utils.js';

function bossCard(ev) {
  const { boss, phase } = eventSummary(ev, '');
  const totalDamage = Object.values(ev.players || {}).reduce(
    (n, p) => n + (Number(p.damage) || 0),
    0,
  );
  const lines = [
    '🎄━━━━━━━━━━━━━━━━━━🎄',
    '      🎅 *NAVIDAD RPG* 🎁',
    '🎄━━━━━━━━━━━━━━━━━━🎄',
    '',
    `${boss.emoji} *${boss.name}*`,
    `▸ Nivel del jefe: *${ev.level}*`,
    `▸ Fase: *${phase.name}*`,
    `▸ Vida: ${progressBar(boss.hp, boss.maxHp)}`,
    `▸ Daño total del equipo: *${formatNumber(totalDamage)}*`,
    '',
    ev.lastDefeat
      ? `🏆 *Último jefe derrotado:* ${truncate(ev.lastDefeat.bossName, 40)} (nivel ${ev.lastDefeat.level})`
      : '❄️ *El primer jefe aún sigue en pie. ¡Entra a la batalla!*',
    '',
    '⚔️ *Comandos del evento*',
    `▸ *${EVENT_COMMANDS}*`,
    '',
    '🎁 *Recompensas:* monedas, XP y objetos según el daño que hagas.',
  ];
  return lines.join('\n');
}

export default [
  {
    name: 'evento',
    aliases: ['eventonavidad', 'navidadevento', 'krampus'],
    category: 'event',
    desc: 'Muestra el jefe de Navidad, tu vida y el daño del equipo.',
    usage: 'evento',
    async execute(ctx) {
      const ev = getEvent();
      const { player, maxHp } = eventSummary(ev, ctx.sender);
      const lines = [bossCard(ev), ''];
      if (player) {
        lines.push('👤 *TU PERFIL DE NAVIDAD*');
        lines.push(`▸ Vida: ${progressBar(player.hp, maxHp)}`);
        lines.push(`▸ Daño acumulado: *${formatNumber(player.damage)}*`);
        lines.push(`▸ Golpes: *${player.hits}* · Curaciones: *${player.heals}*`);
        lines.push(`▸ Regalos abiertos: *${player.gems}*`);
      }
      if (!ev.active) lines.push('\n🔴 *El evento está desactivado.*');
      await ctx.reply(lines.join('\n'));
    },
  },
  {
    name: 'atacar',
    aliases: ['attack', 'atacarjefe', 'atakenavidad'],
    category: 'event',
    desc: 'Ataca al jefe de Navidad (15 s de espera entre golpes).',
    usage: 'atacar',
    async execute(ctx) {
      const ev = getEvent();
      const res = attackBoss(ev, ctx.sender);
      if (!res.ok) {
        await ctx.reply(res.text);
        return;
      }
      let text = res.text;
      if (res.defeated) {
        const d = res.defeated;
        const money = d.winners.reduce((n, w) => n + w.coins, 0);
        text +=
          `\n\n🏆━━━━━━━━━━━━━━━━━━🏆\n` +
          `🎉 *¡JEFE DERROTADO!*\n\n` +
          `▸ Jefe: *${d.bossName}* (nivel ${d.level})\n` +
          `▸ Participantes: *${d.participants}*\n` +
          `▸ Daño total: *${formatNumber(d.totalDamage)}*\n` +
          `▸ Monedas repartidas: *${formatNumber(money)}*\n\n` +
          `🎁 *Se repartieron premios por daño.* Revisa tu balance con *.balance*\n` +
          `🎄 *¡Ya nació el siguiente jefe!* Usa *.atacar*`;
      }
      await ctx.reply(text);
    },
  },
  {
    name: 'curar',
    aliases: ['heal', 'curarse', 'pocion'],
    category: 'event',
    desc: 'Recupera vida en el evento de Navidad (90 s de espera).',
    usage: 'curar',
    async execute(ctx) {
      const ev = getEvent();
      const res = healPlayer(ev, ctx.sender);
      await ctx.reply(res.text);
    },
  },
  {
    name: 'regalo',
    aliases: ['gift', 'abreregalo', 'regalonavidad'],
    category: 'event',
    desc: 'Abre tu regalo de Navidad (cada 12 horas).',
    usage: 'regalo',
    async execute(ctx) {
      const ev = getEvent();
      const res = claimGift(ev, ctx.sender);
      await ctx.reply(res.text);
    },
  },
  {
    name: 'eventotop',
    aliases: ['topnavidad', 'topevento', 'rankingevento'],
    category: 'event',
    desc: 'Ranking de daño del evento de Navidad.',
    usage: 'eventotop',
    async execute(ctx) {
      const ev = getEvent();
      const top = eventRanking(ev, 10);
      if (!top.length) {
        await ctx.reply(
          `🎄 *RANKING DE NAVIDAD*\n\nNadie ha atacado todavía al jefe.\n\n⚔️ Sé el primero con *.atacar*`,
        );
        return;
      }
      const medals = ['🥇', '🥈', '🥉'];
      const lines = ['🎄 *RANKING DE NAVIDAD* 🎁', ''];
      top.forEach((p, i) => {
        lines.push(
          `${medals[i] || `▸ ${i + 1}.`} @${p.number} — *${formatNumber(p.damage)}* daño · ${p.hits} golpes`,
        );
      });
      const { boss } = eventSummary(ev, '');
      lines.push('');
      lines.push(`${boss.emoji} Jefe actual: *${truncate(boss.name, 40)}*`);
      lines.push(`▸ Vida: ${progressBar(boss.hp, boss.maxHp)}`);
      await ctx.reply(lines.join('\n'), { mentions: top.map((p) => p.jid) });
    },
  },
  {
    name: 'eventostart',
    aliases: ['eventoon', 'abrirevento'],
    category: 'owner',
    desc: 'Activa el evento de Navidad o lanza un jefe nuevo.',
    usage: 'eventostart [vida]',
    owner: true,
    async execute(ctx) {
      const hp = Number(String(ctx.args[0] || '').replace(/\D/g, '')) || 0;
      const ev = resetEvent({ hp, level: 1, active: true });
      await ctx.reply(
        `🎄 *EVENTO DE NAVIDAD ACTIVADO*\n\n` +
          `${ev.boss.emoji} Jefe: *${ev.boss.name}*\n` +
          `▸ Nivel: *${ev.boss.level}*\n` +
          `▸ Vida: *${formatNumber(ev.boss.maxHp)}*\n\n` +
          `⚔️ Todos pueden atacar con *.atacar*`,
      );
    },
  },
  {
    name: 'eventostop',
    aliases: ['eventooff', 'cerrarevento'],
    category: 'owner',
    desc: 'Desactiva el evento de Navidad.',
    usage: 'eventostop',
    owner: true,
    async execute(ctx) {
      const ev = getEvent();
      ev.active = false;
      save();
      await ctx.reply('🔴 *Evento de Navidad desactivado.* Los jugadores no podrán atacar hasta que lo actives de nuevo.');
    },
  },
  {
    name: 'eventoboss',
    aliases: ['jefenavidad', 'spawnjefe'],
    category: 'owner',
    desc: 'Lanza un jefe nuevo con la vida indicada.',
    usage: 'eventoboss [vida]',
    owner: true,
    async execute(ctx) {
      const hp = Number(String(ctx.args[0] || '').replace(/\D/g, '')) || 0;
      const ev = getEvent();
      ev.boss = {
        ...ev.boss,
        hp: hp || Math.round(ev.boss.maxHp * 1.35),
        maxHp: hp || Math.round(ev.boss.maxHp * 1.35),
        spawnedAt: Date.now(),
      };
      ev.active = true;
      ev.players = {};
      save();
      await ctx.reply(
        `👹 *NUEVO JEFE*\n\n` +
          `${ev.boss.emoji} *${ev.boss.name}*\n` +
          `▸ Vida: *${formatNumber(ev.boss.maxHp)}*\n\n` +
          `⚔️ A atacar con *.atacar*`,
      );
    },
  },
  {
    name: 'eventoregalo',
    aliases: ['eventogift', 'darnavidad'],
    category: 'owner',
    desc: 'Da monedas navideñas a un usuario del evento.',
    usage: 'eventoregalo @usuario [monedas]',
    owner: true,
    async execute(ctx) {
      const target = getTargetJid(ctx);
      if (!target) {
        await ctx.reply(`💡 Uso: *${ctx.prefix}eventoregalo @usuario 500*`);
        return;
      }
      const amount = Math.min(100000, Math.max(1, Number(String(ctx.args.find((a) => /^\d+$/.test(a)) || '')) || 500));
      const u = getUser(target);
      u.coins = (Number(u.coins) || 0) + amount;
      const ev = getEvent();
      const p = ev.players[target];
      if (p) p.gems = (Number(p.gems) || 0) + 1;
      save();
      await ctx.reply(
        `🎁 *REGALO NAVIDEÑO*\n\n` +
          `▸ Para: @${jidToNumber(target)}\n` +
          `▸ Monedas: *${formatNumber(amount)}*\n` +
          `▸ Balance nuevo: *${formatNumber(u.coins)}*`,
        { mentions: [target] },
      );
    },
  },
];
