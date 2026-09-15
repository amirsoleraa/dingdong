import { useState, useEffect } from 'react';
import { Save, RotateCcw } from 'lucide-react';
import { saveConfigColores } from '@/lib/data/config';
import { useAppStore } from '@/stores/useAppStore';
import { applyThemeColors, COLOR_PRESETS } from '@/lib/utils';

const COLOR_VARS: { key: string; label: string; hint: string }[] = [
  { key: 'brand',       label: 'Color principal',    hint: 'Botones, acciones' },
  { key: 'brand-dark',  label: 'Color principal oscuro', hint: 'Hover, estados' },
  { key: 'brand-light', label: 'Color principal claro',  hint: 'Fondos suaves' },
  { key: 'bg',          label: 'Fondo general',      hint: 'Fondo de la app' },
  { key: 'text',        label: 'Color de texto',     hint: 'Texto principal' },
  { key: 'accent',      label: 'Acento',             hint: 'Destacados secundarios' },
];

export function ColorsPanel() {
  const { showToast } = useAppStore();
  const [colors, setColors] = useState<Record<string, string>>({});
  const [activePreset, setActivePreset] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Load current CSS variables
    const root = document.documentElement;
    const current: Record<string, string> = {};
    COLOR_VARS.forEach(v => {
      current[v.key] = root.style.getPropertyValue('--' + v.key).trim() ||
        getComputedStyle(root).getPropertyValue('--' + v.key).trim();
    });
    setColors(current);
  }, []);

  function liveUpdate(key: string, value: string) {
    document.documentElement.style.setProperty('--' + key, value);
    setColors(prev => ({ ...prev, [key]: value }));
    setActivePreset('');
  }

  function applyPreset(name: string) {
    const preset = COLOR_PRESETS[name];
    if (!preset) return;
    applyThemeColors(preset);
    setColors(preset);
    setActivePreset(name);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveConfigColores(colors);
      localStorage.setItem('theme-colors', JSON.stringify(colors));
      showToast('Colores guardados');
    } catch (e) {
      showToast('Error al guardar colores');
    } finally {
      setSaving(false);
    }
  }

  function resetDefaults() {
    applyPreset('fuego');
    showToast('Colores restablecidos al tema por defecto');
  }

  return (
    <div style={{ maxWidth: 600 }}>
      {/* Presets */}
      <div className="admin-card" style={{ marginBottom: 20 }}>
        <div className="admin-card-hdr"><h3>Temas predefinidos</h3></div>
        <div style={{ padding: '16px 20px', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {Object.entries(COLOR_PRESETS).map(([name, preset]) => {
            const LABELS: Record<string, string> = {
              fuego:  '🔥 Fuego',
              cafe:   '☕ Café cálido',
              neutro: '🌑 Gris neutro',
              medio:  '🤎 Café medio',
              crema:  '🍦 Crema',
            };
            return (
              <button
                key={name}
                className={`theme-preset-btn ${activePreset === name ? 'active' : ''}`}
                onClick={() => applyPreset(name)}
              >
                <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
                  {['brand', 'bg', 'surface'].map(k => (
                    <div key={k} style={{ width: 14, height: 14, borderRadius: 4, background: preset[k] }} />
                  ))}
                </div>
                <span>{LABELS[name] ?? name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Color editor */}
      <div className="admin-card" style={{ marginBottom: 20 }}>
        <div className="admin-card-hdr"><h3>Personalizar colores</h3></div>
        <div style={{ padding: '16px 20px' }}>
          <div className="color-editor-grid">
            {COLOR_VARS.map(v => (
              <div key={v.key} className="color-editor-row">
                <div
                  className="color-preview-dot"
                  style={{ background: colors[v.key] || '#ccc' }}
                />
                <div className="color-editor-info">
                  <div className="color-editor-label">{v.label}</div>
                  <div className="color-editor-hint">{v.hint}</div>
                </div>
                <input
                  type="color"
                  className="color-picker-input"
                  value={colors[v.key] || '#000000'}
                  onChange={e => liveUpdate(v.key, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12 }}>
        <button className="btn-s" style={{ flex: 1 }} onClick={resetDefaults}>
          <RotateCcw size={16} style={{ marginRight: 8, verticalAlign: 'middle' }} />
          Restablecer
        </button>
        <button className="btn-p" style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          onClick={handleSave} disabled={saving}>
          <Save size={16} />
          {saving ? 'Guardando...' : 'Guardar colores'}
        </button>
      </div>
    </div>
  );
}
