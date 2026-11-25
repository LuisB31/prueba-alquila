/**
 * /api/favorites y /api/chats — favoritos y chat entre interesados y propietarios.
 * Todo exige cuenta (visitantes: 403).
 *
 *   GET    /api/favorites                 mis favoritos { ids, items }
 *   POST   /api/favorites/:propertyId     marcar como favorito
 *   DELETE /api/favorites/:propertyId     quitar de favoritos
 *
 *   GET    /api/chats                     bandeja { unread, items }
 *   POST   /api/chats                     { propertyId, text? } abre (o reutiliza) el chat con el dueño
 *   GET    /api/chats/:id?after=N         mensajes (desde el id N) y marca como leídos
 *   POST   /api/chats/:id/messages        { text } envía un mensaje
 *
 * En cada escritura se guarda primero en la BD y después se aplica en memoria.
 */
const { Router } = require('express');
const social = require('../services/social.service');
const account = require('../services/account.service');
const db = require('../services/db');
const { POINTS } = require('../config');
const { requireRegistered } = require('../middleware/demoPlan');
const { requireId, optionalNumber } = require('../middleware/validate');
const { asyncHandler } = require('../middleware/errors');

const router = Router();
router.use(['/favorites', '/chats'], requireRegistered);

// ---- Favoritos -------------------------------------------------------------

router.get('/favorites', (req, res) => {
  res.json(social.listFavorites(req.user));
});

router.post('/favorites/:propertyId', asyncHandler(async (req, res) => {
  const fav = social.buildFavorite(req.user, requireId(req.params.propertyId, 'propertyId'));
  if (fav) await db.saveFavorite(fav);
  social.applyFavorite(fav);
  res.status(fav ? 201 : 200).json({ favorite: true, message: '❤️ Guardada en tus favoritos.' });
}));

router.delete('/favorites/:propertyId', asyncHandler(async (req, res) => {
  const propertyId = requireId(req.params.propertyId, 'propertyId');
  await db.deleteFavorite(req.user.id, propertyId);
  social.removeFavorite(req.user, propertyId);
  res.json({ favorite: false, message: 'Quitada de tus favoritos.' });
}));

// ---- Chat -------------------------------------------------------------------

router.get('/chats', (req, res) => {
  res.json(social.listConversations(req.user));
});

router.post('/chats', asyncHandler(async (req, res) => {
  const propertyId = requireId(req.body?.propertyId, 'propertyId');
  const { conversation, created, message } = social.buildOpenChat(req.user, propertyId, req.body?.text);

  await db.saveConversation(conversation);
  if (message) await db.saveChatMessage(message);
  social.applyChat(conversation, message);

  // Primer contacto con el propietario: suma puntos (antes lo hacía "Contactar")
  let points = req.user.points;
  if (created) {
    points = account.addPoints(req.user, POINTS.contactOwner);
    await db.saveUser(req.user);
  }

  const { view, messages } = social.readMessages(req.user, conversation.id);
  res.status(created ? 201 : 200).json({
    conversation: view,
    messages,
    created,
    points,
    pointsAwarded: created ? POINTS.contactOwner : 0,
  });
}));

router.get('/chats/:id', asyncHandler(async (req, res) => {
  const afterId = optionalNumber(req.query.after, { min: 0, label: 'after', fallback: 0 });
  const result = social.readMessages(req.user, requireId(req.params.id), afterId);
  if (result.changed) {
    await db.saveConversation(result.conversation);
    social.applyChat(result.conversation);
  }
  res.json({ conversation: result.view, messages: result.messages });
}));

router.post('/chats/:id/messages', asyncHandler(async (req, res) => {
  const { conversation, message } = social.buildMessage(req.user, requireId(req.params.id), req.body?.text);
  await db.saveChatMessage(message);
  await db.saveConversation(conversation);
  social.applyChat(conversation, message);
  res.status(201).json({ message: social.messageView(message, req.user) });
}));

module.exports = router;
