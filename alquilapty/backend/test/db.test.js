/**
 * Pruebas de la persistencia en PostgreSQL usando pg-mem (Postgres simulado en
 * memoria, sin instalar nada). Comprueba que lo que crean los usuarios
 * sobrevive a un "reinicio" del servidor.
 *   npm test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { newDb } = require('pg-mem');

const backend = path.join(__dirname, '..');
const pgMem = newDb();
const { Pool } = pgMem.adapters.createPg();

/** Arranca una instancia "limpia" del backend (como tras un reinicio) contra la misma BD. */
async function boot() {
  Object.keys(require.cache).filter((k) => k.startsWith(backend) && !k.includes('node_modules')).forEach((k) => delete require.cache[k]);
  const store = require('../services/store');
  const db = require('../services/db');
  await db.init(store, { pool: new Pool() });
  const { createApp } = require('../app');
  const server = await new Promise((resolve) => { const s = createApp().listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (p, { method = 'GET', body, plan = 'free' } = {}) => {
    const res = await fetch(base + p, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Demo-Plan': plan },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  return { call, stop: () => new Promise((r) => server.close(r)) };
}

test('los datos de los usuarios sobreviven a un reinicio', async () => {
  // ---- Primera "vida" del servidor: los usuarios hacen cosas ----
  let app = await boot();
  assert.equal((await app.call('/api/health')).body.database, 'postgres');

  const published = await app.call('/api/properties', {
    method: 'POST', plan: 'premium',
    body: { title: 'Casa persistente', zone: 'Clayton', txType: 'Venta', price: 150000, auction: { enabled: true, minPrice: 120000, step: 500 } },
  });
  assert.equal(published.status, 201);
  const newId = published.body.property.id;

  const auction = (await app.call('/api/auctions')).body[0];
  assert.equal((await app.call(`/api/auctions/${auction.id}/offers`, { method: 'POST', body: { amount: auction.auction.minPrice + 100 } })).status, 201);
  assert.equal((await app.call('/api/roommates/1/messages', { method: 'POST', body: { text: 'Hola' } })).status, 201);
  assert.equal((await app.call('/api/roommates/profile', { method: 'POST', body: { about: 'Tranquilo', budget: 400 } })).status, 201);
  assert.equal((await app.call('/api/rewards/redeem', { method: 'POST', body: { item: 'Café', cost: 50 } })).status, 200);
  assert.equal((await app.call('/api/holding/switch', { method: 'POST', plan: 'holding', body: { name: 'Juan Pérez', password: 'x' } })).status, 200);

  const premiumPoints = (await app.call('/api/accounts/me', { plan: 'premium' })).body.points;
  const freePoints = (await app.call('/api/accounts/me', { plan: 'free' })).body.points;
  await app.stop();

  // ---- Reinicio: todo debe seguir ahí ----
  app = await boot();
  const list = await app.call('/api/properties');
  assert.equal(list.body.total, 21);
  const restored = (await app.call(`/api/properties/${newId}`)).body;
  assert.equal(restored.title, 'Casa persistente');
  assert.ok(restored.auction && restored.gallery.length === 3, 'se re-enriquece al cargar');

  const me = (await app.call('/api/accounts/me', { plan: 'premium' })).body;
  assert.equal(me.points, premiumPoints);
  assert.equal(me.published, 1);
  assert.equal((await app.call('/api/accounts/me', { plan: 'free' })).body.points, freePoints);

  const team = (await app.call('/api/holding/team', { plan: 'holding' })).body;
  assert.equal(team.members.find((m) => m.isCurrent).name, 'Juan Pérez');

  // los ids siguen sin chocar con lo ya guardado
  const second = await app.call('/api/properties', { method: 'POST', plan: 'premium', body: { title: 'Otra', zone: 'Obarrio', txType: 'Alquiler', price: 900 } });
  assert.equal(second.body.property.id, newId + 1);
  assert.equal((await app.call(`/api/auctions/${auction.id}/offers`, { method: 'POST', body: { amount: auction.auction.minPrice + 200 } })).status, 201);
  assert.equal((await app.call('/api/roommates/1/messages', { method: 'POST', body: { text: 'Otra vez' } })).status, 201);
  await app.stop();

  const count = (table) => pgMem.public.many(`SELECT id FROM ${table}`).length;
  assert.equal(count('offers'), 2);
  assert.equal(count('roommate_messages'), 2);
  assert.equal(count('published_properties'), 2);
});
