/**
 * Router de la API: agrupa todos los recursos bajo /api.
 *
 *   /api/health
 *   /api/properties      listado, detalle, vecindarios, traslado, contacto, publicar
 *   /api/auctions        subastas inversas y ofertas
 *   /api/roommates       búsqueda de compañeros de cuarto
 *   /api/investments     análisis ROI + hipoteca
 *   /api/comparison      comparador de propiedades
 *   /api/map             pines y puntos de interés
 *   /api/assistant       chat con el asistente
 *   /api/accounts, /api/holding, /api/rewards   perfil, equipo y puntos
 */
const { Router } = require('express');

const router = Router();

router.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

router.use('/properties', require('./properties.routes'));
router.use('/auctions', require('./auctions.routes'));
router.use('/roommates', require('./roommates.routes'));
router.use('/map', require('./map.routes'));
router.use('/assistant', require('./assistant.routes'));
router.use('/', require('./analysis.routes'));   // /investments y /comparison
router.use('/', require('./account.routes'));    // /accounts, /holding, /rewards

module.exports = router;
