-- Habilita Supabase Realtime (postgres_changes) para las tablas que
-- necesitan tiempo real de verdad: pedidos (admin), notificaciones y rutas
-- (domiciliario). El resto del catálogo (categorias, productos, etc.) se
-- sirve con fetch-on-mount en Fase 1, sin necesidad de estar en esta
-- publicación.
alter publication supabase_realtime add table pedidos;
alter publication supabase_realtime add table notificaciones;
alter publication supabase_realtime add table rutas;
