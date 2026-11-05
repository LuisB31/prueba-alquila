/**
 * Cálculos financieros: hipoteca, proyección de plusvalía, costo mensual real.
 *
 * Esta es la ÚNICA fuente de estas fórmulas. En el archivo original había dos
 * versiones distintas de la cuota hipotecaria (una de ellas incorrecta, daba
 * ~$0); ahora el frontend siempre consume estos resultados.
 */
const { MORTGAGE_RATE, APPRECIATION_RATE, DEFAULT_DOWN_PAYMENT, DEFAULT_MORTGAGE_YEARS } = require('../config');

/**
 * Cuota mensual de un préstamo con amortización francesa (cuota fija).
 *   cuota = P · r · (1+r)^n / ((1+r)^n − 1)
 * @param {number} loan   Monto financiado.
 * @param {number} years  Plazo en años.
 * @param {number} annualRate Tasa anual (0.0575 = 5.75 %).
 */
function monthlyPayment(loan, years, annualRate = MORTGAGE_RATE) {
  const n = years * 12;
  const r = annualRate / 12;
  if (loan <= 0) return 0;
  if (r === 0) return Math.round(loan / n);
  const growth = Math.pow(1 + r, n);
  return Math.round((loan * r * growth) / (growth - 1));
}

/** Valor proyectado de un inmueble tras `years` años con plusvalía compuesta. */
function projectedValue(price, years, rate = APPRECIATION_RATE) {
  return Math.round(price * Math.pow(1 + rate, years));
}

/** Proyecciones a 5, 10 y 15 años. */
function projections(price) {
  return {
    y5: projectedValue(price, 5),
    y10: projectedValue(price, 10),
    y15: projectedValue(price, 15),
  };
}

/**
 * Serie histórica simulada (5 puntos) que termina en el precio actual.
 * Los años se calculan a partir del año en curso.
 */
function priceTrend(price, today = new Date()) {
  const base = price * 0.78;
  const lastYear = today.getFullYear();
  const factors = [1, 1.05, 1.12, 1.2];
  const labels = [lastYear - 4, lastYear - 3, lastYear - 2, lastYear - 1, lastYear].map(String);
  return { labels, values: [...factors.map((f) => Math.round(base * f)), price] };
}

/** Desglose del gasto mensual de una propiedad (renta o hipoteca + gastos). */
function monthlyCost(property) {
  const isRent = property.txType === 'Alquiler';
  const base = isRent
    ? property.price
    : monthlyPayment(property.price * (1 - DEFAULT_DOWN_PAYMENT), DEFAULT_MORTGAGE_YEARS);

  return {
    baseLabel: isRent
      ? 'Renta Base'
      : `Cuota Hipotecaria Est. (${DEFAULT_DOWN_PAYMENT * 100}% inicial, ${DEFAULT_MORTGAGE_YEARS} años)`,
    base,
    maintenance: property.maintenance,
    utilities: property.utilitiesEst,
    total: base + property.maintenance + property.utilitiesEst,
  };
}

/**
 * Análisis completo de inversión para una propiedad en venta.
 * @param {object} property
 * @param {number} downPct  Porcentaje de inicial (0.2 = 20 %).
 * @param {number} years    Plazo de la hipoteca.
 */
function investmentAnalysis(property, downPct = DEFAULT_DOWN_PAYMENT, years = DEFAULT_MORTGAGE_YEARS) {
  const loan = property.price * (1 - downPct);
  const proj = projections(property.price);
  return {
    property: {
      id: property.id, title: property.title, zone: property.zone, sqm: property.sqm, price: property.price,
    },
    projections: proj,
    appreciation5yPct: Math.round((proj.y5 / property.price - 1) * 100),
    trend: priceTrend(property.price),
    mortgage: { downPct, years, loan: Math.round(loan), rate: MORTGAGE_RATE, monthlyPayment: monthlyPayment(loan, years) },
  };
}

module.exports = { monthlyPayment, projectedValue, projections, priceTrend, monthlyCost, investmentAnalysis };
