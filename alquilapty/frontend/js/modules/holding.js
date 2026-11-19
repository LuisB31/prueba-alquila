/**
 * Panel Holding (inmobiliaria): equipo de administradores, cambio de cuenta y
 * gráfico de rendimiento.
 */
import { byId, html, setHtml, setText, valueOf } from '../core/dom.js';
import { api } from '../core/api.js';
import { notify, openModal, closeModal, showError } from '../core/ui.js';
import { showAgency } from './charts.js';
import { isHolding } from './plans.js';

let pendingUser = null;

const memberCard = (u) => html`
  <div class="bg-white/5 border ${u.isCurrent ? 'border-secondary' : 'border-white/10'} rounded-2xl p-3 text-center relative">
    ${u.isCurrent ? html`<span class="absolute -top-2 -right-2 bg-secondary text-primary text-[9px] font-bold px-2 py-0.5 rounded-full">Activa</span>` : ''}
    <img src="${u.avatar}" width="48" height="48" loading="lazy" class="w-12 h-12 rounded-full object-cover mx-auto mb-1 border-2 border-white/20" alt="${u.name}">
    <div class="font-bold text-[11px]">${u.name}</div>
    <div class="text-[10px] text-blue-200">${u.role}</div>
    <div class="text-[10px] text-blue-300 mb-2">${u.props} props</div>
    ${u.isCurrent ? '' : html`<button type="button" data-switch="${u.name}" class="w-full bg-white/10 hover:bg-white/20 border border-white/20 text-[10px] font-bold py-1 rounded-lg">Cambiar a esta cuenta</button>`}
  </div>`;

const inviteCard = () => html`
  <div class="bg-white/5 border border-dashed border-white/20 rounded-2xl p-3 text-center flex flex-col items-center justify-center">
    <span class="text-2xl mb-1" aria-hidden="true">➕</span>
    <button type="button" onclick="App.inviteHoldingUser()" class="text-[10px] font-bold text-secondary">Invitar usuario</button>
  </div>`;

function renderTeam({ members, limit }) {
  const container = byId('agency-team-list');
  setText('agency-team-count', members.length);
  setText('agency-team-count-2', members.length);
  setHtml(container, html`${members.map(memberCard)}${members.length < limit ? inviteCard() : ''}`);
  container.querySelectorAll('[data-switch]').forEach((btn) => btn.addEventListener('click', () => openSwitchAccount(btn.dataset.switch)));
}

/** Carga equipo y estadísticas (solo hace falta al entrar al panel Holding). */
export async function loadHolding() {
  const container = byId('agency-team-list');
  // El panel (y su API) es exclusivo del plan Holding: con otro plan no se pide nada
  if (!container || !isHolding()) return;
  try {
    const [team, stats] = await Promise.all([api.holdingTeam(), api.holdingStats()]);
    renderTeam(team);
    showAgency(stats);
  } catch (error) {
    showError(container, error.message, loadHolding);
  }
}

export function openSwitchAccount(name) {
  if (!isHolding()) return;
  pendingUser = name;
  setText('switch-account-target-name', `Ingresa la contraseña de ${name} para administrar como este usuario.`);
  openModal('modal-switch-account');
}

export async function confirmSwitchAccount(event) {
  event.preventDefault();
  if (!pendingUser) return;
  try {
    const result = await api.switchHoldingUser(pendingUser, valueOf('switch-password'));
    renderTeam(result);
    closeModal('modal-switch-account');
    byId('switch-password').value = '';
    notify(result.message, 'success');
    pendingUser = null;
  } catch (error) {
    notify(error.message, 'error');
  }
}

export async function inviteHoldingUser() {
  if (!isHolding()) return;
  try {
    notify((await api.inviteHoldingUser()).message, 'success');
  } catch (error) {
    notify(error.message, 'error'); // p. ej. "Límite de 5 usuarios alcanzado."
  }
}
