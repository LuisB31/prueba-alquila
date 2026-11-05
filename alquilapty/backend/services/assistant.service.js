/**
 * Asistente inmobiliario (basado en reglas).
 *
 * Es el punto único donde conectar un modelo de lenguaje real en el futuro:
 * basta con reemplazar el cuerpo de `reply()` por una llamada a la API de IA
 * (la ruta y el frontend no cambian).
 */
const store = require('./store');
const finance = require('./finance.service');

const money = (n) => `$${n.toLocaleString('en-US')}`;

/** Busca una propiedad cuyo título aparezca (entre comillas o no) en el mensaje. */
function findMentionedProperty(text) {
  const lower = text.toLowerCase();
  return store.properties.find((p) => lower.includes(p.title.toLowerCase()));
}

/** Respuesta sobre una propiedad concreta, con datos reales del catálogo. */
function describeProperty(p) {
  const base = `${p.title}: ${p.type.toLowerCase()} de ${p.bedrooms} hab. y ${p.bathrooms} baños (${p.sqm} m²) en ${p.zone}, ` +
    `a ${money(p.price)}${p.txType === 'Alquiler' ? '/mes' : ''}.`;
  if (p.txType !== 'Venta') {
    return `${base} Con mantenimiento y servicios estimados, el gasto mensual total ronda ${money(finance.monthlyCost(p).total)}.`;
  }
  const a = finance.investmentAnalysis(p);
  return `${base} Proyección de plusvalía a 5 años: ${money(a.projections.y5)} (+${a.appreciation5yPct}%). ` +
    `Con 20% de inicial a 30 años, la cuota estimada es ${money(a.mortgage.monthlyPayment)}/mes.`;
}

/** Rango de alquileres en una zona (para la consulta sobre San Francisco). */
function rentRangeText(zone) {
  const rents = store.properties.filter((p) => p.zone === zone && p.txType === 'Alquiler').map((p) => p.price);
  if (!rents.length) return `${zone} cuenta con buenas opciones; revisa el listado para ver las disponibles.`;
  return `${zone} cuenta con opciones de alquiler desde ${money(Math.min(...rents))} hasta ${money(Math.max(...rents))} al mes.`;
}

/**
 * @param {string} message Texto del usuario.
 * @returns {string} Respuesta en texto plano (el frontend NO la interpreta como HTML).
 */
function reply(message) {
  const text = message.toLowerCase();
  const total = store.properties.length;

  const mentioned = findMentionedProperty(message);
  if (mentioned) return `Entendido. ${describeProperty(mentioned)}`;

  if (text.includes('san francisco')) return `Entendido. Según la oferta actual en Panamá, ${rentRangeText('San Francisco')}`;

  if (text.includes('subasta')) {
    const active = store.properties.filter((p) => p.auction).length;
    return `Entendido. Hay ${active} subastas inversas activas: reducen su precio automáticamente cada semana y puedes realizar una oferta confidencial bajo el precio inicial.`;
  }

  return `Entendido. Según la oferta actual en Panamá, he analizado las ${total} propiedades disponibles y te recomiendo evaluar Costa del Este y Obarrio para mayor plusvalía.`;
}

module.exports = { reply };
