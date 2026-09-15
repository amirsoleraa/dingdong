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
-- Funciones security definer que replican los helpers isAdmin()/isDomiciliario()/
-- myDomiciliarioId() de firestore.rules, evitando recursión de RLS al consultar
-- `profiles` desde políticas de otras tablas.

create or replace function is_admin() returns boolean
language sql security definer stable as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function is_domiciliario() returns boolean
language sql security definer stable as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'domiciliario');
$$;

create or replace function my_domiciliario_id() returns uuid
language sql security definer stable as $$
  select domiciliario_id from profiles where id = auth.uid();
$$;
-- Row Level Security: traducción fiel de firestore.rules (ver plan de
-- migración para el mapeo regla-por-regla). RLS deny-by-default una vez
-- habilitado sin políticas, igual que el fallback de firestore.rules.

alter table config_main enable row level security;
alter table config_colores enable row level security;
alter table config_delivery_settings enable row level security;
alter table config_admin_settings enable row level security;
alter table categorias enable row level security;
alter table productos enable row level security;
alter table producto_adicionales enable row level security;
alter table adicionales enable row level security;
alter table novedades enable row level security;
alter table publicidades enable row level security;
alter table barrios enable row level security;
alter table promociones enable row level security;
alter table cupones enable row level security;
alter table profiles enable row level security;
alter table domiciliarios enable row level security;
alter table clientes enable row level security;
alter table pedidos enable row level security;
alter table rutas enable row level security;
alter table historial_pedidos enable row level security;
alter table historial_rutas enable row level security;
alter table notificaciones enable row level security;

-- ── Catálogo: lectura pública, escritura admin ──────────────────────────
create policy public_read on categorias for select using (true);
create policy admin_write on categorias for insert with check (is_admin());
create policy admin_update on categorias for update using (is_admin()) with check (is_admin());
create policy admin_delete on categorias for delete using (is_admin());

create policy public_read on productos for select using (true);
create policy admin_write on productos for insert with check (is_admin());
create policy admin_update on productos for update using (is_admin()) with check (is_admin());
create policy admin_delete on productos for delete using (is_admin());

create policy public_read on producto_adicionales for select using (true);
create policy admin_write on producto_adicionales for insert with check (is_admin());
create policy admin_update on producto_adicionales for update using (is_admin()) with check (is_admin());
create policy admin_delete on producto_adicionales for delete using (is_admin());

create policy public_read on adicionales for select using (true);
create policy admin_write on adicionales for insert with check (is_admin());
create policy admin_update on adicionales for update using (is_admin()) with check (is_admin());
create policy admin_delete on adicionales for delete using (is_admin());

create policy public_read on novedades for select using (true);
create policy admin_write on novedades for insert with check (is_admin());
create policy admin_update on novedades for update using (is_admin()) with check (is_admin());
create policy admin_delete on novedades for delete using (is_admin());

create policy public_read on publicidades for select using (true);
create policy admin_write on publicidades for insert with check (is_admin());
create policy admin_update on publicidades for update using (is_admin()) with check (is_admin());
create policy admin_delete on publicidades for delete using (is_admin());

create policy public_read on barrios for select using (true);
create policy admin_write on barrios for insert with check (is_admin());
create policy admin_update on barrios for update using (is_admin()) with check (is_admin());
create policy admin_delete on barrios for delete using (is_admin());

create policy public_read on promociones for select using (true);
create policy admin_write on promociones for insert with check (is_admin());
create policy admin_update on promociones for update using (is_admin()) with check (is_admin());
create policy admin_delete on promociones for delete using (is_admin());

-- ── Config: lectura pública para main/colores/delivery_settings, admin-only para el resto ──
create policy public_read on config_main for select using (true);
create policy admin_write on config_main for all using (is_admin()) with check (is_admin());

create policy public_read on config_colores for select using (true);
create policy admin_write on config_colores for all using (is_admin()) with check (is_admin());

create policy public_read on config_delivery_settings for select using (true);
create policy admin_write on config_delivery_settings for all using (is_admin()) with check (is_admin());

create policy admin_only on config_admin_settings for all using (is_admin()) with check (is_admin());

-- ── profiles (antes users/{uid}) ────────────────────────────────────────
-- El bootstrap del primer admin usa la service role key (bypassa RLS), no
-- hay carve-out alcanzable desde el cliente como el de config/adminReady.
create policy self_or_admin_read on profiles for select
  using (id = auth.uid() or is_admin());
create policy self_insert on profiles for insert
  with check (id = auth.uid() and role <> 'admin');
create policy self_update_no_role_change on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from profiles where id = auth.uid()));
create policy admin_manage on profiles for all using (is_admin()) with check (is_admin());
create policy admin_delete on profiles for delete using (is_admin());

-- ── domiciliarios ────────────────────────────────────────────────────────
create policy read_admin_or_dom on domiciliarios for select using (is_admin() or is_domiciliario());
create policy admin_write on domiciliarios for insert with check (is_admin());
create policy admin_update on domiciliarios for update using (is_admin()) with check (is_admin());
create policy admin_delete on domiciliarios for delete using (is_admin());

-- ── clientes (aislamiento simple por usuario, sin rol) ──────────────────
create policy self_only on clientes for all
  using (id = auth.uid()) with check (id = auth.uid());

-- ── pedidos ──────────────────────────────────────────────────────────────
-- Creación pública (checkout de invitado), sin requerir autenticación.
create policy public_insert on pedidos for insert
  to anon, authenticated
  with check (total > 0 and total <= 10000000 and jsonb_array_length(items) between 1 and 49);

create policy read_scoped on pedidos for select
  using (is_admin() or is_domiciliario() or cliente_uid = auth.uid());

create policy admin_update on pedidos for update using (is_admin()) with check (is_admin());
create policy dom_update on pedidos for update using (is_domiciliario()) with check (is_domiciliario());
create policy admin_delete on pedidos for delete using (is_admin());

-- RLS no puede restringir un UPDATE a columnas específicas (a diferencia de
-- request.resource.data.diff(...).affectedKeys().hasOnly([...]) en Firestore)
-- — se aplica con un trigger que rechaza el cambio si un domiciliario (no
-- admin) modifica cualquier columna fuera de la lista permitida.
create or replace function enforce_dom_pedido_update_columns()
returns trigger language plpgsql security definer as $$
begin
  if is_admin() then
    return new;
  end if;
  if not is_domiciliario() then
    raise exception 'not allowed';
  end if;
  if new.numero is distinct from old.numero
     or new.cliente_nombre is distinct from old.cliente_nombre
     or new.cliente_correo is distinct from old.cliente_correo
     or new.cliente_tel is distinct from old.cliente_tel
     or new.cliente_dir is distinct from old.cliente_dir
     or new.cliente_barrio is distinct from old.cliente_barrio
     or new.cliente_comp is distinct from old.cliente_comp
     or new.cliente_recibe is distinct from old.cliente_recibe
     or new.cliente_uid is distinct from old.cliente_uid
     or new.items is distinct from old.items
     or new.subtotal is distinct from old.subtotal
     or new.domicilio is distinct from old.domicilio
     or new.descuento is distinct from old.descuento
     or new.total is distinct from old.total
     or new.cupon is distinct from old.cupon
     or new.mensaje_confirmacion is distinct from old.mensaje_confirmacion
     or new.location is distinct from old.location
     or new.es_manual is distinct from old.es_manual
     or new.notas is distinct from old.notas
     or new.promos_aplicadas is distinct from old.promos_aplicadas
     or new.verificacion is distinct from old.verificacion
     or new.created_at is distinct from old.created_at then
    raise exception 'domiciliario solo puede actualizar estado, ruta_nombre, repartidor_nombre, domiciliario_id, nota_pendiente';
  end if;
  return new;
end $$;

create trigger trg_dom_pedido_update
  before update on pedidos
  for each row execute function enforce_dom_pedido_update_columns();

-- ── cupones ──────────────────────────────────────────────────────────────
create policy read_by_code on cupones for select using (true);
create policy admin_write on cupones for insert with check (is_admin());

-- Cupón generado automáticamente por una promoción compra_cupon, incluso sin
-- autenticación — valida exactamente contra la promoción real y activa
-- (misma validación que firestore.rules: usos==0, limite==1, tipo=='porcentaje',
-- valor debe igualar promociones.cupon_pct).
create policy promo_generated_insert on cupones for insert
  to anon, authenticated
  with check (
    origen = 'promo' and activo = true and usos = 0 and limite = 1 and tipo = 'porcentaje'
    and promo_id is not null
    and exists (
      select 1 from promociones p where p.id = promo_id and p.activa = true
      and p.tipo = 'compra_cupon' and cupones.valor = p.cupon_pct
    )
  );

create policy admin_update on cupones for update using (is_admin()) with check (is_admin());

-- Cualquiera (incluso sin auth) puede incrementar usos exactamente en 1.
create policy increment_usos_by_one on cupones for update
  to anon, authenticated
  using (true)
  with check (usos = (select usos from cupones c2 where c2.codigo = cupones.codigo) + 1);

create policy admin_delete on cupones for delete using (is_admin());

-- Refuerzo por trigger: un no-admin solo puede tocar `usos`, y en exactamente +1.
create or replace function enforce_cupon_usos_increment()
returns trigger language plpgsql security definer as $$
begin
  if is_admin() then return new; end if;
  if new.usos <> old.usos + 1
     or new.tipo is distinct from old.tipo
     or new.valor is distinct from old.valor
     or new.limite is distinct from old.limite
     or new.activo is distinct from old.activo
     or new.codigo is distinct from old.codigo then
    raise exception 'solo se puede incrementar usos en exactamente 1';
  end if;
  return new;
end $$;

create trigger trg_cupon_usos before update on cupones
  for each row execute function enforce_cupon_usos_increment();

-- ── rutas ────────────────────────────────────────────────────────────────
create policy admin_all on rutas for all using (is_admin()) with check (is_admin());
create policy dom_own_rows on rutas for all
  using (is_domiciliario() and domiciliario_id = my_domiciliario_id())
  with check (is_domiciliario() and domiciliario_id = my_domiciliario_id());

-- ── historial_pedidos ────────────────────────────────────────────────────
create policy read_admin_or_dom on historial_pedidos for select using (is_admin() or is_domiciliario());
create policy admin_write on historial_pedidos for all using (is_admin()) with check (is_admin());

-- ── historial_rutas ──────────────────────────────────────────────────────
create policy admin_all on historial_rutas for all using (is_admin()) with check (is_admin());
create policy dom_own_read on historial_rutas for select
  using (is_domiciliario() and domiciliario_id = my_domiciliario_id());
create policy dom_own_insert on historial_rutas for insert
  with check (is_domiciliario() and domiciliario_id = my_domiciliario_id());

-- ── notificaciones ───────────────────────────────────────────────────────
-- FIX de seguridad respecto a firestore.rules: allí cualquier domiciliario
-- autenticado podía leer/escribir las notificaciones de CUALQUIER OTRO
-- domiciliario. Aquí cada uno queda limitado a las suyas.
create policy admin_all on notificaciones for all using (is_admin()) with check (is_admin());
create policy dom_own_select on notificaciones for select
  using (is_domiciliario() and domiciliario_id = my_domiciliario_id());
create policy dom_own_update on notificaciones for update
  using (is_domiciliario() and domiciliario_id = my_domiciliario_id())
  with check (is_domiciliario() and domiciliario_id = my_domiciliario_id());
-- Cualquier domiciliario puede crear una notificación para OTRO domiciliario
-- (ej. al reasignar una parada) — réplica fiel de firestore.rules, que permitía
-- "create" a cualquier domiciliario sin restringir el domId destino.
create policy dom_create_any on notificaciones for insert
  with check (is_domiciliario());
-- Reemplaza la Cloud Function onNuevoPedido (functions/src/index.ts) por dos
-- triggers de Postgres que corren en la misma transacción del INSERT.
--
-- BEFORE INSERT: verifica el pedido contra el catálogo/cupón real y escribe
-- `verificacion` — solo marca, NO rechaza el pedido (mismo comportamiento que
-- la función actual: un producto borrado después del pedido no debe bloquear
-- a un cliente real).
create or replace function verificar_pedido() returns trigger
language plpgsql security definer as $$
declare
  subtotal_real numeric := 0;
  item jsonb;
  precio_real numeric;
  cup record;
  motivo text;
  tolerancia constant numeric := 1;
begin
  if jsonb_array_length(new.items) = 0 then
    new.verificacion := jsonb_build_object('ok', false, 'motivo', 'Pedido sin items', 'verificado_en', now());
    return new;
  end if;

  for item in select * from jsonb_array_elements(new.items) loop
    select precio into precio_real from productos where id = (item->>'id')::uuid;
    if precio_real is null then
      motivo := format('El producto "%s" (%s) ya no existe en el catálogo', item->>'nombre', item->>'id');
      new.verificacion := jsonb_build_object('ok', false, 'motivo', motivo, 'verificado_en', now());
      return new;
    end if;
    if abs(precio_real - (item->>'precio')::numeric) > tolerancia then
      motivo := format('Precio de "%s" no coincide: catálogo dice %s, el pedido dice %s',
                        item->>'nombre', precio_real, item->>'precio');
      new.verificacion := jsonb_build_object('ok', false, 'motivo', motivo, 'verificado_en', now());
      return new;
    end if;
    subtotal_real := subtotal_real + precio_real * (item->>'qty')::numeric;
  end loop;

  if abs(subtotal_real - new.subtotal) > tolerancia then
    new.verificacion := jsonb_build_object('ok', false, 'motivo',
      format('Subtotal no coincide: real %s, el pedido dice %s', subtotal_real, new.subtotal),
      'subtotal_real', subtotal_real, 'verificado_en', now());
    return new;
  end if;

  if new.cupon is not null then
    select * into cup from cupones where codigo = new.cupon;
    if cup is null then
      new.verificacion := jsonb_build_object('ok', false, 'motivo',
        format('El cupón "%s" no existe', new.cupon), 'subtotal_real', subtotal_real, 'verificado_en', now());
      return new;
    elsif not cup.activo then
      new.verificacion := jsonb_build_object('ok', false, 'motivo',
        format('El cupón "%s" está inactivo', new.cupon), 'subtotal_real', subtotal_real, 'verificado_en', now());
      return new;
    elsif cup.usos >= cup.limite then
      new.verificacion := jsonb_build_object('ok', false, 'motivo',
        format('El cupón "%s" ya se agotó', new.cupon), 'subtotal_real', subtotal_real, 'verificado_en', now());
      return new;
    end if;
  end if;

  if abs((subtotal_real + new.domicilio - new.descuento) - new.total) > tolerancia then
    new.verificacion := jsonb_build_object('ok', false, 'motivo',
      format('Total no cuadra: subtotal %s + domicilio %s - descuento %s = %s, pero el pedido dice %s',
             subtotal_real, new.domicilio, new.descuento, subtotal_real + new.domicilio - new.descuento, new.total),
      'subtotal_real', subtotal_real, 'verificado_en', now());
    return new;
  end if;

  new.verificacion := jsonb_build_object('ok', true, 'subtotal_real', subtotal_real, 'verificado_en', now());
  return new;
end $$;

create trigger trg_verificar_pedido
  before insert on pedidos
  for each row execute function verificar_pedido();

-- AFTER INSERT: incrementa el uso del cupón (si aplica, independiente del
-- resultado de la verificación, igual que hoy) y reparte una notificación a
-- cada domiciliario activo.
create or replace function on_nuevo_pedido() returns trigger
language plpgsql security definer as $$
begin
  if new.cupon is not null then
    update cupones set usos = usos + 1 where codigo = new.cupon;
  end if;

  insert into notificaciones (domiciliario_id, tipo, mensaje, pedido_id, numero, cliente_nombre)
  select id, 'nuevo_pedido', null, new.id, new.numero, new.cliente_nombre
  from domiciliarios
  where activo = true;

  return new;
end $$;

create trigger trg_on_nuevo_pedido
  after insert on pedidos
  for each row execute function on_nuevo_pedido();
-- Habilita Supabase Realtime (postgres_changes) para las tablas que
-- necesitan tiempo real de verdad: pedidos (admin), notificaciones y rutas
-- (domiciliario). El resto del catálogo (categorias, productos, etc.) se
-- sirve con fetch-on-mount en Fase 1, sin necesidad de estar en esta
-- publicación.
alter publication supabase_realtime add table pedidos;
alter publication supabase_realtime add table notificaciones;
alter publication supabase_realtime add table rutas;
