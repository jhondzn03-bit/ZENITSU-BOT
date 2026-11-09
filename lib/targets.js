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

export function findParticipant(meta, jid) {
  const num = jidToNumber(jid);
  return meta?.participants?.find((p) => jidToNumber(p.id) === num);
}

export function isGroupAdmin(meta, jid) {
  const p = findParticipant(meta, jid);
  return p?.admin === 'admin' || p?.admin === 'superadmin';
}

export function isBotGroupAdmin(meta, botJid) {
  return isGroupAdmin(meta, botJid);
}
