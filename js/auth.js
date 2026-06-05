import { registerUser, loginUser, logoutUser, getCurrentUser, getClienteByEmail, updateClienteFechaNacimiento } from './supabase.js';
import { setIsAdult } from './state.js';

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
    showAuthOverlay();
    return false;
  }
  const cliente = await getClienteByEmail(user.email);
  if (!cliente || cliente.estado === 'pendiente') {
    showAuthPending();
    return false;
  }

  // Mostrar info en header
  const headerUser = document.getElementById('headerUser');
  const headerUserEmail = document.getElementById('headerUserEmail');
  if (headerUser) {
    headerUser.style.display = 'flex';
    headerUserEmail.textContent = user.email;
  }

  // Determinar si es mayor de edad
  if (cliente.fecha_nacimiento) {
    const edad = calcularEdad(cliente.fecha_nacimiento);
    setIsAdult(edad >= 18);
    // Ocultar age gate si ya sabemos la edad
    const ageOverlay = document.getElementById('ageOverlay');
    if (ageOverlay) ageOverlay.style.display = 'none';
  }

  return true;
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
    await loginUser(email, password);
    const cliente = await getClienteByEmail(email);
    if (!cliente || cliente.estado === 'pendiente') {
      showAuthPending();
      return;
    }

    // Mostrar info en header
    const headerUser = document.getElementById('headerUser');
    const headerUserEmail = document.getElementById('headerUserEmail');
    if (headerUser) {
      headerUser.style.display = 'flex';
      headerUserEmail.textContent = email;
    }

    // Determinar edad
    if (cliente.fecha_nacimiento) {
      const edad = calcularEdad(cliente.fecha_nacimiento);
      setIsAdult(edad >= 18);
      const ageOverlay = document.getElementById('ageOverlay');
      if (ageOverlay) ageOverlay.style.display = 'none';
    }

    hideAuthOverlay();
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
  const errorEl = document.getElementById('registerError');
  const btn = document.getElementById('registerBtn');

  if (!email || !password || !password2 || !birthdate) {
    errorEl.textContent = 'Completá todos los campos';
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
    await registerUser(email, password);
    await updateClienteFechaNacimiento(email, birthdate);
    showAuthPending();
  } catch (e) {
    errorEl.textContent = e.message || 'Error al crear la cuenta';
  } finally {
    btn.textContent = 'Crear cuenta';
    btn.disabled = false;
  }
}

export async function handleLogout() {
  await logoutUser();
  const headerUser = document.getElementById('headerUser');
  if (headerUser) headerUser.style.display = 'none';
  showAuthOverlay();
}
