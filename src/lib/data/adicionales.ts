import { supabase } from '@/lib/supabase';
import type { Adicional } from '@/types';

function mapRow(row: Record<string, unknown>): Adicional {
  return {
    id: row.id as string,
    nombre: row.nombre as string,
    precio: row.precio as number,
    costo: row.costo as number,
    activo: row.activo as boolean,
  };
}

export async function listAdicionales(): Promise<Record<string, Adicional>> {
  const { data, error } = await supabase.from('adicionales').select('*');
  if (error) throw error;
  const out: Record<string, Adicional> = {};
  for (const row of data ?? []) out[row.id] = mapRow(row);
  return out;
}

export async function createAdicional(input: Omit<Adicional, 'id'>): Promise<string> {
  const { data, error } = await supabase.from('adicionales').insert({
    nombre: input.nombre, precio: input.precio, costo: input.costo, activo: input.activo,
  }).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function updateAdicional(id: string, patch: Partial<Omit<Adicional, 'id'>>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.nombre !== undefined) row.nombre = patch.nombre;
  if (patch.precio !== undefined) row.precio = patch.precio;
  if (patch.costo !== undefined) row.costo = patch.costo;
  if (patch.activo !== undefined) row.activo = patch.activo;
  const { error } = await supabase.from('adicionales').update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteAdicional(id: string): Promise<void> {
  const { error } = await supabase.from('adicionales').delete().eq('id', id);
  if (error) throw error;
}
