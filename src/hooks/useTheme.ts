// ═══════════════════════════════════════════════
// hooks/useTheme.ts — Aplica colores CSS desde Firestore
// ═══════════════════════════════════════════════

import { useEffect } from 'react';
import { getConfigColores } from '@/lib/data/config';
import { applyThemeColors } from '@/lib/utils';

export function useTheme() {
  useEffect(() => {
    async function loadColors() {
      try {
        const colores = await getConfigColores();
        if (colores) {
          applyThemeColors(colores as unknown as Record<string, string>);
          return;
        }
      } catch (_) {}
      // Fallback a localStorage
      try {
        const saved = localStorage.getItem('theme-colors');
        if (saved) applyThemeColors(JSON.parse(saved));
      } catch (_) {}
    }
    loadColors();
  }, []);
}
