import { useState, useEffect } from 'react';
import { Save, Upload } from 'lucide-react';
import { saveConfigMain, saveAdminSettings } from '@/lib/data/config';
import { uploadImage } from '@/lib/cloudinary';
import { useAppStore } from '@/stores/useAppStore';
import { useAdminStore } from '@/stores/useAdminStore';
import { Toggle } from '@/components/ui/Toggle';
import { ColorsPanel } from './ColorsPanel';
import type { CamposFormulario } from '@/types';

type ConfigTab = 'general' | 'colores';

function tabStyle(active: boolean): React.CSSProperties {
  return {
    padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontSize: 14, fontWeight: 600, fontFamily: 'inherit', transition: 'all .15s',
    background: active ? 'var(--surface)' : 'transparent',
    color: active ? 'var(--text)' : 'var(--text2)',
    boxShadow: active ? '0 1px 4px rgba(0,0,0,.1)' : 'none',
  };
}

const CAMPOS_CONFIG: { key: keyof CamposFormulario; label: string; desc: string }[] = [
  { key: 'correo', label: 'Correo electrónico', desc: 'Para enviar confirmación por email' },
  { key: 'tel',    label: 'Teléfono',           desc: 'Número de contacto del cliente' },
  { key: 'dir',    label: 'Dirección de entrega', desc: 'Dirección física de domicilio' },
  { key: 'barrio', label: 'Barrio',             desc: 'Barrio o sector del cliente' },
  { key: 'comp',   label: 'Apto / Torre / Referencia', desc: 'Complemento de la dirección' },
  { key: 'recibe', label: '¿Quién recibe?',     desc: 'Persona diferente al comprador' },
];

const DEFAULT_CAMPOS: CamposFormulario = { correo: true, tel: true, dir: true, barrio: true, comp: true, recibe: true };

export function ConfigPanel() {
  const { cfg, setCfg, showToast } = useAppStore();
  const { adminSettings, setAdminSettings } = useAdminStore();
  const [nombre, setNombre]     = useState(cfg.nombreComercio);
  const [emoji, setEmoji]       = useState(cfg.logoEmoji);
  const [logoUrl, setLogoUrl]   = useState(cfg.logoUrl);
  const [mensaje, setMensaje]   = useState(cfg.mensajeConfirmacion);
  const [whatsapp, setWhatsapp] = useState(cfg.whatsappNumero ?? '');
  const [historialPin, setHistorialPin] = useState(adminSettings?.historialPin ?? '');
  const [adminPin, setAdminPin] = useState(adminSettings?.adminPin ?? '');
  const [mapCountry, setMapCountry] = useState(cfg.mapCountryCode ?? 'co');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState(cfg.logoUrl);
  const [saving, setSaving]     = useState(false);
  const [campos, setCampos]     = useState<CamposFormulario>({ ...DEFAULT_CAMPOS, ...(cfg.camposFormulario ?? {}) });
  const [savingCampos, setSavingCampos] = useState(false);
  const [tab, setTab] = useState<ConfigTab>('general');

  useEffect(() => {
    setNombre(cfg.nombreComercio);
    setEmoji(cfg.logoEmoji);
    setLogoUrl(cfg.logoUrl);
    setLogoPreview(cfg.logoUrl);
    setMensaje(cfg.mensajeConfirmacion);
    setWhatsapp(cfg.whatsappNumero ?? '');
    setMapCountry(cfg.mapCountryCode ?? 'co');
    setCampos({ ...DEFAULT_CAMPOS, ...(cfg.camposFormulario ?? {}) });
  }, [cfg]);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  async function handleSave() {
    if (!nombre.trim()) { showToast('El nombre del negocio es obligatorio', 'error'); return; }
    setSaving(true);
    try {
      let finalLogoUrl = logoUrl;
      if (logoFile) {
        finalLogoUrl = await uploadImage(logoFile, 'logo');
      }

      const updates = {
        nombreComercio: nombre.trim(),
        logoEmoji: emoji,
        logoUrl: finalLogoUrl,
        mensajeConfirmacion: mensaje.trim(),
        whatsappNumero: whatsapp.replace(/\D/g, ''),
        mapCountryCode: mapCountry.trim().toLowerCase() || 'co',
      };

      const pinUpdates = {
        historialPin: historialPin.trim(),
        adminPin: adminPin.trim(),
      };

      await Promise.all([
        saveConfigMain(updates),
        saveAdminSettings(pinUpdates),
      ]);
      setCfg(updates);
      setAdminSettings(pinUpdates);
      setLogoFile(null);
      showToast('Configuración guardada', 'success');
    } catch (e) {
      showToast('Error al guardar configuración', 'error');
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveCampos() {
    setSavingCampos(true);
    try {
      await saveConfigMain({ camposFormulario: campos });
      setCfg({ camposFormulario: campos });
      showToast('Campos actualizados', 'success');
    } catch (e) {
      showToast('Error al guardar', 'error');
      console.error(e);
    } finally {
      setSavingCampos(false);
    }
  }

  return (
    <div style={{ maxWidth: 620 }}>
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, background: 'var(--bg2)', padding: 4, borderRadius: 10, border: '1px solid var(--border)', width: 'fit-content' }}>
        <button style={tabStyle(tab === 'general')} onClick={() => setTab('general')}>General</button>
        <button style={tabStyle(tab === 'colores')} onClick={() => setTab('colores')}>Colores</button>
      </div>

      {tab === 'colores' && <ColorsPanel />}

      {tab === 'general' && <>
      <div className="admin-card">
        <div className="admin-card-hdr">
          <h3>Configuración del negocio</h3>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ width: 72, height: 72, borderRadius: 18, margin: '0 auto 10px', background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, overflow: 'hidden', boxShadow: '0 4px 20px rgba(244,82,30,.4)' }}>
              {logoPreview
                ? <img src={logoPreview} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span>{emoji}</span>
              }
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--brand)', cursor: 'pointer', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--brand-light)', background: 'var(--brand-light)' }}>
              <Upload size={14} />
              Subir logo
              <input type="file" accept="image/*" onChange={handleLogoChange} style={{ display: 'none' }} />
            </label>
          </div>

          <div className="f-field">
            <label>Nombre del negocio *</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Asados al Barril" />
          </div>
          <div className="f-field">
            <label>Emoji del logo (si no hay imagen)</label>
            <input value={emoji} onChange={e => setEmoji(e.target.value)} placeholder="🔥" />
          </div>
          <div className="f-field">
            <label>Número de WhatsApp</label>
            <input
              value={whatsapp}
              onChange={e => setWhatsapp(e.target.value)}
              placeholder="573144939678"
            />
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
              Código de país + número, sin espacios ni «+». Ej: 573001234567
            </div>
            {whatsapp.replace(/\D/g, '').length >= 10 && (
              <a
                href={`https://api.whatsapp.com/send/?phone=${whatsapp.replace(/\D/g, '')}&text=${encodeURIComponent('¡Prueba del botón de confirmación!')}&type=phone_number&app_absent=0`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 13, color: '#25D366', fontWeight: 600, textDecoration: 'none' }}
              >
                ✓ Número válido — probar enlace
              </a>
            )}
          </div>
          <div className="f-field">
            <label>Mensaje de confirmación del pedido</label>
            <textarea value={mensaje} onChange={e => setMensaje(e.target.value)} rows={3} placeholder="Tu pedido está siendo preparado..." style={{ resize: 'none' }} />
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
              Este mensaje aparece en el recibo y en el email de confirmación.
            </div>
          </div>
          <div className="f-field">
            <label>PIN del historial</label>
            <input
              type="password"
              value={historialPin}
              onChange={e => setHistorialPin(e.target.value)}
              placeholder="Ej: 1234"
              maxLength={8}
            />
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
              Se solicita para editar registros en el Historial de pedidos.
            </div>
          </div>
          <div className="f-field">
            <label>PIN de confirmación de pedidos</label>
            <input
              type="password"
              value={adminPin}
              onChange={e => setAdminPin(e.target.value)}
              placeholder="Ej: 9999"
              maxLength={8}
            />
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
              Se solicita al marcar pedidos como entregados o al eliminarlos.
            </div>
          </div>
          <div className="f-field">
            <label>País para búsqueda en el mapa</label>
            <input
              value={mapCountry}
              onChange={e => setMapCountry(e.target.value)}
              placeholder="co"
              maxLength={2}
              style={{ textTransform: 'lowercase' }}
            />
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
              Código ISO de 2 letras: co (Colombia), mx (México), ar (Argentina), us (EE.UU.)…
            </div>
          </div>

          <button className="btn-p" onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 }}>
            <Save size={16} />
            {saving ? 'Guardando...' : 'Guardar configuración'}
          </button>
        </div>
      </div>
      <div className="admin-card" style={{ marginTop: 20 }}>
        <div className="admin-card-hdr">
          <h3>Campos del formulario de entrega</h3>
        </div>
        <div style={{ padding: '4px 20px 16px' }}>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
            El campo <strong>Nombre completo</strong> siempre es obligatorio. Los demás son configurables.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {CAMPOS_CONFIG.map(({ key, label, desc }) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{desc}</div>
                </div>
                <Toggle
                  value={campos[key] !== false}
                  onChange={v => setCampos(prev => ({ ...prev, [key]: v }))}
                />
              </div>
            ))}
          </div>
          <button className="btn-p" onClick={handleSaveCampos} disabled={savingCampos} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16 }}>
            <Save size={16} />
            {savingCampos ? 'Guardando...' : 'Guardar campos'}
          </button>
        </div>
      </div>
      </>}
    </div>
  );
}
