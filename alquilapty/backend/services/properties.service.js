/**
 * Lógica de negocio de propiedades: búsqueda, detalle, vecindarios, traslado,
 * mapa, subastas inversas, publicación y comparación.
 *
 * Los servicios NO conocen Express (no usan req/res): reciben datos simples y
 * devuelven datos simples. Así se pueden probar y reutilizar fácilmente.
 */
const store = require('./store');
const finance = require('./finance.service');
const { enrichProperty } = require('./enrich');
const { HttpError } = require('../middleware/errors');

// ---------------------------------------------------------------------------
// Proyecciones de una propiedad (qué campos ve cada pantalla)
// ---------------------------------------------------------------------------

/** Versión liviana para tarjetas del listado. */
function toSummary(p) {
  return {
    id: p.id,
    title: p.title,
    txType: p.txType,
    price: p.price,
    zone: p.zone,
    type: p.type,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    sqm: p.sqm,
    amenities: p.amenities,
    pets: p.pets,
    ownerRating: p.ownerRating,
    reviewsCount: p.reviewsCount,
    img: p.img,
    auction: p.auction,
  };
}

/** Versión completa para el modal de detalle (incluye cálculos financieros). */
function toDetail(p) {
  const detail = {
    ...toSummary(p),
    furnished: p.furnished,
    posted: p.posted,
    owner: p.owner,
    gallery: p.gallery,
    nearby: p.nearby,
    description: p.description,
    maintenance: p.maintenance,
    utilitiesEst: p.utilitiesEst,
    monthlyCost: finance.monthlyCost(p),
    coords: p.coords,
  };

  if (p.txType === 'Venta') {
    const analysis = finance.investmentAnalysis(p);
    detail.roi = { value5y: analysis.projections.y5, appreciation5yPct: analysis.appreciation5yPct };
  }
  return detail;
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

function findById(id) {
  const property = store.properties.find((p) => p.id === id);
  if (!property) throw new HttpError(404, `No existe la propiedad #${id}.`);
  return property;
}

/** Minúsculas y sin tildes: "Pacífica" → "pacifica", "Habitación" → "habitacion". */
const normalize = (text) => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Texto en el que busca la palabra clave (título, zona, tipo, operación, amenidades…).
 * No incluye `description`: se genera con una plantilla (enrich.js) que repite
 * palabras como "habitaciones" en todas las propiedades y ensuciaba los resultados.
 */
const searchText = (p) => normalize([
  p.title, p.zone, p.type, p.txType, p.furnished, ...(p.amenities || []),
  p.pets ? 'mascotas pet friendly' : '', p.auction ? 'subasta' : '',
].join(' '));

/**
 * Filtra el catálogo.
 * La palabra clave ignora mayúsculas y tildes, y con varias palabras exige
 * que estén TODAS ("piscina costa" → propiedades con piscina en Costa del Este).
 * @param {object} f  { tx, zone, type, bedrooms, pets, auction, maxPrice, q }
 */
function search(f = {}) {
  const words = normalize(f.q).split(/\s+/).filter(Boolean);

  return store.properties.filter((p) => {
    if (f.tx && f.tx !== 'ambos' && p.txType.toLowerCase() !== f.tx) return false;
    if (f.zone && p.zone !== f.zone) return false;
    if (f.type && p.type !== f.type) return false;
    if (f.bedrooms && p.bedrooms < f.bedrooms) return false;
    if (f.pets && !p.pets) return false;
    if (f.auction && !p.auction) return false;
    if (f.maxPrice !== undefined && p.price > f.maxPrice) return false;
    if (words.length) {
      const haystack = searchText(p);
      if (!words.every((w) => haystack.includes(w))) return false;
    }
    return true;
  });
}

/** Ranking de zonas por actividad (simulada) y precio promedio. */
function topNeighborhoods(limit = 5) {
  const stats = {};
  store.properties.forEach((p) => {
    stats[p.zone] ||= { count: 0, totalPrice: 0 };
    stats[p.zone].count += 1;
    stats[p.zone].totalPrice += p.price;
  });

  return Object.entries(stats)
    .map(([zone, s]) => ({
      zone,
      activity: s.count * 23 + 15, // actividad mensual simulada
      avgPrice: Math.round(s.totalPrice / s.count),
    }))
    .sort((a, b) => b.activity - a.activity)
    .slice(0, limit);
}

/** Tiempo y costo estimado de traslado desde la propiedad hasta un destino fijo. */
function commute(property, destinationName) {
  const dest = store.reference.commuteDestinations[destinationName];
  if (!dest) {
    throw new HttpError(400, `Destino desconocido. Opciones: ${Object.keys(store.reference.commuteDestinations).join(', ')}.`);
  }
  const distance = Math.hypot(property.coords.x - dest.x, property.coords.y - dest.y);
  const minutes = Math.max(5, Math.round(distance / 6));
  const cost = Math.max(1, (minutes / 15) * 1.25).toFixed(2);
  return { destination: destinationName, minutes, cost, mode: minutes > 25 ? 'en Auto/Uber' : 'en Metro', icon: dest.icon };
}

/** Destinos disponibles para la calculadora de traslado. */
function commuteDestinations() {
  return Object.entries(store.reference.commuteDestinations).map(([name, d]) => ({ name, icon: d.icon }));
}

/** "Cercanos a mí": la demo no geolocaliza de verdad, devuelve 3 propiedades. */
function nearestToUser(limit = 3) {
  return [...store.properties].sort((a, b) => a.id - b.id).slice(0, limit).map((p) => ({ ...toSummary(p), nearby: p.nearby }));
}

// ---------------------------------------------------------------------------
// Mapa
// ---------------------------------------------------------------------------

/** Pines del mapa (solo lo mínimo para dibujarlos y abrir el popup). */
function mapPins({ type, bedrooms, maxPrice } = {}) {
  return store.properties
    .filter((p) => (!type || p.type === type) && (!bedrooms || p.bedrooms >= bedrooms) && (maxPrice === undefined || p.price <= maxPrice))
    .map((p) => ({
      id: p.id, title: p.title, txType: p.txType, price: p.price, hasAuction: Boolean(p.auction), coords: p.coords, img: p.gallery[0],
    }));
}

/**
 * Puntos de interés (metro, escuelas…) para las capas del mapa.
 * Se generan una vez de forma determinista: siempre dan las mismas posiciones.
 */
let poiCache = null;
function mapPois() {
  if (poiCache) return poiCache;
  const seeded = (n, mod, offset) => (n * 37 + offset) % mod;
  // [capa, cantidad, baseX, módX, offsetX, baseY, módY, offsetY]
  const layers = [
    ['metro', 6, 40, 460, 10, 40, 320, 30],
    ['buses', 8, 20, 470, 50, 20, 350, 70],
    ['schools', 6, 30, 460, 90, 30, 330, 110],
    ['supers', 7, 25, 465, 130, 25, 340, 150],
    ['malls', 5, 35, 455, 170, 35, 325, 190],
    ['restaurants', 7, 20, 470, 210, 20, 350, 230],
    ['salons', 6, 30, 460, 250, 30, 330, 270],
  ];
  poiCache = { size: { width: 500, height: 400 }, layers: {} };
  layers.forEach(([key, count, bx, mx, ox, by, my, oy]) => {
    poiCache.layers[key] = Array.from({ length: count }, (_, i) => ({ x: bx + seeded(i, mx, ox), y: by + seeded(i, my, oy) }));
  });
  return poiCache;
}

// ---------------------------------------------------------------------------
// Subastas inversas
// ---------------------------------------------------------------------------

function listAuctions() {
  return store.properties
    .filter((p) => p.auction)
    .map((p) => ({ ...toSummary(p), nextPrice: p.price - p.auction.step }));
}

/**
 * Registra una oferta confidencial.
 * Reglas: la propiedad debe tener subasta, el monto debe ser positivo,
 * no puede superar el precio actual ni estar por debajo del mínimo del vendedor.
 */
function submitOffer(propertyId, { amount, paymentTerms, message, plan }) {
  const p = findById(propertyId);
  if (!p.auction) throw new HttpError(400, 'Esta propiedad no tiene una subasta activa.');
  if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, 'El monto de la oferta debe ser un número mayor a 0.');
  if (amount > p.price) throw new HttpError(400, `La oferta no puede superar el precio actual ($${p.price.toLocaleString('en-US')}).`);
  if (amount < p.auction.minPrice) {
    throw new HttpError(400, `La oferta no puede ser menor al precio mínimo del vendedor ($${p.auction.minPrice.toLocaleString('en-US')}).`);
  }

  const id = Math.max(0, ...store.offers.map((o) => o.id)) + 1;
  const offer = { id, propertyId, plan, amount, paymentTerms, message, createdAt: new Date().toISOString() };
  store.offers.push(offer);
  return offer;
}

// ---------------------------------------------------------------------------
// Publicación de propiedades
// ---------------------------------------------------------------------------

/** Centro aproximado de una zona en el mapa (promedio de sus propiedades). */
function zoneCentroid(zone) {
  const inZone = store.properties.filter((p) => p.zone === zone);
  if (!inZone.length) return { x: 300, y: 200 };
  const avg = (key) => Math.round(inZone.reduce((sum, p) => sum + p.coords[key], 0) / inZone.length);
  return { x: avg('x'), y: avg('y') };
}

/**
 * Crea una propiedad nueva (en memoria).
 * @param {object} data  Datos YA validados por la ruta.
 */
function createProperty(data) {
  const id = store.nextPropertyId();

  const raw = {
    id,
    title: data.title,
    txType: data.txType,
    price: data.price,
    zone: data.zone,
    type: data.type || 'Apartamento',
    bedrooms: data.bedrooms || 1,
    bathrooms: data.bathrooms || 1,
    sqm: data.sqm || 60,
    amenities: data.amenities || [],
    furnished: 'Sin amueblar',
    pets: false,
    ownerRating: 5,
    reviewsCount: 0,
    posted: 'Hace unos segundos',
    img: store.reference.galleryExtras[0],
    auction: data.auction || null,
    coords: zoneCentroid(data.zone),
  };

  const property = enrichProperty(raw, store.reference);
  store.properties.push(property);
  return property;
}

// ---------------------------------------------------------------------------
// Comparador
// ---------------------------------------------------------------------------

/**
 * Datos para la tabla comparativa y el gráfico radar (hasta 3 propiedades).
 * El radar usa 5 ejes normalizados a ~100: habitaciones, baños, m², reputación, conectividad.
 */
function compare(ids) {
  const list = ids.map(findById);
  return {
    properties: list.map(toSummary),
    radar: {
      axes: ['Habitaciones', 'Baños', 'Superficie m²', 'Reputación', 'Conectividad'],
      series: list.map((p, i) => ({
        id: p.id,
        label: p.title,
        values: [p.bedrooms * 20, p.bathrooms * 25, p.sqm / 3, p.ownerRating * 20, 85 - i * 5],
      })),
    },
  };
}

module.exports = {
  toSummary, toDetail, findById, search, topNeighborhoods, commute, commuteDestinations, nearestToUser,
  mapPins, mapPois, listAuctions, submitOffer, createProperty, compare,
};
