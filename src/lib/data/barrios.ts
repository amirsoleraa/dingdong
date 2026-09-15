import { supabase } from '@/lib/supabase';
import type { Barrio } from '@/types';

function mapRow(row: Record<string, unknown>): Barrio {
  return {
    id: row.id as string,
    nombre: row.nombre as string,
    activo: row.activo as boolean,
    orden: row.orden as number | undefined,
  };
}

export async function listBarrios(): Promise<Record<string, Barrio>> {
  const { data, error } = await supabase.from('barrios').select('*');
  if (error) throw error;
  const out: Record<string, Barrio> = {};
  for (const row of data ?? []) out[row.id] = mapRow(row);
  return out;
}

export async function createBarrio(input: Omit<Barrio, 'id'>): Promise<string> {
  const { data, error } = await supabase.from('barrios').insert({
    nombre: input.nombre, activo: input.activo, orden: input.orden ?? 0,
  }).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function updateBarrio(id: string, patch: Partial<Omit<Barrio, 'id'>>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.nombre !== undefined) row.nombre = patch.nombre;
  if (patch.activo !== undefined) row.activo = patch.activo;
  if (patch.orden !== undefined) row.orden = patch.orden;
  const { error } = await supabase.from('barrios').update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteBarrio(id: string): Promise<void> {
  const { error } = await supabase.from('barrios').delete().eq('id', id);
  if (error) throw error;
}

export async function createBarriosBulk(inputs: Omit<Barrio, 'id'>[]): Promise<Record<string, Barrio>> {
  const { data, error } = await supabase.from('barrios')
    .insert(inputs.map(b => ({ nombre: b.nombre, activo: b.activo, orden: b.orden ?? 0 })))
    .select('*');
  if (error) throw error;
  const out: Record<string, Barrio> = {};
  for (const row of data ?? []) out[row.id] = mapRow(row);
  return out;
}

export async function deleteBarriosBulk(ids: string[]): Promise<void> {
  const { error } = await supabase.from('barrios').delete().in('id', ids);
  if (error) throw error;
}
