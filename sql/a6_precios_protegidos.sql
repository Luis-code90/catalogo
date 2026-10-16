-- A6: pcom/ppub dejan de ser legibles sin ser cliente activo.
-- ATENCION: este script rompe `select('*')` sobre productos. Correrlo SOLO junto con el
-- deploy del frontend que lo acompaña (rama feature/admin-productos), nunca antes.

-- 1) Columnas legibles por anon/authenticated: todas menos pcom y ppub.
REVOKE SELECT ON public.productos FROM anon, authenticated;
GRANT SELECT (id, empresa_id, name, brand, cat, size, units, barcode, img, activo, es_nuevo)
  ON public.productos TO anon, authenticated;

-- 2) Precios solo vía RPC, para perfiles con estado 'activo' de esa empresa.
CREATE OR REPLACE FUNCTION public.get_precios(p_empresa_id uuid)
RETURNS TABLE (id integer, pcom numeric, ppub numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM perfiles
    WHERE id = auth.uid() AND estado = 'activo' AND empresa_id = p_empresa_id
  ) THEN
    RAISE EXCEPTION 'Acceso denegado';
  END IF;
  RETURN QUERY
    SELECT pr.id, pr.pcom, pr.ppub FROM productos pr WHERE pr.empresa_id = p_empresa_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_precios(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_precios(uuid) TO authenticated;

-- Rollback (si algo sale mal):
--   GRANT SELECT ON public.productos TO anon, authenticated;
