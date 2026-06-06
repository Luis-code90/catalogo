import {
  getCART, getModalProduct, getModalQty, getModalFundaSize, getModalBottleMode,
  setModalProduct, setModalQty, setModalFundaSize, setModalBottleMode
} from './state.js';
import { CAT } from './data.js';
import { fmt } from './ui.js';
import { getPriceFunda } from './cart.js';
import { addToCart } from './cart.js';

export function openModal(p) {
  setModalProduct(p);
  setModalQty(1);

  const ph = document.getElementById('mPhoto');

  ph.querySelectorAll('img, .fallback').forEach(el => el.remove());

  if (p.img) {
    const im = document.createElement('img');
    im.src = p.img; im.alt = p.name;
    ph.insertBefore(im, ph.firstChild);
  }

  document.getElementById('mCat').textContent  = CAT[p.cat];
  document.getElementById('mName').textContent = p.brand + ' — ' + p.name;
  document.getElementById('mBar').textContent  = 'Cód. barra: ' + p.barcode;
  document.getElementById('mSize').textContent  = p.size;
  if (p.cat === 'cerveza') {
    document.getElementById('mUnits').textContent = '6 / 24 unidades';
  } else if (p.cat === 'vino' || p.cat === 'sidra') {
    document.getElementById('mUnits').textContent = '1 u. o caja de 6';
  } else {
    document.getElementById('mUnits').textContent = p.units + ' unidades';
  }
  document.getElementById('mPCom').textContent  = fmt(p.pcom);
  document.getElementById('mPPub').textContent  = fmt(p.ppub);

  if (p.cat === 'cerveza') {
    document.getElementById('modalFundaSelector').style.display = 'block';
    document.getElementById('modalBottleSelector').style.display = 'none';
    setModalFundaSize(6);
    document.querySelectorAll('#modalFundaSelector .fs-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('#modalFundaSelector .fs-btn[data-size="6"]').classList.add('active');
    document.getElementById('mUnitsDisplay').textContent = 6;
    document.getElementById('mPFunda').textContent = fmt(p.pcom * 6);
  } else if (p.cat === 'vino' || p.cat === 'sidra') {
    document.getElementById('modalFundaSelector').style.display = 'none';
    document.getElementById('modalBottleSelector').style.display = 'block';
    setModalBottleMode('unit');
    document.getElementById('pfbLabel').textContent = 'PRECIO UNITARIO';
    document.querySelectorAll('#modalBottleSelector .fs-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('#modalBottleSelector .fs-btn[data-mode="unit"]').classList.add('active');
    document.getElementById('mUnitsDisplay').textContent = '1';
    document.getElementById('mPFunda').textContent = fmt(p.pcom);
  } else {
    document.getElementById('modalFundaSelector').style.display = 'none';
    document.getElementById('modalBottleSelector').style.display = 'none';
    setModalFundaSize(p.units);
    document.getElementById('mUnitsDisplay').textContent = p.units;
    document.getElementById('mPFunda').textContent = fmt(p.pcom * p.units);
  }

  document.getElementById('modalQty').textContent = 1;

  updateModalAddBtn();

  document.getElementById('overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

export function closeModal() {
  document.getElementById('overlay').classList.remove('open');
  document.body.style.overflow = '';
}

export function closeBg(e) {
  if (e.target === document.getElementById('overlay')) closeModal();
}

export function changeQty(delta) {
  const currentQty = parseInt(document.getElementById('modalQty').textContent);
  const newQty = Math.max(1, currentQty + delta);
  setModalQty(newQty);
  document.getElementById('modalQty').textContent = newQty;
  updateModalAddBtn();
}

export function addFromModal() {
  const p = getModalProduct();
  if (!p) return;
  const cat = p.cat;
  let units;
  if (cat === 'cerveza') {
    units = getModalFundaSize();
  } else if (cat === 'vino' || cat === 'sidra') {
    units = getModalBottleMode() === 'unit' ? 1 : 6;
  } else {
    units = p.units;
  }
  const productWithSize = { ...p, units };
  const qty = getModalQty();
  addToCart(productWithSize, qty);
  closeModal();
}

export function selectFundaSize(size) {
  setModalFundaSize(size);
  document.querySelectorAll('#modalFundaSelector .fs-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`#modalFundaSelector .fs-btn[data-size="${size}"]`).classList.add('active');
  document.getElementById('mUnitsDisplay').textContent = size;
  const p = getModalProduct();
  document.getElementById('mPFunda').textContent = fmt(p.pcom * size);
  updateModalAddBtn();
}

export function selectBottleMode(mode) {
  setModalBottleMode(mode);
  document.querySelectorAll('#modalBottleSelector .fs-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`#modalBottleSelector .fs-btn[data-mode="${mode}"]`).classList.add('active');
  const p = getModalProduct();
  if (mode === 'unit') {
    document.getElementById('pfbLabel').textContent = 'PRECIO UNITARIO';
    document.getElementById('mUnitsDisplay').textContent = '1';
    document.getElementById('mPFunda').textContent = fmt(p.pcom);
  } else {
    document.getElementById('pfbLabel').textContent = 'PRECIO POR CAJA';
    document.getElementById('mUnitsDisplay').textContent = '6';
    document.getElementById('mPFunda').textContent = fmt(p.pcom * 6);
  }
  updateModalAddBtn();
}

export function getModalUnits() {
  const p = getModalProduct();
  if (!p) return null;
  const cat = p.cat;
  if (cat === 'cerveza') return getModalFundaSize();
  if (cat === 'vino' || cat === 'sidra') return getModalBottleMode() === 'unit' ? 1 : 6;
  return p.units;
}

export function updateModalAddBtn() {
  const p = getModalProduct();
  if (!p) return;
  const currentUnits = getModalUnits();
  const CART = getCART();
  const existing = CART.find(item => item.id === p.id && item.product.units === currentUnits);
  document.getElementById('modalAddBtn').textContent = existing ? `Agregar (+${getModalQty()})` : 'Agregar al pedido';
}
