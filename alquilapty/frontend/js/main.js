/**
 * Punto de entrada del frontend.
 *
 * Responsabilidades (y nada más):
 *   1. Importar los módulos de cada pantalla.
 *   2. Exponer `window.App` — los atributos onclick="App.xxx()" del HTML lo usan.
 *   3. Conectar los módulos entre sí mediante eventos (core/state.js).
 *   4. Resolver la URL (#/roommates, #/zona/Obarrio, #/propiedad/3…).
 *   5. Cargar los datos iniciales desde la API.
 *
 * Mapa de carpetas:
 *   core/     infraestructura: api (backend), dom (plantillas seguras), ui (avisos/modales), state
 *   modules/  una pantalla o función por archivo (properties, map, roommates…)
 */
import { on } from './core/state.js';
import { notify, closeModal, initModals } from './core/ui.js';
import * as navigation from './modules/navigation.js';
import * as plans from './modules/plans.js';
import * as properties from './modules/properties.js';
import * as auctions from './modules/auctions.js';
import * as roommates from './modules/roommates.js';
import * as investment from './modules/investment.js';
import * as comparison from './modules/comparison.js';
import * as map from './modules/map.js';
import * as assistant from './modules/assistant.js';
import * as holding from './modules/holding.js';
import * as publish from './modules/publish.js';

// ---------------------------------------------------------------------------
// 1) API pública para el HTML
// ---------------------------------------------------------------------------
window.App = {
  notify: (message) => notify(message),
  closeModal,
  ...navigation,
  ...properties,
  ...auctions,
  ...roommates,
  ...investment,
  ...comparison,
  ...map,
  ...assistant,
  ...holding,
  ...publish,
  changePlan: plans.changePlan,
  redeemPoints: plans.redeemPoints,
};

// ---------------------------------------------------------------------------
// 2) Reacciones entre módulos
// ---------------------------------------------------------------------------

// Al abrir una pestaña, cada una carga lo suyo
on('tab:change', ({ tab }) => {
  if (tab === 'roommates') roommates.renderRoommateResults();
  if (tab === 'subastas') auctions.renderAuctions();
  if (tab === 'roi') investment.calculateROIAnalysis();
  if (tab === 'comparador') comparison.updateComparison();
  if (tab === 'mapa') map.refreshMap(); // el canvas necesita estar visible para medirse
  if (tab === 'perfil') holding.loadHolding();
});

// Cambió el plan: el listado cambia (anuncios) y el panel Holding necesita sus datos
on('plan:change', () => {
  properties.refreshFeed();
  holding.loadHolding();
});

// "Preguntar a la IA" desde el detalle de una propiedad
on('assistant:ask', ({ text }) => {
  navigation.openTab('ia');
  assistant.sendQuickPrompt(text);
});

// "Comparar" desde el detalle de una propiedad
on('compare:add', ({ ids }) => {
  navigation.openTab('comparador');
  comparison.loadQueue(ids);
});

// Al cerrar el detalle se restaura la URL y el título de la pestaña
on('modal:close', ({ id }) => {
  if (id === 'modal-property') properties.onPropertyModalClosed();
});

// El mapa se re-escala al cambiar el tamaño de la ventana
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (navigation.getCurrentTab() === 'mapa') map.drawMapCanvas();
  }, 150);
});

// ---------------------------------------------------------------------------
// 3) Rutas por URL (hash)
// ---------------------------------------------------------------------------

/** Interpreta location.hash y muestra la vista correspondiente. */
function route() {
  const [name = '', arg = ''] = window.location.hash.replace(/^#\/?/, '').split('/');

  if (name === 'propiedad' && Number(arg)) {
    navigation.openTab('inicio', { updateUrl: false, scroll: false });
    properties.openPropertyModal(Number(arg));
  } else if (name === 'zona' && arg) {
    navigation.openTab('inicio', { updateUrl: false });
    properties.filterByZone(decodeURIComponent(arg));
  } else if (name in navigation.TABS) {
    navigation.openTab(name, { updateUrl: false });
  } else if (name === '') {
    navigation.openTab('inicio', { updateUrl: false, scroll: false });
  }
  // Cualquier otro hash (p. ej. #contenido del enlace "saltar al contenido") se deja como está
}

window.addEventListener('hashchange', route);

// ---------------------------------------------------------------------------
// 4) Arranque
// ---------------------------------------------------------------------------
// Los scripts type="module" son diferidos: se ejecutan cuando el HTML ya está
// analizado por completo, así que el DOM está listo y se puede iniciar directamente.
initModals();
route();                            // pestaña inicial según la URL
plans.loadProfile();                // nombre, avatar y puntos desde la API
properties.refreshFeed();           // listado inicial
properties.renderTopNeighborhoods();
