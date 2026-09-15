import { useEffect } from 'react';
import { supabaseReady } from '@/lib/supabase';
import { useAppStore } from '@/stores/useAppStore';
import { applyThemeColors } from '@/lib/utils';
import { getConfigMain, getConfigColores } from '@/lib/data/config';
import { listCategorias } from '@/lib/data/categorias';
import { listProductos } from '@/lib/data/productos';
import { listAdicionales } from '@/lib/data/adicionales';
import { listNovedades } from '@/lib/data/novedades';
import { listPublicidades } from '@/lib/data/publicidades';
import { listBarrios } from '@/lib/data/barrios';
import { listDomiciliarios } from '@/lib/data/domiciliarios';
import { listPromociones } from '@/lib/data/promociones';

/**
 * Carga catálogo/config público al montar (fetch-once, no realtime).
 * Datos de baja frecuencia de cambio para la Fase 1 — se puede añadir
 * `postgres_changes` encima más adelante sin rehacer esto.
 */
export function useFirebaseInit() {
  const { setCfg, setProductos, setCategorias, setNovedades, setPublicidades, setAdicionales, setBarrios, setDomiciliarios, setPromociones, setLoading } = useAppStore();

  useEffect(() => {
    if (!supabaseReady) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const [cfg, colores] = await Promise.all([getConfigMain(), getConfigColores()]);
        if (cancelled) return;
        setCfg(cfg);
        if (colores) {
          applyThemeColors(colores as unknown as Record<string, string>);
        } else {
          try {
            const saved = localStorage.getItem('theme-colors');
            if (saved) applyThemeColors(JSON.parse(saved));
          } catch { /* noop */ }
        }
      } catch {
        try {
          const saved = localStorage.getItem('theme-colors');
          if (saved) applyThemeColors(JSON.parse(saved));
        } catch { /* noop */ }
      }

      try {
        const [categorias, productos] = await Promise.all([listCategorias(), listProductos()]);
        if (cancelled) return;
        setCategorias(categorias);
        setProductos(productos);
      } catch { /* noop */ } finally {
        if (!cancelled) setTimeout(() => setLoading(false), 500);
      }

      try { if (!cancelled) setAdicionales(await listAdicionales()); } catch { /* noop */ }
      try { if (!cancelled) setNovedades(await listNovedades()); } catch { /* noop */ }
      try {
        if (cancelled) return;
        const pubs = await listPublicidades();
        pubs.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
        setPublicidades(pubs.filter(p => p.activa));
      } catch { /* noop */ }
      try { if (!cancelled) setBarrios(await listBarrios()); } catch { /* noop */ }
      try { if (!cancelled) setDomiciliarios(await listDomiciliarios()); } catch { /* noop */ }
      try {
        if (cancelled) return;
        const promos = await listPromociones();
        setPromociones(promos.filter(p => p.activa));
      } catch { /* noop */ }
    }

    load();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
