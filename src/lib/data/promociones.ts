import { supabase } from '@/lib/supabase';
import type { Promocion } from '@/types';

function mapRow(row: Record<string, unknown>): Promocion {
  return {
    id: row.id as string,
    nombre: row.nombre as string,
    tipo: row.tipo as Promocion['tipo'],
    activa: row.activa as boolean,
    descripcion: row.descripcion as string | undefined,
    productoAId: row.producto_a_id as string | undefined,
    cantidadA: row.cantidad_a as number | undefined,
    productoBId: row.producto_b_id as string | undefined,
    cantidadB: row.cantidad_b as number | undefined,
    descuentoBPct: row.descuento_b_pct as number | undefined,
    domicilioPct: row.domicilio_pct as number | undefined,
    domicilioGratis: row.domicilio_gratis as boolean | undefined,
    cuponPct: row.cupon_pct as number | undefined,
    createdAt: row.created_at as string | undefined,
  };
}

export async function listPromociones(): Promise<Promocion[]> {
  const { data, error } = await supabase.from('promociones').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function createPromocion(input: Omit<Promocion, 'id' | 'createdAt'>): Promise<string> {
  const { data, error } = await supabase.from('promociones').insert({
    nombre: input.nombre, tipo: input.tipo, activa: input.activa, descripcion: input.descripcion,
    producto_a_id: input.productoAId || null, cantidad_a: input.cantidadA,
    producto_b_id: input.productoBId || null, cantidad_b: input.cantidadB,
    descuento_b_pct: input.descuentoBPct, domicilio_pct: input.domicilioPct,
    domicilio_gratis: input.domicilioGratis, cupon_pct: input.cuponPct,
  }).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function updatePromocion(id: string, patch: Partial<Omit<Promocion, 'id'>>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.nombre !== undefined) row.nombre = patch.nombre;
  if (patch.tipo !== undefined) row.tipo = patch.tipo;
  if (patch.activa !== undefined) row.activa = patch.activa;
  if (patch.descripcion !== undefined) row.descripcion = patch.descripcion;
  if (patch.productoAId !== undefined) row.producto_a_id = patch.productoAId || null;
  if (patch.cantidadA !== undefined) row.cantidad_a = patch.cantidadA;
  if (patch.productoBId !== undefined) row.producto_b_id = patch.productoBId || null;
  if (patch.cantidadB !== undefined) row.cantidad_b = patch.cantidadB;
  if (patch.descuentoBPct !== undefined) row.descuento_b_pct = patch.descuentoBPct;
  if (patch.domicilioPct !== undefined) row.domicilio_pct = patch.domicilioPct;
  if (patch.domicilioGratis !== undefined) row.domicilio_gratis = patch.domicilioGratis;
  if (patch.cuponPct !== undefined) row.cupon_pct = patch.cuponPct;
  const { error } = await supabase.from('promociones').update(row).eq('id', id);
  if (error) throw error;
}

export async function deletePromocion(id: string): Promise<void> {
  const { error } = await supabase.from('promociones').delete().eq('id', id);
  if (error) throw error;
}
