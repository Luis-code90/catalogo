import {
  getCART, getClientName, getClientBusiness, getClientAddress,
  getPendingSend, setPendingSend, WHATSAPP_PHONE, getSelectedVendor, getIsExistingClient
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

export function getNewClientMessage() {
  const name     = document.getElementById('clientNewName').value.trim();
  const business = document.getElementById('clientNewBusiness').value.trim();
  const doc      = document.getElementById('clientNewDoc').value.trim();
  const address  = document.getElementById('clientNewAddress').value.trim();
  const phone    = document.getElementById('clientNewPhone').value.trim();
  const hours    = document.getElementById('clientNewHours').value.trim();

  return `🆕 ALTA CLIENTE:\n👤 Nombre: ${name}\n🏪 Razón social: ${business}\n🪪 Cédula/RUT: ${doc}\n📍 Dirección: ${address}\n📞 Teléfono: ${phone}\n🕐 Horario: ${hours}`;
}

export function doSendToWhatsApp() {
  saveOrder();
  const vendor = getSelectedVendor();
  const phone = vendor ? vendor.phone : WHATSAPP_PHONE;
  const isExisting = getIsExistingClient();
  const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

  if (!isExisting) {
    const altaMsg = getNewClientMessage();
    const altaUrl = isMobile
      ? `https://wa.me/${phone}?text=${encodeURIComponent(altaMsg)}`
      : `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(altaMsg)}`;
    window.open(altaUrl, '_blank');
    setTimeout(() => {
      const pedidoMsg = getCartMessage();
      const pedidoUrl = isMobile
        ? `https://wa.me/${phone}?text=${encodeURIComponent(pedidoMsg)}`
        : `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(pedidoMsg)}`;
      window.open(pedidoUrl, '_blank');
    }, 1500);
  } else {
    const message = getCartMessage();
    const url = isMobile
      ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
      : `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  }
}

export function sendToWhatsApp() {
  const CART = getCART();
  if (CART.length === 0) return;

  const clientName = getClientName();
  const clientBusiness = getClientBusiness();

  if (!clientName || !clientBusiness) {
    setPendingSend(true);
    ['clientStep1','clientStep2A','clientStep2B','clientStep3'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    const step1 = document.getElementById('clientStep1');
    if (step1) step1.style.display = 'block';
    document.getElementById('clientOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
    return;
  }

  doSendToWhatsApp();
}
