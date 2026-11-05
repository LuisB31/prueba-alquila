/**
 * Almacén de datos en memoria.
 *
 * Carga los JSON de /backend/data una sola vez al arrancar y guarda el estado
 * mutable de la demo (ofertas, mensajes, puntos, equipo Holding).
 *
 * ⚠️ Es una base de datos simulada: al reiniciar el servidor se pierde lo
 * creado. Para producción, sustituye este archivo por una base de datos real
 * (PostgreSQL, MongoDB…) manteniendo la misma interfaz que usan los servicios.
 */
const fs = require('fs');
const path = require('path');
const { DATA_DIR, POINTS } = require('../config');
const { enrichProperty } = require('./enrich');

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));

const reference = readJson('reference.json');

const store = {
  /** Catálogos de apoyo: dueños, destinos de traslado, cuentas demo… */
  reference,

  /** Propiedades ya enriquecidas. */
  properties: readJson('properties.json').map((p) => enrichProperty(p, reference)),

  roommates: readJson('roommates.json'),
  holdingStats: readJson('holding-stats.json'),

  /** Cuentas demo por plan, cada una con su saldo de puntos. */
  accounts: Object.fromEntries(
    Object.entries(reference.accounts).map(([plan, account]) => [plan, { plan, ...account, points: POINTS.startBalance }])
  ),

  /** Equipo de la cuenta Holding (copia, porque se modifica al cambiar de cuenta). */
  holdingTeam: reference.holdingTeam.map((member) => ({ ...member })),

  // Registros generados durante la sesión (simulan tablas)
  offers: [],
  messages: [],
  roommateProfiles: [],

  /** Siguiente id libre para una propiedad nueva. */
  nextPropertyId() {
    return Math.max(0, ...store.properties.map((p) => p.id)) + 1;
  },
};

module.exports = store;
