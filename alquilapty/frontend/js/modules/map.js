/**
 * Mapa interactivo (canvas): pines de propiedades y capas de servicios.
 *
 * Qué pide a la API y cuándo:
 *   • Pines  → GET /api/map/pins   (al cambiar tipo/habitaciones/precio)
 *   • Capas  → GET /api/map/pois   (una sola vez; son fijas)
 * Activar o desactivar una capa NO llama a la API: solo redibuja.
 *
 * El backend usa un plano lógico de 500×400; aquí se escala al tamaño real del canvas.
 */
import { byId, html, setHtml, setText, valueOf, isChecked, debounce } from '../core/dom.js';
import { api, isSuperseded } from '../core/api.js';
import { DEBOUNCE_MS, MAP_SIZE } from '../core/config.js';
import { usd } from '../core/format.js';
import { notify } from '../core/ui.js';

/** Capas de servicios: id del checkbox, clave en la API, color y radio del punto. */
const LAYERS = [
  { checkbox: 'layer-metro', key: 'metro', color: '#ef4444', size: 4 },
  { checkbox: 'layer-buses', key: 'buses', color: '#f97316', size: 3.5 },
  { checkbox: 'layer-schools', key: 'schools', color: '#eab308', size: 4 },
  { checkbox: 'layer-supers', key: 'supers', color: '#22c55e', size: 4 },
  { checkbox: 'layer-malls', key: 'malls', color: '#a855f7', size: 4.5 },
  { checkbox: 'layer-restaurants', key: 'restaurants', color: '#f43f5e', size: 3.5 },
  { checkbox: 'layer-salons', key: 'salons', color: '#ec4899', size: 3.5 },
];

let pins = [];          // propiedades visibles (de la API)
let pois = null;        // puntos de interés (de la API)
let hitAreas = [];      // zonas clicables de los pines, en píxeles del canvas

/** Color del pin: turquesa alquiler, coral venta, morado subasta. */
const pinColor = (pin) => (pin.hasAuction ? '#a855f7' : pin.txType === 'Alquiler' ? '#40E0D0' : '#FF6B6B');

/** Pide los pines con los filtros actuales y redibuja. */
export async function refreshMap() {
  const type = valueOf('map-filter-type');
  const bedrooms = valueOf('map-filter-bedrooms');
  try {
    pins = await api.mapPins({
      type: type !== 'todos' ? type : undefined,
      bedrooms: bedrooms !== 'todos' ? bedrooms : undefined,
      maxPrice: valueOf('map-filter-price'),
    });
    drawMapCanvas();
  } catch (error) {
    if (!isSuperseded(error)) notify(error.message, 'error');
  }
}

export const refreshMapDebounced = debounce(refreshMap, DEBOUNCE_MS);

export function updateMapPriceLabel(value) {
  setText('map-price-label', usd(value));
}

/** Dibuja fondo, agua, capas activas y pines. No hace peticiones. */
export async function drawMapCanvas() {
  const canvas = byId('mapCanvas');
  if (!canvas) return;
  if (!pois) {
    try { pois = await api.mapPois(); } catch (error) { notify(error.message, 'error'); return; }
  }

  const ctx = canvas.getContext('2d');
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;
  const { width: W, height: H } = canvas;
  const sx = (x) => (x / MAP_SIZE.width) * W;
  const sy = (y) => (y / MAP_SIZE.height) * H;

  // Fondo y Bahía de Panamá
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.moveTo(0, H * 0.7);
  ctx.quadraticCurveTo(W * 0.5, H * 0.6, W, H * 0.85);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.fill();

  // Capas de servicios activas
  ctx.globalAlpha = 0.85;
  LAYERS.filter((layer) => isChecked(layer.checkbox)).forEach((layer) => {
    ctx.fillStyle = layer.color;
    (pois.layers[layer.key] || []).forEach((poi) => {
      ctx.beginPath();
      ctx.arc(sx(poi.x), sy(poi.y), layer.size, 0, Math.PI * 2);
      ctx.fill();
    });
  });
  ctx.globalAlpha = 1;

  // Pines de propiedades
  hitAreas = pins.map((pin) => {
    const px = sx(pin.coords.x);
    const py = sy(pin.coords.y);
    ctx.beginPath();
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.fillStyle = pinColor(pin);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '9px Inter, sans-serif';
    ctx.fillText(pin.title.split('-')[0], px + 10, py + 3);
    return { pin, px, py, r: 9 };
  });

  byId('map-popup')?.classList.add('hidden');
}

/** Clic en el canvas: si cae sobre un pin, muestra su vista rápida. */
export function handleMapClick(event) {
  const canvas = byId('mapCanvas');
  const popup = byId('map-popup');
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  const hit = hitAreas.find((h) => Math.hypot(h.px - x, h.py - y) <= h.r + 3);
  if (!hit) { popup.classList.add('hidden'); return; }

  const { pin } = hit;
  setHtml(popup, html`
    <div class="relative h-24 rounded-xl overflow-hidden mb-2">
      <img src="${pin.img}" width="224" height="96" class="w-full h-full object-cover map-3d-rotate" alt="${pin.title}">
      <span class="absolute top-1 left-1 bg-primary/90 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">${pin.txType}</span>
    </div>
    <h3 class="font-bold text-gray-800 text-[11px] line-clamp-1">${pin.title}</h3>
    <p class="text-primary font-extrabold text-xs">${usd(pin.price)}${pin.txType === 'Alquiler' ? '/mes' : ''}</p>
    <button type="button" onclick="App.openPropertyModal(${pin.id})" class="mt-1 w-full bg-primary text-white font-bold py-1.5 rounded-lg text-[10px]">Ver Detalles</button>`);

  // El popup mide ~224 px: si no cabe a la derecha, se pone a la izquierda del pin
  let left = hit.px + 15;
  let top = hit.py - 20;
  if (left + 224 > canvas.width) left = hit.px - 239;
  if (top < 0) top = 10;
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
  popup.classList.remove('hidden');
}

/** "Cercanos a mí": pide la ubicación al navegador y lista propiedades. */
export function locateNearMe() {
  if (!navigator.geolocation) {
    notify('Tu navegador no soporta geolocalización.', 'error');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    async () => {
      try {
        const nearest = await api.nearbyProperties();
        notify(`📍 Propiedades cercanas a tu ubicación actual:\n${nearest.map((p) => `• ${p.title} (${p.nearby.metro.dist} del metro)`).join('\n')}`);
      } catch (error) {
        notify(error.message, 'error');
      }
    },
    () => notify('No se pudo obtener tu ubicación. Verifica los permisos del navegador.', 'error')
  );
}
