/**
 * Piezas de interfaz compartidas: avisos (toasts), modales y estados de
 * carga/error. Sustituyen a los `alert()` del original.
 */
import { $$, byId, html, setHtml } from './dom.js';
import { emit } from './state.js';

// ---------------------------------------------------------------------------
// Avisos (toasts)
// ---------------------------------------------------------------------------

const TOAST_STYLES = {
  info: 'bg-white text-primary border-gray-200',
  success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  error: 'bg-red-50 text-red-700 border-red-200',
};

let toastRoot;

/** Contenedor de avisos (se crea una sola vez; `aria-live` lo anuncia a lectores de pantalla). */
function getToastRoot() {
  if (!toastRoot) {
    toastRoot = document.createElement('div');
    toastRoot.id = 'toast-root';
    toastRoot.setAttribute('aria-live', 'polite');
    toastRoot.className = 'fixed top-4 left-1/2 -translate-x-1/2 sm:left-auto sm:right-4 sm:translate-x-0 z-[60] w-[92vw] max-w-sm space-y-2 pointer-events-none';
    document.body.appendChild(toastRoot);
  }
  return toastRoot;
}

/**
 * Muestra un aviso temporal.
 * @param {string} message
 * @param {'info'|'success'|'error'} [type]
 */
export function notify(message, type = 'info') {
  const toast = document.createElement('div');
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.className = `pointer-events-auto text-xs font-semibold rounded-2xl shadow-xl border px-4 py-3 whitespace-pre-line ${TOAST_STYLES[type] || TOAST_STYLES.info}`;
  toast.textContent = message; // textContent: nunca interpreta HTML
  getToastRoot().appendChild(toast);
  setTimeout(() => toast.remove(), type === 'error' ? 6000 : 4000);
}

// ---------------------------------------------------------------------------
// Modales
// ---------------------------------------------------------------------------

/** Elemento que tenía el foco antes de abrir cada modal (para devolvérselo al cerrar). */
const previousFocus = new Map();

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function openModal(id) {
  const modal = byId(id);
  if (!modal) return;
  previousFocus.set(id, document.activeElement);
  modal.classList.remove('hidden');
  modal.querySelector(FOCUSABLE)?.focus();
}

export function closeModal(id) {
  const modal = byId(id);
  if (!modal || modal.classList.contains('hidden')) return;
  modal.classList.add('hidden');
  previousFocus.get(id)?.focus?.();
  previousFocus.delete(id);
  emit('modal:close', { id });
}

/** Cierra con Escape y al hacer clic en el fondo oscuro. Se llama una vez al iniciar. */
export function initModals() {
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const open = $$('[role="dialog"]').filter((m) => !m.classList.contains('hidden')).pop();
    if (open) closeModal(open.id);
  });
  document.addEventListener('click', (event) => {
    if (event.target.matches?.('[role="dialog"]')) closeModal(event.target.id);
  });
}

// ---------------------------------------------------------------------------
// Estados de carga y error dentro de un contenedor
// ---------------------------------------------------------------------------

/** Texto "Cargando…" dentro de un contenedor. */
export function showLoading(container, text = 'Cargando…') {
  setHtml(container, html`<p class="text-xs text-gray-400 text-center py-8" role="status">${text}</p>`);
}

/**
 * Muestra un error con botón "Reintentar".
 * @param {HTMLElement} container
 * @param {string} message
 * @param {() => void} [onRetry]
 */
export function showError(container, message, onRetry) {
  if (!container) return;
  setHtml(container, html`
    <div class="col-span-full bg-red-50 border border-red-200 text-red-700 rounded-2xl p-6 text-center text-xs space-y-3" role="alert">
      <p class="font-semibold">⚠️ ${message}</p>
      ${onRetry ? html`<button type="button" data-retry class="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded-xl transition-colors">Reintentar</button>` : ''}
    </div>`);
  container.querySelector('[data-retry]')?.addEventListener('click', onRetry);
}
