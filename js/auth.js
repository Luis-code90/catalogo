import { registerUser, loginUser, logoutUser, getCurrentUser, getClienteByEmail } from './supabase.js';

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

  try {
    await loginUser(email, password);
    const cliente = await getClienteByEmail(email);
    if (!cliente || cliente.estado === 'pendiente') {
      showAuthPending();
      return;
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
  const errorEl = document.getElementById('registerError');
  const btn = document.getElementById('registerBtn');

  if (!email || !password || !password2) {
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

  btn.textContent = 'Creando cuenta...';
  btn.disabled = true;

  try {
    await registerUser(email, password);
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
  showAuthOverlay();
}
