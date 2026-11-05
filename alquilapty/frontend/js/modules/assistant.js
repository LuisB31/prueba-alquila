/**
 * Chat con el asistente inmobiliario (POST /api/assistant/chat).
 *
 * Los mensajes se insertan con `textContent`, nunca como HTML: así lo que
 * escriba el usuario (o responda el servidor) no puede inyectar código.
 */
import { byId } from '../core/dom.js';
import { api } from '../core/api.js';
import { notify } from '../core/ui.js';

/** Añade una burbuja al chat. */
function appendMessage(sender, text) {
  const isUser = sender === 'user';
  const row = document.createElement('div');
  row.className = `flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`;

  const avatar = document.createElement('div');
  avatar.className = `w-8 h-8 rounded-full ${isUser ? 'bg-secondary text-primary' : 'bg-primary text-white'} flex items-center justify-center text-xs shrink-0 mt-1`;
  avatar.innerHTML = `<i class="fas ${isUser ? 'fa-user' : 'fa-robot'}" aria-hidden="true"></i>`; // HTML fijo, sin datos

  const bubble = document.createElement('div');
  bubble.className = `${isUser ? 'bg-primary text-white rounded-tr-none' : 'bg-white text-gray-800 rounded-tl-none border'} p-3 rounded-2xl shadow-sm max-w-[80%] text-xs`;
  bubble.textContent = text;

  row.append(avatar, bubble);
  const body = byId('ai-chat-body');
  body.appendChild(row);
  body.scrollTop = body.scrollHeight;
  return bubble;
}

let sending = false;

export async function sendChatMessage() {
  const input = byId('ai-user-input');
  const text = input.value.trim();
  if (!text || sending) return;

  sending = true;
  input.value = '';
  appendMessage('user', text);
  const pending = appendMessage('ai', 'Escribiendo…');

  try {
    const { reply } = await api.chat(text);
    pending.textContent = reply;
  } catch (error) {
    pending.closest('div.flex')?.remove();
    notify(error.message, 'error');
  } finally {
    sending = false;
    byId('ai-chat-body').scrollTop = byId('ai-chat-body').scrollHeight;
  }
}

/** Botones de pregunta rápida y "Preguntar a la IA" desde una propiedad. */
export function sendQuickPrompt(text) {
  byId('ai-user-input').value = text;
  return sendChatMessage();
}
