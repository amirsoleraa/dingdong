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
