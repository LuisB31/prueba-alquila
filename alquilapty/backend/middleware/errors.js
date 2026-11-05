/**
 * Manejo uniforme de errores.
 * Cualquier ruta puede lanzar `new HttpError(400, 'mensaje')` y el cliente
 * recibirá siempre la misma forma: { error: { status, message, details? } }.
 */

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Atajo para envolver handlers async y que sus errores lleguen a `errorHandler`. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** 404 para cualquier ruta /api que no exista. */
function notFound(req, res, next) {
  next(new HttpError(404, `Ruta no encontrada: ${req.method} ${req.originalUrl}`));
}

/** Middleware final: convierte errores en respuestas JSON. */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // JSON mal formado en el body
  if (err.type === 'entity.parse.failed') err = new HttpError(400, 'El cuerpo de la petición no es JSON válido.');

  const status = err.status || 500;
  if (status >= 500) console.error(err); // solo los errores reales van al log

  res.status(status).json({
    error: {
      status,
      message: status >= 500 ? 'Error interno del servidor.' : err.message,
      ...(err.details ? { details: err.details } : {}),
    },
  });
}

module.exports = { HttpError, asyncHandler, notFound, errorHandler };
