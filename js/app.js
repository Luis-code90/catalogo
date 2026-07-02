import { initAuth, handleLogin, handleRegister, handleLogout, showAuthLogin, showAuthRegister, continueAsGuest, showAuthOverlay, showForgotPassword, handleForgotPassword, listenForRecovery, handleSetNewPassword, showSetNewPassword } from './auth.js';
import { setProducts, getProducts, setIsAdult, setVendedores, setWhatsappPhone, setPromociones, getPromociones, getUserRole, getCurrentPerfil } from './state.js';
import { fetchProductos, fetchVendedores, fetchEmpresa, fetchPromociones } from './supabase.js';
import { updateCartUI } from './cart.js';
import { loadCart } from './storage.js';
import { openModal, closeModal, closeBg, changeQty, addFromModal, selectFundaSize, selectBottleMode } from './modal.js';
import { filter, setCat, hideAlcohol } from './filters.js';
import { sendToWhatsApp } from './whatsapp.js';
import { updateClientInfoLine, editClientInfo, confirmClientInfo, cancelClientInfo, setClientType, clientStepBack, clientStepNext, openClientModal, showStep } from './client.js';
import { openOrderHistory, closeOrderHistory, closeHistoryBg } from './history.js';
import { clearCart, addToCart, addToCartById, removeFromCart } from './cart.js';
import { updateUIForRole, renderPromos, fmt } from './ui.js';
import { openProfile, closeProfile, closeProfileBg, saveProfile } from './profile.js';

// ── PRODUCT LOADING ──────────────────────────────────────
async function loadProducts() {
  try {
    const slug = window.location.pathname.split('/').filter(Boolean).find(p => p !== 'index.html') || 'mirlosas';
    const empresa = await fetchEmpresa(slug);
    const [productos, vendedores, promociones] = await Promise.all([
      fetchProductos(empresa.id),
      fetchVendedores(empresa.id),
      fetchPromociones(empresa.id)
    ]);
    setProducts(productos);
    setVendedores(vendedores);
    setPromociones(promociones);
    setWhatsappPhone(empresa.whatsapp_phone);
    return true;
  } catch (error) {
    console.error('Error loading data:', error);
    return false;
  }
}



function showLoadError() {
  const grid = document.getElementById('grid');
  const empty = document.getElementById('empty');
  const lbl = document.getElementById('countLbl');
  grid.innerHTML = '';
  empty.classList.remove('show');
  lbl.textContent = '';
  const el = document.createElement('div');
  el.className = 'load-error';
  el.innerHTML = `
    <div class="load-error-icon">⚠️</div>
    <div class="load-error-msg">No se pudo cargar el catálogo. Verificá tu conexión.</div>
    <button class="load-error-btn">Reintentar</button>
  `;
  grid.appendChild(el);
  el.querySelector('.load-error-btn').addEventListener('click', init);
}

// ── AUTH ENTRY ───────────────────────────────────────────
function openAuth() { showAuthOverlay(); }

// ── PROMO CAROUSEL ───────────────────────────────────────
function initCarousel() {
  const promociones = getPromociones();
  const productos = getProducts();
  const carousel = document.getElementById('promoCarousel');
  if (!carousel) return;

  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  document.getElementById('pcMes').textContent = meses[new Date().getMonth()];

  const nuevos = productos.filter(p => p.es_nuevo);
  document.getElementById('pcThumbs').innerHTML = nuevos.slice(0, 4).map(p =>
    p.img
      ? `<img class="pc-thumb" src="${p.img}" alt="${p.name}">`
      : `<div class="pc-thumb-fallback">🆕</div>`
  ).join('');

  let current = 0;
  const total = 2;

  function goToSlide(index) {
    current = ((index % total) + total) % total;
    document.getElementById('pcTrack').style.transition = 'transform .5s cubic-bezier(.4,0,.2,1)';
    document.getElementById('pcTrack').style.transform = `translateX(-${current * 100}%)`;
    document.querySelectorAll('.pc-dot').forEach((d, i) => d.classList.toggle('active', i === current));
  }

  document.querySelectorAll('.pc-dot').forEach(dot => {
    dot.addEventListener('click', () => goToSlide(parseInt(dot.dataset.slide)));
  });

  setInterval(() => goToSlide(current + 1), 4000);

  const track = document.getElementById('pcTrack');
  let startX = 0;
  let isDragging = false;

  track.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
  }, { passive: true });

  track.addEventListener('touchend', e => {
    const diff = startX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      goToSlide(diff > 0 ? current + 1 : current - 1);
    }
  }, { passive: true });

  track.addEventListener('mousedown', e => {
    e.preventDefault();
    startX = e.clientX;
    isDragging = true;
  });

  track.addEventListener('mouseup', e => {
    if (!isDragging) return;
    isDragging = false;
    const diff = startX - e.clientX;
    if (Math.abs(diff) > 50) {
      goToSlide(diff > 0 ? current + 1 : current - 1);
    }
  });

  track.addEventListener('mouseleave', () => { isDragging = false; });

  const pcNuevosBtn = document.getElementById('pcNuevosBtn');
  if (pcNuevosBtn) {
    pcNuevosBtn.addEventListener('click', verNuevosLanzamientos);
  }
}

// ── NUEVOS LANZAMIENTOS ───────────────────────────────────
function verNuevosLanzamientos() {
  const productos = getProducts();
  const nuevos = productos.filter(p => p.es_nuevo);
  const grid = document.getElementById('grid');
  const lbl = document.getElementById('countLbl');

  document.getElementById('catFilters').style.display = 'none';

  const existing = document.querySelector('.promo-back-btn');
  if (existing) existing.remove();
  const backBtn = document.createElement('div');
  backBtn.className = 'promo-back-btn';
  backBtn.innerHTML = `<button onclick="window.volverCatalogo()">← Volver al catálogo</button>`;
  grid.before(backBtn);

  grid.innerHTML = nuevos.map((p, i) => `
    <div class="card nuevo-card" style="animation-delay:${i * 0.025}s">
      <div class="card-photo">
        ${p.img ? `<img src="${p.img}" alt="${p.name}" loading="lazy">` : `<span class="fallback">🆕</span>`}
        <div class="cat-chip">NUEVO</div>
      </div>
      <div class="card-body">
        <div class="card-brand">${p.brand}</div>
        <div class="card-name">${p.name}</div>
        <div class="card-size">${p.size}</div>
      </div>
    </div>
  `).join('');

  lbl.textContent = nuevos.length + ' nuevos lanzamientos';
  document.getElementById('empty').classList.remove('show');
}
window.verNuevosLanzamientos = verNuevosLanzamientos;

// ── PROMO FILTER ─────────────────────────────────────────
function renderPromosFiltered(canal) {
  renderPromos(getPromociones(), getProducts(), canal);
}
window.renderPromosFiltered = renderPromosFiltered;

// ── CALCULADORA DE PRECIOS ────────────────────────────────
function initCalculadora() {
  const productos = getProducts();
  const promociones = getPromociones();

  const selectProducto = document.getElementById('calcProducto');
  if (!selectProducto) return;
  selectProducto.innerHTML = '<option value="">— Seleccioná un producto —</option>' +
    productos.map(p => `<option value="${p.id}">${p.brand} ${p.name} (${p.size})</option>`).join('');

  const selectCombo = document.getElementById('calcCombo');
  selectCombo.innerHTML = '<option value="">— Sin combo —</option>';

  selectProducto.addEventListener('change', () => {
    const productoId = parseInt(selectProducto.value);
    const combosDelProducto = promociones.filter(pr => pr.producto_id === productoId && pr.activa);
    selectCombo.innerHTML = '<option value="">— Sin combo —</option>' +
      combosDelProducto.map(pr => `<option value="${pr.id}">${pr.tipo_promo} — ${pr.drop_size} (${pr.descuento_pct}%)</option>`).join('');
    calcUpdate();
  });
}

window.calcUpdate = function() {
  const productoId = parseInt(document.getElementById('calcProducto').value);
  const comboId = parseInt(document.getElementById('calcCombo').value);
  const descCliente = parseFloat(document.getElementById('calcDescCliente').value) || 0;
  const descAdicional = parseFloat(document.getElementById('calcDescAdicional').value) || 0;
  const resultEl = document.getElementById('calcResult');

  if (!productoId) { resultEl.style.display = 'none'; return; }

  const producto = getProducts().find(p => p.id === productoId);
  if (!producto) return;

  const promo = comboId ? getPromociones().find(p => p.id === comboId) : null;
  const descCombo = promo ? promo.descuento_pct / 100 : 0;
  const units = promo ? promo.drop_cantidad : producto.units;

  let precio = producto.pcom;
  precio = precio * (1 - descCombo);
  precio = precio * (1 - descCliente / 100);
  precio = precio * (1 - descAdicional / 100);

  const precioFunda = precio * units;
  const ahorro = (producto.pcom * units) - precioFunda;

  document.getElementById('calcUnitario').textContent = fmt(precio);
  document.getElementById('calcFunda').textContent = `${fmt(precioFunda)} (${units} u.)`;
  document.getElementById('calcAhorro').textContent = fmt(ahorro);
  resultEl.style.display = 'block';
};

function filterByPromo() {
  const perfil = getCurrentPerfil();
  const canal = perfil?.canal;

  let filtroInicial = 'todos';
  if (canal) {
    const c = canal.toUpperCase();
    if (c.includes('MAYORISTA')) filtroInicial = 'mayoristas';
    else if (c.includes('AUTOSERVICIO')) filtroInicial = 'autoservicio';
    else if (c.includes('TRADICIONAL')) filtroInicial = 'tradicional';
    else if (c.includes('GRUPOS DE COMPRA') || c.includes('GDC')) filtroInicial = 'gdc';
  }

  renderPromos(getPromociones(), getProducts(), filtroInicial);
  document.getElementById('catFilters').style.display = 'none';
}

function volverCatalogo() {
  document.getElementById('catFilters').style.display = 'flex';
  document.querySelector('.promo-back-btn')?.remove();
  filter();
}
window.volverCatalogo = volverCatalogo;

function toggleCalc() {
  document.getElementById('calcPanel').classList.toggle('open');
}
window.toggleCalc = toggleCalc;

// ── AGE VERIFICATION ─────────────────────────────────────
function confirmAge(adult) {
  sessionStorage.setItem('mirlo_age_verified', adult ? 'adult' : 'minor');
  setIsAdult(adult);
  if (!adult) {
    document.getElementById('ageWarning').classList.add('show');
    setTimeout(() => {
      document.getElementById('ageOverlay').style.display = 'none';
      document.body.style.overflow = '';
      hideAlcohol();
      filter();
      openPromo();
    }, 2000);
  } else {
    document.getElementById('ageOverlay').style.display = 'none';
    document.body.style.overflow = '';
    filter();
    openPromo();
  }
}

// ── PROMO MODAL ──────────────────────────────────────────
function openPromo() {
  const productos = getProducts();
  const nuevos = productos.filter(p => p.es_nuevo);
  const thumbsEl = document.getElementById('pbnThumbs');
  if (thumbsEl) {
    thumbsEl.innerHTML = nuevos.slice(0, 5).map(p =>
      p.img
        ? `<img class="pbn-thumb" src="${p.img}" alt="${p.name}">`
        : `<div class="pbn-thumb-fallback">🆕</div>`
    ).join('');
  }
  document.getElementById('promoOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closePromo() {
  document.getElementById('promoOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

// ── CART TOGGLE ──────────────────────────────────────────
function toggleCart() {
  const panel = document.getElementById('cartPanel');
  panel.classList.toggle('open');
}

// ── EVENT LISTENERS ──────────────────────────────────────
function setupEventListeners() {
  // Category filter buttons
  document.querySelectorAll('.cf').forEach(btn => {
    btn.addEventListener('click', () => setCat(btn.dataset.cat, btn));
  });

  // Search input
  document.getElementById('searchInput').addEventListener('input', filter);

  // Cart list delegation (+ / - buttons)
  document.getElementById('cartList').addEventListener('click', (e) => {
    if (getUserRole() === 'guest') return;
    e.stopPropagation();
    const btn = e.target.closest('.ci-btn');
    if (!btn) return;
    const id = parseInt(btn.dataset.id);
    const units = parseInt(btn.dataset.units);
    if (btn.dataset.action === 'remove') {
      removeFromCart(id, units);
    } else if (btn.dataset.action === 'add') {
      addToCartById(id, null, units);
    }
  });

  // Funda size selector delegation
  document.getElementById('modalFundaSelector').addEventListener('click', (e) => {
    const btn = e.target.closest('.fs-btn');
    if (!btn || !btn.dataset.size) return;
    selectFundaSize(parseInt(btn.dataset.size));
  });

  // Bottle mode selector delegation
  document.getElementById('modalBottleSelector').addEventListener('click', (e) => {
    const btn = e.target.closest('.fs-btn');
    if (!btn || !btn.dataset.mode) return;
    selectBottleMode(btn.dataset.mode);
  });

  // Grid delegation
  document.getElementById('grid').addEventListener('click', (e) => {
    if (getUserRole() === 'guest') return;
    const cqsBtn = e.target.closest('.cqs-btn');
    const pqsBtn = e.target.closest('.pqs-btn');
    const card = e.target.closest('.card');
    if (!card) return;

    if (cqsBtn) {
      e.stopPropagation();
      const productId = parseInt(cqsBtn.dataset.productId);
      const product = getProducts().find(p => p.id === productId);
      if (!product) return;
      const qtyEl = card.querySelector('.cqs-qty');
      const current = parseInt(qtyEl.textContent) || 0;
      if (cqsBtn.classList.contains('cqs-plus')) {
        addToCart(product, 1);
        qtyEl.textContent = current + 1;
      } else {
        if (current <= 0) return;
        removeFromCart(productId, product.units);
        qtyEl.textContent = current - 1;
      }
      return;
    }

    if (pqsBtn) {
      e.stopPropagation();
      const productId = parseInt(pqsBtn.dataset.productId);
      const promoId = pqsBtn.dataset.promoId;
      const drop = parseInt(pqsBtn.dataset.drop);
      const qtyEl = document.getElementById(`pqs-qty-${promoId}`);
      const product = getProducts().find(p => p.id === productId);
      if (!product) return;
      const promo = getPromociones().find(p => String(p.id) === promoId);
      if (!promo) return;
      const precioFinal = Math.round(product.pcom * (1 - promo.descuento_pct / 100));
      const productWithDrop = { ...product, units: drop, pcom: precioFinal, promoCode: promo.codigo };

      if (pqsBtn.classList.contains('pqs-plus')) {
        addToCart(productWithDrop, 1);
        const current = parseInt(qtyEl.textContent) || 0;
        qtyEl.textContent = current + 1;
      } else {
        const current = parseInt(qtyEl.textContent) || 0;
        if (current <= 0) return;
        removeFromCart(productId, drop);
        qtyEl.textContent = current - 1;
      }
      return;
    }

    if (card.classList.contains('promo-card')) return;
    const productId = parseInt(card.dataset.productId);
    const product = getProducts().find(p => p.id === productId);
    if (product) openModal(product);
  });

  // Close cart panel when clicking outside
  document.addEventListener('click', (e) => {
    const panel = document.getElementById('cartPanel');
    const btn = document.getElementById('cartBtn');
    if (panel.classList.contains('open') &&
        !panel.contains(e.target) &&
        !btn.contains(e.target)) {
      panel.classList.remove('open');
    }
  });

  // Cerrar modal con Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (document.getElementById('overlay').classList.contains('open')) closeModal();
    }
  });
}

// ── INIT ─────────────────────────────────────────────────
async function init() {
  const isRecovery = window.location.hash.includes('type=recovery');

  listenForRecovery();
  document.body.style.overflow = 'hidden';
  document.getElementById('ageOverlay').style.display = 'none';
  document.getElementById('loadingState').classList.add('show');

  const ok = await loadProducts();
  document.getElementById('loadingState').classList.remove('show');

  if (!ok) {
    showLoadError();
    return;
  }

  const role = await initAuth();
  updateUIForRole(role, getCurrentPerfil());
  initCarousel();

  loadCart();
  updateClientInfoLine();
  updateCartUI();
  filter();
  initCalculadora();
  setupEventListeners();

  if (isRecovery) {
    showSetNewPassword();
  }
}

init();

// ── WINDOW EXPORTS (for inline onclick) ──────────────────
window.confirmAge = confirmAge;
window.closePromo = closePromo;
window.toggleCart = toggleCart;
window.clearCart = clearCart;
window.sendToWhatsApp = sendToWhatsApp;
window.changeQty = changeQty;
window.addFromModal = addFromModal;
window.closeModal = closeModal;
window.closeBg = closeBg;
window.openOrderHistory = openOrderHistory;
window.closeOrderHistory = closeOrderHistory;
window.closeHistoryBg = closeHistoryBg;
window.openClientModal = openClientModal;
window.showStep = showStep;
window.editClientInfo = editClientInfo;
window.confirmClientInfo = confirmClientInfo;
window.cancelClientInfo = cancelClientInfo;
window.setClientType = setClientType;
window.clientStepBack = clientStepBack;
window.clientStepNext = clientStepNext;
window.filter = filter;
window.init = init;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.handleLogout = handleLogout;
window.showAuthLogin = showAuthLogin;
window.showAuthRegister = showAuthRegister;
window.continueAsGuest = continueAsGuest;
window.openAuth = openAuth;
window.openProfile = openProfile;
window.closeProfile = closeProfile;
window.closeProfileBg = closeProfileBg;
window.saveProfile = saveProfile;
window.filterByPromo = filterByPromo;
window.showForgotPassword = showForgotPassword;
window.handleForgotPassword = handleForgotPassword;
window.handleSetNewPassword = handleSetNewPassword;
