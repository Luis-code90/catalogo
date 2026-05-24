import {
  getCART, getClientName, getClientBusiness, getClientAddress,
  getPendingSend, setPendingSend, WHATSAPP_PHONE
} from './state.js';
import { getPriceFunda } from './cart.js';
import { fmt } from './ui.js';
import { saveOrder } from './storage.js';

export function getCartMessage() {
  const CART = getCART();
  if (CART.length === 0) return '';

  const clientName = getClientName();
  const clientBusiness = getClientBusiness();
  const clientAddress = getClientAddress();

  const greeting = `Hola, soy ${clientName} de ${clientBusiness}:`;
  const addressLine = `Dirección: ${clientAddress}`;

  const items = CART.map(item => {
    const p = item.product;
    const totalUnits = p.units * item.qty;
    const qtyDisplay = p.cat === 'vino' || p.cat === 'sidra'
      ? p.units === 1
        ? `${item.qty} unidad${item.qty > 1 ? 'es' : ''}`
        : `${item.qty} caja${item.qty > 1 ? 's' : ''} (${item.qty * 6} unidades)`
      : p.cat === 'cerveza'
        ? `${item.qty} funda${item.qty > 1 ? 's' : ''} de ${p.units} (${totalUnits} unidades)`
        : `${item.qty} fundas (${totalUnits} unidades)`;
    return `- ${p.brand} ${p.name} — ${qtyDisplay}`;
  }).join('\n');

  const totalFundas = CART.reduce((sum, item) => sum + item.qty, 0);
  const total = CART.reduce((sum, item) => {
    const pf = getPriceFunda(item.product);
    return sum + (pf ? pf * item.qty : 0);
  }, 0);
  const totalDisplay = total > 0 ? fmt(total) : 'Consultar precio';

  return `${greeting}\n${addressLine}\n\n🛒 PEDIDO:\n${items}\n\n📦 Total fundas: ${totalFundas}\n💰 Total estimado: ${totalDisplay}`;
}

export function doSendToWhatsApp() {
  saveOrder();
  const message = getCartMessage();
  const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

  const url = isMobile
    ? `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(message)}`
    : `https://web.whatsapp.com/send?phone=${WHATSAPP_PHONE}&text=${encodeURIComponent(message)}`;

  window.open(url, '_blank');
}

export function sendToWhatsApp() {
  const CART = getCART();
  const clientName = getClientName();
  const clientBusiness = getClientBusiness();
  const clientAddress = getClientAddress();

  if (CART.length === 0) return;

  if (!clientName || !clientBusiness || !clientAddress) {
    setPendingSend(true);
    document.getElementById('clientNameInput').value = clientName;
    document.getElementById('clientBusinessInput').value = clientBusiness;
    document.getElementById('clientAddressInput').value = clientAddress;
    document.getElementById('clientError').classList.remove('show');
    document.getElementById('clientOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
    if (!clientName) {
      document.getElementById('clientNameInput').focus();
    } else if (!clientBusiness) {
      document.getElementById('clientBusinessInput').focus();
    } else {
      document.getElementById('clientAddressInput').focus();
    }
    return;
  }

  doSendToWhatsApp();
}
