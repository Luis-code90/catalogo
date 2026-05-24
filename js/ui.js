import { getCART } from './state.js';
import { EMOJI, CAT } from './data.js';

export function fmt(v) {
  if (v === null || v === undefined) return 'Consultar';
  return '$ ' + v.toLocaleString('es-UY', {minimumFractionDigits:2, maximumFractionDigits:2});
}

export function imgOrEmoji(p, forModal = false) {
  if (p.img) {
    return `<img src="${p.img}" alt="${p.name}" loading="lazy">`;
  }
  return `<span class="fallback">${EMOJI[p.cat]}</span>`;
}

export function animateCartBounce() {
  const cartBtn = document.getElementById('cartBtn');
  if (!cartBtn) return;
  cartBtn.classList.add('cart-bounce');
  setTimeout(() => cartBtn.classList.remove('cart-bounce'), 300);
}

export function render(data) {
  const grid  = document.getElementById('grid');
  const empty = document.getElementById('empty');
  const lbl   = document.getElementById('countLbl');
  grid.innerHTML = '';
  if (!data.length) { empty.classList.add('show'); lbl.textContent = ''; return; }
  empty.classList.remove('show');
  lbl.textContent = data.length + ' productos';

  const CART = getCART();

  data.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.productId = p.id;
    card.style.animationDelay = (i * 0.025) + 's';
    card.innerHTML = `
      <div class="card-photo">
        ${imgOrEmoji(p)}
        <div class="cat-chip">${CAT[p.cat]}</div>
      </div>
      <div class="card-body">
        <div class="card-brand">${p.brand}</div>
        <div class="card-name">${p.name}</div>
        <div class="card-size">${p.size} · ${p.units} u/funda</div>
        <div class="card-foot">
          <div>
            <div class="c-price">${fmt(p.ppub)}</div>
            <div class="c-plabel">precio sugerido</div>
          </div>
          <button class="c-btn">+</button>
        </div>
      </div>`;
    const inCart = CART.find(c => c.id === p.id);
    if (inCart) {
      card.classList.add('in-cart');
      card.querySelector('.c-btn').textContent = '×' + inCart.qty;
    }
    grid.appendChild(card);
  });
}
