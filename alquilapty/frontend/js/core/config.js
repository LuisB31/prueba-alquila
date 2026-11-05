/**
 * Configuración del frontend.
 * Lo único "de entorno" es la URL de la API: se lee de <meta name="api-base">
 * en index.html (por defecto "/api", es decir, el mismo servidor).
 */
const metaApiBase = document.querySelector('meta[name="api-base"]')?.content?.trim();

/** URL base de la API, sin barra final. */
export const API_BASE = (metaApiBase || '/api').replace(/\/$/, '');

/** Milisegundos máximos de espera por una petición antes de cancelarla. */
export const REQUEST_TIMEOUT_MS = 10_000;

/** Espera tras dejar de escribir/arrastrar antes de consultar la API. */
export const DEBOUNCE_MS = 250;

/** Tamaño lógico del mapa: las coordenadas de la API van de 0..500 y 0..400. */
export const MAP_SIZE = { width: 500, height: 400 };
