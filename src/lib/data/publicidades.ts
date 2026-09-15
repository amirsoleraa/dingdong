import { supabase } from '@/lib/supabase';
import type { Publicidad } from '@/types';

function mapRow(row: Record<string, unknown>): Publicidad {
  return {
    id: row.id as string,
    titulo: row.titulo as string,
    descripcion: row.descripcion as string | undefined,
    imgUrl: row.img_url as string | undefined,
    activa: row.activa as boolean,
    orden: row.orden as number,
    createdAt: row.created_at as string | undefined,
  };
}

export async function listPublicidades(): Promise<Publicidad[]> {
  const { data, error } = await supabase.from('publicidades').select('*');
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function createPublicidad(input: Omit<Publicidad, 'id' | 'createdAt'>): Promise<string> {
  const { data, error } = await supabase.from('publicidades').insert({
    titulo: input.titulo, descripcion: input.descripcion, img_url: input.imgUrl,
    activa: input.activa, orden: input.orden,
  }).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function updatePublicidad(id: string, patch: Partial<Omit<Publicidad, 'id'>>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.titulo !== undefined) row.titulo = patch.titulo;
  if (patch.descripcion !== undefined) row.descripcion = patch.descripcion;
  if (patch.imgUrl !== undefined) row.img_url = patch.imgUrl;
  if (patch.activa !== undefined) row.activa = patch.activa;
  if (patch.orden !== undefined) row.orden = patch.orden;
  const { error } = await supabase.from('publicidades').update(row).eq('id', id);
  if (error) throw error;
}

export async function deletePublicidad(id: string): Promise<void> {
  const { error } = await supabase.from('publicidades').delete().eq('id', id);
  if (error) throw error;
}

export async function reorderPublicidades(items: { id: string; orden: number }[]): Promise<void> {
  const results = await Promise.all(
    items.map(({ id, orden }) => supabase.from('publicidades').update({ orden }).eq('id', id))
  );
  const failed = results.find(r => r.error);
  if (failed?.error) throw failed.error;
}
