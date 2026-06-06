import { getCART, setCART, getProducts, MIN_ORDER_AMOUNT, getUserRole } from './state.js';
import { saveCart } from './storage.js';
import { fmt, animateCartBounce } from './ui.js';

export function getPriceFunda(product) {
  if (!product.pcom) return null;
  return product.pcom * product.units;
}

export function getCartTotal() {
  const CART = getCART();
  return CART.reduce((sum, item) => {
    const pf = getPriceFunda(item.product);
    return sum + (pf ? pf * item.qty : 0);
  }, 0);
}

export function addToCart(product, qty = 1) {
  const CART = getCART();
  const existing = CART.find(item => item.id === product.id && item.product.units === product.units);
  if (existing) {
    existing.qty += qty;
  } else {
    CART.push({ id: product.id, product, qty });
  }
  setCART(CART);
  updateCartUI();
  animateCartBounce();
}

export function removeFromCart(productId, units, qty = 1) {
  const CART = getCART();
  const index = CART.findIndex(item => item.id === productId && item.product.units === units);
  if (index === -1) return;

  CART[index].qty -= qty;
  if (CART[index].qty <= 0) {
    CART.splice(index, 1);
  }
  setCART(CART);
  updateCartUI();
}

export function clearCart() {
  setCART([]);
  updateCartUI();
}

export function updateCartUI() {
  const cartBtn = document.getElementById('cartBtn');
  if (!cartBtn) return;

  if (getUserRole() === 'guest') {
    cartBtn.style.display = 'none';
    return;
  }
  cartBtn.style.display = 'flex';

  const CART = getCART();
  const cartCount = document.getElementById('cartCount');
  const cartList = document.getElementById('cartList');
  const cartTotal = document.getElementById('cartTotal');

  const totalItems = CART.reduce((sum, item) => sum + item.qty, 0);
  cartCount.textContent = totalItems;
  cartBtn.classList.toggle('has-items', totalItems > 0);

  if (cartList) {
    if (CART.length === 0) {
      cartList.innerHTML = '<div class="cart-empty">Carrito vacío</div>';
    } else {
      cartList.innerHTML = CART.map(item => {
        const p = item.product;
        const pf = getPriceFunda(p);
        const displayQty =
          p.cat === 'vino' || p.cat === 'sidra'
            ? p.units === 1
              ? `${item.qty} unidad${item.qty > 1 ? 'es' : ''}`
              : `${item.qty} caja${item.qty > 1 ? 's' : ''} (${item.qty * 6} u.)`
            : `${item.qty} × ${p.units}u`;
        return `
        <div class="cart-item">
          <div class="ci-info">
            <div class="ci-name">${item.product.brand} ${item.product.name}</div>
            <div class="ci-qty">${displayQty} · ${fmt(pf)}</div>
          </div>
          <div class="ci-actions">
            <button class="ci-btn" data-action="remove" data-id="${item.id}" data-units="${p.units}">−</button>
            <button class="ci-btn" data-action="add" data-id="${item.id}" data-units="${p.units}">+</button>
          </div>
        </div>
      `}).join('');
    }
  }

  if (cartTotal) {
    cartTotal.textContent = fmt(getCartTotal());
  }

  updateMinOrderUI();
  saveCart();
  refreshCardStates();
}

export function updateMinOrderUI() {
  const el = document.getElementById('cartMinOrder');
  if (!el) return;
  const total = getCartTotal();
  if (total >= MIN_ORDER_AMOUNT) {
    el.className = 'cart-min-order reached';
    el.textContent = '✓ Mínimo alcanzado';
  } else {
    const falta = MIN_ORDER_AMOUNT - total;
    el.className = 'cart-min-order pending';
    el.textContent = `⚠️ Mínimo ${fmt(MIN_ORDER_AMOUNT)} · Te faltan ${fmt(falta)}`;
  }
}

export function refreshCardStates() {
  const CART = getCART();
  document.querySelectorAll('#grid .card').forEach(card => {
    const id = parseInt(card.dataset.productId);
    if (isNaN(id)) return;
    const totalQty = CART
      .filter(c => c.id === id)
      .reduce((sum, c) => sum + c.qty, 0);
    const btn = card.querySelector('.c-btn');
    if (totalQty > 0) {
      card.classList.add('in-cart');
      btn.textContent = '×' + totalQty;
    } else {
      card.classList.remove('in-cart');
      btn.textContent = '+';
    }
  });
}

export function addToCartById(productId, btn, units) {
  const PRODUCTS = getProducts();
  const product = PRODUCTS.find(p => p.id === productId);
  if (!product) return;
  const productWithSize = units ? { ...product, units } : product;
  addToCart(productWithSize);
  if (btn) {
    btn.textContent = '✓';
    btn.classList.add('c-btn-check');
    setTimeout(() => {
      btn.classList.remove('c-btn-check');
      const CART = getCART();
      const totalQty = CART
        .filter(c => c.id === productId)
        .reduce((sum, c) => sum + c.qty, 0);
      btn.textContent = totalQty > 0 ? '×' + totalQty : '+';
    }, 600);
  }
}
