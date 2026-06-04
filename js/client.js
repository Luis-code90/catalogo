import {
  getClientName, setClientName,
  getClientBusiness, setClientBusiness,
  getClientAddress, setClientAddress,
  getPendingSend, setPendingSend,
  getSelectedVendor, setSelectedVendor,
  getIsExistingClient, setIsExistingClient,
  getVendors
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

export function openClientModal() {
  const name = getClientName();
  const business = getClientBusiness();
  const address = getClientAddress();
  const vendor = getSelectedVendor();

  if (name && business && address && vendor) {
    showSummary();
  } else {
    showStep(1);
  }
  document.getElementById('clientOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function showSummary() {
  ['clientStep1','clientStep2A','clientStep2B','clientStep3','clientSummary'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const summary = document.getElementById('clientSummary');
  summary.style.display = 'block';
  document.getElementById('summaryName').textContent = getClientName();
  document.getElementById('summaryBusiness').textContent = getClientBusiness();
  document.getElementById('summaryAddress').textContent = getClientAddress();
  document.getElementById('summaryVendor').textContent = getSelectedVendor()?.name || '—';
}

export function editClientInfo() {
  setPendingSend(false);
  openClientModal();
}

export function setClientType(isExisting) {
  setIsExistingClient(isExisting);
  if (isExisting) {
    document.getElementById('clientNameInput').value = getClientName();
    document.getElementById('clientBusinessInput').value = getClientBusiness();
    document.getElementById('clientAddressInput').value = getClientAddress();
    showStep('2A');
    document.getElementById('clientNameInput').focus();
  } else {
    showStep('2B');
    document.getElementById('clientNewName').focus();
  }
}

export function clientStepBack(step) {
  if (step === 2) {
    const isExisting = getIsExistingClient();
    showStep(isExisting ? '2A' : '2B');
    return;
  }
  showStep(step);
}

export function clientStepNext() {
  const isExisting = getIsExistingClient();
  if (isExisting) {
    const name     = document.getElementById('clientNameInput').value.trim();
    const business = document.getElementById('clientBusinessInput').value.trim();
    const address  = document.getElementById('clientAddressInput').value.trim();
    if (!name || !business || !address) {
      document.getElementById('clientError').classList.add('show');
      return;
    }
    document.getElementById('clientError').classList.remove('show');
    setClientName(name);
    setClientBusiness(business);
    setClientAddress(address);
  } else {
    const name     = document.getElementById('clientNewName').value.trim();
    const business = document.getElementById('clientNewBusiness').value.trim();
    const doc      = document.getElementById('clientNewDoc').value.trim();
    const address  = document.getElementById('clientNewAddress').value.trim();
    const phone    = document.getElementById('clientNewPhone').value.trim();
    const hours    = document.getElementById('clientNewHours').value.trim();
    if (!name || !business || !doc || !address || !phone || !hours) {
      document.getElementById('clientErrorNew').classList.add('show');
      return;
    }
    document.getElementById('clientErrorNew').classList.remove('show');
    setClientName(name);
    setClientBusiness(business);
    setClientAddress(address);
  }
  renderVendorList();
  showStep(3);
}

export function confirmClientInfo() {
  const select = document.getElementById('vendorSelect');
  const vendor = getSelectedVendor();
  if (!vendor || !select.value) {
    document.getElementById('clientErrorVendor').classList.add('show');
    return;
  }
  document.getElementById('clientErrorVendor').classList.remove('show');
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

export function showStep(step) {
  ['clientStep1','clientStep2A','clientStep2B','clientStep3','clientSummary'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const target = document.getElementById('clientStep' + step);
  if (target) target.style.display = 'block';
}

function renderVendorList() {
  const select = document.getElementById('vendorSelect');
  const vendors = getVendors();
  const current = getSelectedVendor();
  select.innerHTML = `<option value="">— Seleccioná tu vendedor —</option>` +
    vendors.map(v => `<option value="${v.phone}" ${current?.name === v.name ? 'selected' : ''}>${v.name}</option>`).join('');

  const newSelect = select.cloneNode(true);
  select.parentNode.replaceChild(newSelect, select);
  newSelect.addEventListener('change', () => {
    const vendor = vendors.find(v => v.phone === newSelect.value);
    if (vendor) setSelectedVendor({ name: vendor.name, phone: vendor.phone });
  });
}