import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Domiciliario } from '@/types';

function mapRow(row: Record<string, unknown>): Domiciliario {
  return {
    id: row.id as string,
    nombre: row.nombre as string,
    tel: row.tel as string | undefined,
    activo: row.activo as boolean,
    pagoBase: row.pago_base as number | undefined,
    usuario: row.usuario as string | undefined,
    uid: row.uid as string | undefined,
  };
}

export async function listDomiciliarios(client: SupabaseClient = supabase): Promise<Record<string, Domiciliario>> {
  const { data, error } = await client.from('domiciliarios').select('*');
  if (error) throw error;
  const out: Record<string, Domiciliario> = {};
  for (const row of data ?? []) out[row.id] = mapRow(row);
  return out;
}

export async function getDomiciliario(id: string, client: SupabaseClient = supabase): Promise<Domiciliario | null> {
  const { data, error } = await client.from('domiciliarios').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? mapRow(data) : null;
}

export async function createDomiciliario(input: Omit<Domiciliario, 'id'>): Promise<string> {
  const { data, error } = await supabase.from('domiciliarios').insert({
    nombre: input.nombre, tel: input.tel, activo: input.activo, pago_base: input.pagoBase,
    usuario: input.usuario, uid: input.uid,
  }).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function updateDomiciliario(id: string, patch: Partial<Omit<Domiciliario, 'id'>>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.nombre !== undefined) row.nombre = patch.nombre;
  if (patch.tel !== undefined) row.tel = patch.tel;
  if (patch.activo !== undefined) row.activo = patch.activo;
  if (patch.pagoBase !== undefined) row.pago_base = patch.pagoBase;
  if (patch.usuario !== undefined) row.usuario = patch.usuario;
  if (patch.uid !== undefined) row.uid = patch.uid;
  const { error } = await supabase.from('domiciliarios').update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteDomiciliario(id: string): Promise<void> {
  const { error } = await supabase.from('domiciliarios').delete().eq('id', id);
  if (error) throw error;
}
