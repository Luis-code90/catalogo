import { getCurrentPerfil, setCurrentPerfil } from './state.js';
import { updatePerfil, updateComercio } from './supabase.js';

export function openProfile() {
  const perfil = getCurrentPerfil();
  if (!perfil) return;
  const comercio = perfil.comercios;

  document.getElementById('profileName').textContent = perfil.nombre + ' ' + (perfil.apellido || '');
  document.getElementById('profileEmail').textContent = perfil.email;
  document.getElementById('profileNombre').value = perfil.nombre || '';
  document.getElementById('profileApellido').value = perfil.apellido || '';
  document.getElementById('profileTelefono').value = perfil.telefono || '';
  document.getElementById('profileComercio').value = comercio?.nombre_comercial || '';
  document.getElementById('profileRut').value = comercio?.rut || '';
  document.getElementById('profileDireccion').value = comercio?.direccion || '';
  document.getElementById('profileHorario').value = comercio?.horario_recepcion || '';
  document.getElementById('profileError').textContent = '';

  document.getElementById('profileOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

export function closeProfile() {
  document.getElementById('profileOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

export function closeProfileBg(e) {
  if (e.target === document.getElementById('profileOverlay')) closeProfile();
}

export async function saveProfile() {
  const perfil = getCurrentPerfil();
  const btn = document.getElementById('profileSaveBtn');
  const errorEl = document.getElementById('profileError');

  const nombre = document.getElementById('profileNombre').value.trim();
  const comercioNombre = document.getElementById('profileComercio').value.trim();
  const direccion = document.getElementById('profileDireccion').value.trim();

  if (!nombre || !comercioNombre || !direccion) {
    errorEl.textContent = 'Nombre, comercio y dirección son obligatorios';
    return;
  }

  btn.textContent = 'Guardando...';
  btn.disabled = true;
  errorEl.textContent = '';

  try {
    await updatePerfil(perfil.id, {
      nombre,
      apellido: document.getElementById('profileApellido').value.trim(),
      telefono: document.getElementById('profileTelefono').value.trim()
    });
    await updateComercio(perfil.id, {
      nombre_comercial: comercioNombre,
      rut: document.getElementById('profileRut').value.trim(),
      direccion,
      horario: document.getElementById('profileHorario').value.trim()
    });

    const perfilActualizado = {
      ...perfil,
      nombre,
      apellido: document.getElementById('profileApellido').value.trim(),
      telefono: document.getElementById('profileTelefono').value.trim(),
      comercios: {
        ...perfil.comercios,
        nombre_comercial: comercioNombre,
        rut: document.getElementById('profileRut').value.trim(),
        direccion,
        horario_recepcion: document.getElementById('profileHorario').value.trim()
      }
    };
    setCurrentPerfil(perfilActualizado);

    btn.textContent = '✓ Guardado';
    setTimeout(() => {
      closeProfile();
      btn.textContent = 'Guardar cambios';
      btn.disabled = false;
    }, 1000);
  } catch (e) {
    errorEl.textContent = 'Error al guardar. Intentá de nuevo.';
    btn.textContent = 'Guardar cambios';
    btn.disabled = false;
  }
}
