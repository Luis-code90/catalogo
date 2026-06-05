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
export async function fetchProductos(empresaSlug) {
  const empresa = await fetchEmpresa(empresaSlug);
  const { data, error } = await supabase
    .from('productos')
    .select('*')
    .eq('empresa_id', empresa.id)
    .eq('activo', true)
    .order('cat')
    .order('brand')
    .order('name');
  if (error) throw new Error(error.message);
  return data;
}

// ── VENDEDORES ────────────────────────────────────────────
export async function fetchVendedores(empresaSlug) {
  const empresa = await fetchEmpresa(empresaSlug);
  const { data, error } = await supabase
    .from('vendedores')
    .select('*')
    .eq('empresa_id', empresa.id)
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

export async function getClienteByEmail(email) {
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .eq('email', email)
    .single();
  if (error) return null;
  return data;
}

export async function updateClienteFechaNacimiento(email, fechaNacimiento) {
  const { error } = await supabase
    .from('clientes')
    .update({ fecha_nacimiento: fechaNacimiento })
    .eq('email', email);
  if (error) throw new Error(error.message);
}
