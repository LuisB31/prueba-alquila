/**
 * Helpers de validación/normalización de entradas (query string y body).
 * Lanzan HttpError 400 con un mensaje claro cuando el dato no es válido.
 */
const { HttpError } = require('./errors');

/** Entero positivo obligatorio (ids, etc.). */
function requireId(value, label = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `El ${label} debe ser un número entero positivo.`);
  return n;
}

/** Número opcional dentro de un rango; devuelve `fallback` si no viene. */
function optionalNumber(value, { min = -Infinity, max = Infinity, fallback = undefined, label = 'valor' } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new HttpError(400, `El campo "${label}" debe ser un número entre ${min} y ${max}.`);
  }
  return n;
}

/** Booleano desde query string ("true", "1", "on"). */
function asBool(value) {
  return value === true || value === 'true' || value === '1' || value === 'on';
}

/** Texto obligatorio, recortado y con longitud máxima (evita payloads gigantes). */
function requireText(value, label, { max = 200 } = {}) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s) throw new HttpError(400, `El campo "${label}" es obligatorio.`);
  if (s.length > max) throw new HttpError(400, `El campo "${label}" no puede superar ${max} caracteres.`);
  return s;
}

/** Texto opcional (devuelve '' si no viene). */
function optionalText(value, { max = 500 } = {}) {
  const s = typeof value === 'string' ? value.trim() : '';
  return s.slice(0, max);
}

/** Valor que debe pertenecer a una lista cerrada. */
function oneOf(value, allowed, label) {
  if (!allowed.includes(value)) throw new HttpError(400, `"${label}" debe ser uno de: ${allowed.join(', ')}.`);
  return value;
}

module.exports = { requireId, optionalNumber, asBool, requireText, optionalText, oneOf };
