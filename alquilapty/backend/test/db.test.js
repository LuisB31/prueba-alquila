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
  const call = async (p, { method = 'GET', body, plan = 'free', token } = {}) => {
    const res = await fetch(base + p, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-Plan': plan,
        Connection: 'close',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const stop = () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); });
  return { call, stop };
}

const CARD = { holder: 'Prueba', cardNumber: '4242424242424242', expiry: '12/30', cvc: '123' };

test('los datos de los usuarios sobreviven a un reinicio', async () => {
  // ---- Primera "vida" del servidor: los usuarios hacen cosas ----
  let app = await boot();
  assert.equal((await app.call('/api/health')).body.database, 'postgres');

  const premiumBefore = (await app.call('/api/accounts/me', { plan: 'premium' })).body.published;
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

  // Empresa Holding nueva + un agente, y una compra
  const reg = await app.call('/api/auth/register', {
    method: 'POST',
    body: { plan: 'holding', companyName: 'Persistente S.A.', firstName: 'Lía', lastName: 'Ríos', email: 'lia@persist.pa', password: 'clave123', payment: CARD },
  });
  assert.equal(reg.status, 201);
  const { token } = reg.body;
  const code = reg.body.company.code;
  assert.equal((await app.call('/api/holding/agents', {
    method: 'POST', token, body: { firstName: 'Teo', lastName: 'Paz', email: 'teo@persist.pa', password: 'clave456', code },
  })).status, 201);
  assert.equal((await app.call('/api/properties/5/acquire', { method: 'POST', token })).status, 201);
  assert.equal((await app.call(`/api/properties/${newId}/acquire`, { method: 'POST', token })).status, 201);

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
  assert.equal(restored.owner.name, 'Ricardo Rodríguez', 'conserva el publicador');
  assert.equal(restored.sold, true, 'la venta se recuerda');

  const me = (await app.call('/api/accounts/me', { plan: 'premium' })).body;
  assert.equal(me.points, premiumPoints);
  assert.equal(me.published, premiumBefore + 1);
  assert.equal((await app.call('/api/accounts/me', { plan: 'free' })).body.points, freePoints);

  // la sesión sigue abierta, la empresa conserva su código y su agente
  const session = await app.call('/api/auth/session', { token });
  assert.equal(session.status, 200);
  assert.equal(session.body.email, 'lia@persist.pa');
  const team = (await app.call('/api/holding/team', { token })).body;
  assert.equal(team.company.code, code);
  assert.equal(team.members.length, 2);
  assert.equal((await app.call('/api/auth/login', { method: 'POST', body: { email: 'teo@persist.pa', password: 'clave456' } })).status, 200);
  const history = (await app.call('/api/accounts/me/activity', { token })).body.history;
  assert.equal(history.length, 2);

  // los ids siguen sin chocar con lo ya guardado
  const second = await app.call('/api/properties', { method: 'POST', plan: 'premium', body: { title: 'Otra', zone: 'Obarrio', txType: 'Alquiler', price: 900 } });
  assert.equal(second.body.property.id, newId + 1);
  assert.equal((await app.call('/api/auth/register', {
    method: 'POST', body: { plan: 'free', firstName: 'Nuevo', lastName: 'Usuario', email: 'nuevo@persist.pa', password: 'clave789' },
  })).status, 201);
  assert.equal((await app.call(`/api/auctions/${auction.id}/offers`, { method: 'POST', body: { amount: auction.auction.minPrice + 200 } })).status, 201);
  assert.equal((await app.call('/api/roommates/1/messages', { method: 'POST', body: { text: 'Otra vez' } })).status, 201);
  await app.stop();

  const count = (table) => pgMem.public.many(`SELECT * FROM ${table}`).length;
  assert.equal(count('offers'), 2);
  assert.equal(count('roommate_messages'), 2);
  assert.equal(count('published_properties'), 2);
  assert.equal(count('companies'), 1);
  assert.equal(count('transactions'), 2);
});

test('favoritos y chat sobreviven a un reinicio', async () => {
  let app = await boot();
  const reg = await app.call('/api/auth/register', {
    method: 'POST', body: { plan: 'free', firstName: 'Luz', lastName: 'Chat', email: 'luz@chat.pa', password: 'secreta123' },
  });
  const luz = reg.body.token;
  const ricardo = (await app.call('/api/auth/login', { method: 'POST', body: { email: 'ricardo@demo.pa', password: 'demo1234' } })).body.token;

  assert.equal((await app.call('/api/favorites/9', { method: 'POST', token: luz })).status, 201);
  const open = await app.call('/api/chats', { method: 'POST', token: luz, body: { propertyId: 9, text: '¿Aceptan mascotas?' } });
  const chatId = open.body.conversation.id;
  await app.call(`/api/chats/${chatId}/messages`, { method: 'POST', token: ricardo, body: { text: 'Sí, perros pequeños.' } });
  await app.stop();

  app = await boot();
  assert.deepEqual((await app.call('/api/favorites', { token: luz })).body.ids, [9]);
  const inbox = (await app.call('/api/chats', { token: luz })).body;
  assert.equal(inbox.unread, 1, 'el no leído también persiste');
  const thread = (await app.call(`/api/chats/${chatId}`, { token: luz })).body;
  assert.deepEqual(thread.messages.map((m) => m.text), ['¿Aceptan mascotas?', 'Sí, perros pequeños.']);

  // Los ids siguen sin chocar tras el reinicio
  const next = await app.call(`/api/chats/${chatId}/messages`, { method: 'POST', token: luz, body: { text: 'Perfecto, gracias.' } });
  assert.equal(next.status, 201);
  assert.ok(next.body.message.id > thread.messages[1].id);
  await app.stop();
});
