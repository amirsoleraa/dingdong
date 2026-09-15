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
  -- auth.role() = 'service_role': scripts backend (migración, bootstrap) sin
  -- sesión de usuario — is_admin()/is_domiciliario() siempre dan falso ahí
  -- porque auth.uid() es null, así que se valida el rol de la conexión aparte.
  if auth.role() = 'service_role' or is_admin() then
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
  if auth.role() = 'service_role' or is_admin() then return new; end if;
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
