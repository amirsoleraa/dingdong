import { supabase } from '@/lib/supabase';
import type { Novedad } from '@/types';

function mapRow(row: Record<string, unknown>): Novedad {
  return {
    id: row.id as string,
    titulo: row.titulo as string,
    descripcion: row.descripcion as string | undefined,
    imgUrl: row.img_url as string | undefined,
    activa: row.activa as boolean | undefined,
    createdAt: row.created_at as string | undefined,
  };
}

export async function listNovedades(): Promise<Record<string, Novedad>> {
  const { data, error } = await supabase.from('novedades').select('*');
  if (error) throw error;
  const out: Record<string, Novedad> = {};
  for (const row of data ?? []) out[row.id] = mapRow(row);
  return out;
}

export async function createNovedad(input: Omit<Novedad, 'id' | 'createdAt'>): Promise<string> {
  const { data, error } = await supabase.from('novedades').insert({
    titulo: input.titulo, descripcion: input.descripcion, img_url: input.imgUrl, activa: input.activa ?? true,
  }).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function updateNovedad(id: string, patch: Partial<Omit<Novedad, 'id'>>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.titulo !== undefined) row.titulo = patch.titulo;
  if (patch.descripcion !== undefined) row.descripcion = patch.descripcion;
  if (patch.imgUrl !== undefined) row.img_url = patch.imgUrl;
  if (patch.activa !== undefined) row.activa = patch.activa;
  const { error } = await supabase.from('novedades').update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteNovedad(id: string): Promise<void> {
  const { error } = await supabase.from('novedades').delete().eq('id', id);
  if (error) throw error;
}
