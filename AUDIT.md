# Auditoría técnica — Catálogo Mirlo (julio 2026)

Revisión senior del código actual, post-migración de pedidos a Supabase.
Alcance: riesgos concretos con archivo:línea, deuda técnica priorizada y
discrepancias con CLAUDE.md. Sin refactors de arquitectura — todo dentro
del approach Vanilla JS actual.

**Resumen ejecutivo:** el código está en buen estado general para Fase 0.
Se identificaron dos hallazgos críticos de control de acceso — (1) la
superficie de escalada de privilegios vía UPDATE directo a `perfiles`, y
(2) el gate de aprobación de admin que no bloqueaba a nadie — **ambos
resueltos y verificados en producción al 21/07/2026** (ver C1 y C2 abajo).

---

## 1. Riesgos por severidad

### 🔴 CRÍTICO

#### C1. Escalada de privilegios: UPDATE directo a `perfiles` sin whitelist de columnas
**Dónde:** `js/supabase.js:165-171` (`updatePerfil`), invocada desde `js/profile.js:52`.

```js
export async function updatePerfil(userId, datos) {
  const { error } = await supabase.from('perfiles').update(datos).eq('id', userId);
```

`datos` se pasa sin filtrar. El código legítimo solo envía `nombre/apellido/telefono`,
pero la anon key es pública por diseño: cualquier usuario autenticado puede abrir la
consola del navegador y ejecutar:

```js
supabase.from('perfiles').update({ rol: 'admin', estado: 'activo' }).eq('id', miId)
```

Si la policy UPDATE de RLS en `perfiles` es `auth.uid() = id` (lo típico para permitir
editar el propio perfil), **nada impide auto-promoverse a admin**. RLS controla filas,
no columnas. Con `rol='admin'` el atacante accede a todas las RPCs SECURITY DEFINER
del panel (aprobar usuarios, editar precios, borrar promos).

**Fix sugerido (lado Supabase, no requiere tocar JS):**
```sql
REVOKE UPDATE ON perfiles FROM authenticated;
GRANT UPDATE (nombre, apellido, telefono) ON perfiles TO authenticated;
```
Los cambios de `rol`, `estado` y `canal` ya van por la RPC `update_perfil_admin`, así
que esto no rompe nada del flujo actual. Verificar el equivalente para `comercios`
(menos sensible, pero mismo patrón en `updateComercio`, supabase.js:173-184).

**Estado:** no 100% verificable desde el repo — depende de las policies/grants reales.
Verificación pendiente en Supabase (ver sección 4).

> **RESUELTO — 20 jul 2026.** Grants de columna ejecutados y verificados en Supabase
> (SQL final en sección 5). Sin cambios JS. La escritura directa de `rol`/`estado`/`canal`
> desde el cliente ahora falla con error de permisos; solo la RPC `update_perfil_admin`
> puede modificarlos.
>
> **VERIFICADO EN PRODUCCIÓN — 21 jul 2026.** Prueba funcional manual: intento de
> `update({rol:'admin'})` desde la consola del navegador con un usuario común →
> bloqueado con `403 permission denied for column rol`. Edición de perfil (nombre,
> apellido, teléfono) y de comercio desde la UI del panel de usuario → funcionando
> correctamente.

#### C1b. Hallazgo derivado (verificación 20 jul): policy UPDATE de `comercios` sin WITH CHECK
Durante la verificación de C1 se encontró que la policy de UPDATE en `comercios`
("Los usuarios pueden actualizar su comercio") tiene `USING` pero **`WITH CHECK` en
null** — validaba qué fila se puede tocar, pero no los valores nuevos que se escriben.
RLS no estaba cerrando esta superficie; el GRANT column-level ejecutado en la sección 5
es lo que la cierra. El INSERT de `comercios` sí estaba protegido por su policy RLS
con WITH CHECK, por lo que no requirió grant de columnas.

#### C2. El gate de aprobación de admin no bloquea el acceso
**Dónde:** `js/auth.js:32` (`initAuth`) y `js/auth.js:191` (`handleLogin`).

```js
if (!perfil || perfil.nombre === '') {
  setUserRole('pending');
```

El rol `pending` se decide por **`nombre` vacío**, nunca por `perfil.estado`. Pero
`handleRegister` (auth.js:263-265) siempre crea el perfil con `nombre` lleno — es campo
obligatorio del form de registro simplificado. Consecuencia: **todo usuario que se
registre y confirme su email queda `authenticated` con acceso completo a precios,
carrito y pedidos, sin que ningún admin lo haya aprobado.** La tab "Usuarios
pendientes" del panel admin cambia el `estado` en la base, pero ese estado no gatea
nada en el cliente.

Probablemente esta condición era correcta con el registro viejo (que no pedía nombre)
y quedó rota al simplificar el registro a 5 campos.

**Fix sugerido:** gatear por estado:
```js
if (!perfil || perfil.estado !== 'activo') { setUserRole('pending'); ... }
```
(usar `'activo'`, que es lo que setea `aprobarUsuario` — ver discrepancia D1).
Aplicar en ambos puntos: `initAuth` y `handleLogin`.

> **RESUELTO — 20 jul 2026.** Aplicado en `auth.js` (initAuth y handleLogin gatean
> por `perfil.estado !== 'activo'`). Verificado en Supabase que no hay perfiles
> legacy fuera de 'activo' (SELECT de distribución, 0 filas) — el gate no bloquea
> a ningún usuario existente.
>
> **VERIFICADO EN PRODUCCIÓN — 21 jul 2026.** Prueba funcional manual: registro
> de usuario nuevo → cae correctamente en pantalla "pendiente" pese a tener nombre
> completo. Aprobación desde el panel admin → login del usuario aprobado → acceso
> completo a precios, carrito y pedidos.

### 🟠 ALTO

#### A1. XSS almacenado en el panel admin vía datos controlados por el usuario
**Dónde:** `js/admin.js:70` (`${p.email}`), `js/admin.js:148-149` (`${p.nombre}`,
`${p.apellido}`, `${p.comercios?.nombre_comercial}`) — interpolados en `innerHTML`.

`perfiles.nombre` lo escribe el usuario al registrarse sin sanitización. Un registro
con nombre `<img src=x onerror="...">` ejecuta JavaScript **en la sesión del admin**
cuando abre la tab de usuarios pendientes. Desde ahí el atacante puede llamar
cualquier RPC admin con las credenciales del admin (aprobarse a sí mismo, cambiar
precios, etc.). Es la vía de escalada alternativa a C1.

Mismo patrón con menor riesgo en: `showPromoForm` (admin.js:262,266,274 —
`value="${promo?.codigo}"`, `tipo_promo`, `drop_size`, datos creados por admins),
`js/cart.js:84` y `js/ui.js:49-52` (nombres de producto — datos de admin),
`js/client.js` (datos propios del usuario, se auto-afectaría).

**Fix sugerido:** helper de ~5 líneas en admin.js (o ui.js) y aplicarlo a todo dato
de origen usuario que entre a un template:
```js
const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
```

> **RESUELTO — 21 jul 2026.** Helper `esc()` agregado en `admin.js:12-13`. Aplicado
> en los 6 puntos de interpolación identificados: `admin.js:70` (email de pendiente),
> `admin.js:148-149` (nombre, apellido, email y comercio de usuario activo),
> `admin.js:262,266,274` (`pf-codigo`, `pf-tipo`, `pf-dropsize` en `showPromoForm` —
> estos van dentro de `value="..."`, así que `esc()` también cierra el vector de
> escape de atributo vía comillas sin escapar). Fuera de alcance de este fix:
> `cart.js:84` y `ui.js:49-52` (nombres de producto, catalogado pero no pedido en
> esta pasada).

#### A2. Colisión promo vs. regular en el carrito — el descuento se pierde en silencio
**Dónde:** `js/cart.js:20` (`addToCart`) + `js/app.js:395` (handler de promo-cards).

`addToCart` identifica entradas por `id + units`:
```js
const existing = CART.find(item => item.id === product.id && item.product.units === product.units);
```
Las promo-cards agregan un clon del producto con `pcom` descontado y `units = drop_cantidad`
pero **el mismo `id`**. Si `drop_cantidad` coincide con los `units` regulares — caso real:
drops de "1 FUNDA" = 6, igual que la funda estándar de cerveza — y el usuario ya tiene el
producto regular en el carrito, el `existing.qty += qty` incrementa la entrada **a precio
lleno**: el precio promocional y el `promoCode` se descartan sin aviso. El contador de la
promo-card muestra 1, el carrito cobra precio regular, y el mensaje de WhatsApp sale sin
el código de combo.

**Fix sugerido:** incluir la promo en la identidad de la entrada — agregar `promoId` al
producto clonado en app.js:395 y matchear por `id + units + promoId` en `addToCart` /
`removeFromCart`. Revisar también `refreshCardStates` (ver M1, están acoplados).

#### A3. Contaminación cross-tenant en registro — `empresa_id` sin validar en el INSERT
**Dónde:** `js/auth.js:263` (`handleRegister`) + policies INSERT de `perfiles`/`comercios`/
`vendedores_asignados` en Supabase (verificadas 21 jul 2026).

Las tres policies INSERT atan correctamente la fila al usuario autenticado
(`auth.uid() = id` en perfiles, `auth.uid() = perfil_id` en comercios y
vendedores_asignados) — **la suplantación de otro usuario está bloqueada**. Pero
ninguna `with_check` restringe el valor de `empresa_id`. El cliente lo obtiene de
`fetchEmpresa(slug)` y lo manda tal cual en el INSERT; nada en RLS impide que un
cliente modificado (o un bug futuro) inserte un perfil con un `empresa_id` que no
corresponde al slug desde el que se registró.

No es fuga de datos — la policy SELECT (`auth.uid() = id`) ya impide que cualquiera
lea perfiles ajenos, sin importar la empresa. El riesgo es de **integridad**: un
usuario podría terminar registrado "dentro" de otra empresa, apareciendo en el panel
de pendientes de un catálogo que no es el suyo.

**Severidad:** baja. Hoy hay una sola empresa activa (Mirlo SAS), así que el impacto
práctico es nulo. Se vuelve relevante cuando se sume una segunda empresa al sistema
multi-tenant.

**Sin fix por ahora:** el diseño correcto depende de cómo se vaya a gestionar el alta
de la próxima empresa (¿validar `empresa_id` contra el slug con un trigger? ¿scoping
adicional en la policy?) — decisión pendiente, no tomarla apurado.

### 🟡 MEDIO

#### M1. Desync contador↔carrito en las cards del catálogo
**Dónde:** `js/app.js:376-379`, `js/cart.js:34`, `js/cart.js:126-128`.

Tres piezas que no se ponen de acuerdo:
- `refreshCardStates` (cart.js:126-128) pinta el contador de una card sumando **todas**
  las entradas del producto, incluidas las promocionales con otros `units`.
- El handler − del catálogo (app.js:376-379) decrementa `qtyEl.textContent` a mano y llama
  `removeFromCart(productId, product.units)` — que solo remueve la entrada de units regulares.
- `removeFromCart` (cart.js:34) hace early-return **sin** `updateCartUI` si no encuentra
  la entrada.

Escenario concreto: usuario agrega una promo (drop 12) de Amstel, vuelve al catálogo — la
card de Amstel muestra contador >0 (suma la entrada promo). Toca −: el contador baja, pero
`removeFromCart` no encuentra entrada con units=6 y retorna sin tocar nada. **El DOM dice
una cosa y el carrito otra** hasta el próximo render completo.

**Fix sugerido:** eliminar las escrituras manuales de `textContent` en los handlers de
app.js y dejar que `refreshCardStates` sea la única fuente (llamándola siempre, incluso
en el early-return de `removeFromCart`). Conviene encararlo junto con A2 porque ambos
tocan la identidad de las entradas del carrito.

#### M2. `pedidos.total` no coincide con la suma de subtotales del detalle
**Dónde:** `js/whatsapp.js:83-86` (total) vs. `js/whatsapp.js:94` (precio_unitario).

El total del pedido usa `getPriceFunda` → `pcom * units`, que devuelve null si `pcom` es
null (destilados) y suma $0. Pero el detalle congela `precio_unitario = pcom ?? ppub`, así
que ese mismo item entra a `pedido_detalle` con precio real. Resultado: un pedido con un
Jägermeister tiene `total` menor que `SUM(subtotal)` de sus filas. El dashboard de Fase 2
va a heredar esta inconsistencia en los datos históricos.

**Fix sugerido:** decidir la regla de negocio (¿los productos sin pcom suman al total con
ppub, o quedan como "consultar precio" y fuera del total?) y aplicar la misma fórmula en
ambos lados. Cuanto antes se decida, menos datos históricos inconsistentes.

#### M3. Fuga de datos personales en dispositivos compartidos
**Dónde:** `js/auth.js:296-311` (`handleLogout`), `js/state.js:8-10,17`.

`mirlo_client_name`, `mirlo_client_business`, `mirlo_client_address` y `mirlo_vendor`
persisten en localStorage y `handleLogout` no los limpia. En un dispositivo compartido
(caso real B2B: la computadora del comercio), el siguiente usuario hereda nombre,
comercio y dirección del anterior como pre-relleno del flujo de WhatsApp.

**Fix sugerido:** 4 `localStorage.removeItem` en `handleLogout` + resetear las variables
del state.

#### M4. `init()` re-ejecutable duplica listeners e intervalos
**Dónde:** `js/app.js:502` (`window.init`), `js/app.js:111` (setInterval del carrusel),
`setupEventListeners` (sin guard).

`init` está expuesta en window y también la invoca el botón "Reintentar" del load-error.
En el path de error el early-return protege (no se llegó a `setupEventListeners`), pero
cualquier segunda ejecución completa duplica: los listeners delegados de `#grid` y
`#cartList` (→ doble add-to-cart por click) y el `setInterval` del carrusel (nunca se
limpia, rotación doble). Frágil ante cualquier refactor futuro del arranque.

**Fix sugerido:** flag módulo-level `let initialized = false` que haga `setupEventListeners`
e `initCarousel` idempotentes (o `clearInterval` del intervalo previo).

### 🟢 BAJO

- **B1.** Calculadora muestra `$ NaN` si el producto no tiene `pcom` (destilados):
  `app.js:230` opera sobre null y `fmt` (ui.js:4-7) solo guarda null/undefined, no NaN.
- **B2.** `fetchPedidosUsuario` (supabase.js:336+) sin `limit` ni filtro de empresa: el
  historial crece sin paginación; en un futuro multi-empresa mezclaría pedidos de
  distintos catálogos del mismo usuario.
- **B3.** Los `JSON.parse` de caché sessionStorage (supabase.js:18,34,53,69) no tienen
  try/catch: un valor corrupto rompe el arranque hasta cerrar la pestaña. `loadCart`
  (storage.js) sí lo maneja bien — replicar ese patrón.
- **B4.** Código muerto: `populateRegisterVendors` (auth.js:156-162) referencia
  `#registerVendor` que ya no existe en el HTML; `openPromo` (app.js:293) ya no la llama
  nadie. `calcularEdad` se mantiene por decisión documentada en CLAUDE.md.
- **B5.** Modal muestra "Cód. barra: null" si `barcode` es null (modal.js:26) — cosmético,
  visible en productos con barcode pendiente.
- **B6.** Sin manejo de expiración de sesión: `onAuthStateChange` (auth.js:107-113) solo
  escucha `PASSWORD_RECOVERY`. Un token vencido deja la UI en "authenticated" con las
  queries fallando en silencio. Escuchar `SIGNED_OUT`/`TOKEN_REFRESHED` y degradar a guest.

---

## 2. Deuda técnica: pagar ahora vs. después

### Pagar ahora (antes de usuarios reales)
| # | Qué | Por qué ahora |
|---|-----|---------------|
| C1 | Grants de columna en `perfiles` (SQL) | Escalada de privilegios con la anon key pública. Sin tocar JS. |
| C2 | Gate por `estado` en initAuth/handleLogin | El flujo de aprobación es la premisa del modelo B2B y hoy no existe. 2 líneas. |
| A1 | ~~Helper `esc()` en admin.js~~ | ✅ Resuelto 21 jul 2026. |
| A2 | `promoId` en la identidad del carrito | Cobra precio lleno en pedidos que el cliente cree promocionales — riesgo comercial directo. |
| M3 | Limpiar localStorage en logout | 4 líneas, y es un leak de datos personales en el caso de uso típico B2B. |

### Puede esperar (agendar, no ignorar)
| # | Qué | Por qué puede esperar |
|---|-----|----------------------|
| A3 | Validar empresa_id en INSERT (perfiles/comercios) | Impacto nulo con una sola empresa activa; el diseño depende de cómo se gestione el alta multi-tenant, aún no definido. |
| M1 | Unificar contadores en refreshCardStates | Requiere tocar lo mismo que A2 — hacerlo en la misma pasada de carrito, pero después. |
| M2 | Regla de total para productos sin pcom | Necesita decisión de negocio primero; el dato del detalle es correcto. |
| M4 | Guard de idempotencia en init | Solo se manifiesta ante re-init completo, que hoy no ocurre en flujos reales. |
| B1-B6 | Lote de limpieza | Bajo impacto individual; agrupar en una sesión de mantenimiento. |

---

## 3. Discrepancias con CLAUDE.md

- **D1. Valores de `perfiles.estado`:** CLAUDE.md documenta `'pendiente' o 'aprobado'`
  (tabla perfiles), pero el código usa `'activo'` en todo el panel admin (`aprobarUsuario`
  setea `estado: 'activo'`, la RPC se llama `get_perfiles_activos`). Actualizar la tabla
  del schema — y es el valor a usar en el fix de C2.
- **D2. Rol `pending`:** CLAUDE.md describe "autenticado pero esperando aprobación del
  admin" — el código no implementa ese gate (hallazgo C2). Cuando se fixee C2, la doc
  queda correcta; mientras tanto documenta un comportamiento inexistente.
- **D3. Contradicción interna sobre el carrusel:** la sección "UI / Rediseño" dice
  "Carrusel dinámico… Visible solo para authenticated", pero la sección posterior
  "Carrusel diferenciado por rol" (correcta) dice que guest también lo ve con su slide
  propio. Borrar la frase vieja.
- ~~**D4. Tipos de `pedidos.empresa_id`/`vendedor_id`**~~ — **RESUELTO 21 jul 2026:**
  verificado contra `information_schema` — `empresa_id`, `vendedor_id`, `id` y
  `perfil_id` son todos `uuid`. La corrección ya está aplicada en Supabase. Falta
  reflejarlo en la tabla del schema de CLAUDE.md y limpiar la sección "Inconsistencias
  conocidas" y el ítem de "Pendientes" (tarea de documentación, no de código).

---

## 4. Verificaciones pendientes en Supabase (no auditables desde el repo)

1. ~~**Policy UPDATE y grants de columna en `perfiles`**~~ — **RESUELTO 20 jul 2026:**
   grants de columna ejecutados en `perfiles` (INSERT y UPDATE) y `comercios` (UPDATE),
   ver sección 5. Durante la verificación surgió el hallazgo C1b (WITH CHECK null en
   la policy UPDATE de comercios).
2. ~~**Policies INSERT en `perfiles`/`comercios`/`vendedores_asignados`**~~ —
   **RESUELTO 21 jul 2026:** las tres policies atan el INSERT a `auth.uid()`
   (`perfiles`: `auth.uid() = id`; `comercios`/`vendedores_asignados`: `auth.uid() =
   perfil_id`) — la suplantación de otro usuario está bloqueada. RLS confirmada activa
   en las tres tablas (`relrowsecurity = true`). Ninguna valida `empresa_id`; ver
   hallazgo nuevo **A3** (severidad baja, sin fix por ahora).
3. ~~**Policy SELECT en `perfiles`**~~ — **RESUELTO 21 jul 2026:** `qual = (auth.uid()
   = id)`. Cada usuario solo lee su propia fila; el join con `comercios`/
   `vendedores_asignados` en `getPerfilByUserId` no filtra datos ajenos.
4. ~~**Tipos reales de `pedidos.empresa_id` y `pedidos.vendedor_id`**~~ —
   **RESUELTO 21 jul 2026:** confirmados como `uuid` (ver D4).
5. **RPCs admin y cross-empresa** — confirmar que `update_perfil_admin`, `upsert_promocion`,
   etc. validan que el recurso pertenece a la empresa del admin que llama (hoy validan
   rol, no tenancy). Sigue pendiente.

---

## 5. SQL ejecutado en Supabase (fix C1) — 20 jul 2026

Todo lo siguiente fue ejecutado y verificado por el usuario contra la base real
(columnas confirmadas con `information_schema`).

```sql
-- 1. Distribución real de estado/rol — EJECUTADO: 0 filas fuera de 'activo',
--    no hizo falta normalizar datos legacy. El gate de C2 no bloquea a nadie existente.
SELECT estado, rol, count(*) FROM perfiles GROUP BY estado, rol;

-- 2. INSERT en perfiles — EJECUTADO OK:
--    columnas = payload exacto de createPerfil (supabase.js:118-134)
REVOKE INSERT ON perfiles FROM authenticated;
GRANT INSERT (id, email, empresa_id, nombre, apellido, telefono, fecha_nacimiento)
  ON perfiles TO authenticated;

-- 3. UPDATE en perfiles — EJECUTADO OK (C1: cierra la escalada de privilegios):
--    columnas = payload exacto de saveProfile → updatePerfil (profile.js:52-56):
--    { nombre, apellido, telefono } — nada más. direccion NO existe en perfiles
--    (va a comercios via updateComercio).
REVOKE UPDATE ON perfiles FROM authenticated;
GRANT UPDATE (nombre, apellido, telefono) ON perfiles TO authenticated;

-- 4. UPDATE en comercios — EJECUTADO OK:
--    columnas = payload de updateComercio (supabase.js:173-184)
REVOKE UPDATE ON comercios FROM authenticated;
GRANT UPDATE (nombre_comercial, rut, direccion, horario_recepcion) ON comercios TO authenticated;

-- INSERT en comercios: sin grant de columnas — ya estaba protegido por su
-- policy RLS con WITH CHECK.
```

Verificación post-SQL (pendiente de prueba funcional end-to-end):
- Con un usuario común, desde consola: `update({rol:'admin'})` → debe dar error de permisos.
- Registro de usuario nuevo → debe seguir funcionando (INSERT con las columnas permitidas).
- Editar nombre/teléfono desde el panel de perfil de la app → debe seguir funcionando.
- Editar comercio desde el panel de perfil → debe seguir funcionando.
