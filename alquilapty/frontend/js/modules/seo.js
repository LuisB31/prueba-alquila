/**
 * SEO dinámico en el cliente.
 *
 * Como la página es de una sola carga (SPA con pestañas), aquí se mantienen al
 * día el <title>, la meta descripción y los datos estructurados (JSON-LD) del
 * listado, para que cada vista tenga metadatos coherentes con lo que se ve.
 */
import { $, byId } from '../core/dom.js';

/** URL canónica del sitio (la define <link rel="canonical"> en index.html). */
export function canonicalUrl() {
  return $('link[rel="canonical"]')?.href || window.location.href.split('#')[0];
}

/** Actualiza el título de la pestaña del navegador y la meta descripción. */
export function setPageMeta({ title, description }) {
  if (title) document.title = title;
  if (description) $('meta[name="description"]')?.setAttribute('content', description);
}

/**
 * Publica el listado visible como datos estructurados (schema.org ItemList),
 * para que los buscadores entiendan qué propiedades muestra la página.
 * @param {Array<{id:number,title:string,img:string}>} properties
 */
export function setListingSchema(properties) {
  let tag = byId('ld-listings');
  if (!tag) {
    tag = document.createElement('script');
    tag.type = 'application/ld+json';
    tag.id = 'ld-listings';
    document.head.appendChild(tag);
  }
  const base = canonicalUrl();
  const visible = properties.slice(0, 20);
  tag.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Propiedades disponibles en Ciudad de Panamá',
    numberOfItems: visible.length,
    itemListElement: visible.map((p, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${base}#/propiedad/${p.id}`,
      name: p.title,
      image: p.img,
    })),
  });
}
