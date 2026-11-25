/**
 * Gráficos (Chart.js).
 *
 * Chart.js se carga con <script defer> desde index.html y queda en
 * `window.Chart`. Cada gráfico se crea la primera vez que recibe datos y,
 * después, solo se actualiza (evita recrear canvases).
 */

const instances = {};

/** Colores de la marca para series de comparación. */
const SERIES_COLORS = [
  { border: '#1E3A5F', fill: 'rgba(30,58,95,0.2)' },
  { border: '#40E0D0', fill: 'rgba(64,224,208,0.2)' },
  { border: '#FF6B6B', fill: 'rgba(255,107,107,0.2)' },
];

/** Crea el gráfico en su canvas o, si ya existe, le pone los nuevos datos. */
function upsert(key, canvasId, config) {
  if (!window.Chart) {
    console.warn('Chart.js no está disponible; se omite el gráfico', key);
    return null;
  }
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  if (instances[key]) {
    instances[key].data = config.data;
    instances[key].update();
  } else {
    instances[key] = new window.Chart(canvas.getContext('2d'), config);
  }
  return instances[key];
}

/**
 * Radar comparativo de propiedades.
 * @param {string[]} axes     Nombres de los ejes.
 * @param {Array<{label:string, values:number[]}>} series
 */
export function showRadar(axes, series) {
  upsert('radar', 'radarChart', {
    type: 'radar',
    data: {
      labels: axes,
      datasets: series.map((s, i) => ({
        label: s.label,
        data: s.values,
        borderColor: SERIES_COLORS[i % SERIES_COLORS.length].border,
        backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length].fill,
      })),
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { r: { beginAtZero: true, max: 100 } } },
  });
}

/** Evolución histórica del precio (pestaña ROI). */
export function showTrend(labels, values) {
  upsert('trend', 'roiTrendChart', {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Precio Histórico ($)',
        data: values,
        borderColor: '#1E3A5F',
        backgroundColor: 'rgba(30,58,95,0.1)',
        fill: true,
        tension: 0.3,
      }],
    },
    options: { responsive: true, maintainAspectRatio: false },
  });
}

/**
 * Ingresos mensuales de la empresa (panel Holding): barras de ventas cerradas
 * y línea de alquileres cobrados (en su propio eje, porque son montos mucho menores).
 */
export function showFinance({ labels, ventas, alquileres }) {
  const tick = { color: '#cbd5e1', callback: (v) => (v >= 1000 ? `$${v / 1000}K` : `$${v}`) };
  const grid = { color: 'rgba(255,255,255,0.05)' };
  upsert('finance', 'financeChart', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { type: 'bar', label: 'Ventas cerradas ($)', data: ventas, backgroundColor: 'rgba(255,215,0,0.75)', borderRadius: 6, yAxisID: 'y' },
        { type: 'line', label: 'Alquileres cobrados ($)', data: alquileres, borderColor: '#40E0D0', backgroundColor: 'rgba(64,224,208,0.2)', tension: 0.35, fill: false, pointRadius: 3, yAxisID: 'y1' },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#fff', font: { size: 10 } } },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: $${Number(c.raw).toLocaleString('en-US')}` } },
      },
      scales: {
        x: { ticks: { color: '#cbd5e1' }, grid },
        // suggestedMax: sin ingresos todavía, el eje muestra $0–$1K en vez de decimales
        y: { beginAtZero: true, suggestedMax: 1000, position: 'left', ticks: tick, grid, title: { display: true, text: 'Ventas', color: '#FFD700' } },
        y1: { beginAtZero: true, suggestedMax: 1000, position: 'right', ticks: tick, grid: { drawOnChartArea: false }, title: { display: true, text: 'Alquileres', color: '#40E0D0' } },
      },
    },
  });
}

/** Vistas vs consultas por mes (panel Holding). */
export function showAgency({ labels, views, inquiries }) {
  const axis = { ticks: { color: '#cbd5e1' }, grid: { color: 'rgba(255,255,255,0.05)' } };
  upsert('agency', 'agencyChart', {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Vistas', data: views, borderColor: '#40E0D0', backgroundColor: 'rgba(64,224,208,0.15)', fill: true, tension: 0.35 },
        { label: 'Consultas', data: inquiries, borderColor: '#FF6B6B', backgroundColor: 'rgba(255,107,107,0.15)', fill: true, tension: 0.35 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#fff', font: { size: 10 } } } },
      scales: { x: axis, y: axis },
    },
  });
}
