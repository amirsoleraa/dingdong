// ═══════════════════════════════════════════════
// hooks/useAuth.ts — Supabase Auth state (panel admin)
// ═══════════════════════════════════════════════

import { useState, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase, supabaseReady } from '@/lib/supabase';

const AUTH_ERRORS: Record<string, string> = {
  invalid_credentials: 'Correo o contraseña incorrectos',
  email_not_confirmed: 'Debes confirmar tu correo antes de ingresar',
  over_request_rate_limit: 'Demasiados intentos. Intenta más tarde',
};

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabaseReady) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn(email: string, password: string): Promise<string | null> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) return null;
    return AUTH_ERRORS[error.code ?? ''] ?? 'Error al ingresar. Intenta de nuevo.';
  }

  async function logOut(): Promise<void> {
    await supabase.auth.signOut();
  }

  return { user, loading, signIn, logOut };
}
