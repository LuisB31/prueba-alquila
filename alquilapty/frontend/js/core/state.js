/**
 * Estado compartido y bus de eventos.
 *
 * - `state` guarda lo mínimo que varios módulos necesitan (plan activo, puntos…).
 *   El estado propio de cada pantalla vive dentro de su módulo.
 * - `emit` / `on` permiten que los módulos reaccionen entre sí SIN importarse
 *   mutuamente (p. ej. el mapa se redibuja cuando se abre su pestaña).
 *
 * Eventos usados:
 *   "tab:change"    { tab }     se abrió una pestaña
 *   "plan:change"   { plan }    cambió el plan del simulador
 *   "points:change" { points }  cambió el saldo de puntos
 *   "modal:close"   { id }      se cerró un modal
 */
export const state = {
  /** Plan activo: 'visitor' | 'free' | 'premium' | 'holding' (se envía al backend). */
  plan: 'free',
  /** Saldo de puntos del usuario actual (lo dicta el backend). */
  points: 0,
  /** Ids de propiedades en cola para el comparador (máx. 3). */
  compareQueue: [],
};

export const emit = (name, detail) => document.dispatchEvent(new CustomEvent(name, { detail }));

export const on = (name, handler) => document.addEventListener(name, (event) => handler(event.detail));
