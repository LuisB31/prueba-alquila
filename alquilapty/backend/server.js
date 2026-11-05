/**
 * Punto de entrada del backend.
 *   npm start      → servidor normal
 *   npm run dev    → se reinicia al guardar cambios
 *
 * Sirve la API en /api y el frontend (carpeta /frontend) en la raíz.
 */
const { createApp } = require('./app');
const { PORT, SITE_URL } = require('./config');

createApp().listen(PORT, () => {
  console.log(`\n  AlquilaPTY listo →  http://localhost:${PORT}`);
  console.log(`  API              →  http://localhost:${PORT}/api/health`);
  console.log(`  URL pública (SEO) →  ${SITE_URL}\n`);
});
