/**
 * Almacén de datos en memoria.
 *
 * Carga los JSON de /backend/data una sola vez al arrancar y guarda el estado
 * mutable de la demo (usuarios, empresas, sesiones, transacciones, ofertas…).
 *
 * Con DATABASE_URL, db.js carga aquí lo guardado en PostgreSQL y persiste
 * cada cambio; sin ella, todo vive en memoria y se pierde al reiniciar.
 */
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config');
const { enrichProperty } = require('./enrich');
const { buildSeed } = require('./seed');

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));

const reference = readJson('reference.json');
const properties = readJson('properties.json').map((p) => enrichProperty(p, reference));
const seed = buildSeed(reference, properties);

const store = {
  /** Catálogos de apoyo: dueños, destinos de traslado, cuentas demo… */
  reference,

  /** Propiedades ya enriquecidas. `ownerUserId` = usuario que la publicó. */
  properties,

  roommates: readJson('roommates.json'),
  holdingStats: readJson('holding-stats.json'),

  /** Usuarios registrados (incluye las 3 cuentas demo del simulador). */
  users: seed.users,
  /** Empresas Holding: { id, name, code (4 dígitos), memberIds, currentUserId… } */
  companies: seed.companies,
  /** Alquileres y compras: historial del comprador e ingresos del dueño. */
  transactions: seed.transactions,
  /** Sesiones abiertas: token → id de usuario. */
  sessions: new Map(),

  // Registros generados durante la sesión (simulan tablas)
  offers: [],
  messages: [],
  roommateProfiles: [],

  /** Siguiente id libre para una propiedad nueva. */
  nextPropertyId() {
    return Math.max(0, ...store.properties.map((p) => p.id)) + 1;
  },
};

/** Siguiente id libre de una lista de registros con `id`. */
store.nextId = (list) => Math.max(0, ...list.map((x) => x.id)) + 1;

/** Marca como vendidas las propiedades que alguien compró (se deriva de las transacciones). */
store.applySales = () => {
  store.transactions
    .filter((t) => t.kind === 'Compra' && t.propertyId && t.buyerId)
    .forEach((t) => {
      const p = store.properties.find((x) => x.id === t.propertyId);
      if (p) p.soldTo = t.buyerId;
    });
};

module.exports = store;
