export const sentIds = new Set();

export function trackSent(sent) {
  const id = sent?.key?.id;
  if (!id) return;
  sentIds.add(id);
  if (sentIds.size > 800) {
    const first = sentIds.values().next().value;
    sentIds.delete(first);
  }
}

export function wasSent(id) {
  return id ? sentIds.has(id) : false;
}

export const groupMetaCache = new Map();

export async function getGroupMetadata(sock, jid, ttl = 30000) {
  const cached = groupMetaCache.get(jid);
  if (cached && Date.now() - cached.at < ttl) return cached.meta;
  const meta = await sock.groupMetadata(jid);
  groupMetaCache.set(jid, { at: Date.now(), meta });
  return meta;
}

export function invalidateGroupMeta(jid) {
  if (jid) groupMetaCache.delete(jid);
  else groupMetaCache.clear();
}
