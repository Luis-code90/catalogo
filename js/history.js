import { fmt } from './ui.js';

export function openOrderHistory() {
  const overlay = document.getElementById('historyOverlay');
  const list = document.getElementById('historyList');
  const history = JSON.parse(localStorage.getItem('mirlo_order_history') || '[]');
  if (history.length === 0) {
    list.innerHTML = '<div class="history-empty">No hay pedidos anteriores.</div>';
  } else {
    list.innerHTML = history.map(entry => {
      const date = new Date(entry.date);
      const day = date.getDate();
      const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
      const month = months[date.getMonth()];
      const hours = String(date.getHours()).padStart(2,'0');
      const mins = String(date.getMinutes()).padStart(2,'0');
      const dateStr = `${day} ${month} · ${hours}:${mins}`;
      const itemsHtml = entry.items.map(item => {
        const qtyDisplay = item.cat === 'vino' || item.cat === 'sidra'
          ? `${item.qty} u.`
          : `${item.qty} funda(s) (${item.qty * item.units} u.)`;
        return `<div class="history-item-product">• ${item.name} — ${qtyDisplay}</div>`;
      }).join('');
      return `<div class="history-item">
        <div class="history-item-date">${dateStr}</div>
        ${itemsHtml}
        <div class="history-item-total">${fmt(entry.total)}</div>
      </div>`;
    }).join('');
  }
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

export function closeOrderHistory() {
  document.getElementById('historyOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

export function closeHistoryBg(e) {
  if (e.target === document.getElementById('historyOverlay')) closeOrderHistory();
}
