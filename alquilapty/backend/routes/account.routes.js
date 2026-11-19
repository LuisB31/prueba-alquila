/**
 * /api/accounts, /api/holding, /api/rewards — perfil, equipo de agencia y puntos.
 */
const { Router } = require('express');
const account = require('../services/account.service');
const { requireRegistered, requireHolding } = require('../middleware/demoPlan');
const { requireText, optionalNumber } = require('../middleware/validate');
const { HttpError, asyncHandler } = require('../middleware/errors');
const db = require('../services/db');

const router = Router();

/** GET /api/accounts/me — perfil + puntos del plan activo (cabecera X-Demo-Plan) */
router.get('/accounts/me', (req, res) => {
  res.json(account.getAccount(req.plan));
});

// Todo /holding/* es exclusivo del plan Holding
router.use('/holding', requireHolding);

/** GET /api/holding/team */
router.get('/holding/team', (req, res) => {
  res.json(account.getTeam());
});

/** GET /api/holding/stats — datos del gráfico de rendimiento mensual */
router.get('/holding/stats', (req, res) => {
  res.json(account.holdingStats());
});

/** POST /api/holding/switch  Body: { name, password } */
router.post('/holding/switch', asyncHandler(async (req, res) => {
  const name = requireText(req.body?.name, 'name', { max: 80 });
  const team = account.switchTeamMember(name, String(req.body?.password || ''));
  await db.saveHoldingCurrent(name);
  res.json({ ...team, message: `✅ Ahora estás administrando la cuenta de ${name} dentro del Holding Panacasas.` });
}));

/** POST /api/holding/invite */
router.post('/holding/invite', (req, res) => {
  res.json(account.inviteMember());
});

/** POST /api/rewards/redeem  Body: { item, cost } */
router.post('/rewards/redeem', requireRegistered, asyncHandler(async (req, res) => {
  const item = requireText(req.body?.item, 'item', { max: 100 });
  const cost = optionalNumber(req.body?.cost, { min: 1, max: 100000, label: 'cost' });
  if (cost === undefined) throw new HttpError(400, 'El campo "cost" es obligatorio.');
  const result = account.redeem(req.plan, item, cost);
  await db.saveAccount(account.rawAccount(req.plan));
  res.json({ ...result, message: `¡Éxito! Has canjeado "${item}" por ${cost} puntos.` });
}));

module.exports = router;
