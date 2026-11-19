/**
 * Identifica el plan de la cuenta demo que hace la petición y protege rutas por rol.
 *
 * El frontend envía `X-Demo-Plan: visitor | free | premium | holding`.
 * Si falta, se asume "free". El valor queda disponible en `req.plan`.
 *
 * Roles:
 *   visitor  → solo puede mirar (listado, detalle, mapa, subastas, ROI, comparador).
 *   free / premium / holding → cuentas registradas: contactar, ofertar, publicar, IA, puntos.
 *   holding  → además, el panel de inmobiliaria (equipo, cambio de cuenta, estadísticas).
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

/** Solo cuentas Holding (inmobiliarias). */
function requireHolding(req, res, next) {
  if (req.plan !== 'holding') return next(new HttpError(403, 'El panel de inmobiliaria es exclusivo del plan Holding.'));
  return next();
}

module.exports = { demoPlan, requireRegistered, requireHolding };
