/**
 * Comparador de hasta 3 propiedades (tabla + gráfico radar).
 * Los datos del radar los normaliza el backend (GET /api/comparison).
 */
import { byId, html, setHtml, valueOf } from '../core/dom.js';
import { api, isSuperseded } from '../core/api.js';
import { usd } from '../core/format.js';
import { state } from '../core/state.js';
import { notify, showError } from '../core/ui.js';
import { showRadar } from './charts.js';

const SELECT_IDS = ['compare-select-1', 'compare-select-2', 'compare-select-3'];

/** Llena los 3 selectores con todas las propiedades (la 3.ª es opcional). */
export async function populateComparators() {
  const [s1, s2, s3] = SELECT_IDS.map(byId);
  if (!s1 || !s2 || s1.options.length) return;
  try {
    const { items } = await api.allProperties();
    const options = items.map((p) => html`<option value="${p.id}">${p.title} (${usd(p.price)})</option>`);
    setHtml(s1, options);
    setHtml(s2, options);
    if (s3) setHtml(s3, html`<option value="">— Ninguna —</option>${options}`);
    if (items.length > 1) { s1.selectedIndex = 0; s2.selectedIndex = 1; }
  } catch (error) {
    notify(error.message, 'error');
  }
}

/** Fila de la tabla: etiqueta + una celda por propiedad. */
const row = (label, properties, cell) => html`
  <tr>
    <td class="p-3 font-semibold text-gray-600">${label}</td>
    ${properties.map((p) => html`<td class="p-3">${cell(p)}</td>`)}
  </tr>`;

export async function updateComparison() {
  await populateComparators();
  const container = byId('comparison-table-container');
  const ids = SELECT_IDS.map(valueOf).filter(Boolean).map(Number);
  if (!ids.length) return;

  try {
    const { properties, radar } = await api.compare([...new Set(ids)]);
    setHtml(container, html`
      <table class="w-full text-left border-collapse text-xs">
        <thead>
          <tr class="border-b bg-gray-50 text-gray-700">
            <th scope="col" class="p-3">Característica</th>
            ${properties.map((p) => html`<th scope="col" class="p-3 font-bold text-primary">${p.title}</th>`)}
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          ${row('Precio', properties, (p) => html`<strong class="text-emerald-600">${usd(p.price)}</strong>`)}
          ${row('Zona', properties, (p) => p.zone)}
          ${row('Habitaciones / Baños', properties, (p) => `${p.bedrooms} hab | ${p.bathrooms} baños`)}
          ${row('Metros Cuadrados', properties, (p) => `${p.sqm} m²`)}
          ${row('Mascotas', properties, (p) => (p.pets ? '✅ Permitidas' : '❌ No'))}
          ${row('Calificación Propietario', properties, (p) => html`<strong class="text-gold">⭐ ${p.ownerRating}</strong>`)}
        </tbody>
      </table>`);
    showRadar(radar.axes, radar.series);
  } catch (error) {
    if (!isSuperseded(error)) showError(container, error.message, updateComparison);
  }
}

/** Desde el detalle de una propiedad ("⚖️ Comparar"): preselecciona la cola y compara. */
export async function loadQueue(ids) {
  await populateComparators();
  ids.forEach((id, index) => {
    const select = byId(SELECT_IDS[index]);
    if (select) select.value = String(id);
  });
  state.compareQueue = [...ids];
  await updateComparison();
}
