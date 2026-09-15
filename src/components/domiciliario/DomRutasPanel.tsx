import { useState, useEffect, useRef } from 'react';
import {
  MapPin, CheckCircle, Flag, ChevronDown, ChevronUp,
  Plus, Trash2, ArrowUp, ArrowDown, XCircle, RotateCcw,
  ExternalLink, Package, AlertTriangle,
} from 'lucide-react';
import { domSupabase } from '@/lib/supabase';
import { subscribeToRutas, createRuta, updateRuta, deleteRuta } from '@/lib/data/rutas';
import { updatePedido, listPedidosByIds } from '@/lib/data/pedidos';
import { createNotificacion } from '@/lib/data/notificaciones';
import { createHistorialRuta } from '@/lib/data/historial';
import { useAppStore } from '@/stores/useAppStore';
import { useAdminStore } from '@/stores/useAdminStore';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { fmtPrice, tsMs } from '@/lib/utils';
import type { RutaEntrega, Pedido, Domiciliario } from '@/types';

function move<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next;
}

interface DomRutasPanelProps { domiciliario: Domiciliario; }

export function DomRutasPanel({ domiciliario }: DomRutasPanelProps) {
  const { showToast, domiciliarios } = useAppStore();
  const { pedidos, setPedidos } = useAdminStore();
  const confirm = useConfirm();

  const [rutas,        setRutas]        = useState<RutaEntrega[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [expanded,     setExpanded]     = useState<Set<string>>(new Set());
  const [detalle,      setDetalle]      = useState<Pedido | null>(null);
  const [creatingRuta, setCreatingRuta] = useState(false);
  const [nombreRuta,   setNombreRuta]   = useState('');
  const [selected,     setSelected]     = useState<Set<string>>(new Set());

  // Reassign modal state
  const [addingToRuta, setAddingToRuta] = useState<string | null>(null);
  const [addSelected,  setAddSelected]  = useState<Set<string>>(new Set());

  const [reassignPedidoId,  setReassignPedidoId]  = useState<string | null>(null);
  const [reassignRutaId,    setReassignRutaId]     = useState<string | null>(null);
  const [reassignTargetId,  setReassignTargetId]   = useState('');
  const [reassignNovedad,   setReassignNovedad]    = useState('');
  const [savingReassign,    setSavingReassign]     = useState(false);

  const enCamino = Object.values(pedidos)
    .filter(p => p.estado === 'camino' && (!p.domiciliarioId || p.domiciliarioId === domiciliario.id))
    .sort((a, b) => tsMs(a.createdAt) - tsMs(b.createdAt));

  const fetchedPedidoIds = useRef<Set<string>>(new Set());

  // Real-time subscription to active routes
  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToRutas({ domiciliarioId: domiciliario.id }, list => {
      list.sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));
      setRutas(list);
      setLoading(false);
    }, domSupabase);
    return unsub;
  }, [domiciliario.id]);

  // Fetch any pedidos not yet in the store when routes change
  useEffect(() => {
    const allIds = rutas.flatMap(r => r.pedidoIds);
    const missingIds = allIds.filter(id => !pedidos[id] && !fetchedPedidoIds.current.has(id));
    if (missingIds.length === 0) return;
    missingIds.forEach(id => fetchedPedidoIds.current.add(id));
    listPedidosByIds(missingIds, domSupabase)
      .then(fetched => {
        if (Object.keys(fetched).length > 0) setPedidos(prev => ({ ...prev, ...fetched }));
      })
      .catch(() => {});
  }, [rutas]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCrearRuta() {
    if (selected.size === 0) { showToast('Selecciona al menos un pedido', 'error'); return; }
    if (!nombreRuta.trim())  { showToast('Escribe un nombre para la ruta', 'error'); return; }
    setCreatingRuta(true);
    try {
      const nueva = await createRuta({
        nombre: nombreRuta.trim(),
        repartidor: domiciliario.nombre,
        domiciliarioId: domiciliario.id,
        pedidoIds: [...selected],
        estado: 'activa',
      }, domSupabase);
      setRutas(prev => [nueva, ...prev]);
      setExpanded(prev => new Set([...prev, nueva.id]));
      setNombreRuta(''); setSelected(new Set());
      showToast('Ruta creada', 'success');
    } catch { showToast('Error al crear la ruta', 'error'); }
    finally { setCreatingRuta(false); }
  }

  async function handleReorder(rutaId: string, newOrder: string[]) {
    try {
      await updateRuta(rutaId, { pedidoIds: newOrder }, domSupabase);
      setRutas(prev => prev.map(r => r.id === rutaId ? { ...r, pedidoIds: newOrder } : r));
    } catch { showToast('Error al reordenar', 'error'); }
  }

  async function handleDeliverStop(rutaId: string, pedidoId: string) {
    const ok = await confirm({ title: 'Confirmar entrega', message: '¿Confirmar que este pedido fue entregado?', confirmLabel: 'Sí, entregado' });
    if (!ok) return;
    const ruta = rutas.find(r => r.id === rutaId);
    await updatePedido(pedidoId, {
      estado: 'entregado',
      rutaNombre: ruta?.nombre ?? '',
      repartidorNombre: domiciliario.nombre,
      domiciliarioId: domiciliario.id,
    }, domSupabase);
    showToast('Pedido marcado como entregado', 'success');
  }

  async function handleCancelStop(rutaId: string, pedidoId: string) {
    const ok = await confirm({ title: 'Cancelar pedido', message: '¿Cancelar este pedido?', danger: true, confirmLabel: 'Cancelar pedido' });
    if (!ok) return;
    const ruta = rutas.find(r => r.id === rutaId)!;
    const newIds = ruta.pedidoIds.filter(id => id !== pedidoId);
    await Promise.all([
      updatePedido(pedidoId, { estado: 'cancelado', rutaNombre: ruta.nombre, repartidorNombre: domiciliario.nombre }, domSupabase),
      updateRuta(rutaId, { pedidoIds: newIds }, domSupabase),
    ]);
    setRutas(prev => prev.map(r => r.id === rutaId ? { ...r, pedidoIds: newIds } : r));
    showToast('Pedido cancelado', 'success');
  }

  async function handleRescheduleStop(rutaId: string, pedidoId: string) {
    const ok = await confirm({ title: 'Reprogramar pedido', message: '¿Reprogramar este pedido? Se quitará de la ruta.', confirmLabel: 'Reprogramar' });
    if (!ok) return;
    const ruta = rutas.find(r => r.id === rutaId)!;
    const newIds = ruta.pedidoIds.filter(id => id !== pedidoId);
    await updateRuta(rutaId, { pedidoIds: newIds }, domSupabase);
    setRutas(prev => prev.map(r => r.id === rutaId ? { ...r, pedidoIds: newIds } : r));
    showToast('Pedido reprogramado', 'success');
  }

  function openReassign(rutaId: string, pedidoId: string) {
    setReassignRutaId(rutaId); setReassignPedidoId(pedidoId);
    setReassignTargetId(''); setReassignNovedad('');
  }

  async function handleReassign() {
    if (!reassignNovedad.trim()) { showToast('Debes dejar una novedad antes de reasignar', 'error'); return; }
    if (!reassignTargetId) { showToast('Selecciona el domiciliario al que reasignas', 'error'); return; }
    setSavingReassign(true);
    try {
      const targetDom = domiciliarios[reassignTargetId];
      // Remove from current route
      const ruta = rutas.find(r => r.id === reassignRutaId)!;
      const newIds = ruta.pedidoIds.filter(id => id !== reassignPedidoId);
      await updateRuta(reassignRutaId!, { pedidoIds: newIds }, domSupabase);
      // Update pedido domiciliarioId
      await updatePedido(reassignPedidoId!, {
        domiciliarioId: reassignTargetId,
        repartidorNombre: targetDom.nombre,
        notaPendiente: reassignNovedad.trim(),
      }, domSupabase);
      // Notify the target domiciliario
      await createNotificacion({
        domiciliarioId: reassignTargetId,
        tipo: 'reasignacion',
        mensaje: `${domiciliario.nombre} te reasignó un pedido. Novedad: "${reassignNovedad.trim()}"`,
        pedidoId: reassignPedidoId!,
      }, domSupabase);
      setRutas(prev => prev.map(r => r.id === reassignRutaId ? { ...r, pedidoIds: newIds } : r));
      setReassignPedidoId(null); setReassignRutaId(null);
      showToast('Pedido reasignado', 'success');
    } catch { showToast('Error al reasignar', 'error'); }
    finally { setSavingReassign(false); }
  }

  async function handleFinalizarRuta(ruta: RutaEntrega) {
    const ok = await confirm({ title: `Finalizar "${ruta.nombre}"`, message: 'Los pedidos pendientes se marcarán como Entregados y quedarán en tu historial.', confirmLabel: 'Finalizar ruta' });
    if (!ok) return;
    try {
      const snapshot = ruta.pedidoIds.map(pid => pedidos[pid]).filter(Boolean);
      await Promise.all([
        updateRuta(ruta.id, { estado: 'completada', completadaEn: new Date().toISOString(), pedidosSnapshot: snapshot }, domSupabase),
        ...ruta.pedidoIds.map(pid =>
          updatePedido(pid, {
            estado: 'entregado',
            rutaNombre: ruta.nombre,
            repartidorNombre: domiciliario.nombre,
            domiciliarioId: domiciliario.id,
          }, domSupabase).catch(() => {})
        ),
      ]);

      // Save immediately to historial_rutas so domiciliario can see it right away
      const ahora = new Date();
      const fecha = ahora.toISOString().slice(0, 10);
      const fechaLabel = ahora.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
      await createHistorialRuta({
        fecha, fechaLabel,
        rutaNombre: ruta.nombre,
        domiciliarioId: domiciliario.id,
        domiciliarioNombre: domiciliario.nombre,
        pedidos: snapshot.map(p => ({
          ...p,
          estado: 'entregado',
          rutaNombre: ruta.nombre,
          repartidorNombre: domiciliario.nombre,
          domiciliarioId: domiciliario.id,
        })),
      }, domSupabase);

      setRutas(prev => prev.filter(r => r.id !== ruta.id));
      showToast('Ruta finalizada y guardada en historial', 'success');
    } catch { showToast('Error al finalizar la ruta', 'error'); }
  }

  async function handleAddToRuta() {
    if (!addingToRuta || addSelected.size === 0) return;
    try {
      const ruta = rutas.find(r => r.id === addingToRuta)!;
      const newIds = [...new Set([...ruta.pedidoIds, ...addSelected])];
      await updateRuta(addingToRuta, { pedidoIds: newIds }, domSupabase);
      setRutas(prev => prev.map(r => r.id === addingToRuta ? { ...r, pedidoIds: newIds } : r));
      setAddingToRuta(null);
      setAddSelected(new Set());
      showToast(`${addSelected.size} pedido${addSelected.size !== 1 ? 's' : ''} agregado${addSelected.size !== 1 ? 's' : ''} a la ruta`, 'success');
    } catch { showToast('Error al agregar pedidos a la ruta', 'error'); }
  }

  async function handleEliminarRuta(id: string) {
    const ok = await confirm({ title: 'Eliminar ruta', message: '¿Eliminar esta ruta?', danger: true, confirmLabel: 'Eliminar' });
    if (!ok) return;
    try {
      await deleteRuta(id, domSupabase);
      setRutas(prev => prev.filter(r => r.id !== id));
      showToast('Ruta eliminada');
    } catch { showToast('Error al eliminar la ruta', 'error'); }
  }

  const otrosDomiciliarios = Object.values(domiciliarios)
    .filter(d => d.activo && d.id !== domiciliario.id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Pedidos disponibles */}
      <div className="admin-card">
        <div className="admin-card-hdr">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MapPin size={16} color="var(--brand)" />
            Pedidos en camino ({enCamino.length})
          </h3>
          {enCamino.length > 0 && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="ab ab-b" onClick={() => setSelected(new Set(enCamino.map(p => p.id)))} style={{ fontSize: 12 }}>Todos</button>
              {selected.size > 0 && (
                <button className="ab ab-e" onClick={() => setSelected(new Set())} style={{ fontSize: 12 }}>Limpiar</button>
              )}
            </div>
          )}
        </div>
        {enCamino.length === 0 ? (
          <div className="empty-s" style={{ padding: '28px 0' }}>
            <MapPin size={36} style={{ margin: '0 auto 10px', opacity: .4 }} />
            No hay pedidos asignados a ti en camino
          </div>
        ) : (
          <div>
            {enCamino.map(p => {
              const isSel    = selected.has(p.id);
              const yaEnRuta = rutas.some(r => r.pedidoIds.includes(p.id));
              return (
                <div
                  key={p.id}
                  onClick={() => !yaEnRuta && setSelected(prev => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                    borderBottom: '1px solid var(--border)', cursor: yaEnRuta ? 'default' : 'pointer',
                    background: isSel ? 'var(--brand-light)' : yaEnRuta ? 'var(--bg2)' : 'transparent',
                  }}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                    border: `2px solid ${isSel ? 'var(--brand)' : 'var(--border)'}`,
                    background: isSel ? 'var(--brand)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isSel && <CheckCircle size={12} color="#fff" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 13, fontFamily: 'monospace', color: 'var(--brand)' }}>#{p.numero}</span>
                      {yaEnRuta && <span style={{ fontSize: 11, background: 'var(--info-bg,#dbeafe)', color: '#1D4ED8', borderRadius: 6, padding: '1px 7px', fontWeight: 600 }}>en ruta</span>}
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

      {/* Crear ruta */}
      {selected.size > 0 && (
        <div className="admin-card" style={{ border: '2px solid var(--brand)' }}>
          <div className="admin-card-hdr">
            <h3 style={{ color: 'var(--brand)' }}>Nueva ruta — {selected.size} parada{selected.size > 1 ? 's' : ''}</h3>
          </div>
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="f-field" style={{ margin: 0 }}>
              <label>Nombre de la ruta *</label>
              <input value={nombreRuta} onChange={e => setNombreRuta(e.target.value)} placeholder="Ej: Ruta Norte — Turno 1" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button className="btn-s" onClick={() => setSelected(new Set())}>Cancelar</button>
              <button className="btn-p" onClick={handleCrearRuta} disabled={creatingRuta}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Plus size={15} />
                {creatingRuta ? 'Creando...' : 'Crear ruta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rutas activas */}
      <div>
        <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Mis rutas activas ({rutas.length})</h3>
        {loading ? (
          <div className="empty-s">Cargando rutas...</div>
        ) : rutas.length === 0 ? (
          <div className="empty-s">
            <Package size={36} style={{ margin: '0 auto 10px', opacity: .4 }} />
            No tienes rutas activas
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {rutas.map(ruta => {
              const rutaPedidos = ruta.pedidoIds.map(id => pedidos[id]).filter(Boolean);
              const delivered   = rutaPedidos.filter(p => p.estado === 'entregado').length;
              const isExp       = expanded.has(ruta.id);
              const allDone     = delivered === rutaPedidos.length && rutaPedidos.length > 0;
              const pct         = rutaPedidos.length > 0 ? Math.round(delivered / rutaPedidos.length * 100) : 0;

              return (
                <div key={ruta.id} className="admin-card">
                  <div style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
                    onClick={() => setExpanded(prev => { const n = new Set(prev); n.has(ruta.id) ? n.delete(ruta.id) : n.add(ruta.id); return n; })}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{ruta.nombre}</div>
                      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3, display: 'flex', gap: 14 }}>
                        <span>{delivered}/{ruta.pedidoIds.length} entregados</span>
                        <span style={{ fontWeight: 600, color: 'var(--brand)' }}>
                          {fmtPrice(rutaPedidos.reduce((s, p) => s + p.total, 0))}
                        </span>
                      </div>
                    </div>
                    {isExp ? <ChevronUp size={16} color="var(--text3)" /> : <ChevronDown size={16} color="var(--text3)" />}
                  </div>

                  {isExp && (
                    <div style={{ borderTop: '1px solid var(--border)' }}>
                      {/* Progress bar */}
                      <div style={{ padding: '12px 16px 0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>
                          <span>{delivered} de {rutaPedidos.length} entregado{delivered !== 1 ? 's' : ''}</span>
                          <span style={{ fontWeight: 700, color: allDone ? 'var(--success)' : 'var(--text2)' }}>{pct}%</span>
                        </div>
                        <div style={{ height: 6, background: 'var(--bg2)', borderRadius: 10, overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 10, background: allDone ? 'var(--success)' : 'var(--brand)', width: `${pct}%`, transition: 'width .4s' }} />
                        </div>
                      </div>

                      {/* Stops */}
                      <div style={{ padding: '16px 16px 8px', position: 'relative' }}>
                        <div style={{ position: 'absolute', left: 28, top: 16, bottom: 40, width: 2, background: 'var(--border)' }} />
                        {ruta.pedidoIds.map((pid, idx) => {
                          const p      = pedidos[pid];
                          const isDone = p?.estado === 'entregado';
                          const isFirst = idx === 0;
                          const isLast  = idx === ruta.pedidoIds.length - 1;
                          return (
                            <div key={pid} style={{ display: 'flex', gap: 12, marginBottom: isLast ? 0 : 20, position: 'relative', zIndex: 1 }}>
                              <div style={{ flexShrink: 0 }}>
                                <div style={{
                                  width: 28, height: 28, borderRadius: '50%',
                                  background: isDone ? 'var(--success)' : isFirst ? 'var(--brand)' : 'var(--surface)',
                                  border: `2px solid ${isDone ? 'var(--success)' : isFirst ? 'var(--brand)' : 'var(--border)'}`,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  boxShadow: isFirst && !isDone ? '0 0 0 4px var(--brand-light)' : 'none',
                                }}>
                                  {isDone ? <CheckCircle size={14} color="#fff" /> : <span style={{ fontSize: 11, fontWeight: 700, color: isFirst ? '#fff' : 'var(--text3)' }}>{idx + 1}</span>}
                                </div>
                              </div>
                              <div style={{
                                flex: 1, background: isDone ? 'var(--bg)' : isFirst ? 'var(--brand-light)' : 'var(--surface)',
                                borderRadius: 12, padding: '10px 12px',
                                border: `1px solid ${isDone ? 'var(--border)' : isFirst ? 'var(--brand)' : 'var(--border)'}`,
                                opacity: isDone ? 0.6 : 1,
                              }}>
                                {p ? (
                                  <>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }} onClick={() => setDetalle(p)}>
                                      <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 700, fontSize: 13 }}>{p.cliente?.nombre}</div>
                                        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                                          {p.location ? [p.location.barrio, p.location.notes].filter(Boolean).join(' · ') : [p.cliente?.barrio, p.cliente?.dir].filter(Boolean).join(' · ')}
                                        </div>
                                        {p.location && (
                                          <a href={`https://www.google.com/maps?q=${p.location.lat},${p.location.lng}`} target="_blank" rel="noopener noreferrer"
                                            onClick={e => e.stopPropagation()}
                                            style={{ fontSize: 11, color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 4, textDecoration: 'none' }}>
                                            <ExternalLink size={10} /> Maps
                                          </a>
                                        )}
                                      </div>
                                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                        <div style={{ fontWeight: 800, fontSize: 14 }}>{fmtPrice(p.total)}</div>
                                        {p.domicilio > 0 && (
                                          <div style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>Dom: {fmtPrice(p.domicilio)}</div>
                                        )}
                                      </div>
                                    </div>
                                    {!isDone && (
                                      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                          <button className="order-btn-icon" onClick={() => !isFirst && handleReorder(ruta.id, move(ruta.pedidoIds, idx, idx - 1))} disabled={isFirst} style={{ width: 32, height: 32, opacity: isFirst ? .3 : 1 }}><ArrowUp size={13} /></button>
                                          <button className="order-btn-icon" onClick={() => !isLast && handleReorder(ruta.id, move(ruta.pedidoIds, idx, idx + 1))} disabled={isLast} style={{ width: 32, height: 32, opacity: isLast ? .3 : 1 }}><ArrowDown size={13} /></button>
                                        </div>
                                        <button onClick={() => handleDeliverStop(ruta.id, pid)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 12px', borderRadius: 10, background: 'var(--success)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12, fontFamily: 'inherit' }}>
                                          <CheckCircle size={13} /> Marcar entregado
                                        </button>
                                        <button onClick={() => openReassign(ruta.id, pid)} title="Reasignar a otro domiciliario" style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid var(--border)', cursor: 'pointer', background: 'var(--bg)', color: 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                          <AlertTriangle size={14} />
                                        </button>
                                        <button onClick={() => handleCancelStop(ruta.id, pid)} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', cursor: 'pointer', background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                          <XCircle size={15} />
                                        </button>
                                        <button onClick={() => handleRescheduleStop(ruta.id, pid)} style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid var(--border)', cursor: 'pointer', background: 'var(--bg)', color: 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                          <RotateCcw size={14} />
                                        </button>
                                      </div>
                                    )}
                                    {isDone && <div style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600, marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={12} /> Entregado</div>}
                                  </>
                                ) : (
                                  <div style={{ fontSize: 13, color: 'var(--text3)' }}>Pedido no disponible</div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Route actions */}
                      <div style={{ padding: '8px 16px 14px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button className="ab ab-d" onClick={() => handleEliminarRuta(ruta.id)} style={{ gap: 4, fontSize: 12 }}><Trash2 size={12} /> Eliminar ruta</button>
                        <button className="ab ab-b" onClick={() => { setAddingToRuta(ruta.id); setAddSelected(new Set()); }} style={{ gap: 4, fontSize: 12 }}><Plus size={12} /> Agregar pedido</button>
                        <button className="btn-p" onClick={() => handleFinalizarRuta(ruta)}
                          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13, background: allDone ? 'var(--success)' : undefined }}>
                          <Flag size={14} />
                          {allDone ? 'Cerrar ruta ✓' : `Finalizar ruta (${delivered}/${rutaPedidos.length})`}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: detalle pedido */}
      <Modal isOpen={!!detalle} onClose={() => setDetalle(null)} title={`Pedido #${detalle?.numero}`} maxWidth={480}>
        {detalle && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{detalle.cliente?.nombre}</div>
              {detalle.cliente?.tel && <div style={{ fontSize: 13, color: 'var(--text2)' }}>{detalle.cliente.tel}</div>}
            </div>
            {detalle.location && (
              <div style={{ background: 'var(--bg)', borderRadius: 12, padding: '12px 14px' }}>
                {detalle.location.barrio && <div style={{ fontWeight: 600, fontSize: 13 }}>🏘 {detalle.location.barrio}</div>}
                {detalle.location.notes  && <div style={{ fontSize: 13, color: 'var(--text2)' }}>📝 {detalle.location.notes}</div>}
                {detalle.location.address && <div style={{ fontSize: 12, color: 'var(--text3)' }}>{detalle.location.address}</div>}
                <a href={`https://www.google.com/maps?q=${detalle.location.lat},${detalle.location.lng}`} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, color: 'var(--brand)', textDecoration: 'none', padding: '7px 12px', borderRadius: 8, border: '1px solid var(--brand)', marginTop: 8 }}>
                  <ExternalLink size={13} /> Abrir en Google Maps
                </a>
              </div>
            )}
            <div>
              {detalle.items?.map((it, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                  <span>{it.qty}× {it.nombre}</span>
                  <span style={{ fontWeight: 600 }}>{fmtPrice(it.precio * it.qty)}</span>
                </div>
              ))}
              {detalle.domicilio > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', color: 'var(--success)', fontWeight: 600 }}>
                  <span>Domicilio</span><span>{fmtPrice(detalle.domicilio)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 16, color: 'var(--brand)', marginTop: 10 }}>
                <span>Total</span><span>{fmtPrice(detalle.total)}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: agregar pedido a ruta existente */}
      {(() => {
        const allAssignedIds = new Set(rutas.flatMap(r => r.pedidoIds));
        const available = enCamino.filter(p => !allAssignedIds.has(p.id));
        return (
          <Modal isOpen={!!addingToRuta} onClose={() => setAddingToRuta(null)} title="Agregar pedido a la ruta" maxWidth={440}>
            {available.length === 0 ? (
              <div className="empty-s">No hay pedidos en camino sin ruta asignada</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 13, color: 'var(--text3)' }}>Selecciona los pedidos a agregar:</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {available.map(p => {
                    const isSel = addSelected.has(p.id);
                    return (
                      <div key={p.id}
                        onClick={() => setAddSelected(prev => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${isSel ? 'var(--brand)' : 'var(--border)'}`, background: isSel ? 'var(--brand-light)' : 'var(--surface)' }}
                      >
                        <div style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, border: `2px solid ${isSel ? 'var(--brand)' : 'var(--border)'}`, background: isSel ? 'var(--brand)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {isSel && <CheckCircle size={12} color="#fff" />}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--brand)' }}>#{p.numero}</div>
                          <div style={{ fontSize: 13 }}>{p.cliente?.nombre}</div>
                          <div style={{ fontSize: 11, color: 'var(--text3)' }}>{[p.cliente?.barrio, p.cliente?.dir].filter(Boolean).join(' · ')}</div>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{fmtPrice(p.total)}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <button className="btn-s" onClick={() => setAddingToRuta(null)}>Cancelar</button>
                  <button className="btn-p" onClick={handleAddToRuta} disabled={addSelected.size === 0}>
                    Agregar {addSelected.size > 0 ? `(${addSelected.size})` : ''}
                  </button>
                </div>
              </div>
            )}
          </Modal>
        );
      })()}

      {/* Modal: reasignar pedido */}
      <Modal isOpen={!!reassignPedidoId} onClose={() => setReassignPedidoId(null)} title="Reasignar pedido" maxWidth={440}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#854d0e', display: 'flex', gap: 8 }}>
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            Antes de reasignar, explica el motivo. Esto quedará registrado como novedad.
          </div>
          <div className="f-field">
            <label>Novedad / motivo de reasignación *</label>
            <textarea
              value={reassignNovedad}
              onChange={e => setReassignNovedad(e.target.value)}
              placeholder="Ej: Accidente de tránsito, zona inaccesible..."
              rows={3}
              style={{ fontFamily: 'inherit', fontSize: 14, resize: 'vertical' }}
            />
          </div>
          <div className="f-field">
            <label>Reasignar a *</label>
            <select value={reassignTargetId} onChange={e => setReassignTargetId(e.target.value)} style={{ fontFamily: 'inherit' }}>
              <option value="">Selecciona domiciliario</option>
              {otrosDomiciliarios.map(d => (
                <option key={d.id} value={d.id}>{d.nombre}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button className="btn-s" onClick={() => setReassignPedidoId(null)}>Cancelar</button>
            <button className="btn-p" onClick={handleReassign} disabled={savingReassign}>
              {savingReassign ? 'Reasignando...' : 'Confirmar reasignación'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
