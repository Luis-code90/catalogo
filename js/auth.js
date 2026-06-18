import {
  registerUser, loginUser, logoutUser,
  getCurrentUser, getPerfilByUserId,
  createPerfil, createComercio, createVendedorAsignado,
  fetchEmpresa, resetPassword, onAuthStateChange, updatePassword
} from './supabase.js';
import { setIsAdult, setCurrentUser, setCurrentPerfil, setUserRole, getVendors } from './state.js';
import { filter } from './filters.js';
import { hideAlcohol } from './filters.js';
import { updateHeaderUI, updateUIForRole } from './ui.js';

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

  updateHeaderUI(perfil.nombre || user.email);
  hideAuthOverlay();
  return 'authenticated';
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
  document.getElementById('authForgot').style.display = 'none';
}

export function showForgotPassword() {
  document.getElementById('authLogin').style.display = 'none';
  document.getElementById('authRegister').style.display = 'none';
  document.getElementById('authPending').style.display = 'none';
  document.getElementById('authForgot').style.display = 'block';
}

export async function handleForgotPassword() {
  const email = document.getElementById('forgotEmail').value.trim();
  const errorEl = document.getElementById('forgotError');
  const btn = document.getElementById('forgotBtn');

  if (!email) {
    errorEl.textContent = 'Ingresá tu email';
    return;
  }

  btn.textContent = 'Enviando...';
  btn.disabled = true;
  errorEl.textContent = '';

  try {
    await resetPassword(email);
    errorEl.style.color = '#16a34a';
    errorEl.textContent = 'Te enviamos un email con instrucciones';
  } catch (e) {
    errorEl.style.color = '#e53e3e';
    errorEl.textContent = 'Error al enviar el email. Verificá la dirección.';
  }
  btn.textContent = 'Enviar email';
  btn.disabled = false;
}

export function listenForRecovery() {
  onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      showSetNewPassword();
    }
  });
}

export function showSetNewPassword() {
  document.getElementById('authLogin').style.display = 'none';
  document.getElementById('authRegister').style.display = 'none';
  document.getElementById('authPending').style.display = 'none';
  document.getElementById('authForgot').style.display = 'none';
  document.getElementById('authNewPassword').style.display = 'block';
  document.getElementById('authOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

export async function handleSetNewPassword() {
  const pass1 = document.getElementById('newPassword').value;
  const pass2 = document.getElementById('newPassword2').value;
  const errorEl = document.getElementById('newPasswordError');
  const btn = document.getElementById('newPasswordBtn');
  if (!pass1 || !pass2) { errorEl.textContent = 'Completá ambos campos'; return; }
  if (pass1 !== pass2) { errorEl.textContent = 'Las contraseñas no coinciden'; return; }
  if (pass1.length < 6) { errorEl.textContent = 'La contraseña debe tener al menos 6 caracteres'; return; }
  btn.textContent = 'Guardando...';
  btn.disabled = true;
  errorEl.textContent = '';
  try {
    await updatePassword(pass1);
    errorEl.style.color = '#16a34a';
    errorEl.textContent = '✓ Contraseña actualizada';
    setTimeout(() => { hideAuthOverlay(); location.reload(); }, 1200);
  } catch (e) {
    errorEl.style.color = '#e53e3e';
    errorEl.textContent = 'Error al actualizar la contraseña';
    btn.textContent = 'Guardar nueva contraseña';
    btn.disabled = false;
  }
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

    updateHeaderUI(perfil.nombre || email);
    hideAuthOverlay();
    filter();
    updateUIForRole('authenticated', perfil);

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
  const nombre = document.getElementById('registerNombre').value.trim();
  const telefono = document.getElementById('registerTelefono').value.trim();
  const errorEl = document.getElementById('registerError');
  const btn = document.getElementById('registerBtn');

  const terms = document.getElementById('registerTerms');
  if (!terms.checked) {
    errorEl.textContent = 'Debés aceptar los Términos y Condiciones para continuar';
    return;
  }

  if (!email || !password || !password2 || !nombre) {
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

  btn.textContent = 'Creando cuenta...';
  btn.disabled = true;
  errorEl.textContent = '';

  try {
    const { user } = await registerUser(email, password);

    const slug = window.location.pathname.split('/').filter(Boolean).find(p => p !== 'index.html') || 'mirlosas';
    const empresa = await fetchEmpresa(slug);

    await createPerfil(user.id, email, empresa.id, {
      nombre, apellido: '', telefono, fechaNacimiento: null
    });

    await createComercio(user.id, {
      nombreComercial: nombre, rut: '', direccion: '', horario: ''
    });

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

  const ageAnswer = sessionStorage.getItem('mirlo_age_verified');
  if (ageAnswer) {
    setIsAdult(ageAnswer === 'adult');
    if (ageAnswer === 'minor') hideAlcohol();
    filter();
    return;
  }

  document.getElementById('ageOverlay').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

export async function handleLogout() {
  await logoutUser();
  setCurrentUser(null);
  setCurrentPerfil(null);
  setUserRole('guest');
  updateHeaderUI();
  updateUIForRole('guest', null);
  filter();
  const loginEmail = document.getElementById('loginEmail');
  const loginPassword = document.getElementById('loginPassword');
  if (loginEmail) loginEmail.value = '';
  if (loginPassword) loginPassword.value = '';
  document.getElementById('authOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  showAuthLogin();
}
