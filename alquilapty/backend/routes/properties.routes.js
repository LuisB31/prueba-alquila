/**
 * /api/properties — listado, detalle, vecindarios, traslado, contacto y publicación.
 *
 * Las rutas solo traducen HTTP ⇄ servicios: validan la entrada, llaman al
 * servicio y devuelven JSON. La lógica de negocio vive en /services.
 */
const { Router } = require('express');
const properties = require('../services/properties.service');
const account = require('../services/account.service');
const { POINTS } = require('../config');
const { requireRegistered } = require('../middleware/demoPlan');
const { HttpError, asyncHandler } = require('../middleware/errors');
const db = require('../services/db');
const { requireId, optionalNumber, asBool, requireText, optionalText, oneOf } = require('../middleware/validate');

const router = Router();

/** GET /api/properties?tx=&zone=&type=&bedrooms=&pets=&auction=&maxPrice=&q= */
router.get('/', (req, res) => {
  const q = req.query;
  const items = properties.search({
    tx: q.tx ? oneOf(String(q.tx), ['alquiler', 'venta', 'ambos'], 'tx') : 'ambos',
    zone: q.zone ? String(q.zone) : undefined,
    type: q.type ? String(q.type) : undefined,
    bedrooms: optionalNumber(q.bedrooms, { min: 0, max: 20, label: 'bedrooms' }),
    pets: asBool(q.pets),
    auction: asBool(q.auction),
    maxPrice: optionalNumber(q.maxPrice, { min: 0, label: 'maxPrice' }),
    q: q.q ? String(q.q).slice(0, 100) : '',
  });
  res.json({ total: items.length, items: items.map(properties.toSummary) });
});

/** GET /api/properties/top-neighborhoods */
router.get('/top-neighborhoods', (req, res) => {
  res.json(properties.topNeighborhoods(5));
});

/** GET /api/properties/commute-destinations */
router.get('/commute-destinations', (req, res) => {
  res.json(properties.commuteDestinations());
});

/** GET /api/properties/nearby — "cercanos a mí" (simulado) */
router.get('/nearby', (req, res) => {
  res.json(properties.nearestToUser(3));
});

/** GET /api/properties/:id */
router.get('/:id', (req, res) => {
  const property = properties.findById(requireId(req.params.id));
  const social = require('../services/social.service');
  res.json({
    ...properties.toDetail(property),
    favorite: req.user ? social.isFavorite(req.user, property.id) : false,
    // Solo hay chat si la publicó un usuario de la plataforma y no es el propio visitante
    chatAvailable: Boolean(property.ownerUserId) && property.ownerUserId !== req.user?.id,
  });
});

/** GET /api/properties/:id/commute?dest=Centro Financiero */
router.get('/:id/commute', (req, res) => {
  const property = properties.findById(requireId(req.params.id));
  res.json(properties.commute(property, String(req.query.dest || '')));
});

/** POST /api/properties/:id/contact — contacta al publicador y suma puntos */
router.post('/:id/contact', requireRegistered, asyncHandler(async (req, res) => {
  const property = properties.findById(requireId(req.params.id));
  const points = account.addPoints(req.user, POINTS.contactOwner);
  await db.saveUser(req.user);
  res.json({
    message: `💬 Iniciando chat directo con ${property.owner.name}... (+${POINTS.contactOwner} pts)`,
    pointsAwarded: POINTS.contactOwner,
    points,
  });
}));

/**
 * POST /api/properties — publicar una propiedad (solo cuentas registradas)
 * Body: { title, zone, txType, price, auction?: { enabled, minPrice, step } }
 */
router.post('/', requireRegistered, asyncHandler(async (req, res) => {
  const b = req.body || {};
  const txType = oneOf(b.txType, ['Alquiler', 'Venta'], 'txType');
  const price = optionalNumber(b.price, { min: 1, max: 100_000_000, label: 'price' });
  if (price === undefined) throw new HttpError(400, 'El campo "price" es obligatorio.');

  // La subasta inversa solo existe para ventas
  let auction = null;
  if (txType === 'Venta' && b.auction && b.auction.enabled) {
    const minPrice = optionalNumber(b.auction.minPrice, { min: 1, max: price, label: 'auction.minPrice' });
    const step = optionalNumber(b.auction.step, { min: 1, max: price, label: 'auction.step' });
    if (minPrice === undefined || step === undefined) {
      throw new HttpError(400, 'Para activar la subasta indica precio mínimo y baja semanal.');
    }
    auction = { active: true, initialPrice: price, minPrice, step, currentStep: 0, daysLeft: 7 };
  }

  const data = {
    title: requireText(b.title, 'title', { max: 120 }),
    zone: requireText(b.zone, 'zone', { max: 60 }),
    type: optionalText(b.type, { max: 40 }) || undefined,
    txType,
    price,
    auction,
  };

  // Límite de publicaciones según el plan (Free 3, Premium 10, Holding ilimitado)
  account.assertCanPublish(req.user);
  const property = properties.createProperty(data);
  account.assignOwner(property, req.user);

  const points = account.addPoints(req.user, POINTS.publishProperty);
  await db.saveProperty(property, req.plan);
  await db.saveUser(req.user);
  res.status(201).json({
    property: properties.toSummary(property),
    message: `¡Propiedad publicada con éxito! Ganaste +${POINTS.publishProperty} Puntos.`,
    pointsAwarded: POINTS.publishProperty,
    points,
  });
}));

/**
 * POST /api/properties/:id/acquire — alquilar o comprar (simulado).
 * Queda en el historial del usuario y como ingreso del dueño.
 */
router.post('/:id/acquire', requireRegistered, asyncHandler(async (req, res) => {
  const property = properties.findById(requireId(req.params.id));
  const tx = account.acquire(req.user, property);
  await db.saveTransaction(tx);
  const verb = tx.kind === 'Compra' ? 'Compraste' : 'Alquilaste';
  res.status(201).json({ transaction: account.txView(tx), message: `🏠 ${verb} "${property.title}". Ya aparece en tu historial.` });
}));

module.exports = router;
