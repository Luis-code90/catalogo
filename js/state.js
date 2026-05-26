// ── STATE ────────────────────────────────────────────────
let PRODUCTS = [];
let CART = [];
let activeCat = 'todos';
let activeBrand = 'todas';
let isAdult = false;
let clientName = localStorage.getItem('mirlo_client_name') || '';
let clientBusiness = localStorage.getItem('mirlo_client_business') || '';
let clientAddress = localStorage.getItem('mirlo_client_address') || '';
let pendingSendAfterConfirm = false;

// Modal state
let modalProduct = null;
let modalQty = 1;
let modalFundaSize = 6;
let modalBottleMode = 'unit';

// ── CONSTANTS ────────────────────────────────────────────
export const CART_STORAGE_KEY = 'mirlo_cart';
export const WHATSAPP_PHONE = '59897821688';
export const MIN_ORDER_AMOUNT = 1000;
export const ADULT_CATS = ['cerveza', 'vino', 'sidra'];

// ── GETTERS ──────────────────────────────────────────────
export function getProducts() { return PRODUCTS; }
export function getCART() { return CART; }
export function getActiveCat() { return activeCat; }
export function getActiveBrand() { return activeBrand; }
export function isAdultUser() { return isAdult; }
export function getClientName() { return clientName; }
export function getClientBusiness() { return clientBusiness; }
export function getClientAddress() { return clientAddress; }
export function getPendingSend() { return pendingSendAfterConfirm; }
export function getModalProduct() { return modalProduct; }
export function getModalQty() { return modalQty; }
export function getModalFundaSize() { return modalFundaSize; }
export function getModalBottleMode() { return modalBottleMode; }

// ── SETTERS ──────────────────────────────────────────────
export function setProducts(v) { PRODUCTS = v; }
export function setCART(v) { CART = v; }
export function setActiveCat(v) { activeCat = v; }
export function setActiveBrand(v) { activeBrand = v; }
export function setIsAdult(v) { isAdult = v; }
export function setClientName(v) { clientName = v; localStorage.setItem('mirlo_client_name', v); }
export function setClientBusiness(v) { clientBusiness = v; localStorage.setItem('mirlo_client_business', v); }
export function setClientAddress(v) { clientAddress = v; localStorage.setItem('mirlo_client_address', v); }
export function setPendingSend(v) { pendingSendAfterConfirm = v; }
export function setModalProduct(v) { modalProduct = v; }
export function setModalQty(v) { modalQty = v; }
export function setModalFundaSize(v) { modalFundaSize = v; }
export function setModalBottleMode(v) { modalBottleMode = v; }
