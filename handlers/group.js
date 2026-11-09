import { config } from '../config.js';
import { db, getGroup } from '../lib/db.js';
import { jidToNumber, withWatermark } from '../lib/utils.js';
import { getGroupMetadata, invalidateGroupMeta, trackSent } from '../lib/state.js';

function render(template, { user, group, count, desc }) {
  return String(template)
    .replaceAll('{user}', user)
    .replaceAll('{group}', group)
    .replaceAll('{count}', String(count))
    .replaceAll('{desc}', desc || 'Sin descripción');
}

export async function handleGroupParticipants(sock, update) {
  const { id, participants, action } = update;
  if (!id || !Array.isArray(participants)) return;
  if (!['add', 'remove', 'promote', 'demote'].includes(action)) return;

  invalidateGroupMeta(id);
  const g = getGroup(id);
  let meta = null;
  try {
    meta = await getGroupMetadata(sock, id);
  } catch {}

  const groupName = meta?.subject || 'el grupo';
  const count = meta?.participants?.length || 0;
  const desc = meta?.desc || '';
  const botNumber = jidToNumber(sock.user?.id);

  for (const participant of participants) {
    const num = jidToNumber(participant);
    const isBot = num === botNumber;

    if (action === 'add') {
      if (isBot) {
        const text = `⚡ *¡GRACIAS POR INVITARME!*\n\nSoy *${db().botName || config.botName}*, tu bot de confianza.\n\n📜 Escribe *${db().prefix || config.prefix}menu* para ver todos mis comandos.\n\n🌩️ _Respiración del Trueno, activada._`;
        try {
          const sent = await sock.sendMessage(id, { text: withWatermark(text) });
          trackSent(sent);
        } catch {}
        continue;
      }

      if (!g.welcome) continue;
      const template =
        g.welcomeText ||
        '╭━━━ ⚡ BIENVENIDO/A ━━━╮\n\n👤 {user}\n📛 Grupo: *{group}*\n👥 Miembros: *{count}*\n\n📜 {desc}\n\n╰━━━━━━━━━━━━━━╯\n\n⚡ _Disfruta tu estadía y respeta las reglas._';
      const text = render(template, { user: `@${num}`, group: groupName, count, desc });
      try {
        const sent = await sock.sendMessage(id, {
          text: withWatermark(text),
          mentions: [participant],
        });
        trackSent(sent);
      } catch (err) {
        console.error('[WELCOME]', err.message);
      }
    }

    if (action === 'remove') {
      if (isBot) continue;
      if (!g.goodbye) continue;
      const template =
        g.goodbyeText ||
        '╭━━━ ⚡ HASTA PRONTO ━━━╮\n\n👤 {user} salió del grupo.\n📛 Grupo: *{group}*\n👥 Miembros: *{count}*\n\n╰━━━━━━━━━━━━━━╯\n\n🌩️ _Que el trueno te acompañe._';
      const text = render(template, { user: `@${num}`, group: groupName, count, desc });
      try {
        const sent = await sock.sendMessage(id, {
          text: withWatermark(text),
          mentions: [participant],
        });
        trackSent(sent);
      } catch (err) {
        console.error('[GOODBYE]', err.message);
      }
    }
  }
}
