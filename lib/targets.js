import { jidToNumber, numberToJid } from './utils.js';

export function getTargetJid(ctx) {
  if (ctx.mentioned?.length) return ctx.mentioned[0];
  if (ctx.quoted?.sender) return ctx.quoted.sender;
  const num = String(ctx.args?.[0] || '').replace(/\D/g, '');
  if (num.length >= 7 && num.length <= 15) return numberToJid(num);
  return '';
}

export function getTargetJids(ctx) {
  if (ctx.mentioned?.length) return [...new Set(ctx.mentioned)];
  if (ctx.quoted?.sender) return [ctx.quoted.sender];
  const num = String(ctx.args?.[0] || '').replace(/\D/g, '');
  if (num.length >= 7 && num.length <= 15) return [numberToJid(num)];
  return [];
}

// WhatsApp puede identificar a un miembro con su número (@s.whatsapp.net)
// o con un LID (@lid). Comparamos contra todos los identificadores posibles.
export function participantNumbers(participant) {
  return [participant?.id, participant?.phoneNumber, participant?.lid]
    .filter(Boolean)
    .map((value) => jidToNumber(value));
}

export function findParticipant(meta, jid) {
  const num = jidToNumber(jid);
  if (!num) return undefined;
  return meta?.participants?.find((p) => participantNumbers(p).includes(num));
}

export function participantJid(participant) {
  return participant?.phoneNumber || participant?.id || participant?.lid || '';
}

export function isGroupAdmin(meta, jid) {
  const p = findParticipant(meta, jid);
  return p?.admin === 'admin' || p?.admin === 'superadmin';
}

export function isBotGroupAdmin(meta, botJid) {
  return isGroupAdmin(meta, botJid);
}
