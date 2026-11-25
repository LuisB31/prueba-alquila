/**
 * /api/auth — registro, inicio y cierre de sesión.
 *
 *   POST /api/auth/register  { plan, firstName, lastName, email, password, companyName?, payment? }
 *   POST /api/auth/login     { email, password }
 *   POST /api/auth/logout    (con Authorization: Bearer <token>)
 *   GET  /api/auth/session   perfil de la sesión actual (401 si no hay sesión)
 */
const { Router } = require('express');
const account = require('../services/account.service');
const { requireSession } = require('../middleware/demoPlan');
const { asyncHandler } = require('../middleware/errors');
const db = require('../services/db');

const router = Router();

const PLAN_NAMES = { free: 'Free', premium: 'Premium', holding: 'Holding' };

router.post('/register', asyncHandler(async (req, res) => {
  const { user, company, token, receipt } = account.register(req.body || {});
  await db.saveUser(user);
  if (company) await db.saveCompany(company);
  await db.saveSession(token, user.id);

  res.status(201).json({
    token,
    account: account.toAccount(user, { session: true }),
    company: company ? { id: company.id, name: company.name, code: company.code } : null,
    receipt,
    message: company
      ? `🏢 ¡${company.name} quedó registrada! Código de empresa: ${company.code}. Guárdalo: lo necesitarás para agregar agentes.`
      : `✅ ¡Bienvenido/a, ${user.firstName}! Tu cuenta ${PLAN_NAMES[user.plan]} está lista.`,
  });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { user, token } = account.login(req.body?.email, req.body?.password);
  await db.saveSession(token, user.id);
  res.json({ token, account: account.toAccount(user, { session: true }), message: `👋 Hola de nuevo, ${user.firstName}.` });
}));

router.post('/logout', requireSession, asyncHandler(async (req, res) => {
  account.logout(req.token);
  await db.deleteSession(req.token);
  res.json({ message: 'Sesión cerrada.' });
}));

router.get('/session', requireSession, (req, res) => {
  res.json(account.toAccount(req.user, { session: true }));
});

module.exports = router;
