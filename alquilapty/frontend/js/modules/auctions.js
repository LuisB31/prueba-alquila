/**
 * Subastas inversas: listado y envío de ofertas confidenciales.
 */
import { byId, html, setHtml, valueOf } from '../core/dom.js';
import { api } from '../core/api.js';
import { usd } from '../core/format.js';
import { notify, openModal, closeModal, showError } from '../core/ui.js';
import { getModalProperty } from './properties.js';
import { requireAccount } from './plans.js';

/** Propiedad a la que se le está haciendo la oferta. */
let offerTarget = null;

const auctionCard = (p) => html`
  <article class="bg-gray-50 rounded-2xl p-5 border border-gray-200 flex flex-col justify-between space-y-4">
    <div class="flex items-start gap-4">
      <img src="${p.img}" width="112" height="112" loading="lazy" class="w-28 h-28 rounded-xl object-cover" alt="${p.title}">
      <div class="space-y-1 text-xs">
        <span class="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded text-[10px]">📉 Subasta Inversa Activa</span>
        <h3 class="font-heading font-bold text-gray-800 text-sm">${p.title}</h3>
        <p class="text-gray-500">${p.zone}, Panamá</p>
        <div class="text-primary font-extrabold text-base pt-1">Precio Actual: ${usd(p.price)}</div>
      </div>
    </div>

    <div class="bg-white p-3 rounded-xl border border-gray-200 text-xs space-y-2">
      <div class="flex justify-between items-center text-gray-600 font-bold">
        <span>Próxima Reducción: En ${p.auction.daysLeft} días</span>
        <span class="text-accent">-${usd(p.auction.step)}</span>
      </div>
      <div class="flex justify-between text-[11px] text-gray-500">
        <span>Inicial: ${usd(p.auction.initialPrice)}</span>
        <span>Próximo: ${usd(p.nextPrice)}</span>
        <span>Mínimo: ${usd(p.auction.minPrice)}</span>
      </div>
    </div>

    <div class="flex gap-2">
      <button type="button" data-offer="${p.id}" class="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold py-2 rounded-xl text-xs transition-colors shadow-sm">💰 Hacer Oferta Ahora</button>
      <button type="button" onclick="App.notify('Alerta activada. Te notificaremos cuando baje el precio.')" class="bg-white border border-gray-300 text-gray-700 font-bold px-3 py-2 rounded-xl text-xs hover:bg-gray-100">🔔 Alertarme</button>
    </div>
  </article>`;

export async function renderAuctions() {
  const container = byId('auction-properties-list');
  if (!container) return;
  try {
    const auctions = await api.listAuctions();
    setHtml(container, auctions.map(auctionCard));
    container.querySelectorAll('[data-offer]').forEach((btn) => {
      const property = auctions.find((a) => a.id === Number(btn.dataset.offer));
      btn.addEventListener('click', () => openOfferModal(property));
    });
  } catch (error) {
    showError(container, error.message, renderAuctions);
  }
}

/** Abre el formulario de oferta con una sugerencia ($1,000 bajo el precio actual). */
export function openOfferModal(property) {
  if (!requireAccount('hacer ofertas en subastas')) return;
  offerTarget = property;
  const input = byId('offer-amount-input');
  input.value = Math.max(property.auction.minPrice, property.price - 1000);
  input.min = property.auction.minPrice;
  input.max = property.price;
  openModal('modal-offer');
}

/** Botón "Hacer oferta" dentro del detalle de una propiedad. */
export function openOfferFromDetail(id) {
  const property = getModalProperty();
  if (!property || property.id !== id) return;
  closeModal('modal-property');
  openOfferModal(property);
}

export async function submitAuctionOffer(event) {
  event.preventDefault();
  if (!offerTarget) return;
  try {
    const result = await api.sendOffer(offerTarget.id, {
      amount: Number(valueOf('offer-amount-input')),
      paymentTerms: valueOf('offer-terms'),
      message: valueOf('offer-message'),
    });
    closeModal('modal-offer');
    byId('offer-message').value = '';
    notify(result.message, 'success');
  } catch (error) {
    notify(error.message, 'error'); // p. ej. "La oferta no puede superar el precio actual"
  }
}
