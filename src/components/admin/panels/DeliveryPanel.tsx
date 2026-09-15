import { useState, useEffect, useRef } from 'react';
import { Truck, Save, MapPin, Loader } from 'lucide-react';
import { saveConfigMain, getDeliverySettings, saveDeliverySettings } from '@/lib/data/config';
import { useAppStore } from '@/stores/useAppStore';
import { Toggle } from '@/components/ui/Toggle';
import { loadGoogleMaps } from '@/lib/googleMaps';
import { fmtPrice } from '@/lib/utils';

// ─── Sub-componente: selector de origen (mapa + autocomplete) ────────────────
// Solo se monta cuando Google Maps ya está cargado, por eso el useEffect
// puede usar deps vacíos sin riesgo de timing.
interface OriginPickerProps {
  initialLat: number;
  initialLng: number;
  initialAddress: string;
  onUpdate: (lat: number, lng: number, address: string) => void;
}

function OriginPicker({ initialLat, initialLng, initialAddress, onUpdate }: OriginPickerProps) {
  const mapRef  = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!mapRef.current || !inputRef.current) return;

    const gm  = (window as any).google.maps;
    const center = initialLat && initialLng
      ? { lat: initialLat, lng: initialLng }
      : { lat: 10.3910, lng: -75.4794 }; // Cartagena por defecto

    const map = new gm.Map(mapRef.current, {
      center,
      zoom: initialLat ? 15 : 12,
      disableDefaultUI: true,
      zoomControl: true,
      streetViewControl: false,
    });

    const marker = new gm.Marker({ position: center, map, draggable: true });

    marker.addListener('dragend', (e: any) => {
      onUpdate(e.latLng.lat(), e.latLng.lng(), inputRef.current?.value ?? '');
    });

    map.addListener('click', (e: any) => {
      marker.setPosition(e.latLng);
      onUpdate(e.latLng.lat(), e.latLng.lng(), inputRef.current?.value ?? '');
    });

    const ac = new gm.places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: 'co' },
      fields: ['geometry', 'formatted_address'],
    });

    ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      if (!place.geometry?.location) return;
      const lat  = place.geometry.location.lat();
      const lng  = place.geometry.location.lng();
      const addr = place.formatted_address ?? '';
      marker.setPosition({ lat, lng });
      map.setCenter({ lat, lng });
      map.setZoom(16);
      onUpdate(lat, lng, addr);
    });

    return () => {
      gm.event.clearInstanceListeners(map);
      gm.event.clearInstanceListeners(marker);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div className="f-field" style={{ marginBottom: 10 }}>
        <label>Dirección del centro de domicilios</label>
        <div style={{ position: 'relative' }}>
          <MapPin size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--brand)', pointerEvents: 'none' }} />
          <input
            ref={inputRef}
            defaultValue={initialAddress}
            placeholder="Busca la dirección de tu restaurante…"
            style={{ paddingLeft: 34 }}
          />
        </div>
      </div>
      <div
        ref={mapRef}
        style={{ width: '100%', height: 220, borderRadius: 12, overflow: 'hidden', border: '1.5px solid var(--border)', marginBottom: 16 }}
      />
    </div>
  );
}

// ─── Panel principal ─────────────────────────────────────────────────────────
export function DeliveryPanel() {
  const { cfg, setCfg, showToast } = useAppStore();

  // Config básica (config/main)
  const [activo, setActivo] = useState(cfg.domicilioActivo);
  const [tipo,   setTipo]   = useState<'fijo' | 'gratis' | 'por_km'>(cfg.domicilioTipo as 'fijo' | 'gratis' | 'por_km');
  const [valor,  setValor]  = useState(String(cfg.domicilioValor));
  const [saving, setSaving] = useState(false);

  // Config por km (config/delivery_settings)
  const [originLat,     setOriginLat]     = useState(0);
  const [originLng,     setOriginLng]     = useState(0);
  const [originAddress, setOriginAddress] = useState('');
  const [pricePerKm,    setPricePerKm]    = useState('1000');
  const [minFee,        setMinFee]        = useState('');
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Estado de Google Maps
  const [mapsLoaded, setMapsLoaded]  = useState(false);
  const [mapsError,  setMapsError]   = useState('');

  // Sincroniza con cfg cuando cambia externamente
  useEffect(() => {
    setActivo(cfg.domicilioActivo);
    setTipo(cfg.domicilioTipo as typeof tipo);
    setValor(String(cfg.domicilioValor));
  }, [cfg]);

  // Carga configuración por km
  useEffect(() => {
    getDeliverySettings()
      .then(d => {
        if (!d) return;
        setOriginLat(d.origin_lat ?? 0);
        setOriginLng(d.origin_lng ?? 0);
        setOriginAddress(d.origin_address ?? '');
        setPricePerKm(String(d.price_per_km ?? 1000));
        setMinFee(d.min_delivery_fee ? String(d.min_delivery_fee) : '');
      })
      .catch(() => {})
      .finally(() => setSettingsLoaded(true));
  }, []);

  // Carga Google Maps cuando el admin selecciona "por_km"
  useEffect(() => {
    if (tipo !== 'por_km') return;
    setMapsError('');
    loadGoogleMaps()
      .then(() => setMapsLoaded(true))
      .catch(e => setMapsError(e.message ?? 'Error cargando Google Maps'));
  }, [tipo]);

  // Cálculo de ejemplo en tiempo real
  const pkm        = parseFloat(pricePerKm) || 0;
  const mf         = parseFloat(minFee)     || 0;
  const exampleKm  = 3.5;
  const exampleFee = Math.round(Math.max(exampleKm * pkm, mf));

  async function handleSave() {
    setSaving(true);
    try {
      const configUpdates = {
        domicilioActivo: activo,
        domicilioTipo:   tipo,
        domicilioValor:  parseFloat(valor) || 0,
      };
      await saveConfigMain(configUpdates);
      setCfg(configUpdates);

      if (tipo === 'por_km') {
        if (!originLat || !originLng) {
          showToast('Selecciona el punto de origen en el mapa');
          setSaving(false);
          return;
        }
        await saveDeliverySettings({
          origin_lat: originLat,
          origin_lng: originLng,
          origin_address: originAddress,
          price_per_km: pkm,
          ...(mf ? { min_delivery_fee: mf } : {}),
        });
      }

      showToast('Configuración de domicilio guardada');
    } catch (err) {
      console.error('Error al guardar configuración de domicilio:', err);
      showToast('Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <div className="admin-card">
        <div className="admin-card-hdr">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Truck size={18} color="var(--brand)" /> Configuración de domicilio
          </h3>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Toggle activo */}
          <Toggle value={activo} onChange={setActivo} label="Servicio de domicilio activo" />

          {activo && (
            <>
              {/* Tipo de cobro */}
              <div className="f-field" style={{ marginBottom: 0 }}>
                <label>Tipo de cobro</label>
                <select value={tipo} onChange={e => setTipo(e.target.value as typeof tipo)}>
                  <option value="gratis">Gratis</option>
                  <option value="fijo">Valor fijo por pedido</option>
                  <option value="por_km">Tarifa por kilómetro (GPS)</option>
                </select>
              </div>

              {/* ── Valor fijo ── */}
              {tipo === 'fijo' && (
                <div className="f-field" style={{ marginBottom: 0 }}>
                  <label>Valor del domicilio (COP)</label>
                  <input
                    type="number" min="0"
                    value={valor}
                    onChange={e => setValor(e.target.value)}
                    placeholder="5000"
                  />
                </div>
              )}

              {/* ── Por kilómetro ── */}
              {tipo === 'por_km' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                  {/* Precio por km */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="f-field" style={{ marginBottom: 0 }}>
                      <label>Valor por kilómetro (COP)</label>
                      <input
                        type="number" min="0"
                        value={pricePerKm}
                        onChange={e => setPricePerKm(e.target.value)}
                        placeholder="1000"
                      />
                    </div>
                    <div className="f-field" style={{ marginBottom: 0 }}>
                      <label>Tarifa mínima (opcional)</label>
                      <input
                        type="number" min="0"
                        value={minFee}
                        onChange={e => setMinFee(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  </div>

                  {/* Ejemplo en tiempo real */}
                  {pkm > 0 && (
                    <div style={{
                      padding: '10px 14px', borderRadius: 10,
                      background: 'var(--brand-light)', border: '1px solid var(--brand)',
                      fontSize: 13, color: 'var(--brand)',
                    }}>
                      Ejemplo: un cliente a {exampleKm} km pagaría{' '}
                      <strong>{fmtPrice(exampleFee)}</strong> de domicilio
                    </div>
                  )}

                  {/* Mapa selector de origen */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 10 }}>
                      Punto de origen
                    </div>

                    {mapsError && (
                      <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>
                        {mapsError}
                        {mapsError.includes('API_KEY') && (
                          <span> — agrega <code>VITE_GOOGLE_MAPS_API_KEY</code> en las variables de entorno.</span>
                        )}
                      </div>
                    )}

                    {!mapsError && !mapsLoaded && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text3)', fontSize: 13, padding: '10px 0' }}>
                        <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                        Cargando mapa…
                      </div>
                    )}

                    {mapsLoaded && settingsLoaded && (
                      <OriginPicker
                        initialLat={originLat}
                        initialLng={originLng}
                        initialAddress={originAddress}
                        onUpdate={(lat, lng, addr) => {
                          setOriginLat(lat);
                          setOriginLng(lng);
                          setOriginAddress(addr);
                        }}
                      />
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          <button
            className="btn-p"
            onClick={handleSave}
            disabled={saving}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 }}
          >
            <Save size={16} />
            {saving ? 'Guardando…' : 'Guardar configuración'}
          </button>
        </div>
      </div>

      {/* Nota informativa cuando está activo por km */}
      {activo && tipo === 'por_km' && (
        <div style={{ marginTop: 12, padding: '12px 16px', borderRadius: 12, background: 'var(--bg2)', border: '1px solid var(--border)', fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--text)' }}>¿Cómo funciona?</strong><br />
          El cliente selecciona su dirección en el mapa. El sistema calcula automáticamente la distancia
          desde tu punto de origen usando la fórmula Haversine y cobra según el valor por km configurado.
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
