import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bulvsefhaadhbmwcdncr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1bHZzZWZoYWFkaGJtd2NkbmNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNjA5MDMsImV4cCI6MjA5NTgzNjkwM30.L7HmT8RC3W0cwo5M9C_pvNH1IHCqlTol1TiqWiGOXsY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── EMPRESA ──────────────────────────────────────────────
export async function fetchEmpresa(slug) {
  const { data, error } = await supabase
    .from('empresas')
    .select('id, whatsapp_phone')
    .eq('slug', slug)
    .single();
  if (error) throw new Error(`Empresa no encontrada: ${slug}`);
  return data;
}

// ── PRODUCTOS ─────────────────────────────────────────────
export async function fetchProductos(empresaId) {
  const { data, error } = await supabase
    .from('productos')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('activo', true)
    .order('cat')
    .order('brand')
    .order('name');
  if (error) throw new Error(error.message);
  return data;
}

// ── VENDEDORES ────────────────────────────────────────────
export async function fetchVendedores(empresaId) {
  const { data, error } = await supabase
    .from('vendedores')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('activo', true);
  if (error) throw new Error(error.message);
  return data;
}

// ── AUTH ──────────────────────────────────────────────────
export async function registerUser(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(error.message);
  return data;
}

export async function loginUser(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return data;
}

export async function logoutUser() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// ── PERFILES ──────────────────────────────────────────────
export async function getPerfilByUserId(userId) {
  const { data, error } = await supabase
    .from('perfiles')
    .select('*, comercios(*), vendedores_asignados(*)')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data;
}

export async function createPerfil(userId, email, empresaId, datos) {
  const { data, error } = await supabase
    .from('perfiles')
    .insert({
      id: userId,
      email,
      empresa_id: empresaId,
      nombre: datos.nombre,
      apellido: datos.apellido,
      telefono: datos.telefono,
      fecha_nacimiento: datos.fechaNacimiento
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function createComercio(perfilId, datos) {
  const { data, error } = await supabase
    .from('comercios')
    .insert({
      perfil_id: perfilId,
      nombre_comercial: datos.nombreComercial,
      rut: datos.rut,
      direccion: datos.direccion,
      horario_recepcion: datos.horario
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function createVendedorAsignado(perfilId, vendedorId) {
  const { data, error } = await supabase
    .from('vendedores_asignados')
    .insert({
      perfil_id: perfilId,
      vendedor_id: vendedorId
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updatePerfil(userId, datos) {
  const { error } = await supabase
    .from('perfiles')
    .update(datos)
    .eq('id', userId);
  if (error) throw new Error(error.message);
}

export async function updateComercio(perfilId, datos) {
  const { error } = await supabase
    .from('comercios')
    .update(datos)
    .eq('perfil_id', perfilId);
  if (error) throw new Error(error.message);
}
