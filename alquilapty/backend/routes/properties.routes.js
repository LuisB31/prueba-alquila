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
const { HttpError } = require('../middleware/errors');
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
  res.json(properties.toDetail(properties.findById(requireId(req.params.id))));
});

/** GET /api/properties/:id/commute?dest=Centro Financiero */
router.get('/:id/commute', (req, res) => {
  const property = properties.findById(requireId(req.params.id));
  res.json(properties.commute(property, String(req.query.dest || '')));
});

/** POST /api/properties/:id/contact — contacta al publicador y suma puntos */
router.post('/:id/contact', (req, res) => {
  const property = properties.findById(requireId(req.params.id));
  const points = account.addPoints(req.plan, POINTS.contactOwner);
  res.json({
    message: `💬 Iniciando chat directo con ${property.owner.name}... (+${POINTS.contactOwner} pts)`,
    pointsAwarded: POINTS.contactOwner,
    points,
  });
});

/**
 * POST /api/properties — publicar una propiedad (solo cuentas registradas)
 * Body: { title, zone, txType, price, auction?: { enabled, minPrice, step } }
 */
router.post('/', requireRegistered, (req, res) => {
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

  const property = properties.createProperty({
    title: requireText(b.title, 'title', { max: 120 }),
    zone: requireText(b.zone, 'zone', { max: 60 }),
    type: optionalText(b.type, { max: 40 }) || undefined,
    txType,
    price,
    auction,
  });

  const points = account.addPoints(req.plan, POINTS.publishProperty);
  res.status(201).json({
    property: properties.toSummary(property),
    message: `¡Propiedad publicada con éxito! Ganaste +${POINTS.publishProperty} Puntos.`,
    pointsAwarded: POINTS.publishProperty,
    points,
  });
});

module.exports = router;
