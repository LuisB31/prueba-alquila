/**
 * Formulario "Publicar propiedad" (POST /api/properties).
 */
import { byId, valueOf, isChecked } from '../core/dom.js';
import { api } from '../core/api.js';
import { notify } from '../core/ui.js';
import { emit } from '../core/state.js';
import { setPoints } from './plans.js';
import { openTab } from './navigation.js';
import { refreshFeed } from './properties.js';

/** La subasta inversa solo aplica a ventas: muestra u oculta sus campos. */
export function toggleAuctionPublishFields() {
  byId('pub-auction-box').classList.toggle('hidden', valueOf('pub-tx-type') !== 'Venta');
}

export async function handlePublishSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const field = (name) => form.elements[name]?.value ?? '';

  const data = {
    title: field('title'),
    zone: field('zone'),
    txType: field('txType'),
    price: field('price'),
  };
  if (data.txType === 'Venta' && isChecked('pub-enable-auction')) {
    data.auction = { enabled: true, minPrice: field('auctionMinPrice'), step: field('auctionStep') };
  }

  try {
    const result = await api.publishProperty(data);
    setPoints(result.points);
    notify(result.message, 'success');
    form.reset();
    toggleAuctionPublishFields();
    openTab('inicio');
    refreshFeed(); // el listado ya incluye la propiedad nueva
    emit('activity:change', {}); // aparece en "Mis propiedades" y en el panel Holding
  } catch (error) {
    notify(error.message, 'error');
  }
}
