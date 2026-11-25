/**
 * Contraseñas y tokens de sesión.
 *
 * Las contraseñas nunca se guardan en texto plano: se guarda "sal:hash" con
 * scrypt (incluido en Node, sin dependencias). Los tokens de sesión son
 * aleatorios de 48 caracteres hexadecimales.
 */
const crypto = require('crypto');

const KEY_LENGTH = 32;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, KEY_LENGTH).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(String(password ?? ''), salt, KEY_LENGTH);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

const newToken = () => crypto.randomBytes(24).toString('hex');

module.exports = { hashPassword, verifyPassword, newToken };
