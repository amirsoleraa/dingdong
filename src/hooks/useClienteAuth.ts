// ═══════════════════════════════════════════════
// hooks/useClienteAuth.ts — Supabase Auth del cliente (login opcional)
// ═══════════════════════════════════════════════

import { useState, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { clienteSupabase, supabaseReady } from '@/lib/supabase';

const AUTH_ERRORS: Record<string, string> = {
  invalid_credentials: 'Correo o contraseña incorrectos',
  email_not_confirmed: 'Debes confirmar tu correo antes de ingresar',
  user_already_exists: 'Ya existe una cuenta con ese correo',
  weak_password: 'La contraseña debe tener al menos 6 caracteres',
  over_request_rate_limit: 'Demasiados intentos. Intenta más tarde',
  validation_failed: 'Correo electrónico inválido',
};

export function useClienteAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabaseReady) { setLoading(false); return; }
    clienteSupabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = clienteSupabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn(email: string, password: string): Promise<string | null> {
    const { error } = await clienteSupabase.auth.signInWithPassword({ email, password });
    if (!error) return null;
    return AUTH_ERRORS[error.code ?? ''] ?? 'Error al ingresar. Intenta de nuevo.';
  }

  async function signUp(nombre: string, email: string, password: string): Promise<string | null> {
    const { error } = await clienteSupabase.auth.signUp({
      email, password, options: { data: { full_name: nombre.trim() } },
    });
    if (!error) return null;
    return AUTH_ERRORS[error.code ?? ''] ?? 'Error al crear la cuenta. Intenta de nuevo.';
  }

  /**
   * Supabase usa redirect (no popup como Firebase signInWithPopup): esta llamada
   * envía al navegador a Google y de vuelta a la misma página. Un error aquí solo
   * cubre fallos inmediatos (ej. provider mal configurado) — el éxito se observa
   * después del redirect, vía el listener de onAuthStateChange de arriba.
   */
  async function signInWithGoogle(): Promise<string | null> {
    const { error } = await clienteSupabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/login' },
    });
    if (!error) return null;
    console.error('[signInWithGoogle]', error);
    return `Error al ingresar con Google (${error.code ?? 'desconocido'})`;
  }

  async function logOut(): Promise<void> {
    await clienteSupabase.auth.signOut();
  }

  return { user, loading, signIn, signUp, signInWithGoogle, logOut };
}
