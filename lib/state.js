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

// Máximo de grupos en caché y cuánto dura cada uno. Los metadatos de grupo
// casi no cambian (y se invalidan solos con cada evento de grupo), así que
// 2 minutos evita re-pedirlos a WhatsApp en cada comando administrativo.
const GROUP_META_TTL = 120000;
const GROUP_META_MAX = 200;

export async function getGroupMetadata(sock, jid, ttl = GROUP_META_TTL) {
  const cached = groupMetaCache.get(jid);
  if (cached && Date.now() - cached.at < ttl) return cached.meta;
  const meta = await sock.groupMetadata(jid);
  groupMetaCache.set(jid, { at: Date.now(), meta });
  // Expulsa los más viejos si la caché crece demasiado (anti fuga de memoria).
  if (groupMetaCache.size > GROUP_META_MAX) {
    const entries = [...groupMetaCache.entries()].sort((a, b) => a[1].at - b[1].at);
    for (let i = 0; i < entries.length - GROUP_META_MAX; i++) groupMetaCache.delete(entries[i][0]);
  }
  return meta;
}

export function invalidateGroupMeta(jid) {
  if (jid) groupMetaCache.delete(jid);
  else groupMetaCache.clear();
}
