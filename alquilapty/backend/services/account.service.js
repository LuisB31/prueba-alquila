/**
 * Cuentas demo, puntos (gamificación) y panel Holding (equipo de agencia).
 *
 * No hay autenticación real: el frontend indica el plan activo con la cabecera
 * `X-Demo-Plan` y el servidor mantiene un saldo de puntos por plan.
 */
const store = require('./store');
const { HttpError } = require('../middleware/errors');
const { HOLDING_TEAM_LIMIT, PUBLISH_LIMITS } = require('../config');

/** Devuelve la cuenta de un plan (visitor | free | premium | holding). */
function getAccount(plan) {
  const account = store.accounts[plan];
  if (!account) throw new HttpError(404, `Plan desconocido: ${plan}.`);
  const limit = PUBLISH_LIMITS[plan] ?? 0;
  return {
    ...account,
    published: account.published || 0,
    publishLimit: Number.isFinite(limit) ? limit : null, // null = ilimitado
  };
}

/** Lanza 409 si el plan ya alcanzó su máximo de propiedades publicadas. */
function assertCanPublish(plan) {
  const account = store.accounts[plan];
  const limit = PUBLISH_LIMITS[plan] ?? 0;
  if ((account?.published || 0) >= limit) {
    throw new HttpError(409, `Tu plan permite publicar hasta ${limit} propiedades. Mejora tu plan para publicar más.`);
  }
}

function registerPublication(plan) {
  const account = store.accounts[plan];
  account.published = (account.published || 0) + 1;
}

/** Suma (o resta, con valores negativos) puntos y devuelve el nuevo saldo. */
function addPoints(plan, amount) {
  const account = store.accounts[plan];
  if (!account) throw new HttpError(404, `Plan desconocido: ${plan}.`);
  account.points += amount;
  return account.points;
}

/** Canjea puntos por un beneficio; falla si el saldo no alcanza. */
function redeem(plan, item, cost) {
  const account = store.accounts[plan];
  if (!account) throw new HttpError(404, `Plan desconocido: ${plan}.`);
  if (account.points < cost) throw new HttpError(400, 'No tienes suficientes puntos acumulados.');
  account.points -= cost;
  return { item, cost, points: account.points };
}

// ---------------------------------------------------------------------------
// Holding
// ---------------------------------------------------------------------------

function getTeam() {
  return { members: store.holdingTeam, limit: HOLDING_TEAM_LIMIT };
}

/**
 * Cambia el usuario administrador activo del Holding.
 * ⚠️ Demo: solo exige que la contraseña no esté vacía. Con autenticación
 * real aquí se verificaría un hash.
 */
function switchTeamMember(name, password) {
  const member = store.holdingTeam.find((m) => m.name === name);
  if (!member) throw new HttpError(404, `No existe el usuario "${name}" en el equipo.`);
  if (!password) throw new HttpError(400, 'La contraseña es obligatoria.');
  store.holdingTeam.forEach((m) => { m.isCurrent = m.name === name; });
  return getTeam();
}

function inviteMember() {
  if (store.holdingTeam.length >= HOLDING_TEAM_LIMIT) {
    throw new HttpError(409, `Límite de ${HOLDING_TEAM_LIMIT} usuarios alcanzado.`);
  }
  return { message: `Invitación enviada por correo. Podrás tener hasta ${HOLDING_TEAM_LIMIT} usuarios administradores.` };
}

function holdingStats() {
  return store.holdingStats;
}

/** La cuenta tal como se guarda (para persistirla en la base de datos). */
const rawAccount = (plan) => store.accounts[plan];

module.exports = { rawAccount, getAccount, assertCanPublish, registerPublication, addPoints, redeem, getTeam, switchTeamMember, inviteMember, holdingStats };
