import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Navigation, Loader, CheckCircle, Map, X, Crosshair } from 'lucide-react';
import { getDeliverySettings } from '@/lib/data/config';
import { loadGoogleMaps } from '@/lib/googleMaps';
import { haversineKm, calcDeliveryFee } from '@/lib/haversine';
import { fmtPrice } from '@/lib/utils';
import { useAppStore } from '@/stores/useAppStore';
import type { DeliverySettings, LocationData } from '@/types';
import styles from './LocationPicker.module.css';

const DEFAULT_CENTER = { lat: 10.3910, lng: -75.4794 };

interface Props {
  onChange: (data: LocationData) => void;
  initialData?: LocationData | null;
  renderTrigger?: (args: { onClick: () => void; preview: LocationData | null }) => ReactNode;
}

// ─── Inner: solo se monta cuando Maps ya está cargado ────────────────────────
function LocationPickerInner({ onChange, deliverySettings, onConfirm, countryCode, initialData }: {
  onChange: Props['onChange'];
  deliverySettings: DeliverySettings | null;
  onConfirm: () => void;
  countryCode: string;
  initialData?: LocationData | null;
}) {
  const { barrios } = useAppStore();
  const countryCodeRef = useRef(countryCode);
  countryCodeRef.current = countryCode;
  const mapRef      = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLInputElement>(null);
  const mapInst     = useRef<any>(null);
  const tokenRef    = useRef<any>(null);
  const geocoderRef = useRef<any>(null);

  const [lat,          setLat]          = useState<number | null>(initialData?.lat ?? null);
  const [lng,          setLng]          = useState<number | null>(initialData?.lng ?? null);
  const [address,      setAddress]      = useState(initialData?.address ?? '');
  const [barrio,       setBarrio]       = useState(initialData?.barrio ?? '');
  const [notes,        setNotes]        = useState(initialData?.notes ?? '');
  const [geoError,     setGeoError]     = useState('');
  const [geoLoading,   setGeoLoading]   = useState(false);
  const [barrioOpen,   setBarrioOpen]   = useState(false);
  const [barrioSearch, setBarrioSearch] = useState('');
  const [pinLocked,    setPinLocked]    = useState(Boolean(initialData?.lat && initialData?.lng));

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const barriosList = useMemo(() => {
    const seen = new Set<string>();
    return Object.values(barrios)
      .filter(b => b.activo && !seen.has(b.nombre) && seen.add(b.nombre))
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.nombre.localeCompare(b.nombre));
  }, [barrios]);

  const filteredBarrios = useMemo(() =>
    barriosList.filter(b => b.nombre.toLowerCase().includes(barrioSearch.toLowerCase())),
    [barriosList, barrioSearch]
  );

  // Notifica hacia afuera cada vez que cambia posición, notas o settings
  useEffect(() => {
    if (lat === null || lng === null) return;
    let distance_km = 0;
    let delivery_fee = 0;
    if (deliverySettings?.origin_lat) {
      const raw = haversineKm(lat, lng, deliverySettings.origin_lat, deliverySettings.origin_lng);
      distance_km  = Math.round(raw * 10) / 10;
      delivery_fee = calcDeliveryFee(distance_km, deliverySettings.price_per_km, deliverySettings.min_delivery_fee);
    }
    onChangeRef.current({ lat, lng, address, barrio, notes, distance_km, delivery_fee });
  }, [lat, lng, address, barrio, notes, deliverySettings]);

  const applyCenter = useCallback((latLng: any) => {
    const newLat = typeof latLng.lat === 'function' ? latLng.lat() : latLng.lat;
    const newLng = typeof latLng.lng === 'function' ? latLng.lng() : latLng.lng;
    setLat(newLat);
    setLng(newLng);
    return { lat: newLat, lng: newLng };
  }, []);

  const reverseGeocode = useCallback((la: number, ln: number) => {
    if (!geocoderRef.current) return;
    geocoderRef.current.geocode({ location: { lat: la, lng: ln } }, (results: any, status: string) => {
      if (status === 'OK' && results?.[0]) {
        const formatted = results[0].formatted_address as string;
        setAddress(formatted);
        if (inputRef.current) inputRef.current.value = formatted;
      }
    });
  }, []);

  // Confirma la posición actual del centro del mapa y bloquea el arrastre
  // — antes cualquier movimiento del mapa (incluso accidental) sobrescribía
  // la ubicación ya elegida; ahora hace falta este toque explícito, y una
  // vez confirmado el mapa deja de moverse hasta que se pida "Actualizar".
  function handleFixHere() {
    if (!mapInst.current) return;
    if (pinLocked) {
      setPinLocked(false);
      mapInst.current.setOptions({ draggable: true });
      return;
    }
    const { lat: la, lng: ln } = applyCenter(mapInst.current.getCenter());
    reverseGeocode(la, ln);
    setPinLocked(true);
    mapInst.current.setOptions({ draggable: false });
  }

  // Inicializa mapa y autocomplete (solo al montar)
  useEffect(() => {
    if (!mapRef.current || !inputRef.current) return;

    const gm = (window as any).google.maps;

    const hasInitial = initialData?.lat && initialData?.lng;
    const map = new gm.Map(mapRef.current, {
      center:           hasInitial ? { lat: initialData!.lat, lng: initialData!.lng } : DEFAULT_CENTER,
      zoom:             hasInitial ? 16 : 13,
      disableDefaultUI: true,
      zoomControl:      true,
      clickableIcons:   false,
      gestureHandling:  'greedy',
      draggable:        !hasInitial,
    });
    mapInst.current = map;
    geocoderRef.current = new gm.Geocoder();

    if (hasInitial && inputRef.current && initialData!.address) {
      inputRef.current.value = initialData!.address;
    }

    // Restringe la búsqueda a la zona de reparto configurada — sin esto,
    // el autocompletado devolvía direcciones de cualquier ciudad de Colombia.
    const acOptions: Record<string, unknown> = {
      componentRestrictions: { country: countryCodeRef.current || 'co' },
      fields: ['geometry', 'formatted_address'],
    };
    if (deliverySettings?.origin_lat && deliverySettings?.origin_lng) {
      const delta = 0.35; // ≈ 35-40 km alrededor del centro del negocio
      acOptions.bounds = new gm.LatLngBounds(
        { lat: deliverySettings.origin_lat - delta, lng: deliverySettings.origin_lng - delta },
        { lat: deliverySettings.origin_lat + delta, lng: deliverySettings.origin_lng + delta },
      );
      acOptions.strictBounds = true;
    }

    tokenRef.current = new gm.places.AutocompleteSessionToken();
    const ac = new gm.places.Autocomplete(inputRef.current!, { ...acOptions, sessionToken: tokenRef.current });

    ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      if (!place.geometry?.location) return;
      setAddress(place.formatted_address ?? '');
      map.setCenter(place.geometry.location);
      map.setZoom(16);
      applyCenter(place.geometry.location);
      setPinLocked(true);
      map.setOptions({ draggable: false });
      tokenRef.current = new gm.places.AutocompleteSessionToken();
    });

    return () => {
      gm.event.clearInstanceListeners(map);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleGeolocate() {
    setGeoError('');
    if (!navigator.geolocation) {
      setGeoError('Tu navegador no soporta geolocalización.');
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords;
        const gm = (window as any).google.maps;
        mapInst.current?.setCenter(new gm.LatLng(latitude, longitude));
        mapInst.current?.setZoom(16);
        mapInst.current?.setOptions({ draggable: false });
        applyCenter({ lat: latitude, lng: longitude });
        reverseGeocode(latitude, longitude);
        setPinLocked(true);
        setGeoLoading(false);
      },
      err => {
        const msgs: Record<number, string> = {
          1: 'Permiso de ubicación denegado. Actívalo en la configuración del navegador.',
          2: 'No se pudo determinar tu ubicación.',
          3: 'La solicitud de ubicación tardó demasiado.',
        };
        setGeoError(msgs[err.code] ?? 'Error de geolocalización.');
        setGeoLoading(false);
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  }

  const distance_km = (lat !== null && lng !== null && deliverySettings?.origin_lat)
    ? Math.round(haversineKm(lat, lng, deliverySettings.origin_lat, deliverySettings.origin_lng) * 10) / 10
    : null;
  const delivery_fee = (distance_km !== null && deliverySettings)
    ? calcDeliveryFee(distance_km, deliverySettings.price_per_km, deliverySettings.min_delivery_fee)
    : null;

  const canConfirm = lat !== null && lng !== null && barrio.trim() && notes.trim();

  return (
    <div className={styles.wrap}>

      {/* Búsqueda con autocomplete */}
      <div className={styles.searchWrap}>
        <MapPin size={15} className={styles.searchIcon} />
        <input
          ref={inputRef}
          className={styles.searchInput}
          placeholder="Busca tu dirección…"
          type="text"
          autoComplete="off"
          name="direccion-busqueda"
        />
      </div>

      {/* Mapa con pin fijo en el centro */}
      <div className={styles.mapWrap}>
        <div ref={mapRef} className={styles.mapContainer} />
        <div className={styles.centerPin}>
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42">
            <path d="M16 0C7.16 0 0 7.16 0 16c0 12 16 26 16 26S32 28 32 16C32 7.16 24.84 0 16 0z" fill="#FF6229"/>
            <circle cx="16" cy="16" r="6" fill="#fff"/>
          </svg>
        </div>
        <button type="button" className={styles.fixHereBtn} onClick={handleFixHere}>
          <Crosshair size={14} />
          {pinLocked ? 'Actualizar ubicación' : 'Confirmar este punto'}
        </button>
      </div>

      {/* Geolocalización */}
      <div>
        <button
          type="button"
          className={styles.geoBtn}
          onClick={handleGeolocate}
          disabled={geoLoading}
        >
          {geoLoading
            ? <Loader size={14} className={styles.spin} />
            : <Navigation size={14} />
          }
          {geoLoading ? 'Obteniendo ubicación…' : 'Usar mi ubicación actual'}
        </button>
        {geoError && <div className={styles.geoErrBox} style={{ marginTop: 8 }}>{geoError}</div>}
      </div>

      {/* Barrio */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
          Barrio <span style={{ color: 'var(--danger, #dc2626)' }}>*</span>
        </div>
        {barriosList.length > 0 ? (
          <div>
            {!barrioOpen ? (
              <div
                onClick={() => { setBarrioOpen(true); setBarrioSearch(''); }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 13px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: 14 }}
              >
                <span style={{ color: barrio ? 'var(--text)' : 'var(--text3)' }}>{barrio || 'Selecciona tu barrio…'}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
              </div>
            ) : (
              <>
                <input
                  autoFocus
                  autoComplete="off"
                  value={barrioSearch}
                  onChange={e => setBarrioSearch(e.target.value)}
                  placeholder="Buscar barrio…"
                  style={{ width: '100%', padding: '11px 13px', boxSizing: 'border-box', border: '1px solid var(--brand)', borderRadius: '8px 8px 0 0', background: 'var(--surface)', color: 'var(--text)', fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
                />
                <div style={{ maxHeight: 130, overflowY: 'auto', border: '1px solid var(--brand)', borderTop: 'none', borderRadius: '0 0 8px 8px', background: 'var(--surface)' }}>
                  {filteredBarrios.map(b => (
                    <div
                      key={b.id}
                      onClick={() => { setBarrio(b.nombre); setBarrioOpen(false); }}
                      style={{ padding: '10px 13px', cursor: 'pointer', fontSize: 14, borderBottom: '1px solid var(--border)', background: barrio === b.nombre ? 'var(--brand-light)' : 'transparent', color: barrio === b.nombre ? 'var(--brand)' : 'var(--text)', fontWeight: barrio === b.nombre ? 600 : 400 }}
                    >
                      {b.nombre}
                    </div>
                  ))}
                  {filteredBarrios.length === 0 && (
                    <div style={{ padding: '10px 13px', color: 'var(--text3)', fontSize: 13 }}>Sin resultados</div>
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          <input
            className={styles.notesInput}
            style={{ resize: 'none', padding: '11px 13px' }}
            placeholder="Ej: El Prado, Manga, Bocagrande…"
            value={barrio}
            onChange={e => setBarrio(e.target.value)}
            autoComplete="off"
          />
        )}
      </div>

      {/* Indicaciones adicionales */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
          Indicaciones adicionales <span style={{ color: 'var(--danger, #dc2626)' }}>*</span>
        </div>
        <textarea
          className={styles.notesInput}
          rows={2}
          placeholder="Apto, torre, piso, color de puerta, referencias del lugar…"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          autoComplete="off"
        />
      </div>

      {/* Resumen de tarifa */}
      <div className={styles.feeBox}>
        <div className={styles.feeLeft}>
          <span className={styles.feeLabel}>Domicilio</span>
          {distance_km !== null
            ? <span className={styles.feeDist}>{distance_km} km desde nuestro centro</span>
            : <span className={styles.feeDist}>Ubica el pin y toca "Confirmar este punto"</span>
          }
        </div>
        {delivery_fee !== null
          ? <span className={styles.feeValue}>{fmtPrice(delivery_fee)}</span>
          : deliverySettings
            ? <span className={styles.feeValue} style={{ fontSize: 14 }}>—</span>
            : <span className={styles.feeUnconfigured}>Tarifa no disponible aún</span>
        }
      </div>

      {/* Botón confirmar ubicación */}
      <button
        type="button"
        onClick={onConfirm}
        disabled={!canConfirm}
        style={{
          width: '100%', padding: '13px 16px', borderRadius: 12,
          border: 'none', cursor: canConfirm ? 'pointer' : 'not-allowed',
          background: canConfirm ? 'var(--brand)' : 'var(--bg2)',
          color: canConfirm ? '#fff' : 'var(--text3)',
          fontWeight: 700, fontSize: 15, fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          transition: 'background .15s, color .15s',
        }}
      >
        <CheckCircle size={16} />
        Confirmar ubicación
      </button>
    </div>
  );
}

// ─── Wrapper público: maneja carga de Maps + delivery_settings ───────────────
export function LocationPicker({ onChange, initialData, renderTrigger }: Props) {
  const { cfg } = useAppStore();
  const countryCode = cfg.mapCountryCode || 'co';
  const [mapsLoaded,       setMapsLoaded]       = useState(false);
  const [mapsError,        setMapsError]        = useState('');
  const [deliverySettings, setDeliverySettings] = useState<DeliverySettings | null>(null);
  const [settingsLoading,  setSettingsLoading]  = useState(true);
  const [modalOpen,        setModalOpen]        = useState(false);
  const [confirmed,        setConfirmed]        = useState<LocationData | null>(initialData ?? null);
  const [pending,          setPending]          = useState<LocationData | null>(null);

  useEffect(() => {
    loadGoogleMaps()
      .then(() => setMapsLoaded(true))
      .catch(e  => setMapsError(e.message ?? 'Error cargando Google Maps'));
  }, []);

  useEffect(() => {
    getDeliverySettings()
      .then(settings => { if (settings) setDeliverySettings(settings); })
      .catch(() => {})
      .finally(() => setSettingsLoading(false));
  }, []);

  function handleChange(data: LocationData) {
    setPending(data);
  }

  function handleConfirm() {
    if (!pending) return;
    setConfirmed(pending);
    onChange(pending);
    setModalOpen(false);
  }

  // Preview card
  const preview = confirmed;

  return (
    <>
      {/* Trigger */}
      {renderTrigger ? (
        renderTrigger({ onClick: () => setModalOpen(true), preview })
      ) : (
      /* Preview / trigger card */
      <div style={{
        border: `1.5px solid ${preview ? 'var(--brand)' : 'var(--border)'}`,
        borderRadius: 14,
        background: preview ? 'var(--brand-light)' : 'var(--bg2)',
        padding: '14px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        transition: 'border-color .15s, background .15s',
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
          background: preview ? 'var(--brand)' : 'var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {preview
            ? <CheckCircle size={20} color="#fff" />
            : <Map size={20} color="var(--text3)" />
          }
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {preview ? (
            <>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--brand)' }}>
                {preview.barrio}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {preview.notes}
              </div>
              {preview.distance_km > 0 && (
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>
                  {preview.distance_km} km · Domicilio: {fmtPrice(preview.delivery_fee)}
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>Sin ubicación seleccionada</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>Toca para ubicar en el mapa</div>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          style={{
            flexShrink: 0, padding: '8px 14px', borderRadius: 10,
            border: '1.5px solid var(--brand)', background: 'var(--brand)',
            color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700,
            fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <MapPin size={14} />
          {preview ? 'Cambiar' : 'Ubicar en el mapa'}
        </button>
      </div>
      )}

      {/* Modal del mapa — en portal para escapar el stacking context del sidebar/carrito */}
      {modalOpen && createPortal(
        <div
          className={styles.overlay}
          onClick={e => e.target === e.currentTarget && setModalOpen(false)}
        >
          <div className={styles.sheet}>
            {/* Handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 8px' }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
            </div>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <MapPin size={18} color="var(--brand)" /> Seleccionar dirección de entrega
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4 }}
              >
                <X size={20} />
              </button>
            </div>

            {mapsError && (
              <div style={{ padding: '12px 16px', borderRadius: 12, background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>
                No se pudo cargar el mapa. Verifica tu conexión.
              </div>
            )}

            {!mapsError && (!mapsLoaded || settingsLoading) && (
              <div className={styles.skeleton} style={{ margin: '20px 0' }}>
                <Loader size={18} className={styles.spin} />
                Cargando mapa…
              </div>
            )}

            {!mapsError && mapsLoaded && !settingsLoading && (
              <LocationPickerInner
                onChange={handleChange}
                deliverySettings={deliverySettings}
                onConfirm={handleConfirm}
                countryCode={countryCode}
                initialData={confirmed}
              />
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
