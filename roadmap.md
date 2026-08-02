# Roadmap Global — Catálogo Mirlo → Plataforma catalogs.uy

Última actualización: agosto 2026

---

## Fase 0 — Cierre técnico actual (en curso)

**Objetivo:** dejar la base productiva estable antes de sumar features nuevas.

- [ ] M3: limpiar `localStorage` en logout
- Confirmar 3 comportamientos pendientes:
  - [x] Precarga del checkbox de promo activa
  - [x] Invalidación de caché al editar productos
  - [ ] Si `pcom` null en destilados es intencional (código ya lo maneja con '—', falta confirmación de negocio)
- [ ] Fix 7: filtro de admin server-side (ya diagnosticado, falta implementar)
- [ ] Push a producción (branch → merge a main, verificado en browser)

**Nota:** A2 (colisión de claves promo/regular en el carrito) se había catalogado explícitamente
afuera de esta fase, a resolver en Fase 1 — pero se resolvió antes de lo previsto, junto con M1
(desync de contadores en el carrito), durante el cierre de Fase 0. Ver checkbox marcado en Fase 1.

---

## Fase 1 — Consolidación técnica (pre-multitenant)

**Objetivo:** cerrar la deuda técnica que se vuelve más cara de resolver una vez que haya un segundo cliente o más lógica de negocio encima (fidelización).

- [x] **A2** — Rediseño de claves de carrito (promo vs. regular) — resuelto durante Fase 0, adelantado
- [ ] **A3** — Validación server-side de `empresa_id` en INSERT de registro
  > Comentario: hoy está catalogado como "baja prioridad hasta que llegue un segundo cliente", pero si el plan es ofrecerle esto a CCU como plataforma, es más barato cerrarlo ahora que auditarlo bajo presión durante un onboarding real.
- [ ] B1–B6 (medium/low del audit, revisar cuáles siguen vigentes)
- [x] Corregir tipo `pedidos.empresa_id` e `pedidos.vendedor_id` (integer → uuid, consistencia de schema) — verificado en Supabase 21 jul 2026
- [ ] Reemplazar barcodes temporales (TEMP-106 a TEMP-114)
- [ ] Decidir si vale la pena una capa mínima de reactividad en `state.js`, o si se mantiene el patrón manual a propósito (ver nota en "Riesgos" más abajo)

---

## Fase 2 — Dashboard de ventas (BI)

**Objetivo:** demostrarle valor a CCU con datos reales, no solo mockups.

- Construido sobre `pedidos` / `pedido_detalle`, que ya existen y ya son fuente de verdad transaccional
- Mostrar como mockup **respaldado con datos reales** — distinguirlo visualmente de Fase 4 (fidelización), que sí es concepto puro
- Métricas candidatas: ventas por período, por vendedor, por canal, productos más pedidos, comparativas mes a mes
- Acceso: admin y probablemente vendedores (a definir nivel de detalle por rol)

Esta fase va antes de fidelización porque **la data ya está**, es la forma más rápida de mostrar tracción concreta.

---

## Fase 3 — Multi-tenant real (segundo distribuidor)

**Objetivo:** pasar de "app para Mirlo" a "plataforma que sirve a cualquier distribuidor CCU". Esta fase falta hoy en el roadmap y es la bisagra hacia SaaS.

- [ ] Confirmar que A3 (Fase 1) esté cerrado antes de arrancar acá
- [ ] Proceso de onboarding de una empresa nueva (alta de `empresas`, carga de catálogo propio, branding mínimo)
- [ ] Auditoría de RLS específica para aislamiento cross-tenant (no solo el registro — también lectura de pedidos, promociones, precios)
- [ ] Definir si el panel admin es multi-empresa (un admin ve solo su empresa) o si hay un nivel "super-admin" de catalogs.uy
- [ ] Modelo de pricing/planes (aunque sea borrador) — importante tenerlo pensado antes de que CCU pregunte "¿esto cuánto sale por distribuidor?"
- [ ] Documentación mínima de onboarding (para no depender de que vos hagas cada alta a mano)

**Riesgo si se salta esta fase:** vender la idea de plataforma sin haber probado el aislamiento real entre dos empresas es la forma más común de terminar con un incidente de datos cruzados.

---

## Fase 4 — Programa de fidelización / puntos

**Objetivo:** loyalty program como diferencial competitivo.

Mecánica ya definida:
- 100 pesos gastados = 1 punto
- 1 punto ≈ $0.50 al canjear (~0.5% de retorno, en línea con esquema Coca-Cola)
- Canje exclusivo por merchandising y productos del catálogo — sin descuentos ni beneficios de envío
- SKUs de doble puntos para incentivar productos específicos

Pendiente de diseño:
- [ ] Modelo de datos (no existe aún — tabla de puntos, historial de acumulación/canje)
- [ ] Trazabilidad de stock para pedidos de canje a precio cero (ya flageado como consideración de backend)
- [ ] Definir si el canje pasa por el mismo flujo `crear_pedido` o necesita una RPC separada
- [ ] Reglas de vencimiento de puntos (si las hay)

> Comentario: esta es la fase de mayor riesgo arquitectónico. Suma estado nuevo (saldo de puntos, historial) sobre un patrón sin reactividad y con mutación manual de UI. Vale la pena, al llegar acá, revisar si conviene aislar esta lógica en su propio módulo bien encapsulado en vez de extender `state.js` como está hoy — para no repetir el patrón de fragilidad que ya está anotado como punto de atención del proyecto.

---

## Fase 5 — Madurez de plataforma (horizonte largo, sin fecha)

Temas que hoy no son urgentes pero van a aparecer si esto escala a varios distribuidores:

- Revisar si el patrón `window.*` + onclick inline sigue siendo sostenible con más superficie de código, o si conviene una capa de eventos más desacoplada (sin necesariamente saltar a un framework)
- Panel de analytics cross-empresa para catalogs.uy (uso agregado, no solo por distribuidor)
- Posible app o vista optimizada para vendedores en campo
- Facturación / cobro si el modelo de negocio pasa a ser suscripción por distribuidor

---

## Resumen visual de dependencias

```
Fase 0 (cierre actual)
   ↓
Fase 1 (A2, A3, deuda técnica)
   ↓                    ↓
Fase 2 (BI Dashboard)   Fase 3 (Multi-tenant)
   ↓                    ↓
        Fase 4 (Fidelización)
                ↓
        Fase 5 (Madurez de plataforma)
```

Fase 2 y Fase 3 pueden avanzar en paralelo — no son dependientes entre sí, pero ambas dependen de que Fase 1 esté cerrada. Fase 4 idealmente espera a que Fase 3 esté resuelta, porque diseñar el modelo de puntos ya pensando en multi-tenant sale más barato que migrarlo después.

---

