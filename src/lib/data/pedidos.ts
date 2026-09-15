import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Pedido } from '@/types';

interface PedidoRow {
  id: string; numero: string; estado: Pedido['estado'];
  cliente_nombre: string | null; cliente_correo: string | null; cliente_tel: string | null;
  cliente_dir: string | null; cliente_barrio: string | null; cliente_comp: string | null; cliente_recibe: string | null;
  cliente_uid: string | null;
  items: Pedido['items']; subtotal: number; domicilio: number; descuento: number; total: number;
  cupon: string | null; mensaje_confirmacion: string | null; location: Pedido['location'];
  ruta_nombre: string | null; repartidor_nombre: string | null; domiciliario_id: string | null;
  nota_pendiente: string | null; es_manual: boolean | null; notas: string | null;
  promos_aplicadas: Pedido['promosAplicadas']; verificacion: Pedido['verificacion'];
  created_at: string;
}

export function mapRow(row: PedidoRow): Pedido {
  return {
    id: row.id,
    numero: row.numero,
    estado: row.estado,
    cliente: {
      nombre: row.cliente_nombre ?? '',
      correo: row.cliente_correo ?? undefined,
      tel: row.cliente_tel ?? undefined,
      dir: row.cliente_dir ?? undefined,
      barrio: row.cliente_barrio ?? undefined,
      comp: row.cliente_comp ?? undefined,
      recibe: row.cliente_recibe ?? undefined,
    },
    clienteUid: row.cliente_uid,
    items: row.items,
    subtotal: row.subtotal,
    domicilio: row.domicilio,
    descuento: row.descuento,
    total: row.total,
    cupon: row.cupon,
    mensajeConfirmacion: row.mensaje_confirmacion ?? '',
    location: row.location,
    createdAt: row.created_at,
    rutaNombre: row.ruta_nombre ?? undefined,
    repartidorNombre: row.repartidor_nombre ?? undefined,
    domiciliarioId: row.domiciliario_id ?? undefined,
    notaPendiente: row.nota_pendiente ?? undefined,
    esManual: row.es_manual ?? undefined,
    notas: row.notas ?? undefined,
    promosAplicadas: row.promos_aplicadas ?? undefined,
    verificacion: row.verificacion ?? undefined,
  };
}

export async function listPedidos(client: SupabaseClient = supabase): Promise<Record<string, Pedido>> {
  const { data, error } = await client.from('pedidos').select('*');
  if (error) throw error;
  const out: Record<string, Pedido> = {};
  for (const row of (data ?? []) as PedidoRow[]) out[row.id] = mapRow(row);
  return out;
}

export async function listPedidosByIds(ids: string[], client: SupabaseClient = supabase): Promise<Record<string, Pedido>> {
  if (ids.length === 0) return {};
  const { data, error } = await client.from('pedidos').select('*').in('id', ids);
  if (error) throw error;
  const out: Record<string, Pedido> = {};
  for (const row of (data ?? []) as PedidoRow[]) out[row.id] = mapRow(row);
  return out;
}

export async function getPedidosByClienteUid(uid: string, client: SupabaseClient): Promise<Pedido[]> {
  const { data, error } = await client.from('pedidos').select('*').eq('cliente_uid', uid).order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as PedidoRow[]).map(mapRow);
}

/**
 * Inserta un pedido de invitado. El id se genera en el cliente (crypto.randomUUID())
 * y NO se pide .select() en el insert: bajo RLS, un invitado no tiene permiso de
 * LEER el pedido que acaba de crear (solo admin/domiciliario/dueño pueden leer),
 * y Postgres evalúa esa misma política de lectura sobre la fila del RETURNING.
 */
export async function createPedido(input: Omit<Pedido, 'id' | 'createdAt' | 'verificacion'>): Promise<Pedido> {
  const id = crypto.randomUUID();
  const row = {
    id,
    numero: input.numero,
    estado: input.estado,
    cliente_nombre: input.cliente.nombre,
    cliente_correo: input.cliente.correo,
    cliente_tel: input.cliente.tel,
    cliente_dir: input.cliente.dir,
    cliente_barrio: input.cliente.barrio,
    cliente_comp: input.cliente.comp,
    cliente_recibe: input.cliente.recibe,
    cliente_uid: input.clienteUid ?? null,
    items: input.items,
    subtotal: input.subtotal,
    domicilio: input.domicilio,
    descuento: input.descuento,
    total: input.total,
    cupon: input.cupon,
    mensaje_confirmacion: input.mensajeConfirmacion,
    location: input.location ?? null,
    promos_aplicadas: input.promosAplicadas ?? null,
  };
  const { error } = await supabase.from('pedidos').insert(row);
  if (error) throw error;
  return { ...input, id, createdAt: new Date().toISOString() };
}

const UPDATABLE_FIELDS: Record<string, string> = {
  estado: 'estado', rutaNombre: 'ruta_nombre', repartidorNombre: 'repartidor_nombre',
  domiciliarioId: 'domiciliario_id', notaPendiente: 'nota_pendiente',
};

export async function updatePedido(id: string, patch: Partial<Pedido>, client: SupabaseClient = supabase): Promise<void> {
  const row: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(UPDATABLE_FIELDS)) {
    if (key in patch) row[column] = (patch as Record<string, unknown>)[key];
  }
  if (Object.keys(row).length === 0) return;
  const { error } = await client.from('pedidos').update(row).eq('id', id);
  if (error) throw error;
}

export async function deletePedido(id: string, client: SupabaseClient = supabase): Promise<void> {
  const { error } = await client.from('pedidos').delete().eq('id', id);
  if (error) throw error;
}

export async function deletePedidosBulk(ids: string[], client: SupabaseClient = supabase): Promise<void> {
  const { error } = await client.from('pedidos').delete().in('id', ids);
  if (error) throw error;
}

type PedidoChangeCallback = (event: 'INSERT' | 'UPDATE' | 'DELETE', row: Pedido | null, oldId: string | null) => void;

export function subscribeToPedidos(callback: PedidoChangeCallback, client: SupabaseClient = supabase): () => void {
  const channel = client
    .channel('pedidos-changes-' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, (payload) => {
      if (payload.eventType === 'DELETE') {
        callback('DELETE', null, (payload.old as { id: string }).id);
      } else {
        callback(payload.eventType as 'INSERT' | 'UPDATE', mapRow(payload.new as PedidoRow), null);
      }
    })
    .subscribe();
  return () => { client.removeChannel(channel); };
}
