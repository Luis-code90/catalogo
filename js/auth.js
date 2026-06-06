import { 
  registerUser, loginUser, logoutUser, 
  getCurrentUser, getPerfilByUserId,
  createPerfil, createComercio, createVendedorAsignado,
  fetchEmpresa
} from './supabase.js';
import { setIsAdult, setCurrentUser, setCurrentPerfil, setUserRole, getVendors } from './state.js';
import { filter } from './filters.js';
import { hideAlcohol } from './filters.js';

function calcularEdad(fechaNacimiento) {
  const hoy = new Date();
  const nac = new Date(fechaNacimiento);
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return edad;
}

export async function initAuth() {
  const user = await getCurrentUser();

  if (!user) {
    setUserRole('guest');
    updateHeaderUI();
    showAuthOverlay();
    return 'guest';
  }

  const perfil = await getPerfilByUserId(user.id);

  if (!perfil || perfil.nombre === '') {
    setUserRole('pending');
    setCurrentUser(user);
    showAuthPending();
    return 'pending';
  }

  setCurrentUser(user);
  setCurrentPerfil(perfil);
  setUserRole('authenticated');

  if (perfil.fecha_nacimiento) {
    const edad = calcularEdad(perfil.fecha_nacimiento);
    setIsAdult(edad >= 18);
    if (edad < 18) hideAlcohol();
  } else {
    setIsAdult(true);
  }

  updateHeaderUI(user.email);
  hideAuthOverlay();
  return 'authenticated';
}

export function updateHeaderUI(email = null) {
  const headerUser = document.getElementById('headerUser');
  const headerUserEmail = document.getElementById('headerUserEmail');
  if (!headerUser) return;
  if (email) {
    headerUser.style.display = 'flex';
    headerUserEmail.textContent = email;
  } else {
    headerUser.style.display = 'none';
  }
}

export function showAuthOverlay() {
  showAuthLogin();
  document.getElementById('authOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

export function hideAuthOverlay() {
  document.getElementById('authOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

export function showAuthLogin() {
  document.getElementById('authLogin').style.display = 'block';
  document.getElementById('authRegister').style.display = 'none';
  document.getElementById('authPending').style.display = 'none';
}

export function showAuthRegister() {
  document.getElementById('authLogin').style.display = 'none';
  document.getElementById('authRegister').style.display = 'block';
  document.getElementById('authPending').style.display = 'none';
  populateRegisterVendors();
}

function populateRegisterVendors() {
  const select = document.getElementById('registerVendor');
  const vendors = getVendors();
  if (!select || !vendors.length) return;
  select.innerHTML = `<option value="">— Seleccioná tu vendedor (opcional) —</option>` +
    vendors.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
}

export function showAuthPending() {
  document.getElementById('authOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('authLogin').style.display = 'none';
  document.getElementById('authRegister').style.display = 'none';
  document.getElementById('authPending').style.display = 'block';
}

export async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');

  if (!email || !password) {
    errorEl.textContent = 'Completá todos los campos';
    return;
  }

  btn.textContent = 'Entrando...';
  btn.disabled = true;
  errorEl.textContent = '';

  try {
    const { user } = await loginUser(email, password);
    const perfil = await getPerfilByUserId(user.id);

    if (!perfil || perfil.nombre === '') {
      setCurrentUser(user);
      setUserRole('pending');
      showAuthPending();
      return;
    }

    setCurrentUser(user);
    setCurrentPerfil(perfil);
    setUserRole('authenticated');

    if (perfil.fecha_nacimiento) {
      const edad = calcularEdad(perfil.fecha_nacimiento);
      setIsAdult(edad >= 18);
      if (edad < 18) hideAlcohol();
    } else {
      setIsAdult(true);
    }

    updateHeaderUI(email);
    hideAuthOverlay();
    filter();

  } catch (e) {
    errorEl.textContent = 'Email o contraseña incorrectos';
  } finally {
    btn.textContent = 'Entrar';
    btn.disabled = false;
  }
}

export async function handleRegister() {
  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value;
  const password2 = document.getElementById('registerPassword2').value;
  const birthdate = document.getElementById('registerBirthdate').value;
  const nombre = document.getElementById('registerNombre').value.trim();
  const apellido = document.getElementById('registerApellido').value.trim();
  const telefono = document.getElementById('registerTelefono').value.trim();
  const nombreComercial = document.getElementById('registerComercio').value.trim();
  const rut = document.getElementById('registerRut').value.trim();
  const direccion = document.getElementById('registerDireccion').value.trim();
  const horario = document.getElementById('registerHorario').value.trim();
  const vendorSelect = document.getElementById('registerVendor');
  const errorEl = document.getElementById('registerError');
  const btn = document.getElementById('registerBtn');

  if (!email || !password || !password2 || !birthdate || !nombre || !apellido || !nombreComercial || !direccion) {
    errorEl.textContent = 'Completá todos los campos obligatorios';
    return;
  }

  if (password !== password2) {
    errorEl.textContent = 'Las contraseñas no coinciden';
    return;
  }

  if (password.length < 6) {
    errorEl.textContent = 'La contraseña debe tener al menos 6 caracteres';
    return;
  }

  const edad = calcularEdad(birthdate);
  if (edad < 13) {
    errorEl.textContent = 'Debés tener al menos 13 años para registrarte';
    return;
  }

  btn.textContent = 'Creando cuenta...';
  btn.disabled = true;
  errorEl.textContent = '';

  try {
    const { user } = await registerUser(email, password);
    
    const slug = window.location.pathname.split('/').filter(Boolean).find(p => p !== 'index.html') || 'mirlosas';
    const empresa = await fetchEmpresa(slug);

    await createPerfil(user.id, email, empresa.id, {
      nombre, apellido, telefono, fechaNacimiento: birthdate
    });

    await createComercio(user.id, {
      nombreComercial, rut, direccion, horario
    });

    if (vendorSelect && vendorSelect.value) {
      await createVendedorAsignado(user.id, vendorSelect.value);
    }

    showAuthPending();
  } catch (e) {
    errorEl.textContent = e.message || 'Error al crear la cuenta';
  } finally {
    btn.textContent = 'Crear cuenta';
    btn.disabled = false;
  }
}

export function continueAsGuest() {
  hideAuthOverlay();
  setUserRole('guest');
  document.getElementById('ageOverlay').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

export async function handleLogout() {
  await logoutUser();
  setCurrentUser(null);
  setCurrentPerfil(null);
  setUserRole('guest');
  updateHeaderUI();
  document.getElementById('authOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  showAuthLogin();
}
