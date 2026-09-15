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
