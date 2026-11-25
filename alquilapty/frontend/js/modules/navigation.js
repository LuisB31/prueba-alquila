/**
 * Navegación por pestañas.
 *
 * Cada pestaña tiene su propia URL (#/roommates, #/mapa…), así se puede
 * compartir, usar los botones atrás/adelante del navegador y cada vista
 * actualiza su <title> y meta descripción (ver seo.js).
 *
 * Al abrir una pestaña se emite el evento "tab:change"; los módulos
 * interesados (mapa, comparador, ROI…) lo escuchan para cargar sus datos.
 */
import { $$, byId } from '../core/dom.js';
import { emit } from '../core/state.js';
import { setPageMeta } from './seo.js';

/** Metadatos SEO por pestaña. */
export const TABS = {
  inicio: {
    title: 'Alquiler y venta de propiedades en Panamá | AlquilaPTY',
    description: 'Alquila o compra apartamentos, casas y oficinas en Ciudad de Panamá. Compara propiedades, calcula tu hipoteca y ROI y encuentra roommates en AlquilaPTY.',
  },
  roommates: {
    title: 'Encuentra un roommate compatible en Panamá | AlquilaPTY',
    description: 'Busca compañero de habitación compatible por horario, limpieza, mascotas y presupuesto en Ciudad de Panamá.',
  },
  subastas: {
    title: 'Subastas inversas de propiedades en Panamá | AlquilaPTY',
    description: 'Propiedades cuyo precio baja cada semana. Haz una oferta confidencial antes de que alguien más compre.',
  },
  roi: {
    title: 'Calculadora de ROI e hipoteca en Panamá | AlquilaPTY',
    description: 'Proyecta la plusvalía de tu inversión inmobiliaria a 5, 10 y 15 años y simula la cuota de tu hipoteca.',
  },
  mapa: {
    title: 'Mapa de propiedades en Panamá | AlquilaPTY',
    description: 'Explora propiedades en el mapa con capas de metro, escuelas, supermercados y centros comerciales.',
  },
  comparador: {
    title: 'Comparador de propiedades en Panamá | AlquilaPTY',
    description: 'Compara hasta tres propiedades lado a lado: precio, tamaño, zona y reputación del propietario.',
  },
  ia: {
    title: 'Asistente inmobiliario con IA | AlquilaPTY',
    description: 'Pregunta al asistente de AlquilaPTY sobre zonas, precios, subastas y oportunidades de inversión en Panamá.',
  },
  publicar: {
    title: 'Publica tu propiedad | AlquilaPTY',
    description: 'Publica tu inmueble en alquiler o venta y, si quieres, actívalo como subasta inversa.',
  },
  mensajes: {
    title: 'Mensajes | AlquilaPTY',
    description: 'Conversa con propietarios e interesados de las propiedades de AlquilaPTY.',
  },
  perfil: {
    title: 'Mi perfil, puntos y planes | AlquilaPTY',
    description: 'Gestiona tu cuenta, canjea puntos y elige el plan de AlquilaPTY que mejor se adapte a ti.',
  },
};

let currentTab = 'inicio';

export const getCurrentTab = () => currentTab;

/** Restablece título y descripción de la pestaña actual (p. ej. al cerrar un modal). */
export function restoreTabMeta() {
  setPageMeta(TABS[currentTab]);
}

/**
 * Muestra una pestaña.
 * @param {string} tabId
 * @param {object} [options]
 * @param {boolean} [options.updateUrl=true]  Añade la ruta al historial del navegador.
 * @param {boolean} [options.scroll=true]     Sube al inicio de la página.
 */
export function openTab(tabId, { updateUrl = true, scroll = true } = {}) {
  const id = TABS[tabId] ? tabId : 'inicio';
  currentTab = id;

  $$('.tab-content').forEach((el) => el.classList.remove('active'));
  byId(`tab-${id}`)?.classList.add('active');

  // Resalta el botón activo en el menú de escritorio
  $$('.nav-btn').forEach((btn) => btn.classList.remove('bg-white/20', 'font-bold'));
  document.querySelector(`.nav-btn[data-target="${id}"]`)?.classList.add('bg-white/20', 'font-bold');

  if (updateUrl && window.location.hash !== `#/${id}`) history.pushState(null, '', `#/${id}`);
  setPageMeta(TABS[id]);
  if (scroll) window.scrollTo({ top: 0 });

  emit('tab:change', { tab: id });
}
