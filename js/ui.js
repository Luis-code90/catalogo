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
      const ppub = p.ppub;

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
            <div class="c-price-block">
              <div class="c-price">${fmt(ppub)}</div>
              <div class="c-plabel">precio sugerido</div>
            </div>
            <div class="c-qty-selector" id="cqs-${p.id}">
              <button class="cqs-btn cqs-minus" data-product-id="${p.id}">−</button>
              <span class="cqs-qty">0</span>
              <button class="cqs-btn cqs-plus" data-product-id="${p.id}">+</button>
            </div>
          </div>
        </div>`;

      const inCart = CART.filter(c => c.id === p.id).reduce((sum, c) => sum + c.qty, 0);
      if (inCart > 0) {
        card.classList.add('in-cart');
        card.querySelector('.cqs-qty').textContent = inCart;
      }
    }

    grid.appendChild(card);
  });
}

export function updateHeaderUI(displayName = null) {
  const headerUser      = document.getElementById('headerUser');
  const headerGuest     = document.getElementById('headerGuest');
  const headerUserEmail = document.getElementById('headerUserEmail');
  if (displayName) {
    if (headerUser)      headerUser.style.display    = 'flex';
    if (headerGuest)     headerGuest.style.display   = 'none';
    if (headerUserEmail) headerUserEmail.textContent = displayName;
  } else {
    if (headerUser)  headerUser.style.display  = 'none';
    if (headerGuest) headerGuest.style.display = 'flex';
  }
}

function matchCanal(canalStr, filtro) {
  const c = canalStr.toUpperCase();
  if (filtro === 'mayoristas') return c.includes('MAYORISTA');
  if (filtro === 'gdc') return c.includes('GRUPOS DE COMPRA') || c.includes('GDC');
  if (filtro === 'autoservicio') return c.includes('AUTOSERVICIO');
  if (filtro === 'tradicional') return c.includes('TRADICIONAL');
  return true;
}

export function renderPromos(promociones, productos, canalFiltro = 'todos') {
  const grid  = document.getElementById('grid');
  const empty = document.getElementById('empty');
  const lbl   = document.getElementById('countLbl');

  grid.innerHTML = '';
  empty.classList.remove('show');

  let activas = promociones.filter(pr => pr.activa);
  if (canalFiltro !== 'todos') {
    activas = activas.filter(pr => matchCanal(pr.canal, canalFiltro));
  }

  lbl.textContent = activas.length + ' promociones activas';

  document.querySelectorAll('.promo-back-btn, .canal-filters').forEach(el => el.remove());

  const backBtn = document.createElement('div');
  backBtn.className = 'promo-back-btn';
  backBtn.innerHTML = `<button onclick="window.volverCatalogo()">← Volver al catálogo</button>`;
  grid.before(backBtn);

  const canalFilters = document.createElement('div');
  canalFilters.className = 'canal-filters';
  canalFilters.innerHTML = `
    <button class="cnf ${canalFiltro === 'todos' ? 'active' : ''}" data-canal="todos">Todos</button>
    <button class="cnf ${canalFiltro === 'mayoristas' ? 'active' : ''}" data-canal="mayoristas">Mayoristas</button>
    <button class="cnf ${canalFiltro === 'autoservicio' ? 'active' : ''}" data-canal="autoservicio">Autoservicios y Petroleras</button>
    <button class="cnf ${canalFiltro === 'tradicional' ? 'active' : ''}" data-canal="tradicional">Tradicional</button>
    <button class="cnf ${canalFiltro === 'gdc' ? 'active' : ''}" data-canal="gdc">Grupos de Compra</button>
  `;
  grid.before(canalFilters);

  if (!activas.length) {
    empty.classList.add('show');
    return;
  }

  activas.forEach((pr, i) => {
    const p = productos.find(p => p.id === pr.producto_id);
    if (!p) return;

    const precioFinal = Math.round(p.pcom * (1 - pr.descuento_pct / 100));
    const ahorro = p.pcom - precioFinal;
    const precioFunda = precioFinal * pr.drop_cantidad;
    const precioFundaOriginal = p.pcom * pr.drop_cantidad;

    const card = document.createElement('div');
    card.className = 'card promo-card';
    card.dataset.productId = p.id;
    card.dataset.promoId = pr.id;
    card.dataset.dropCantidad = pr.drop_cantidad;
    card.style.animationDelay = (i * 0.025) + 's';

    card.innerHTML = `
      <div class="card-photo">
        ${imgOrEmoji(p)}
        <div class="promo-badge">${pr.tipo_promo}</div>
      </div>
      <div class="card-body">
        <div class="card-brand">${p.brand}</div>
        <div class="card-name">${p.name}</div>
        <div class="card-size">${p.size} · mín. ${pr.drop_cantidad} u.</div>
        <div class="promo-drop-label">${pr.drop_size}</div>
        <div class="promo-canal-tag">${pr.canal}</div>
        <div class="card-foot">
          <div class="c-price-block">
            <div class="c-price-subtotal">${fmt(precioFundaOriginal)}</div>
            <div class="c-price c-price-promo">${fmt(precioFunda)}</div>
            <div class="c-plabel">por ${pr.drop_cantidad} unidades</div>
            <div class="c-price-unitario">Unitario: ${fmt(precioFinal)}</div>
            <div class="c-price-ahorro">Ahorras ${fmt(ahorro * pr.drop_cantidad)}</div>
          </div>
        </div>
        <div class="promo-qty-selector">
          <button class="pqs-btn pqs-minus" data-promo-id="${pr.id}" data-product-id="${p.id}" data-drop="${pr.drop_cantidad}">−</button>
          <span class="pqs-qty" id="pqs-qty-${pr.id}">0</span>
          <button class="pqs-btn pqs-plus" data-promo-id="${pr.id}" data-product-id="${p.id}" data-drop="${pr.drop_cantidad}">+</button>
        </div>
      </div>`;

    grid.appendChild(card);
  });

  canalFilters.querySelectorAll('.cnf').forEach(btn => {
    btn.addEventListener('click', () => {
      window.renderPromosFiltered(btn.dataset.canal);
    });
  });
}

export function updateUIForRole(role, perfil) {
  const carousel = document.getElementById('promoCarousel');
  if (carousel) carousel.style.display = role === 'authenticated' ? 'block' : 'none';

  const calcBtn = document.getElementById('calcBtn');
  if (calcBtn) calcBtn.style.display = (perfil?.rol === 'vendedor' || perfil?.rol === 'admin') ? 'flex' : 'none';

  const adminLink = document.getElementById('headerAdminLink');
  if (adminLink) adminLink.style.display = (role === 'authenticated' && perfil?.rol === 'admin') ? 'flex' : 'none';

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
