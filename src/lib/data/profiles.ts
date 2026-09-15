import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export interface Profile {
  id: string;
  role: 'admin' | 'domiciliario' | 'cliente';
  email?: string;
  domiciliarioId?: string;
}

export async function getProfile(userId: string, client: SupabaseClient = supabase): Promise<Profile | null> {
  const { data, error } = await client.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id, role: data.role, email: data.email ?? undefined, domiciliarioId: data.domiciliario_id ?? undefined };
}

export async function createProfile(input: Profile, client: SupabaseClient = supabase): Promise<void> {
  const { error } = await client.from('profiles').insert({
    id: input.id, role: input.role, email: input.email, domiciliario_id: input.domiciliarioId,
  });
  if (error) throw error;
}
