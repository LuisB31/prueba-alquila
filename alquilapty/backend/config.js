/**
 * Configuración central del backend.
 * Todo lo que pueda cambiar entre entornos (puerto, dominio, CORS) se lee de
 * variables de entorno; el resto son constantes de negocio con nombre claro.
 */
const path = require('path');

module.exports = {
  // ---- Servidor -----------------------------------------------------------
  PORT: Number(process.env.PORT) || 3000,

  // Origen permitido por CORS. '*' sirve para desarrollo; en producción pon el
  // dominio del frontend, p. ej. CORS_ORIGIN=https://alquilapty.com
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',

  // URL pública del sitio (la usan robots.txt y sitemap.xml).
  SITE_URL: (process.env.SITE_URL || 'https://gianmontilla1607.github.io/Alquiler').replace(/\/$/, ''),

  // ---- Rutas de archivos --------------------------------------------------
  FRONTEND_DIR: path.join(__dirname, '..', 'frontend'),
  DATA_DIR: path.join(__dirname, 'data'),

  // ---- Reglas de negocio --------------------------------------------------
  MORTGAGE_RATE: 0.0575,        // tasa anual de referencia para hipotecas
  APPRECIATION_RATE: 0.034,     // plusvalía anual promedio usada en las proyecciones
  DEFAULT_DOWN_PAYMENT: 0.2,    // 20 % de inicial
  DEFAULT_MORTGAGE_YEARS: 30,

  // Gamificación (puntos por acción)
  POINTS: {
    startBalance: 1250,
    contactOwner: 10,
    publishProperty: 30,
  },

  HOLDING_TEAM_LIMIT: 5,        // máximo de administradores en una cuenta Holding
  PLANS: ['visitor', 'free', 'premium', 'holding'],
};
