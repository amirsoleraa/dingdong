import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, MapPin, Ticket, CheckCircle, MessageCircle, User, ChevronDown } from 'lucide-react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { createPedido } from '@/lib/data/pedidos';
import { getCuponByCodigo, createCuponDePromo } from '@/lib/data/cupones';
import { useCartStore } from '@/stores/useCartStore';
import { useAppStore } from '@/stores/useAppStore';
import { useClienteAuth } from '@/hooks/useClienteAuth';
import { Modal } from '@/components/ui/Modal';
import { LocationPicker } from '@/components/client/LocationPicker';
import { OrderConfirmationModal } from '@/components/client/OrderConfirmationModal';
import { sendOrderConfirmation } from '@/lib/email';
import { fmtPrice, generarNumeroPedido, isValidEmail, isValidPhone } from '@/lib/utils';
import { evaluatePromos } from '@/lib/promos';
import type { DatosEnvio, Pedido } from '@/types';
import styles from './ResumenPage.module.css';

interface DatosForm {
  nombre: string;
  correo: string;
  tel: string;
  dir: string;
  barrio?: string;
  comp?: string;
  recibe?: string;
}

export function ResumenPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useClienteAuth();
  const { cart, datosEnvio, locationData, cuponAplicado, setCuponAplicado, setDatosEnvio, setLocationData, setCartOpen, setLastPedido, reset: clearCart } = useCartStore();
  const { cfg, barrios, promociones, productos, showToast } = useAppStore();

  useEffect(() => {
    document.documentElement.dataset.theme = 'dark';
    return () => { delete document.documentElement.dataset.theme; };
  }, []);

  const esPorKm = cfg.domicilioActivo && cfg.domicilioTipo === 'por_km';

  const [datosOpen,    setDatosOpen]    = useState(false);
  const [barrioSearch, setBarrioSearch] = useState('');
  const [barrioOpen,   setBarrioOpen]   = useState(false);
  const barrioRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (barrioRef.current && !barrioRef.current.contains(e.target as Node)) {
        setBarrioOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);
  const [confirmOpen,  setConfirmOpen]  = useState(false);
  const [sending,      setSending]      = useState(false);
  const [successPedido, setSuccessPedido] = useState<Pedido | null>(null);
  const [cuponCode,    setCuponCode]    = useState('');
  const [cuponMsg,     setCuponMsg]     = useState('');
  const [cuponOk,      setCuponOk]      = useState(false);


  const subtotal  = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const domicilioBase = cfg.domicilioActivo
    ? cfg.domicilioTipo === 'gratis'  ? 0
    : cfg.domicilioTipo === 'por_km'  ? (locationData?.delivery_fee ?? 0)
    : cfg.domicilioValor
    : 0;

  const promoResult = evaluatePromos(promociones, cart, domicilioBase, productos);
  const domicilio   = Math.max(0, domicilioBase - promoResult.descuentoDomicilio);

  const descuento = cuponAplicado
    ? Math.min(
        cuponAplicado.tipo === 'porcentaje'
          ? Math.round(subtotal * cuponAplicado.valor / 100)
          : cuponAplicado.valor,
        subtotal
      )
    : 0;
  const total = subtotal + domicilio - descuento - promoResult.descuentoProductos;

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<DatosForm>({
    defaultValues: datosEnvio ?? {},
  });

  // Sync form with store every time the modal opens
  useEffect(() => {
    if (datosOpen) reset(datosEnvio ?? {});
  }, [datosOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  const watchedBarrio = watch('barrio');

  const cf = cfg.camposFormulario ?? {};
  const mostrar = {
    correo: cf.correo !== false,
    tel:    cf.tel    !== false,
    dir:    cf.dir    !== false && !esPorKm,   // oculto cuando usa mapa
    barrio: cf.barrio !== false && !esPorKm,
    comp:   cf.comp   !== false && !esPorKm,
    recibe: cf.recibe !== false,
  };

  function onSaveDatos(data: DatosForm) {
    setDatosEnvio(data as DatosEnvio);
    setDatosOpen(false);
    showToast('Datos guardados');
  }

  async function applyCoupon() {
    const code = cuponCode.trim().toUpperCase();
    if (!code) return;
    try {
      const cup = await getCuponByCodigo(code);
      if (!cup || cup.activo === false) {
        setCuponMsg('Cupón inválido o expirado'); setCuponOk(false); setCuponAplicado(null); return;
      }
      if (cup.limite > 0 && cup.usos >= cup.limite) {
        setCuponMsg('Cupón agotado'); setCuponOk(false); setCuponAplicado(null); return;
      }
      setCuponAplicado(cup);
      setCuponMsg(`Cupón aplicado — ${cup.tipo === 'porcentaje' ? `${cup.valor}%` : fmtPrice(cup.valor)} de descuento`);
      setCuponOk(true);
    } catch {
      setCuponMsg('Error al verificar cupón'); setCuponOk(false);
    }
  }

  function handleConfirmar() {
    if (!cart.length)    { showToast('Tu carrito está vacío'); return; }
    if (!datosEnvio)     { setDatosOpen(true); return; }
    if (esPorKm && (!locationData?.lat || !locationData?.lng)) {
      showToast('Mueve el mapa para seleccionar tu dirección de entrega'); return;
    }
    if (esPorKm && !locationData?.barrio?.trim()) {
      showToast('Ingresa el nombre de tu barrio'); return;
    }
    if (esPorKm && !locationData?.notes?.trim()) {
      showToast('Ingresa las indicaciones adicionales (apto, torre, referencia...)'); return;
    }
    setConfirmOpen(true);
  }

  function buildWhatsappUrl(numero: string, items: Pedido['items']) {
    const num = cfg.whatsappNumero?.replace(/\D/g, '');
    if (!num) return null;

    const itemsText = items
      .map(i => `• ${i.qty}× ${i.nombre}${i.extras?.length ? ` (+${i.extras.join(', ')})` : ''} — ${fmtPrice(i.precio * i.qty)}`)
      .join('\n');

    const dirLine = esPorKm && locationData
      ? [
          `📍 ${locationData.address}`,
          locationData.barrio ? `🏘 Barrio: ${locationData.barrio}` : '',
          locationData.notes  ? `📝 ${locationData.notes}` : '',
          `📏 Distancia: ${locationData.distance_km} km`,
          `🗺 https://www.google.com/maps?q=${locationData.lat},${locationData.lng}`,
        ].filter(Boolean).join('\n')
      : `📍 ${[datosEnvio!.dir, datosEnvio!.barrio, datosEnvio!.comp].filter(Boolean).join(', ')}`;

    const msg = [
      `¡Hola ${cfg.nombreComercio}! 🔥 Quiero confirmar mi pedido:`,
      ``,
      `📋 *Pedido #${numero}*`,
      `👤 ${datosEnvio!.nombre}`,
      `📞 ${datosEnvio!.tel}`,
      dirLine,
      ``,
      `🛒 *Productos:*`,
      itemsText,
      ``,
      domicilio > 0  ? `🚗 Domicilio: ${fmtPrice(domicilio)}` : '',
      descuento > 0  ? `🎟 Descuento: -${fmtPrice(descuento)}` : '',
      `💰 *Total: ${fmtPrice(total)}*`,
    ].filter(l => l !== '').join('\n');

    return `https://api.whatsapp.com/send/?phone=${num}&text=${encodeURIComponent(msg)}&type=phone_number&app_absent=0`;
  }

  async function finalizarPedido(openWA = false) {
    setSending(true);
    const numero = generarNumeroPedido();
    const items  = cart.map(i => ({ id: i.id, nombre: i.name, precio: i.price, qty: i.qty, extras: i.extras }));
    const pedido: Omit<Pedido, 'id' | 'createdAt' | 'verificacion'> = {
      numero,
      estado: 'activos',
      cliente: datosEnvio!,
      clienteUid: user?.id ?? null,
      items,
      subtotal,
      domicilio,
      descuento: descuento + promoResult.descuentoProductos,
      total,
      cupon: cuponAplicado ? cuponAplicado.codigo : null,
      mensajeConfirmacion: cfg.mensajeConfirmacion || '',
      location: locationData ?? null,
      ...(promoResult.promosAplicadas.length > 0 && { promosAplicadas: promoResult.promosAplicadas }),
    };

    try {
      const fullPedido = await createPedido(pedido);

      // El incremento de `usos` del cupón lo hace el trigger de Postgres
      // on_nuevo_pedido de forma atómica — hacerlo también aquí duplicaba el conteo.

      for (const code of promoResult.cuponesGenerados) {
        const promoApl = promoResult.promosAplicadas.find(pa => pa.cuponGenerado === code);
        if (!promoApl) continue;
        createCuponDePromo({
          codigo: code,
          valorPct: promoApl.cuponPct ?? 10,
          clienteNombre: datosEnvio!.nombre,
          clienteTel: datosEnvio!.tel ?? '',
          pedidoNumero: numero,
          promoNombre: promoApl.nombre,
          promoId: promoApl.promoId,
        }).catch(() => {});
      }

      setLastPedido(fullPedido);
      sendOrderConfirmation(fullPedido, cfg.nombreComercio).catch(() => {});

      if (openWA) {
        const url = buildWhatsappUrl(numero, items);
        if (url) window.open(url, '_blank');
      }

      clearCart();
      setConfirmOpen(false);
      setSuccessPedido(fullPedido);
    } catch (e) {
      showToast('Error al enviar el pedido. Intenta de nuevo.');
      console.error(e);
    } finally {
      setSending(false);
    }
  }

  const hasWhatsapp = !!cfg.whatsappNumero?.replace(/\D/g, '');

  if (authLoading) return null;
  if (!user) return <Navigate to="/login" state={{ from: '/resumen' }} replace />;

  // Se muestra ANTES del guard de carrito vacío y como return temprano:
  // finalizarPedido() ya vació el carrito (y con él datosEnvio/locationData),
  // así que el resto del JSX de checkout de abajo asume esos datos
  // presentes y podía romper el render silenciosamente, impidiendo que
  // este modal llegara a pintarse.
  if (successPedido) {
    return (
      <OrderConfirmationModal
        pedido={successPedido}
        onClose={() => { setSuccessPedido(null); navigate('/'); }}
      />
    );
  }

  if (cart.length === 0) { navigate('/'); return null; }

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.back} onClick={() => navigate('/')}>
          <ArrowLeft size={20} />
        </button>
        <h2>Tu pedido</h2>
      </div>

      <div className={styles.content}>

        {/* Productos */}
        <div className={styles.card}>
          <div className={styles.cardHdr}>
            <h3>Productos</h3>
            <button className="btn-s" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => { setCartOpen(true); navigate('/'); }}>
              Editar
            </button>
          </div>
          <div className={styles.cardBody}>
            {cart.map((item, i) => (
              <div key={i} className={styles.productRow}>
                <div className={styles.productThumb}>
                  {item.imgUrl
                    ? <img src={item.imgUrl} alt={item.name} />
                    : <span>{item.emoji ?? '🍖'}</span>
                  }
                </div>
                <div className={styles.productInfo}>
                  <span className={styles.productName}>{item.name} × {item.qty}</span>
                  {item.extras.length > 0 && (
                    <span className={styles.productExtras}>+ {item.extras.join(', ')}</span>
                  )}
                </div>
                <span className={styles.productPrice}>{fmtPrice(item.price * item.qty)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Dirección de entrega (solo cuando es por_km) ── */}
        {esPorKm && (
          <div className={styles.card}>
            <div className={styles.cardHdr}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <MapPin size={16} color="var(--brand)" />
                Dirección de entrega
              </h3>
              {locationData?.lat && (
                <span style={{ fontSize: 12, color: 'var(--success)' }}>✓ Ubicación seleccionada</span>
              )}
            </div>
            <div className={styles.cardBody} style={{ paddingTop: 12 }}>
              <LocationPicker onChange={setLocationData} initialData={locationData} />
            </div>
          </div>
        )}

        {/* ── Datos personales ── */}
        <div
          className={styles.card}
          style={{ cursor: 'pointer' }}
          onClick={() => setDatosOpen(true)}
        >
          <div className={styles.cardHdr}>
            <div>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {esPorKm
                  ? <><User size={16} color="var(--brand)" /> Datos personales</>
                  : <><MapPin size={16} color="var(--brand)" /> Datos de entrega</>
                }
              </h3>
              {datosEnvio
                ? <p style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>
                    {datosEnvio.nombre}
                    {mostrar.tel && datosEnvio.tel ? ` · ${datosEnvio.tel}` : ''}
                    {!esPorKm && datosEnvio.barrio ? ` · ${datosEnvio.barrio}` : ''}
                  </p>
                : <p style={{ fontSize: 13, color: 'var(--brand)', marginTop: 2 }}>Toca para agregar →</p>
              }
            </div>
          </div>
        </div>

        {/* Cupón */}
        <div className={styles.card}>
          <div className={styles.cardHdr}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Ticket size={16} color="var(--brand)" />
              Cupón de descuento
            </h3>
          </div>
          <div className={styles.cardBody}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="coupon-input s-input"
                style={{ flex: 1, textTransform: 'uppercase' }}
                placeholder="Código de descuento"
                value={cuponCode}
                onChange={e => setCuponCode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyCoupon()}
                autoComplete="off"
              />
              <button className="btn-add" onClick={applyCoupon}>Aplicar</button>
            </div>
            {cuponMsg && (
              <p style={{ fontSize: 13, marginTop: 8, color: cuponOk ? 'var(--success)' : 'var(--danger)' }}>
                {cuponMsg}
              </p>
            )}
          </div>
        </div>

        {/* Promos activas */}
        {promoResult.promosAplicadas.length > 0 && (
          <div className={styles.card} style={{ borderColor: 'var(--success)' }}>
            <div className={styles.cardHdr}>
              <h3 style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 6 }}>
                🎉 Promociones aplicadas
              </h3>
            </div>
            <div className={styles.cardBody}>
              {promoResult.promosAplicadas.map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', color: 'var(--success)', gap: 8 }}>
                  <span>{p.nombre}</span>
                  <span style={{ fontWeight: 600, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {p.tipo === 'compra_lleva' && p.productoBNombre ? (
                      <>
                        {(() => { const prod = p.productoBId ? productos[p.productoBId] : null; return prod?.imgUrl ? <img src={prod.imgUrl} alt={prod.nombre} style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} /> : null; })()}
                        {p.cantidadBReal ?? 1}× {p.productoBNombre} gratis
                      </>
                    ) : p.descuentoProducto
                      ? `-${fmtPrice(p.descuentoProducto)}`
                      : p.descuentoDomicilio
                        ? `Domicilio -${fmtPrice(p.descuentoDomicilio)}`
                        : p.cuponGenerado
                          ? `Cupón: ${p.cuponGenerado}`
                          : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Totales */}
        <div className={styles.card}>
          <div className={styles.cardBody}>
            <div className={styles.resRow}>
              <span>Subtotal</span>
              <span>{fmtPrice(subtotal)}</span>
            </div>
            {cfg.domicilioActivo && (
              <div className={styles.resRow}>
                <span>Domicilio</span>
                <span>
                  {cfg.domicilioTipo === 'gratis'
                    ? 'Gratis'
                    : esPorKm && !locationData
                      ? <span style={{ color: 'var(--text3)', fontSize: 12 }}>Selecciona dirección</span>
                      : domicilio === 0 && domicilioBase > 0
                        ? <span style={{ color: 'var(--success)' }}>Gratis 🎉</span>
                        : fmtPrice(domicilio)
                  }
                </span>
              </div>
            )}
            {promoResult.descuentoProductos > 0 && (
              <div className={styles.resRow} style={{ color: 'var(--success)' }}>
                <span>Descuento promos</span>
                <span>-{fmtPrice(promoResult.descuentoProductos)}</span>
              </div>
            )}
            {promoResult.promosAplicadas.filter(p => p.isVirtualGift).map((p, i) => (
              <div key={i} className={styles.resRow} style={{ color: 'var(--success)', fontSize: 13 }}>
                <span>Promo: {p.cantidadBReal ?? 1}× {p.productoBNombre}</span>
                <span>Gratis</span>
              </div>
            ))}
            {descuento > 0 && (
              <div className={styles.resRow} style={{ color: 'var(--success)' }}>
                <span>Cupón</span>
                <span>-{fmtPrice(descuento)}</span>
              </div>
            )}
            <div className={`${styles.resRow} ${styles.total}`}>
              <span>Total a pagar</span>
              <span>{fmtPrice(total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* CTA fijo */}
      <div className={styles.fixed}>
        <button className="btn-p" onClick={handleConfirmar}>
          Confirmar pedido — {fmtPrice(total)}
        </button>
      </div>

      {/* Modal: Datos personales / entrega */}
      <Modal isOpen={datosOpen} onClose={() => setDatosOpen(false)} title={esPorKm ? 'Datos personales' : 'Datos de entrega'}>
        <form onSubmit={handleSubmit(onSaveDatos)} noValidate>
          <div className="f-field">
            <label>Nombre completo *</label>
            <input {...register('nombre', { required: 'Obligatorio' })} placeholder="Tu nombre" autoComplete="off" />
            {errors.nombre && <span className="f-err">{errors.nombre.message}</span>}
          </div>
          {mostrar.correo && (
            <div className="f-field">
              <label>Correo electrónico</label>
              <input {...register('correo', { validate: v => !v || isValidEmail(v) || 'Correo inválido' })} placeholder="correo@ejemplo.com" type="email" autoComplete="off" />
              {errors.correo && <span className="f-err">{errors.correo.message}</span>}
            </div>
          )}
          {mostrar.tel && (
            <div className="f-field">
              <label>Teléfono *</label>
              <input {...register('tel', { required: 'Obligatorio', validate: v => isValidPhone(v || '') || 'Teléfono inválido (ej: 3001234567)' })} placeholder="3001234567" maxLength={10} autoComplete="off" />
              {errors.tel && <span className="f-err">{errors.tel.message}</span>}
            </div>
          )}
          {/* Dir/barrio/comp solo cuando NO es por_km */}
          {mostrar.dir && (
            <div className="f-field">
              <label>Dirección de entrega *</label>
              <input {...register('dir', { required: 'Obligatorio' })} placeholder="Calle 45 # 23-10" autoComplete="off" />
              {errors.dir && <span className="f-err">{errors.dir.message}</span>}
            </div>
          )}
          {mostrar.barrio && (() => {
            const barrioList = Object.values(barrios)
              .filter(b => b.activo)
              .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.nombre.localeCompare(b.nombre));
            const filteredBarrios = barrioList.filter(b =>
              b.nombre.toLowerCase().includes(barrioSearch.toLowerCase())
            );
            return (
              <div className="f-field">
                <label>Barrio</label>
                {barrioList.length > 0 ? (
                  <div ref={barrioRef}>
                    {!barrioOpen ? (
                      <div
                        onClick={() => { setBarrioOpen(true); setBarrioSearch(''); }}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '10px 12px', borderRadius: 8,
                          border: '1px solid var(--border)', background: 'var(--surface)',
                          cursor: 'pointer', fontSize: 14,
                        }}
                      >
                        <span style={{ color: watchedBarrio ? 'var(--text)' : 'var(--text3)' }}>
                          {watchedBarrio || 'Selecciona tu barrio'}
                        </span>
                        <ChevronDown size={14} color="var(--text3)" />
                      </div>
                    ) : (
                      <>
                        <input
                          autoFocus
                          value={barrioSearch}
                          onChange={e => setBarrioSearch(e.target.value)}
                          placeholder="Buscar barrio..."
                          style={{
                            width: '100%', padding: '10px 12px', boxSizing: 'border-box',
                            border: '1px solid var(--brand)', borderRadius: '8px 8px 0 0',
                            background: 'var(--surface)', color: 'var(--text)',
                            fontSize: 14, fontFamily: 'inherit', outline: 'none',
                          }}
                        />
                        <div style={{
                          maxHeight: 200, overflowY: 'auto',
                          border: '1px solid var(--brand)', borderTop: 'none',
                          borderRadius: '0 0 8px 8px', background: 'var(--surface)',
                        }}>
                          {filteredBarrios.map(b => (
                            <div
                              key={b.id}
                              onClick={() => { setValue('barrio', b.nombre, { shouldDirty: true }); setBarrioOpen(false); }}
                              style={{
                                padding: '10px 14px', cursor: 'pointer', fontSize: 14,
                                borderBottom: '1px solid var(--border)',
                                background: watchedBarrio === b.nombre ? 'var(--brand-light)' : 'transparent',
                                color: watchedBarrio === b.nombre ? 'var(--brand)' : 'var(--text)',
                                fontWeight: watchedBarrio === b.nombre ? 600 : 400,
                              }}
                            >
                              {b.nombre}
                            </div>
                          ))}
                          {filteredBarrios.length === 0 && (
                            <div style={{ padding: '12px 14px', color: 'var(--text3)', fontSize: 13 }}>
                              Sin resultados
                            </div>
                          )}
                        </div>
                      </>
                    )}
                    <input type="hidden" {...register('barrio')} />
                  </div>
                ) : (
                  <input {...register('barrio')} placeholder="Nombre del barrio" />
                )}
              </div>
            );
          })()}
          {mostrar.comp && (
            <div className="f-field">
              <label>Apartamento / Torre / Referencia</label>
              <input {...register('comp')} placeholder="Apto 301, Torre B..." autoComplete="off" />
            </div>
          )}
          {mostrar.recibe && (
            <div className="f-field">
              <label>¿Quién recibe? (si es diferente)</label>
              <input {...register('recibe')} placeholder="Nombre de quien recibe" autoComplete="off" />
            </div>
          )}
          <button type="submit" className="btn-p" style={{ marginTop: 8 }}>
            Guardar datos
          </button>
          <p style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', marginTop: 10 }}>
            Al guardar aceptas nuestra{' '}
            <a href="/privacidad" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand)' }}>
              política de tratamiento de datos
            </a>.
          </p>
        </form>
      </Modal>

      {/* Modal: Confirmar pedido */}
      <Modal isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirmar pedido">
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <CheckCircle size={48} color="var(--success)" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontSize: 15, color: 'var(--text2)', lineHeight: 1.6 }}>
            {cfg.mensajeConfirmacion || '¡Tu pedido está listo para confirmar!'}
          </p>
          {esPorKm && locationData && (
            <p style={{ fontSize: 13, color: 'var(--text3)', marginTop: 8, lineHeight: 1.6 }}>
              📍 {locationData.address || 'Ubicación seleccionada en mapa'}<br />
              {locationData.barrio && <>🏘 {locationData.barrio}<br /></>}
              {locationData.notes  && <>📝 {locationData.notes}<br /></>}
              📏 {locationData.distance_km} km · 🚗 {fmtPrice(locationData.delivery_fee)}
            </p>
          )}
          <p style={{ fontWeight: 700, fontSize: 22, color: 'var(--brand)', marginTop: 16 }}>
            Total: {fmtPrice(total)}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {hasWhatsapp && (
            <button
              onClick={() => finalizarPedido(true)}
              disabled={sending}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                padding: '15px 20px', borderRadius: 14, fontWeight: 700, fontSize: 16,
                background: '#25D366', color: '#fff', border: 'none', cursor: 'pointer',
                boxShadow: '0 4px 20px rgba(37,211,102,.35)', fontFamily: 'inherit',
                opacity: sending ? .6 : 1,
              }}
            >
              <MessageCircle size={20} />
              {sending ? 'Procesando...' : 'Confirmar por WhatsApp'}
            </button>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button className="btn-s" onClick={() => setConfirmOpen(false)} disabled={sending}>
              Cancelar
            </button>
            <button className="btn-p" onClick={() => finalizarPedido(false)} disabled={sending}>
              {sending ? 'Procesando...' : hasWhatsapp ? 'Solo confirmar' : 'Confirmar 🎉'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
