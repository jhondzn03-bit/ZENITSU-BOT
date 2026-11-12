import { config } from '../config.js';
import { db, getGroup, save } from '../lib/db.js';
import { jidToNumber, numberToJid, toJid, withWatermark } from '../lib/utils.js';
import { getGroupMetadata, invalidateGroupMeta, trackSent, wasSent } from '../lib/state.js';
import { effectiveSettings, subbotForSock } from '../lib/settings.js';

// ─── Bienvenida y despedida (edición Zenitsu) ────────────────────────────────
// {user} llega ya resuelto: @número real (con ping) o el nombre del contacto.
// NUNCA los dígitos de un LID. Cada grupo la personaliza con .setwelcome.
export const DEFAULT_WELCOME = [
  '╭━━━ ⚡ ZENITSU ⚡ ━━━╮',
  '',
  '🌩️ *_Respiración del Trueno ⚡_*',
  '⚡ *_Primer Estilo: Trueno y Destello_*',
  '',
  '👤 {user} se une a la cacería',
  '',
  '🏞️ Grupo: *{group}*',
  '👥 Cazadores: *{count}*',
  '📜 {desc}',
  '',
  '╰━━━━━━━━━━━━━━╯',
  '',
  '⚡ _Disfruta tu estadía y respeta las reglas._',
].join('\n');

export const DEFAULT_GOODBYE = [
  '╭━━━ ⚡ ZENITSU ⚡ ━━━╮',
  '',
  '🌩️ *_Respiración del Trueno ⚡_*',
  '⚡ *_Séptimo Estilo: Dios del Trueno Flamígero_*',
  '',
  '👤 {user} partió de la cacería',
  '',
  '🏞️ Grupo: *{group}*',
  '👥 Cazadores restantes: *{count}*',
  '',
  '╰━━━━━━━━━━━━━━╯',
  '',
  '🌩️ _El trueno recordará tu nombre._',
].join('\n');

function render(template, { user, group, count, desc }) {
  return String(template)
    .replaceAll('{user}', user)
    .replaceAll('{group}', group)
    .replaceAll('{count}', String(count))
    .replaceAll('{desc}', desc || 'Sin descripción');
}

// Normaliza cualquier jid "de número": dígitos sueltos → @s.whatsapp.net.
function pnJid(j) {
  const v = toJid(j);
  if (!v) return '';
  return v.includes('@') ? v : numberToJid(v);
}

// Convierte los participantes de la metadata en un mapa LID → número real.
// En grupos LID los jids llegan como xxx@lid (dígitos que no son el teléfono):
// cada participante trae su phoneNumber y su lid para hacer la conversión.
function lidMapFrom(meta) {
  const map = new Map();
  for (const p of meta?.participants || []) {
    const jid = toJid(p?.id);
    const pn = pnJid(p?.phoneNumber) || (jid && !jid.endsWith('@lid') ? jid : '');
    const lid = toJid(p?.lid) || (jid?.endsWith('@lid') ? jid : '');
    if (lid && pn && pn !== lid && !pn.endsWith('@lid')) map.set(lid, pn);
  }
  return map;
}

// El participante de un evento de grupo puede llegar como string jid, como
// objeto {id, server} o como objeto {lid, pn} con AMBOS identificadores (el
// LID y el número real). Esto extrae sus jids venga como venga.
function participantJids(p) {
  if (typeof p === 'string') {
    const jid = pnJid(p);
    return { raw: jid, lid: jid.endsWith('@lid') ? jid : '', pn: jid.endsWith('@lid') ? '' : jid };
  }
  const asObj = toJid(p); // {id, server} → id@server
  // p.id con dígitos sueltos solo aparece junto a {server}: se toma asObj
  // para no confundir los dígitos de un LID con un número de teléfono.
  const id = typeof p?.id === 'string' && p.id.includes('@') ? toJid(p.id) : asObj;
  const lid = toJid(p?.lid) || [id, asObj].find((j) => j && j.endsWith('@lid')) || '';
  const pn =
    pnJid(p?.pn) ||
    pnJid(p?.phoneNumber) ||
    [id, asObj].find((j) => j && !j.endsWith('@lid')) ||
    '';
  return { raw: lid || id || asObj || pn, lid, pn };
}

// Resuelve un jid @lid al número real. Además de la metadata del grupo, usa
// el almacén LID↔PN de la sesión de Baileys (signalRepository.lidMapping):
// WhatsApp sincroniza esos pares al iniciar sesión, así que cubre a casi
// cualquier usuario. Es una consulta local, sin ir a la red.
async function pnOf(sock, jid, lidMap) {
  if (!jid) return '';
  const mapped = lidMap && lidMap.get(jid);
  if (mapped && !mapped.endsWith('@lid')) return mapped;
  if (!jid.endsWith('@lid')) return jid;
  try {
    const pn = await sock?.signalRepository?.lidMapping?.getPNForLID?.(jid);
    const clean = toJid(pn); // quita el sufijo de dispositivo (:N)
    if (clean && !clean.endsWith('@lid')) return clean;
  } catch {}
  return '';
}

// Busca la entrada de un participante en la metadata del grupo (por su jid
// LID o su número): de ahí salen el nombre y el rango (admin).
function findMetaEntry(meta, jid) {
  if (!jid) return null;
  return (
    (meta?.participants || []).find(
      (p) => toJid(p?.id) === jid || toJid(p?.lid) === jid || pnJid(p?.phoneNumber) === jid,
    ) || null
  );
}

// El propio LID del bot, normalizado a xxx@lid.
function selfLidJid(sock) {
  const lid = toJid(sock?.user?.lid);
  if (!lid) return '';
  return lid.endsWith('@lid') ? lid : `${lid.replace(/\D/g, '')}@lid`;
}

// La entrada del bot en la metadata de un grupo.
function findBotEntry(sock, meta) {
  const botNumber = jidToNumber(sock?.user?.id);
  const ownLid = selfLidJid(sock);
  return (
    (meta?.participants || []).find(
      (p) =>
        jidToNumber(p?.id) === botNumber ||
        jidToNumber(p?.lid) === botNumber ||
        jidToNumber(p?.phoneNumber) === botNumber ||
        (ownLid && (toJid(p?.lid) === ownLid || toJid(p?.id) === ownLid)),
    ) || null
  );
}

// ── .autoadmin ───────────────────────────────────────────────────────────────
// Intentos silenciosos de ascenso: si WhatsApp rechaza el cambio (quien
// llama no es admin, o el usuario ya lo es), no se avisa nada en el grupo.

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
// Devuelve la lista de números que quedó ascendida.
async function promoteOwners(sock, groupJid, meta, ownerNumbers) {
  const botNumber = jidToNumber(sock?.user?.id);
  const promoted = [];
  for (const owner of ownerNumbers || []) {
    const n = String(owner).replace(/\D/g, '');
    if (!n || n === botNumber) continue; // el bot se maneja aparte
    const entry = (meta?.participants || []).find(
      (p) => [p?.id, p?.pn, p?.phoneNumber, p?.lid].filter(Boolean).map(jidToNumber).includes(n),
    );
    if (!entry) continue; // ese owner no está en el grupo
    if (entry.admin === 'admin' || entry.admin === 'superadmin') continue; // ya es admin
    const ok = await tryPromote(sock, groupJid, toJid(entry.id) || pnJid(entry.phoneNumber));
    if (ok) promoted.push(n);
  }
  return promoted;
}

// Barrido inmediato de .autoadmin en el grupo donde se activó el comando:
// devuelve el estado real para que el owner sepa si falta algo a mano.
export async function autoAdminSweep(sock, groupJid) {
  const out = { botAdmin: false, selfPromoted: false, promotedOwners: [] };
  if (!groupJid?.endsWith('@g.us') || !sock) return out;
  invalidateGroupMeta(groupJid);
  let meta = null;
  try {
    meta = await getGroupMetadata(sock, groupJid);
  } catch {}
  const botEntry = findBotEntry(sock, meta);
  out.botAdmin = botEntry?.admin === 'admin' || botEntry?.admin === 'superadmin';
  const ownerNums = (db().owners || []).map((o) => String(o).replace(/\D/g, ''));
  if (!out.botAdmin) {
    // WhatsApp solo deja ascender a quien ya es admin: el intento de
    // hacerme admin solo es best-effort (casi siempre lo rechaza).
    const target = toJid(botEntry?.id) || selfLidJid(sock) || toJid(sock.user?.id);
    out.selfPromoted = await tryPromote(sock, groupJid, target);
    out.botAdmin = out.selfPromoted;
  }
  if (out.botAdmin) out.promotedOwners = await promoteOwners(sock, groupJid, meta, ownerNums);
  return out;
}

// Aviso al owner por privado cuando WhatsApp rechaza el auto-ascenso: solo
// los administradores pueden ascender, así que toca hacerlo a mano. Se envía
// UNA vez por grupo mientras viva el proceso (nada de spam).
const selfPromoteFailedGroups = new Set();

async function notifyOwnerAdminRejected(sock, groupJid, groupName) {
  if (selfPromoteFailedGroups.has(groupJid)) return;
  selfPromoteFailedGroups.add(groupJid);
  const botNumber = jidToNumber(sock?.user?.id);
  const eff = effectiveSettings(subbotForSock(sock));
  const botName = eff.botName;
  const prefix = eff.prefix;
  const text =
    `👑 *AUTOADMIN*\n\nMe invitaron a *${groupName || 'un grupo'}* pero no pude hacerme admin solo: ` +
    `en WhatsApp solo los administradores pueden ascender.\n\n` +
    `▸ Hazme admin desde *Ajustes del grupo → Participantes*\n` +
    `▸ Desde ese momento me encargo yo: asciendo al owner en cada grupo donde ya sea admin\n\n` +
    `📜 Comandos: ${prefix}autoadmin · ${prefix}menu\n\n⚡ _${botName}_`;
  for (const owner of db().owners || []) {
    const n = String(owner).replace(/\D/g, '');
    if (!n || n === botNumber) continue;
    try {
      await sock.sendMessage(numberToJid(n), { text: withWatermark(text) });
    } catch {}
  }
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
  const ownerNums = (db().owners || []).map((o) => String(o).replace(/\D/g, ''));

  // LID → número real: para que las menciones se vean como @503xxxxx
  // y no como los dígitos del LID.
  const lidMap = lidMapFrom(meta);
  const resolvePn = (jid) => (jid && lidMap.get(jid)) || jid;
  // El propio bot también tiene LID (sock.user.lid): se mapea a su número
  // real para que ninguna mención muestre sus dígitos (@148928729194697...).
  const ownLid = selfLidJid(sock);
  const ownJid = toJid(sock.user?.id);
  if (ownLid && ownJid) lidMap.set(ownLid, ownJid);
  // Los participantes del propio evento pueden traer su pn (número real):
  // se registra en el mapa para este evento.
  for (const p of participants) {
    const { lid, pn } = participantJids(p);
    if (lid && pn && !pn.endsWith('@lid')) lidMap.set(lid, pn);
  }

  for (const participant of participants) {
    // El participante se normaliza a jid; rawJid conserva el jid tal como lo
    // nombra el grupo (para autoadmin). pn trae el número real si el evento
    // lo incluyó.
    const { raw: rawJid, pn } = participantJids(participant);
    // Número real: pn del evento → metadata del grupo → almacén LID↔PN de
    // la sesión de Baileys. Si nada lo resuelve, se muestra el nombre.
    let pJid = pn || resolvePn(rawJid);
    if ((!pJid || pJid.endsWith('@lid')) && rawJid) {
      pJid = (await pnOf(sock, rawJid, lidMap)) || rawJid;
    }
    if (!pJid) continue;
    const resolved = !pJid.endsWith('@lid');
    const num = jidToNumber(pJid);
    const isBot = num === botNumber;
    // Nombre visible del participante (metadata): se usa cuando no se pudo
    // resolver su número, para no mostrar nunca los dígitos de su LID.
    const entry = findMetaEntry(meta, rawJid);
    const displayName = entry?.notify || entry?.name || '';

    // ── .autoadmin: el bot y el owner se hacen admin automáticamente ──────
    // Solo si el owner lo activó ({prefix}autoadmin on). Todo es silencioso
    // en el grupo: WhatsApp puede rechazar el ascenso.
    if (db().autoAdmin) {
      if (action === 'add' && isBot) {
        const botEntry = findBotEntry(sock, meta);
        const botAdmin = botEntry?.admin === 'admin' || botEntry?.admin === 'superadmin';
        if (botAdmin) {
          await promoteOwners(sock, id, meta, ownerNums);
        } else {
          const self = await tryPromote(sock, id, rawJid);
          if (self) await promoteOwners(sock, id, meta, ownerNums);
          else await notifyOwnerAdminRejected(sock, id, groupName);
        }
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
        const eff = effectiveSettings(subbotForSock(sock));
        const text = `⚡ *¡GRACIAS POR INVITARME!*\n\nSoy *${eff.botName}*, tu bot de confianza.\n\n📜 Escribe *${eff.prefix}menu* para ver todos mis comandos.\n\n🌩️ _Respiración del Trueno, activada._`;
        try {
          const sent = await sock.sendMessage(id, { text: withWatermark(text) });
          trackSent(sent);
        } catch {}
        continue;
      }
      if (!g.welcome) continue;
      const template = g.welcomeText || DEFAULT_WELCOME;
      // {user}: @número real con ping si se resolvió; si no, el nombre del
      // contacto (o un apodo). Jamás los dígitos del LID.
      const user = resolved ? `@${num}` : displayName || 'nuevo cazador';
      const text = render(template, { user, group: groupName, count, desc });
      try {
        const sent = await sock.sendMessage(id, {
          text: withWatermark(text),
          mentions: resolved ? [pJid] : [],
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
      // Autor: en grupos LID, authorPn trae el número real. Si falta, se
      // resuelve su LID con el almacén de la sesión.
      let authorJid = toJid(update.authorPn) || '';
      if (!authorJid || authorJid.endsWith('@lid')) {
        authorJid = (await pnOf(sock, toJid(update.author), lidMap)) || '';
      }
      const authorNum = jidToNumber(authorJid);
      const botName = effectiveSettings(subbotForSock(sock)).botName;
      const repo = 'https://github.com/jhondzn03-bit';
      // Quién lo hizo: si fue el bot (.promote/.demote) se acredita al bot.
      const byHuman = authorJid && authorNum !== botNumber && authorNum !== num;
      const byLine = byHuman
        ? `💐﹕ *${promote ? 'Ascendido' : 'Degradado'} por:* ─◦ @${authorNum}`
        : `💐﹕ *${promote ? 'Ascendido' : 'Degradado'} por:* ─◦ ⚡ ${botName}`;
      const target = resolved ? `@${num}` : displayName || 'un miembro';
      const head = promote
        ? `˚👻 *Nuevo administrador* 𐔌 ${target}`
        : `˚🥀 *Administrador removido* 𐔌 ${target}`;
      const text = `${head}\n\n${byLine}\n\n✿ ${repo}`;
      const mentions = [];
      if (resolved) mentions.push(pJid);
      if (byHuman) mentions.push(authorJid);
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
      const template = g.goodbyeText || DEFAULT_GOODBYE;
      const user = resolved ? `@${num}` : displayName || 'un cazador';
      const text = render(template, { user, group: groupName, count, desc });
      try {
        const sent = await sock.sendMessage(id, {
          text: withWatermark(text),
          mentions: resolved ? [pJid] : [],
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
    let authorJid =
      [msg.key.participantAlt, msg.key.participant, msg.participant]
        .map((a) => {
          const j = toJid(a);
          return lidMap.get(j) || j;
        })
        .find((j) => j && !j.endsWith('@lid')) || '';
    if (!authorJid) authorJid = (await pnOf(sock, toJid(msg.key.participant), lidMap)) || '';
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
