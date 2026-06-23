import { getCurrentUser, getPerfilByUserId, fetchUsuariosPending, fetchUsuariosActivos, aprobarUsuario, actualizarCanalUsuario } from './supabase.js';

const CANALES = [
  { value: '', label: '— Seleccionar canal —' },
  { value: 'MAYORISTAS', label: 'Mayoristas' },
  { value: 'AUTOSERVICIO Y PETROLERAS', label: 'Autoservicios y Petroleras' },
  { value: 'TRADICIONAL', label: 'Tradicional' },
  { value: 'GRUPOS DE COMPRA', label: 'Grupos de Compra' }
];

let empresaId = null;

async function initAdmin() {
  const user = await getCurrentUser();
  if (!user) { window.location.href = 'index.html'; return; }

  const perfil = await getPerfilByUserId(user.id);
  if (!perfil || perfil.rol !== 'admin') {
    document.getElementById('adminDenied').style.display = 'block';
    return;
  }

  empresaId = perfil.empresa_id;
  document.getElementById('adminPanel').style.display = 'block';
  renderTabs();
  loadPendientes();
}

function renderTabs() {
  document.getElementById('adminContent').innerHTML = `
    <div class="admin-tabs">
      <button class="admin-tab active" data-tab="pendientes">Usuarios pendientes</button>
      <button class="admin-tab" data-tab="activos">Usuarios activos</button>
    </div>
    <div id="adminTabContent"></div>
  `;
  document.querySelectorAll('.admin-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (btn.dataset.tab === 'pendientes') loadPendientes();
      else loadActivos();
    });
  });
}

async function loadPendientes() {
  const container = document.getElementById('adminTabContent');
  container.innerHTML = '<p class="admin-loading">Cargando...</p>';
  const pendientes = await fetchUsuariosPending(empresaId);

  if (!pendientes.length) {
    container.innerHTML = '<p class="admin-empty">No hay usuarios pendientes de aprobación.</p>';
    return;
  }

  container.innerHTML = `
    <div class="admin-list">
      ${pendientes.map(p => `
        <div class="admin-card" data-perfil-id="${p.id}">
          <div class="admin-card-info">
            <div class="admin-card-name">${p.email}</div>
            <div class="admin-card-meta">Registrado: ${new Date(p.created_at).toLocaleDateString('es-UY')}</div>
          </div>
          <div class="admin-approve-controls">
            <select class="admin-rol-select" id="rol-${p.id}" onchange="toggleCanal('${p.id}')">
              <option value="">— Seleccionar rol —</option>
              <option value="cliente">Cliente</option>
              <option value="vendedor">Vendedor</option>
              <option value="admin">Administrativo</option>
            </select>
            <select class="admin-canal-select" id="canal-${p.id}" style="display:none">
              <option value="">— Seleccionar canal —</option>
              <option value="MAYORISTAS">Mayoristas</option>
              <option value="AUTOSERVICIO Y PETROLERAS">Autoservicios y Petroleras</option>
              <option value="TRADICIONAL">Tradicional</option>
              <option value="GRUPOS DE COMPRA">Grupos de Compra</option>
            </select>
            <button class="admin-btn-approve" data-id="${p.id}">Aprobar</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  container.querySelectorAll('.admin-btn-approve').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const rol = document.getElementById(`rol-${id}`).value;
      const canal = document.getElementById(`canal-${id}`).value;

      if (!rol) {
        alert('Seleccioná un rol antes de aprobar');
        return;
      }
      if (rol === 'cliente' && !canal) {
        alert('Seleccioná un canal para el cliente');
        return;
      }

      btn.textContent = 'Aprobando...';
      btn.disabled = true;
      try {
        await aprobarUsuario(id, canal, rol);
        await loadPendientes();
      } catch (e) {
        alert('Error al aprobar usuario');
        btn.textContent = 'Aprobar';
        btn.disabled = false;
      }
    });
  });
}

async function loadActivos() {
  const container = document.getElementById('adminTabContent');
  container.innerHTML = '<p class="admin-loading">Cargando...</p>';
  const activos = await fetchUsuariosActivos(empresaId);

  const filtrados = activos.filter(p => p.rol !== 'admin');

  if (!filtrados.length) {
    container.innerHTML = '<p class="admin-empty">No hay usuarios activos.</p>';
    return;
  }

  container.innerHTML = `
    <div class="admin-list">
      ${filtrados.map(p => `
        <div class="admin-card" data-perfil-id="${p.id}">
          <div class="admin-card-info">
            <div class="admin-card-name">${p.nombre} ${p.apellido || ''}</div>
            <div class="admin-card-meta">${p.email} · ${p.comercios?.nombre_comercial || '—'}</div>
          </div>
          <select class="admin-canal-select" data-id="${p.id}" data-estado="${p.estado}" data-rol="${p.rol}">
            ${CANALES.map(c => `<option value="${c.value}" ${p.canal === c.value ? 'selected' : ''}>${c.label}</option>`).join('')}
          </select>
        </div>
      `).join('')}
    </div>
  `;

  container.querySelectorAll('.admin-canal-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      await actualizarCanalUsuario(sel.dataset.id, sel.value, sel.dataset.estado, sel.dataset.rol);
      sel.style.borderColor = '#16a34a';
      setTimeout(() => sel.style.borderColor = '', 800);
    });
  });
}

window.toggleCanal = function(id) {
  const rol = document.getElementById(`rol-${id}`).value;
  const canalSelect = document.getElementById(`canal-${id}`);
  canalSelect.style.display = rol === 'cliente' ? 'block' : 'none';
};

initAdmin();
