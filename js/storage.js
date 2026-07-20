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

