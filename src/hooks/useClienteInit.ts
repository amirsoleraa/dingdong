import { useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { clienteSupabase, supabaseReady } from '@/lib/supabase';
import { getOrCreateClienteProfile } from '@/lib/data/clientes';
import { useClienteStore } from '@/stores/useClienteStore';

/** Sincroniza el perfil `clientes` con la sesión de clienteSupabase — lo crea la primera vez que alguien inicia sesión. */
export function useClienteInit() {
  const { setCliente, setLoading } = useClienteStore();

  useEffect(() => {
    if (!supabaseReady) { setLoading(false); return; }

    async function loadProfile(user: User | null) {
      if (!user) { setCliente(null); setLoading(false); return; }
      try {
        const profile = await getOrCreateClienteProfile(user.id, {
          nombre: (user.user_metadata?.full_name as string) ?? '',
          correo: user.email ?? '',
          telefono: user.phone ?? '',
        });
        setCliente(profile);
      } catch {
        setCliente(null);
      }
      setLoading(false);
    }

    clienteSupabase.auth.getSession().then(({ data }) => loadProfile(data.session?.user ?? null));
    const { data: sub } = clienteSupabase.auth.onAuthStateChange((_event, session) => loadProfile(session?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
