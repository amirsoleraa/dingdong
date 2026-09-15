// ═══════════════════════════════════════════════
// lib/supabase.ts — Supabase init con VITE_* env vars
//
// Reemplaza lib/firebase.ts. Igual que con las 3 apps de Firebase, se crean
// 3 clientes con `storageKey` distinto para que las sesiones de admin,
// domiciliario y cliente no colisionen en el mismo navegador (Supabase
// guarda la sesión en localStorage bajo esa key).
// ═══════════════════════════════════════════════

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** true sólo cuando Supabase se inicializó correctamente con credenciales reales */
export const supabaseReady = Boolean(supabaseUrl && supabaseAnonKey);

function makeClient(storageKey: string): SupabaseClient {
  return createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
    auth: { storageKey, persistSession: true, autoRefreshToken: true },
  });
}

if (!supabaseReady) {
  console.warn('[Supabase] Sin credenciales — la app corre en modo sin conexión.');
}

/** Cliente del panel admin */
export const supabase = makeClient('sb-admin-auth');
/** Cliente aislado del portal de domiciliarios */
export const domSupabase = makeClient('sb-domiciliario-auth');
/** Cliente aislado de la cuenta de cliente (tienda) */
export const clienteSupabase = makeClient('sb-cliente-auth');
