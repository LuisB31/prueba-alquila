/**
 * Pestaña "ROI & Inversión": plusvalía proyectada, simulador de hipoteca y
 * gráfico histórico. Todos los cálculos los hace el backend
 * (GET /api/investments/:id), así hay una sola fórmula en todo el sitio.
 */
import { byId, html, setHtml, setText, valueOf } from '../core/dom.js';
import { api, isSuperseded } from '../core/api.js';
import { usd } from '../core/format.js';
import { notify } from '../core/ui.js';
import { showTrend } from './charts.js';

/** Carga las propiedades en venta en el selector (solo la primera vez). */
export async function populateSaleSelect() {
  const select = byId('roi-property-select');
  if (!select || select.options.length) return;
  try {
    const sales = await api.saleProperties();
    setHtml(select, sales.map((p) => html`<option value="${p.id}">${p.title} - ${usd(p.price)}</option>`));
  } catch (error) {
    notify(error.message, 'error');
  }
}

/** Recalcula todo el análisis con la propiedad, inicial y plazo elegidos. */
export async function calculateROIAnalysis() {
  await populateSaleSelect();
  const id = Number(valueOf('roi-property-select'));
  if (!id) return;

  try {
    const a = await api.getInvestment(id, { downPct: valueOf('mortgage-downpay'), years: valueOf('mortgage-years') });

    setHtml(byId('roi-selected-summary'), html`
      <div class="font-bold text-gray-800">${a.property.title}</div>
      <div class="text-primary font-bold">${usd(a.property.price)} • ${a.property.sqm} m²</div>
      <div class="text-gray-500">Zona: ${a.property.zone}</div>`);

    setText('roi-val-5yr', usd(a.projections.y5));
    setText('roi-val-10yr', usd(a.projections.y10));
    setText('roi-val-15yr', usd(a.projections.y15));
    setText('mortgage-monthly-payment', `${usd(a.mortgage.monthlyPayment)} / mes`);
    showTrend(a.trend.labels, a.trend.values);
  } catch (error) {
    if (!isSuperseded(error)) notify(error.message, 'error');
  }
}

/** Los selectores de inicial y plazo solo cambian la hipoteca: se recalcula igual. */
export const updateMortgageCalc = calculateROIAnalysis;
