import { fmt } from './ui.js';
import { fetchPedidosUsuario } from './supabase.js';

const MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

function formatDate(iso) {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2,'0');
  const m = String(d.getMinutes()).padStart(2,'0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} · ${h}:${m}`;
}

function renderDetalle(detalle) {
  const p = detalle.productos;
  if (!p) return '';
  const name = `${p.brand || ''} ${p.name}`.trim();
  const units = detalle.unidades_por_paquete;
  const qty = detalle.cantidad;
  const qtyDisplay = p.cat === 'vino' || p.cat === 'sidra'
    ? units === 1
      ? `${qty} unidad${qty > 1 ? 'es' : ''}`
      : `${qty} caja${qty > 1 ? 's' : ''} (${qty * 6} u.)`
    : units === 1
      ? `${qty} unidad${qty > 1 ? 'es' : ''}`
      : `${qty} funda${qty > 1 ? 's' : ''} (${qty * units} u.)`;
  return `<div class="history-item-product">• ${name} — ${qtyDisplay}</div>`;
}

export async function openOrderHistory() {
  const overlay = document.getElementById('historyOverlay');
  const list = document.getElementById('historyList');

  list.innerHTML = '<div class="history-empty">Cargando historial...</div>';
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  try {
    const pedidos = await fetchPedidosUsuario();

    if (pedidos.length === 0) {
      list.innerHTML = '<div class="history-empty">No hay pedidos anteriores.</div>';
      return;
    }

    list.innerHTML = pedidos.map(pedido => `
      <div class="history-item">
        <div class="history-item-date">${formatDate(pedido.created_at)}</div>
        ${(pedido.pedido_detalle || []).map(renderDetalle).join('')}
        <div class="history-item-total">${fmt(pedido.total)}</div>
      </div>
    `).join('');
  } catch (e) {
    list.innerHTML = '<div class="history-empty">Error al cargar historial. Intentá de nuevo.</div>';
    console.error('Error fetching order history:', e);
  }
}

export function closeOrderHistory() {
  document.getElementById('historyOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

export function closeHistoryBg(e) {
  if (e.target === document.getElementById('historyOverlay')) closeOrderHistory();
}
