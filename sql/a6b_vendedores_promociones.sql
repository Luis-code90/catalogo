-- A6b: vendedores (nombres/teléfonos) y promociones (descuentos/canales) dejan de ser
-- públicos: solo los lee un perfil 'activo' de la misma empresa (admin incluido).
-- ATENCION: correr JUNTO con el deploy del frontend de la rama feature/admin-productos
-- (el frontend viejo los pide sin sesión y recibiría error/vacío).

DROP POLICY IF EXISTS "Public read vendedores" ON public.vendedores;
CREATE POLICY "Activos leen vendedores" ON public.vendedores
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.perfiles pf
    WHERE pf.id = auth.uid() AND pf.estado = 'activo' AND pf.empresa_id = vendedores.empresa_id
  ));

DROP POLICY IF EXISTS "Promos lectura publica" ON public.promociones;
CREATE POLICY "Activos leen promociones" ON public.promociones
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.perfiles pf
    WHERE pf.id = auth.uid() AND pf.estado = 'activo' AND pf.empresa_id = promociones.empresa_id
  ));

-- Defensa en profundidad: anon no necesita nada de estas tablas.
REVOKE ALL ON public.vendedores, public.promociones FROM anon;

-- Rollback:
--   DROP POLICY "Activos leen vendedores" ON public.vendedores;
--   DROP POLICY "Activos leen promociones" ON public.promociones;
--   CREATE POLICY "Public read vendedores" ON public.vendedores FOR SELECT USING (true);
--   CREATE POLICY "Promos lectura publica" ON public.promociones FOR SELECT USING (true);
--   GRANT SELECT ON public.vendedores, public.promociones TO anon;
