/**
 * Identifica quién hace la petición y protege rutas por rol.
 *
 * Dos formas (en este orden):
 *   1. Sesión real: `Authorization: Bearer <token>` (registro / inicio de sesión).
 *      El plan sale del usuario; la cabecera del simulador se ignora.
 *   2. Simulador de planes: `X-Demo-Plan: visitor | free | premium | holding`
 *      (si falta, "free"). Usa las cuentas demo de data/reference.json.
 *
 * Deja disponibles `req.plan`, `req.user` (null para visitantes) y `req.token`.
 *
 * Roles:
 *   visitor  → solo puede mirar (listado, detalle, mapa, subastas, ROI, comparador).
 *   free / premium / holding → cuentas registradas: contactar, ofertar, publicar, IA, puntos.
 *   holding  → además, el panel de la empresa (agentes, código, estadísticas, ingresos).
 */
const { PLANS } = require('../config');
const { HttpError } = require('./errors');

function bearerToken(req) {
  const header = req.get('Authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function demoPlan(req, res, next) {
  const accounts = require('../services/account.service'); // diferido: evita dependencias circulares al cargar

  const token = bearerToken(req);
  if (token) {
    const user = accounts.userFromToken(token);
    if (user) {
      req.user = user;
      req.plan = user.plan;
      req.token = token;
      return next();
    }
    // Token caducado o inválido: se sigue como si no hubiera sesión
  }

  const plan = (req.get('X-Demo-Plan') || 'free').toLowerCase();
  if (!PLANS.includes(plan)) return next(new HttpError(400, `Plan inválido. Usa uno de: ${PLANS.join(', ')}.`));
  req.plan = plan;
  req.user = accounts.demoUserFor(plan);
  req.token = null;
  return next();
}

/** Bloquea la ruta para visitantes no registrados. */
function requireRegistered(req, res, next) {
  if (!req.user) return next(new HttpError(403, 'Crea una cuenta gratis para usar esta función.'));
  return next();
}

/** Solo cuentas Holding (empresas inmobiliarias). */
function requireHolding(req, res, next) {
  if (req.plan !== 'holding' || !req.user?.companyId) {
    return next(new HttpError(403, 'El panel de inmobiliaria es exclusivo del plan Holding.'));
  }
  return next();
}

/** Solo con una sesión iniciada (token válido). */
function requireSession(req, res, next) {
  if (!req.token) return next(new HttpError(401, 'No has iniciado sesión.'));
  return next();
}

module.exports = { demoPlan, requireRegistered, requireHolding, requireSession };
