import { setProducts, getProducts, setIsAdult } from './state.js';
import { updateCartUI } from './cart.js';
import { loadCart } from './storage.js';
import { openModal, closeModal, closeBg, changeQty, addFromModal, selectFundaSize, selectBottleMode } from './modal.js';
import { filter, setCat, hideAlcohol } from './filters.js';
import { sendToWhatsApp } from './whatsapp.js';
import { updateClientInfoLine, editClientInfo, confirmClientInfo, cancelClientInfo, setClientType, clientStepBack, clientStepNext } from './client.js';
import { openOrderHistory, closeOrderHistory, closeHistoryBg } from './history.js';
import { clearCart, addToCartById, removeFromCart } from './cart.js';

// ── PRODUCT LOADING ──────────────────────────────────────
async function loadProducts() {
    try {
        const response = await fetch('./data/products.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        setProducts(data);
        return true;
    } catch (error) {
        console.error('Error loading products:', error);
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

// ── AGE VERIFICATION ─────────────────────────────────────
function confirmAge(adult) {
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
  document.querySelectorAll('.fb').forEach(btn => {
    btn.addEventListener('click', () => setCat(btn.dataset.cat, btn));
  });

  // Search input
  document.getElementById('searchInput').addEventListener('input', filter);

  // Cart list delegation (+ / - buttons)
  document.getElementById('cartList').addEventListener('click', (e) => {
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

  // Grid delegation: card click -> modal / c-btn click -> addToCartById
  document.getElementById('grid').addEventListener('click', (e) => {
    const cBtn = e.target.closest('.c-btn');
    const card = e.target.closest('.card');
    if (!card) return;

    if (cBtn) {
      e.stopPropagation();
      const productId = parseInt(card.dataset.productId);
      addToCartById(productId, cBtn);
    } else {
      const productId = parseInt(card.dataset.productId);
      const product = getProducts().find(p => p.id === productId);
      if (product) openModal(product);
    }
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
}

// ── INIT ─────────────────────────────────────────────────
async function init() {
    document.body.style.overflow = 'hidden';
    const ok = await loadProducts();
    if (!ok) {
      showLoadError();
      return;
    }
    loadCart();
    updateClientInfoLine();
    updateCartUI();
    filter();
    setupEventListeners();
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
window.editClientInfo = editClientInfo;
window.confirmClientInfo = confirmClientInfo;
window.cancelClientInfo = cancelClientInfo;
window.setClientType = setClientType;
window.clientStepBack = clientStepBack;
window.clientStepNext = clientStepNext;
window.filter = filter;
window.init = init;
