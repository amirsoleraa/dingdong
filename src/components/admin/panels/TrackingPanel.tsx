import { useState, useEffect } from 'react';
import {
  MapPin, Plus, Trash2, CheckCircle, User, Package,
  ChevronDown, ChevronUp, ArrowUp, ArrowDown, Flag,
  XCircle, RotateCcw, ExternalLink,
} from 'lucide-react';
import { listRutasActivas, createRuta, updateRuta, deleteRuta } from '@/lib/data/rutas';
import { updatePedido as updatePedidoRemote, updatePedidosBulk } from '@/lib/data/pedidos';
import { createNotificacion } from '@/lib/data/notificaciones';
import { useAdminStore } from '@/stores/useAdminStore';
import { useAppStore } from '@/stores/useAppStore';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { fmtPrice, tsMs } from '@/lib/utils';
import type { RutaEntrega, Pedido } from '@/types';

// ── helpers ────────────────────────────────────────────────────────────────────

function move<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

// ── sub-componente: línea de tiempo de una ruta ────────────────────────────────

interface RouteTimelineProps {
  ruta: RutaEntrega;
  pedidos: Record<string, Pedido>;
  onReorder: (rutaId: string, newOrder: string[]) => Promise<void>;
  onDeliverStop: (rutaId: string, pedidoId: string) => Promise<void>;
  onCancelStop: (rutaId: string, pedidoId: string) => Promise<void>;
  onRescheduleStop: (rutaId: string, pedidoId: string) => Promise<void>;
  onAddOrder: (rutaId: string) => void;
  onFinalizar: (ruta: RutaEntrega) => Promise<void>;
  onEliminar: (id: string) => Promise<void>;
  onSelectPedido: (p: Pedido) => void;
}

function RouteTimeline({ ruta, pedidos, onReorder, onDeliverStop, onCancelStop, onRescheduleStop, onAddOrder, onFinalizar, onEliminar, onSelectPedido }: RouteTimelineProps) {
  const stops    = ruta.pedidoIds.map(id => pedidos[id]).filter(Boolean);
  const delivered = stops.filter(p => p.estado === 'entregado').length;
  const total     = stops.length;
  const pct       = total > 0 ? Math.round(delivered / total * 100) : 0;
  const allDone   = delivered === total && total > 0;

  return (
    <div style={{ borderTop: '1px solid var(--border)' }}>
      {/* Barra de progreso */}
      <div style={{ padding: '12px 16px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>
          <span>{delivered} de {total} entregado{delivered !== 1 ? 's' : ''}</span>
          <span style={{ fontWeight: 700, color: allDone ? 'var(--success)' : 'var(--text2)' }}>{pct}%</span>
        </div>
        <div style={{ height: 6, background: 'var(--bg2)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 10,
            background: allDone ? 'var(--success)' : 'var(--brand)',
            width: `${pct}%`,
            transition: 'width .4s ease',
          }} />
        </div>
      </div>

      {/* Línea de tiempo */}
      <div style={{ padding: '16px 16px 8px', position: 'relative' }}>
        {/* Línea vertical de fondo */}
        <div style={{
          position: 'absolute', left: 28, top: 16, bottom: 40,
          width: 2, background: 'var(--border)',
        }} />

        {ruta.pedidoIds.map((pid, idx) => {
          const p         = pedidos[pid];
          const isDone    = p?.estado === 'entregado';
          const isFirst   = idx === 0;
          const isLast    = idx === ruta.pedidoIds.length - 1;

          return (
            <div key={pid} style={{ display: 'flex', gap: 12, marginBottom: isLast ? 0 : 20, position: 'relative', zIndex: 1 }}>
              {/* Nodo de la línea de tiempo */}
              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: isDone ? 'var(--success)' : isFirst && !isDone ? 'var(--brand)' : 'var(--surface)',
                  border: `2px solid ${isDone ? 'var(--success)' : isFirst && !isDone ? 'var(--brand)' : 'var(--border)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: isFirst && !isDone ? '0 0 0 4px var(--brand-light)' : 'none',
                  transition: 'all .2s',
                }}>
                  {isDone
                    ? <CheckCircle size={14} color="#fff" />
                    : <span style={{ fontSize: 11, fontWeight: 700, color: isFirst ? '#fff' : 'var(--text3)' }}>{idx + 1}</span>
                  }
                </div>
              </div>

              {/* Contenido de la parada */}
              <div style={{
                flex: 1,
                background: isDone ? 'var(--bg)' : isFirst ? 'var(--brand-light)' : 'var(--surface)',
                borderRadius: 12,
                padding: '10px 12px',
                border: `1px solid ${isDone ? 'var(--border)' : isFirst ? 'var(--brand)' : 'var(--border)'}`,
                opacity: isDone ? 0.6 : 1,
                transition: 'all .2s',
              }}>
                {p ? (
                  <>
                    <div
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}
                      onClick={() => onSelectPedido(p)}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{p.cliente?.nombre}</div>
                        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                          {p.location
                            ? [p.location.barrio, p.location.notes].filter(Boolean).join(' · ')
                            : [p.cliente?.barrio, p.cliente?.dir].filter(Boolean).join(' · ')
                          }
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text3)' }}>{p.cliente?.tel}</div>
                        {p.location && (
                          <a
                            href={`https://www.google.com/maps?q=${p.location.lat},${p.location.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            style={{ fontSize: 11, color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 4, textDecoration: 'none' }}
                          >
                            <ExternalLink size={10} /> Google Maps
                          </a>
                        )}
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                          {p.items?.slice(0, 2).map((it, i) => (
                            <span key={i}>{i > 0 ? ' · ' : ''}{it.qty}× {it.nombre}</span>
                          ))}
                          {(p.items?.length ?? 0) > 2 && ` +${p.items!.length - 2}`}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 14 }}>{fmtPrice(p.total)}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>#{p.numero}</div>
                      </div>
                    </div>

                    {/* Acciones de la parada */}
                    {!isDone && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        {/* Reordenar */}
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            className="order-btn-icon"
                            onClick={() => !isFirst && onReorder(ruta.id, move(ruta.pedidoIds, idx, idx - 1))}
                            disabled={isFirst}
                            style={{ width: 32, height: 32, opacity: isFirst ? .3 : 1 }}
                            title="Subir parada"
                          >
                            <ArrowUp size={13} />
                          </button>
                          <button
                            className="order-btn-icon"
                            onClick={() => !isLast && onReorder(ruta.id, move(ruta.pedidoIds, idx, idx + 1))}
                            disabled={isLast}
                            style={{ width: 32, height: 32, opacity: isLast ? .3 : 1 }}
                            title="Bajar parada"
                          >
                            <ArrowDown size={13} />
                          </button>
                        </div>
                        {/* Entregar */}
                        <button
                          onClick={() => onDeliverStop(ruta.id, pid)}
                          style={{
                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            padding: '7px 12px', borderRadius: 10,
                            background: 'var(--success)', color: '#fff',
                            border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12,
                            fontFamily: 'inherit',
                          }}
                        >
                          <CheckCircle size={13} /> Marcar entregado
                        </button>
                        {/* Cancelar pedido */}
                        <button
                          onClick={() => onCancelStop(ruta.id, pid)}
                          style={{ width: 34, height: 34, borderRadius: 10, border: 'none', cursor: 'pointer', background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                          title="Cancelar pedido"
                        >
                          <XCircle size={15} />
                        </button>
                        {/* Reprogramar */}
                        <button
                          onClick={() => onRescheduleStop(ruta.id, pid)}
                          style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid var(--border)', cursor: 'pointer', background: 'var(--bg)', color: 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                          title="Reprogramar para otra ruta"
                        >
                          <RotateCcw size={14} />
                        </button>
                      </div>
                    )}

                    {isDone && (
                      <div style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600, marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <CheckCircle size={12} /> Entregado
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--text3)' }}>Pedido no disponible</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Acciones de la ruta */}
      <div style={{ padding: '8px 16px 14px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="ab ab-b" onClick={() => onAddOrder(ruta.id)} style={{ gap: 4, fontSize: 12 }}>
          <Plus size={12} /> Agregar pedido
        </button>
        <button className="ab ab-d" onClick={() => onEliminar(ruta.id)} style={{ gap: 4, fontSize: 12 }}>
          <Trash2 size={12} /> Eliminar ruta
        </button>
        <button
          className="btn-p"
          onClick={() => onFinalizar(ruta)}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13,
            background: allDone ? 'var(--success)' : undefined,
          }}
        >
          <Flag size={14} />
          {allDone ? 'Cerrar ruta ✓' : `Finalizar ruta (${delivered}/${total})`}
        </button>
      </div>
    </div>
  );
}

// ── panel principal ────────────────────────────────────────────────────────────

export function TrackingPanel() {
  const { pedidos, updatePedido: updatePedidoLocal } = useAdminStore();
  const { showToast, domiciliarios } = useAppStore();
  const confirm = useConfirm();

  const enCamino = Object.values(pedidos)
    .filter(p => p.estado === 'camino')
    .sort((a, b) => tsMs(a.createdAt) - tsMs(b.createdAt));

  const [selected, setSelected]             = useState<Set<string>>(new Set());
  const [nombreRuta, setNombreRuta]         = useState('');
  const [domiciliarioId, setDomiciliarioId] = useState('');
  const [creatingRuta, setCreatingRuta]     = useState(false);
  const [rutas, setRutas]                 = useState<RutaEntrega[]>([]);
  const [loadingRutas, setLoadingRutas]   = useState(true);
  const [expanded, setExpanded]           = useState<Set<string>>(new Set());
  const [addingToRutaId, setAddingToRutaId] = useState<string | null>(null);
  const [detallePedido, setDetallePedido] = useState<Pedido | null>(null);

  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function selectAll() { setSelected(new Set(enCamino.map(p => p.id))); }
  function clearSelection() { setSelected(new Set()); }
  function toggleExpand(id: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function loadRutas() {
    setLoadingRutas(true);
    try {
      const list = await listRutasActivas();
      list.sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));
      setRutas(list);
    } catch {
      showToast('Error al cargar rutas', 'error');
    } finally {
      setLoadingRutas(false);
    }
  }

  useEffect(() => { loadRutas(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCrearRuta() {
    if (selected.size === 0) { showToast('Selecciona al menos un pedido', 'error'); return; }
    if (!nombreRuta.trim())  { showToast('Escribe un nombre para la ruta', 'error'); return; }
    setCreatingRuta(true);
    try {
      const dom = domiciliarioId ? domiciliarios[domiciliarioId] : null;
      const nueva = await createRuta({
        nombre:         nombreRuta.trim(),
        repartidor:     dom?.nombre ?? '',
        domiciliarioId: domiciliarioId || '',
        pedidoIds:      [...selected],
        estado:         'activa',
      });
      setRutas(prev => [nueva, ...prev]);
      setExpanded(prev => new Set([...prev, nueva.id]));
      // Notify domiciliario of new route assignment
      if (dom?.id) {
        await createNotificacion({
          domiciliarioId: dom.id,
          tipo: 'asignacion_ruta',
          mensaje: `Te asignaron la ruta "${nombreRuta.trim()}" con ${selected.size} parada(s).`,
          rutaId: nueva.id,
        });
      }
      setNombreRuta(''); setDomiciliarioId(''); clearSelection();
      showToast('Ruta creada', 'success');
    } catch {
      showToast('Error al crear la ruta', 'error');
    } finally {
      setCreatingRuta(false);
    }
  }

  async function handleReorder(rutaId: string, newOrder: string[]) {
    await updateRuta(rutaId, { pedidoIds: newOrder });
    setRutas(prev => prev.map(r => r.id === rutaId ? { ...r, pedidoIds: newOrder } : r));
  }

  async function handleDeliverStop(rutaId: string, pedidoId: string) {
    const ok = await confirm({ title: 'Confirmar entrega', message: '¿Confirmar que este pedido fue entregado?', confirmLabel: 'Sí, entregado' });
    if (!ok) return;
    const ruta = rutas.find(r => r.id === rutaId);
    await updatePedidoRemote(pedidoId, {
      estado: 'entregado',
      rutaNombre:          ruta?.nombre          ?? '',
      repartidorNombre:    ruta?.repartidor       ?? '',
      domiciliarioId:      ruta?.domiciliarioId   ?? '',
    });
    updatePedidoLocal(pedidoId, { estado: 'entregado', rutaNombre: ruta?.nombre ?? '', repartidorNombre: ruta?.repartidor ?? '' });
    showToast('Pedido marcado como entregado', 'success');
  }

  async function handleCancelStop(rutaId: string, pedidoId: string) {
    const ok = await confirm({ title: 'Cancelar pedido', message: '¿Cancelar este pedido?', danger: true, confirmLabel: 'Cancelar pedido' });
    if (!ok) return;
    const ruta = rutas.find(r => r.id === rutaId)!;
    const newIds = ruta.pedidoIds.filter(id => id !== pedidoId);
    await Promise.all([
      updatePedidoRemote(pedidoId, {
        estado: 'cancelado',
        rutaNombre:       ruta.nombre,
        repartidorNombre: ruta.repartidor ?? '',
      }),
      updateRuta(rutaId, { pedidoIds: newIds }),
    ]);
    setRutas(prev => prev.map(r => r.id === rutaId ? { ...r, pedidoIds: newIds } : r));
    showToast('Pedido cancelado', 'success');
  }

  async function handleRescheduleStop(rutaId: string, pedidoId: string) {
    const ok = await confirm({ title: 'Reprogramar pedido', message: '¿Reprogramar este pedido? Se quitará de la ruta y quedará disponible para otra.', confirmLabel: 'Reprogramar' });
    if (!ok) return;
    const ruta = rutas.find(r => r.id === rutaId)!;
    const newIds = ruta.pedidoIds.filter(id => id !== pedidoId);
    await updateRuta(rutaId, { pedidoIds: newIds });
    setRutas(prev => prev.map(r => r.id === rutaId ? { ...r, pedidoIds: newIds } : r));
    showToast('Pedido reprogramado. Disponible para nueva ruta.', 'success');
  }

  async function handleAddOrderToRuta(rutaId: string, pedidoId: string) {
    const ruta = rutas.find(r => r.id === rutaId)!;
    if (ruta.pedidoIds.includes(pedidoId)) return;
    const newIds = [...ruta.pedidoIds, pedidoId];
    await updateRuta(rutaId, { pedidoIds: newIds });
    setRutas(prev => prev.map(r => r.id === rutaId ? { ...r, pedidoIds: newIds } : r));
    setAddingToRutaId(null);
    showToast('Pedido agregado a la ruta', 'success');
  }

  async function handleFinalizarRuta(ruta: RutaEntrega) {
    const ok = await confirm({ title: `Finalizar "${ruta.nombre}"`, message: 'Los pedidos pendientes se marcarán como Entregados.', confirmLabel: 'Finalizar ruta' });
    if (!ok) return;
    try {
      const snapshot = ruta.pedidoIds.map(pid => pedidos[pid]).filter(Boolean);
      await Promise.all([
        updateRuta(ruta.id, {
          estado: 'completada',
          completadaEn: new Date().toISOString(),
          pedidosSnapshot: snapshot,
        }),
        updatePedidosBulk(ruta.pedidoIds, {
          estado: 'entregado',
          rutaNombre:       ruta.nombre,
          repartidorNombre: ruta.repartidor     ?? '',
          domiciliarioId:   ruta.domiciliarioId ?? '',
        }).catch(() => {}),
      ]);
      setRutas(prev => prev.filter(r => r.id !== ruta.id));
      showToast('Ruta cerrada', 'success');
    } catch {
      showToast('Error al finalizar la ruta', 'error');
    }
  }

  async function handleEliminarRuta(id: string) {
    const ok = await confirm({ title: 'Eliminar ruta', message: '¿Eliminar esta ruta? Los pedidos no cambiarán de estado.', danger: true, confirmLabel: 'Eliminar' });
    if (!ok) return;
    await deleteRuta(id);
    setRutas(prev => prev.filter(r => r.id !== id));
    showToast('Ruta eliminada');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Pedidos en camino ── */}
      <div className="admin-card">
        <div className="admin-card-hdr">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MapPin size={16} color="var(--brand)" />
            Pedidos en camino ({enCamino.length})
          </h3>
          {enCamino.length > 0 && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="ab ab-b" onClick={selectAll} style={{ fontSize: 12 }}>Todos</button>
              {selected.size > 0 && (
                <button className="ab ab-e" onClick={clearSelection} style={{ fontSize: 12 }}>Limpiar</button>
              )}
            </div>
          )}
        </div>

        {enCamino.length === 0 ? (
          <div className="empty-s" style={{ padding: '28px 0' }}>
            <MapPin size={36} style={{ margin: '0 auto 10px', opacity: .4 }} />
            No hay pedidos en camino
          </div>
        ) : (
          <div>
            {enCamino.map(p => {
              const isSel    = selected.has(p.id);
              const yaEnRuta = rutas.some(r => r.pedidoIds.includes(p.id));
              return (
                <div
                  key={p.id}
                  onClick={() => !yaEnRuta && toggleSelect(p.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 16px', borderBottom: '1px solid var(--border)',
                    cursor: yaEnRuta ? 'default' : 'pointer',
                    background: isSel ? 'var(--brand-light)' : yaEnRuta ? 'var(--bg2)' : 'transparent',
                    transition: 'background .15s',
                  }}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                    border: `2px solid ${isSel ? 'var(--brand)' : 'var(--border)'}`,
                    background: isSel ? 'var(--brand)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all .15s',
                  }}>
                    {isSel && <CheckCircle size={12} color="#fff" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 13, fontFamily: 'monospace', color: 'var(--brand)' }}>
                        #{p.numero}
                      </span>
                      {yaEnRuta && (
                        <span style={{ fontSize: 11, background: 'var(--info-bg)', color: '#1D4ED8', borderRadius: 6, padding: '1px 7px', fontWeight: 600 }}>
                          en ruta
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 1 }}>{p.cliente?.nombre}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>
                      {[p.cliente?.barrio, p.cliente?.dir].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{fmtPrice(p.total)}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Crear ruta ── */}
      {selected.size > 0 && (
        <div className="admin-card" style={{ border: '2px solid var(--brand)' }}>
          <div className="admin-card-hdr">
            <h3 style={{ color: 'var(--brand)' }}>
              Nueva ruta — {selected.size} parada{selected.size > 1 ? 's' : ''}
            </h3>
          </div>
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
              {enCamino.filter(p => selected.has(p.id)).map((p, i, arr) => (
                <div key={p.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                  padding: '4px 0',
                  borderBottom: i < arr.length - 1 ? '1px dashed var(--border)' : 'none',
                }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>#{p.numero}</span>
                    <span style={{ color: 'var(--text2)', marginLeft: 6 }}>{p.cliente?.nombre}</span>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                      {[p.cliente?.barrio, p.cliente?.dir].filter(Boolean).join(', ')}
                    </div>
                  </div>
                  <span style={{ fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>{fmtPrice(p.total)}</span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                <span>Total recaudo</span>
                <span style={{ color: 'var(--brand)' }}>
                  {fmtPrice(enCamino.filter(p => selected.has(p.id)).reduce((s, p) => s + p.total, 0))}
                </span>
              </div>
            </div>

            <div className="f-field" style={{ margin: 0 }}>
              <label>Nombre de la ruta *</label>
              <input value={nombreRuta} onChange={e => setNombreRuta(e.target.value)} placeholder="Ej: Ruta Norte — Turno 1" />
            </div>
            <div className="f-field" style={{ margin: 0 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <User size={12} /> Domiciliario (opcional)
              </label>
              <select
                value={domiciliarioId}
                onChange={e => setDomiciliarioId(e.target.value)}
                style={{ fontFamily: 'inherit' }}
              >
                <option value="">Sin asignar</option>
                {Object.values(domiciliarios)
                  .filter(d => d.activo)
                  .sort((a, b) => a.nombre.localeCompare(b.nombre))
                  .map(d => (
                    <option key={d.id} value={d.id}>{d.nombre}</option>
                  ))
                }
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
              <button className="btn-s" onClick={clearSelection}>Cancelar</button>
              <button className="btn-p" onClick={handleCrearRuta} disabled={creatingRuta}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Plus size={15} />
                {creatingRuta ? 'Creando...' : 'Crear ruta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rutas activas ── */}
      <div>
        <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Rutas activas ({rutas.length})</h3>

        {loadingRutas ? (
          <div className="empty-s">Cargando rutas...</div>
        ) : rutas.length === 0 ? (
          <div className="empty-s">
            <Package size={36} style={{ margin: '0 auto 10px', opacity: .4 }} />
            No hay rutas activas. Selecciona pedidos para crear una.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {rutas.map(ruta => {
              const rutaPedidos = ruta.pedidoIds.map(id => pedidos[id]).filter(Boolean);
              const delivered   = rutaPedidos.filter(p => p.estado === 'entregado').length;
              const isExp       = expanded.has(ruta.id);
              const totalRuta   = rutaPedidos.reduce((s, p) => s + p.total, 0);

              return (
                <div key={ruta.id} className="admin-card">
                  {/* Header colapsable */}
                  <div
                    style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
                    onClick={() => toggleExpand(ruta.id)}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{ruta.nombre}</div>
                      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                        {ruta.repartidor && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <User size={11} /> {ruta.repartidor}
                          </span>
                        )}
                        <span>{delivered}/{ruta.pedidoIds.length} entregados</span>
                        <span style={{ fontWeight: 600, color: 'var(--brand)' }}>{fmtPrice(totalRuta)}</span>
                      </div>
                    </div>
                    {isExp ? <ChevronUp size={16} color="var(--text3)" /> : <ChevronDown size={16} color="var(--text3)" />}
                  </div>

                  {/* Línea de tiempo */}
                  {isExp && (
                    <RouteTimeline
                      ruta={ruta}
                      pedidos={pedidos}
                      onReorder={handleReorder}
                      onDeliverStop={handleDeliverStop}
                      onCancelStop={handleCancelStop}
                      onRescheduleStop={handleRescheduleStop}
                      onAddOrder={setAddingToRutaId}
                      onFinalizar={handleFinalizarRuta}
                      onEliminar={handleEliminarRuta}
                      onSelectPedido={setDetallePedido}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: detalle de pedido desde ruta */}
      <Modal isOpen={!!detallePedido} onClose={() => setDetallePedido(null)} title={`Pedido #${detallePedido?.numero}`} maxWidth={480}>
        {detallePedido && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text3)', marginBottom: 8, fontWeight: 600 }}>Cliente</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{detallePedido.cliente?.nombre}</div>
              {detallePedido.cliente?.tel    && <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>{detallePedido.cliente.tel}</div>}
              {detallePedido.cliente?.correo && <div style={{ fontSize: 13, color: 'var(--text2)' }}>{detallePedido.cliente.correo}</div>}
              {!detallePedido.location && (
                <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                  {[detallePedido.cliente?.dir, detallePedido.cliente?.barrio, detallePedido.cliente?.comp].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>

            {detallePedido.location && (
              <div style={{ background: 'var(--bg)', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text3)', marginBottom: 8, fontWeight: 600 }}>Ubicación GPS</div>
                {detallePedido.location.barrio && (
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>🏘 {detallePedido.location.barrio}</div>
                )}
                {detallePedido.location.notes && (
                  <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 2 }}>📝 {detallePedido.location.notes}</div>
                )}
                {detallePedido.location.address && (
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>{detallePedido.location.address}</div>
                )}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  {detallePedido.location.distance_km > 0 && (
                    <span style={{ fontSize: 12, color: 'var(--text2)' }}>📏 {detallePedido.location.distance_km} km</span>
                  )}
                  <a
                    href={`https://www.google.com/maps?q=${detallePedido.location.lat},${detallePedido.location.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      fontSize: 13, fontWeight: 600, color: 'var(--brand)',
                      textDecoration: 'none', padding: '7px 12px',
                      borderRadius: 8, border: '1px solid var(--brand)',
                    }}
                  >
                    <ExternalLink size={13} /> Abrir en Google Maps
                  </a>
                </div>
              </div>
            )}

            <div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text3)', marginBottom: 8, fontWeight: 600 }}>Productos</div>
              {detallePedido.items?.map((it, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                  <span>{it.qty}× {it.nombre}{it.extras?.length > 0 && <small style={{ color: 'var(--text3)', marginLeft: 6 }}>+{it.extras.join(', ')}</small>}</span>
                  <span style={{ fontWeight: 600 }}>{fmtPrice(it.precio * it.qty)}</span>
                </div>
              ))}
              {detallePedido.promosAplicadas?.map((p, i) => (
                <div key={`promo-${i}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: '1px solid var(--border)', color: 'var(--success)' }}>
                  <span>
                    {p.tipo === 'compra_lleva' && p.productoBNombre
                      ? `+ ${p.cantidadBReal ?? 1}× ${p.productoBNombre} (gratis)`
                      : p.nombre}
                  </span>
                  <span style={{ fontWeight: 600 }}>
                    {p.isVirtualGift ? 'Promo' : p.descuentoProducto ? `-${fmtPrice(p.descuentoProducto)}` : ''}
                  </span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 16, color: 'var(--brand)', marginTop: 10 }}>
                <span>Total</span><span>{fmtPrice(detallePedido.total)}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: agregar pedido a ruta */}
      {addingToRutaId && (
        <Modal isOpen onClose={() => setAddingToRutaId(null)} title="Agregar pedido a la ruta" maxWidth={460}>
          {(() => {
            const rutaForAdd = rutas.find(r => r.id === addingToRutaId);
            const allActive  = (Object.values(pedidos) as Pedido[])
              .filter(p => ['activos', 'preparando', 'camino'].includes(p.estado))
              .sort((a, b) => tsMs(a.createdAt) - tsMs(b.createdAt));
            const unassigned = rutaForAdd
              ? allActive.filter(p => !rutaForAdd.pedidoIds.includes(p.id))
              : [];
            if (unassigned.length === 0) return (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text3)' }}>
                No hay pedidos en camino disponibles para agregar
              </div>
            );
            return (
              <div>
                {unassigned.map(p => (
                  <div
                    key={p.id}
                    onClick={() => handleAddOrderToRuta(addingToRutaId, p.id)}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '12px 0', borderBottom: '1px solid var(--border)',
                      cursor: 'pointer', gap: 12,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--brand)' }}>#{p.numero}</div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{p.cliente?.nombre}</div>
                      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>
                        {[p.cliente?.barrio, p.cliente?.dir].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{fmtPrice(p.total)}</div>
                  </div>
                ))}
              </div>
            );
          })()}
        </Modal>
      )}
    </div>
  );
}
