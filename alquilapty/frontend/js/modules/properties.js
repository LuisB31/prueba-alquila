/**
 * Listado de propiedades (pestaña Inicio), vecindarios top y modal de detalle.
 *
 * Los filtros se envían a la API (GET /api/properties) y el servidor devuelve
 * ya las propiedades que cumplen. Aquí solo se leen los controles y se pinta.
 */
import { $$, byId, html, setHtml, setText, valueOf, isChecked, debounce } from '../core/dom.js';
import { api, isSuperseded } from '../core/api.js';
import { DEBOUNCE_MS } from '../core/config.js';
import { usd, priceLabel, plural } from '../core/format.js';
import { state, emit } from '../core/state.js';
import { notify, openModal, closeModal, showLoading, showError } from '../core/ui.js';
import { setListingSchema, setPageMeta } from './seo.js';
import { restoreTabMeta, getCurrentTab } from './navigation.js';
import { requireAccount } from './plans.js';
import { favoriteButton } from './social.js';

/** Tipo de operación elegido en los botones Alquilar / Comprar / Todos
 *  (debe coincidir con el botón resaltado de inicio en index.html: "Todos"). */
let currentTx = 'ambos';

/** Propiedad abierta en el modal y foto actual de su galería. */
let modalProperty = null;
let galleryIndex = 0;

/** Etiqueta de la subasta (se repite en tarjeta y modal con posiciones distintas). */
const auctionBadge = (position) => html`
  <span class="absolute ${position} bg-amber-500 text-white text-[10px] font-extrabold px-2.5 py-1 rounded-full flex items-center gap-1 shadow z-10">
    <i class="fas fa-chart-line" aria-hidden="true"></i> Subasta Inversa
  </span>`;

// ---------------------------------------------------------------------------
// Listado
// ---------------------------------------------------------------------------

/** Lee los controles de filtros y los traduce a parámetros de la API. */
function readFilters() {
  const zone = valueOf('filter-zone');
  const type = valueOf('filter-type');
  const bedrooms = valueOf('filter-bedrooms');
  // Con el deslizador al máximo no se limita el precio. (Con min=300 y step=5000 el
  // navegador nunca llega a 700,000: se queda en 695,300 y ocultaba propiedades caras.)
  const slider = byId('filter-price-slider');
  const atMax = slider && Number(slider.value) + Number(slider.step || 1) > Number(slider.max);
  return {
    tx: currentTx,
    zone: zone !== 'todas' ? zone : undefined,
    type: type !== 'todos' ? type : undefined,
    bedrooms: bedrooms !== 'todos' ? bedrooms : undefined,
    pets: isChecked('filter-pets'),
    auction: isChecked('filter-auction'),
    maxPrice: atMax ? undefined : valueOf('filter-price-slider'),
    q: valueOf('search-keyword').trim(),
  };
}

/** Banner patrocinado que se intercala cada 10 propiedades (solo planes Free/visitante). */
const sponsoredBanner = () => html`
  <div class="ad-container md:col-span-2 lg:col-span-3">
    <div class="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-dashed border-amber-300 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 my-2">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center font-bold text-lg" aria-hidden="true">🏦</div>
        <div>
          <span class="bg-amber-200 text-amber-900 text-[9px] font-bold px-2 py-0.5 rounded">Patrocinado</span>
          <h3 class="font-bold text-gray-800 text-xs mt-0.5">Banco Nacional de Panamá - Préstamos Hipotecarios</h3>
          <p class="text-[11px] text-gray-600">Tasas preferenciales desde 4.5% con aprobación en 48 horas.</p>
        </div>
      </div>
      <button type="button" onclick="App.notify('Solicitando información bancaria...')" class="bg-amber-600 text-white font-bold px-4 py-2 rounded-xl text-xs hover:bg-amber-700 transition-colors shrink-0">
        Simular Crédito
      </button>
    </div>
  </div>`;

/** Tarjeta de una propiedad en el listado. */
const propertyCard = (p, index) => html`
  <article class="bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 flex flex-col justify-between group">
    <div>
      <div class="relative h-48 overflow-hidden">
        <img src="${p.img}" alt="${p.title}" width="600" height="384"
             loading="${index < 3 ? 'eager' : 'lazy'}" decoding="async"
             class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
        <span class="absolute top-3 left-3 bg-primary/90 backdrop-blur text-white text-[10px] font-bold px-2.5 py-1 rounded-full uppercase">${p.txType}</span>
        ${p.auction ? auctionBadge('top-3 right-3') : ''}
        <div class="absolute bottom-3 left-3 bg-white/95 backdrop-blur px-3 py-1 rounded-full text-xs font-extrabold text-primary shadow">${priceLabel(p)}</div>
        ${favoriteButton(p.id, 'absolute bottom-3 right-3 z-10')}
      </div>

      <div class="p-4 space-y-2">
        <h3 class="font-heading font-bold text-gray-800 text-sm line-clamp-1 group-hover:text-primary transition-colors">${p.title}</h3>
        <p class="text-xs text-gray-500 flex items-center gap-1"><i class="fas fa-map-marker-alt text-accent" aria-hidden="true"></i> ${p.zone}, Panamá</p>
        <div class="flex items-center gap-3 text-xs text-gray-600 pt-1 border-t border-gray-100">
          <span>🛏️ ${p.bedrooms} hab</span><span>🚿 ${p.bathrooms} baños</span><span>📐 ${p.sqm} m²</span>
        </div>
        <div class="flex flex-wrap gap-1 pt-1">
          ${p.amenities.slice(0, 3).map((a) => html`<span class="bg-gray-100 text-gray-600 text-[10px] font-medium px-2 py-0.5 rounded-md">${a}</span>`)}
        </div>
      </div>
    </div>

    <div class="p-4 pt-0 border-t border-gray-50 flex items-center justify-between gap-2 mt-2">
      <div class="flex items-center gap-1 text-xs">
        <span class="text-gold">⭐ ${p.ownerRating}</span>
        <span class="text-gray-400 text-[10px]">(${p.reviewsCount})</span>
      </div>
      <button type="button" onclick="App.openPropertyModal(${p.id})"
              aria-label="Ver detalles de ${p.title}"
              class="bg-blue-50 hover:bg-primary hover:text-white text-primary font-bold px-3 py-1.5 rounded-xl text-xs transition-colors">
        Ver Detalles
      </button>
    </div>
  </article>`;

/** Pide el listado filtrado a la API y lo pinta. */
export async function refreshFeed() {
  const grid = byId('properties-grid');
  if (!grid) return;

  try {
    const { total, items } = await api.listProperties(readFilters());
    setText('properties-count', plural(total, 'Propiedad', 'Propiedades'));

    if (total === 0) {
      setHtml(grid, html`<p class="col-span-full text-center text-sm text-gray-500 py-12">🔍 No hay propiedades con esos filtros. Prueba ampliar tu búsqueda.</p>`);
    } else {
      setHtml(grid, items.map((p, i) => html`${i > 0 && i % 10 === 0 ? sponsoredBanner() : ''}${propertyCard(p, i)}`));
    }
    setListingSchema(items);
  } catch (error) {
    if (!isSuperseded(error)) showError(grid, error.message, refreshFeed);
  }
}

/** Igual que `refreshFeed`, pero espera a que el usuario deje de escribir/arrastrar. */
export const refreshFeedDebounced = debounce(refreshFeed, DEBOUNCE_MS);

/** Busca ya (Enter o botón Filtrar) y baja hasta los resultados. */
export async function searchNow() {
  await refreshFeed();
  byId('properties-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Enter en la barra de búsqueda: busca sin esperar el debounce. Escape la limpia. */
export function onSearchKey(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    searchNow();
  } else if (event.key === 'Escape' && event.target.value) {
    event.target.value = '';
    refreshFeed();
  }
}

/** Botones Alquilar / Comprar / Todos. */
export function filterTx(type, button) {
  currentTx = type;
  $$('.tx-btn').forEach((b) => {
    b.classList.remove('bg-white', 'text-primary', 'font-bold', 'shadow-sm');
    b.classList.add('text-gray-500', 'font-medium');
    b.setAttribute('aria-pressed', 'false');
  });
  button.classList.add('bg-white', 'text-primary', 'font-bold', 'shadow-sm');
  button.classList.remove('text-gray-500', 'font-medium');
  button.setAttribute('aria-pressed', 'true');
  refreshFeed();
}

export function updatePriceSliderLabel(value) {
  setText('price-slider-label', usd(value));
}

/** Aplica una zona al filtro y baja hasta el listado (clic en un vecindario o en el pie). */
export function filterByZone(zone) {
  const select = byId('filter-zone');
  if (select) select.value = zone;
  refreshFeed();
  byId('properties-grid')?.scrollIntoView({ behavior: 'smooth' });
}

// ---------------------------------------------------------------------------
// Top vecindarios
// ---------------------------------------------------------------------------

const MEDALS = ['🥇', '🥈', '🥉', '🏅', '🏅'];

export async function renderTopNeighborhoods() {
  const container = byId('top-neighborhoods-list');
  if (!container) return;
  try {
    const ranked = await api.topNeighborhoods();
    setHtml(container, ranked.map((z, i) => html`
      <button type="button" data-zone="${z.zone}" class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow text-center w-full">
        <span class="text-2xl block mb-1" aria-hidden="true">${MEDALS[i]}</span>
        <h3 class="font-heading font-bold text-gray-800 text-xs">${z.zone}</h3>
        <p class="text-[10px] text-gray-500">${z.activity} propiedades este mes</p>
        <span class="inline-block mt-1 bg-emerald-50 text-emerald-700 text-[9px] font-bold px-2 py-0.5 rounded-full">📈 Tendencia ↑</span>
        <p class="text-[10px] text-primary font-bold mt-1">Prom. ${usd(z.avgPrice)}</p>
      </button>`));
    container.querySelectorAll('[data-zone]').forEach((btn) => btn.addEventListener('click', () => filterByZone(btn.dataset.zone)));
  } catch (error) {
    showError(container, error.message, renderTopNeighborhoods);
  }
}

// ---------------------------------------------------------------------------
// Modal de detalle
// ---------------------------------------------------------------------------

/** Tarjeta de cercanía (metro, súper, colegio, mall). */
const nearbyCard = (icon, color, place) => html`
  <div class="${color} p-2.5 rounded-xl border">
    <span class="block text-lg" aria-hidden="true">${icon}</span>
    <span class="font-bold text-primary block">${place.dist}</span>
    <span class="text-[10px] text-gray-500">${place.name}</span>
  </div>`;

/** Contenido completo del modal (todo lo calculado viene del backend). */
function detailTemplate(p, destinations) {
  const cost = p.monthlyCost;
  return html`
  <div class="space-y-5 text-xs">
    <div class="relative h-64 rounded-2xl overflow-hidden shadow-sm bg-gray-100">
      <img id="modal-gallery-img" src="${p.gallery[0]}" width="800" height="512" class="w-full h-full object-cover transition-opacity duration-300" alt="${p.title}">
      ${p.auction ? auctionBadge('top-3 left-3') : ''}
      <span class="absolute top-3 right-3 bg-primary/90 backdrop-blur text-white text-[10px] font-bold px-2.5 py-1 rounded-full uppercase z-10">${p.type} • ${p.txType === 'Alquiler' ? 'ALQUILER' : 'VENTA'}</span>
      <button type="button" aria-label="Foto anterior" onclick="App.galleryNav(-1)" class="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white w-8 h-8 rounded-full flex items-center justify-center shadow"><i class="fas fa-chevron-left text-primary" aria-hidden="true"></i></button>
      <button type="button" aria-label="Foto siguiente" onclick="App.galleryNav(1)" class="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white w-8 h-8 rounded-full flex items-center justify-center shadow"><i class="fas fa-chevron-right text-primary" aria-hidden="true"></i></button>
      <div id="modal-gallery-dots" class="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10"></div>
    </div>

    <div class="flex justify-between items-start">
      <div>
        <h2 class="text-xl font-heading font-bold text-gray-800">${p.title}</h2>
        <p class="text-gray-500"><i class="fas fa-map-marker-alt text-accent" aria-hidden="true"></i> ${p.zone}, Ciudad de Panamá</p>
      </div>
      <div class="text-right shrink-0 pl-3 flex items-center gap-2">
        <span class="text-2xl font-extrabold text-primary block">${priceLabel(p)}</span>
        ${favoriteButton(p.id, 'border border-gray-200')}
      </div>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 bg-gray-50 p-3 rounded-xl text-center font-semibold">
      <div><span class="text-gray-400 block text-[10px]">Hab.</span>🛏️ ${p.bedrooms}</div>
      <div><span class="text-gray-400 block text-[10px]">Baños</span>🚿 ${p.bathrooms}</div>
      <div><span class="text-gray-400 block text-[10px]">Área</span>📐 ${p.sqm} m²</div>
      <div><span class="text-gray-400 block text-[10px]">Mant.</span>${usd(p.maintenance)}/mes</div>
      <div><span class="text-gray-400 block text-[10px]">Pet Friendly</span>${p.pets ? '✅ Sí' : '❌ No'}</div>
    </div>

    <div>
      <h3 class="font-bold text-gray-800 mb-1">📝 Descripción de la Propiedad</h3>
      <p class="text-gray-600 leading-relaxed">${p.description}</p>
      <div class="flex flex-wrap gap-1.5 mt-2">
        ${p.amenities.map((a) => html`<span class="bg-blue-50 text-primary px-2.5 py-1 rounded-lg font-medium">${a}</span>`)}
        <span class="bg-gray-100 px-2.5 py-1 rounded-lg text-gray-600">${p.furnished}</span>
      </div>
    </div>

    <div class="bg-gray-50 p-4 rounded-2xl border border-gray-200 flex items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <img src="${p.owner.avatar}" width="48" height="48" loading="lazy" class="w-12 h-12 rounded-full object-cover border-2 border-white shadow" alt="${p.owner.name}">
        <div>
          <div class="font-bold text-gray-800 flex items-center gap-1">${p.owner.name} <span class="text-emerald-600 text-[10px]">✅ Verificado</span></div>
          <div class="text-gold font-bold">⭐ ${p.ownerRating} <span class="text-gray-400 font-normal">(${p.reviewsCount})</span></div>
        </div>
      </div>
      ${contactButton(p, 'px-3 py-2 shrink-0', '💬 Contactar')}
    </div>

    <div>
      <h3 class="font-bold text-gray-800 mb-2">📍 Entorno y Cercanías Directas</h3>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        ${nearbyCard('🚇', 'bg-blue-50 border-blue-100', p.nearby.metro)}
        ${nearbyCard('🛒', 'bg-emerald-50 border-emerald-100', p.nearby.supermarket)}
        ${nearbyCard('🏫', 'bg-amber-50 border-amber-100', p.nearby.school)}
        ${nearbyCard('🏬', 'bg-purple-50 border-purple-100', p.nearby.mall)}
      </div>
    </div>

    <div class="bg-sky-50 p-4 rounded-2xl border border-sky-100">
      <h3 class="font-bold text-gray-800 mb-2">⏱️ Calculadora de Traslado Diario</h3>
      <select id="modal-commute-select" aria-label="Destino del traslado" onchange="App.updateModalCommute()" class="w-full bg-white border border-gray-300 rounded-xl p-2 mb-2 font-medium">
        ${destinations.map((d) => html`<option value="${d.name}">${d.icon} ${d.name}</option>`)}
      </select>
      <div id="modal-commute-result" class="bg-white p-3 rounded-xl border border-sky-200 font-bold text-primary text-center" aria-live="polite"></div>
    </div>

    <div class="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
      <h3 class="font-bold text-gray-800 mb-2">💰 Costo Real Mensual Estimado</h3>
      <div class="space-y-1 text-gray-700">
        <div class="flex justify-between"><span>${cost.baseLabel}</span><strong>${usd(cost.base)}</strong></div>
        <div class="flex justify-between"><span>Mantenimiento HOA</span><strong>${usd(cost.maintenance)}</strong></div>
        <div class="flex justify-between"><span>Servicios Est. (Luz, Agua, Wifi)</span><strong>${usd(cost.utilities)}</strong></div>
      </div>
      <div class="border-t border-emerald-200 mt-2 pt-2 flex justify-between items-center">
        <span class="font-bold text-gray-800">Gasto Total Estimado</span>
        <span class="text-lg font-extrabold text-emerald-700">${usd(cost.total)}/mes</span>
      </div>
    </div>

    ${p.roi ? html`
      <div class="bg-blue-50 p-3 rounded-xl border border-blue-200">
        <h3 class="font-bold text-primary mb-1">📈 Análisis ROI Proyectado (5 Años)</h3>
        <p class="text-gray-700">Valor Estimado en 5 Años: <strong>${usd(p.roi.value5y)}</strong> (+${p.roi.appreciation5yPct}% Plusvalía)</p>
      </div>` : ''}

    <div class="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
      <button type="button" onclick="App.askAIAboutProperty(${p.id})" class="flex-1 bg-primary text-white font-bold py-2.5 rounded-xl hover:bg-blue-900 transition-colors min-w-[120px]">🤖 Preguntar a la IA</button>
      <button type="button" onclick="App.addPropertyToCompare(${p.id})" class="flex-1 bg-indigo-100 text-indigo-700 font-bold py-2.5 rounded-xl hover:bg-indigo-200 transition-colors min-w-[100px]">⚖️ Comparar</button>
      ${contactButton(p, 'flex-1 py-2.5 min-w-[120px]', '💬 Chatear con el propietario')}
      ${p.auction && !p.sold ? html`<button type="button" onclick="App.openOfferFromDetail(${p.id})" class="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-2.5 rounded-xl transition-colors">💰 Hacer Oferta en Subasta</button>` : ''}
      ${acquireButton(p)}
    </div>
  </div>`;
}

/**
 * Botón de chat con el propietario. Las propiedades de ejemplo sin dueño
 * registrado no tienen chat; las propias tampoco (te escriben a ti).
 */
function contactButton(p, extra, label) {
  const base = `${extra} font-bold rounded-xl transition-colors`;
  if (p.ownerUserId && p.ownerUserId === state.account?.id) {
    return html`<button type="button" onclick="App.openTab('mensajes'); App.closeModal('modal-property')" class="${base} bg-gray-100 text-gray-600 hover:bg-gray-200">📥 Ver mensajes de interesados</button>`;
  }
  if (!p.chatAvailable) {
    return html`<button type="button" disabled title="Anuncio de ejemplo sin propietario registrado" class="${base} bg-gray-100 text-gray-400 cursor-not-allowed">💬 Chat no disponible</button>`;
  }
  return html`<button type="button" onclick="App.contactOwner(${p.id})" class="${base} bg-secondary text-primary hover:bg-teal-400">${label}</button>`;
}

/** Botón "Alquilar / Comprar" (simulado): queda en el historial del perfil. */
function acquireButton(p) {
  const base = 'w-full font-bold py-2.5 rounded-xl transition-colors';
  if (p.sold) return html`<button type="button" disabled class="${base} bg-gray-200 text-gray-500 cursor-default">🔒 Propiedad vendida</button>`;
  if (p.ownerUserId && p.ownerUserId === state.account?.id) {
    return html`<button type="button" disabled class="${base} bg-gray-100 text-gray-500 cursor-default">🏷️ Es tu propiedad</button>`;
  }
  const label = p.txType === 'Venta' ? `🔑 Comprar por ${usd(p.price)}` : `🏠 Alquilar por ${usd(p.price)}/mes`;
  return html`<button type="button" onclick="App.acquireProperty(${p.id})" class="${base} bg-emerald-600 hover:bg-emerald-700 text-white">${label} <span class="font-normal text-[10px] opacity-80">(simulado)</span></button>`;
}

/** Alquila o compra la propiedad abierta (simulado). */
export async function acquireProperty(id) {
  if (!requireAccount('alquilar o comprar')) {
    closeModal('modal-property');
    return;
  }
  try {
    const result = await api.acquireProperty(id);
    notify(result.message, 'success');
    emit('activity:change', {});
    openPropertyModal(id); // refresca el estado (p. ej. "vendida")
  } catch (error) {
    notify(error.message, 'error');
  }
}

function renderGalleryDots() {
  const dots = byId('modal-gallery-dots');
  if (!dots || !modalProperty) return;
  setHtml(dots, modalProperty.gallery.map((_, i) => html`<span class="w-2 h-2 rounded-full ${i === galleryIndex ? 'bg-white' : 'bg-white/40'} inline-block"></span>`));
}

/** Abre el detalle de una propiedad (los datos y cálculos los entrega la API). */
export async function openPropertyModal(id) {
  const container = byId('modal-property-content');
  showLoading(container, 'Cargando propiedad…');
  openModal('modal-property');

  try {
    const [property, destinations] = await Promise.all([api.getProperty(id), api.commuteDestinations()]);
    modalProperty = property;
    galleryIndex = 0;
    setHtml(container, detailTemplate(property, destinations));
    renderGalleryDots();
    await updateModalCommute();

    // SEO: el título refleja la propiedad abierta y la URL se puede compartir
    setPageMeta({ title: `${property.title} | AlquilaPTY`, description: property.description.slice(0, 155) });
    if (window.location.hash !== `#/propiedad/${id}`) history.replaceState(null, '', `#/propiedad/${id}`);
  } catch (error) {
    showError(container, error.message, () => openPropertyModal(id));
  }
}

/** Cierra el detalle y devuelve la URL y el título a la pestaña actual. */
export function onPropertyModalClosed() {
  modalProperty = null;
  restoreTabMeta();
  if (window.location.hash.startsWith('#/propiedad/')) history.replaceState(null, '', `#/${getCurrentTab()}`);
}

export function galleryNav(direction) {
  if (!modalProperty) return;
  const total = modalProperty.gallery.length;
  galleryIndex = (galleryIndex + direction + total) % total;
  const img = byId('modal-gallery-img');
  if (img) img.src = modalProperty.gallery[galleryIndex];
  renderGalleryDots();
}

/** Recalcula el traslado (lo calcula el backend). */
export async function updateModalCommute() {
  const select = byId('modal-commute-select');
  const output = byId('modal-commute-result');
  if (!modalProperty || !select || !output) return;
  try {
    const r = await api.getCommute(modalProperty.id, select.value);
    output.textContent = `${r.icon} Tiempo est: ~${r.minutes} min ${r.mode} ($${r.cost}/día)`;
  } catch (error) {
    output.textContent = error.message;
  }
}

export function askAIAboutProperty(id) {
  const title = modalProperty?.id === id ? modalProperty.title : '';
  const zone = modalProperty?.id === id ? modalProperty.zone : '';
  closeModal('modal-property');
  emit('assistant:ask', { text: `Cuéntame más sobre "${title}" en ${zone}, ¿es buena inversión?` });
}

export function addPropertyToCompare(id) {
  const queue = state.compareQueue;
  if (!queue.includes(id)) {
    if (queue.length >= 3) queue.shift();
    queue.push(id);
  }
  closeModal('modal-property');
  emit('compare:add', { ids: [...queue] });
}

/** Propiedad abierta en el modal (la usa el módulo de subastas). */
export const getModalProperty = () => modalProperty;
