const SUPABASE_URL = 'https://bulvsefhaadhbmwcdncr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1bHZzZWZoYWFkaGJtd2NkbmNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNjA5MDMsImV4cCI6MjA5NTgzNjkwM30.L7HmT8RC3W0cwo5M9C_pvNH1IHCqlTol1TiqWiGOXsY';

async function supabaseGet(table, params) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`
    }
  });
  if (!res.ok) throw new Error(`Supabase error ${res.status}`);
  return await res.json();
}

export async function fetchEmpresaId(slug) {
  const data = await supabaseGet('empresas', {
    slug: `eq.${slug}`,
    select: 'id',
    limit: 1
  });
  if (!data.length) throw new Error(`Empresa no encontrada: ${slug}`);
  return data[0].id;
}

export async function fetchProductos(empresaSlug) {
  const empresaId = await fetchEmpresaId(empresaSlug);
  return await supabaseGet('productos', {
    empresa_id: `eq.${empresaId}`,
    activo: 'eq.true',
    select: '*',
    order: 'cat,brand,name'
  });
}

export async function fetchVendedores(empresaSlug) {
  const empresaId = await fetchEmpresaId(empresaSlug);
  return await supabaseGet('vendedores', {
    empresa_id: `eq.${empresaId}`,
    activo: 'eq.true',
    select: '*'
  });
}
