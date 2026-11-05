/** Formato de números y precios (siempre dólares, separador de miles con coma). */

/** 285000 → "$285,000" */
export const usd = (amount) => `$${Number(amount).toLocaleString('en-US')}`;

/** Precio de una propiedad: los alquileres llevan "/mes". */
export const priceLabel = (property) => usd(property.price) + (property.txType === 'Alquiler' ? '/mes' : '');

/** 1 → "1 propiedad", 3 → "3 propiedades" */
export const plural = (n, singular, pluralForm) => `${n} ${n === 1 ? singular : pluralForm}`;
