-- RPCs admin para CRUD de productos. Guard NOT EXISTS (NULL-safe, ver C3 en AUDIT.md)
-- + REVOKE FROM PUBLIC como defensa en profundidad.

CREATE OR REPLACE FUNCTION public.upsert_producto(
  p_id integer, p_empresa_id uuid, p_name text, p_brand text, p_cat text,
  p_size text, p_units integer, p_pcom numeric, p_ppub numeric,
  p_barcode text, p_img text, p_es_nuevo boolean, p_activo boolean
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_id integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'admin' AND empresa_id = p_empresa_id) THEN
    RAISE EXCEPTION 'Acceso denegado';
  END IF;
  IF coalesce(trim(p_name), '') = '' OR coalesce(trim(p_brand), '') = '' OR coalesce(trim(p_cat), '') = '' THEN
    RAISE EXCEPTION 'Nombre, marca y categoría son obligatorios';
  END IF;
  IF p_units IS NULL OR p_units < 1 THEN
    RAISE EXCEPTION 'Unidades inválidas';
  END IF;
  IF p_pcom IS NULL OR p_pcom <= 0 THEN
    RAISE EXCEPTION 'Precio comercio inválido';
  END IF;

  IF p_id IS NULL THEN
    LOCK TABLE productos IN SHARE ROW EXCLUSIVE MODE;
    SELECT coalesce(max(id), 0) + 1 INTO v_id FROM productos;
    INSERT INTO productos (id, empresa_id, name, brand, cat, size, units, pcom, ppub, barcode, img, es_nuevo, activo)
    VALUES (v_id, p_empresa_id, trim(p_name), trim(p_brand), trim(p_cat), nullif(trim(p_size), ''), p_units,
            p_pcom, p_ppub, nullif(trim(p_barcode), ''), nullif(trim(p_img), ''),
            coalesce(p_es_nuevo, false), coalesce(p_activo, true));
  ELSE
    UPDATE productos SET
      name = trim(p_name), brand = trim(p_brand), cat = trim(p_cat),
      size = nullif(trim(p_size), ''), units = p_units, pcom = p_pcom, ppub = p_ppub,
      barcode = nullif(trim(p_barcode), ''), img = nullif(trim(p_img), ''),
      es_nuevo = coalesce(p_es_nuevo, false), activo = coalesce(p_activo, true)
    WHERE id = p_id AND empresa_id = p_empresa_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Producto no encontrado';
    END IF;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_producto(p_id integer, p_activo boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM perfiles pf JOIN productos pr ON pr.empresa_id = pf.empresa_id
    WHERE pf.id = auth.uid() AND pf.rol = 'admin' AND pr.id = p_id
  ) THEN
    RAISE EXCEPTION 'Acceso denegado';
  END IF;
  UPDATE productos SET activo = p_activo WHERE id = p_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_producto(integer, uuid, text, text, text, text, integer, numeric, numeric, text, text, boolean, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.toggle_producto(integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_producto(integer, uuid, text, text, text, text, integer, numeric, numeric, text, text, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_producto(integer, boolean) TO authenticated;
