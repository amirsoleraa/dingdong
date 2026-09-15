import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { HistorialDia, RutaEntrega, Pedido } from '@/types';

interface HistorialDiaRow {
  id: string; fecha: string; fecha_label: string; pedidos: Pedido[];
  total_entregados: number; total_cancelados: number; total_recaudo: number; creado_en: string;
}

function mapDia(row: HistorialDiaRow): HistorialDia {
  return {
    id: row.id, fecha: row.fecha, fechaLabel: row.fecha_label, pedidos: row.pedidos ?? [],
    totalEntregados: row.total_entregados, totalCancelados: row.total_cancelados,
    totalRecaudo: row.total_recaudo, creadoEn: row.creado_en,
  };
}

export async function listHistorialPedidos(client: SupabaseClient = supabase): Promise<HistorialDia[]> {
  const { data, error } = await client.from('historial_pedidos').select('*').order('creado_en', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as HistorialDiaRow[]).map(mapDia);
}

export async function createHistorialDia(input: Omit<HistorialDia, 'id' | 'creadoEn'>, client: SupabaseClient = supabase): Promise<HistorialDia> {
  const { data, error } = await client.from('historial_pedidos').insert({
    fecha: input.fecha, fecha_label: input.fechaLabel, pedidos: input.pedidos,
    total_entregados: input.totalEntregados, total_cancelados: input.totalCancelados, total_recaudo: input.totalRecaudo,
  }).select('*').single();
  if (error) throw error;
  return mapDia(data as HistorialDiaRow);
}

export async function updateHistorialDia(id: string, patch: Partial<HistorialDia>, client: SupabaseClient = supabase): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.pedidos !== undefined) row.pedidos = patch.pedidos;
  if (patch.totalEntregados !== undefined) row.total_entregados = patch.totalEntregados;
  if (patch.totalCancelados !== undefined) row.total_cancelados = patch.totalCancelados;
  if (patch.totalRecaudo !== undefined) row.total_recaudo = patch.totalRecaudo;
  const { error } = await client.from('historial_pedidos').update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteHistorialDia(id: string, client: SupabaseClient = supabase): Promise<void> {
  const { error } = await client.from('historial_pedidos').delete().eq('id', id);
  if (error) throw error;
}

export function subscribeToHistorialPedidos(callback: (dias: HistorialDia[]) => void, client: SupabaseClient = supabase): () => void {
  async function reload() { callback(await listHistorialPedidos(client)); }
  reload();
  const channel = client
    .channel('historial-pedidos-changes-' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'historial_pedidos' }, reload)
    .subscribe();
  return () => { client.removeChannel(channel); };
}

interface HistorialRutaRow {
  id: string; fecha: string; fecha_label: string; ruta_nombre: string | null;
  domiciliario_id: string | null; domiciliario_nombre: string | null; pedidos: Pedido[]; created_at: string;
}

function mapRuta(row: HistorialRutaRow): RutaEntrega & { fecha: string; fechaLabel: string; domiciliarioNombre?: string } {
  return {
    id: row.id,
    nombre: row.ruta_nombre ?? '',
    domiciliarioId: row.domiciliario_id ?? undefined,
    pedidoIds: (row.pedidos ?? []).map(p => p.id),
    estado: 'completada',
    completadaEn: row.created_at,
    pedidosSnapshot: row.pedidos ?? [],
    fecha: row.fecha,
    fechaLabel: row.fecha_label,
    domiciliarioNombre: row.domiciliario_nombre ?? undefined,
  };
}

export interface CreateHistorialRutaInput {
  fecha: string; fechaLabel: string; rutaNombre: string;
  domiciliarioId: string; domiciliarioNombre: string; pedidos: Pedido[];
}

export async function createHistorialRuta(input: CreateHistorialRutaInput, client: SupabaseClient = supabase): Promise<void> {
  const { error } = await client.from('historial_rutas').insert({
    fecha: input.fecha, fecha_label: input.fechaLabel, ruta_nombre: input.rutaNombre,
    domiciliario_id: input.domiciliarioId, domiciliario_nombre: input.domiciliarioNombre, pedidos: input.pedidos,
  });
  if (error) throw error;
}

export async function listHistorialPedidosSince(fechaISO: string, client: SupabaseClient = supabase): Promise<HistorialDia[]> {
  const { data, error } = await client.from('historial_pedidos').select('*').gte('fecha', fechaISO);
  if (error) throw error;
  return ((data ?? []) as HistorialDiaRow[]).map(mapDia);
}

export async function listHistorialRutasByDomiciliario(domiciliarioId: string, client: SupabaseClient = supabase) {
  const { data, error } = await client.from('historial_rutas').select('*').eq('domiciliario_id', domiciliarioId);
  if (error) throw error;
  return ((data ?? []) as HistorialRutaRow[]).map(mapRuta);
}
