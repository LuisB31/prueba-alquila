/**
 * /api/accounts, /api/holding, /api/rewards — perfil, actividad, empresa y puntos.
 */
const { Router } = require('express');
const account = require('../services/account.service');
const holding = require('../services/holding.service');
const { requireRegistered, requireHolding } = require('../middleware/demoPlan');
const { requireText, optionalNumber, requireId } = require('../middleware/validate');
const { HttpError, asyncHandler } = require('../middleware/errors');
const db = require('../services/db');

const router = Router();

/** GET /api/accounts/me — perfil + puntos de quien hace la petición */
router.get('/accounts/me', (req, res) => {
  res.json(account.toAccount(req.user, { session: Boolean(req.token) }));
});

/** GET /api/accounts/me/activity — mis propiedades (venta/alquiler) e historial */
router.get('/accounts/me/activity', requireRegistered, (req, res) => {
  res.json(account.activity(req.user));
});

// Todo /holding/* es exclusivo del plan Holding
router.use('/holding', requireHolding);

/** GET /api/holding/team — empresa, código, agentes y espacios libres */
router.get('/holding/team', (req, res) => {
  res.json(holding.getTeam(req.user));
});

/** GET /api/holding/stats — propiedades de la empresa, conteos e ingresos */
router.get('/holding/stats', (req, res) => {
  res.json(holding.getStats(req.user));
});

/** POST /api/holding/agents  Body: { firstName, lastName, email, password, code } */
router.post('/holding/agents', asyncHandler(async (req, res) => {
  const { agent, company, team } = holding.addAgent(req.user, req.body || {});
  await db.saveUser(agent);
  await db.saveCompany(company);
  res.status(201).json({ ...team, message: `✅ ${agent.firstName} ${agent.lastName} ahora es agente de ${company.name}.` });
}));

/** POST /api/holding/switch  Body: { userId, password } */
router.post('/holding/switch', asyncHandler(async (req, res) => {
  const targetId = requireId(req.body?.userId, 'userId');
  const { company, target, team } = holding.switchMember(req.user, targetId, String(req.body?.password || ''), req.token);
  if (req.token) await db.saveSession(req.token, target.id);
  else await db.saveCompany(company);
  res.json({
    ...team,
    account: account.toAccount(target, { session: Boolean(req.token) }),
    message: `✅ Ahora estás usando la cuenta de ${account.fullName(target)} en ${company.name}.`,
  });
}));

/** POST /api/rewards/redeem  Body: { item, cost } */
router.post('/rewards/redeem', requireRegistered, asyncHandler(async (req, res) => {
  const item = requireText(req.body?.item, 'item', { max: 100 });
  const cost = optionalNumber(req.body?.cost, { min: 1, max: 100000, label: 'cost' });
  if (cost === undefined) throw new HttpError(400, 'El campo "cost" es obligatorio.');
  const result = account.redeem(req.user, item, cost);
  await db.saveUser(req.user);
  res.json({ ...result, message: `¡Éxito! Has canjeado "${item}" por ${cost} puntos.` });
}));

module.exports = router;
