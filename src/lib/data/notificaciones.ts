import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Notificacion } from '@/types';

interface NotifRow {
  id: string; tipo: Notificacion['tipo']; mensaje: string | null; leida: boolean;
  ruta_id: string | null; pedido_id: string | null; created_at: string;
}

function mapRow(row: NotifRow): Notificacion {
  return {
    id: row.id,
    tipo: row.tipo,
    mensaje: row.mensaje ?? '',
    leida: row.leida,
    rutaId: row.ruta_id ?? undefined,
    pedidoId: row.pedido_id ?? undefined,
    createdAt: row.created_at,
  };
}

export async function listNotificaciones(domiciliarioId: string, client: SupabaseClient = supabase): Promise<Notificacion[]> {
  const { data, error } = await client
    .from('notificaciones').select('*')
    .eq('domiciliario_id', domiciliarioId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as NotifRow[]).map(mapRow);
}

export interface CreateNotifInput {
  domiciliarioId: string;
  tipo: Notificacion['tipo'];
  mensaje: string;
  rutaId?: string;
  pedidoId?: string;
}

export async function createNotificacion(input: CreateNotifInput, client: SupabaseClient = supabase): Promise<void> {
  const { error } = await client.from('notificaciones').insert({
    domiciliario_id: input.domiciliarioId, tipo: input.tipo, mensaje: input.mensaje,
    ruta_id: input.rutaId || null, pedido_id: input.pedidoId || null,
  });
  if (error) throw error;
}

export async function markNotificacionLeida(id: string, client: SupabaseClient = supabase): Promise<void> {
  const { error } = await client.from('notificaciones').update({ leida: true }).eq('id', id);
  if (error) throw error;
}

export function subscribeToNotificaciones(
  domiciliarioId: string,
  callback: (list: Notificacion[]) => void,
  client: SupabaseClient = supabase,
): () => void {
  async function reload() {
    callback(await listNotificaciones(domiciliarioId, client));
  }
  reload();
  const channel = client
    .channel('notificaciones-changes-' + Math.random().toString(36).slice(2))
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'notificaciones', filter: `domiciliario_id=eq.${domiciliarioId}`,
    }, reload)
    .subscribe();
  return () => { client.removeChannel(channel); };
}
