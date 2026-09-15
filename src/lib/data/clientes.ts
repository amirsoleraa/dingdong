import type { SupabaseClient } from '@supabase/supabase-js';
import { clienteSupabase } from '@/lib/supabase';
import type { ClienteProfile } from '@/types';

function mapRow(row: Record<string, unknown>): ClienteProfile {
  return {
    id: row.id as string,
    nombre: (row.nombre as string) ?? '',
    correo: row.correo as string | undefined,
    telefono: row.telefono as string | undefined,
    favoritos: (row.favoritos as string[]) ?? [],
    createdAt: row.created_at as string | undefined,
  };
}

export async function getOrCreateClienteProfile(
  userId: string,
  defaults: { nombre: string; correo: string; telefono: string },
  client: SupabaseClient = clienteSupabase,
): Promise<ClienteProfile> {
  const { data: existing, error: selErr } = await client.from('clientes').select('*').eq('id', userId).maybeSingle();
  if (selErr) throw selErr;
  if (existing) return mapRow(existing);

  const { error: insErr } = await client.from('clientes').insert({
    id: userId, nombre: defaults.nombre, correo: defaults.correo, telefono: defaults.telefono, favoritos: [],
  });
  if (insErr) throw insErr;
  return { id: userId, nombre: defaults.nombre, correo: defaults.correo, telefono: defaults.telefono, favoritos: [] };
}

export async function updateClienteProfile(
  id: string,
  patch: Partial<Pick<ClienteProfile, 'nombre' | 'telefono' | 'correo' | 'favoritos'>>,
  client: SupabaseClient = clienteSupabase,
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.nombre !== undefined) row.nombre = patch.nombre;
  if (patch.telefono !== undefined) row.telefono = patch.telefono;
  if (patch.correo !== undefined) row.correo = patch.correo;
  if (patch.favoritos !== undefined) row.favoritos = patch.favoritos;
  const { error } = await client.from('clientes').update(row).eq('id', id);
  if (error) throw error;
}
