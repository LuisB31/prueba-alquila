/**
 * Enriquecimiento de propiedades.
 *
 * Los datos base (data/properties.json) solo traen lo esencial. Aquí se les
 * añaden los campos derivados: publicador, galería, cercanías, gastos
 * estimados y descripción. Es determinista: el mismo id siempre produce el
 * mismo resultado (se usa el id como "semilla").
 */

/**
 * @param {object} property  Propiedad cruda del JSON.
 * @param {object} reference Catálogos de apoyo (data/reference.json).
 * @returns {object} La misma propiedad con los campos derivados añadidos.
 */
function enrichProperty(property, reference) {
  const p = { ...property };
  const seed = p.id;
  const pick = (list, offset = 0) => list[(seed + offset) % list.length];

  p.owner = pick(reference.owners);

  // Galería: la foto principal + 2 extra del pool
  p.gallery = [p.img, pick(reference.galleryExtras), pick(reference.galleryExtras, 2)];

  // Cercanías (nombre + distancia simulada pero estable)
  p.nearby = {
    metro:       { name: pick(reference.nearby.metro),       dist: `${(0.3 + (seed % 7) * 0.15).toFixed(1)} km` },
    supermarket: { name: pick(reference.nearby.supermarket), dist: `${100 + (seed % 5) * 80}m` },
    school:      { name: pick(reference.nearby.school),      dist: `${200 + (seed % 6) * 100}m` },
    mall:        { name: pick(reference.nearby.mall),        dist: `${400 + (seed % 8) * 120}m` },
  };

  // Gastos mensuales estimados según el tamaño
  p.maintenance = Math.round(60 + p.sqm * 1.1);
  p.utilitiesEst = Math.round(60 + p.sqm * 0.5);

  p.description = buildDescription(p);
  return p;
}

/** Texto descriptivo largo; útil también como contenido indexable. */
function buildDescription(p) {
  const operation = p.txType === 'Venta' ? 'inversión y compra' : 'alquiler';
  const furnished = p.furnished === 'Amueblado'
    ? 'totalmente amueblado y listo para habitar'
    : 'sin amueblar, ideal para personalizar a tu gusto';
  const pets = p.pets
    ? 'Se aceptan mascotas bajo reglas básicas de convivencia y limpieza de áreas comunes.'
    : 'Por políticas del reglamento de propiedad horizontal, no se permiten mascotas.';

  return `Esta ${p.type.toLowerCase()} ubicada en ${p.zone} representa una excelente opción de ${operation} en la Ciudad de Panamá. ` +
    `Con ${p.bedrooms} habitaciones y ${p.bathrooms} baños distribuidos en ${p.sqm} m² de construcción, el inmueble ofrece un espacio ${furnished}. ` +
    `Entre sus puntos fuertes destacan: ${p.amenities.join(', ')}, lo que garantiza comodidad, seguridad y plusvalía a largo plazo. ` +
    `La zona de ${p.zone} se caracteriza por su cercanía a supermercados, colegios, centros comerciales y estaciones de transporte público, facilitando la vida diaria de sus residentes. ` +
    `${pets} ` +
    `El propietario, ${p.owner.name}, mantiene una calificación de ${p.ownerRating} estrellas basada en ${p.reviewsCount} reseñas verificadas de arrendatarios y compradores anteriores, ` +
    `lo cual garantiza un proceso de negociación transparente y confiable para ambas partes interesadas en esta propiedad.`;
}

module.exports = { enrichProperty };
