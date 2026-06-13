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

## Pendientes
- Contador − | qty | + en cards normales del catálogo
- Panel admin para gestión de promociones y usuarios
- Asignación de canal por usuario desde panel admin
- Campo es_promo y descuento_pct en tabla productos

## Workflow de desarrollo
- Claude Code edita archivos directamente en VS Code
- Revisar diff antes de aceptar cambios
- Deploy via Netlify (hacer commits en lotes para conservar build credits)
- Validación final siempre en catalogs.uy/mirlosas