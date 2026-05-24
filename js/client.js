import {
  getClientName, setClientName,
  getClientBusiness, setClientBusiness,
  getClientAddress, setClientAddress,
  getPendingSend, setPendingSend
} from './state.js';
import { doSendToWhatsApp } from './whatsapp.js';

export function updateClientInfoLine() {
  const el = document.getElementById('cartClientInfo');
  const clientName = getClientName();
  const clientBusiness = getClientBusiness();
  if (clientName && clientBusiness) {
    el.style.display = 'flex';
    document.getElementById('cartClientName').textContent = clientName;
    document.getElementById('cartClientBusiness').textContent = clientBusiness;
  } else {
    el.style.display = 'none';
  }
}

export function editClientInfo() {
  setPendingSend(false);
  document.getElementById('clientNameInput').value = getClientName();
  document.getElementById('clientBusinessInput').value = getClientBusiness();
  document.getElementById('clientAddressInput').value = getClientAddress();
  document.getElementById('clientError').classList.remove('show');
  document.getElementById('clientOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('clientNameInput').focus();
}

export function confirmClientInfo() {
  const name     = document.getElementById('clientNameInput').value.trim();
  const business = document.getElementById('clientBusinessInput').value.trim();
  const address  = document.getElementById('clientAddressInput').value.trim();

  if (!name || !business || !address) {
    document.getElementById('clientError').classList.add('show');
    return;
  }

  setClientName(name);
  setClientBusiness(business);
  setClientAddress(address);

  document.getElementById('clientOverlay').classList.remove('open');
  document.body.style.overflow = '';
  updateClientInfoLine();
  if (getPendingSend()) {
    setPendingSend(false);
    doSendToWhatsApp();
  }
}

export function cancelClientInfo() {
  document.getElementById('clientOverlay').classList.remove('open');
  document.body.style.overflow = '';
}
