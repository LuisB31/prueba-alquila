/**
 * Construcción de la aplicación Express (sin abrir el puerto).
 * Está separada de server.js para poder probarla sin levantar un servidor real.
 *
 * Orden de los middlewares (importa):
 *   1. Compresión y cabeceras de seguridad básicas
 *   2. SEO (robots.txt / sitemap.xml)
 *   3. API (/api/*) con CORS, JSON y plan demo
 *   4. Archivos estáticos del frontend
 *   5. 404 y manejador de errores
 */
const express = require('express');
const compression = require('compression');
const cors = require('cors');
const path = require('path');

const { CORS_ORIGIN, FRONTEND_DIR } = require('./config');
const { demoPlan } = require('./middleware/demoPlan');
const { notFound, errorHandler } = require('./middleware/errors');

function createApp() {
  const app = express();
  app.disable('x-powered-by');

  // 1) Rendimiento y seguridad básica
  app.use(compression());
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    });
    next();
  });

  // 2) SEO
  app.use(require('./routes/seo.routes'));

  // 3) API
  app.use(
    '/api',
    cors({ origin: CORS_ORIGIN, allowedHeaders: ['Content-Type', 'X-Demo-Plan'] }),
    express.json({ limit: '50kb' }),
    (req, res, next) => { res.set('Cache-Control', 'no-cache'); next(); },
    demoPlan,
    require('./routes'),
    notFound // cualquier /api/... inexistente responde 404 en JSON
  );

  // 4) Frontend estático (HTML siempre fresco; CSS/JS/imágenes con caché corta)
  app.use(
    express.static(FRONTEND_DIR, {
      setHeaders(res, filePath) {
        const isHtml = path.extname(filePath) === '.html';
        res.set('Cache-Control', isHtml ? 'no-cache' : 'public, max-age=3600');
      },
    })
  );

  // 5) Errores
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
