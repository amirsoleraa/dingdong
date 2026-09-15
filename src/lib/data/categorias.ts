import { supabase } from '@/lib/supabase';
import type { Categoria } from '@/types';

function mapRow(row: Record<string, unknown>): Categoria {
  return {
    id: row.id as string,
    nombre: row.nombre as string,
    color: row.color as string,
    emoji: row.emoji as string | undefined,
    imgUrl: row.img_url as string | undefined,
    orden: row.orden as number | undefined,
  };
}

export async function listCategorias(): Promise<Record<string, Categoria>> {
  const { data, error } = await supabase.from('categorias').select('*');
  if (error) throw error;
  const out: Record<string, Categoria> = {};
  for (const row of data ?? []) out[row.id] = mapRow(row);
  return out;
}

export async function createCategoria(input: Omit<Categoria, 'id'>): Promise<string> {
  const { data, error } = await supabase.from('categorias').insert({
    nombre: input.nombre, color: input.color, emoji: input.emoji, img_url: input.imgUrl, orden: input.orden ?? 0,
  }).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function updateCategoria(id: string, patch: Partial<Omit<Categoria, 'id'>>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.nombre !== undefined) row.nombre = patch.nombre;
  if (patch.color !== undefined) row.color = patch.color;
  if (patch.emoji !== undefined) row.emoji = patch.emoji;
  if (patch.imgUrl !== undefined) row.img_url = patch.imgUrl;
  if (patch.orden !== undefined) row.orden = patch.orden;
  const { error } = await supabase.from('categorias').update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteCategoria(id: string): Promise<void> {
  const { error } = await supabase.from('categorias').delete().eq('id', id);
  if (error) throw error;
}
