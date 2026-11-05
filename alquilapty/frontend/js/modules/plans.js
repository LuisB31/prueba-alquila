/**
 * Simulador de planes, perfil de usuario y puntos (gamificación).
 *
 * El simulador flotante permite probar los 4 planes (visitante, free, premium,
 * holding). El plan activo se guarda en `state.plan` y se envía al backend en
 * cada petición; el backend es quien guarda el saldo de puntos.
 */
import { $$, byId, setText } from '../core/dom.js';
import { api } from '../core/api.js';
import { state, emit } from '../core/state.js';
import { notify } from '../core/ui.js';

const PLAN_IDS = ['visitor', 'free', 'premium', 'holding'];

/** Muestra el saldo de puntos en la barra superior. */
export function setPoints(points) {
  state.points = points;
  setText('user-points-header', `${points.toLocaleString('en-US')} pts`);
  emit('points:change', { points });
}

/** Rellena nombre, avatar y rol del perfil con los datos de la cuenta. */
function renderProfile(account) {
  $$('.profile-name').forEach((el) => { el.textContent = account.name; });
  $$('.profile-role').forEach((el) => { el.textContent = account.role; });
  $$('.profile-membersince').forEach((el) => { el.textContent = account.memberSince; });
  $$('.profile-avatar, .nav-avatar').forEach((el) => { el.src = account.avatar; });
}

/** Pide al backend la cuenta del plan activo (perfil + puntos). */
export async function loadProfile() {
  try {
    const account = await api.me();
    renderProfile(account);
    setPoints(account.points);
  } catch (error) {
    notify(error.message, 'error');
  }
}

/** Cambia el plan activo y refresca todo lo que depende de él. */
export async function changePlan(plan) {
  if (!PLAN_IDS.includes(plan)) return;
  state.plan = plan;
  document.body.dataset.plan = plan; // el CSS usa data-plan para mostrar/ocultar bloques

  setText('current-plan-badge', `Plan ${plan.toUpperCase()}`);
  PLAN_IDS.forEach((id) => {
    byId(`btn-plan-${id}`)?.classList.toggle('bg-primary', id === plan);
    byId(`btn-plan-${id}`)?.classList.toggle('text-white', id === plan);
  });

  await loadProfile();
  emit('plan:change', { plan });
}

/** Canjea puntos por un beneficio (el backend valida el saldo). */
export async function redeemPoints(item, cost) {
  try {
    const result = await api.redeem(item, cost);
    setPoints(result.points);
    notify(result.message, 'success');
  } catch (error) {
    notify(error.message, 'error');
  }
}
