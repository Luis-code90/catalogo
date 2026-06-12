import {
  getCART, getClientName, getClientBusiness, getClientAddress,
  getPendingSend, setPendingSend, getWhatsappPhone, getSelectedVendor, getIsExistingClient,
  getCurrentPerfil, setClientName, setClientBusiness, setClientAddress,
  getVendors, setSelectedVendor
} from './state.js';
import { getPriceFunda, clearCart } from './cart.js';
import { fmt } from './ui.js';
import { saveOrder } from './storage.js';
import { showStep } from './client.js';

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
        : `${item.qty} caja${item.qty > 1 ? 's' : ''} (${totalUnits} unidades)`
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

  return `${greeting}\n${addressLine}\n\n🛒 PEDIDO:\n${items}\n\n📦 Total paquetes: ${totalFundas}\n💰 Total estimado: ${totalDisplay}`;
}

export function doSendToWhatsApp() {
  saveOrder();
  const vendor = getSelectedVendor();
  const phone = vendor ? vendor.phone : getWhatsappPhone();
  const isExisting = getIsExistingClient();
  const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

  let message = '';

  if (!isExisting) {
    const name     = document.getElementById('clientNewName').value.trim();
    const business = document.getElementById('clientNewBusiness').value.trim();
    const doc      = document.getElementById('clientNewDoc').value.trim();
    const address  = document.getElementById('clientNewAddress').value.trim();
    const phone_c  = document.getElementById('clientNewPhone').value.trim();
    const hours    = document.getElementById('clientNewHours').value.trim();

    const altaMsg = `🆕 ALTA CLIENTE:\n👤 Nombre: ${name}\n🏪 Razón social: ${business}\n🪪 Cédula/RUT: ${doc}\n📍 Dirección: ${address}\n📞 Teléfono: ${phone_c}\n🕐 Horario: ${hours}`;
    message = `${altaMsg}\n\n${getCartMessage()}`;
  } else {
    message = getCartMessage();
  }

  const url = isMobile
    ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    : `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;

  clearCart();
  window.open(url, '_blank');
}

export function sendToWhatsApp() {
  const CART = getCART();
  if (CART.length === 0) return;

  const perfil = getCurrentPerfil();
  const comercio = perfil?.comercios;
  const vendedorAsignado = perfil?.vendedores_asignados?.[0];
  const vendedorDelPerfil = vendedorAsignado
    ? getVendors().find(v => v.id === vendedorAsignado.vendedor_id)
    : null;
  const vendedorOk = getSelectedVendor() || vendedorDelPerfil;

  if (comercio?.direccion && comercio?.nombre_comercial && vendedorOk) {
    setClientName(perfil.nombre);
    setClientBusiness(comercio.nombre_comercial);
    setClientAddress(comercio.direccion);
    if (!getSelectedVendor() && vendedorDelPerfil) {
      setSelectedVendor(vendedorDelPerfil);
    }
    doSendToWhatsApp();
    return;
  }

  if (perfil?.nombre) setClientName(perfil.nombre);
  if (comercio?.nombre_comercial) setClientBusiness(comercio.nombre_comercial);
  if (comercio?.direccion) setClientAddress(comercio.direccion);

  setPendingSend(true);
  showStep(1);
  document.getElementById('clientOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}
