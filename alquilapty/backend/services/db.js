/**
 * Persistencia en PostgreSQL (opcional).
 *
 * Funcionamiento ("write-through"):
 *   • Al arrancar, `init(store)` crea las tablas si no existen y carga en memoria
 *     lo que haya en la base de datos (propiedades publicadas, ofertas, puntos…).
 *   • Las lecturas siguen saliendo de memoria (rápido y sin cambiar los servicios).
 *   • Cada cambio se guarda en la base de datos con las funciones `save*`.
 *
 * Si no existe la variable DATABASE_URL, todo queda en memoria como antes
 * (útil en local y en las pruebas). En Railway, DATABASE_URL la da el servicio
 * de PostgreSQL: referencia `${{ Postgres.DATABASE_URL }}` en las variables de la app.
 *
 * Los datos de ejemplo (data/*.json) NO se copian a la base de datos: se cargan
 * siempre desde los archivos. La BD guarda solo lo que crean los usuarios.
 *
 * Nota: como las lecturas salen de memoria, la app debe correr en UNA sola
 * instancia (la configuración por defecto de Railway).
 */
const { enrichProperty } = require('./enrich');

let pool = null;

/** Tablas (se crean solo las que falten al arrancar). */
const TABLES = {
  published_properties: `(
    id          INTEGER PRIMARY KEY,
    plan        TEXT NOT NULL,
    data        JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  offers: `(
    id            INTEGER PRIMARY KEY,
    property_id   INTEGER NOT NULL,
    plan          TEXT NOT NULL,
    amount        NUMERIC NOT NULL,
    payment_terms TEXT,
    message       TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  roommate_messages: `(
    id          INTEGER PRIMARY KEY,
    roommate_id INTEGER NOT NULL,
    to_name     TEXT NOT NULL,
    from_plan   TEXT NOT NULL,
    text        TEXT,
    sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  roommate_profiles: `(
    plan      TEXT PRIMARY KEY,
    data      JSONB NOT NULL,
    saved_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  accounts: `(
    plan       TEXT PRIMARY KEY,
    points     INTEGER NOT NULL,
    published  INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  app_state: `(
    key   TEXT PRIMARY KEY,
    value JSONB NOT NULL
  )`,
};

async function migrate() {
  const { rows } = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
  const existing = new Set(rows.map((r) => r.table_name));
  for (const [name, ddl] of Object.entries(TABLES)) {
    if (!existing.has(name)) await pool.query(`CREATE TABLE ${name} ${ddl}`);
  }
}

/** ¿Hay base de datos conectada? */
const enabled = () => pool !== null;

/** SSL: la red interna de Railway y localhost no lo usan; las URLs públicas sí. */
function sslFor(url) {
  if (process.env.PGSSL === 'false') return false;
  if (process.env.PGSSL === 'true') return { rejectUnauthorized: false };
  const host = new URL(url).hostname;
  return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.railway.internal') ? false : { rejectUnauthorized: false };
}

/**
 * Conecta, crea las tablas y carga los datos guardados dentro de `store`.
 * `options.pool` permite inyectar un pool ya creado (lo usan las pruebas).
 */
async function init(store, { url = process.env.DATABASE_URL, pool: injected } = {}) {
  if (injected) {
    pool = injected;
  } else if (!url) {
    console.log('  Base de datos     →  no configurada (DATABASE_URL vacío): datos en memoria');
    return;
  } else {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: url, ssl: sslFor(url), max: 5 });
  }
  pool.on('error', (err) => console.error('PostgreSQL:', err.message));

  await migrate();
  await load(store);
  console.log('  Base de datos     →  PostgreSQL conectado');
}

async function load(store) {
  const [props, offers, messages, profiles, accounts, state] = await Promise.all([
    pool.query('SELECT id, data FROM published_properties ORDER BY id'),
    pool.query('SELECT * FROM offers ORDER BY id'),
    pool.query('SELECT * FROM roommate_messages ORDER BY id'),
    pool.query('SELECT plan, data, saved_at FROM roommate_profiles'),
    pool.query('SELECT plan, points, published FROM accounts'),
    pool.query("SELECT value FROM app_state WHERE key = 'holding_current'"),
  ]);

  const seedIds = new Set(store.properties.map((p) => p.id));
  props.rows.forEach((r) => {
    if (!seedIds.has(r.id)) store.properties.push(enrichProperty({ ...r.data, id: r.id }, store.reference));
  });

  store.offers = offers.rows.map((r) => ({
    id: r.id, propertyId: r.property_id, plan: r.plan, amount: Number(r.amount),
    paymentTerms: r.payment_terms, message: r.message, createdAt: r.created_at.toISOString(),
  }));

  store.messages = messages.rows.map((r) => ({
    id: r.id, to: r.to_name, fromPlan: r.from_plan, text: r.text, sentAt: r.sent_at.toISOString(),
  }));

  store.roommateProfiles = profiles.rows.map((r) => ({ plan: r.plan, ...r.data, savedAt: r.saved_at.toISOString() }));

  accounts.rows.forEach((r) => {
    const account = store.accounts[r.plan];
    if (account) Object.assign(account, { points: r.points, published: r.published });
  });

  const current = state.rows[0]?.value?.name;
  if (current && store.holdingTeam.some((m) => m.name === current)) {
    store.holdingTeam.forEach((m) => { m.isCurrent = m.name === current; });
  }
}

// ---------------------------------------------------------------------------
// Escrituras (no hacen nada si no hay base de datos)
// ---------------------------------------------------------------------------

async function query(sql, params) {
  if (!pool) return;
  await pool.query(sql, params);
}

/** Guarda una propiedad publicada (solo sus datos base; lo derivado se recalcula al cargar). */
function saveProperty(property, plan) {
  const { owner, gallery, nearby, maintenance, utilitiesEst, description, ...raw } = property;
  return query('INSERT INTO published_properties (id, plan, data) VALUES ($1, $2, $3)', [property.id, plan, raw]);
}

function saveOffer(offer) {
  return query(
    'INSERT INTO offers (id, property_id, plan, amount, payment_terms, message, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [offer.id, offer.propertyId, offer.plan, offer.amount, offer.paymentTerms, offer.message, offer.createdAt]
  );
}

function saveMessage(roommateId, message) {
  return query(
    'INSERT INTO roommate_messages (id, roommate_id, to_name, from_plan, text, sent_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [message.id, roommateId, message.to, message.fromPlan, message.text, message.sentAt]
  );
}

function saveRoommateProfile(record) {
  const { plan, savedAt, ...data } = record;
  return query(
    `INSERT INTO roommate_profiles (plan, data, saved_at) VALUES ($1, $2, $3)
     ON CONFLICT (plan) DO UPDATE SET data = EXCLUDED.data, saved_at = EXCLUDED.saved_at`,
    [plan, data, savedAt]
  );
}

/** Guarda puntos y propiedades publicadas de una cuenta. */
function saveAccount(account) {
  return query(
    `INSERT INTO accounts (plan, points, published, updated_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (plan) DO UPDATE SET points = EXCLUDED.points, published = EXCLUDED.published, updated_at = now()`,
    [account.plan, account.points, account.published || 0]
  );
}

function saveHoldingCurrent(name) {
  return query(
    `INSERT INTO app_state (key, value) VALUES ('holding_current', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [{ name }]
  );
}

async function close() {
  if (pool) await pool.end();
  pool = null;
}

module.exports = {
  init, enabled, close,
  saveProperty, saveOffer, saveMessage, saveRoommateProfile, saveAccount, saveHoldingCurrent,
};
