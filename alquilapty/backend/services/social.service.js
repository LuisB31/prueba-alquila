/**
 * Favoritos y chat entre interesados y propietarios.
 *
 * Favoritos: cada usuario guarda las propiedades que le interesan.
 *
 * Chat: una conversación por (propiedad, interesado). Participan solo dos
 * personas: el interesado (`buyerId`) y quien publicó la propiedad (`ownerId`).
 * Solo se puede chatear sobre propiedades publicadas por un usuario de la
 * plataforma (las de ejemplo sin dueño real no tienen chat).
 *
 * Los "no leídos" se calculan con `lastRead[userId]` = id del último mensaje
 * que esa persona vio en la conversación.
 *
 * Las funciones `build*` y `apply*` separan "preparar" de "aplicar en memoria":
 * las rutas guardan primero en la BD y solo después aplican, para que memoria
 * y base de datos no se separen si PostgreSQL falla.
 */
const store = require('./store');
const { HttpError } = require('../middleware/errors');
const properties = require('./properties.service');

const MAX_MESSAGE = 1000;

const findUser = (id) => store.users.find((u) => u.id === id) || null;
const fullName = (u) => (u ? `${u.firstName} ${u.lastName}` : 'Usuario');

// ---------------------------------------------------------------------------
// Favoritos
// ---------------------------------------------------------------------------

const favoriteKey = (userId, propertyId) => `${userId}:${propertyId}`;
const isFavorite = (user, propertyId) => store.favorites.some((f) => f.userId === user.id && f.propertyId === propertyId);

/** Favoritos del usuario, más recientes primero (se omiten propiedades que ya no existen). */
function listFavorites(user) {
  // store.favorites está en orden de guardado (también al cargar de la BD): el último primero
  const mine = store.favorites.filter((f) => f.userId === user.id).reverse();
  const items = mine
    .map((f) => store.properties.find((p) => p.id === f.propertyId))
    .filter(Boolean)
    .map((p) => ({ ...properties.toSummary(p), sold: Boolean(p.soldTo) }));
  return { ids: items.map((p) => p.id), items };
}

/** Prepara un favorito nuevo (null si ya lo era). Lanza 404 si la propiedad no existe. */
function buildFavorite(user, propertyId) {
  properties.findById(propertyId);
  if (isFavorite(user, propertyId)) return null;
  return { id: favoriteKey(user.id, propertyId), userId: user.id, propertyId, createdAt: new Date().toISOString() };
}

const applyFavorite = (fav) => { if (fav) store.favorites.push(fav); };

function removeFavorite(user, propertyId) {
  const before = store.favorites.length;
  store.favorites = store.favorites.filter((f) => !(f.userId === user.id && f.propertyId === propertyId));
  return store.favorites.length !== before;
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

const messagesOf = (conversationId) => store.chatMessages.filter((m) => m.conversationId === conversationId);
const isParticipant = (c, user) => c.buyerId === user.id || c.ownerId === user.id;

/** Conversación de la que el usuario forma parte (404 si no existe o no es suya). */
function getConversation(user, id) {
  const c = store.conversations.find((x) => x.id === id);
  if (!c || !isParticipant(c, user)) throw new HttpError(404, 'Conversación no encontrada.');
  return c;
}

function unreadCount(c, user) {
  const seen = c.lastRead?.[user.id] || 0;
  return messagesOf(c.id).filter((m) => m.senderId !== user.id && m.id > seen).length;
}

const messageView = (m, user) => ({
  id: m.id, text: m.text, createdAt: m.createdAt, senderId: m.senderId, mine: m.senderId === user.id,
});

/** Resumen de una conversación tal como la ve `user`. */
function conversationView(c, user) {
  const property = store.properties.find((p) => p.id === c.propertyId);
  const otherId = c.buyerId === user.id ? c.ownerId : c.buyerId;
  const other = findUser(otherId);
  const msgs = messagesOf(c.id);
  const last = msgs[msgs.length - 1];
  return {
    id: c.id,
    role: c.buyerId === user.id ? 'interesado' : 'propietario',
    property: property
      ? { id: property.id, title: property.title, img: property.img, zone: property.zone, price: property.price, txType: property.txType }
      : { id: c.propertyId, title: 'Propiedad no disponible' },
    other: { id: otherId, name: fullName(other), avatar: other?.avatar || null },
    lastMessage: last ? { text: last.text, createdAt: last.createdAt, mine: last.senderId === user.id } : null,
    lastMessageAt: c.lastMessageAt,
    unread: unreadCount(c, user),
  };
}

/** Bandeja de entrada: conversaciones del usuario (como interesado o propietario). */
function listConversations(user) {
  const items = store.conversations
    .filter((c) => isParticipant(c, user))
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
    .map((c) => conversationView(c, user));
  return { unread: items.reduce((s, c) => s + c.unread, 0), items };
}

function cleanText(text) {
  const s = typeof text === 'string' ? text.trim() : '';
  if (!s) throw new HttpError(400, 'Escribe un mensaje.');
  if (s.length > MAX_MESSAGE) throw new HttpError(400, `El mensaje no puede superar ${MAX_MESSAGE} caracteres.`);
  return s;
}

/**
 * Prepara (sin aplicar) abrir el chat de una propiedad: reutiliza la
 * conversación existente o crea una nueva. Con `text`, prepara también el
 * primer mensaje.
 * @returns {{ conversation, created, message }}
 */
function buildOpenChat(user, propertyId, text) {
  const property = properties.findById(propertyId);
  if (!property.ownerUserId) {
    throw new HttpError(409, 'Este anuncio de ejemplo no tiene un propietario registrado con quien chatear.');
  }
  if (property.ownerUserId === user.id) throw new HttpError(400, 'Es tu propia propiedad: los interesados te escribirán aquí.');

  const existing = store.conversations.find((c) => c.propertyId === propertyId && c.buyerId === user.id);
  const now = new Date().toISOString();
  const conversation = existing ? { ...existing } : {
    id: store.nextId(store.conversations),
    propertyId,
    buyerId: user.id,
    ownerId: property.ownerUserId,
    createdAt: now,
    lastMessageAt: now,
    lastRead: {},
  };
  const message = text === undefined || text === null || text === '' ? null : buildMessageFor(conversation, user, text);
  if (message) conversation.lastMessageAt = message.createdAt;
  return { conversation, created: !existing, message };
}

function buildMessageFor(conversation, user, text) {
  const message = {
    id: store.nextId(store.chatMessages),
    conversationId: conversation.id,
    senderId: user.id,
    text: cleanText(text),
    createdAt: new Date().toISOString(),
  };
  // Quien escribe ya "leyó" hasta su propio mensaje
  conversation.lastRead = { ...conversation.lastRead, [user.id]: message.id };
  return message;
}

/** Prepara un mensaje en una conversación existente del usuario. */
function buildMessage(user, conversationId, text) {
  const conversation = { ...getConversation(user, conversationId) };
  const message = buildMessageFor(conversation, user, text);
  conversation.lastMessageAt = message.createdAt;
  return { conversation, message };
}

/** Aplica en memoria una conversación (nueva o actualizada) y, si hay, su mensaje. */
function applyChat(conversation, message) {
  const i = store.conversations.findIndex((c) => c.id === conversation.id);
  if (i >= 0) store.conversations[i] = conversation; else store.conversations.push(conversation);
  if (message) store.chatMessages.push(message);
}

/**
 * Mensajes de una conversación (desde `afterId`, para actualizar sin recargar todo).
 * Devuelve también la conversación con `lastRead` actualizado si hubo mensajes nuevos
 * (`changed`), para que la ruta la guarde.
 */
function readMessages(user, conversationId, afterId = 0) {
  const current = getConversation(user, conversationId);
  const all = messagesOf(current.id);
  const lastId = all.length ? all[all.length - 1].id : 0;
  const changed = (current.lastRead?.[user.id] || 0) < lastId;
  const conversation = changed ? { ...current, lastRead: { ...current.lastRead, [user.id]: lastId } } : current;
  return {
    conversation,
    changed,
    view: conversationView(conversation, user),
    messages: all.filter((m) => m.id > afterId).map((m) => messageView(m, user)),
  };
}

module.exports = {
  listFavorites, buildFavorite, applyFavorite, removeFavorite, isFavorite,
  listConversations, buildOpenChat, buildMessage, applyChat, readMessages, messageView, conversationView,
};
