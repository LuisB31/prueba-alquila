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

test('holding: cambia de usuario, exige contraseña y respeta el límite del equipo', async () => {
  const team = await call('/api/holding/team');
  assert.equal(team.body.members.length, 3);

  assert.equal((await call('/api/holding/switch', { method: 'POST', body: { name: 'Juan Pérez', password: '' } })).status, 400);
  assert.equal((await call('/api/holding/switch', { method: 'POST', body: { name: 'Nadie', password: 'x' } })).status, 404);
  const ok = await call('/api/holding/switch', { method: 'POST', body: { name: 'Juan Pérez', password: 'x' } });
  assert.equal(ok.body.members.find((m) => m.isCurrent).name, 'Juan Pérez');
  assert.equal((await call('/api/holding/stats')).body.views.length, 9);
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
