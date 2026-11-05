/**
 * /api/investments y /api/comparison — herramientas de análisis.
 */
const { Router } = require('express');
const properties = require('../services/properties.service');
const finance = require('../services/finance.service');
const { requireId, optionalNumber } = require('../middleware/validate');
const { HttpError } = require('../middleware/errors');
const { DEFAULT_DOWN_PAYMENT, DEFAULT_MORTGAGE_YEARS } = require('../config');

const router = Router();

/**
 * GET /api/investments/sale-properties
 * Propiedades en venta (alimenta el selector de la calculadora ROI).
 */
router.get('/investments/sale-properties', (req, res) => {
  const items = properties.search({ tx: 'venta' }).map(properties.toSummary);
  res.json(items);
});

/**
 * GET /api/investments/:id?downPct=0.2&years=30
 * Proyección de plusvalía + simulación hipotecaria + serie histórica.
 */
router.get('/investments/:id', (req, res) => {
  const property = properties.findById(requireId(req.params.id));
  if (property.txType !== 'Venta') throw new HttpError(400, 'El análisis de inversión solo aplica a propiedades en venta.');

  const downPct = optionalNumber(req.query.downPct, { min: 0, max: 0.9, fallback: DEFAULT_DOWN_PAYMENT, label: 'downPct' });
  const years = optionalNumber(req.query.years, { min: 1, max: 40, fallback: DEFAULT_MORTGAGE_YEARS, label: 'years' });
  res.json(finance.investmentAnalysis(property, downPct, years));
});

/**
 * GET /api/comparison?ids=1,2,3
 * Tabla comparativa + datos del gráfico radar (máximo 3 propiedades).
 */
router.get('/comparison', (req, res) => {
  const ids = String(req.query.ids || '')
    .split(',')
    .filter(Boolean)
    .map((id) => requireId(id, 'id'));
  const unique = [...new Set(ids)];
  if (unique.length < 1 || unique.length > 3) throw new HttpError(400, 'Indica entre 1 y 3 propiedades en "ids" (ej. ids=1,2,3).');
  res.json(properties.compare(unique));
});

module.exports = router;
