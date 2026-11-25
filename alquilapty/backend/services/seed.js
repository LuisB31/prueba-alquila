/**
 * Datos de demostración: usuarios, empresa Holding, propiedades de cada uno,
 * historial de alquileres/compras e ingresos de la empresa.
 *
 * Las fechas se calculan relativas a HOY ("hace N meses") para que los
 * gráficos de ingresos siempre muestren datos recientes.
 */
const { hashPassword } = require('./security');
const { POINTS } = require('../config');

/** Fecha ISO del día 10 de hace `n` meses. */
function monthsAgo(n, now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, 10, 12)).toISOString();
}

/** Asigna una propiedad a un usuario (y muestra su nombre como publicador). */
function setOwner(property, user) {
  property.ownerUserId = user.id;
  property.owner = { name: `${user.firstName} ${user.lastName}`, avatar: user.avatar };
}

/**
 * @param {object} reference  data/reference.json
 * @param {object[]} properties  Propiedades ya enriquecidas (se modifican: dueño).
 */
function buildSeed(reference, properties) {
  const demo = reference.demo;
  const passwordHash = hashPassword(demo.password);

  const users = demo.users.map((u) => ({
    ...u,
    companyId: u.companyId ?? null,
    companyRole: u.companyRole ?? null,
    email: u.email.toLowerCase(),
    passwordHash,
    points: POINTS.startBalance,
    demo: true,
  }));
  const byId = new Map(users.map((u) => [u.id, u]));

  const company = {
    ...demo.company,
    memberIds: users.filter((u) => u.companyId === demo.company.id).map((u) => u.id),
    currentUserId: demo.planUsers.holding,
    demo: true,
  };

  // Propiedades de cada usuario demo
  for (const [userId, ids] of Object.entries(demo.ownership)) {
    const user = byId.get(Number(userId));
    properties.filter((p) => ids.includes(p.id)).forEach((p) => setOwner(p, user));
  }

  // Historial (lo que alquilaron/compraron) + ingresos de la empresa
  const transactions = [];
  const add = (t) => transactions.push({ id: transactions.length + 1, propertyId: null, buyerId: null, ownerId: null, ...t });

  demo.history.forEach(({ monthsAgo: n, ...t }) => add({ ...t, date: monthsAgo(n) }));

  const companyOwner = demo.planUsers.holding;
  demo.companyIncome.rentals.forEach(({ propertyId, fromMonthsAgo }) => {
    const p = properties.find((x) => x.id === propertyId);
    for (let n = fromMonthsAgo; n >= 0; n--) {
      add({ propertyId, title: p.title, zone: p.zone, kind: 'Alquiler', amount: p.price, ownerId: companyOwner, date: monthsAgo(n) });
    }
  });
  demo.companyIncome.sales.forEach(({ monthsAgo: n, ...t }) => add({ ...t, kind: 'Compra', ownerId: companyOwner, date: monthsAgo(n) }));

  return { users, companies: [company], transactions };
}

module.exports = { buildSeed, setOwner };
