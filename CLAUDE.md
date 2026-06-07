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
  Contiene updateHeaderUI(email) y updateUIForRole(role, perfil).
  Grafo de imports: app.js → ui.js ← auth.js, sin ciclos.
- js/ — módulos ES por feature (cart, modal, filters, etc.)

## Flujo de inicialización
1. fetchEmpresa + fetchProductos + fetchVendedores (paralelo)
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
- Banner de ofertas (#promoBanner): visible solo para authenticated, oculto en guest
  y al cerrar sesión. Hardcodeado — se conectará a Supabase cuando exista panel admin.

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
- handleLogout() no reseteaba UI post-sesión — resuelto. Limpia campos de login
  y llama updateUIForRole('guest', null).
- handleLogin() no actualizaba hero ni banner tras login en sesión activa — resuelto.
  Llama updateUIForRole('authenticated', perfil) al completar el login exitoso.

## Workflow de desarrollo
- Claude Code edita archivos directamente en VS Code
- Revisar diff antes de aceptar cambios
- Deploy via Netlify (hacer commits en lotes para conservar build credits)
- Validación final siempre en catalogs.uy/mirlosas