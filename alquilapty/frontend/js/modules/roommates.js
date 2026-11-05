/**
 * Roommates: búsqueda con filtros, perfil de otro usuario y formulario del propio perfil.
 */
import { byId, html, setHtml, setText, valueOf, isChecked } from '../core/dom.js';
import { api, isSuperseded } from '../core/api.js';
import { usd } from '../core/format.js';
import { notify, openModal, closeModal, showError } from '../core/ui.js';

/** Lista actual (la reutiliza "Ver perfil" sin volver a pedirla). */
let results = [];

/** Etiqueta pequeña azul con una característica. */
const chip = (text) => html`<span class="bg-blue-50 text-primary text-[10px] font-medium px-2 py-0.5 rounded-md">${text}</span>`;

const roommateCard = (r) => html`
  <article class="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
    <img src="${r.avatar}" width="64" height="64" loading="lazy" class="w-16 h-16 rounded-full object-cover border-2 border-gray-100 shrink-0" alt="${r.name}">
    <div class="flex-1 text-xs space-y-1.5 w-full">
      <div class="flex items-center justify-between">
        <h3 class="font-heading font-bold text-gray-800 text-sm">👤 ${r.name}, ${r.age} años</h3>
        <span class="bg-emerald-50 text-emerald-600 font-extrabold px-2.5 py-1 rounded-full text-[11px]">🎯 ${r.compatibility}% compatible</span>
      </div>
      <p class="text-gray-500">${r.occupation === 'Estudiante' ? '🎓' : '💼'} ${r.occupationDetail}</p>
      <p class="text-gray-500"><i class="fas fa-map-marker-alt text-accent" aria-hidden="true"></i> Busca habitación en ${r.zone} · 💰 ${usd(r.budget)}/mes</p>
      <div class="flex flex-wrap gap-1.5 pt-1">
        ${chip(`🧹 ${r.clean}`)}${chip(`🕐 ${r.schedule}`)}${chip(`🎉 ${r.social}`)}
        ${chip(`🐾 ${r.pets ? 'Con mascota' : 'Sin mascota'}`)}${chip(`🚬 ${r.smoker}`)}
      </div>
      <div class="flex gap-2 pt-2">
        <button type="button" data-profile="${r.id}" class="flex-1 bg-gray-100 hover:bg-gray-200 text-primary font-bold py-1.5 rounded-xl text-[11px] transition-colors">Ver perfil</button>
        <button type="button" data-message="${r.id}" class="flex-1 bg-secondary hover:bg-teal-400 text-primary font-bold py-1.5 rounded-xl text-[11px] transition-colors">Enviar mensaje</button>
      </div>
    </div>
  </article>`;

/** Lee los filtros y pide la lista (ordenada por compatibilidad) a la API. */
export async function renderRoommateResults() {
  const list = byId('rm-results-list');
  if (!list) return;

  try {
    const { total, items } = await api.listRoommates({
      gender: valueOf('rm-filter-gender'),
      age: valueOf('rm-filter-age'),
      occupation: valueOf('rm-filter-occupation'),
      schedule: valueOf('rm-filter-schedule'),
      pets: isChecked('rm-filter-pets'),
    });
    results = items;

    const s = total === 1 ? '' : 's';
    setText('rm-results-count', `${total} roommate${s} compatible${s} encontrado${s}`);

    if (!total) {
      setHtml(list, html`
        <div class="bg-white rounded-2xl p-8 text-center shadow-sm border border-gray-200 space-y-2">
          <span class="text-3xl block" aria-hidden="true">🤷</span>
          <p class="text-xs text-gray-500">No encontramos roommates con esos filtros. Intenta ajustar tu búsqueda.</p>
        </div>`);
      return;
    }

    setHtml(list, items.map(roommateCard));
    list.querySelectorAll('[data-profile]').forEach((b) => b.addEventListener('click', () => viewRoommateProfile(Number(b.dataset.profile))));
    list.querySelectorAll('[data-message]').forEach((b) => b.addEventListener('click', () => contactRoommate(Number(b.dataset.message))));
  } catch (error) {
    if (!isSuperseded(error)) showError(list, error.message, renderRoommateResults);
  }
}

export function viewRoommateProfile(id) {
  const r = results.find((x) => x.id === id);
  if (!r) return;
  setHtml(byId('modal-roommate-profile-content'), html`
    <div class="text-center">
      <img src="${r.avatar}" width="80" height="80" class="w-20 h-20 rounded-full object-cover border-4 border-secondary mx-auto mb-2" alt="${r.name}">
      <h3 class="font-heading font-bold text-primary text-base">${r.name}, ${r.age} años</h3>
      <p class="text-gray-500">${r.occupationDetail}</p>
      <span class="bg-emerald-50 text-emerald-600 font-extrabold px-2.5 py-1 rounded-full text-[11px] inline-block mt-2">🎯 ${r.compatibility}% compatible contigo</span>
    </div>
    <div class="grid grid-cols-2 gap-2 pt-3 border-t">
      <div>🧹 Limpieza: <b>${r.clean}</b></div>
      <div>🕐 Horario: <b>${r.schedule}</b></div>
      <div>🎉 Vida social: <b>${r.social}</b></div>
      <div>🚬 <b>${r.smoker}</b></div>
      <div>🐾 Mascotas: <b>${r.pets ? 'Sí' : 'No'}</b></div>
      <div>💰 Presupuesto: <b>${usd(r.budget)}/mes</b></div>
    </div>
    <p class="text-gray-500 pt-2 border-t"><i class="fas fa-map-marker-alt text-accent" aria-hidden="true"></i> Busca habitación en ${r.zone}</p>
    <button type="button" id="rm-modal-message" class="w-full bg-secondary hover:bg-teal-400 text-primary font-bold py-2.5 rounded-xl mt-2 transition-colors">💬 Enviar mensaje</button>`);
  byId('rm-modal-message').addEventListener('click', () => { closeModal('modal-roommate-profile'); contactRoommate(id); });
  openModal('modal-roommate-profile');
}

export async function contactRoommate(id) {
  try {
    const result = await api.messageRoommate(id, '¡Hola! Vi tu perfil en AlquilaPTY y me gustaría contactarte.');
    notify(result.message, 'success');
  } catch (error) {
    notify(error.message, 'error');
  }
}

/** Alterna entre "Buscar roommates" y "Mi perfil de roommate". */
export function toggleRoommateView(view) {
  byId('rm-view-search').classList.toggle('hidden', view !== 'search');
  byId('rm-view-profile').classList.toggle('hidden', view !== 'profile');

  const buttons = { search: byId('rm-tab-btn-search'), profile: byId('rm-tab-btn-profile') };
  Object.entries(buttons).forEach(([name, btn]) => {
    const active = name === view;
    btn.classList.toggle('bg-white', active);
    btn.classList.toggle('text-primary', active);
    btn.classList.toggle('shadow-sm', active);
    btn.classList.toggle('font-bold', active);
    btn.classList.toggle('text-gray-500', !active);
    btn.classList.toggle('font-medium', !active);
  });
  if (view === 'search') renderRoommateResults();
}

/** Valor del radio seleccionado dentro del formulario de perfil. */
const radio = (name) => document.querySelector(`input[name="${name}"]:checked`)?.value ?? '';

export async function saveRoommateProfile(event) {
  event.preventDefault();
  try {
    const result = await api.saveRoommateProfile({
      about: valueOf('rm-about'),
      schedule: radio('rm-schedule'),
      clean: radio('rm-clean'),
      social: radio('rm-social'),
      smoker: radio('rm-smoker'),
      pets: { dog: isChecked('rm-pet-dog'), cat: isChecked('rm-pet-cat'), accept: isChecked('rm-pet-accept') },
      budget: valueOf('rm-budget'),
      moveDate: valueOf('rm-movedate'),
    });
    notify(result.message, 'success');
    toggleRoommateView('search');
  } catch (error) {
    notify(error.message, 'error');
  }
}
