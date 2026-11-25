/**
 * Cliente de la API REST (única puerta de comunicación frontend → backend).
 *
 * Ningún otro módulo usa `fetch` directamente. Esta capa se encarga de:
 *   • construir la URL y enviar JSON con la cabecera del plan demo (X-Demo-Plan)
 *   • convertir cualquier fallo en un `ApiError` con un mensaje listo para mostrar
 *   • cancelar peticiones obsoletas ("la última gana") para evitar que una
 *     respuesta lenta pise a una más reciente (p. ej. al mover un filtro)
 *   • poner un tiempo máximo de espera
 *   • memorizar datos que casi nunca cambian (destinos, puntos de interés)
 */
import { API_BASE, REQUEST_TIMEOUT_MS } from './config.js';
import { state } from './state.js';

/** Error de la API: `status` 0 significa "no hubo respuesta" (red/timeout). */
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

/** ¿Se canceló la petición porque llegó otra más nueva? (se ignora sin avisar al usuario) */
export const isSuperseded = (error) => error?.name === 'AbortError';

/** Peticiones en curso por "clave": al lanzar otra con la misma clave, la anterior se cancela. */
const inFlight = new Map();

/**
 * @param {string} path             Ruta relativa a la API, p. ej. "/properties".
 * @param {object} [options]
 * @param {string} [options.method] GET por defecto.
 * @param {object} [options.query]  Parámetros de URL (se omiten vacíos y `false`).
 * @param {object} [options.body]   Cuerpo JSON.
 * @param {string} [options.key]    Clave para cancelar la petición anterior equivalente.
 */
async function request(path, { method = 'GET', query, body, key } = {}) {
  const url = new URL(API_BASE + path, window.location.href);
  for (const [name, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    url.searchParams.set(name, value);
  }

  const controller = new AbortController();
  if (key) {
    inFlight.get(key)?.abort();
    inFlight.set(key, controller);
  }
  const timer = setTimeout(
    () => controller.abort(new DOMException('Tiempo de espera agotado', 'TimeoutError')),
    REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-Plan': state.plan,
        ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError(response.status, data?.error?.message || `Error ${response.status}`, data?.error?.details);
    }
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error?.name === 'TimeoutError') {
      throw new ApiError(0, 'El servidor tardó demasiado en responder. Inténtalo de nuevo.');
    }
    if (error?.name === 'AbortError') throw error; // reemplazada por una petición más nueva
    throw new ApiError(0, 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.');
  } finally {
    clearTimeout(timer);
    if (key && inFlight.get(key) === controller) inFlight.delete(key);
  }
}

/** Memoriza el resultado de una función sin argumentos (y lo olvida si falla). */
function memoize(fn) {
  let cached;
  return () => {
    cached ??= fn().catch((error) => { cached = undefined; throw error; });
    return cached;
  };
}

const get = (path, query, key) => request(path, { query, key });
const post = (path, body) => request(path, { method: 'POST', body: body ?? {} });
const del = (path) => request(path, { method: 'DELETE' });

/**
 * Catálogo de endpoints. Cada función devuelve una Promesa con el JSON de la respuesta.
 * (Consulta backend/routes/* para ver el detalle de cada recurso.)
 */
export const api = {
  // ---- Propiedades --------------------------------------------------------
  // Cada consumidor usa su propia clave de cancelación: así una petición no cancela
  // a otra distinta (p. ej. el listado de Inicio y el selector del comparador).
  listProperties: (filters) => get('/properties', filters, 'feed'),
  allProperties: () => get('/properties', { tx: 'ambos' }, 'catalog'),
  getProperty: (id) => get(`/properties/${id}`),
  getCommute: (id, destination) => get(`/properties/${id}/commute`, { dest: destination }),
  commuteDestinations: memoize(() => get('/properties/commute-destinations')),
  topNeighborhoods: () => get('/properties/top-neighborhoods'),
  nearbyProperties: () => get('/properties/nearby'),
  contactOwner: (id) => post(`/properties/${id}/contact`),
  acquireProperty: (id) => post(`/properties/${id}/acquire`),
  publishProperty: (data) => post('/properties', data),

  // ---- Subastas -----------------------------------------------------------
  listAuctions: () => get('/auctions'),
  sendOffer: (id, offer) => post(`/auctions/${id}/offers`, offer),

  // ---- Roommates ----------------------------------------------------------
  listRoommates: (filters) => get('/roommates', filters, 'roommates'),
  getRoommate: (id) => get(`/roommates/${id}`),
  saveRoommateProfile: (profile) => post('/roommates/profile', profile),
  messageRoommate: (id, text) => post(`/roommates/${id}/messages`, { text }),

  // ---- Análisis -----------------------------------------------------------
  saleProperties: () => get('/investments/sale-properties'),
  getInvestment: (id, { downPct, years }) => get(`/investments/${id}`, { downPct, years }, 'investment'),
  compare: (ids) => get('/comparison', { ids: ids.join(',') }, 'compare'),

  // ---- Mapa ---------------------------------------------------------------
  mapPins: (filters) => get('/map/pins', filters, 'map'),
  mapPois: memoize(() => get('/map/pois')),

  // ---- Asistente ----------------------------------------------------------
  chat: (message) => post('/assistant/chat', { message }),

  // ---- Sesión ---------------------------------------------------------------
  register: (data) => post('/auth/register', data),
  login: (email, password) => post('/auth/login', { email, password }),
  logout: () => post('/auth/logout'),
  session: () => get('/auth/session'),

  // ---- Cuenta, puntos y Holding ------------------------------------------
  me: () => get('/accounts/me', undefined, 'me'),
  activity: () => get('/accounts/me/activity', undefined, 'activity'),
  redeem: (item, cost) => post('/rewards/redeem', { item, cost }),
  holdingTeam: () => get('/holding/team', undefined, 'holding-team'),
  holdingStats: () => get('/holding/stats', undefined, 'holding-stats'),
  switchHoldingUser: (userId, password) => post('/holding/switch', { userId, password }),
  addHoldingAgent: (data) => post('/holding/agents', data),

  // ---- Favoritos y chat ---------------------------------------------------
  favorites: () => get('/favorites', undefined, 'favorites'),
  addFavorite: (propertyId) => post(`/favorites/${propertyId}`),
  removeFavorite: (propertyId) => del(`/favorites/${propertyId}`),
  chats: () => get('/chats', undefined, 'chats'),
  openChat: (propertyId, text) => post('/chats', { propertyId, text }),
  chatMessages: (id, after) => get(`/chats/${id}`, { after }, 'chat-thread'),
  sendChatMessage: (id, text) => post(`/chats/${id}/messages`, { text }),
};
