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
De los 15 hallazgos totales, **13 están resueltos**; quedan dos parqueados a
propósito hasta tener más contexto: A3 (contaminación cross-tenant en
registro, severidad baja, depende del diseño de alta multi-tenant) y M2
(regla de total con productos sin `pcom`, depende de una decisión de negocio)
— ver sección 2.

**Actualización 06/09/2026:** primer chequeo con acceso de solo lectura a la base real
(antes solo se auditaba el código JS) encontró un hallazgo crítico nuevo, no visible
desde el repo — dos RPCs de lectura de perfiles sin ningún chequeo de acceso, fuga de
PII explotable sin autenticación (**A4**, sección propia). SQL del fix y de un par de
hallazgos bajos adicionales (B7, B8) queda listo para ejecutar en la sección 7, más
datos operativos verificados (0 promociones vigentes, sin vendedores reales con cuenta)
en la sección 6.

> ⚠️ **Segunda pasada, 06/09/2026 (posterior a ejecutar el SQL de la sección 7):** el
> fix de A4 se aplicó pero **no cerró el agujero**. El chequeo de rol que se agregó
> —copiado del que ya usaban las otras 6 RPCs admin— no bloquea a los llamadores
> anónimos por lógica NULL de SQL. Comprobado explotable en producción sin
> autenticación: se pudieron leer todos los perfiles y las RPCs de escritura
> respondieron con éxito. Esto convierte a las 7 RPCs en una escalada de privilegios
> sin autenticación (**C3**, crítico, pendiente — SQL en la sección 8), y habilita un
> XSS almacenado encadenado contra todos los usuarios (**A5**). En la misma pasada se
> confirmó que los precios comerciales son legibles públicamente (**A6**).
>
> ✅ **C3 resuelto y verificado en producción el mismo día** (SQL de la sección 8):
> los ataques que funcionaban ahora devuelven "Acceso denegado". Con C3 cerrado, **A5
> pasa a ser el ítem abierto de mayor prioridad** — ya no es explotable por anónimos,
> pero sigue siendo la defensa que falta si un dato de la base llega a contener HTML.

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

#### C3. Bypass total del chequeo de admin de las RPCs para usuarios anónimos (lógica NULL)
**Dónde:** las 7 RPCs `SECURITY DEFINER` que validan rol: `get_perfiles_activos`,
`get_perfiles_pendientes`, `update_perfil_admin`, `toggle_promocion`,
`delete_promocion`, `update_precio_producto`, `upsert_promocion`.

Todas usan el mismo guard:

```sql
IF (SELECT rol FROM perfiles WHERE id = auth.uid()) != 'admin' THEN
  RAISE EXCEPTION 'Acceso denegado';
END IF;
```

El guard **no bloquea a los llamadores anónimos**, por lógica de tres valores de SQL:

| Llamador | `auth.uid()` | Subquery | Comparación | Resultado |
|---|---|---|---|---|
| Cliente logueado | su uuid | `'cliente'` | `'cliente' != 'admin'` → TRUE | ✅ Excepción, bloqueado |
| **Anónimo (sin sesión)** | **NULL** | **sin filas → NULL** | **`NULL != 'admin'` → NULL** | ❌ **plpgsql trata NULL como falso: la excepción NUNCA se lanza y la función sigue** |

Es la inversión más peligrosa posible: bloquea al usuario logueado honesto y deja
pasar al atacante que ni siquiera se autentica. Como son `SECURITY DEFINER`, se
ejecutan con permisos del owner, salteando RLS por completo.

**Verificado en producción el 06/09/2026**, sin ninguna sesión, solo con la anon key
pública (que está en el bundle JS por diseño):
- `POST /rest/v1/rpc/get_perfiles_activos` con el `empresa_id` real → devolvió el
  dataset completo de perfiles: email, nombre, apellido, teléfono, estado, rol, canal.
- `POST /rest/v1/rpc/toggle_promocion` con `p_id = -999999` (id inexistente, para no
  tocar datos reales) → respondió **HTTP 204 (éxito)**, no "Acceso denegado" —
  confirma que las RPCs de escritura están igual de expuestas.

**Impacto:** fuga de PII de todos los usuarios; alteración de precios; borrado de
promociones; y lo más grave, **`update_perfil_admin` permite que cualquiera, sin
cuenta, se asigne `rol='admin'`** a sí mismo o a cualquier perfil — escalada total
de privilegios sin autenticación.

`crear_pedido` es la única sana: usa `IF auth.uid() IS NULL THEN RAISE EXCEPTION`,
que sí es NULL-safe.

**Relación con A4:** el fix de A4 (agregar el chequeo de rol a las dos RPCs que no
tenían ninguno) se ejecutó el 06/09/2026 y es correcto en intención, pero copió este
mismo patrón defectuoso — por eso el agujero de PII siguió abierto después del fix.
A4 queda subsumido en C3.

**Fix:** usar `NOT EXISTS`, que es inmune a NULL por construcción (si `auth.uid()`
es NULL, ninguna fila matchea, `NOT EXISTS` da TRUE y la excepción se lanza):

```sql
IF NOT EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'admin') THEN
  RAISE EXCEPTION 'Acceso denegado';
END IF;
```

SQL completo de las 7 funciones + `REVOKE EXECUTE ... FROM anon` como defensa en
profundidad: **sección 8**.

> **RESUELTO Y VERIFICADO EN PRODUCCIÓN — 06/09/2026.** SQL de la sección 8 ejecutado
> por el usuario. Las 7 funciones usan ahora el guard `NOT EXISTS`, conservando
> `SET search_path TO 'public'`. Re-ejecutados sin sesión los mismos ataques que
> comprobaron el agujero: `get_perfiles_activos`, `get_perfiles_pendientes`,
> `toggle_promocion` y `update_perfil_admin` devuelven todas
> `{"code":"P0001","message":"Acceso denegado"}` (HTTP 400). Ya no hay fuga de PII ni
> escalada de privilegios sin autenticación.
>
> Queda pendiente, con prioridad baja, la capa de defensa en profundidad: el bloque
> `REVOKE` original apuntaba a `anon` y fue un no-op (el grant real es a `PUBLIC`).
> Bloque corregido en la **sección 8b** — reduce superficie, no cierra ninguna
> vulnerabilidad abierta.

### 🟠 ALTO

#### A1. XSS almacenado en el panel admin vía datos controlados por el usuario
**Dónde:** `js/admin.js:72` (`${p.email}`), `js/admin.js:150-151` (`${p.nombre}`,
`${p.apellido}`, `${p.comercios?.nombre_comercial}`) — interpolados en `innerHTML`.

`perfiles.nombre` lo escribe el usuario al registrarse sin sanitización. Un registro
con nombre `<img src=x onerror="...">` ejecuta JavaScript **en la sesión del admin**
cuando abre la tab de usuarios pendientes. Desde ahí el atacante puede llamar
cualquier RPC admin con las credenciales del admin (aprobarse a sí mismo, cambiar
precios, etc.). Es la vía de escalada alternativa a C1.

Mismo patrón con menor riesgo en: `showPromoForm` (admin.js:287,291,299 —
`value="${promo?.codigo}"`, `tipo_promo`, `drop_size`, datos creados por admins),
`js/cart.js:84` y `js/ui.js:49-52` (nombres de producto — datos de admin),
`js/client.js` (datos propios del usuario, se auto-afectaría).

**Fix sugerido:** helper de ~5 líneas en admin.js (o ui.js) y aplicarlo a todo dato
de origen usuario que entre a un template:
```js
const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
```

> **RESUELTO — 21 jul 2026.** Helper `esc()` agregado en `admin.js:11-12`. Aplicado
> en los 6 puntos de interpolación identificados: `admin.js:72` (email de pendiente),
> `admin.js:150-151` (nombre, apellido, email y comercio de usuario activo),
> `admin.js:287,291,299` (`pf-codigo`, `pf-tipo`, `pf-dropsize` en `showPromoForm` —
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

> **RESUELTO — 21 jul 2026.** `addToCart`/`removeFromCart` (cart.js) ahora matchean
> también por `promoId` (`null` en ítems regulares, `promo.id` en los clonados desde
> promo-cards en `app.js`). El botón "+" del panel del carrito (antes usaba
> `addToCartById`, que re-derivaba el producto sin conocimiento de promo) ahora reusa
> el producto ya almacenado en la entrada. Resuelto junto con M1 en el mismo fix.

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

#### A4. RPCs de lectura de perfiles sin ningún chequeo de acceso — fuga de PII
**Dónde:** RPCs `get_perfiles_activos(p_empresa_id)` y `get_perfiles_pendientes(p_empresa_id)`
en Supabase (código fuente real, confirmado vía `pg_get_functiondef` — no visible desde el
repo JS).

A diferencia de las otras 6 RPCs admin (`update_perfil_admin`, `toggle_promocion`,
`delete_promocion`, `update_precio_producto`, `upsert_promocion`), que sí validan
`rol = 'admin'` antes de ejecutar, estas dos son `SECURITY DEFINER` **sin ningún chequeo**:

```sql
CREATE OR REPLACE FUNCTION public.get_perfiles_activos(p_empresa_id uuid)
 RETURNS SETOF perfiles
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT * FROM perfiles
  WHERE empresa_id = p_empresa_id
  AND estado = 'activo'
  ORDER BY created_at DESC;
$function$
```
(`get_perfiles_pendientes` es idéntica, sin el `ORDER BY`.)

El advisor de seguridad de Supabase (`get_advisors`) confirma que ambas son ejecutables
por los roles `anon` **y** `authenticated` vía `/rest/v1/rpc/get_perfiles_activos` y
`/rest/v1/rpc/get_perfiles_pendientes` — es decir, cualquiera con la anon key pública
(sin sesión) puede llamarlas directamente y obtener el dataset completo de `perfiles`
(nombre, apellido, email, teléfono, fecha de nacimiento, estado) de todos los usuarios
activos o pendientes de la empresa, sin necesitar `rol='admin'` ni siquiera estar
autenticado.

**Severidad:** crítica — es fuga de PII de todos los usuarios, explotable con un curl
sin autenticación. Es la RPC que alimenta las tabs "Usuarios pendientes"/"Usuarios
activos" del panel admin (admin.js), pero el acceso real que otorga la base de datos
es público.

**Fix (SQL, sección 7 de este documento):** agregar el mismo chequeo `rol = 'admin'`
que ya tienen las otras 6 RPCs, reescribiendo ambas funciones en `plpgsql` con
`RAISE EXCEPTION 'Acceso denegado'` si el caller no es admin.

**Estado:** ~~confirmado vía Supabase real (solo lectura) el 06/09/2026~~ —
**SQL EJECUTADO el 06/09/2026, pero el fix resultó INSUFICIENTE.** Ambas funciones
ahora tienen el chequeo de rol y `search_path` fijado (verificado con
`pg_get_functiondef`), pero el chequeo copió el patrón defectuoso que no bloquea a
llamadores anónimos — la fuga de PII siguió abierta después del fix y se comprobó
explotable sin autenticación. **Ver C3, que subsume este hallazgo.**

#### A5. XSS almacenado en el catálogo vía datos de promociones (encadenado con C3)
**Dónde:** `js/ui.js:170` (`${pr.tipo_promo}`), `js/ui.js:176` (`${pr.drop_size}`),
`js/ui.js:177` (`${pr.canal}`), más `${p.brand}`/`${p.name}` — todos interpolados en
`innerHTML` dentro de `renderPromos()` sin escapar. Mismo patrón en `js/cart.js:81`.

El fix A1 agregó el helper `esc()` pero solo en `admin.js`; `ui.js` y `cart.js` se
dejaron explícitamente fuera de alcance con el argumento de que esos campos solo los
escriben admins, y por lo tanto eran datos confiables.

**C3 invalida ese supuesto.** Mientras `upsert_promocion` sea invocable sin
autenticación, cualquiera puede escribir strings arbitrarios en `tipo_promo`,
`drop_size` o `canal`, y ese contenido se ejecuta como JavaScript en la sesión de
**todos los usuarios que abran el grid de promos, incluidos los admins** — desde ahí
se puede llamar cualquier RPC con las credenciales de la víctima.

**Severidad:** crítica mientras C3 esté abierto; alta una vez cerrado (queda como
defensa en profundidad frente a un admin comprometido o a un futuro bug de escritura).

**Fix:** reusar el helper `esc()` de `admin.js:11-12` en `ui.js` y `cart.js` para todo
dato que venga de la base y entre a un template. Es un cambio de código, no de SQL —
no está incluido en el SQL de la sección 8.

#### A6. Los precios comerciales (`pcom`) son legibles públicamente sin autenticación
**Dónde:** policy RLS de `productos` — `SELECT USING (true)` para el rol `public`.
Mismo caso en `vendedores`, `promociones` y `empresas`.

Todo el modelo del producto es "el invitado ve el catálogo pero no los precios hasta
que un admin lo apruebe" (ver gate C2). Pero ese gate es **puramente cosmético**:
`fetchProductos()` hace `select('*')` para todos los roles, así que el navegador del
invitado descarga los precios completos y simplemente no los pinta. Peor: no hace
falta ni abrir la web — con la anon key pública alcanza un `curl`:

```
GET /rest/v1/productos?select=name,brand,pcom,ppub
→ [{"name":"1,0L con gas","brand":"Nativa","pcom":62.18,"ppub":74}, ...]
```

Verificado sin autenticación el 06/09/2026. `vendedores` expone igual nombres y
teléfonos de los cinco vendedores.

**Impacto:** la lista de precios mayoristas B2B es información competitiva sensible;
hoy cualquiera (incluido un competidor) puede scrapearla completa en un request.
No es fuga de datos personales de clientes — `perfiles`, `comercios`, `pedidos` y
`pedido_detalle` sí están correctamente aislados por `auth.uid()` (confirmado: sin
sesión devuelven `[]`).

**Sin fix inmediato — requiere decisión de diseño + cambio de código.** No alcanza con
endurecer la policy, porque los invitados tienen que seguir viendo el catálogo sin
precios. Opciones a evaluar: (a) una vista pública de `productos` sin las columnas
`pcom`/`ppub` para `anon`, con la tabla completa restringida a perfiles `activo`, y
`fetchProductos()` eligiendo la fuente según el rol; (b) mover el catálogo público a
un endpoint propio. Decidir antes de las pruebas con vendedores no es bloqueante,
pero sí antes de promocionar el catálogo públicamente.

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

> **RESUELTO — 21 jul 2026.** `refreshCardStates` (cart.js) ya no ignora `.promo-card`
> — calcula el contador de cada card (regular o promo) filtrando el CART real por
> `id`/`units`/`promoId`, y es ahora la única fuente que escribe los contadores. Las
> escrituras manuales de `textContent` en los handlers `cqsBtn`/`pqsBtn` de app.js se
> eliminaron. `removeFromCart` llama a `refreshCardStates()` incluso en el
> early-return, como resync defensivo. Resuelto junto con A2 en el mismo fix.

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

> **RESUELTO — rama `fix/limpieza-tecnica-fase0`.** `handleLogout()` limpia
> `mirlo_client_name/business/address` y `mirlo_vendor` reusando los setters de
> `state.js` (ya escriben a localStorage). Extendido en B6 al evento `SIGNED_OUT`
> también, no solo al logout manual.

#### M4. `init()` re-ejecutable duplica listeners e intervalos
**Dónde:** `js/app.js:497` (`window.init`), `js/app.js:111` (setInterval del carrusel),
`setupEventListeners` (sin guard).

`init` está expuesta en window y también la invoca el botón "Reintentar" del load-error.
En el path de error el early-return protege (no se llegó a `setupEventListeners`), pero
cualquier segunda ejecución completa duplica: los listeners delegados de `#grid` y
`#cartList` (→ doble add-to-cart por click) y el `setInterval` del carrusel (nunca se
limpia, rotación doble). Frágil ante cualquier refactor futuro del arranque.

**Fix sugerido:** flag módulo-level `let initialized = false` que haga `setupEventListeners`
e `initCarousel` idempotentes (o `clearInterval` del intervalo previo).

> **RESUELTO — rama `fix/limpieza-tecnica-fase0`.** `firstRun` capturado al
> principio de `init()` (antes de cualquier `await`, sin ventana de carrera)
> cubre `setupEventListeners()` **y** `listenForRecovery()` — este último no
> estaba en el hallazgo original, pero es el mismo mecanismo: sin guardarlo
> también, cada "Reintentar" registraría otro listener de `onAuthStateChange`
> sin dar de baja el anterior (relevante ahora que B6 conecta `SIGNED_OUT` ahí).
> `carouselIntervalId` limpia el intervalo previo en cada `initCarousel()`.

### 🟢 BAJO

- **B1.** ~~Calculadora muestra `$ NaN` si el producto no tiene `pcom`~~ —
  **RESUELTO, con corrección:** verificado que `pcom: null` no produce `NaN`
  (`null * n` da `0` en JS) sino `$ 0,00` engañoso — mismo patrón que ya se
  había arreglado en `mPCom` (modal.js). `calcUpdate()` ahora muestra "—" y
  "Sin precio comercial" en vez de calcular con un precio inexistente.
- **B2.** ~~`fetchPedidosUsuario` sin `limit` ni filtro de empresa~~ —
  **RESUELTO.** Agregado `.eq('empresa_id', empresaId)` (mismo patrón que
  `fetchProductos`/`fetchVendedores`) y `.limit(50)`.
- **B3.** ~~Los `JSON.parse` de caché sessionStorage no tienen try/catch~~ —
  **RESUELTO.** Helper `getCached()` compartido en `supabase.js`, mismo patrón
  que ya usaba `loadCart` (storage.js). Aplicado también a `fetchProductosAdmin`
  (5º punto encontrado, no estaba en el hallazgo original).
- **B4.** ~~Código muerto: `populateRegisterVendors`, `openPromo`~~ —
  **RESUELTO.** Ambos eliminados junto con su único caller/referencia.
  `calcularEdad` se mantiene por decisión documentada en CLAUDE.md (no era
  código muerto, sino intencional).
- **B5.** ~~Modal muestra "Cód. barra: null" si `barcode` es null~~ —
  **RESUELTO.** `modal.js` ahora muestra el campo vacío en vez del string literal.
- **B6.** ~~Sin manejo de expiración de sesión~~ — **RESUELTO.** `onAuthStateChange`
  ahora también escucha `SIGNED_OUT` (no se agregó `TOKEN_REFRESHED` — ese evento
  indica refresh exitoso, no expiración; degradar ahí sería incorrecto) y llama
  `resetToGuest()`, la misma función extraída de `handleLogout()` en M3.
- **B7.** 8 funciones de Postgres sin `search_path` fijado (`function_search_path_mutable`,
  advisor de seguridad de Supabase, confirmado 06/09/2026): `handle_updated_at`,
  `get_perfiles_pendientes`, `get_perfiles_activos`, `update_perfil_admin`,
  `toggle_promocion`, `upsert_promocion`, `delete_promocion`, `update_precio_producto`.
  (`crear_pedido` ya tiene `SET search_path TO 'public'` — no está en la lista.) Riesgo
  bajo en la práctica (requiere que alguien pueda crear objetos en un esquema anterior en
  el `search_path` del rol), pero es hardening estándar y de una sola línea por función.
  Fix en sección 7.
- **B8.** ~~Cuenta de prueba sin borrar~~ — **DECISIÓN 06/09/2026: se mantiene.**
  `qa.playwright.test@mirlosas-test.invalid` (creada 11/08/2026 durante el QA con
  Playwright de esta sesión), `rol='vendedor'`, `estado='activo'`. El usuario decidió
  conservarla para futuras pruebas del flujo de vendedor en vez de borrarla — el SQL de
  borrado sigue disponible en sección 7 si se necesita más adelante. Es, hoy, **el único
  perfil con `rol='vendedor'` que existe en la base** (ver sección 6) — tenerlo en cuenta
  al leer métricas de vendedores reales para no confundirla con una cuenta real.
- **B9.** Protección de contraseñas filtradas (HaveIBeenPwned) deshabilitada en Supabase
  Auth (`auth_leaked_password_protection`, advisor de seguridad). Se configura en
  Authentication → Sign In / Providers → Email (no en "Policies", que son las RLS).

  **DECISIÓN 06/09/2026: riesgo aceptado por ahora.** Esta protección específica
  requiere plan Pro o superior en Supabase (confirmado en la documentación oficial);
  el proyecto está en plan Free. Impacto real considerado bajo con el perfil actual:
  el registro ya está gateado por aprobación de admin (C2, cuentas nuevas quedan en
  `pending` sin acceso), no se maneja información de pago, y la base de usuarios reales
  es chica. No amerita upgrade de plan solo por esto. Mitigación gratuita aplicable en
  la misma pantalla: exigir longitud mínima (8+) y mezcla de caracteres en la
  contraseña — eso sí está disponible en el plan Free. Revisar de nuevo si la base de
  usuarios reales crece significativamente o se agregan pagos.

---

## 2. Deuda técnica: pagar ahora vs. después

### Pagar ahora (antes de usuarios reales)
| # | Qué | Por qué ahora |
|---|-----|---------------|
| C1 | ~~Grants de columna en `perfiles` (SQL)~~ | ✅ Resuelto 20 jul 2026. |
| C2 | ~~Gate por `estado` en initAuth/handleLogin~~ | ✅ Resuelto 20 jul 2026. |
| A1 | ~~Helper `esc()` en admin.js~~ | ✅ Resuelto 21 jul 2026. |
| A2 | ~~`promoId` en la identidad del carrito~~ | ✅ Resuelto 21 jul 2026. |
| M3 | ~~Limpiar localStorage en logout~~ | ✅ Resuelto — rama `fix/limpieza-tecnica-fase0`. |
| C3 | ~~Guard NULL-safe en las 7 RPCs (SQL, sección 8)~~ | ✅ Resuelto y verificado en producción 06/09/2026. Pendiente menor: `REVOKE ... FROM PUBLIC` (sección 8b), solo defensa en profundidad. |
| A5 | Aplicar `esc()` en ui.js y cart.js | Crítico mientras C3 esté abierto (XSS almacenado contra todos los usuarios, admins incluidos). Cambio de código, no de SQL. |

### Puede esperar (agendar, no ignorar)
| # | Qué | Por qué puede esperar |
|---|-----|----------------------|
| A3 | Validar empresa_id en INSERT (perfiles/comercios) | Impacto nulo con una sola empresa activa; el diseño depende de cómo se gestione el alta multi-tenant, aún no definido. |
| A6 | Precios comerciales legibles sin autenticación | No es fuga de datos personales y el negocio ya opera así hoy; cerrarlo requiere decisión de diseño más cambio de código (los invitados deben seguir viendo el catálogo sin precios). Resolver antes de promocionar el catálogo públicamente. |
| M1 | ~~Unificar contadores en refreshCardStates~~ | ✅ Resuelto 21 jul 2026, junto con A2. |
| M2 | Regla de total para productos sin pcom | Necesita decisión de negocio primero; el dato del detalle es correcto. |
| M4 | ~~Guard de idempotencia en init~~ | ✅ Resuelto — rama `fix/limpieza-tecnica-fase0`. |
| B1-B6 | ~~Lote de limpieza~~ | ✅ Resuelto — rama `fix/limpieza-tecnica-fase0` (los 6 ítems). |

---

## 3. Discrepancias con CLAUDE.md

- ~~**D1. Valores de `perfiles.estado`**~~ — **RESUELTO.** La tabla de schema en
  CLAUDE.md ya documenta `'pendiente' o 'activo'`, alineado con el código
  (`aprobarUsuario` setea `'activo'`, RPC `get_perfiles_activos`).
- ~~**D2. Rol `pending`**~~ — **RESUELTO junto con C2.** CLAUDE.md ahora documenta el
  gate real (`perfil.estado !== 'activo'`) en la sección "Roles de usuario", que
  coincide con lo implementado en `auth.js`.
- ~~**D3. Contradicción interna sobre el carrusel**~~ — **RESUELTO.** La frase "Visible
  solo para authenticated" se sacó de la sección "UI / Rediseño"; ahora remite a
  "Carrusel diferenciado por rol" para el comportamiento real de guest.
- ~~**D4. Tipos de `pedidos.empresa_id`/`vendedor_id`**~~ — **RESUELTO 21 jul 2026.**
  Verificado contra `information_schema` — `empresa_id`, `vendedor_id`, `id` y
  `perfil_id` son todos `uuid`. La tabla del schema, "Inconsistencias conocidas" y
  "Pendientes" en CLAUDE.md ya reflejan la corrección.

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
5. ~~**RPCs admin y cross-empresa**~~ — **CONFIRMADO 06/09/2026 en código fuente real**
   (`pg_get_functiondef`, no auditable desde el repo JS): las 6 RPCs admin
   (`update_perfil_admin`, `toggle_promocion`, `delete_promocion`,
   `update_precio_producto`, `upsert_promocion`) validan `rol = 'admin'` del caller,
   pero **ninguna valida que el recurso (`p_perfil_id`, `p_id` de promo/producto,
   `p_empresa_id`) pertenezca a la misma empresa que el admin que llama** — un admin de
   la empresa A podría, en teoría, editar precios/promos/usuarios de la empresa B si
   conociera sus ids. `crear_pedido` (no admin, para cualquier autenticado) solo valida
   `auth.uid() IS NULL`; tampoco valida que `p_empresa_id`/`p_vendedor_id` correspondan
   a la empresa o comercio real del perfil que llama. Además, dos RPCs de esta misma
   familia (`get_perfiles_activos`/`get_perfiles_pendientes`) directamente no validan
   ni siquiera el rol — ver hallazgo nuevo **A4** (crítico, sección propia).
   Severidad de este ítem: baja hoy (una sola empresa activa, ver A3), pero
   **agrava el estado de A4** — mismo patrón de "confía en el parámetro, no en quién
   llama" repetido en 8 de las 9 RPCs auditadas.

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

Verificación post-SQL — **completada 21 jul 2026** (ver blockquotes de C1/C2 arriba):
- Con un usuario común, desde consola: `update({rol:'admin'})` → 403 permission denied. ✅
- Registro de usuario nuevo → funciona con las columnas permitidas. ✅
- Editar nombre/teléfono desde el panel de perfil de la app → funciona. ✅
- Editar comercio desde el panel de perfil → funciona. ✅

---

## 6. Datos operativos verificados en Supabase — 06/09/2026 (no son bugs de código)

Chequeo general de datos reales antes de arrancar la fase de pruebas con vendedores,
vía `supabase-mirlo` (solo lectura). Estos hallazgos no requieren cambios de código —
son datos de negocio que el usuario tiene que cargar o decidir.

- **0 promociones vigentes.** De 54 promociones totales en la tabla, la `fecha_fin` más
  tardía es 31/08/2026 y la más temprana 30/06/2026 — hoy (06/09/2026) **todas están
  vencidas**. `renderPromos()` no va a mostrar nada en el carrusel ni en el grid de
  promos hasta que se carguen promociones nuevas con fechas vigentes.
- **Los 5 vendedores comparten el mismo teléfono** (`59897821688` — el general de la
  empresa) en la tabla `vendedores`. Si el flujo de WhatsApp está pensado para que cada
  vendedor reciba los pedidos de sus propios clientes en su propio celular, hoy todos le
  llegan al mismo número sea cual sea el vendedor asignado.
- **0 perfiles reales con `rol='vendedor'`.** El único perfil con ese rol en `perfiles`
  es la cuenta de prueba `qa.playwright.test@mirlosas-test.invalid` creada durante el QA
  de esta sesión (ver B8). Ningún vendedor real tiene todavía una cuenta para loguearse
  y usar la calculadora de precios. Distribución completa: 2 `admin`/activo,
  1 `cliente`/activo, 1 `vendedor`/activo (la cuenta de prueba).
  Coherente con el hallazgo de la sesión anterior: solo hay **1 fila en
  `vendedores_asignados`** en toda la base — la inmensa mayoría de perfiles no tiene
  ningún vendedor asignado, lo que explica por qué el fast-path de `sendToWhatsApp()`
  rara vez se dispara en pruebas reales (no es un bug — falta cargar datos).
- **5 pedidos de prueba** en la tabla `pedidos`, todos `estado='pendiente'`, creados
  entre el 20/07/2026 y el 03/08/2026 — datos de desarrollo, no de clientes reales.
  Decidir si limpiarlos antes de que el panel admin/dashboard los mezcle con pedidos
  reales de vendedores.

## 7. SQL listo para ejecutar (pendiente — requiere acceso de escritura)

Todo lo siguiente está redactado contra el código fuente real de las funciones
(confirmado vía `pg_get_functiondef` el 06/09/2026) y listo para copiar y pegar en el
SQL Editor de Supabase. Esta sesión solo tiene acceso de lectura a la base — nada de
esto fue ejecutado.

```sql
-- ── A4 (crítico): agregar chequeo de admin a las 2 RPCs que no tenían ninguno ──
-- Mismo patrón que ya usan update_perfil_admin/toggle_promocion/etc.

CREATE OR REPLACE FUNCTION public.get_perfiles_activos(p_empresa_id uuid)
 RETURNS SETOF perfiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  IF (SELECT rol FROM perfiles WHERE id = auth.uid()) != 'admin' THEN
    RAISE EXCEPTION 'Acceso denegado';
  END IF;

  RETURN QUERY
  SELECT * FROM perfiles
  WHERE empresa_id = p_empresa_id
  AND estado = 'activo'
  ORDER BY created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_perfiles_pendientes(p_empresa_id uuid)
 RETURNS SETOF perfiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  IF (SELECT rol FROM perfiles WHERE id = auth.uid()) != 'admin' THEN
    RAISE EXCEPTION 'Acceso denegado';
  END IF;

  RETURN QUERY
  SELECT * FROM perfiles
  WHERE empresa_id = p_empresa_id
  AND estado = 'pendiente';
END;
$function$;

-- ── B7 (bajo): fijar search_path en las 6 RPCs restantes que no lo tenían ──
-- (get_perfiles_activos/pendientes ya quedan con SET search_path en el CREATE OR REPLACE de arriba;
--  crear_pedido ya lo tenía)

ALTER FUNCTION public.handle_updated_at() SET search_path = public;
ALTER FUNCTION public.update_perfil_admin(uuid, text, text, text) SET search_path = public;
ALTER FUNCTION public.toggle_promocion(integer, boolean) SET search_path = public;
ALTER FUNCTION public.delete_promocion(integer) SET search_path = public;
ALTER FUNCTION public.update_precio_producto(integer, numeric, numeric) SET search_path = public;
ALTER FUNCTION public.upsert_promocion(integer, uuid, integer, text, text, text, numeric, text, integer, text, date, date, boolean) SET search_path = public;
```

Verificación sugerida post-SQL (mismo patrón que la sección 5):
- Desde un usuario NO admin, con la anon key, sin sesión: `POST /rest/v1/rpc/get_perfiles_activos`
  → debe devolver error de permisos/excepción en vez de la lista de perfiles.
- Panel admin como usuario admin real → tabs "Usuarios pendientes"/"Usuarios activos"
  siguen funcionando igual que antes.

```sql
-- ── B8 (NO ejecutar — decisión 06/09/2026: se mantiene la cuenta) ──
-- Se deja el SQL documentado por si en el futuro se decide borrarla.
-- Borra la cuenta de prueba QA Playwright y sus filas dependientes, en este orden
-- (respeta FKs: vendedores_asignados/comercios → perfiles → auth.users).
-- Reemplazar el uuid si difiere del confirmado el 06/09/2026:
--   1e10ffe6-c50c-4fc3-bf66-7bf0a9c9f2c8 (qa.playwright.test@mirlosas-test.invalid)

DELETE FROM vendedores_asignados WHERE perfil_id = '1e10ffe6-c50c-4fc3-bf66-7bf0a9c9f2c8';
DELETE FROM comercios WHERE perfil_id = '1e10ffe6-c50c-4fc3-bf66-7bf0a9c9f2c8';
DELETE FROM perfiles WHERE id = '1e10ffe6-c50c-4fc3-bf66-7bf0a9c9f2c8';
-- El usuario de auth.users se borra desde Supabase Dashboard → Authentication → Users
-- (no vía SQL directo, requiere el service role).

-- Los 5 pedidos de prueba (ver sección 6) — opcional, decidir si se conservan como
-- referencia o se limpian antes de la fase de pruebas con vendedores reales:
-- DELETE FROM pedidos WHERE id IN (
--   '66756d91-a88d-405b-a05f-e3f31c2d73b8', '9d52e5e8-e316-4e2d-b538-fef047be3ba1',
--   '6ab74c49-7604-4537-9ecc-7034a0d6feb4', 'e270d913-a86d-4ea1-a5d8-47927654ac24',
--   'b7ee9076-86a9-47a5-aa60-b5c6f243de9f'
-- ); -- pedido_detalle se borra en cascada si el FK tiene ON DELETE CASCADE (verificar antes)
```

No-SQL (ver B9) — **riesgo aceptado, no se va a ejecutar**: activar "Prevent use of
leaked passwords" en Authentication → Sign In / Providers → Email requiere plan Pro;
el proyecto está en plan Free. Mitigación gratuita aplicable en la misma pantalla:
subir la longitud mínima de contraseña a 8+ y exigir mezcla de caracteres.

**Estado de la sección 7:** el bloque de A4 y el de B7 fueron ejecutados por el
usuario el 06/09/2026. El de B7 (`search_path`) funcionó — esos 8 warnings ya no
aparecen en el advisor. El de A4 se aplicó pero resultó insuficiente: ver C3 y la
sección 8.

---

## 8. SQL listo para ejecutar — fix de C3 (CRÍTICO, urgente)

Reemplaza el guard defectuoso por uno NULL-safe en las 7 funciones afectadas, y
revoca `EXECUTE` al rol `anon` como defensa en profundidad. Copiar y pegar completo
en el SQL Editor de Supabase.

Dos detalles importantes de este bloque:
1. Cada `CREATE OR REPLACE` **incluye `SET search_path TO 'public'`**. Es obligatorio:
   omitirlo borraría el pin de `search_path` aplicado en el fix de B7.
2. El `REVOKE` no reemplaza al guard, lo complementa. `anon` es el rol de PostgREST
   para peticiones sin sesión; los admins siempre son `authenticated`, así que
   revocarle `EXECUTE` a `anon` no rompe nada. Pero un usuario logueado no-admin
   sigue siendo `authenticated`, y a ese solo lo frena el guard corregido.

```sql
-- ── C3: guard NULL-safe en las 7 RPCs ──────────────────────────────────────
-- NOT EXISTS es inmune a NULL: si auth.uid() es NULL, ninguna fila matchea,
-- NOT EXISTS da TRUE y la excepción se lanza. El patrón viejo
-- ((SELECT rol ...) != 'admin') evaluaba a NULL y plpgsql lo tomaba como falso.

CREATE OR REPLACE FUNCTION public.get_perfiles_activos(p_empresa_id uuid)
 RETURNS SETOF perfiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'admin') THEN
    RAISE EXCEPTION 'Acceso denegado';
  END IF;

  RETURN QUERY
  SELECT * FROM perfiles
  WHERE empresa_id = p_empresa_id
  AND estado = 'activo'
  ORDER BY created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_perfiles_pendientes(p_empresa_id uuid)
 RETURNS SETOF perfiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'admin') THEN
    RAISE EXCEPTION 'Acceso denegado';
  END IF;

  RETURN QUERY
  SELECT * FROM perfiles
  WHERE empresa_id = p_empresa_id
  AND estado = 'pendiente';
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_perfil_admin(p_perfil_id uuid, p_canal text, p_estado text, p_rol text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'admin') THEN
    RAISE EXCEPTION 'Acceso denegado';
  END IF;
  UPDATE perfiles SET canal = p_canal, estado = p_estado, rol = p_rol WHERE id = p_perfil_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.toggle_promocion(p_id integer, p_activa boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'admin') THEN
    RAISE EXCEPTION 'Acceso denegado';
  END IF;
  UPDATE promociones SET activa = p_activa WHERE id = p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_promocion(p_id integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'admin') THEN
    RAISE EXCEPTION 'Acceso denegado';
  END IF;
  DELETE FROM promociones WHERE id = p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_precio_producto(p_id integer, p_pcom numeric, p_ppub numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'admin') THEN
    RAISE EXCEPTION 'Acceso denegado';
  END IF;
  UPDATE productos SET pcom = p_pcom, ppub = p_ppub WHERE id = p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_promocion(p_id integer, p_empresa_id uuid, p_producto_id integer, p_codigo text, p_nombre text, p_tipo_promo text, p_descuento_pct numeric, p_drop_size text, p_drop_cantidad integer, p_canal text, p_fecha_inicio date, p_fecha_fin date, p_activa boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'admin') THEN
    RAISE EXCEPTION 'Acceso denegado';
  END IF;
  INSERT INTO promociones (id, empresa_id, producto_id, codigo, nombre, tipo_promo, descuento_pct, drop_size, drop_cantidad, canal, fecha_inicio, fecha_fin, activa)
  VALUES (COALESCE(p_id, nextval('promociones_id_seq')), p_empresa_id, p_producto_id, p_codigo, p_nombre, p_tipo_promo, p_descuento_pct, p_drop_size, p_drop_cantidad, p_canal, p_fecha_inicio, p_fecha_fin, p_activa)
  ON CONFLICT (id) DO UPDATE SET producto_id = EXCLUDED.producto_id, codigo = EXCLUDED.codigo, nombre = EXCLUDED.nombre, tipo_promo = EXCLUDED.tipo_promo, descuento_pct = EXCLUDED.descuento_pct, drop_size = EXCLUDED.drop_size, drop_cantidad = EXCLUDED.drop_cantidad, canal = EXCLUDED.canal, fecha_inicio = EXCLUDED.fecha_inicio, fecha_fin = EXCLUDED.fecha_fin, activa = EXCLUDED.activa;
END;
$function$;

-- ── Defensa en profundidad: ninguna de estas RPCs necesita ser llamable sin sesión ──
-- ⚠️ ESTE BLOQUE ESTABA MAL Y NO HIZO NADA. Ver el bloque corregido más abajo.
-- REVOKE EXECUTE ON FUNCTION public.get_perfiles_activos(uuid) FROM anon;   -- no-op
-- (idem para las otras 7 — `anon` nunca tuvo grant directo, hereda de PUBLIC)
```

### 8b. Corrección del bloque REVOKE — pendiente de ejecutar

**Ejecutado el 06/09/2026: el bloque de arriba funcionó, pero solo a medias.** El guard
NULL-safe quedó correctamente aplicado y verificado (ver "Resultado" más abajo). El
`REVOKE ... FROM anon`, en cambio, **no revocó nada**: fue un no-op silencioso.

Motivo: Postgres otorga `EXECUTE` a `PUBLIC` por defecto al crear una función, y `anon`
nunca tuvo un grant *directo* — lo hereda de `PUBLIC`. Revocarle a `anon` algo que nunca
se le concedió directamente no tiene efecto. El ACL real lo muestra
(`select proacl from pg_proc`), donde el grantee vacío del primer ítem es `PUBLIC`:

```
=X/postgres | postgres=X/postgres | authenticated=X/postgres | service_role=X/postgres
 ↑ esto es PUBLIC, y anon es miembro de PUBLIC
```

La forma correcta es revocar a `PUBLIC`. Es seguro: `authenticated` y `service_role`
tienen grants **explícitos** propios, así que revocarle a `PUBLIC` no le saca el acceso
a los admins (que siempre son `authenticated`) ni rompe `crear_pedido` para los clientes
logueados.

```sql
REVOKE EXECUTE ON FUNCTION public.get_perfiles_activos(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_perfiles_pendientes(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_perfil_admin(uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.toggle_promocion(integer, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_promocion(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_precio_producto(integer, numeric, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_promocion(integer, uuid, integer, text, text, text, numeric, text, integer, text, date, date, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.crear_pedido(uuid, text, numeric, uuid, text, jsonb) FROM PUBLIC;
```

Tras ejecutarlo, los 8 warnings `anon_security_definer_function_executable` del advisor
deben desaparecer. Los `authenticated_security_definer_function_executable` van a
quedar, y está bien: los admins necesitan poder llamarlas.

**Prioridad:** baja/media. El agujero crítico ya está cerrado por el guard; esto es
reducción de superficie de ataque, no una vulnerabilidad abierta.

**Lección para RPCs futuras:** en Postgres, `REVOKE ... FROM anon` sobre una función es
casi siempre inútil. Si querés que una función no sea llamable sin sesión, va
`REVOKE ... FROM PUBLIC` y, si hace falta, `GRANT ... TO authenticated` explícito.

### Verificación post-SQL

**Resultado de la ejecución del 06/09/2026:** los 4 checks sin sesión devolvieron
`{"code":"P0001","message":"Acceso denegado"}` con HTTP 400 —
`get_perfiles_activos`, `get_perfiles_pendientes`, `toggle_promocion` y
`update_perfil_admin`. Antes del fix, el primero devolvía el dataset completo de
perfiles y el tercero respondía 204. **C3 cerrado y verificado.**

**1. Sin sesión, la fuga de PII debe estar cerrada.** Desde cualquier terminal
(reemplazar `<ANON_KEY>` por la anon key pública de `js/supabase.js`):

```bash
curl -s -X POST "https://bulvsefhaadhbmwcdncr.supabase.co/rest/v1/rpc/get_perfiles_activos" \
  -H "apikey: <ANON_KEY>" -H "Content-Type: application/json" \
  -d '{"p_empresa_id":"9c993e43-e77c-4585-b4c1-25f4440e2fdf"}'
```
Antes del fix devolvía la lista completa de perfiles. Después debe devolver un error
de permisos (`42501` por el REVOKE) — **nunca** datos de perfiles.

**2. Sin sesión, las RPCs de escritura deben rechazar.** Con id inexistente para no
tocar datos reales:

```bash
curl -s -w "\n%{http_code}\n" -X POST "https://bulvsefhaadhbmwcdncr.supabase.co/rest/v1/rpc/toggle_promocion" \
  -H "apikey: <ANON_KEY>" -H "Content-Type: application/json" \
  -d '{"p_id":-999999,"p_activa":true}'
```
Antes del fix devolvía `204`. Después debe devolver error, no `204`.

**3. El panel admin debe seguir funcionando igual.** Entrar a `admin.html` con la
cuenta admin real y verificar las 4 tabs: usuarios pendientes, usuarios activos
(deben listar), promociones (activar/desactivar y editar) y precios (guardar un
precio). Si alguna falla con "Acceso denegado", el guard quedó mal aplicado.
