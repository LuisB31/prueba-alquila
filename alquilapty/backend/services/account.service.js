/**
 * Cuentas de usuario: registro, inicio/cierre de sesión, perfil, puntos,
 * propiedades propias e historial de alquileres/compras.
 *
 * Dos formas de identificarse (ver middleware/demoPlan.js):
 *   • Sesión real: token en `Authorization: Bearer <token>` (tras registrarse o iniciar sesión).
 *   • Simulador de planes: sin token, la cabecera `X-Demo-Plan` elige una cuenta demo.
 */
const store = require('./store');
const { HttpError } = require('../middleware/errors');
const { hashPassword, verifyPassword, newToken } = require('./security');
const { setOwner } = require('./seed');
const { toSummary } = require('./properties.service');
const { POINTS, PUBLISH_LIMITS, PLAN_PRICES, MIN_PASSWORD_LENGTH } = require('../config');

const MONTHS_LONG = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const PLAN_ROLES = { free: 'Usuario Free', premium: 'Usuario Premium ⭐' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ---------------------------------------------------------------------------
// Búsquedas
// ---------------------------------------------------------------------------

const findUser = (id) => store.users.find((u) => u.id === id) || null;
const findByEmail = (email) => store.users.find((u) => u.email === String(email || '').trim().toLowerCase()) || null;
const findCompany = (id) => store.companies.find((c) => c.id === id) || null;
const fullName = (u) => `${u.firstName} ${u.lastName}`;

/** Usuario dueño de un token de sesión (o null). */
function userFromToken(token) {
  const id = store.sessions.get(token);
  return id ? findUser(id) : null;
}

/** Cuenta demo que corresponde a un plan del simulador (null para visitante). */
function demoUserFor(plan) {
  const { planUsers, company } = store.reference.demo;
  if (plan === 'holding') {
    const demoCompany = findCompany(company.id);
    return findUser(demoCompany?.currentUserId ?? planUsers.holding);
  }
  return planUsers[plan] ? findUser(planUsers[plan]) : null;
}

/** Propiedades publicadas por un usuario. */
const ownedProperties = (user) => store.properties.filter((p) => p.ownerUserId === user.id);

// ---------------------------------------------------------------------------
// Perfil
// ---------------------------------------------------------------------------

/** Avatar con iniciales (SVG embebido: no depende de servicios externos). */
function initialsAvatar(firstName, lastName) {
  const initials = `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase().replace(/[<>&"']/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#1E3A5F"/>` +
    `<text x="50%" y="54%" font-family="Arial,sans-serif" font-size="80" font-weight="bold" fill="#40E0D0" text-anchor="middle" dominant-baseline="middle">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function memberSince(iso) {
  const d = new Date(iso);
  return `Miembro desde ${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function roleLabel(user) {
  if (user.plan !== 'holding') return PLAN_ROLES[user.plan];
  const company = findCompany(user.companyId);
  return `${user.companyRole || 'Agente'} - ${company?.name || 'Holding'} 🏢`;
}

/** Perfil que ve el usuario (GET /api/accounts/me). */
function toAccount(user, { session = false } = {}) {
  if (!user) {
    return { plan: 'visitor', ...store.reference.accounts.visitor, points: 0, published: 0, publishLimit: 0, session: false };
  }
  const limit = PUBLISH_LIMITS[user.plan] ?? 0;
  const company = user.companyId ? findCompany(user.companyId) : null;
  return {
    id: user.id,
    plan: user.plan,
    name: fullName(user),
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    avatar: user.avatar,
    role: roleLabel(user),
    memberSince: memberSince(user.createdAt),
    points: user.points,
    published: ownedProperties(user).length,
    publishLimit: Number.isFinite(limit) ? limit : null, // null = ilimitado
    company: company ? { id: company.id, name: company.name, role: user.companyRole } : null,
    demo: Boolean(user.demo),
    session,
  };
}

// ---------------------------------------------------------------------------
// Pago simulado
// ---------------------------------------------------------------------------

/** Algoritmo de Luhn: detecta números de tarjeta mal escritos. */
function luhnOk(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

/**
 * Valida los datos de la tarjeta y "cobra" (no se cobra nada: es una simulación).
 * Solo se guardan los 4 últimos dígitos.
 */
function simulatePayment(payment, amount) {
  const p = payment || {};
  const holder = String(p.holder || '').trim();
  const number = String(p.cardNumber || '').replace(/[\s-]/g, '');
  const expiry = String(p.expiry || '').trim();
  const cvc = String(p.cvc || '').trim();

  if (!holder) throw new HttpError(400, 'Indica el nombre del titular de la tarjeta.');
  if (!/^\d{13,19}$/.test(number) || !luhnOk(number)) throw new HttpError(400, 'El número de tarjeta no es válido.');
  const m = expiry.match(/^(\d{2})\s*\/\s*(\d{2})$/);
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) throw new HttpError(400, 'La fecha de vencimiento debe tener el formato MM/AA.');
  const now = new Date();
  const expYear = 2000 + Number(m[2]);
  const expMonth = Number(m[1]);
  if (expYear < now.getUTCFullYear() || (expYear === now.getUTCFullYear() && expMonth < now.getUTCMonth() + 1)) {
    throw new HttpError(400, 'La tarjeta está vencida.');
  }
  if (!/^\d{3,4}$/.test(cvc)) throw new HttpError(400, 'El CVC debe tener 3 o 4 dígitos.');

  return {
    amount,
    currency: 'USD',
    last4: number.slice(-4),
    reference: `SIM-${Date.now().toString(36).toUpperCase()}`,
    paidAt: now.toISOString(),
    simulated: true,
  };
}

// ---------------------------------------------------------------------------
// Registro, inicio y cierre de sesión
// ---------------------------------------------------------------------------

function cleanName(value, label) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s) throw new HttpError(400, `El campo "${label}" es obligatorio.`);
  if (s.length > 60) throw new HttpError(400, `El campo "${label}" no puede superar 60 caracteres.`);
  return s;
}

/** Valida nombre, apellido, correo y contraseña de una persona nueva. */
function validatePerson(data) {
  const firstName = cleanName(data.firstName, 'nombre');
  const lastName = cleanName(data.lastName, 'apellido');
  const email = String(data.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 120) throw new HttpError(400, 'El correo no es válido.');
  if (findByEmail(email)) throw new HttpError(409, 'Ya existe una cuenta con ese correo.');
  const password = String(data.password || '');
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  if (password.length > 200) throw new HttpError(400, 'La contraseña es demasiado larga.');
  return { firstName, lastName, email, password };
}

/** Crea el registro de un usuario (todavía sin guardarlo en la lista). */
function buildUser({ firstName, lastName, email, password }, extra) {
  return {
    id: store.nextId(store.users),
    firstName,
    lastName,
    email,
    passwordHash: hashPassword(password),
    avatar: initialsAvatar(firstName, lastName),
    points: POINTS.startBalance,
    createdAt: new Date().toISOString(),
    companyId: null,
    companyRole: null,
    ...extra,
  };
}

/** Código de 4 dígitos que no use ninguna otra empresa. */
function uniqueCompanyCode() {
  const used = new Set(store.companies.map((c) => c.code));
  if (used.size >= 9000) throw new HttpError(503, 'No quedan códigos de empresa disponibles.');
  let code;
  do { code = String(1000 + Math.floor(Math.random() * 9000)); } while (used.has(code));
  return code;
}

function openSession(user) {
  const token = newToken();
  store.sessions.set(token, user.id);
  return token;
}

/**
 * Registro.
 *   free     → nombre, apellido, correo, contraseña
 *   premium  → lo mismo + pago (simulado)
 *   holding  → nombre de la empresa + primer agente (nombre, apellido, correo, contraseña) + pago.
 *              Se genera el código de 4 dígitos de la empresa.
 * @returns {{ user, company, token, receipt }}
 */
function register(data = {}) {
  const plan = data.plan;
  if (!['free', 'premium', 'holding'].includes(plan)) throw new HttpError(400, 'Elige un plan: free, premium o holding.');

  let companyName = null;
  if (plan === 'holding') {
    companyName = cleanName(data.companyName, 'nombre de la empresa');
    if (companyName.length > 80) throw new HttpError(400, 'El nombre de la empresa no puede superar 80 caracteres.');
  }
  const person = validatePerson(data);
  const receipt = plan === 'free' ? null : simulatePayment(data.payment, PLAN_PRICES[plan]);

  let company = null;
  if (plan === 'holding') {
    const now = new Date();
    company = {
      id: store.nextId(store.companies),
      name: companyName,
      code: uniqueCompanyCode(),
      email: person.email,
      phone: '',
      createdAt: now.toISOString(),
      paidUntil: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate())).toISOString(),
      memberIds: [],
      currentUserId: null,
      payment: receipt,
    };
  }

  const user = buildUser(person, {
    plan,
    payment: receipt,
    ...(company ? { companyId: company.id, companyRole: 'Admin Principal' } : {}),
  });
  store.users.push(user);
  if (company) {
    company.memberIds.push(user.id);
    company.currentUserId = user.id;
    store.companies.push(company);
  }

  return { user, company, token: openSession(user), receipt };
}

function login(email, password) {
  const user = findByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new HttpError(401, 'Correo o contraseña incorrectos.');
  }
  return { user, token: openSession(user) };
}

function logout(token) {
  store.sessions.delete(token);
}

// ---------------------------------------------------------------------------
// Publicaciones y puntos
// ---------------------------------------------------------------------------

/** Lanza 409 si el usuario ya alcanzó el máximo de propiedades de su plan. */
function assertCanPublish(user) {
  const limit = PUBLISH_LIMITS[user.plan] ?? 0;
  if (ownedProperties(user).length >= limit) {
    throw new HttpError(409, `Tu plan permite publicar hasta ${limit} propiedades. Mejora tu plan para publicar más.`);
  }
}

/** Marca al usuario como publicador de la propiedad. */
const assignOwner = (property, user) => setOwner(property, user);

function addPoints(user, amount) {
  user.points += amount;
  return user.points;
}

function redeem(user, item, cost) {
  if (user.points < cost) throw new HttpError(400, 'No tienes suficientes puntos acumulados.');
  user.points -= cost;
  return { item, cost, points: user.points };
}

// ---------------------------------------------------------------------------
// Actividad: mis propiedades e historial
// ---------------------------------------------------------------------------

const txView = (t) => ({ id: t.id, propertyId: t.propertyId, title: t.title, zone: t.zone, kind: t.kind, amount: t.amount, date: t.date });

/** Propiedades en venta / alquiler del usuario y lo que ha alquilado o comprado. */
function activity(user) {
  const mine = ownedProperties(user).map((p) => ({ ...toSummary(p), status: p.soldTo ? 'Vendida' : 'Activa' }));
  const history = store.transactions
    .filter((t) => t.buyerId === user.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(txView);
  return {
    properties: {
      venta: mine.filter((p) => p.txType === 'Venta'),
      alquiler: mine.filter((p) => p.txType === 'Alquiler'),
    },
    history,
  };
}

/**
 * Alquilar o comprar una propiedad (simulado). Queda en el historial del
 * usuario y como ingreso del dueño. Una venta solo puede cerrarse una vez.
 */
function acquire(user, property) {
  if (property.ownerUserId === user.id) throw new HttpError(400, 'No puedes alquilar ni comprar tu propia propiedad.');
  const owner = property.ownerUserId ? findUser(property.ownerUserId) : null;
  if (owner && user.companyId && owner.companyId === user.companyId) {
    throw new HttpError(400, 'Esta propiedad pertenece a tu propia empresa.');
  }
  const isSale = property.txType === 'Venta';
  if (isSale && property.soldTo) throw new HttpError(409, 'Esta propiedad ya fue vendida.');

  const tx = {
    id: store.nextId(store.transactions),
    propertyId: property.id,
    title: property.title,
    zone: property.zone,
    kind: isSale ? 'Compra' : 'Alquiler',
    amount: property.price,
    buyerId: user.id,
    ownerId: property.ownerUserId || null,
    date: new Date().toISOString(),
  };
  store.transactions.push(tx);
  if (isSale) property.soldTo = user.id;
  return tx;
}

module.exports = {
  findUser, findByEmail, findCompany, fullName, userFromToken, demoUserFor, ownedProperties,
  toAccount, register, login, logout, validatePerson, buildUser, simulatePayment,
  assertCanPublish, assignOwner, addPoints, redeem, activity, acquire, txView,
};
