// ═══════════════════════════════════════════════
// hooks/useAdminInit.ts — Carga admin + realtime de pedidos (Supabase)
// ═══════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { supabaseReady } from '@/lib/supabase';
import { useAppStore } from '@/stores/useAppStore';
import { useAdminStore } from '@/stores/useAdminStore';
import { applyThemeColors } from '@/lib/utils';
import { getConfigMain, getConfigColores, getAdminSettings } from '@/lib/data/config';
import { listCategorias } from '@/lib/data/categorias';
import { listProductos } from '@/lib/data/productos';
import { listCupones } from '@/lib/data/cupones';
import { listNovedades } from '@/lib/data/novedades';
import { listAdicionales } from '@/lib/data/adicionales';
import { listBarrios } from '@/lib/data/barrios';
import { listDomiciliarios } from '@/lib/data/domiciliarios';
import { listPromociones } from '@/lib/data/promociones';
import { subscribeToPedidos } from '@/lib/data/pedidos';

export function useAdminInit() {
  const { setCfg, setProductos, setCategorias, setCupones, setNovedades, setAdicionales, setBarrios, setDomiciliarios, setPromociones, showToast } = useAppStore();
  const { setPedidos, setAdminSettings } = useAdminStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!supabaseReady) {
      setReady(true);
      return;
    }

    async function init() {
      try {
        const [cfg, colores, adminSettings, categorias, productos, cupones, novedades] = await Promise.all([
          getConfigMain(), getConfigColores(), getAdminSettings(),
          listCategorias(), listProductos(), listCupones(), listNovedades(),
        ]);

        setCfg(cfg);
        if (colores) applyThemeColors(colores as unknown as Record<string, string>);
        if (adminSettings) setAdminSettings(adminSettings);
        setCategorias(categorias);
        setProductos(productos);
        setCupones(cupones);
        setNovedades(novedades);

        const [adicionales, barrios, domiciliarios, promociones] = await Promise.allSettled([
          listAdicionales(), listBarrios(), listDomiciliarios(), listPromociones(),
        ]);
        if (adicionales.status === 'fulfilled') setAdicionales(adicionales.value);
        if (barrios.status === 'fulfilled') setBarrios(barrios.value);
        if (domiciliarios.status === 'fulfilled') setDomiciliarios(domiciliarios.value);
        if (promociones.status === 'fulfilled') setPromociones(promociones.value.filter(p => p.activa));
      } catch (e) {
        console.error('Error al inicializar admin:', e);
      }
    }

    init().then(() => setReady(true));

    const unsubscribe = subscribeToPedidos((event, row, oldId, isInitial) => {
      if (event === 'INSERT' && row) {
        setPedidos((prev) => ({ ...prev, [row.id]: row }));
        if (!isInitial) showToast(`🔔 Nuevo pedido #${row.numero}`);
      } else if (event === 'UPDATE' && row) {
        setPedidos((prev) => ({ ...prev, [row.id]: row }));
      } else if (event === 'DELETE' && oldId) {
        setPedidos((prev) => {
          const next = { ...prev };
          delete next[oldId];
          return next;
        });
      }
    });

    return () => unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return ready;
}
