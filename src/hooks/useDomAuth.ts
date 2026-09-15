import { useState, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { domSupabase, supabaseReady } from '@/lib/supabase';
import { getProfile } from '@/lib/data/profiles';
import { getDomiciliario } from '@/lib/data/domiciliarios';
import type { Domiciliario } from '@/types';

const DOM_EMAIL_DOMAIN = '@dom.barrileros.co';

export interface DomSession {
  user: User;
  domiciliario: Domiciliario;
}

export function useDomAuth() {
  const [session, setSession] = useState<DomSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabaseReady) { setLoading(false); return; }

    async function resolveSession(u: User | null) {
      if (!u) { setSession(null); setLoading(false); return; }
      try {
        const profile = await getProfile(u.id, domSupabase);
        if (profile?.role !== 'domiciliario' || !profile.domiciliarioId) {
          setSession(null);
        } else {
          const dom = await getDomiciliario(profile.domiciliarioId, domSupabase);
          setSession(dom ? { user: u, domiciliario: dom } : null);
        }
      } catch {
        setSession(null);
      }
      setLoading(false);
    }

    domSupabase.auth.getSession().then(({ data }) => resolveSession(data.session?.user ?? null));
    const { data: sub } = domSupabase.auth.onAuthStateChange((_event, s) => resolveSession(s?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn(usuario: string, password: string): Promise<string | null> {
    const email = `${usuario.trim().toLowerCase()}${DOM_EMAIL_DOMAIN}`;
    const { error } = await domSupabase.auth.signInWithPassword({ email, password });
    if (!error) return null;
    if (error.code === 'invalid_credentials') return 'Usuario o contraseña incorrectos';
    return 'Error al ingresar. Intenta de nuevo.';
  }

  async function logOut(): Promise<void> {
    await domSupabase.auth.signOut();
  }

  return { session, loading, signIn, logOut };
}
