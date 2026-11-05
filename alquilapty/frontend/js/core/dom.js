/**
 * Utilidades de DOM y plantillas HTML SEGURAS.
 *
 * `html` es una función de plantilla ("tagged template") que ESCAPA
 * automáticamente cada valor interpolado. Así, aunque un dato contenga
 * `<script>` o comillas, nunca se interpreta como HTML (previene XSS):
 *
 *     el.innerHTML = html`<h3>${property.title}</h3>`;
 *
 * - Un valor `null`, `undefined` o `false` produce texto vacío.
 * - Un arreglo se une sin separadores (útil con `.map(...)`).
 * - Para insertar HTML ya seguro (otro `html`...) no hace falta nada especial:
 *   el resultado de `html` ya está marcado como seguro. Usa `raw()` solo para
 *   HTML de confianza que no venga de `html`.
 */

/** Atajos de selección. */
export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
export const byId = (id) => document.getElementById(id);

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapa los caracteres especiales de HTML de un texto. */
export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** Marca un fragmento como "ya seguro" para que `html` no lo vuelva a escapar. */
class SafeHtml {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}
export const raw = (value) => new SafeHtml(String(value));

function renderValue(value) {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(renderValue).join('');
  if (value === null || value === undefined || value === false) return '';
  return escapeHtml(value);
}

/** Plantilla HTML con escape automático (ver arriba). */
export function html(strings, ...values) {
  let out = '';
  strings.forEach((chunk, i) => {
    out += chunk;
    if (i < values.length) out += renderValue(values[i]);
  });
  return new SafeHtml(out);
}

/**
 * Pone contenido dentro de un elemento.
 * Acepta el resultado de `html`, un arreglo de ellos (sin comas entre medias)
 * o texto plano, que se ESCAPA: nunca se interpreta como HTML.
 */
export function setHtml(element, content) {
  if (element) element.innerHTML = renderValue(content);
}

/** Cambia el texto de un elemento por id (textContent: nunca interpreta HTML). */
export function setText(id, text) {
  const el = byId(id);
  if (el) el.textContent = text;
}

/** Valor de un control por id (cadena vacía si no existe). */
export const valueOf = (id) => byId(id)?.value ?? '';

/** ¿Está marcado el checkbox? */
export const isChecked = (id) => Boolean(byId(id)?.checked);

/** Retrasa `fn` hasta que pasen `wait` ms sin nuevas llamadas. */
export function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
