/**
 * Perfil (Free, Premium y agentes Holding):
 *   • Mis propiedades: las que el usuario tiene en venta y en alquiler.
 *   • Historial: propiedades que alquiló o compró alguna vez.
 */
import { byId, html, setHtml, setText } from '../core/dom.js';
import { api } from '../core/api.js';
import { usd } from '../core/format.js';
import { showLoading, showError } from '../core/ui.js';
import { isRegistered } from './plans.js';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const shortDate = (iso) => { const d = new Date(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

const statusBadge = (status) => (status === 'Vendida'
  ? html`<span class="bg-gray-200 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded-full">Vendida</span>`
  : html`<span class="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full">Activa</span>`);

const propertyRow = (p) => html`
  <li>
    <button type="button" onclick="App.openPropertyModal(${p.id})" class="w-full flex items-center gap-3 p-2 rounded-2xl hover:bg-gray-50 text-left transition-colors">
      <img src="${p.img}" alt="${p.title}" width="56" height="56" loading="lazy" class="w-14 h-14 rounded-xl object-cover shrink-0">
      <span class="flex-1 min-w-0">
        <span class="block font-bold text-gray-800 text-xs truncate">${p.title}</span>
        <span class="block text-[11px] text-gray-500">📍 ${p.zone} • ${p.type}</span>
        <span class="block text-xs font-extrabold text-primary">${usd(p.price)}${p.txType === 'Alquiler' ? '/mes' : ''}</span>
      </span>
      ${statusBadge(p.status)}
    </button>
  </li>`;

const emptyRow = (text) => html`<li class="text-[11px] text-gray-400 text-center py-6 border border-dashed border-gray-200 rounded-2xl">${text}</li>`;

const historyRow = (h) => html`
  <li class="flex items-center gap-3 p-3 rounded-2xl border border-gray-100 bg-gray-50">
    <span class="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${h.kind === 'Compra' ? 'bg-amber-100' : 'bg-teal-50'}" aria-hidden="true">${h.kind === 'Compra' ? '🔑' : '🏠'}</span>
    <span class="flex-1 min-w-0">
      <span class="block font-bold text-gray-800 text-xs truncate">${h.title}</span>
      <span class="block text-[11px] text-gray-500">📍 ${h.zone} • ${shortDate(h.date)}</span>
    </span>
    <span class="text-right shrink-0">
      <span class="block text-[10px] font-bold uppercase ${h.kind === 'Compra' ? 'text-amber-700' : 'text-teal-700'}">${h.kind === 'Compra' ? 'Comprada' : 'Alquilada'}</span>
      <span class="block text-xs font-extrabold text-primary">${usd(h.amount)}${h.kind === 'Alquiler' ? '/mes' : ''}</span>
    </span>
  </li>`;

/** Carga y pinta las propiedades del usuario y su historial. */
export async function loadActivity() {
  const venta = byId('profile-props-venta');
  const alquiler = byId('profile-props-alquiler');
  const history = byId('profile-history');
  if (!venta || !isRegistered()) return;

  showLoading(venta);
  showLoading(alquiler);
  showLoading(history);
  try {
    const data = await api.activity();
    setText('profile-count-venta', data.properties.venta.length);
    setText('profile-count-alquiler', data.properties.alquiler.length);
    setText('profile-count-history', data.history.length);
    setHtml(venta, data.properties.venta.length ? data.properties.venta.map(propertyRow) : emptyRow('No tienes propiedades en venta.'));
    setHtml(alquiler, data.properties.alquiler.length ? data.properties.alquiler.map(propertyRow) : emptyRow('No tienes propiedades en alquiler.'));
    setHtml(history, data.history.length ? data.history.map(historyRow) : emptyRow('Todavía no has alquilado ni comprado ninguna propiedad.'));
  } catch (error) {
    if (error?.name === 'AbortError') return;
    showError(venta, error.message, loadActivity);
    setHtml(alquiler, '');
    setHtml(history, '');
  }
}
