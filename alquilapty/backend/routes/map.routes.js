/**
 * /api/map — datos para el mapa interactivo (pines y capas de servicios).
 * El backend entrega coordenadas "lógicas" (500×400); el frontend las escala al canvas.
 */
const { Router } = require('express');
const properties = require('../services/properties.service');
const { optionalNumber } = require('../middleware/validate');

const router = Router();

/** GET /api/map/pins?type=&bedrooms=&maxPrice= */
router.get('/pins', (req, res) => {
  const q = req.query;
  res.json(properties.mapPins({
    type: q.type ? String(q.type) : undefined,
    bedrooms: optionalNumber(q.bedrooms, { min: 0, max: 20, label: 'bedrooms' }),
    maxPrice: optionalNumber(q.maxPrice, { min: 0, label: 'maxPrice' }),
  }));
});

/** GET /api/map/pois — metro, buses, escuelas, supermercados, malls… */
router.get('/pois', (req, res) => {
  res.json(properties.mapPois());
});

module.exports = router;
