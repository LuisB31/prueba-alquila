/**
 * /api/assistant — chat con el asistente inmobiliario.
 */
const { Router } = require('express');
const assistant = require('../services/assistant.service');
const { requireRegistered } = require('../middleware/demoPlan');
const { requireText } = require('../middleware/validate');

const router = Router();

/** POST /api/assistant/chat  Body: { message }  →  { reply } */
router.post('/chat', requireRegistered, (req, res) => {
  const message = requireText(req.body?.message, 'message', { max: 500 });
  res.json({ reply: assistant.reply(message) });
});

module.exports = router;
