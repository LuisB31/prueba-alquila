/**
 * Cuentas demo, puntos (gamificación) y panel Holding (equipo de agencia).
 *
 * No hay autenticación real: el frontend indica el plan activo con la cabecera
 * `X-Demo-Plan` y el servidor mantiene un saldo de puntos por plan.
 */
const store = require('./store');
const { HttpError } = require('../middleware/errors');
const { HOLDING_TEAM_LIMIT } = require('../config');

/** Devuelve la cuenta de un plan (visitor | free | premium | holding). */
function getAccount(plan) {
  const account = store.accounts[plan];
  if (!account) throw new HttpError(404, `Plan desconocido: ${plan}.`);
  return account;
}

/** Suma (o resta, con valores negativos) puntos y devuelve el nuevo saldo. */
function addPoints(plan, amount) {
  const account = getAccount(plan);
  account.points += amount;
  return account.points;
}

/** Canjea puntos por un beneficio; falla si el saldo no alcanza. */
function redeem(plan, item, cost) {
  const account = getAccount(plan);
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

module.exports = { getAccount, addPoints, redeem, getTeam, switchTeamMember, inviteMember, holdingStats };
