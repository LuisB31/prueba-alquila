/**
 * Panel Holding (empresa inmobiliaria):
 *   • Datos de la empresa y su código de 4 dígitos.
 *   • Equipo: hasta 5 agentes. Los espacios libres se muestran y permiten
 *     agregar un agente (pide el código de la empresa).
 *   • Propiedades de la empresa en venta / alquiler: estadísticas y lista.
 *   • Gráfico financiero de ingresos y gráfico de vistas vs consultas.
 */
import { byId, html, setHtml, setText, valueOf } from '../core/dom.js';
import { api } from '../core/api.js';
import { usd } from '../core/format.js';
import { state } from '../core/state.js';
import { notify, openModal, closeModal, showError } from '../core/ui.js';
import { showAgency, showFinance } from './charts.js';
import { isHolding, applyPlan } from './plans.js';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const longDate = (iso) => { const d = new Date(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
const compact = (n) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : usd(n));

let pendingUserId = null;
let lastStats = null;
let propsFilter = 'todas';

// ---------------------------------------------------------------------------
// Equipo
// ---------------------------------------------------------------------------

const memberCard = (u) => html`
  <div class="bg-white/5 border ${u.isCurrent ? 'border-secondary' : 'border-white/10'} rounded-2xl p-3 text-center relative">
    ${u.isCurrent ? html`<span class="absolute -top-2 -right-2 bg-secondary text-primary text-[9px] font-bold px-2 py-0.5 rounded-full">Activa</span>` : ''}
    <img src="${u.avatar}" width="48" height="48" loading="lazy" class="w-12 h-12 rounded-full object-cover mx-auto mb-1 border-2 border-white/20" alt="${u.name}">
    <div class="font-bold text-[11px] truncate">${u.name}</div>
    <div class="text-[10px] text-blue-200">${u.role}</div>
    <div class="text-[10px] text-blue-300 mb-2">${u.props} props</div>
    ${u.isCurrent ? '' : html`<button type="button" data-switch="${u.id}" data-name="${u.name}" class="w-full bg-white/10 hover:bg-white/20 border border-white/20 text-[10px] font-bold py-1 rounded-lg">Cambiar a esta cuenta</button>`}
  </div>`;

const emptySlot = (n) => html`
  <button type="button" onclick="App.openAddAgent()" class="bg-white/5 hover:bg-white/10 border border-dashed border-white/20 rounded-2xl p-3 text-center flex flex-col items-center justify-center min-h-[140px] transition-colors">
    <span class="w-12 h-12 rounded-full border-2 border-dashed border-white/30 flex items-center justify-center text-xl mb-1" aria-hidden="true">➕</span>
    <span class="text-[11px] font-bold text-secondary">Agregar agente</span>
    <span class="text-[10px] text-blue-300">Espacio ${n} disponible</span>
  </button>`;

function renderTeam({ company, members, limit, freeSlots }) {
  const container = byId('agency-team-list');
  setText('agency-team-count', members.length);
  setText('agency-team-count-2', members.length);
  setText('agency-free-slots', freeSlots);
  renderCompany(company);
  const slots = Array.from({ length: freeSlots }, (_, i) => emptySlot(members.length + i + 1));
  setHtml(container, html`${members.map(memberCard)}${slots}`);
  container.querySelectorAll('[data-switch]').forEach((btn) => btn.addEventListener('click', () => openSwitchAccount(Number(btn.dataset.switch), btn.dataset.name)));
  byId('agency-add-agent-btn')?.classList.toggle('hidden', freeSlots === 0);
  setText('agency-team-limit-note', freeSlots === 0
    ? `Tu empresa ya tiene ${limit} agentes (el máximo).`
    : `Puedes agregar ${freeSlots} agente${freeSlots === 1 ? '' : 's'} más (máximo ${limit}).`);
}

function renderCompany(company) {
  setText('agency-company-name', company.name);
  setText('agency-company-email', company.email);
  setText('agency-company-code', company.code);
  setText('agency-paid-until', longDate(company.paidUntil));
  setText('add-agent-company', company.name);
}

// ---------------------------------------------------------------------------
// Estadísticas, lista de propiedades e ingresos
// ---------------------------------------------------------------------------

const propRow = (p) => html`
  <tr class="border-b border-white/5 hover:bg-white/5 cursor-pointer" onclick="App.openPropertyModal(${p.id})">
    <td class="py-2 pr-2">
      <div class="flex items-center gap-2">
        <img src="${p.img}" alt="" width="36" height="36" loading="lazy" class="w-9 h-9 rounded-lg object-cover shrink-0">
        <span class="font-bold truncate max-w-[180px]">${p.title}</span>
      </div>
    </td>
    <td class="py-2 pr-2"><span class="${p.txType === 'Venta' ? 'bg-amber-400/20 text-amber-300' : 'bg-teal-400/20 text-teal-300'} px-2 py-0.5 rounded-full text-[10px] font-bold">${p.txType}</span></td>
    <td class="py-2 pr-2 text-blue-200">${p.zone}</td>
    <td class="py-2 pr-2 font-bold">${usd(p.price)}${p.txType === 'Alquiler' ? '/mes' : ''}</td>
    <td class="py-2 pr-2 text-blue-200">${p.agent}</td>
    <td class="py-2">${p.status === 'Vendida' ? html`<span class="text-gray-400 font-bold">Vendida</span>` : html`<span class="text-emerald-400 font-bold">Activa</span>`}</td>
  </tr>`;

function renderPropsList() {
  if (!lastStats) return;
  const list = lastStats.properties.filter((p) => propsFilter === 'todas' || p.txType.toLowerCase() === propsFilter);
  setHtml(byId('agency-props-list'), list.length
    ? list.map(propRow)
    : html`<tr><td colspan="6" class="py-6 text-center text-blue-300">Todavía no hay propiedades${propsFilter === 'todas' ? '' : ` en ${propsFilter}`}. Publica desde la pestaña “Publicar”.</td></tr>`);
  ['todas', 'venta', 'alquiler'].forEach((f) => {
    const btn = byId(`agency-filter-${f}`);
    btn?.classList.toggle('bg-secondary', f === propsFilter);
    btn?.classList.toggle('text-primary', f === propsFilter);
    btn?.classList.toggle('bg-white/10', f !== propsFilter);
  });
}

export function filterAgencyProps(filter) {
  propsFilter = filter;
  renderPropsList();
}

const incomeRow = (t) => html`
  <li class="flex items-center justify-between gap-2 py-1.5 border-b border-white/5">
    <span class="min-w-0"><span class="block font-bold truncate">${t.kind === 'Compra' ? '🔑 Venta' : '🏠 Alquiler'} • ${t.title}</span><span class="text-blue-300">${longDate(t.date)}</span></span>
    <span class="font-extrabold text-emerald-400 shrink-0">+${usd(t.amount)}</span>
  </li>`;

function renderStats(stats) {
  lastStats = stats;
  const { counts, finance } = stats;
  setText('agency-kpi-venta', counts.venta);
  setText('agency-kpi-alquiler', counts.alquiler);
  setText('agency-kpi-total', counts.total);
  setText('agency-kpi-vendidas', counts.vendidas);
  setText('agency-kpi-income', compact(finance.total));
  setText('agency-kpi-income-month', `Este mes: ${usd(finance.currentMonth)}`);
  setText('agency-value-venta', `Valor en venta: ${compact(counts.valorVenta)}`);
  setText('agency-value-alquiler', `Renta mensual: ${usd(counts.rentaMensual)}`);
  setText('agency-kpi-subastas', `${counts.subastas} en subasta`);

  // Barra de proporción venta / alquiler
  const active = counts.venta + counts.alquiler;
  const pct = active ? Math.round((counts.venta / active) * 100) : 0;
  byId('agency-mix-venta').style.width = `${active ? pct : 0}%`;
  byId('agency-mix-alquiler').style.width = `${active ? 100 - pct : 0}%`;
  setText('agency-mix-label', active ? `${pct}% venta • ${100 - pct}% alquiler` : 'Sin propiedades activas');

  renderPropsList();
  setHtml(byId('agency-income-list'), finance.recent.length
    ? finance.recent.map(incomeRow)
    : html`<li class="text-blue-300 py-4 text-center">Aún no hay ingresos registrados.</li>`);
  showFinance(finance);
  showAgency(stats.traffic);
}

/** Carga equipo y estadísticas (solo hace falta al entrar al panel Holding). */
export async function loadHolding() {
  const container = byId('agency-team-list');
  // El panel (y su API) es exclusivo del plan Holding: con otro plan no se pide nada
  if (!container || !isHolding()) return;
  try {
    const [team, stats] = await Promise.all([api.holdingTeam(), api.holdingStats()]);
    renderTeam(team);
    renderStats(stats);
  } catch (error) {
    if (error?.name === 'AbortError') return;
    showError(container, error.message, loadHolding);
  }
}

// ---------------------------------------------------------------------------
// Agregar agente (con el código de la empresa)
// ---------------------------------------------------------------------------

export function openAddAgent() {
  if (!isHolding()) return;
  byId('add-agent-error').textContent = '';
  openModal('modal-add-agent');
}

export async function submitAddAgent(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const v = (name) => form.elements[name].value;
  const errorBox = byId('add-agent-error');
  errorBox.textContent = '';
  try {
    const result = await api.addHoldingAgent({
      code: v('code'), firstName: v('firstName'), lastName: v('lastName'), email: v('email'), password: v('password'),
    });
    renderTeam(result);
    form.reset();
    closeModal('modal-add-agent');
    notify(result.message, 'success');
    loadHolding(); // las estadísticas incluyen ahora al nuevo agente
  } catch (error) {
    errorBox.textContent = `⚠️ ${error.message}`;
  }
}

// ---------------------------------------------------------------------------
// Cambiar de agente activo (pide la contraseña de ese agente)
// ---------------------------------------------------------------------------

export function openSwitchAccount(userId, name) {
  if (!isHolding()) return;
  pendingUserId = userId;
  setText('switch-account-target-name', `Ingresa la contraseña de ${name} para usar su cuenta.`);
  openModal('modal-switch-account');
}

export async function confirmSwitchAccount(event) {
  event.preventDefault();
  if (!pendingUserId) return;
  try {
    const result = await api.switchHoldingUser(pendingUserId, valueOf('switch-password'));
    closeModal('modal-switch-account');
    byId('switch-password').value = '';
    pendingUserId = null;
    notify(result.message, 'success');
    await applyPlan(state.plan); // recarga perfil, actividad y panel con el agente nuevo
  } catch (error) {
    notify(error.message, 'error');
  }
}
