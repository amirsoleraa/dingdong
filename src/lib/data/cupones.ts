import { supabase } from '@/lib/supabase';
import type { Cupon } from '@/types';

function mapRow(row: Record<string, unknown>): Cupon {
  return {
    id: row.codigo as string,
    codigo: row.codigo as string,
    tipo: row.tipo as Cupon['tipo'],
    valor: row.valor as number,
    limite: row.limite as number,
    usos: row.usos as number,
    activo: row.activo as boolean,
  };
}

export async function getCuponByCodigo(codigo: string): Promise<Cupon | null> {
  const { data, error } = await supabase.from('cupones').select('*').eq('codigo', codigo).maybeSingle();
  if (error) throw error;
  return data ? mapRow(data) : null;
}

export async function listCupones(): Promise<Record<string, Cupon>> {
  const { data, error } = await supabase.from('cupones').select('*');
  if (error) throw error;
  const out: Record<string, Cupon> = {};
  for (const row of data ?? []) out[row.codigo] = mapRow(row);
  return out;
}

export async function createCupon(input: Omit<Cupon, 'id'>): Promise<void> {
  const { error } = await supabase.from('cupones').insert({
    codigo: input.codigo, tipo: input.tipo, valor: input.valor, limite: input.limite,
    usos: input.usos, activo: input.activo,
  });
  if (error) throw error;
}

export interface CuponPromoInput {
  codigo: string;
  valorPct: number;
  clienteNombre: string;
  clienteTel: string;
  pedidoNumero: string;
  promoNombre: string;
  promoId: string;
}

/** Cupón autogenerado por una promoción compra_cupon — insert público (anon incluido). */
export async function createCuponDePromo(input: CuponPromoInput): Promise<void> {
  const { error } = await supabase.from('cupones').insert({
    codigo: input.codigo, tipo: 'porcentaje', valor: input.valorPct, activo: true, usos: 0, limite: 1,
    cliente_nombre: input.clienteNombre, cliente_tel: input.clienteTel, pedido_numero: input.pedidoNumero,
    promo_nombre: input.promoNombre, promo_id: input.promoId, origen: 'promo',
  });
  if (error) throw error;
}

export async function updateCupon(codigo: string, patch: Partial<Omit<Cupon, 'id' | 'codigo'>>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.tipo !== undefined) row.tipo = patch.tipo;
  if (patch.valor !== undefined) row.valor = patch.valor;
  if (patch.limite !== undefined) row.limite = patch.limite;
  if (patch.usos !== undefined) row.usos = patch.usos;
  if (patch.activo !== undefined) row.activo = patch.activo;
  const { error } = await supabase.from('cupones').update(row).eq('codigo', codigo);
  if (error) throw error;
}

export async function deleteCupon(codigo: string): Promise<void> {
  const { error } = await supabase.from('cupones').delete().eq('codigo', codigo);
  if (error) throw error;
}
