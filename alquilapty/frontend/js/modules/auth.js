/**
 * Registro, inicio y cierre de sesión.
 *
 * Flujo de registro (modal "modal-auth"):
 *   1. ¿Para qué plan? Free, Premium u Holding.
 *   2. Formulario:
 *        Free     → nombre, apellido, correo y contraseña.
 *        Premium  → lo mismo + pago (simulado, no se cobra nada).
 *        Holding  → nombre de la empresa + primer agente (nombre, apellido,
 *                   correo, contraseña) + pago.
 *   3. Holding: se muestra el código de 4 dígitos de la empresa, que se pide
 *      para agregar agentes nuevos.
 *
 * El token de sesión se guarda en localStorage para no perder la sesión al
 * recargar. Sin sesión, la app usa el simulador de planes (cuentas demo).
 */
import { $$, byId, setText } from '../core/dom.js';
import { api } from '../core/api.js';
import { state } from '../core/state.js';
import { notify, openModal, closeModal } from '../core/ui.js';
import { applyPlan } from './plans.js';
import { openTab } from './navigation.js';

const TOKEN_KEY = 'alquilapty.token';
const PLANS = {
  free: { name: 'Free', price: 0, icon: '🆓' },
  premium: { name: 'Premium', price: 3, icon: '⭐' },
  holding: { name: 'Holding', price: 12, icon: '🏢' },
};
const VIEWS = ['login', 'choose', 'form', 'done'];

let selectedPlan = 'free';

// ---------------------------------------------------------------------------
// Token (localStorage puede fallar en modo privado: siempre con try/catch)
// ---------------------------------------------------------------------------

function saveToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY);
  } catch { /* sin almacenamiento: la sesión dura hasta recargar */ }
}

function readToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

// ---------------------------------------------------------------------------
// Interfaz
// ---------------------------------------------------------------------------

/** Muestra u oculta lo que depende de tener sesión: botones de la barra y el simulador. */
export function renderAuthState() {
  const loggedIn = Boolean(state.token);
  document.body.dataset.auth = loggedIn ? 'in' : 'out';
  $$('[data-auth="in"]').forEach((el) => el.classList.toggle('hidden', !loggedIn));
  $$('[data-auth="out"]').forEach((el) => el.classList.toggle('hidden', loggedIn));
  byId('plan-simulator')?.classList.toggle('hidden', loggedIn);
}

function showView(view) {
  VIEWS.forEach((v) => byId(`auth-view-${v}`)?.classList.toggle('hidden', v !== view));
  byId(`auth-view-${view}`)?.querySelector('input:not([disabled]), button')?.focus();
}

/** Activa/desactiva un grupo de campos (los desactivados no se validan ni se envían). */
function toggleFields(id, enabled) {
  const box = byId(id);
  if (!box) return;
  box.classList.toggle('hidden', !enabled);
  box.querySelectorAll('input').forEach((input) => { input.disabled = !enabled; });
}

/** Paso 2: prepara el formulario para el plan elegido. */
export function selectAuthPlan(plan) {
  if (!PLANS[plan]) return;
  selectedPlan = plan;
  const info = PLANS[plan];
  const paid = info.price > 0;

  setText('auth-form-title', `${info.icon} Cuenta ${info.name}`);
  setText('auth-form-subtitle', plan === 'holding'
    ? 'Registra tu empresa y su primer agente. Podrás tener hasta 5 agentes.'
    : 'Completa tus datos para crear tu cuenta.');
  setText('auth-person-title', plan === 'holding' ? '👤 Primer agente (administrador)' : '👤 Tus datos');
  setText('auth-pay-amount', `$${info.price}.00 / mes`);
  setText('auth-submit', paid ? `💳 Pagar $${info.price} y crear cuenta` : '✨ Crear cuenta gratis');

  toggleFields('auth-company-fields', plan === 'holding');
  toggleFields('auth-payment-fields', paid);
  byId('auth-form-error').textContent = '';
  showView('form');
}

/**
 * Abre el modal.
 * @param {'login'|'register'} [view]
 * @param {string} [plan]  Con view "register", salta directo al formulario de ese plan.
 */
export function openAuth(view = 'register', plan) {
  openModal('modal-auth');
  if (view === 'login') showView('login');
  else if (plan && PLANS[plan]) selectAuthPlan(plan);
  else showView('choose');
}

export const authBackToPlans = () => showView('choose');
export const authShowLogin = () => showView('login');
export const authShowRegister = () => showView('choose');

/** Formato amable para la tarjeta: "4242 4242 4242 4242" y "MM/AA". */
export function formatCardInput(event) {
  const input = event.target;
  if (input.name === 'cardNumber') {
    input.value = input.value.replace(/\D/g, '').slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ');
  } else if (input.name === 'expiry') {
    const digits = input.value.replace(/\D/g, '').slice(0, 4);
    input.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
  } else if (input.name === 'cvc') {
    input.value = input.value.replace(/\D/g, '').slice(0, 4);
  }
}

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------

/** Guarda la sesión y aplica el plan de la cuenta a toda la app. */
async function startSession(token) {
  state.token = token;
  saveToken(token);
  renderAuthState();
  const account = await api.session();
  await applyPlan(account.plan);
}

export async function submitRegister(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const f = (name) => (form.elements[name] && !form.elements[name].disabled ? form.elements[name].value : undefined);
  const errorBox = byId('auth-form-error');
  errorBox.textContent = '';

  const data = {
    plan: selectedPlan,
    companyName: f('companyName'),
    firstName: f('firstName'),
    lastName: f('lastName'),
    email: f('email'),
    password: f('password'),
  };
  if (PLANS[selectedPlan].price > 0) {
    data.payment = { holder: f('holder'), cardNumber: f('cardNumber'), expiry: f('expiry'), cvc: f('cvc') };
  }

  const submit = byId('auth-submit');
  submit.disabled = true;
  try {
    const result = await api.register(data);
    await startSession(result.token);
    form.reset();
    if (result.company) {
      setText('auth-done-company', result.company.name);
      setText('auth-done-code', result.company.code);
      setText('auth-done-receipt', result.receipt ? `Pago simulado aprobado: $${result.receipt.amount} • tarjeta •••• ${result.receipt.last4} • ref. ${result.receipt.reference}` : '');
      showView('done');
    } else {
      closeModal('modal-auth');
      openTab('perfil');
      const paid = result.receipt ? `\nPago simulado aprobado: $${result.receipt.amount} (•••• ${result.receipt.last4}).` : '';
      notify(result.message + paid, 'success');
    }
  } catch (error) {
    errorBox.textContent = `⚠️ ${error.message}`;
  } finally {
    submit.disabled = false;
  }
}

export async function submitLogin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const errorBox = byId('auth-login-error');
  errorBox.textContent = '';
  try {
    const result = await api.login(form.elements.email.value, form.elements.password.value);
    await startSession(result.token);
    form.reset();
    closeModal('modal-auth');
    openTab('perfil');
    notify(result.message, 'success');
  } catch (error) {
    errorBox.textContent = `⚠️ ${error.message}`;
  }
}

/** Botón final del registro Holding. */
export function finishAuth() {
  closeModal('modal-auth');
  openTab('perfil');
}

export async function logout() {
  if (!state.token) return;
  try { await api.logout(); } catch { /* aunque falle, se cierra en este navegador */ }
  state.token = null;
  saveToken(null);
  renderAuthState();
  await applyPlan('visitor');
  openTab('inicio');
  notify('👋 Sesión cerrada.', 'success');
}

/**
 * Al cargar la página: si hay un token guardado y sigue siendo válido, entra
 * con esa cuenta. Devuelve true si se restauró la sesión.
 */
export async function restoreSession() {
  const token = readToken();
  if (!token) { renderAuthState(); return false; }
  state.token = token;
  try {
    await startSession(token);
    return true;
  } catch {
    state.token = null; // token caducado: se vuelve al simulador
    saveToken(null);
    renderAuthState();
    return false;
  }
}
