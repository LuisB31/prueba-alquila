/**
 * Punto de entrada del backend.
 *   npm start      → servidor normal
 *   npm run dev    → se reinicia al guardar cambios
 *
 * Sirve la API en /api y el frontend (carpeta /frontend) en la raíz.
 * Si existe DATABASE_URL, conecta PostgreSQL antes de aceptar peticiones.
 */
const { createApp } = require('./app');
const { PORT, SITE_URL } = require('./config');
const store = require('./services/store');
const db = require('./services/db');

async function main() {
  await db.init(store);

  const server = createApp().listen(PORT, () => {
    console.log(`\n  AlquilaPTY listo →  http://localhost:${PORT}`);
    console.log(`  API              →  http://localhost:${PORT}/api/health`);
    console.log(`  URL pública (SEO) →  ${SITE_URL}\n`);
  });

  // Railway envía SIGTERM al redeplegar: cerramos conexiones con orden
  const shutdown = () => server.close(() => db.close().finally(() => process.exit(0)));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error) => {
  console.error('No se pudo iniciar AlquilaPTY:', error);
  process.exit(1);
});
