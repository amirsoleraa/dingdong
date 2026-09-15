import { supabase } from '@/lib/supabase';
import type { Producto, ProductoAdicional } from '@/types';

interface ProductoRow {
  id: string; nombre: string; descripcion: string | null; precio: number; costo: number | null;
  emoji: string | null; img_url: string | null; categoria_id: string | null;
  tipo: Producto['tipo']; ingredientes: string[]; activo: boolean;
  producto_adicionales?: { adicional_id: string; cantidad_max: number }[];
}

function mapRow(row: ProductoRow): Producto {
  return {
    id: row.id,
    nombre: row.nombre,
    descripcion: row.descripcion ?? undefined,
    precio: row.precio,
    costo: row.costo ?? undefined,
    emoji: row.emoji ?? undefined,
    imgUrl: row.img_url ?? undefined,
    categoriaId: row.categoria_id ?? '',
    tipo: row.tipo,
    ingredientes: row.ingredientes ?? [],
    adicionales: (row.producto_adicionales ?? []).map((pa): ProductoAdicional => ({
      adicionalId: pa.adicional_id, cantidadMax: pa.cantidad_max,
    })),
    activo: row.activo,
  };
}

export async function listProductos(): Promise<Record<string, Producto>> {
  const { data, error } = await supabase.from('productos').select('*, producto_adicionales(adicional_id, cantidad_max)');
  if (error) throw error;
  const out: Record<string, Producto> = {};
  for (const row of (data ?? []) as ProductoRow[]) out[row.id] = mapRow(row);
  return out;
}

async function syncAdicionales(productoId: string, adicionales: ProductoAdicional[]): Promise<void> {
  const { error: delErr } = await supabase.from('producto_adicionales').delete().eq('producto_id', productoId);
  if (delErr) throw delErr;
  if (adicionales.length === 0) return;
  const { error: insErr } = await supabase.from('producto_adicionales').insert(
    adicionales.map(a => ({ producto_id: productoId, adicional_id: a.adicionalId, cantidad_max: a.cantidadMax }))
  );
  if (insErr) throw insErr;
}

export async function createProducto(input: Omit<Producto, 'id'>): Promise<string> {
  const { data, error } = await supabase.from('productos').insert({
    nombre: input.nombre, descripcion: input.descripcion, precio: input.precio, costo: input.costo,
    emoji: input.emoji, img_url: input.imgUrl, categoria_id: input.categoriaId || null,
    tipo: input.tipo, ingredientes: input.ingredientes, activo: input.activo,
  }).select('id').single();
  if (error) throw error;
  await syncAdicionales(data.id, input.adicionales);
  return data.id;
}

export async function updateProducto(id: string, patch: Partial<Omit<Producto, 'id'>>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.nombre !== undefined) row.nombre = patch.nombre;
  if (patch.descripcion !== undefined) row.descripcion = patch.descripcion;
  if (patch.precio !== undefined) row.precio = patch.precio;
  if (patch.costo !== undefined) row.costo = patch.costo;
  if (patch.emoji !== undefined) row.emoji = patch.emoji;
  if (patch.imgUrl !== undefined) row.img_url = patch.imgUrl;
  if (patch.categoriaId !== undefined) row.categoria_id = patch.categoriaId || null;
  if (patch.tipo !== undefined) row.tipo = patch.tipo;
  if (patch.ingredientes !== undefined) row.ingredientes = patch.ingredientes;
  if (patch.activo !== undefined) row.activo = patch.activo;
  if (Object.keys(row).length > 0) {
    const { error } = await supabase.from('productos').update(row).eq('id', id);
    if (error) throw error;
  }
  if (patch.adicionales !== undefined) await syncAdicionales(id, patch.adicionales);
}

export async function deleteProducto(id: string): Promise<void> {
  const { error } = await supabase.from('productos').delete().eq('id', id);
  if (error) throw error;
}
