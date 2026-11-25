/**
 * Panel Holding (empresa inmobiliaria).
 *
 *   • Una empresa puede tener hasta HOLDING_TEAM_LIMIT (5) agentes.
 *   • Para agregar un agente se pide el código de 4 dígitos de la empresa;
 *     cada empresa tiene uno distinto, así que el código de otra no sirve.
 *   • Estadísticas: propiedades en venta / alquiler (todas las de sus agentes)
 *     e ingresos mensuales (alquileres y ventas cerradas).
 */
const store = require('./store');
const { HttpError } = require('../middleware/errors');
const { verifyPassword } = require('./security');
const account = require('./account.service');
const { toSummary } = require('./properties.service');
const { HOLDING_TEAM_LIMIT } = require('../config');

const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const FINANCE_MONTHS = 6;

function companyOf(user) {
  const company = user?.companyId ? account.findCompany(user.companyId) : null;
  if (!company) throw new HttpError(403, 'Tu cuenta no pertenece a ninguna empresa Holding.');
  return company;
}

const companyView = (c) => ({
  id: c.id, name: c.name, code: c.code, email: c.email, phone: c.phone, createdAt: c.createdAt, paidUntil: c.paidUntil,
});

/** Equipo de la empresa: agentes + espacios libres hasta 5. */
function getTeam(user) {
  const company = companyOf(user);
  const members = company.memberIds.map(account.findUser).filter(Boolean).map((u) => ({
    id: u.id,
    name: account.fullName(u),
    email: u.email,
    role: u.companyRole || 'Agente',
    avatar: u.avatar,
    props: account.ownedProperties(u).length,
    isCurrent: u.id === user.id,
  }));
  return { company: companyView(company), members, limit: HOLDING_TEAM_LIMIT, freeSlots: Math.max(0, HOLDING_TEAM_LIMIT - members.length) };
}

/**
 * Agrega un agente nuevo a la empresa del usuario.
 * Exige el código de 4 dígitos de ESA empresa.
 */
function addAgent(user, data = {}) {
  const company = companyOf(user);
  const code = String(data.code ?? '').trim();
  if (!/^\d{4}$/.test(code)) throw new HttpError(400, 'El código de empresa debe tener 4 dígitos.');
  if (code !== company.code) throw new HttpError(403, 'El código no corresponde a tu empresa.');
  if (company.memberIds.length >= HOLDING_TEAM_LIMIT) {
    throw new HttpError(409, `Tu empresa ya tiene ${HOLDING_TEAM_LIMIT} agentes (el máximo).`);
  }
  const person = account.validatePerson(data);
  const agent = account.buildUser(person, { plan: 'holding', companyId: company.id, companyRole: 'Agente' });
  store.users.push(agent);
  company.memberIds.push(agent.id);
  return { agent, company, team: getTeam(user) };
}

/**
 * Cambia el agente activo. Requiere la contraseña de ese agente.
 * Con sesión real, la sesión pasa a ser del agente elegido; en el simulador
 * cambia el agente que usa la cuenta demo.
 */
function switchMember(user, targetId, password, token) {
  const company = companyOf(user);
  if (!company.memberIds.includes(targetId)) throw new HttpError(404, 'Ese agente no pertenece a tu empresa.');
  if (!password) throw new HttpError(400, 'La contraseña es obligatoria.');
  const target = account.findUser(targetId);
  if (!verifyPassword(password, target.passwordHash)) throw new HttpError(401, 'Contraseña incorrecta.');

  if (token) store.sessions.set(token, target.id);
  else company.currentUserId = target.id;
  return { company, target, team: getTeam(target) };
}

/** Etiquetas y claves "AAAA-MM" de los últimos `n` meses (el último es el actual). */
function lastMonths(n, now = new Date()) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (n - 1 - i), 1));
    return { key: d.toISOString().slice(0, 7), label: `${MONTHS_SHORT[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}` };
  });
}

/** Propiedades, conteos e ingresos de toda la empresa. */
function getStats(user) {
  const company = companyOf(user);
  const memberIds = new Set(company.memberIds);
  const agentName = (id) => { const u = account.findUser(id); return u ? account.fullName(u) : '—'; };

  const props = store.properties.filter((p) => memberIds.has(p.ownerUserId));
  const list = props.map((p) => ({ ...toSummary(p), agent: agentName(p.ownerUserId), status: p.soldTo ? 'Vendida' : 'Activa' }));
  const active = list.filter((p) => p.status === 'Activa');

  const counts = {
    total: list.length,
    venta: active.filter((p) => p.txType === 'Venta').length,
    alquiler: active.filter((p) => p.txType === 'Alquiler').length,
    vendidas: list.filter((p) => p.status === 'Vendida').length,
    subastas: active.filter((p) => p.auction).length,
    valorVenta: active.filter((p) => p.txType === 'Venta').reduce((s, p) => s + p.price, 0),
    rentaMensual: active.filter((p) => p.txType === 'Alquiler').reduce((s, p) => s + p.price, 0),
  };

  const months = lastMonths(FINANCE_MONTHS);
  const income = store.transactions.filter((t) => memberIds.has(t.ownerId));
  const sumFor = (kind) => months.map(({ key }) => income
    .filter((t) => t.kind === kind && t.date.slice(0, 7) === key)
    .reduce((s, t) => s + t.amount, 0));
  const ventas = sumFor('Compra');
  const alquileres = sumFor('Alquiler');
  const totals = months.map((_, i) => ventas[i] + alquileres[i]);

  return {
    company: companyView(company),
    counts,
    properties: list,
    finance: {
      labels: months.map((m) => m.label),
      ventas,
      alquileres,
      totals,
      total: totals.reduce((s, v) => s + v, 0),
      currentMonth: totals[totals.length - 1],
      recent: income.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map(account.txView),
    },
    traffic: store.holdingStats, // vistas vs consultas (datos de ejemplo)
  };
}

module.exports = { getTeam, addAgent, switchMember, getStats, companyOf };
