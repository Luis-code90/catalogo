# Catálogo Mirlo — Contexto para Claude Code

## Proyecto
App B2B de catálogo de productos para distribuidores uruguayos.
Empresa actual: Mirlo SAS (CCU Uruguay). Deploy: catalogs.uy/mirlosas.
El mismo código sirve múltiples empresas via slug en la URL.

## Stack
- Vanilla JS ES Modules, sin bundler, sin framework, sin npm
- Backend: Supabase (PostgreSQL + Auth + RLS)
- Deploy: Netlify con netlify.toml para redirects
- Dominio: catalogs.uy

## Arquitectura
- app.js — orchestrator: carga datos, inicializa auth, event listeners
- state.js — estado global singleton con getters/setters explícitos (sin reactividad)
- supabase.js — cliente Supabase y todas las queries
- ui.js — módulo centralizado para actualizaciones de DOM dependientes del rol.
  Contiene updateHeaderUI(email), updateUIForRole(role, perfil) y renderPromos(promociones, productos).
  Grafo de imports: app.js → ui.js ← auth.js, sin ciclos.
- js/ — módulos ES por feature (cart, modal, filters, etc.)

## Flujo de inicialización
1. fetchEmpresa + fetchProductos + fetchVendedores + fetchPromociones (paralelo)
   Todas con caché sessionStorage — recargas no hacen queries a Supabase.
2. initAuth() — detecta rol: guest | pending | authenticated
3. loadCart() — restaura desde localStorage
4. filter() — primer render del grid

## Roles de usuario
- guest: ve catálogo sin precios, sin carrito
- pending: autenticado pero esperando aprobación del admin
- authenticated: acceso completo, puede hacer pedidos por WhatsApp

## Gate de alcohol
Si fecha_nacimiento en perfiles indica menor de 18, hideAlcohol() oculta
categorías cerveza/vino/sidra antes del render.

## UI / Rediseño aplicado (esta sesión)
- Header: bg-deep, logo Mirlo sin contenedor de fondo, "DISTRIBUIDOR OFICIAL CCU".
  Guest ve botón "Iniciar sesión" (id=headerGuest). Authenticated ve chip con email,
  avatar SVG, campana y logout SVG (id=headerUser).
- Hero: gradiente deep→ocean→teal, título Bebas Neue con gradiente gold→verde, pill y
  subtexto personalizados por rol vía updateUIForRole(), búsqueda integrada con
  backdrop-filter:blur, círculos decorativos.
- Filtros: pills .cf (reemplaza .fb) sin emojis, activo en bg-deep. Selector actualizado
  en filters.js y app.js.
- Auth overlay: íconos SVG lucide en círculos de color (gold=login, teal=registro),
  inputs border-radius:12px, animación popIn. Estilos en css/overlays.css.
- Registro simplificado a 5 campos: nombre/empresa, email, teléfono, contraseña ×2.
  Campos eliminados se envían a Supabase como '' o null.
- Carrusel dinámico (#promoCarousel): reemplaza el banner estático. Visible solo para
  authenticated. Dos slides: "Promos del mes" (marcas desde getPromociones(), mes actual)
  y "Nuevos lanzamientos" (productos con es_nuevo=true). Auto-rotate cada 4s sin rebote
  (goToSlide con módulo). Dots clickeables. Alineado a max-width: 1280px con .controls-inner.

## Flujo de registro
- Registro simplificado — #authRegister en index.html y handleRegister() en js/auth.js
  reducidos a 5 campos: nombre/empresa, email, teléfono, contraseña, confirmar contraseña.
  Campos eliminados (apellido, fecha nacimiento, RUT, dirección, horario, comercio, vendedor)
  se envían a Supabase como '' o null. Se completan luego desde el panel de administración
  o perfil del usuario. La validación de edad (calcularEdad) se mantiene declarada en el
  módulo para sesiones existentes pero ya no se ejecuta en el registro.

## Datos cargados en Supabase (Mirlosas)
- 37 promociones activas para junio 2026: Amstel, Heineken, Schneider, Escudo Silver, Nix, Nativa,
  Full Sport. Cada promo tiene tipo_promo, drop_size, drop_cantidad, canal y fecha_inicio/fin correctos.
- Productos marcados con es_nuevo=true: id 95 (Escudo Silver 710), id 96 (Miller 473),
  id 97 (Lemon Stones 470).

Actualización junio 2026:
- Precios actualizados: Heineken (todos), Imperial (todos), Amstel (473 y 710),
  Miller 330, Watts 0.4L / 1L / 1.5L
- Nuevos productos agregados (ids 100-105):
  100: Blue Moon Long Neck 355cc (es_nuevo=true)
  101: Blue Moon Lata 473cc (es_nuevo=true)
  102: Misiones Espumante Demi Sec
  103: Misiones Espumante Brut
  104: Watts 0.4L Naranja Manzana (edición limitada, es_nuevo=true)
  105: Watts 1.5L Naranja Manzana (edición limitada, es_nuevo=true)
- Units de cervezas se mantienen en 6 (formato distribuidora), no en 24 como figura en lista CCU

## Esquema de base de datos (Supabase)

### empresas
| columna       | tipo    | notas                        |
|---------------|---------|------------------------------|
| id            | uuid    | PK                           |
| slug          | text    | identifica la empresa en URL |
| name          | text    |                              |
| logo_url      | text    | nullable                     |
| activa        | boolean | default true                 |
| whatsapp_phone| text    | número para pedidos WA       |

### productos
| columna    | tipo    | notas                        |
|------------|---------|------------------------------|
| id         | integer | PK                           |
| empresa_id | uuid    | FK → empresas                |
| name       | text    |                              |
| brand      | text    |                              |
| cat        | text    | categoría (cerveza, vino...) |
| size       | text    | nullable                     |
| units      | integer | unidades por paquete         |
| pcom       | numeric | precio comercial             |
| ppub       | numeric | precio público               |
| barcode    | text    | nullable                     |
| img        | text    | nullable                     |
| activo     | boolean | default true                 |
| es_nuevo   | boolean | default false — slide Nuevos lanzamientos |

### vendedores
| columna    | tipo    | notas         |
|------------|---------|---------------|
| id         | uuid    | PK            |
| empresa_id | uuid    | FK → empresas |
| name       | text    |               |
| phone      | text    |               |
| activo     | boolean | default true  |

### perfiles
| columna          | tipo    | notas                              |
|------------------|---------|------------------------------------|
| id               | uuid    | PK — mismo id que auth.users       |
| empresa_id       | uuid    | FK → empresas                      |
| email            | text    |                                    |
| nombre           | text    |                                    |
| apellido         | text    |                                    |
| telefono         | text    | nullable                           |
| fecha_nacimiento | date    | nullable — usado para gate alcohol |
| estado           | text    | 'pendiente' o 'aprobado'           |
| created_at       | timestamptz |                               |
| updated_at       | timestamptz |                               |

### comercios
| columna           | tipo    | notas                      |
|-------------------|---------|----------------------------|
| id                | uuid    | PK                         |
| perfil_id         | uuid    | FK → perfiles              |
| nombre_comercial  | text    |                            |
| rut               | text    | nullable                   |
| direccion         | text    |                            |
| horario_recepcion | text    | nullable                   |

### pedidos
| columna    | tipo    | notas                          |
|------------|---------|--------------------------------|
| id         | uuid    | PK                             |
| perfil_id  | uuid    | FK → perfiles                  |
| empresa_id | integer | FK → empresas                  |
| vendedor_id| integer | nullable, FK → vendedores      |
| estado     | text    | default 'pendiente'            |
| total      | numeric | default 0.00                   |
| notas      | text    | nullable                       |
| created_at | timestamptz |                            |
| updated_at | timestamptz |                            |

### pedido_detalle
| columna              | tipo    | notas              |
|----------------------|---------|--------------------|
| id                   | uuid    | PK                 |
| pedido_id            | uuid    | FK → pedidos       |
| producto_id          | integer | FK → productos     |
| cantidad             | integer |                    |
| unidades_por_paquete | integer |                    |
| precio_unitario      | numeric |                    |
| subtotal             | numeric | nullable           |

### vendedores_asignados
| columna     | tipo | notas                |
|-------------|------|----------------------|
| id          | uuid | PK                   |
| perfil_id   | uuid | FK → perfiles        |
| vendedor_id | uuid | FK → vendedores      |

### promociones
| columna       | tipo         | notas                                |
|---------------|--------------|--------------------------------------|
| id            | serial       | PK                                   |
| empresa_id    | uuid         | FK → empresas                        |
| codigo        | text         |                                      |
| nombre        | text         |                                      |
| producto_id   | integer      | FK → productos                       |
| descuento_pct | numeric(5,2) |                                      |
| tipo_promo    | text         | "6x5", "5+1", "9.63% OFF"           |
| drop_size     | text         | "2 SIX PACK", "1 FUNDA"             |
| drop_cantidad | integer      | unidades mínimas del drop            |
| canal         | text         | pendiente: no filtra por usuario aún |
| activa        | boolean      | default true                         |
| fecha_inicio  | date         |                                      |
| fecha_fin     | date         |                                      |
RLS activa con policy de lectura pública (using (true)).

## Inconsistencias conocidas en el esquema
- pedidos.empresa_id es integer pero empresas.id es uuid — posible bug
- pedidos.vendedor_id es integer pero vendedores.id es uuid — posible bug
- productos.id es integer pero el resto de las PKs son uuid

## Convenciones y restricciones
- Sin frameworks, sin npm, sin bundler — todo vanilla
- onclick inline en HTML requieren exports explícitos en window.* (app.js)
- Cualquier refactor de HTML o JS debe mantener esa lista sincronizada
- La anon key de Supabase en supabase.js es pública (normal), la seguridad
  depende de las RLS policies
- Sin reactividad — cada mutación de estado requiere llamar manualmente
  al render correspondiente

## Bugs conocidos
- fetchProductos llamaba a fetchEmpresa internamente — resuelto. fetchProductos
  y fetchVendedores ahora reciben empresaId como parámetro. loadProducts en
  app.js resuelve fetchEmpresa(slug) primero y pasa el id al Promise.all
  subsiguiente. El arranque hace 3 queries a Supabase sin duplicados.
- pedidos.empresa_id y pedidos.vendedor_id tienen tipo integer en lugar de uuid
  — inconsistente con el resto del esquema
- handleLogout() no reseteaba UI post-sesión — resuelto. Limpia campos de login,
  llama updateUIForRole('guest', null) y filter() para re-renderizar el grid.
- handleLogin() no actualizaba hero ni banner tras login en sesión activa — resuelto.
  Llama updateUIForRole('authenticated', perfil) al completar el login exitoso.
- clearCart() se ejecutaba antes de armar el mensaje en doSendToWhatsApp — resuelto.
  Ahora se llama después de construir la URL, antes de window.open.
- Subtotal por producto faltaba en el panel del carrito — resuelto. cart.js agrega
  .ci-subtotal con fmt(pf * item.qty) bajo la línea de cantidad.
- Modal de producto mostraba selector ×6/×24 en cervezas 1000cc — resuelto.
  esLitro = p.size.includes('1000') oculta modalFundaSelector y usa p.units directo.
- updateComercio en supabase.js pasaba datos directamente — resuelto. Ahora mapea
  campos explícitamente y corrige horario → horario_recepcion.

## Cards rediseñadas (autenticado)
- Cards del catálogo (render()) nunca muestran badge ni descuento: esPromo=false siempre.
  Las promos son exclusivas del grid renderPromos().
- Promo-cards tienen precio tachado (precioFundaOriginal), precio final con descuento,
  "Ahorras $X" y contador − | qty | + (.promo-qty-selector) en lugar de botón +.
  Al agregar: calcula precioFinal desde promo.descuento_pct, usa drop_cantidad como units.
  String(p.id) === promoId para comparar UUID/número en dataset.
- Tag de canal (.promo-canal-tag): pill pequeño debajo de drop_size en promo-cards.
  Muestra pr.canal en uppercase. Estilo gris sobre var(--light).

## Layout
- .controls usa wrapper interno .controls-inner { max-width: 1280px; margin: 0 auto;
  padding: .75rem 1.5rem .25rem } — fondo blanco y borde siguen siendo full-width.
- main reducido a max-width: 1280px alineado con carrusel y controls-inner.

## Performance
Caché sessionStorage en los cuatro fetches de arranque:
- mirlo_empresa_{slug}
- mirlo_productos_{empresaId}
- mirlo_vendedores_{empresaId}
- mirlo_promociones_{empresaId}
Primera carga va a Supabase, recargas sirven desde caché. Se limpia al cerrar la pestaña.

## Responsive mobile
- overflow-x: hidden en body.
- @media (max-width: 480px): header oculta .header-user-name en chip de usuario,
  cart panel ocupa 100vw con border-radius superior, bottom sheet desde abajo.

## Features UX agregadas
- Tecla Escape cierra el modal de producto (listener keydown en app.js).
- Header muestra perfil.nombre en lugar del email. updateHeaderUI(displayName) acepta
  nombre o email; initAuth y handleLogin pasan perfil.nombre || email.
- sendToWhatsApp salta el flujo de datos del cliente si perfil tiene comercios.direccion,
  comercios.nombre_comercial y vendedor asignado (del perfil o seleccionado). Pre-rellena
  campos si tiene datos parciales. Nota: comercios es objeto directo, no array.
- Panel de perfil (js/profile.js): overlay accesible desde click en el chip del header.
  Muestra y permite editar datos personales (nombre, apellido, teléfono) y del comercio
  (nombre, RUT, dirección, horario). Llama updatePerfil y updateComercio en Supabase
  y actualiza el estado local con setCurrentPerfil.
- Footer con logo catalogs.uy: <footer class="site-footer"> con .footer-inner centrado a
  max-width:1280px. Logo desde Cloudinary. Visible en todas las vistas. (css/base.css + index.html)
- Overlay invitado (#promoOverlay) rediseñado: muestra miniaturas de productos es_nuevo=true
  con botón "Registrate para ver precios". Ya no muestra imagen estática de Watts.
- Botón "Ver →" del carrusel de nuevos lanzamientos conectado a verNuevosLanzamientos():
  muestra grid de cards sin precio con badge "NUEVO", botón "← Volver al catálogo".

## Panel Admin
Ruta: admin.html (mismo directorio que index.html)
Acceso: solo usuarios con perfil.rol = 'admin' — redirige a index.html si no hay sesión,
  muestra #adminDenied si no es admin.
Link de acceso: ícono engranaje en header, visible solo si perfil.rol === 'admin' (ui.js)

### Funciones RPC en Supabase (SECURITY DEFINER — bypass RLS):
Todas las RPCs validan auth.uid() con rol='admin' antes de ejecutar.
Si el usuario no es admin, lanzan RAISE EXCEPTION 'Acceso denegado'.
- get_perfiles_pendientes(p_empresa_id) — perfiles con estado = 'pendiente'
- get_perfiles_activos(p_empresa_id) — perfiles con estado = 'activo', orden desc
- update_perfil_admin(p_perfil_id, p_canal, p_estado, p_rol) — UPDATE bypass RLS
- toggle_promocion(p_id, p_activa) — UPDATE activa en promociones
- upsert_promocion(p_id, p_empresa_id, p_producto_id, p_codigo, p_nombre,
    p_tipo_promo, p_descuento_pct, p_drop_size, p_drop_cantidad, p_canal,
    p_fecha_inicio, p_fecha_fin, p_activa) — INSERT/UPDATE bypass RLS
- delete_promocion(p_id) — DELETE bypass RLS
- update_precio_producto(p_id, p_pcom, p_ppub) — UPDATE precios bypass RLS

### Tabs implementadas:
- Usuarios pendientes: lista con selector de rol (cliente/vendedor/admin) y canal
  condicional (solo si rol = 'cliente'). Botón "Aprobar" llama update_perfil_admin
  con estado = 'activo'.
- Usuarios activos: lista con nombre, email, comercio y selector de canal editable.
  Admins filtrados. Cambio de canal guarda via update_perfil_admin automáticamente.
- Promociones: listado con imagen, badge activa/inactiva, tipo, canal y fechas.
  Toggle activar/desactivar via RPC toggle_promocion.
  Formulario crear/editar con checkboxes de canal múltiple.
  Eliminar via RPC delete_promocion con confirm() nativo.
  Caché sessionStorage de promociones se limpia automáticamente tras cada cambio.
- Precios: listado de productos agrupados por categoría con inputs editables
  para pcom y ppub. Guarda en blur o Enter via RPC update_precio_producto.
  Limpia caché mirlo_productos_* automáticamente. Feedback visual naranja→verde.

### Columnas nuevas en tabla perfiles:
- canal text — canal de distribución del cliente
- rol text DEFAULT 'cliente' — valores: 'cliente', 'vendedor', 'admin'

### Panel admin completo — todas las fases implementadas

## Pendientes
- Filtrado de promos por canal del usuario (conectar canal del perfil con renderPromos)
- fecha_lanzamiento en productos para ordenar y archivar lanzamientos

## Auditoría de código (junio 2026)
Análisis completo realizado antes de pruebas con vendedores. 22 problemas en 5 categorías.

Resueltos:
- S3: RPCs de admin con validación auth.uid() rol='admin' en Supabase
- B1/B2: try/catch en loadPendientes, loadActivos, loadPromos, loadPrecios, savePromo
- U1: alert() reemplazados por mensajes inline
- C1: clearSessionCache() helper en supabase.js
- C2: CANALES constante reutilizada en showPromoForm
- P1: fetchProductosAdmin ordena inactivos al final

Pendientes (baja prioridad):
- U4: Panel admin sin responsive mobile
- C3/C4: console.warn/error en storage.js y app.js en producción
- S2: Protección admin solo client-side (mitigado por validación en RPCs)

## Workflow de desarrollo
- Claude Code edita archivos directamente en VS Code
- Revisar diff antes de aceptar cambios
- Deploy via Netlify (hacer commits en lotes para conservar build credits)
- Validación final siempre en catalogs.uy/mirlosas