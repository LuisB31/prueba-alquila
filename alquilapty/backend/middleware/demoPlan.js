/**
 * Identifica el plan de la cuenta demo que hace la petición.
 *
 * El frontend envía `X-Demo-Plan: visitor | free | premium | holding`.
 * Si falta, se asume "free". El valor queda disponible en `req.plan`.
 *
 * ⚠️ Esto SOLO sirve para la demo con el simulador de planes. En producción
 * el plan debe salir de una sesión autenticada (JWT, cookie de sesión…),
 * nunca de una cabecera que el cliente pueda falsificar.
 */
const { PLANS } = require('../config');
const { HttpError } = require('./errors');

function demoPlan(req, res, next) {
  const plan = (req.get('X-Demo-Plan') || 'free').toLowerCase();
  if (!PLANS.includes(plan)) return next(new HttpError(400, `Plan inválido. Usa uno de: ${PLANS.join(', ')}.`));
  req.plan = plan;
  return next();
}

/** Bloquea la ruta para visitantes no registrados. */
function requireRegistered(req, res, next) {
  if (req.plan === 'visitor') return next(new HttpError(403, 'Crea una cuenta gratis para usar esta función.'));
  return next();
}

module.exports = { demoPlan, requireRegistered };
