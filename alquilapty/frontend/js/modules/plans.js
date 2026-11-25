/**
 * Plan activo, perfil de usuario y puntos (gamificación).
 *
 * El plan sale de:
 *   • la sesión iniciada (auth.js), si la hay; o
 *   • el simulador flotante (visitante, free, premium, holding), que usa cuentas demo.
 * El plan activo se guarda en `state.plan` y se envía al backend en cada
 * petición; el backend decide qué puede hacer cada rol (aquí solo se adapta la interfaz).
 */
import { $$, byId, setText } from '../core/dom.js';
import { api } from '../core/api.js';
import { state, emit } from '../core/state.js';
import { notify } from '../core/ui.js';
import { openTab } from './navigation.js';

const PLAN_IDS = ['visitor', 'free', 'premium', 'holding'];
const PLAN_NAMES = { visitor: 'Visitante', free: 'Free', premium: 'Premium', holding: 'Holding' };

/** ¿El usuario tiene cuenta? (cualquier plan menos visitante) */
export const isRegistered = () => state.plan !== 'visitor';
export const isHolding = () => state.plan === 'holding';
export const hasSession = () => Boolean(state.token);

/**
 * Para acciones que exigen cuenta (contactar, ofertar…): si es visitante,
 * avisa y lo lleva al perfil para crear la cuenta. Devuelve si puede seguir.
 */
export function requireAccount(action = 'usar esta función') {
  if (isRegistered()) return true;
  notify(`🔒 Crea una cuenta gratis para ${action}.`, 'error');
  openTab('perfil');
  return false;
}

/** Muestra el saldo de puntos en la barra superior y en el perfil. */
export function setPoints(points) {
  state.points = points;
  const label = `${points.toLocaleString('en-US')} pts`;
  setText('user-points-header', label);
  $$('.user-points-text').forEach((el) => { el.textContent = label; });
  emit('points:change', { points });
}

/** Rellena nombre, avatar y rol del perfil con los datos de la cuenta. */
function renderProfile(account) {
  $$('.profile-name').forEach((el) => { el.textContent = account.name; });
  $$('.profile-role').forEach((el) => { el.textContent = account.role; });
  $$('.profile-membersince').forEach((el) => { el.textContent = account.memberSince; });
  $$('.profile-email').forEach((el) => { el.textContent = account.email || ''; });
  $$('.profile-avatar, .nav-avatar').forEach((el) => { el.src = account.avatar; });
  setText('nav-user-name', account.session ? account.firstName : 'Mi Perfil');
}

/** Botones de la tabla de planes: el del plan activo dice "Plan Actual" y se desactiva. */
function renderPlanButtons(plan) {
  $$('[data-plan-cta]').forEach((btn) => {
    btn.dataset.label ??= btn.textContent.trim();
    const current = btn.dataset.planCta === plan;
    btn.textContent = current ? '✅ Plan Actual' : btn.dataset.label;
    btn.disabled = current;
    btn.classList.toggle('opacity-60', current);
    btn.classList.toggle('cursor-default', current);
  });
}

/** Pide al backend la cuenta actual (perfil + puntos). */
export async function loadProfile() {
  try {
    const account = await api.me();
    state.account = account;
    renderProfile(account);
    setPoints(account.points);
    return account;
  } catch (error) {
    notify(error.message, 'error');
    return null;
  }
}

/**
 * Aplica un plan a la interfaz y recarga lo que depende de él.
 * La usan el simulador y auth.js (al iniciar o cerrar sesión).
 */
export async function applyPlan(plan) {
  if (!PLAN_IDS.includes(plan)) return;
  state.plan = plan;
  document.body.dataset.plan = plan; // el CSS usa data-plan para mostrar/ocultar bloques

  setText('current-plan-badge', `Plan ${plan.toUpperCase()}`);
  PLAN_IDS.forEach((id) => {
    byId(`btn-plan-${id}`)?.classList.toggle('bg-primary', id === plan);
    byId(`btn-plan-${id}`)?.classList.toggle('text-white', id === plan);
  });
  renderPlanButtons(plan);

  await loadProfile();
  emit('plan:change', { plan });
}

/** Botones del simulador flotante. Con una sesión iniciada no se usan. */
export async function changePlan(plan) {
  if (hasSession()) {
    notify('Tienes una sesión iniciada. Cierra sesión para usar el simulador de planes.', 'error');
    return;
  }
  await applyPlan(plan);
}

/** Botones "Mejorar a…" de la tabla de planes: abren el registro con ese plan. */
export function choosePlan(plan) {
  if (plan === state.plan) return;
  if (hasSession()) {
    notify(`Para usar el plan ${PLAN_NAMES[plan]}, cierra sesión y crea una cuenta ${PLAN_NAMES[plan]}.`, 'error');
    return;
  }
  emit('auth:open', { view: 'register', plan });
}

/** Canjea puntos por un beneficio (el backend valida el saldo). */
export async function redeemPoints(item, cost) {
  if (!requireAccount('canjear puntos')) return;
  try {
    const result = await api.redeem(item, cost);
    setPoints(result.points);
    notify(result.message, 'success');
  } catch (error) {
    notify(error.message, 'error');
  }
}

// Estado inicial de los botones de la tabla de planes
renderPlanButtons(state.plan);
