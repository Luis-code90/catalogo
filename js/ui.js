import { getCART, getUserRole } from './state.js';
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
  const isGuest = getUserRole() === 'guest';

  data.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.productId = p.id;
    card.style.animationDelay = (i * 0.025) + 's';

    if (isGuest) {
      card.classList.add('guest-card');
      card.innerHTML = `
        <div class="card-photo">
          ${imgOrEmoji(p)}
          <div class="cat-chip">${CAT[p.cat]}</div>
        </div>
        <div class="card-body">
          <div class="card-brand">${p.brand}</div>
          <div class="card-name">${p.name}</div>
          <div class="card-size">${p.size} · ${p.units} u/funda</div>
          <div class="card-barcode">Cód: ${p.barcode}</div>
        </div>`;
    } else {
      const pcom = p.pcom;
      const ppub = p.ppub;
      const esPromo = p.es_promo && p.descuento_pct > 0;
      const precioFinal = esPromo ? Math.round(pcom * (1 - p.descuento_pct / 100)) : pcom;
      const ahorro = esPromo ? pcom - precioFinal : 0;

      card.innerHTML = `
        <div class="card-photo">
          ${imgOrEmoji(p)}
          <div class="cat-chip">${CAT[p.cat]}</div>
          ${esPromo ? '<div class="promo-badge">PROMO</div>' : ''}
        </div>
        <div class="card-body">
          <div class="card-brand">${p.brand}</div>
          <div class="card-name">${p.name}</div>
          <div class="card-size">${p.size} · ${p.units} u/funda</div>
          <div class="card-foot">
            <div class="c-price-block">
              ${esPromo ? `<div class="c-price-subtotal">${fmt(pcom)}</div>` : ''}
              <div class="c-price ${esPromo ? 'c-price-promo' : ''}">${fmt(esPromo ? precioFinal : ppub)}</div>
              <div class="c-plabel">${esPromo ? 'precio promo' : 'precio sugerido'}</div>
              ${esPromo ? `<div class="c-price-ahorro">Ahorraste ${fmt(ahorro)}</div>` : ''}
            </div>
            <button class="c-btn">+</button>
          </div>
        </div>`;

      const inCart = CART.filter(c => c.id === p.id).reduce((sum, c) => sum + c.qty, 0);
      if (inCart > 0) {
        card.classList.add('in-cart');
        card.querySelector('.c-btn').textContent = '×' + inCart;
      }
    }

    grid.appendChild(card);
  });
}

export function updateHeaderUI(email = null) {
  const headerUser      = document.getElementById('headerUser');
  const headerGuest     = document.getElementById('headerGuest');
  const headerUserEmail = document.getElementById('headerUserEmail');
  if (email) {
    if (headerUser)      headerUser.style.display    = 'flex';
    if (headerGuest)     headerGuest.style.display   = 'none';
    if (headerUserEmail) headerUserEmail.textContent = email;
  } else {
    if (headerUser)  headerUser.style.display  = 'none';
    if (headerGuest) headerGuest.style.display = 'flex';
  }
}

export function updateUIForRole(role, perfil) {
  const banner = document.getElementById('promoBanner');
  if (banner) banner.style.display = role === 'authenticated' ? 'block' : 'none';

  const pill = document.getElementById('heroPill');
  const sub  = document.getElementById('heroSub');
  if (role === 'authenticated' && perfil) {
    if (pill) pill.textContent = `👋 BIENVENIDO, ${perfil.nombre.toUpperCase()}`;
    if (sub)  sub.textContent  = 'Precios actualizados para tu cuenta.';
  } else {
    if (pill) pill.textContent = '🇺🇾 DISPONIBLE DONDE MIRLO VENDE';
    if (sub)  sub.textContent  = 'Agua mineral, gaseosas, néctares, isotónicas, cervezas, vinos y sidras. Iniciá sesión para ver precios.';
  }
}
