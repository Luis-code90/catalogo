import { getCurrentUser, getPerfilByUserId, fetchUsuariosPending, fetchUsuariosActivos, aprobarUsuario, actualizarCanalUsuario, fetchPromocionesAdmin, togglePromocion, upsertPromocion, fetchProductosAdmin, deletePromocion, updatePrecioProducto } from './supabase.js';

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
      <button class="admin-tab" data-tab="promos">Promociones</button>
      <button class="admin-tab" data-tab="precios">Precios</button>
    </div>
    <div id="adminTabContent"></div>
  `;
  document.querySelectorAll('.admin-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (btn.dataset.tab === 'pendientes') loadPendientes();
      else if (btn.dataset.tab === 'activos') loadActivos();
      else if (btn.dataset.tab === 'promos') loadPromos();
      else if (btn.dataset.tab === 'precios') loadPrecios();
    });
  });
}

async function loadPendientes() {
  const container = document.getElementById('adminTabContent');
  container.innerHTML = '<p class="admin-loading">Cargando...</p>';
  try {
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

        const errorMsg = btn.closest('.admin-card').querySelector('.admin-inline-error')
          || (() => { const el = document.createElement('p'); el.className = 'admin-inline-error'; btn.before(el); return el; })();
        if (!rol) {
          errorMsg.textContent = 'Seleccioná un rol antes de aprobar';
          return;
        }
        if (rol === 'cliente' && !canal) {
          errorMsg.textContent = 'Seleccioná un canal para el cliente';
          return;
        }
        errorMsg.textContent = '';

        btn.textContent = 'Aprobando...';
        btn.disabled = true;
        try {
          await aprobarUsuario(id, canal, rol);
          await loadPendientes();
        } catch (e) {
          errorMsg.textContent = 'Error al aprobar. Intentá de nuevo.';
          btn.textContent = 'Aprobar';
          btn.disabled = false;
        }
      });
    });
  } catch (e) {
    container.innerHTML = '<p class="admin-empty">Error al cargar datos. Intentá de nuevo.</p>';
    console.error(e);
  }
}

async function loadActivos() {
  const container = document.getElementById('adminTabContent');
  container.innerHTML = '<p class="admin-loading">Cargando...</p>';
  try {
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
  } catch (e) {
    container.innerHTML = '<p class="admin-empty">Error al cargar datos. Intentá de nuevo.</p>';
    console.error(e);
  }
}

async function loadPromos() {
  const container = document.getElementById('adminTabContent');
  container.innerHTML = '<p class="admin-loading">Cargando...</p>';
  try {
    const promos = await fetchPromocionesAdmin(empresaId);

    container.innerHTML = `
      <div class="admin-promo-header">
        <h3>Promociones (${promos.length})</h3>
        <button class="admin-btn-new" onclick="window.showPromoForm()">+ Nueva promo</button>
      </div>
      <div id="promoFormContainer"></div>
      <div class="admin-list">
        ${promos.map(pr => `
          <div class="admin-card ${pr.activa ? '' : 'admin-card-inactive'}">
            <div class="admin-card-img">
              ${pr.productos?.img ? `<img src="${pr.productos.img}" alt="">` : '📦'}
            </div>
            <div class="admin-card-info">
              <div class="admin-card-name">${pr.productos?.brand || ''} ${pr.productos?.name || pr.nombre}</div>
              <div class="admin-card-meta">
                ${pr.tipo_promo} · ${pr.drop_size} · ${pr.canal}
              </div>
              <div class="admin-card-meta">
                ${pr.fecha_inicio} → ${pr.fecha_fin}
              </div>
            </div>
            <div class="admin-card-actions">
              <span class="admin-badge ${pr.activa ? 'admin-badge-active' : 'admin-badge-inactive'}">
                ${pr.activa ? 'Activa' : 'Inactiva'}
              </span>
              <button class="admin-btn-toggle ${pr.activa ? 'admin-btn-off' : 'admin-btn-on'}"
                data-id="${pr.id}" data-activa="${pr.activa}">
                ${pr.activa ? 'Desactivar' : 'Activar'}
              </button>
              <button class="admin-btn-edit" data-id="${pr.id}">Editar</button>
              <button class="admin-btn-delete" data-id="${pr.id}">Eliminar</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    container.querySelectorAll('.admin-btn-toggle').forEach(btn => {
      btn.addEventListener('click', async () => {
        const activa = btn.dataset.activa === 'true';
        btn.disabled = true;
        await togglePromocion(parseInt(btn.dataset.id), !activa);
        loadPromos();
      });
    });

    container.querySelectorAll('.admin-btn-edit').forEach(btn => {
      btn.addEventListener('click', async () => {
        const promo = promos.find(p => p.id === parseInt(btn.dataset.id));
        showPromoForm(promo);
      });
    });

    container.querySelectorAll('.admin-btn-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Seguro que querés eliminar esta promo? Esta acción no se puede deshacer.')) return;
        btn.disabled = true;
        await deletePromocion(parseInt(btn.dataset.id));
        loadPromos();
      });
    });
  } catch (e) {
    container.innerHTML = '<p class="admin-empty">Error al cargar datos. Intentá de nuevo.</p>';
    console.error(e);
  }
}

async function showPromoForm(promo = null) {
  const productos = await fetchProductosAdmin(empresaId);
  const isEdit = !!promo;

  const formHtml = `
    <div class="admin-promo-form">
      <h4>${isEdit ? 'Editar promo' : 'Nueva promo'}</h4>
      <div class="admin-form-grid">
        <div class="admin-form-group">
          <label>Producto</label>
          <select id="pf-producto">
            <option value="">— Seleccioná —</option>
            ${productos.map(p => `<option value="${p.id}" ${promo?.producto_id === p.id ? 'selected' : ''}>${p.brand} ${p.name}</option>`).join('')}
          </select>
        </div>
        <div class="admin-form-group">
          <label>Código combo</label>
          <input id="pf-codigo" type="text" value="${promo?.codigo || ''}">
        </div>
        <div class="admin-form-group">
          <label>Tipo promo (badge)</label>
          <input id="pf-tipo" type="text" placeholder="ej: 9.63% OFF, 6x5, 5+1" value="${promo?.tipo_promo || ''}">
        </div>
        <div class="admin-form-group">
          <label>Descuento %</label>
          <input id="pf-descuento" type="number" step="0.01" value="${promo?.descuento_pct || ''}">
        </div>
        <div class="admin-form-group">
          <label>Drop size (texto)</label>
          <input id="pf-dropsize" type="text" placeholder="ej: 2 SIX PACK" value="${promo?.drop_size || ''}">
        </div>
        <div class="admin-form-group">
          <label>Drop cantidad (unidades)</label>
          <input id="pf-dropcantidad" type="number" value="${promo?.drop_cantidad || ''}">
        </div>
        <div class="admin-form-group admin-form-group-full">
          <label>Canal</label>
          <div class="admin-canal-checks">
            ${CANALES.filter(c => c.value).map(c => `
              <label class="admin-check-label">
                <input type="checkbox" class="pf-canal-check" value="${c.value}"
                  ${promo?.canal?.includes(c.value) ? 'checked' : ''}>
                ${c.label}
              </label>
            `).join('')}
          </div>
        </div>
        <div class="admin-form-group">
          <label>Fecha inicio</label>
          <input id="pf-inicio" type="date" value="${promo?.fecha_inicio || ''}">
        </div>
        <div class="admin-form-group">
          <label>Fecha fin</label>
          <input id="pf-fin" type="date" value="${promo?.fecha_fin || ''}">
        </div>
        <div class="admin-form-group admin-form-group-full">
          <label class="admin-check-label">
            <input type="checkbox" id="pf-activa" ${promo ? (promo.activa ? 'checked' : '') : 'checked'}>
            Promo activa
          </label>
        </div>
      </div>
      <div class="admin-form-actions">
        <button class="admin-btn-cancel" onclick="loadPromos()">Cancelar</button>
        <button class="admin-btn-save" onclick="window.savePromo(${promo?.id || 'null'})">
          ${isEdit ? 'Guardar cambios' : 'Crear promo'}
        </button>
      </div>
    </div>
  `;

  document.getElementById('promoFormContainer').innerHTML = formHtml;
  document.getElementById('promoFormContainer').scrollIntoView({ behavior: 'smooth' });
}

window.showPromoForm = () => showPromoForm();
window.loadPromos = loadPromos;

window.savePromo = async function(id) {
  const saveBtn = document.querySelector('.admin-btn-save');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Guardando...'; }

  const productoId = parseInt(document.getElementById('pf-producto').value);
  const codigo = document.getElementById('pf-codigo').value.trim();
  const tipo = document.getElementById('pf-tipo').value.trim();
  const descuento = parseFloat(document.getElementById('pf-descuento').value);
  const dropSize = document.getElementById('pf-dropsize').value.trim();
  const dropCantidad = parseInt(document.getElementById('pf-dropcantidad').value);
  const canalesSeleccionados = [...document.querySelectorAll('.pf-canal-check:checked')]
    .map(cb => cb.value);
  const canal = canalesSeleccionados.join(' + ');
  const inicio = document.getElementById('pf-inicio').value;
  const fin = document.getElementById('pf-fin').value;

  if (!productoId || !tipo || !descuento || !dropSize || !dropCantidad || !canalesSeleccionados.length || !inicio || !fin) {
    let errEl = document.querySelector('.admin-promo-form .admin-form-error');
    if (!errEl) {
      errEl = document.createElement('p');
      errEl.className = 'admin-form-error';
      document.querySelector('.admin-form-actions').before(errEl);
    }
    errEl.textContent = 'Completá todos los campos obligatorios';
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = id ? 'Guardar cambios' : 'Crear promo'; }
    return;
  }

  const promo = {
    empresa_id: empresaId,
    producto_id: productoId,
    codigo,
    nombre: document.getElementById('pf-producto').options[document.getElementById('pf-producto').selectedIndex].text,
    tipo_promo: tipo,
    descuento_pct: descuento,
    drop_size: dropSize,
    drop_cantidad: dropCantidad,
    canal,
    fecha_inicio: inicio,
    fecha_fin: fin,
    activa: !!document.getElementById('pf-activa')?.checked
  };

  if (id) promo.id = id;

  try {
    await upsertPromocion(promo);
    loadPromos();
  } catch (e) {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = id ? 'Guardar cambios' : 'Crear promo'; }
    console.error(e);
  }
};

async function loadPrecios() {
  const container = document.getElementById('adminTabContent');
  container.innerHTML = '<p class="admin-loading">Cargando...</p>';
  try {
    const productos = await fetchProductosAdmin(empresaId);

    const cats = [...new Set(productos.map(p => p.cat))];

    container.innerHTML = `
      <div class="admin-precios-header">
        <h3>Productos (${productos.length})</h3>
        <p class="admin-precios-hint">Editá los precios y presioná Enter o hacé click fuera para guardar.</p>
      </div>
      ${cats.map(cat => `
        <div class="admin-precios-section">
          <div class="admin-precios-cat">${cat.toUpperCase()}</div>
          <div class="admin-precios-list">
            <div class="admin-precios-row admin-precios-thead">
              <span>Producto</span>
              <span>Presentación</span>
              <span>Precio comercio</span>
              <span>Precio público</span>
              <span>Estado</span>
            </div>
            ${productos.filter(p => p.cat === cat).map(p => `
              <div class="admin-precios-row" data-id="${p.id}">
                <span class="apm-name">${p.brand} ${p.name}</span>
                <span class="apm-size">${p.size} · ${p.units}u</span>
                <input class="apm-input apm-pcom" type="number" step="0.01"
                  value="${p.pcom}" data-id="${p.id}" data-field="pcom">
                <input class="apm-input apm-ppub" type="number" step="0.01"
                  value="${p.ppub || ''}" data-id="${p.id}" data-field="ppub">
                <span class="admin-badge ${p.activo ? 'admin-badge-active' : 'admin-badge-inactive'}">
                  ${p.activo ? 'Activo' : 'Inactivo'}
                </span>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    `;

    container.querySelectorAll('.apm-input').forEach(input => {
      const save = async () => {
        const id = parseInt(input.dataset.id);
        const row = container.querySelector(`.admin-precios-row[data-id="${id}"]`);
        const pcom = parseFloat(row.querySelector('.apm-pcom').value);
        const ppub = parseFloat(row.querySelector('.apm-ppub').value) || null;
        if (!pcom || pcom <= 0) return;
        input.style.borderColor = '#f5a623';
        await updatePrecioProducto(id, pcom, ppub);
        input.style.borderColor = '#16a34a';
        setTimeout(() => input.style.borderColor = '', 1000);
      };
      input.addEventListener('blur', save);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
    });
  } catch (e) {
    container.innerHTML = '<p class="admin-empty">Error al cargar datos. Intentá de nuevo.</p>';
    console.error(e);
  }
}

window.toggleCanal = function(id) {
  const rol = document.getElementById(`rol-${id}`).value;
  const canalSelect = document.getElementById(`canal-${id}`);
  canalSelect.style.display = rol === 'cliente' ? 'block' : 'none';
};

initAdmin();
