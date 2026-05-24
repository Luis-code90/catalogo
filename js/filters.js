import { getProducts, getActiveCat, setActiveCat, getActiveBrand, setActiveBrand, isAdultUser, ADULT_CATS } from './state.js';
import { render } from './ui.js';

export function hideAlcohol() {
  document.querySelectorAll('.fb').forEach(btn => {
    const cat = btn.dataset.cat;
    if (ADULT_CATS.includes(cat)) btn.style.display = 'none';
  });
  const activeCat = getActiveCat();
  if (ADULT_CATS.includes(activeCat)) {
    setActiveCat('todos');
    document.querySelector('.fb.active')?.classList.remove('active');
    document.querySelector('.fb')?.classList.add('active');
  }
}

export function filter() {
  const PRODUCTS = getProducts();
  if (PRODUCTS.length === 0) return;
  const activeCat = getActiveCat();
  const isAdult = isAdultUser();
  const q = document.getElementById('searchInput').value.toLowerCase();
  render(PRODUCTS.filter(p => {
    const mc  = activeCat === 'todos' || p.cat === activeCat;
    const mb  = getActiveBrand() === 'todas' || p.brand === getActiveBrand();
    const mq  = !q || p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q);
    const age = isAdult || !ADULT_CATS.includes(p.cat);
    return mc && mb && mq && age;
  }));
  renderBrandFilters();
}

export function setCat(cat, btn) {
  setActiveCat(cat);
  setActiveBrand('todas');
  document.querySelectorAll('.fb').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  filter();
  renderBrandFilters();
  const grid = document.getElementById('grid');
  if (grid && grid.getBoundingClientRect().top < 0) {
    grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

export function renderBrandFilters() {
  const container = document.getElementById('brandFilters');
  if (!container) return;

  const activeCat = getActiveCat();

  if (activeCat === 'todos') {
    container.classList.remove('visible');
    container.innerHTML = '';
    return;
  }

  const PRODUCTS = getProducts();
  const isAdult = isAdultUser();

  const brands = [...new Set(
    PRODUCTS
      .filter(p => p.cat === activeCat && (isAdult || !ADULT_CATS.includes(p.cat)))
      .map(p => p.brand)
  )];

  if (brands.length <= 1) {
    container.classList.remove('visible');
    container.innerHTML = '';
    return;
  }

  container.classList.add('visible');
  container.innerHTML = `<span class="bf active" data-brand="todas">Todas</span>` +
    brands.map(b => `<span class="bf" data-brand="${b}">${b}</span>`).join('');
  container.querySelectorAll('.bf').forEach(el => {
    el.addEventListener('click', () => setBrand(el.dataset.brand, el));
  });
}

export function setBrand(brand, el) {
  setActiveBrand(brand);
  document.querySelectorAll('.bf').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  filter();
}
