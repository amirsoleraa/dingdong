import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { RutaEntrega } from '@/types';

interface RutaRow {
  id: string; nombre: string; repartidor: string | null; domiciliario_id: string | null;
  pedido_ids: string[]; estado: RutaEntrega['estado']; created_at: string;
  completada_en: string | null; pedidos_snapshot: RutaEntrega['pedidosSnapshot'];
}

function mapRow(row: RutaRow): RutaEntrega {
  return {
    id: row.id,
    nombre: row.nombre,
    repartidor: row.repartidor ?? undefined,
    domiciliarioId: row.domiciliario_id ?? undefined,
    pedidoIds: row.pedido_ids ?? [],
    estado: row.estado,
    createdAt: row.created_at,
    completadaEn: row.completada_en ?? undefined,
    pedidosSnapshot: row.pedidos_snapshot ?? undefined,
  };
}

export async function listRutasActivas(opts: { domiciliarioId?: string } = {}, client: SupabaseClient = supabase): Promise<RutaEntrega[]> {
  let q = client.from('rutas').select('*').eq('estado', 'activa');
  if (opts.domiciliarioId) q = q.eq('domiciliario_id', opts.domiciliarioId);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as RutaRow[]).map(mapRow);
}

export async function createRuta(input: Omit<RutaEntrega, 'id' | 'createdAt'>, client: SupabaseClient = supabase): Promise<RutaEntrega> {
  const { data, error } = await client.from('rutas').insert({
    nombre: input.nombre, repartidor: input.repartidor || null,
    domiciliario_id: input.domiciliarioId || null, pedido_ids: input.pedidoIds, estado: input.estado,
  }).select('*').single();
  if (error) throw error;
  return mapRow(data as RutaRow);
}

export async function updateRuta(id: string, patch: Partial<RutaEntrega>, client: SupabaseClient = supabase): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.pedidoIds !== undefined) row.pedido_ids = patch.pedidoIds;
  if (patch.estado !== undefined) row.estado = patch.estado;
  if (patch.completadaEn !== undefined) row.completada_en = patch.completadaEn;
  if (patch.pedidosSnapshot !== undefined) row.pedidos_snapshot = patch.pedidosSnapshot;
  if (Object.keys(row).length === 0) return;
  const { error } = await client.from('rutas').update(row).eq('id', id);
  if (error) throw error;
}

export async function listRutasCompletadas(client: SupabaseClient = supabase): Promise<RutaEntrega[]> {
  const { data, error } = await client.from('rutas').select('*').eq('estado', 'completada');
  if (error) throw error;
  return ((data ?? []) as RutaRow[]).map(mapRow);
}

export async function deleteRuta(id: string, client: SupabaseClient = supabase): Promise<void> {
  const { error } = await client.from('rutas').delete().eq('id', id);
  if (error) throw error;
}

export function subscribeToRutas(
  opts: { domiciliarioId?: string },
  callback: (rutas: RutaEntrega[]) => void,
  client: SupabaseClient = supabase,
): () => void {
  async function reload() {
    callback(await listRutasActivas(opts, client));
  }
  reload();
  const filter = opts.domiciliarioId ? `domiciliario_id=eq.${opts.domiciliarioId}` : undefined;
  const channel = client
    .channel('rutas-changes-' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rutas', filter }, reload)
    .subscribe();
  return () => { client.removeChannel(channel); };
}
