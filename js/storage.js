import { getCART, setCART, getProducts, CART_STORAGE_KEY } from './state.js';

export function saveCart() {
  const CART = getCART();
  const compact = CART.map(item => ({ id: item.id, qty: item.qty, units: item.product.units }));
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(compact));
}

export function loadCart() {
  const raw = localStorage.getItem(CART_STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    const PRODUCTS = getProducts();
    const restored = parsed
      .map(item => {
        const product = PRODUCTS.find(p => p.id === item.id);
        return product ? { id: product.id, product: { ...product, units: item.units || product.units }, qty: item.qty } : null;
      })
      .filter(Boolean);
    setCART(restored);
  } catch (e) {
    console.warn('Error al cargar carrito:', e);
  }
}

export function saveOrder() {
  const CART = getCART();
  if (CART.length === 0) return;
  const total = CART.reduce((sum, item) => {
    const p = item.product;
    const pf = p.pcom ? p.pcom * p.units : null;
    return sum + (pf ? pf * item.qty : 0);
  }, 0);
  const entry = {
    date: new Date().toISOString(),
    items: CART.map(item => ({ id: item.id, name: item.product.brand + ' ' + item.product.name, qty: item.qty, units: item.product.units, cat: item.product.cat })),
    total
  };
  const history = JSON.parse(localStorage.getItem('mirlo_order_history') || '[]');
  history.unshift(entry);
  if (history.length > 5) history.length = 5;
  localStorage.setItem('mirlo_order_history', JSON.stringify(history));
}
