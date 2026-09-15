import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { listRutasCompletadas, deleteRuta } from '@/lib/data/rutas';
import { useAppStore } from '@/stores/useAppStore';
import { useAdminStore } from '@/stores/useAdminStore';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { fmtPrice, tsMs } from '@/lib/utils';
import { User, Package, ChevronDown, ChevronUp, CheckCircle, Trash2, X, Calendar, Bike } from 'lucide-react';
import type { RutaEntrega, Pedido } from '@/types';

function fmtFecha(ts?: string): string {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('es-CO', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fechaISO(ts?: string): string {
  if (!ts) return '0000-00-00';
  return new Date(ts).toISOString().slice(0, 10);
}

export function HistorialRutasPanel() {
  const { cfg, domiciliarios, showToast } = useAppStore();
  const { adminSettings } = useAdminStore();
  const confirm = useConfirm();
  const [rutas, setRutas]       = useState<RutaEntrega[]>([]);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Delete with PIN
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pinInput, setPinInput]     = useState('');
  const [deleting, setDeleting]     = useState(false);

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');

  useEffect(() => {
    async function load() {
      try {
        const list = await listRutasCompletadas();
        list.sort((a, b) => tsMs(b.completadaEn ?? b.createdAt) - tsMs(a.completadaEn ?? a.createdAt));
        setRutas(list);
      } catch {
        showToast('Error al cargar historial de rutas', 'error');
      } finally {
        setLoading(false);
      }
    }
    load();
    const channel = supabase
      .channel('historial-rutas-admin-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rutas' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    return rutas.filter(r => {
      const iso = fechaISO(r.completadaEn ?? r.createdAt);
      if (iso === '0000-00-00') return true;
      if (dateFrom && iso < dateFrom) return false;
      if (dateTo   && iso > dateTo)   return false;
      return true;
    });
  }, [rutas, dateFrom, dateTo]);

  // Group by date label
  const grouped = useMemo(() => {
    const map: Record<string, { label: string; rutas: RutaEntrega[] }> = {};
    filtered.forEach(r => {
      const ts = r.completadaEn ?? r.createdAt;
      if (!ts) {
        const key = 'sin-fecha';
        if (!map[key]) map[key] = { label: 'Sin fecha', rutas: [] };
        map[key].rutas.push(r);
        return;
      }
      const d = new Date(ts);
      const key = d.toISOString().slice(0, 10);
      if (!map[key]) {
        map[key] = {
          label: d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
          rutas: [],
        };
      }
      map[key].rutas.push(r);
    });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  // Summary
  const summary = useMemo(() => {
    const totalRutas = filtered.length;
    let totalRecaudo = 0;
    let totalDomicilios = 0;
    const domEarnings: Record<string, { nombre: string; rutas: number; recaudo: number; domicilios: number; pago: number }> = {};

    filtered.forEach(r => {
      const snapshot = (r.pedidosSnapshot ?? []) as Pedido[];
      const entregados = snapshot.filter(p => p.estado === 'entregado');
      const recaudo    = entregados.reduce((s, p) => s + p.total, 0);
      const domicilios = entregados.reduce((s, p) => s + (p.domicilio ?? 0), 0);
      totalRecaudo   += recaudo;
      totalDomicilios += domicilios;

      const domNombre = r.repartidor;
      if (domNombre) {
        if (!domEarnings[domNombre]) {
          const dom = Object.values(domiciliarios).find(d => d.nombre === domNombre);
          domEarnings[domNombre] = { nombre: domNombre, rutas: 0, recaudo: 0, domicilios: 0, pago: dom?.pagoBase ?? 0 };
        }
        domEarnings[domNombre].rutas++;
        domEarnings[domNombre].recaudo   += recaudo;
        domEarnings[domNombre].domicilios += domicilios;
        const dom = Object.values(domiciliarios).find(d => d.nombre === domNombre);
        domEarnings[domNombre].pago = (dom?.pagoBase ?? 0) * domEarnings[domNombre].rutas;
      }
    });

    return { totalRutas, totalRecaudo, totalDomicilios, domEarnings: Object.values(domEarnings) };
  }, [filtered, domiciliarios]);

  function toggleExpand(id: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function startDelete(rutaId: string) {
    const pin = adminSettings?.historialPin ?? '';
    if (!pin) {
      const ok = await confirm({ title: 'Eliminar ruta', message: '¿Eliminar esta ruta del historial? Esta acción no se puede deshacer.', danger: true, confirmLabel: 'Eliminar' });
      if (ok) confirmDelete(rutaId, '');
      return;
    }
    setDeletingId(rutaId);
    setPinInput('');
  }

  async function confirmDelete(rutaId: string, pin: string) {
    const expectedPin = adminSettings?.historialPin ?? '';
    if (expectedPin && pin !== expectedPin) {
      showToast('PIN incorrecto', 'error');
      setPinInput('');
      return;
    }
    setDeleting(true);
    try {
      await deleteRuta(rutaId);
      setDeletingId(null);
      showToast('Ruta eliminada del historial', 'success');
    } catch {
      showToast('Error al eliminar la ruta', 'error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ fontWeight: 700, fontSize: 16, margin: 0 }}>Historial de rutas</h3>
        <span style={{ fontSize: 13, color: 'var(--text3)' }}>
          {rutas.length} ruta{rutas.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Filters */}
      {rutas.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <Calendar size={14} color="var(--text3)" />
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'inherit', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}
          />
          <span style={{ fontSize: 13, color: 'var(--text3)' }}>—</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'inherit', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); }}
              style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--text3)', fontFamily: 'inherit' }}
            >
              Limpiar
            </button>
          )}
        </div>
      )}

      {/* Summary */}
      {filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 14, padding: '10px 14px', background: 'var(--bg2)', borderRadius: 10, border: '1px solid var(--border)', flexWrap: 'wrap', fontSize: 13 }}>
            <span style={{ color: 'var(--text3)' }}>{summary.totalRutas} ruta{summary.totalRutas !== 1 ? 's' : ''}</span>
            <span style={{ fontWeight: 700, color: 'var(--success)' }}>{fmtPrice(summary.totalDomicilios)} en domicilios</span>
            <span style={{ fontWeight: 700, color: 'var(--brand)' }}>{fmtPrice(summary.totalRecaudo)} recaudado</span>
          </div>
          {summary.domEarnings.length > 0 && (
            <div style={{ padding: '12px 14px', background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
                Ganancias por domiciliario
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {summary.domEarnings.map(de => (
                  <div key={de.nombre} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, flexWrap: 'wrap' }}>
                    <Bike size={14} color="var(--brand)" />
                    <span style={{ fontWeight: 600, flex: 1 }}>{de.nombre}</span>
                    <span style={{ color: 'var(--text3)' }}>{de.rutas} ruta{de.rutas !== 1 ? 's' : ''}</span>
                    <span style={{ color: 'var(--success)', fontWeight: 700 }}>{fmtPrice(de.domicilios)} dom.</span>
                    {de.pago > 0 && (
                      <span style={{ color: 'var(--brand)', fontWeight: 700 }}>Pago: {fmtPrice(de.pago)}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ height: 72, borderRadius: 12, background: 'var(--bg2)', animation: 'pulse 1.4s ease-in-out infinite', opacity: 0.6 }} />
          ))}
        </div>
      ) : rutas.length === 0 ? (
        <div className="empty-s" style={{ flexDirection: 'column' }}>
          <Package size={36} style={{ margin: '0 auto 10px', opacity: .4 }} />
          No hay rutas completadas aún
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-s">Sin rutas para el período seleccionado.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {grouped.map(([dateKey, group]) => (
            <div key={dateKey}>
              {/* Date group header */}
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8, paddingLeft: 4 }}>
                {group.label}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {group.rutas.map(ruta => {
                  const isExp      = expanded.has(ruta.id);
                  const snapshot   = (ruta.pedidosSnapshot ?? []) as Pedido[];
                  const entregados = snapshot.filter(p => p.estado === 'entregado').length;
                  const cancelados = snapshot.filter(p => p.estado === 'cancelado').length;
                  const totalRecaudo = snapshot
                    .filter(p => p.estado === 'entregado')
                    .reduce((s, p) => s + p.total, 0);
                  const isPinDelete = deletingId === ruta.id;

                  return (
                    <div key={ruta.id} className="admin-card">
                      {/* Cabecera de la ruta */}
                      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => toggleExpand(ruta.id)}>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>{ruta.nombre}</div>
                          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            {ruta.repartidor && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <User size={11} /> {ruta.repartidor}
                              </span>
                            )}
                            {snapshot.length > 0 && (
                              <>
                                <span style={{ color: 'var(--success)', fontWeight: 600 }}>{entregados} entregados</span>
                                {cancelados > 0 && (
                                  <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{cancelados} cancelados</span>
                                )}
                                <span style={{ fontWeight: 700, color: 'var(--brand)' }}>{fmtPrice(totalRecaudo)}</span>
                              </>
                            )}
                            {ruta.completadaEn && (
                              <span>{fmtFecha(ruta.completadaEn)}</span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <button
                            onClick={() => startDelete(ruta.id)}
                            style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--danger-bg)', background: 'var(--danger-bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)' }}
                            title="Eliminar ruta"
                          >
                            <Trash2 size={13} />
                          </button>
                          <div style={{ cursor: 'pointer' }} onClick={() => toggleExpand(ruta.id)}>
                            {isExp
                              ? <ChevronUp size={16} color="var(--text3)" />
                              : <ChevronDown size={16} color="var(--text3)" />
                            }
                          </div>
                        </div>
                      </div>

                      {/* PIN confirm inline */}
                      {isPinDelete && (
                        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', background: 'var(--danger-bg)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, color: 'var(--danger)', fontWeight: 600, flex: 1 }}>
                            Ingresa el PIN para eliminar
                          </span>
                          <input
                            type="password"
                            placeholder="PIN"
                            value={pinInput}
                            onChange={e => setPinInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && confirmDelete(ruta.id, pinInput)}
                            autoFocus
                            style={{ width: 100, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'inherit', background: 'var(--surface)', color: 'var(--text)' }}
                          />
                          <button
                            onClick={() => confirmDelete(ruta.id, pinInput)}
                            disabled={deleting}
                            style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: 'var(--danger)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}
                          >
                            {deleting ? '...' : 'Eliminar'}
                          </button>
                          <button
                            onClick={() => { setDeletingId(null); setPinInput(''); }}
                            style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontFamily: 'inherit' }}
                          >
                            <X size={13} />
                          </button>
                        </div>
                      )}

                      {/* Paradas de la ruta */}
                      {isExp && (
                        <div style={{ borderTop: '1px solid var(--border)' }}>
                          {snapshot.length === 0 ? (
                            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                              Sin datos de pedidos en esta ruta
                            </div>
                          ) : (
                            snapshot.map((p, idx) => (
                              <div
                                key={p.id ?? idx}
                                style={{
                                  padding: '12px 16px',
                                  borderBottom: idx < snapshot.length - 1 ? '1px solid var(--border)' : 'none',
                                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10,
                                }}
                              >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                                    <span style={{ fontWeight: 700, fontSize: 13, fontFamily: 'monospace', color: 'var(--brand)' }}>
                                      #{p.numero}
                                    </span>
                                    <span style={{
                                      fontSize: 11, fontWeight: 600, borderRadius: 6, padding: '2px 8px',
                                      background: p.estado === 'entregado' ? 'var(--success-bg)' : 'var(--danger-bg)',
                                      color:      p.estado === 'entregado' ? 'var(--success)'    : 'var(--danger)',
                                      display: 'flex', alignItems: 'center', gap: 3,
                                    }}>
                                      {p.estado === 'entregado' && <CheckCircle size={10} />}
                                      {p.estado === 'entregado' ? 'Entregado' : 'Cancelado'}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: 14, fontWeight: 600 }}>{p.cliente?.nombre}</div>
                                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>
                                    {[p.cliente?.tel, p.cliente?.barrio, p.cliente?.dir].filter(Boolean).join(' · ')}
                                  </div>
                                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
                                    {p.items?.slice(0, 2).map((it, i) => (
                                      <span key={i}>{i > 0 ? ' · ' : ''}{it.qty}× {it.nombre}</span>
                                    ))}
                                    {(p.items?.length ?? 0) > 2 && ` +${p.items!.length - 2}`}
                                  </div>
                                </div>
                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                  <div style={{ fontWeight: 700, fontSize: 14 }}>{fmtPrice(p.total)}</div>
                                  {(p.domicilio ?? 0) > 0 && (
                                    <div style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600, marginTop: 2 }}>
                                      Dom: {fmtPrice(p.domicilio)}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
