-- Fase 1: esquema mono-tenant, port fiel de Firestore (ver plan de migración).
create extension if not exists pgcrypto;

-- ── Config (antes docs singleton config/*) ──────────────────────────────────
create table config_main (
  id boolean primary key default true check (id),
  nombre_comercio text,
  logo_emoji text,
  logo_url text,
  domicilio_activo boolean not null default true,
  domicilio_tipo text check (domicilio_tipo in ('fijo','gratis','por_km')),
  domicilio_valor numeric,
  mensaje_confirmacion text,
  whatsapp_numero text,
  campos_formulario jsonb,
  map_country_code text,
  updated_at timestamptz not null default now()
);

create table config_colores (
  id boolean primary key default true check (id),
  brand text,
  brand_dark text,
  brand_light text,
  brand_mid text,
  bg2 text,
  bg3 text,
  surface text,
  text2 text,
  text3 text,
  border text,
  border2 text,
  bg text,
  text_color text,
  accent text,
  updated_at timestamptz not null default now()
);

create table config_delivery_settings (
  id boolean primary key default true check (id),
  origin_lat double precision,
  origin_lng double precision,
  origin_address text,
  price_per_km numeric,
  min_delivery_fee numeric,
  updated_at timestamptz not null default now()
);

create table config_admin_settings (
  id boolean primary key default true check (id),
  historial_pin text,
  admin_pin text,
  updated_at timestamptz not null default now()
);
-- config/adminReady (bootstrap lock) no necesita tabla: se reemplaza por
-- "¿ya existe un profiles.role='admin'?" chequeado en el script de bootstrap.

-- ── Catálogo ─────────────────────────────────────────────────────────────
create table categorias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  color text,
  emoji text,
  img_url text,
  orden integer default 0,
  created_at timestamptz not null default now()
);

create table adicionales (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  precio numeric not null,
  costo numeric,
  activo boolean not null default true
);

create table productos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  precio numeric not null,
  costo numeric,
  emoji text,
  img_url text,
  categoria_id uuid references categorias(id) on delete set null,
  tipo text not null check (tipo in ('comestible','nocomestible')),
  ingredientes text[] not null default '{}',
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table producto_adicionales ( -- normaliza productos.adicionales[]
  producto_id uuid references productos(id) on delete cascade,
  adicional_id uuid references adicionales(id) on delete cascade,
  cantidad_max integer not null default 1,
  primary key (producto_id, adicional_id)
);

create table novedades (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descripcion text,
  img_url text,
  activa boolean default true,
  created_at timestamptz not null default now()
);

create table publicidades (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descripcion text,
  img_url text,
  activa boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);

create table barrios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true,
  orden integer default 0
);

create table promociones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text not null check (tipo in ('compra_lleva','compra_descuento','domicilio_descuento','compra_cupon')),
  activa boolean not null default true,
  descripcion text,
  producto_a_id uuid references productos(id) on delete set null,
  cantidad_a integer,
  producto_b_id uuid references productos(id) on delete set null,
  cantidad_b integer,
  descuento_b_pct numeric,
  domicilio_pct numeric,
  domicilio_gratis boolean,
  cupon_pct numeric,
  created_at timestamptz not null default now()
);

create table cupones (
  codigo text primary key, -- mantiene el código como PK, igual que el doc-ID en Firestore
  tipo text not null check (tipo in ('porcentaje','fijo')),
  valor numeric not null,
  limite integer not null,
  usos integer not null default 0,
  activo boolean not null default true,
  cliente_nombre text,
  cliente_tel text,
  pedido_numero text,
  promo_nombre text,
  promo_id uuid references promociones(id) on delete set null,
  origen text,
  created_at timestamptz not null default now()
);

-- ── Personas / roles ─────────────────────────────────────────────────────
create table profiles ( -- antes users/{uid}, PK = auth.users.id
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','domiciliario','cliente')),
  email text,
  domiciliario_id uuid,
  created_at timestamptz not null default now()
);

create table domiciliarios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tel text,
  activo boolean not null default true,
  pago_base numeric,
  usuario text unique, -- username de login (antes email sintético)
  uid uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
  -- OJO: la columna `password` de Firestore (texto plano) NO se porta.
);

alter table profiles
  add constraint profiles_domiciliario_fk foreign key (domiciliario_id)
  references domiciliarios(id) on delete set null;

create table clientes ( -- antes clientes/{authUid}
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text,
  correo text,
  telefono text,
  favoritos uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
-- clientes/{uid}/direcciones: definido en firestore.rules pero sin ninguna
-- referencia en el código (feature muerta) — NO se porta.

-- ── Pedidos / logística ──────────────────────────────────────────────────
create table pedidos (
  id uuid primary key default gen_random_uuid(),
  numero text not null,
  estado text not null default 'activos'
    check (estado in ('activos','preparando','camino','entregado','cancelado')),
  cliente_nombre text,
  cliente_correo text,
  cliente_tel text,
  cliente_dir text,
  cliente_barrio text,
  cliente_comp text,
  cliente_recibe text,
  cliente_uid uuid references auth.users(id) on delete set null,
  items jsonb not null,
  subtotal numeric not null,
  domicilio numeric not null default 0,
  descuento numeric not null default 0,
  total numeric not null check (total > 0 and total <= 10000000),
  cupon text references cupones(codigo) on delete set null,
  mensaje_confirmacion text,
  location jsonb,
  ruta_nombre text,
  repartidor_nombre text,
  domiciliario_id uuid references domiciliarios(id) on delete set null,
  nota_pendiente text,
  es_manual boolean default false,
  notas text,
  promos_aplicadas jsonb,
  verificacion jsonb,
  created_at timestamptz not null default now(),
  constraint items_count_chk check (jsonb_array_length(items) between 1 and 49)
);

create table rutas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  repartidor text,
  domiciliario_id uuid references domiciliarios(id) on delete set null,
  pedido_ids uuid[] not null default '{}',
  estado text not null default 'activa' check (estado in ('activa','completada')),
  created_at timestamptz not null default now(),
  completada_en timestamptz,
  pedidos_snapshot jsonb
);

create table historial_pedidos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  fecha_label text,
  pedidos jsonb not null,
  total_entregados numeric default 0,
  total_cancelados numeric default 0,
  total_recaudo numeric default 0,
  creado_en timestamptz not null default now()
);

create table historial_rutas (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  fecha_label text,
  ruta_nombre text,
  domiciliario_id uuid references domiciliarios(id) on delete set null,
  domiciliario_nombre text,
  pedidos jsonb not null,
  created_at timestamptz not null default now()
);

create table notificaciones (
  id uuid primary key default gen_random_uuid(),
  domiciliario_id uuid not null references domiciliarios(id) on delete cascade,
  tipo text not null check (tipo in ('asignacion_ruta','reasignacion','nuevo_pedido')),
  mensaje text,
  leida boolean not null default false,
  ruta_id uuid references rutas(id) on delete set null,
  pedido_id uuid references pedidos(id) on delete set null,
  numero text,
  cliente_nombre text,
  created_at timestamptz not null default now()
);

-- ── Índices ──────────────────────────────────────────────────────────────
-- firestore.indexes.json está vacío hoy (solo where/orderBy de un solo campo)
-- — arrancar mínimo y ajustar según planes de consulta reales.
create index idx_pedidos_estado on pedidos(estado);
create index idx_pedidos_cliente_uid on pedidos(cliente_uid);
create index idx_pedidos_domiciliario_id on pedidos(domiciliario_id);
create index idx_pedidos_created_at on pedidos(created_at desc);
create index idx_notificaciones_dom_leida on notificaciones(domiciliario_id, leida);
create index idx_rutas_domiciliario_id on rutas(domiciliario_id);
create index idx_historial_pedidos_fecha on historial_pedidos(fecha desc);
create index idx_historial_rutas_domiciliario on historial_rutas(domiciliario_id);
create index idx_productos_categoria on productos(categoria_id);
