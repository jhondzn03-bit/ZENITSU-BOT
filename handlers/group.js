import { config } from '../config.js';
import { db, getGroup, save } from '../lib/db.js';
import { jidToNumber, toJid, withWatermark } from '../lib/utils.js';
import { getGroupMetadata, invalidateGroupMeta, trackSent, wasSent } from '../lib/state.js';

function render(template, { user, group, count, desc }) {
  return String(template)
    .replaceAll('{user}', user)
    .replaceAll('{group}', group)
    .replaceAll('{count}', String(count))
    .replaceAll('{desc}', desc || 'Sin descripción');
}

// Convierte los participantes de la metadata en un mapa LID → número real.
// En grupos LID los jids llegan como xxx@lid (dígitos que no son el teléfono):
// cada participante trae su phoneNumber y su lid para hacer la conversión.
function lidMapFrom(meta) {
  const map = new Map();
  for (const p of meta?.participants || []) {
    const jid = toJid(p?.id);
    const pn = toJid(p?.phoneNumber) || (jid && !jid.endsWith('@lid') ? jid : '');
    const lid = toJid(p?.lid) || (jid?.endsWith('@lid') ? jid : '');
    if (lid && pn && pn !== lid && !pn.endsWith('@lid')) map.set(lid, pn);
  }
  return map;
}

// ── .autoadmin ───────────────────────────────────────────────────────────────
// Intentos silenciosos de ascenso: si WhatsApp rechaza el cambio (quien
// llama no es admin, o el usuario ya lo es), no se avisa nada.

async function tryPromote(sock, groupJid, jid) {
  if (!sock?.groupParticipantsUpdate || !groupJid || !jid) return false;
  try {
    await sock.groupParticipantsUpdate(groupJid, [jid], 'promote');
    return true;
  } catch {
    return false;
  }
}

// Asciende a los owners que estén en el grupo y todavía no sean admin.
// Devuelve cuántos intentó ascender.
async function promoteOwners(sock, groupJid, meta, ownerNumbers) {
  const botNumber = jidToNumber(sock?.user?.id);
  let made = 0;
  for (const owner of ownerNumbers || []) {
    const n = String(owner).replace(/\D/g, '');
    if (!n || n === botNumber) continue; // el bot se maneja aparte
    const entry = (meta?.participants || []).find((p) =>
      [p?.id, p?.phoneNumber, p?.lid].filter(Boolean).map(jidToNumber).includes(n),
    );
    if (!entry) continue; // ese owner no está en el grupo
    if (entry.admin === 'admin' || entry.admin === 'superadmin') continue; // ya es admin
    await tryPromote(sock, groupJid, toJid(entry.id));
    made++;
  }
  return made;
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
  // LID → número real: para que las menciones se vean como @503xxxxx
  // y no como los dígitos del LID.
  const lidMap = lidMapFrom(meta);
  const resolvePn = (jid) => (jid && lidMap.get(jid)) || jid;
  // El propio bot también tiene LID (sock.user.lid): se mapea a su número
  // real para que ninguna mención muestre sus dígitos (@148928729194697...).
  const ownLid = toJid(sock.user?.lid);
  const ownJid = toJid(sock.user?.id);
  if (ownLid && ownJid) {
    lidMap.set(ownLid.endsWith('@lid') ? ownLid : `${ownLid.replace(/\D/g, '')}@lid`, ownJid);
  }

  for (const participant of participants) {
    // El stub puede traer el participante como objeto {id, server} (LID):
    // se normaliza a JID y se resuelve al número real para la mención.
    // rawJid conserva el jid tal como lo nombra el grupo (para autoadmin).
    const rawJid = toJid(participant);
    const pJid = resolvePn(rawJid);
    if (!pJid) continue;
    const num = jidToNumber(pJid);
    const isBot = num === botNumber;

    // ── .autoadmin: el bot y el owner se hacen admin automáticamente ──────
    // Solo si el owner lo activó ({prefix}autoadmin on). Todo es silencioso:
    // WhatsApp puede rechazar el ascenso (p. ej. si el bot no es admin).
    if (db().autoAdmin) {
      const ownerNums = (db().owners || []).map((o) => String(o).replace(/\D/g, ''));
      if (action === 'add' && isBot) {
        // Me invitaron: intento hacerme admin y asciendo al owner del grupo.
        await tryPromote(sock, id, rawJid);
        await promoteOwners(sock, id, meta, ownerNums);
      } else if (action === 'add' && ownerNums.includes(num)) {
        // Llegó el owner: lo asciendo si el bot puede.
        await tryPromote(sock, id, rawJid);
      } else if (action === 'promote' && isBot) {
        // Me hicieron admin a mano: asciendo al owner del grupo.
        await promoteOwners(sock, id, meta, ownerNums);
      }
    }

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
          mentions: [pJid],
        });
        trackSent(sent);
      } catch (err) {
        console.error('[WELCOME]', err.message);
      }
    }

    if (action === 'promote' || action === 'demote') {
      // Cuando el ascendido/degradado es el propio bot no se avisa: el
      // dueño ya lo sabe y solo metería ruido en el grupo.
      if (isBot) continue;
      // Aviso decorado "👻 Nuevo administrador / 🥀 Administrador removido".
      // Se puede apagar por grupo con {prefix}adminnotice off.
      if (!g.adminNotice) continue;
      const promote = action === 'promote';
      // Autor: en grupos LID, authorPn trae el número real. Los DOS usuarios
      // (el ascendido y quien lo ascendió) se mencionan con @número real.
      const authorJid =
        [update.authorPn, update.author, update.participant]
          .map((a) => resolvePn(toJid(a)))
          .find((j) => j && !j.endsWith('@lid')) || '';
      const authorNum = jidToNumber(authorJid);
      const botName = db().botName || config.botName;
      const repo = 'https://github.com/jhondzn03-bit';
      // Quién lo hizo: si fue el bot (.promote/.demote) se acredita al bot.
      const byHuman = authorJid && authorNum !== botNumber && authorNum !== num;
      const byLine = byHuman
        ? `💐﹕ *${promote ? 'Ascendido' : 'Degradado'} por:* ─◦ @${authorNum}`
        : `💐﹕ *${promote ? 'Ascendido' : 'Degradado'} por:* ─◦ ⚡ ${botName}`;
      const head = promote
        ? `˚👻 *Nuevo administrador* 𐔌 @${num}`
        : `˚🥀 *Administrador removido* 𐔌 @${num}`;
      const text = `${head}\n\n${byLine}\n\n✿ ${repo}`;
      const mentions = byHuman ? [pJid, authorJid] : [pJid];
      try {
        const sent = await sock.sendMessage(id, {
          text: withWatermark(text),
          mentions,
        });
        trackSent(sent);
      } catch (err) {
        console.error('[ADMIN-NOTICE]', err.message);
      }
    }

    if (action === 'remove') {
      if (isBot) {
        // Me echaron del grupo: archiva el chat para que no quede como
        // fantasma en la lista de conversaciones del bot.
        try {
          await sock.chatModify({ archive: true, lastMessages: [] }, id);
        } catch {}
        // Si estaba en la lista del spam programado, se quita solo:
        // el envío fallaría igual en cada ciclo.
        try {
          const dbData = db();
          if (Array.isArray(dbData.spamGroups) && dbData.spamGroups.some((gr) => gr.jid === id)) {
            dbData.spamGroups = dbData.spamGroups.filter((gr) => gr.jid !== id);
            save();
          }
        } catch {}
        continue;
      }
      if (!g.goodbye) continue;
      const template =
        g.goodbyeText ||
        '╭━━━ ⚡ HASTA PRONTO ━━━╮\n\n👤 {user} salió del grupo.\n📛 Grupo: *{group}*\n👥 Miembros: *{count}*\n\n╰━━━━━━━━━━━━━━╯\n\n🌩️ _Que el trueno te acompañe._';
      const text = render(template, { user: `@${num}`, group: groupName, count, desc });
      try {
        const sent = await sock.sendMessage(id, {
          text: withWatermark(text),
          mentions: [pJid],
        });
        trackSent(sent);
      } catch (err) {
        console.error('[GOODBYE]', err.message);
      }
    }
  }
}

// ─── Cambio de imagen del grupo ─────────────────────────────────────────────
// Baileys 7 no emite evento propio para GROUP_CHANGE_ICON (stub 22): el aviso
// llega como mensaje stub en messages.upsert. Este handler lo detecta y
// publica "✿ Nueva imagen actualizada ─◦ @quien" (o "Imagen eliminada").
const GROUP_CHANGE_ICON = 22;

export async function handleGroupIconChange(sock, msg) {
  try {
    if (msg?.messageStubType !== GROUP_CHANGE_ICON) return;
    const id = msg.key?.remoteJid;
    if (!id || !id.endsWith('@g.us')) return;
    const g = getGroup(id);
    if (!g.adminNotice) return;
    if (wasSent(msg.key)) return; // lo cambió el propio bot: no nos avisamos

    // El autor también puede llegar como LID: se resuelve al número real.
    let meta = null;
    try {
      meta = await getGroupMetadata(sock, id);
    } catch {}
    const lidMap = lidMapFrom(meta);
    const authorJid =
      [msg.key.participantAlt, msg.key.participant, msg.participant]
        .map((a) => {
          const j = toJid(a);
          return lidMap.get(j) || j;
        })
        .find((j) => j && !j.endsWith('@lid')) || '';
    const num = jidToNumber(authorJid);
    const removed = (msg.messageStubParameters || []).some(
      (p) => String(p).toLowerCase() === 'remove',
    );
    const head = removed
      ? '✿ *Imagen eliminada*'
      : '✿ *Nueva imagen actualizada*';
    const text = num
      ? `${head} ─◦ @${num}`
      : head;
    const sent = await sock.sendMessage(id, {
      text: withWatermark(text),
      mentions: num ? [authorJid] : [],
    });
    trackSent(sent);
  } catch (err) {
    console.error('[GROUP-ICON]', err?.message || err);
  }
}
