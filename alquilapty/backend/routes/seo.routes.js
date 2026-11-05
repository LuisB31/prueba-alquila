/**
 * robots.txt y sitemap.xml dinámicos (usan SITE_URL de la configuración).
 *
 * Nota: existen copias estáticas en /frontend para cuando el sitio se sirva
 * sin backend (p. ej. GitHub Pages). Si el backend está activo, estas rutas
 * tienen prioridad sobre los archivos estáticos.
 */
const { Router } = require('express');
const { SITE_URL } = require('../config');

const router = Router();

router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(
    [
      'User-agent: *',
      'Allow: /',
      'Disallow: /api/',
      '',
      `Sitemap: ${SITE_URL}/sitemap.xml`,
      '',
    ].join('\n')
  );
});

router.get('/sitemap.xml', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `  <url>\n    <loc>${SITE_URL}/</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n` +
    `</urlset>\n`
  );
});

module.exports = router;
