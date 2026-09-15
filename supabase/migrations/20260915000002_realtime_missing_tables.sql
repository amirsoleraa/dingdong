-- PromocionesPanel y HistorialPedidosPanel se suscriben a postgres_changes
-- sobre 'promociones' e 'historial_pedidos', pero esas tablas nunca se
-- agregaron a la publicación — el canal se abre pero jamás recibe eventos,
-- así que crear/editar/eliminar una promoción no refresca la lista en
-- pantalla (aunque el guardado en la base sí funciona).
alter publication supabase_realtime add table promociones;
alter publication supabase_realtime add table historial_pedidos;
