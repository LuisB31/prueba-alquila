/**
 * Pruebas de la API con el runner nativo de Node (sin dependencias extra).
 *   npm test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../app');

let server;
let base;

test.before(async () => {
  await new Promise((resolve) => { server = createApp().listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

/** Pequeño cliente: devuelve { status, body }. */
async function call(path, { method = 'GET', body, plan } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(plan ? { 'X-Demo-Plan': plan } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* no es JSON */ }
  return { status: res.status, body: json, text, headers: res.headers };
}

test('GET /api/health responde ok', async () => {
  const r = await call('/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'ok');
});

test('listado: devuelve las 20 propiedades y filtra por tipo de transacción', async () => {
  const all = await call('/api/properties');
  assert.equal(all.body.total, 20);

  const rentals = await call('/api/properties?tx=alquiler');
  assert.ok(rentals.body.total > 0 && rentals.body.items.every((p) => p.txType === 'Alquiler'));

  const sales = await call('/api/properties?tx=venta');
  assert.equal(rentals.body.total + sales.body.total, 20);
});

test('listado: combina filtros (zona, habitaciones, precio máximo, solo subastas)', async () => {
  const r = await call('/api/properties?zone=Costa del Este&bedrooms=1&maxPrice=300000');
  assert.ok(r.body.items.every((p) => p.zone === 'Costa del Este' && p.bedrooms >= 1 && p.price <= 300000));

  const auctions = await call('/api/properties?auction=true');
  assert.ok(auctions.body.total > 0 && auctions.body.items.every((p) => p.auction));
});

test('listado: valida parámetros inválidos con 400', async () => {
  assert.equal((await call('/api/properties?tx=otro')).status, 400);
  assert.equal((await call('/api/properties?maxPrice=abc')).status, 400);
});

test('detalle: incluye galería, cercanías y costo mensual', async () => {
  const r = await call('/api/properties/1');
  assert.equal(r.status, 200);
  assert.equal(r.body.gallery.length, 3);
  assert.ok(r.body.nearby.metro.dist);
  assert.ok(r.body.monthlyCost.total > r.body.monthlyCost.maintenance);
});

test('detalle: la cuota hipotecaria de una venta es realista (bug del original)', async () => {
  // Propiedad 1: $285,000, 20 % inicial, 30 años, 5.75 % → ~ $1,330/mes
  const r = await call('/api/properties/1');
  assert.equal(r.body.txType, 'Venta');
  assert.ok(r.body.monthlyCost.base > 1200 && r.body.monthlyCost.base < 1500, `cuota inesperada: ${r.body.monthlyCost.base}`);
  assert.ok(r.body.roi.value5y > r.body.price);
});

test('detalle: 404 para id inexistente y 400 para id inválido', async () => {
  assert.equal((await call('/api/properties/9999')).status, 404);
  assert.equal((await call('/api/properties/abc')).status, 400);
});

test('traslado: calcula minutos y rechaza destinos desconocidos', async () => {
  const ok = await call('/api/properties/1/commute?dest=Centro Financiero');
  assert.equal(ok.status, 200);
  assert.ok(ok.body.minutes >= 5);
  assert.equal((await call('/api/properties/1/commute?dest=Luna')).status, 400);
});

test('vecindarios: devuelve el top 5 ordenado por actividad', async () => {
  const r = await call('/api/properties/top-neighborhoods');
  assert.equal(r.body.length, 5);
  for (let i = 1; i < r.body.length; i++) assert.ok(r.body[i - 1].activity >= r.body[i].activity);
});

test('inversión: proyecciones crecientes y cuota coherente', async () => {
  const r = await call('/api/investments/1?downPct=0.2&years=30');
  assert.equal(r.status, 200);
  const { y5, y10, y15 } = r.body.projections;
  assert.ok(y5 < y10 && y10 < y15);
  assert.equal(r.body.trend.values.length, 5);
  assert.ok(r.body.mortgage.monthlyPayment > 0);

  // más inicial → cuota menor
  const more = await call('/api/investments/1?downPct=0.3&years=30');
  assert.ok(more.body.mortgage.monthlyPayment < r.body.mortgage.monthlyPayment);
});

test('inversión: rechaza propiedades en alquiler', async () => {
  const rental = (await call('/api/properties?tx=alquiler')).body.items[0];
  assert.equal((await call(`/api/investments/${rental.id}`)).status, 400);
});

test('comparador: devuelve tabla y radar; valida cantidad de ids', async () => {
  const r = await call('/api/comparison?ids=1,2,3');
  assert.equal(r.body.properties.length, 3);
  assert.equal(r.body.radar.series.length, 3);
  assert.equal((await call('/api/comparison?ids=')).status, 400);
  assert.equal((await call('/api/comparison?ids=1,2,3,4')).status, 400);
});

test('subastas: lista y valida ofertas', async () => {
  const list = await call('/api/auctions');
  assert.ok(list.body.length > 0);
  const a = list.body[0];

  assert.equal((await call(`/api/auctions/${a.id}/offers`, { method: 'POST', body: { amount: a.price + 1 } })).status, 400);
  assert.equal((await call(`/api/auctions/${a.id}/offers`, { method: 'POST', body: { amount: 1 } })).status, 400);
  const ok = await call(`/api/auctions/${a.id}/offers`, { method: 'POST', body: { amount: a.auction.minPrice + 100 } });
  assert.equal(ok.status, 201);

  // una propiedad sin subasta no acepta ofertas
  const noAuction = (await call('/api/properties')).body.items.find((p) => !p.auction);
  assert.equal((await call(`/api/auctions/${noAuction.id}/offers`, { method: 'POST', body: { amount: 100 } })).status, 400);
});

test('roommates: filtra y ordena por compatibilidad', async () => {
  const all = await call('/api/roommates');
  assert.equal(all.body.total, 5);
  assert.equal(all.body.items[0].compatibility, 91);

  const women = await call('/api/roommates?gender=F');
  assert.ok(women.body.items.every((r) => r.gender === 'F'));
  assert.equal((await call('/api/roommates/999')).status, 404);
});

test('mapa: pines con filtros y capas de puntos de interés', async () => {
  const pins = await call('/api/map/pins?maxPrice=2000');
  assert.ok(pins.body.every((p) => p.price <= 2000));
  const pois = await call('/api/map/pois');
  assert.ok(pois.body.layers.metro.length === 6);
});

test('asistente: exige cuenta, responde y entiende propiedades por título', async () => {
  assert.equal((await call('/api/assistant/chat', { method: 'POST', plan: 'visitor', body: { message: 'hola' } })).status, 403);
  assert.equal((await call('/api/assistant/chat', { method: 'POST', body: {} })).status, 400);

  const generic = await call('/api/assistant/chat', { method: 'POST', body: { message: 'hola' } });
  assert.match(generic.body.reply, /20 propiedades/);

  const prop = (await call('/api/properties/1')).body;
  const about = await call('/api/assistant/chat', { method: 'POST', body: { message: `Cuéntame de "${prop.title}"` } });
  assert.ok(about.body.reply.includes(prop.title));
});

test('puntos: contactar suma, publicar suma, canjear resta y valida saldo', async () => {
  const before = (await call('/api/accounts/me', { plan: 'premium' })).body.points;

  const contact = await call('/api/properties/1/contact', { method: 'POST', plan: 'premium' });
  assert.equal(contact.body.points, before + 10);

  const publish = await call('/api/properties', {
    method: 'POST',
    plan: 'premium',
    body: { title: 'Casa de prueba', zone: 'Clayton', txType: 'Venta', price: 150000, auction: { enabled: true, minPrice: 120000, step: 500 } },
  });
  assert.equal(publish.status, 201);
  assert.equal(publish.body.points, before + 40);
  assert.ok(publish.body.property.auction);
  assert.equal((await call('/api/properties')).body.total, 21);

  const redeem = await call('/api/rewards/redeem', { method: 'POST', plan: 'premium', body: { item: 'Café', cost: 100 } });
  assert.equal(redeem.body.points, before + 40 - 100);
  const tooMuch = await call('/api/rewards/redeem', { method: 'POST', plan: 'premium', body: { item: 'Lujo', cost: 999999 } });
  assert.equal(tooMuch.status, 400);
});

test('publicar: visitantes reciben 403 y datos inválidos 400', async () => {
  const body = { title: 'X', zone: 'Obarrio', txType: 'Alquiler', price: 500 };
  assert.equal((await call('/api/properties', { method: 'POST', plan: 'visitor', body })).status, 403);
  assert.equal((await call('/api/properties', { method: 'POST', body: { ...body, price: -5 } })).status, 400);
  assert.equal((await call('/api/properties', { method: 'POST', body: { ...body, txType: 'Trueque' } })).status, 400);
});

test('holding demo: 1 agente y 4 espacios libres; estadísticas e ingresos', async () => {
  const plan = 'holding';
  const team = (await call('/api/holding/team', { plan })).body;
  assert.equal(team.members.length, 1);
  assert.equal(team.limit, 5);
  assert.equal(team.freeSlots, 4);
  assert.match(team.company.code, /^\d{4}$/);

  const stats = (await call('/api/holding/stats', { plan })).body;
  assert.equal(stats.counts.venta, 4);
  assert.equal(stats.counts.alquiler, 3);
  assert.equal(stats.properties.length, 7);
  assert.ok(stats.properties.every((p) => p.agent === 'Sara Llanos'));
  assert.equal(stats.finance.labels.length, 6);
  assert.ok(stats.finance.total > 0 && stats.finance.alquileres.every((v) => v > 0));
  assert.equal(stats.traffic.views.length, 9);
});

test('roles: el panel Holding es exclusivo del plan Holding', async () => {
  for (const plan of ['visitor', 'free', 'premium']) {
    assert.equal((await call('/api/holding/team', { plan })).status, 403, `team con ${plan}`);
    assert.equal((await call('/api/holding/stats', { plan })).status, 403, `stats con ${plan}`);
    assert.equal((await call('/api/holding/invite', { method: 'POST', plan })).status, 403, `invite con ${plan}`);
    assert.equal((await call('/api/holding/switch', { method: 'POST', plan, body: { name: 'Juan Pérez', password: 'x' } })).status, 403);
  }
});

test('roles: el visitante solo mira (no contacta, no oferta, no canjea)', async () => {
  const plan = 'visitor';
  assert.equal((await call('/api/properties', { plan })).status, 200);
  assert.equal((await call('/api/properties/1', { plan })).status, 200);
  assert.equal((await call('/api/auctions', { plan })).status, 200);

  assert.equal((await call('/api/properties/1/contact', { method: 'POST', plan })).status, 403);
  const a = (await call('/api/auctions')).body[0];
  assert.equal((await call(`/api/auctions/${a.id}/offers`, { method: 'POST', plan, body: { amount: a.auction.minPrice + 100 } })).status, 403);
  assert.equal((await call('/api/rewards/redeem', { method: 'POST', plan, body: { item: 'X', cost: 1 } })).status, 403);
});

test('búsqueda: ignora tildes y mayúsculas, y combina varias palabras', async () => {
  const q = async (text) => (await call(`/api/properties?q=${encodeURIComponent(text)}`)).body.items;

  const pacifica = await q('pacifica');
  assert.ok(pacifica.length >= 2 && pacifica.every((p) => p.zone === 'Punta Pacífica'));

  assert.deepEqual((await q('PUNTA PACÍFICA')).map((p) => p.id), pacifica.map((p) => p.id));

  // varias palabras: todas deben aparecer (no hace falta que estén juntas)
  const casaClayton = await q('casa clayton');
  assert.ok(casaClayton.some((p) => p.id === 16)); // "Casa de Lujo - Clayton"
  assert.ok(casaClayton.every((p) => p.zone === 'Clayton'));

  // también busca por tipo de propiedad y de operación
  const rooms = await q('habitacion');
  assert.ok(rooms.length < 5 && rooms.some((p) => p.type === 'Habitación'));
  assert.ok((await q('oficina alquiler')).every((p) => p.type === 'Oficina' && p.txType === 'Alquiler'));

  assert.equal((await q('zzz-no-existe')).length, 0);
  assert.equal((await q('   ')).length, (await call('/api/properties')).body.total);
});

test('publicar: el plan Free tiene un máximo de 3 propiedades', async () => {
  const body = { title: 'Depto prueba', zone: 'Obarrio', txType: 'Alquiler', price: 800 };
  const already = (await call('/api/accounts/me', { plan: 'free' })).body.published; // la cuenta demo ya tiene 1
  for (let i = already; i < 3; i++) {
    assert.equal((await call('/api/properties', { method: 'POST', plan: 'free', body })).status, 201);
  }
  const blocked = await call('/api/properties', { method: 'POST', plan: 'free', body });
  assert.equal(blocked.status, 409);

  const me = (await call('/api/accounts/me', { plan: 'free' })).body;
  assert.equal(me.published, 3);
  assert.equal(me.publishLimit, 3);
  assert.equal((await call('/api/accounts/me', { plan: 'holding' })).body.publishLimit, null);
});

// ---------------------------------------------------------------------------
// Registro, sesión, perfil, historial y empresa Holding
// ---------------------------------------------------------------------------

/** Llamada con sesión (token Bearer). */
async function authed(path, token, { method = 'GET', body, plan } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(plan ? { 'X-Demo-Plan': plan } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// Tarjeta de prueba (número público de pruebas, pasa Luhn). El pago es simulado.
const CARD = { holder: 'Prueba', cardNumber: '4242 4242 4242 4242', expiry: '12/30', cvc: '123' };
const person = (email) => ({ firstName: 'Ana', lastName: 'Prueba', email, password: 'secreto1' });

test('registro free: crea la cuenta, inicia sesión y valida los datos', async () => {
  const bad = async (body) => (await call('/api/auth/register', { method: 'POST', body })).status;
  assert.equal(await bad({ ...person('ana@test.pa'), plan: 'vip' }), 400);
  assert.equal(await bad({ ...person('no-es-correo'), plan: 'free' }), 400);
  assert.equal(await bad({ ...person('ana@test.pa'), password: '123', plan: 'free' }), 400);
  assert.equal(await bad({ ...person('ana@test.pa'), firstName: '', plan: 'free' }), 400);

  const r = await call('/api/auth/register', { method: 'POST', body: { ...person('ana@test.pa'), plan: 'free' } });
  assert.equal(r.status, 201);
  assert.ok(r.body.token);
  assert.equal(r.body.account.name, 'Ana Prueba');
  assert.equal(r.body.account.plan, 'free');
  assert.equal(r.body.receipt, null, 'free no paga');
  assert.equal(JSON.stringify(r.body).includes('passwordHash'), false, 'nunca expone el hash');

  // correo repetido (sin importar mayúsculas)
  assert.equal(await bad({ ...person('ANA@test.pa'), plan: 'free' }), 409);

  // con sesión, el plan lo decide la cuenta (se ignora el simulador)
  const me = await authed('/api/accounts/me', r.body.token, { plan: 'holding' });
  assert.equal(me.body.plan, 'free');
  assert.equal(me.body.session, true);
  assert.equal((await authed('/api/holding/team', r.body.token, { plan: 'holding' })).status, 403);
});

test('login y logout: credenciales correctas, incorrectas y token inválido', async () => {
  await call('/api/auth/register', { method: 'POST', body: { ...person('log@test.pa'), plan: 'free' } });
  assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'log@test.pa', password: 'mala' } })).status, 401);
  assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'nadie@test.pa', password: 'secreto1' } })).status, 401);

  const ok = await call('/api/auth/login', { method: 'POST', body: { email: 'LOG@test.pa', password: 'secreto1' } });
  assert.equal(ok.status, 200);
  const { token } = ok.body;
  assert.equal((await authed('/api/auth/session', token)).body.email, 'log@test.pa');

  assert.equal((await authed('/api/auth/logout', token, { method: 'POST' })).status, 200);
  assert.equal((await authed('/api/auth/session', token)).status, 401, 'tras salir el token ya no sirve');
  assert.equal((await call('/api/auth/logout', { method: 'POST' })).status, 401);

  // las cuentas demo también pueden iniciar sesión
  assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'juan@demo.pa', password: 'demo1234' } })).status, 200);
});

test('registro premium: exige un pago (simulado) válido', async () => {
  const body = { ...person('premium@test.pa'), plan: 'premium' };
  const status = async (payment) => (await call('/api/auth/register', { method: 'POST', body: { ...body, payment } })).status;
  assert.equal(await status(undefined), 400);
  assert.equal(await status({ ...CARD, cardNumber: '4242 4242 4242 4241' }), 400, 'Luhn');
  assert.equal(await status({ ...CARD, expiry: '01/20' }), 400, 'vencida');
  assert.equal(await status({ ...CARD, expiry: '13/30' }), 400, 'mes inválido');
  assert.equal(await status({ ...CARD, cvc: '1' }), 400);

  const r = await call('/api/auth/register', { method: 'POST', body: { ...body, payment: CARD } });
  assert.equal(r.status, 201);
  assert.equal(r.body.account.plan, 'premium');
  assert.equal(r.body.receipt.amount, 3);
  assert.equal(r.body.receipt.last4, '4242');
  assert.equal(JSON.stringify(r.body).includes('4242424242424242'), false, 'no guarda el número completo');
});

test('perfil: mis propiedades en venta/alquiler e historial; alquilar y comprar', async () => {
  const premium = (await call('/api/accounts/me/activity', { plan: 'premium' })).body;
  assert.ok(premium.properties.venta.some((p) => p.id === 8));
  assert.ok(premium.properties.alquiler.some((p) => p.id === 9));
  assert.ok(premium.history.some((h) => h.kind === 'Compra') && premium.history.some((h) => h.kind === 'Alquiler'));
  assert.equal((await call('/api/accounts/me/activity', { plan: 'visitor' })).status, 403);

  const { token } = (await call('/api/auth/register', { method: 'POST', body: { ...person('hist@test.pa'), plan: 'free' } })).body;
  const empty = (await authed('/api/accounts/me/activity', token)).body;
  assert.deepEqual(empty, { properties: { venta: [], alquiler: [] }, history: [] });

  // publica una propiedad → aparece en "mis propiedades" con su nombre como publicador
  const pub = await authed('/api/properties', token, { method: 'POST', body: { title: 'Mi depa', zone: 'Obarrio', txType: 'Alquiler', price: 700 } });
  assert.equal(pub.status, 201);
  assert.equal((await call(`/api/properties/${pub.body.property.id}`)).body.owner.name, 'Ana Prueba');
  assert.equal((await authed('/api/accounts/me/activity', token)).body.properties.alquiler.length, 1);
  assert.equal((await authed(`/api/properties/${pub.body.property.id}/acquire`, token, { method: 'POST' })).status, 400, 'no la propia');

  // alquila una y compra otra → historial
  assert.equal((await authed('/api/properties/5/acquire', token, { method: 'POST' })).status, 201);
  const buy = await authed('/api/properties/12/acquire', token, { method: 'POST' });
  assert.equal(buy.status, 201);
  assert.equal(buy.body.transaction.kind, 'Compra');
  assert.equal((await call('/api/properties/12/acquire', { method: 'POST', plan: 'premium' })).status, 409, 'ya vendida');
  assert.equal((await call('/api/properties/12')).body.sold, true);

  const history = (await authed('/api/accounts/me/activity', token)).body.history;
  assert.deepEqual(history.map((h) => h.kind).sort(), ['Alquiler', 'Compra']);
  assert.equal((await call('/api/properties/5/acquire', { method: 'POST', plan: 'visitor' })).status, 403);
});

test('holding: registro con pago genera un código de 4 dígitos único por empresa', async () => {
  const reg = (email, companyName, payment = CARD) => call('/api/auth/register', {
    method: 'POST', body: { ...person(email), plan: 'holding', companyName, payment },
  });
  assert.equal((await reg('h0@test.pa', '')).status, 400, 'nombre de empresa obligatorio');
  assert.equal((await reg('h0@test.pa', 'Sin Pago', null)).status, 400, 'pago obligatorio');

  const a = (await reg('h1@test.pa', 'Alfa Bienes')).body;
  const b = (await reg('h2@test.pa', 'Beta Casas')).body;
  assert.match(a.company.code, /^\d{4}$/);
  assert.match(b.company.code, /^\d{4}$/);
  assert.notEqual(a.company.code, b.company.code);
  assert.equal(a.receipt.amount, 12);

  const team = (await authed('/api/holding/team', a.token)).body;
  assert.equal(team.company.name, 'Alfa Bienes');
  assert.equal(team.members.length, 1);
  assert.equal(team.members[0].role, 'Admin Principal');
  assert.equal(team.freeSlots, 4);
  // empresa nueva: sin propiedades ni ingresos todavía
  const stats = (await authed('/api/holding/stats', a.token)).body;
  assert.equal(stats.counts.total, 0);
  assert.equal(stats.finance.total, 0);
});

test('holding: agregar agentes exige el código de SU empresa y máximo 5', async () => {
  const reg = async (email, companyName) => (await call('/api/auth/register', {
    method: 'POST', body: { ...person(email), plan: 'holding', companyName, payment: CARD },
  })).body;
  const alfa = await reg('ag1@test.pa', 'Gamma');
  const beta = await reg('ag2@test.pa', 'Delta');
  const agent = (n, code) => ({ firstName: 'Agente', lastName: `N${n}`, email: `agente${n}@gamma.pa`, password: 'clave123', code });
  const add = (body) => authed('/api/holding/agents', alfa.token, { method: 'POST', body });

  assert.equal((await add(agent(1, beta.company.code))).status, 403, 'el código de otra empresa no sirve');
  assert.equal((await add(agent(1, '12'))).status, 400);
  assert.equal((await add({ ...agent(1, alfa.company.code), email: 'ag2@test.pa' })).status, 409, 'correo ya usado');

  for (let n = 1; n <= 4; n++) assert.equal((await add(agent(n, alfa.company.code))).status, 201);
  const full = await add(agent(5, alfa.company.code));
  assert.equal(full.status, 409, 'máximo 5 agentes');

  const team = (await authed('/api/holding/team', alfa.token)).body;
  assert.equal(team.members.length, 5);
  assert.equal(team.freeSlots, 0);

  // la otra empresa no ve a esos agentes
  assert.equal((await authed('/api/holding/team', beta.token)).body.members.length, 1);

  // el agente nuevo puede iniciar sesión y pertenece a la empresa
  const login = (await call('/api/auth/login', { method: 'POST', body: { email: 'agente1@gamma.pa', password: 'clave123' } })).body;
  assert.equal(login.account.company.name, 'Gamma');
  assert.equal(login.account.plan, 'holding');

  // cambiar a la cuenta de un agente exige SU contraseña
  const target = team.members.find((m) => m.email === 'agente2@gamma.pa');
  assert.equal((await authed('/api/holding/switch', alfa.token, { method: 'POST', body: { userId: target.id, password: 'mala' } })).status, 401);
  const sw = await authed('/api/holding/switch', alfa.token, { method: 'POST', body: { userId: target.id, password: 'clave123' } });
  assert.equal(sw.status, 200);
  assert.equal(sw.body.account.email, 'agente2@gamma.pa');
  assert.equal((await authed('/api/accounts/me', alfa.token)).body.email, 'agente2@gamma.pa');
  // no puede cambiar a alguien de otra empresa
  assert.equal((await authed('/api/holding/switch', beta.token, { method: 'POST', body: { userId: target.id, password: 'clave123' } })).status, 404);
});

test('holding: lo que publican los agentes y sus ventas cuentan en las estadísticas', async () => {
  const h = (await call('/api/auth/register', {
    method: 'POST', body: { ...person('stats@test.pa'), plan: 'holding', companyName: 'Épsilon', payment: CARD },
  })).body;
  const pub = (body) => authed('/api/properties', h.token, { method: 'POST', body });
  const sale = (await pub({ title: 'Casa Épsilon', zone: 'Clayton', txType: 'Venta', price: 200000 })).body.property;
  await pub({ title: 'Depa Épsilon', zone: 'Obarrio', txType: 'Alquiler', price: 1000 });

  let stats = (await authed('/api/holding/stats', h.token)).body;
  assert.deepEqual([stats.counts.venta, stats.counts.alquiler], [1, 1]);

  // otro usuario compra la casa → ingreso del mes actual y pasa a "vendida"
  assert.equal((await call(`/api/properties/${sale.id}/acquire`, { method: 'POST', plan: 'premium' })).status, 201);
  stats = (await authed('/api/holding/stats', h.token)).body;
  assert.equal(stats.counts.venta, 0);
  assert.equal(stats.counts.vendidas, 1);
  assert.equal(stats.finance.currentMonth, 200000);
  assert.equal(stats.finance.ventas.at(-1), 200000);
});

test('plan inválido en la cabecera da 400', async () => {
  assert.equal((await call('/api/properties', { plan: 'vip' })).status, 400);
});

test('errores: ruta /api inexistente y JSON mal formado devuelven JSON de error', async () => {
  const nf = await call('/api/nada');
  assert.equal(nf.status, 404);
  assert.equal(nf.body.error.status, 404);

  const res = await fetch(`${base}/api/assistant/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{malo' });
  assert.equal(res.status, 400);
});

test('SEO: robots.txt y sitemap.xml dinámicos', async () => {
  const robots = await call('/robots.txt');
  assert.match(robots.text, /Sitemap: https?:\/\//);
  assert.match(robots.text, /Disallow: \/api\//);
  const sitemap = await call('/sitemap.xml');
  assert.match(sitemap.text, /<urlset/);
});
