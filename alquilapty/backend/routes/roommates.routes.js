/**
 * /api/roommates — búsqueda de compañeros de habitación.
 */
const { Router } = require('express');
const roommates = require('../services/roommates.service');
const { requireRegistered } = require('../middleware/demoPlan');
const { requireId, asBool, optionalText, optionalNumber } = require('../middleware/validate');
const { asyncHandler } = require('../middleware/errors');
const db = require('../services/db');

const router = Router();

/** GET /api/roommates?gender=&age=&occupation=&schedule=&pets= */
router.get('/', (req, res) => {
  const q = req.query;
  const items = roommates.search({
    gender: q.gender, age: q.age, occupation: q.occupation, schedule: q.schedule, petsOnly: asBool(q.pets),
  });
  res.json({ total: items.length, items });
});

/**
 * POST /api/roommates/profile — guarda el perfil del usuario (solo registrados)
 * Va ANTES de "/:id" para que "profile" no se interprete como un id.
 */
router.post('/profile', requireRegistered, asyncHandler(async (req, res) => {
  const b = req.body || {};
  const record = roommates.saveProfile(req.plan, {
    about: optionalText(b.about, { max: 500 }),
    schedule: optionalText(b.schedule, { max: 30 }),
    clean: optionalText(b.clean, { max: 30 }),
    social: optionalText(b.social, { max: 30 }),
    smoker: optionalText(b.smoker, { max: 30 }),
    pets: { dog: asBool(b.pets?.dog), cat: asBool(b.pets?.cat), accept: asBool(b.pets?.accept) },
    budget: optionalNumber(b.budget, { min: 0, max: 100000, label: 'budget' }),
    moveDate: optionalText(b.moveDate, { max: 20 }),
  });
  await db.saveRoommateProfile(record);
  res.status(201).json({ message: '✅ ¡Tu perfil de roommate se ha guardado correctamente! Ahora otros usuarios podrán encontrarte.' });
}));

/** GET /api/roommates/:id */
router.get('/:id', (req, res) => {
  res.json(roommates.findById(requireId(req.params.id)));
});

/** POST /api/roommates/:id/messages — envía un mensaje al roommate */
router.post('/:id/messages', requireRegistered, asyncHandler(async (req, res) => {
  const { roommate, message } = roommates.sendMessage(requireId(req.params.id), req.plan, optionalText(req.body?.text, { max: 500 }));
  await db.saveMessage(roommate.id, message);
  res.status(201).json({ message: `💬 Mensaje enviado a ${roommate.name}. Te avisaremos cuando responda.` });
}));

module.exports = router;
