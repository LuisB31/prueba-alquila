/**
 * Favoritos y chat (pestaña "Mensajes").
 *
 * Favoritos: corazón en tarjetas y en el detalle; lista en el perfil.
 *   Los ids favoritos viven en `state.favorites` para que el listado pinte
 *   el corazón sin pedir nada más.
 *
 * Chat: bandeja a la izquierda, conversación a la derecha. No usa WebSockets:
 *   • con una conversación abierta se piden los mensajes nuevos cada 3 s;
 *   • el contador de no leídos del menú se actualiza cada 15 s.
 *   Las peticiones se pausan cuando la pestaña del navegador está oculta.
 */
import { $$, byId, html, setHtml, setText } from '../core/dom.js';
import { api } from '../core/api.js';
import { usd } from '../core/format.js';
import { state } from '../core/state.js';
import { notify, closeModal, showLoading, showError } from '../core/ui.js';
import { isRegistered, requireAccount, setPoints } from './plans.js';
import { openTab, getCurrentTab } from './navigation.js';

const THREAD_POLL_MS = 3000;
const INBOX_POLL_MS = 15000;

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function when(iso) {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString('es-PA', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === now.toDateString() ? time : `${d.getDate()} ${MONTHS[d.getMonth()]} ${time}`;
}

// ===========================================================================
// Favoritos
// ===========================================================================

/** Corazón reutilizable (tarjetas y detalle). `extra` = clases de posición/tamaño. */
export const favoriteButton = (propertyId, extra = '') => {
  const on = state.favorites.has(propertyId);
  return html`<button type="button" data-fav-id="${propertyId}" onclick="event.stopPropagation(); App.toggleFavorite(${propertyId})"
    aria-pressed="${on ? 'true' : 'false'}" aria-label="${on ? 'Quitar de favoritos' : 'Guardar en favoritos'}"
    class="fav-btn ${extra} w-9 h-9 rounded-full bg-white/95 shadow flex items-center justify-center transition-transform hover:scale-110">
    <i class="${on ? 'fas text-accent' : 'far text-gray-500'} fa-heart" aria-hidden="true"></i>
  </button>`;
};

/** Actualiza todos los corazones de una propiedad que haya en pantalla. */
function paintHearts(propertyId) {
  const on = state.favorites.has(propertyId);
  $$(`[data-fav-id="${propertyId}"]`).forEach((btn) => {
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.setAttribute('aria-label', on ? 'Quitar de favoritos' : 'Guardar en favoritos');
    const icon = btn.querySelector('i');
    icon.className = `${on ? 'fas text-accent' : 'far text-gray-500'} fa-heart`;
  });
}

/** Carga los favoritos del usuario actual (al entrar, cambiar de plan o de cuenta). */
export async function loadFavorites() {
  if (!isRegistered()) {
    state.favorites = new Set();
    renderFavoritesList({ items: [] });
    return;
  }
  try {
    const data = await api.favorites();
    state.favorites = new Set(data.ids);
    $$('[data-fav-id]').forEach((btn) => paintHearts(Number(btn.dataset.favId)));
    renderFavoritesList(data);
  } catch (error) {
    if (error?.name !== 'AbortError') console.warn('Favoritos:', error.message);
  }
}

export async function toggleFavorite(propertyId) {
  if (!requireAccount('guardar favoritos')) {
    closeModal('modal-property');
    return;
  }
  const wasOn = state.favorites.has(propertyId);
  // Respuesta inmediata en pantalla; si el servidor falla se revierte
  if (wasOn) state.favorites.delete(propertyId); else state.favorites.add(propertyId);
  paintHearts(propertyId);
  try {
    const result = wasOn ? await api.removeFavorite(propertyId) : await api.addFavorite(propertyId);
    notify(result.message, 'success');
    if (getCurrentTab() === 'perfil') loadFavorites();
  } catch (error) {
    if (wasOn) state.favorites.add(propertyId); else state.favorites.delete(propertyId);
    paintHearts(propertyId);
    notify(error.message, 'error');
  }
}

const favoriteRow = (p) => html`
  <li class="flex items-center gap-3 p-2 rounded-2xl hover:bg-gray-50 transition-colors">
    <button type="button" onclick="App.openPropertyModal(${p.id})" class="flex-1 min-w-0 flex items-center gap-3 text-left">
      <img src="${p.img}" alt="${p.title}" width="56" height="56" loading="lazy" class="w-14 h-14 rounded-xl object-cover shrink-0">
      <span class="min-w-0">
        <span class="block font-bold text-gray-800 text-xs truncate">${p.title}</span>
        <span class="block text-[11px] text-gray-500">📍 ${p.zone} • ${p.txType}${p.sold ? ' • Vendida' : ''}</span>
        <span class="block text-xs font-extrabold text-primary">${usd(p.price)}${p.txType === 'Alquiler' ? '/mes' : ''}</span>
      </span>
    </button>
    ${favoriteButton(p.id, 'shrink-0')}
  </li>`;

function renderFavoritesList({ items }) {
  const list = byId('profile-favorites');
  if (!list) return;
  setText('profile-count-favorites', items.length);
  setHtml(list, items.length
    ? items.map(favoriteRow)
    : html`<li class="text-[11px] text-gray-400 text-center py-6 border border-dashed border-gray-200 rounded-2xl">Toca el ❤️ de una propiedad para guardarla aquí.</li>`);
}

// ===========================================================================
// Chat
// ===========================================================================

let activeId = null;       // conversación abierta
let lastMessageId = 0;     // último mensaje pintado en la conversación abierta
let threadTimer = null;
let inboxTimer = null;
let sending = false;

const pageHidden = () => typeof document !== 'undefined' && document.hidden;

function setUnreadBadge(count) {
  $$('.chat-unread-badge').forEach((el) => {
    el.textContent = count > 9 ? '9+' : String(count);
    el.classList.toggle('hidden', !count);
  });
}

const avatar = (person, size = 'w-10 h-10') => (person.avatar
  ? html`<img src="${person.avatar}" alt="" width="40" height="40" loading="lazy" class="${size} rounded-full object-cover shrink-0">`
  : html`<span class="${size} rounded-full bg-primary text-white flex items-center justify-center font-bold shrink-0" aria-hidden="true">${person.name[0]}</span>`);

const inboxItem = (c) => html`
  <li>
    <button type="button" data-chat-id="${c.id}" onclick="App.selectChat(${c.id})"
      class="w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-colors ${c.id === activeId ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'}">
      ${avatar(c.other)}
      <span class="flex-1 min-w-0">
        <span class="flex items-center justify-between gap-2">
          <span class="font-bold text-gray-800 text-xs truncate">${c.other.name}</span>
          <span class="text-[10px] text-gray-400 shrink-0">${c.lastMessage ? when(c.lastMessage.createdAt) : ''}</span>
        </span>
        <span class="block text-[11px] text-primary font-semibold truncate">🏠 ${c.property.title}</span>
        <span class="flex items-center justify-between gap-2">
          <span class="block text-[11px] text-gray-500 truncate">${c.lastMessage ? `${c.lastMessage.mine ? 'Tú: ' : ''}${c.lastMessage.text}` : 'Sin mensajes todavía'}</span>
          ${c.unread ? html`<span class="bg-accent text-white text-[10px] font-bold rounded-full px-1.5 min-w-[18px] text-center shrink-0">${c.unread}</span>` : ''}
        </span>
        <span class="block text-[10px] text-gray-400">${c.role === 'propietario' ? 'Interesado en tu propiedad' : 'Propietario'}</span>
      </span>
    </button>
  </li>`;

/** Pide la bandeja y actualiza lista + contador. */
export async function refreshInbox() {
  if (!isRegistered()) {
    setUnreadBadge(0);
    return null;
  }
  try {
    const data = await api.chats();
    setUnreadBadge(data.unread);
    const list = byId('chat-list');
    if (list && getCurrentTab() === 'mensajes') {
      setHtml(list, data.items.length
        ? data.items.map(inboxItem)
        : html`<li class="text-[11px] text-gray-400 text-center py-10 px-4">No tienes conversaciones. Abre una propiedad y pulsa <strong>💬 Contactar</strong> para escribir al propietario.</li>`);
    }
    return data;
  } catch (error) {
    if (error?.name !== 'AbortError') console.warn('Chat:', error.message);
    return null;
  }
}

const bubble = (m) => html`
  <div class="flex ${m.mine ? 'justify-end' : 'justify-start'}" data-msg-id="${m.id}">
    <div class="max-w-[80%] px-3 py-2 rounded-2xl text-xs leading-relaxed break-words ${m.mine ? 'bg-primary text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'}">
      <p class="whitespace-pre-wrap">${m.text}</p>
      <span class="block text-[9px] mt-1 ${m.mine ? 'text-blue-200 text-right' : 'text-gray-400'}">${when(m.createdAt)}</span>
    </div>
  </div>`;

function appendMessages(messages) {
  const box = byId('chat-messages');
  if (!box || !messages.length) return;
  byId('chat-empty-thread')?.remove();
  const fresh = messages.filter((m) => !box.querySelector(`[data-msg-id="${m.id}"]`));
  if (!fresh.length) return;
  box.insertAdjacentHTML('beforeend', fresh.map((m) => bubble(m).toString()).join(''));
  lastMessageId = Math.max(lastMessageId, ...fresh.map((m) => m.id));
  box.scrollTop = box.scrollHeight;
}

function renderThreadHeader(c) {
  setHtml(byId('chat-thread-header'), html`
    <button type="button" onclick="App.closeChatThread()" class="md:hidden text-primary w-8 h-8 rounded-full hover:bg-gray-100" aria-label="Volver a la bandeja"><i class="fas fa-arrow-left" aria-hidden="true"></i></button>
    ${avatar(c.other)}
    <div class="flex-1 min-w-0">
      <div class="font-bold text-gray-800 text-sm truncate">${c.other.name}</div>
      <button type="button" onclick="App.openPropertyModal(${c.property.id})" class="text-[11px] text-primary font-semibold truncate hover:underline block max-w-full">🏠 ${c.property.title}</button>
    </div>
    <span class="text-[10px] text-gray-400 shrink-0">${c.role === 'propietario' ? 'Eres el propietario' : 'Eres el interesado'}</span>`);
}

function showThreadPanel(show) {
  byId('chat-thread')?.classList.toggle('hidden', !show);
  byId('chat-thread')?.classList.toggle('flex', show);
  // El aviso "Elige una conversación" solo se ve en escritorio y sin conversación abierta
  byId('chat-placeholder')?.classList.toggle('md:flex', !show);
  // En móvil se ve una cosa a la vez: bandeja o conversación
  byId('chat-inbox')?.classList.toggle('hidden', show);
  byId('chat-inbox')?.classList.toggle('md:block', true);
}

/** Abre una conversación de la bandeja. */
export async function selectChat(id) {
  activeId = id;
  lastMessageId = 0;
  showThreadPanel(true);
  const box = byId('chat-messages');
  showLoading(box, 'Cargando mensajes…');
  $$('[data-chat-id]').forEach((b) => {
    const on = Number(b.dataset.chatId) === id;
    b.classList.toggle('bg-blue-50', on);
    b.classList.toggle('border-blue-200', on);
  });
  try {
    const data = await api.chatMessages(id, 0);
    if (activeId !== id) return;
    renderThreadHeader(data.conversation);
    setHtml(box, data.messages.length ? '' : html`<p id="chat-empty-thread" class="text-center text-[11px] text-gray-400 py-10">Escribe el primer mensaje 👋</p>`);
    appendMessages(data.messages);
    byId('chat-input')?.focus();
    refreshInbox(); // los no leídos de esta conversación pasan a 0
    startThreadPolling();
  } catch (error) {
    if (error?.name === 'AbortError') return;
    showError(box, error.message, () => selectChat(id));
  }
}

export function closeChatThread() {
  activeId = null;
  stopThreadPolling();
  showThreadPanel(false);
  refreshInbox();
}

async function pollThread() {
  if (!activeId || pageHidden() || getCurrentTab() !== 'mensajes') return;
  const id = activeId;
  try {
    const data = await api.chatMessages(id, lastMessageId);
    if (activeId === id) appendMessages(data.messages);
    if (data.messages.length) refreshInbox();
  } catch { /* se reintenta en el siguiente ciclo */ }
}

function startThreadPolling() {
  stopThreadPolling();
  threadTimer = setInterval(pollThread, THREAD_POLL_MS);
}

function stopThreadPolling() {
  clearInterval(threadTimer);
  threadTimer = null;
}

/** Envío desde el formulario de la conversación abierta. */
export async function sendChatMessage(event) {
  event.preventDefault();
  const input = byId('chat-input');
  const text = input.value.trim();
  if (!text || !activeId || sending) return;
  sending = true;
  input.disabled = true;
  try {
    const { message } = await api.sendChatMessage(activeId, text);
    input.value = '';
    appendMessages([message]);
    refreshInbox();
  } catch (error) {
    notify(error.message, 'error');
  } finally {
    sending = false;
    input.disabled = false;
    input.focus();
  }
}

/** Enter envía, Shift+Enter hace salto de línea. */
export function onChatKey(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    byId('chat-form')?.requestSubmit();
  }
}

/** "Contactar" desde una propiedad: abre (o retoma) el chat con el propietario. */
export async function contactOwner(propertyId) {
  if (!requireAccount('contactar al propietario')) {
    closeModal('modal-property');
    return;
  }
  try {
    const result = await api.openChat(propertyId);
    if (result.pointsAwarded) {
      setPoints(result.points);
      notify(`💬 Chat abierto con ${result.conversation.other.name} (+${result.pointsAwarded} pts)`, 'success');
    }
    closeModal('modal-property');
    openTab('mensajes'); // carga la bandeja
    await selectChat(result.conversation.id);
  } catch (error) {
    notify(error.message, 'error');
  }
}

/** Al abrir la pestaña Mensajes. */
export async function openMessagesTab() {
  if (!isRegistered()) return;
  await refreshInbox();
  if (activeId) startThreadPolling(); else showThreadPanel(false);
}

/** Al salir de la pestaña: deja de pedir mensajes de la conversación. */
export function leaveMessagesTab() {
  stopThreadPolling();
}

/** Al cambiar de cuenta: se cierra la conversación abierta y se recargan favoritos y bandeja. */
export function resetForAccount() {
  activeId = null;
  lastMessageId = 0;
  stopThreadPolling();
  showThreadPanel(false);
  setHtml(byId('chat-list'), '');
  loadFavorites();
  refreshInbox();
}

/** Contador de no leídos en el menú (cada 15 s mientras la página está visible). */
export function startInboxPolling() {
  clearInterval(inboxTimer);
  inboxTimer = setInterval(() => { if (!pageHidden()) refreshInbox(); }, INBOX_POLL_MS);
  refreshInbox();
}
