/**
 * /api/auctions — subastas inversas (el precio baja con el tiempo).
 */
const { Router } = require('express');
const properties = require('../services/properties.service');
const { requireId, optionalNumber, optionalText } = require('../middleware/validate');
const { HttpError } = require('../middleware/errors');

const router = Router();

/** GET /api/auctions — propiedades con subasta activa */
router.get('/', (req, res) => {
  res.json(properties.listAuctions());
});

/**
 * POST /api/auctions/:id/offers
 * Body: { amount, paymentTerms?, message? }
 */
router.post('/:id/offers', (req, res) => {
  const id = requireId(req.params.id);
  const b = req.body || {};
  const amount = optionalNumber(b.amount, { min: 1, label: 'amount' });
  if (amount === undefined) throw new HttpError(400, 'El campo "amount" es obligatorio.');

  const offer = properties.submitOffer(id, {
    amount,
    paymentTerms: optionalText(b.paymentTerms, { max: 100 }),
    message: optionalText(b.message, { max: 500 }),
  });
  res.status(201).json({ offer, message: '¡Oferta enviada con éxito! El vendedor revisará tu propuesta.' });
});

module.exports = router;
