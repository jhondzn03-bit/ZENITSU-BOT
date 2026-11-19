// ─── Verificador de enlaces oficiales de Delta Executor (.delta) ───────────
// SOLO LECTURA. Este módulo no envía cookies, tokens, contraseñas ni ningún
// dato privado, y NO intenta saltar CAPTCHAs, anuncios, challenges de
// Cloudflare ni verificaciones de acceso. Abre la página pública con un GET
// normal, comprueba el estado y devuelve una clave SOLAMENTE si el sitio
// oficial la expone en su respuesta pública.
import { config } from '../config.js';
import { db } from './db.js';
import { fetchWithTimeout } from './utils.js';

const DEFAULT_DOMAINS = ['delta.app', 'getdelta.io', 'deltaexecutor.com'];
const MAX_REDIRECTS = 3;

const DELTA_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
  'accept-language': 'es-ES,es;q=0.9,en;q=0.8',
};

function normalizeDomain(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
}

// Lista blanca: la configuración del bot + la que el owner haya guardado.
export function allowedDeltaDomains() {
  const fromConfig = Array.isArray(config.deltaDomains) ? config.deltaDomains : [];
  const fromDb = Array.isArray(db().deltaDomains) ? db().deltaDomains : [];
  return [...new Set([...DEFAULT_DOMAINS, ...fromConfig, ...fromDb].map(normalizeDomain).filter(Boolean))];
}

export function setDeltaDomains(list) {
  const clean = [...new Set((Array.isArray(list) ? list : []).map(normalizeDomain).filter(Boolean))];
  db().deltaDomains = clean;
  return clean;
}

export function addDeltaDomain(domain) {
  const clean = normalizeDomain(domain);
  if (!clean || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(clean)) return null;
  const list = allowedDeltaDomains();
  if (!list.includes(clean)) list.push(clean);
  return setDeltaDomains(list);
}

export function removeDeltaDomain(domain) {
  const clean = normalizeDomain(domain);
  const list = allowedDeltaDomains().filter((d) => d !== clean);
  return setDeltaDomains(list);
}

// Valida que sea HTTPS, sin credenciales en la URL y que el host esté en la
// lista blanca exacta (o sea subdominio de ella). Rechaza IP y punycode raro.
export function parseAllowedHttpsUrl(raw, domains = []) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes('xn--')) return null;
  const bare = host.replace(/^www\./, '');
  const allow = domains.map(normalizeDomain);
  const ok = allow.some((d) => bare === d || bare.endsWith(`.${d}`));
  if (!ok) return null;
  return { url: url.toString(), host };
}

export function parseOfficialDeltaUrl(raw, domains = allowedDeltaDomains()) {
  return parseAllowedHttpsUrl(raw, domains);
}

// El enlace de Delta debe ser EXACTAMENTE auth.platorelay.com (ni otro
// subdominio, ni otra extensión del dominio). Es el único host autorizado
// para el flujo principal de .delta.
export function parseAuthPlatoRelayUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host !== 'auth.platorelay.com') return null;
  return { url: url.toString(), host };
}

const DEFAULT_PLATOBOOST_DOMAINS = [
  'platoboost.com',
  'api.platoboost.com',
  'auth.platorelay.com',
];

export function allowedPlatoboostDomains() {
  const fromConfig = Array.isArray(config.platoboostDomains) ? config.platoboostDomains : [];
  const fromDb = Array.isArray(db().platoboostDomains) ? db().platoboostDomains : [];
  return [
    ...new Set(
      [...DEFAULT_PLATOBOOST_DOMAINS, ...fromConfig, ...fromDb].map(normalizeDomain).filter(Boolean),
    ),
  ];
}

export function getPlatoboostEndpoint() {
  return String(db().platoboostEndpoint || config.platoboostEndpoint || '').trim();
}

// Solo se guarda si el host está en la lista blanca de Platoboost.
export function setPlatoboostEndpoint(raw) {
  const parsed = parseAllowedHttpsUrl(raw, allowedPlatoboostDomains());
  if (!parsed) return null;
  db().platoboostEndpoint = parsed.url;
  return parsed.url;
}

export function clearPlatoboostEndpoint() {
  db().platoboostEndpoint = '';
}

// Evita dos peticiones iguales al mismo endpoint al mismo tiempo.
const inFlight = new Map();

const VERIFY_RE =
  /captcha|recaptcha|hcaptcha|verify|verificaci[oó]n|verification|anuncio|advert|watch ad|complete the|human check|challenge/i;
const HTTP_REASONS = {
  400: 'Platoboost rechazó la solicitud (HTTP 400): parámetros inválidos.',
  401: 'Platoboost existe, pero la solicitud no está autorizada (HTTP 401).',
  403: 'Acceso denegado por Platoboost (HTTP 403): hay una verificación de acceso pendiente.',
  404: 'El endpoint de Platoboost no existe (HTTP 404). Revisa la URL configurada.',
  429: 'Platoboost limitó las solicitudes (HTTP 429). Espera unos segundos.',
  500: 'Error interno de Platoboost (HTTP 500). Inténtalo más tarde.',
  502: 'Platoboost no respondió correctamente (HTTP 502).',
  503: 'Platoboost no está disponible ahora (HTTP 503).',
};

// Comprueba UNA sola vez el endpoint autorizado. No envía cookies, tokens ni
// datos del usuario y NO intenta resolver CAPTCHAs, anuncios ni challenges.
export function checkPlatoboostKey(endpoint = getPlatoboostEndpoint()) {
  if (!endpoint) return Promise.resolve({ ok: false, reason: 'not-configured' });
  const parsed = parseAllowedHttpsUrl(endpoint, allowedPlatoboostDomains());
  if (!parsed) return Promise.resolve({ ok: false, reason: 'invalid-endpoint' });
  const url = parsed.url;
  if (inFlight.has(url)) return inFlight.get(url);

  const task = (async () => {
    let res;
    try {
      res = await fetchWithTimeout(
        url,
        { redirect: 'manual', headers: DELTA_HEADERS },
        12000,
      );
    } catch (err) {
      const name = err?.name || '';
      return {
        ok: false,
        reason: name === 'AbortError' ? 'timeout' : 'network',
        detail: err?.message || 'sin conexión',
      };
    }

    const status = res.status || 0;
    const location = res.headers?.get?.('location');
    if ([301, 302, 303, 307, 308].includes(status) && location) {
      let next;
      try {
        next = new URL(location, url).toString();
      } catch {
        return { ok: false, reason: 'invalid-endpoint' };
      }
      if (!parseAllowedHttpsUrl(next, allowedPlatoboostDomains())) {
        return { ok: false, reason: 'redirect-blocked' };
      }
      // No seguimos el redirect: solo informamos del estado real.
      return { ok: false, reason: 'http', status, detail: `redirección a ${new URL(next).hostname}` };
    }

    let text = '';
    try {
      text = await res.text();
    } catch {}

    if (!res.ok) {
      return {
        ok: false,
        reason: 'http',
        status,
        detail: HTTP_REASONS[status] || `Platoboost respondió HTTP ${status}.`,
      };
    }

    // Si el cuerpo pide verificación, el proceso NO está terminado: se informa
    // y se entregan instrucciones, sin intentar saltarlo.
    if (VERIFY_RE.test(text)) {
      return { ok: false, reason: 'verification-required', status };
    }

    const key = findKey(text);
    if (!key) {
      return { ok: false, reason: 'no-key', status };
    }
    return { ok: true, key, status, finalUrl: url };
  })();

  inFlight.set(url, task);
  task.finally(() => inFlight.delete(url)).catch(() => {});
  return task;
}

const CHALLENGE_RE =
  /just a moment|cf-challenge|cf-browser-verification|attention required|checking your browser|verificando|verificaci[oó]n|human verification|are you a robot|enable javascript|access denied|cloudflare/i;
const DONE_RE =
  /verificaci[oó]n (completada|exitosa)|key (generada|lista|obtenida)|your key is|clave (generada|lista|obtenida)/i;
const EXPIRED_RE = /expirad|invalid|inv[aá]lid|not found|p[aá]gina no encontrada/i;

const KEY_PATTERNS = [
  /data-key=["']([A-Za-z0-9_-]{4,64})["']/i,
  /["']?\b(?:delta[_-]?)?key["']?\s*[:=]\s*["']([A-Za-z0-9_-]{4,64})["']/i,
  /\b(?:your\s+)?key\s+is\s*[: ]*([A-Za-z0-9_-]{4,64})/i,
];
const KEY_JUNK_RE = /^(?:null|undefined|none|false|true|pending|wait|captcha|error|yourkey|key|apikey)$/i;

export function findKey(text) {
  for (const re of KEY_PATTERNS) {
    const m = String(text || '').match(re);
    if (m && m[1] && !KEY_JUNK_RE.test(m[1])) return m[1];
  }
  return '';
}

export function statusOf(text, key) {
  if (key) return 'Completada';
  if (EXPIRED_RE.test(text)) return 'Inválida';
  if (DONE_RE.test(text)) return 'Verificación';
  if (CHALLENGE_RE.test(text)) return 'Verificación';
  return 'Verificación';
}

// GET público; si hay redirección la seguimos manualmente validando CADA salto
// contra la lista blanca, para no acabar en un dominio ajeno.
export async function inspectDeltaLink(raw, domains = allowedDeltaDomains()) {
  const first = parseOfficialDeltaUrl(raw, domains);
  if (!first) return { ok: false, reason: 'invalid' };

  let current = first.url;
  let text = '';
  let httpStatus = 0;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res;
    try {
      res = await fetchWithTimeout(
        current,
        { redirect: 'manual', headers: DELTA_HEADERS },
        15000,
      );
    } catch (err) {
      return { ok: false, reason: 'network', detail: err?.message || 'sin conexión' };
    }
    httpStatus = res.status || 0;
    const location = res.headers?.get?.('location');
    if (location && [301, 302, 303, 307, 308].includes(httpStatus)) {
      let next;
      try {
        next = new URL(location, current).toString();
      } catch {
        return { ok: false, reason: 'invalid' };
      }
      const parsed = parseOfficialDeltaUrl(next, domains);
      if (!parsed) return { ok: false, reason: 'redirect-blocked' };
      current = parsed.url;
      continue;
    }
    // 403/404 también son estados útiles: la página existe pero pide
    // verificación o no está disponible. No saltamos esa protección.
    try {
      text = await res.text();
    } catch {
      text = '';
    }
    break;
  }

  const key = findKey(text);
  return {
    ok: true,
    status: statusOf(text, key),
    key,
    httpStatus,
    finalUrl: current,
    protected: CHALLENGE_RE.test(text),
  };
}
