import { useState, useRef } from 'react';
import { Eye, Trash2, ChevronRight, ChevronLeft, Clock, RotateCcw, Archive, ExternalLink, Plus, PenLine, AlertTriangle } from 'lucide-react';
import { updatePedido, updatePedidosBulk, deletePedido, deletePedidosBulk, createPedido } from '@/lib/data/pedidos';
import { listRutasCompletadas } from '@/lib/data/rutas';
import { createHistorialDia } from '@/lib/data/historial';
import { useAdminStore } from '@/stores/useAdminStore';
import { useAppStore } from '@/stores/useAppStore';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { fmtPrice, ESTADO_INFO, generarNumeroPedido, tsMs } from '@/lib/utils';
import { evaluatePromos } from '@/lib/promos';
import type { Pedido, PedidoTab } from '@/types';

const COLS: { key: PedidoTab; label: string; color: string }[] = [
  { key: 'activos',    label: 'Activos',    color: '#15803D' },
  { key: 'preparando', label: 'Preparando', color: '#A16207' },
  { key: 'camino',     label: 'En camino',  color: '#1D4ED8' },
  { key: 'entregado',  label: 'Entregado',  color: '#6B7280' },
  { key: 'cancelado',  label: 'Cancelado',  color: '#DC2626' },
];

const NEXT_STATE: Partial<Record<PedidoTab, PedidoTab>> = {
  activos: 'preparando', preparando: 'camino', camino: 'entregado',
};
const PREV_STATE: Partial<Record<PedidoTab, PedidoTab>> = {
  preparando: 'activos', camino: 'preparando', entregado: 'camino',
};

function timeAgo(iso?: string) {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)   return 'ahora';
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  return `${Math.floor(diff / 86400)} d`;
}

interface ManualItem { nombre: string; precio: string; qty: string; }

interface ManualForm {
  clienteNombre: string;
  clienteTel: string;
  clienteDir: string;
  clienteBarrio: string;
  notas: string;
  domicilio: string;
  items: ManualItem[];
}

const DEFAULT_MANUAL: ManualForm = {
  clienteNombre: '', clienteTel: '', clienteDir: '', clienteBarrio: '',
  notas: '', domicilio: '0',
  items: [{ nombre: '', precio: '', qty: '1' }],
};

export function OrdersPanel() {
  const { pedidos, pedidosFiltro, setPedidosFiltro, adminSettings } = useAdminStore();
  const { showToast, barrios, cfg, productos, categorias, promociones } = useAppStore();
  const confirm = useConfirm();
  const [detailPedido, setDetailPedido] = useState<Pedido | null>(null);
  const [deleting, setDeleting]         = useState<string | null>(null);
  const [activeCol, setActiveCol]       = useState<PedidoTab>('activos');
  const [cerrando, setCerrando]         = useState(false);

  // PIN protection
  const [pinTarget,  setPinTarget]  = useState<{ pedidoId: string; action: 'entregado' | 'delete' } | null>(null);
  const [pinInput,   setPinInput]   = useState('');
  const [pinError,   setPinError]   = useState('');

  // Manual order
  const [manualOpen, setManualOpen]   = useState(false);
  const [manualForm, setManualForm]   = useState<ManualForm>(DEFAULT_MANUAL);
  const [savingManual, setSavingManual] = useState(false);
  // Manual cart: productId -> qty
  const [manualCart, setManualCart]   = useState<Record<string, number>>({});
  // Barrio combobox
  const [barrioQuery, setBarrioQuery] = useState('');
  const [barrioOpen,  setBarrioOpen]  = useState(false);

  // kanban desktop drag
  const dragId  = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState<PedidoTab | null>(null);

  const allPedidos = Object.values(pedidos);
  const activosCount = allPedidos.filter(p => p.estado === 'activos').length;

  const barriosList = Object.values(barrios)
    .filter(b => b.activo)
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.nombre.localeCompare(b.nombre));

  function byCol(col: PedidoTab) {
    return allPedidos
      .filter(p => p.estado === col)
      .filter(p => {
        if (!pedidosFiltro) return true;
        const q = pedidosFiltro.toLowerCase();
        return p.numero.toLowerCase().includes(q) ||
          (p.cliente?.nombre ?? '').toLowerCase().includes(q);
      })
      .sort((a, b) => {
        if (col === 'preparando') {
          const aP = a.notaPendiente ? 1 : 0;
          const bP = b.notaPendiente ? 1 : 0;
          if (aP !== bP) return bP - aP;
        }
        return tsMs(a.createdAt) - tsMs(b.createdAt);
      });
  }

  async function moveToState(pedidoId: string, estado: PedidoTab) {
    if (estado === 'entregado' && adminSettings?.adminPin) {
      setPinTarget({ pedidoId, action: 'entregado' });
      setPinInput(''); setPinError('');
      return;
    }
    try {
      await updatePedido(pedidoId, { estado });
      showToast(`→ ${ESTADO_INFO[estado].label}`);
    } catch (e) {
      showToast('Sin permisos para actualizar este pedido', 'error');
      console.error('[moveToState]', e);
    }
  }

  async function handleDelete(pedidoId: string) {
    if (adminSettings?.adminPin) {
      setPinTarget({ pedidoId, action: 'delete' });
      setPinInput(''); setPinError('');
      return;
    }
    const ok = await confirm({ title: 'Eliminar pedido', message: '¿Eliminar este pedido?', danger: true, confirmLabel: 'Eliminar' });
    if (!ok) return;
    setDeleting(pedidoId);
    await deletePedido(pedidoId);
    setDeleting(null);
    showToast('Pedido eliminado');
  }

  async function handlePinConfirm() {
    if (!pinTarget) return;
    if (pinInput !== adminSettings?.adminPin) {
      setPinError('PIN incorrecto');
      setPinInput('');
      return;
    }
    const { pedidoId, action } = pinTarget;
    setPinTarget(null);
    if (action === 'entregado') {
      try {
        await updatePedido(pedidoId, { estado: 'entregado' });
        showToast(`→ ${ESTADO_INFO['entregado'].label}`);
      } catch { showToast('Sin permisos para actualizar este pedido', 'error'); }
    } else {
      const ok = await confirm({ title: 'Eliminar pedido', message: '¿Eliminar este pedido?', danger: true, confirmLabel: 'Eliminar' });
      if (!ok) return;
      setDeleting(pedidoId);
      await deletePedido(pedidoId);
      setDeleting(null);
      showToast('Pedido eliminado');
    }
  }

  async function handleCerrarDia() {
    const finalizados = allPedidos.filter(p => p.estado === 'entregado' || p.estado === 'cancelado');
    const enCamino    = allPedidos.filter(p => p.estado === 'camino');
    if (finalizados.length === 0 && enCamino.length === 0) {
      showToast('No hay pedidos finalizados para archivar', 'error'); return;
    }

    const entregados = finalizados.filter(p => p.estado === 'entregado');
    const cancelados = finalizados.filter(p => p.estado === 'cancelado');
    const enCaminoMsg = enCamino.length > 0
      ? `\n• ${enCamino.length} en camino → vuelven a Preparando (pendientes)`
      : '';

    const ok = await confirm({
      title: 'Cerrar día',
      message: `Se archivarán:\n• ${entregados.length} entregado${entregados.length !== 1 ? 's' : ''}\n• ${cancelados.length} cancelado${cancelados.length !== 1 ? 's' : ''}${enCaminoMsg}\n\nEl panel quedará limpio. Los datos se guardan en Historial.`,
      confirmLabel: 'Cerrar día',
      danger: false,
    });
    if (!ok) return;

    setCerrando(true);
    try {
      if (enCamino.length > 0) {
        const fechaHoy = new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
        await updatePedidosBulk(enCamino.map(p => p.id), {
          estado: 'preparando',
          notaPendiente: `Pendiente del ${fechaHoy}`,
        });
      }

      if (finalizados.length === 0) {
        showToast(`${enCamino.length} pedido${enCamino.length !== 1 ? 's' : ''} devuelto${enCamino.length !== 1 ? 's' : ''} a Preparando.`, 'success');
        return;
      }

      const rutasMap: Record<string, { nombre: string; repartidor?: string }> = {};
      try {
        const rutas = await listRutasCompletadas();
        for (const ruta of rutas) {
          for (const pid of (ruta.pedidoIds ?? [])) {
            if (!rutasMap[pid]) rutasMap[pid] = { nombre: ruta.nombre, repartidor: ruta.repartidor };
          }
        }
      } catch {}

      const historialPedidos = finalizados.map(p => ({
        ...p,
        rutaNombre:        p.rutaNombre        ?? rutasMap[p.id]?.nombre     ?? '',
        repartidorNombre:  p.repartidorNombre  ?? rutasMap[p.id]?.repartidor ?? '',
      }));

      const ahora      = new Date();
      const fecha      = ahora.toISOString().slice(0, 10);
      const fechaLabel = ahora.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
      const totalRecaudo = entregados.reduce((s, p) => s + p.total, 0);

      await createHistorialDia({
        fecha, fechaLabel,
        pedidos: historialPedidos,
        totalEntregados: entregados.length,
        totalCancelados: cancelados.length,
        totalRecaudo,
      });

      await deletePedidosBulk(finalizados.map(p => p.id));

      const msgs = [`${finalizados.length} pedidos archivados`];
      if (enCamino.length > 0) msgs.push(`${enCamino.length} devueltos a Preparando`);
      showToast(`Día cerrado. ${msgs.join(', ')}.`, 'success');
    } catch (e) {
      showToast('Error al cerrar el día', 'error');
      console.error(e);
    } finally {
      setCerrando(false);
    }
  }

  // Manual order helpers
  function addManualItem() {
    setManualForm(f => ({ ...f, items: [...f.items, { nombre: '', precio: '', qty: '1' }] }));
  }
  function removeManualItem(idx: number) {
    setManualForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  }
  function setManualItem(idx: number, field: keyof ManualItem, value: string) {
    setManualForm(f => ({
      ...f,
      items: f.items.map((it, i) => i === idx ? { ...it, [field]: value } : it),
    }));
  }

  async function handleCreateManual() {
    if (!manualForm.clienteNombre.trim()) { showToast('El nombre del cliente es obligatorio'); return; }
    const cartEntries = Object.entries(manualCart).filter(([, qty]) => qty > 0);
    if (cartEntries.length === 0) { showToast('Agrega al menos un producto'); return; }

    setSavingManual(true);
    try {
      const items = cartEntries.map(([id, qty]) => {
        const prod = productos[id];
        return { id, nombre: prod?.nombre ?? id, precio: prod?.precio ?? 0, qty, extras: [] };
      });

      const subtotal = items.reduce((s, it) => s + it.precio * it.qty, 0);
      const promoResult = evaluatePromos(Object.values(promociones), items.map(it => ({
        id: it.id, name: it.nombre, price: it.precio, qty: it.qty, extras: [], imgUrl: '', emoji: '',
      })), parseFloat(manualForm.domicilio) || 0, productos);
      const domicilio = parseFloat(manualForm.domicilio) || 0;
      const total = subtotal + domicilio - promoResult.descuentoProductos - promoResult.descuentoDomicilio;

      const pedido: Omit<Pedido, 'id' | 'createdAt' | 'verificacion'> = {
        numero: generarNumeroPedido(),
        estado: 'activos',
        cliente: {
          nombre: manualForm.clienteNombre.trim(),
          tel: manualForm.clienteTel.trim() || undefined,
          dir: manualForm.clienteDir.trim() || undefined,
          barrio: manualForm.clienteBarrio || undefined,
        },
        items,
        subtotal,
        domicilio,
        descuento: promoResult.descuentoProductos,
        total,
        cupon: null,
        mensajeConfirmacion: '',
        location: null,
        esManual: true,
        notas: manualForm.notas.trim() || undefined,
        ...(promoResult.promosAplicadas.length > 0 && { promosAplicadas: promoResult.promosAplicadas }),
      };

      await createPedido(pedido);
      showToast('Pedido manual creado', 'success');
      setManualOpen(false);
      setManualForm(DEFAULT_MANUAL);
      setManualCart({});
      setBarrioQuery(''); setBarrioOpen(false);
    } catch (e) {
      showToast('Error al crear el pedido', 'error');
      console.error(e);
    } finally {
      setSavingManual(false);
    }
  }

  // ── drag (desktop kanban) ──────────────────────
  function onDragStart(id: string) { dragId.current = id; }
  function onDragOver(e: React.DragEvent, col: PedidoTab) { e.preventDefault(); setDragOver(col); }
  function onDrop(col: PedidoTab) {
    if (dragId.current) moveToState(dragId.current, col);
    dragId.current = null; setDragOver(null);
  }
  function onDragEnd() { dragId.current = null; setDragOver(null); }

  // ── shared card renderer ───────────────────────
  function renderCard(p: Pedido, mobile = false) {
    const next = NEXT_STATE[p.estado];
    const prev = PREV_STATE[p.estado];
    if (mobile) {
      return (
        <div key={p.id} className="order-card" style={{ borderLeft: p.verificacion?.ok === false ? '3px solid #DC2626' : p.notaPendiente ? '3px solid #F59E0B' : undefined }}>
          {p.verificacion?.ok === false && (
            <div style={{ fontSize: 12, color: '#B91C1C', background: '#FEE2E2', borderRadius: 8, padding: '5px 10px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
              <AlertTriangle size={12} /> Pedido sospechoso — revisar
            </div>
          )}
          {p.notaPendiente && (
            <div style={{ fontSize: 12, color: '#92400E', background: '#FEF3C7', borderRadius: 8, padding: '5px 10px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>⚠</span> {p.notaPendiente}
            </div>
          )}
          <div className="order-card-top">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="order-card-num">#{p.numero}</span>
              {p.esManual && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: 'var(--brand-light)', color: 'var(--brand)' }}>
                  Manual
                </span>
              )}
            </div>
            <span className="order-card-time"><Clock size={11} />{timeAgo(p.createdAt)}</span>
          </div>

          <div className="order-card-client">{p.cliente?.nombre}</div>
          {p.cliente?.tel    && <div className="order-card-sub">{p.cliente.tel}</div>}
          {p.cliente?.barrio && <div className="order-card-sub">{p.cliente.barrio} · {p.cliente.dir}</div>}
          {!p.cliente?.barrio && p.cliente?.dir && <div className="order-card-sub">{p.cliente.dir}</div>}

          <div className="order-card-items">
            {p.items?.slice(0, 3).map((it, i) => (
              <span key={i}>{i > 0 ? ' · ' : ''}{it.qty}× {it.nombre}</span>
            ))}
            {(p.items?.length ?? 0) > 3 && <span style={{ color: 'var(--text3)' }}> +{p.items!.length - 3} más</span>}
          </div>

          <div className="order-card-total">{fmtPrice(p.total)}</div>

          <div className="order-card-actions">
            <button
              className="order-btn-icon danger"
              onClick={() => handleDelete(p.id)}
              disabled={deleting === p.id}
              title="Eliminar"
            >
              <Trash2 size={16} />
            </button>
            <button className="order-btn-icon" onClick={() => setDetailPedido(p)} title="Ver detalle">
              <Eye size={16} />
            </button>
            {prev && (
              <button className="order-btn-icon back" onClick={() => moveToState(p.id, prev)} title={`← ${ESTADO_INFO[prev].label}`}>
                <RotateCcw size={15} />
              </button>
            )}
            {next && (
              <button className="order-btn-advance" onClick={() => moveToState(p.id, next)}>
                {ESTADO_INFO[next].label} <ChevronRight size={16} />
              </button>
            )}
            {!next && p.estado !== 'cancelado' && (
              <div style={{ flex: 1, textAlign: 'center', fontSize: 13, color: 'var(--text3)', padding: '11px 0' }}>
                Finalizado
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div
        key={p.id}
        draggable
        onDragStart={() => onDragStart(p.id)}
        onDragEnd={onDragEnd}
        style={{ background: 'var(--surface)', border: `1px solid ${p.verificacion?.ok === false ? '#DC2626' : p.notaPendiente ? '#F59E0B' : 'var(--border)'}`, borderRadius: 10, padding: '10px 12px', cursor: 'grab', userSelect: 'none', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}
      >
        {p.verificacion?.ok === false && (
          <div style={{ fontSize: 11, color: '#B91C1C', background: '#FEE2E2', borderRadius: 6, padding: '3px 8px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
            <AlertTriangle size={11} /> Sospechoso
          </div>
        )}
        {p.notaPendiente && (
          <div style={{ fontSize: 11, color: '#92400E', background: '#FEF3C7', borderRadius: 6, padding: '3px 8px', marginBottom: 6 }}>
            ⚠ {p.notaPendiente}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontWeight: 700, fontSize: 13, fontFamily: 'monospace', color: 'var(--brand)' }}>#{p.numero}</span>
            {p.esManual && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: 'var(--brand-light)', color: 'var(--brand)' }}>
                Manual
              </span>
            )}
          </div>
          <span style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 3 }}>
            <Clock size={10} />{timeAgo(p.createdAt)}
          </span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{p.cliente?.nombre}</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 2 }}>{p.cliente?.tel}</div>
        {p.cliente?.barrio && <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>{p.cliente.barrio}</div>}
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8, lineHeight: 1.4 }}>
          {p.items?.slice(0, 2).map((it, i) => <span key={i}>{i > 0 ? ' · ' : ''}{it.qty}× {it.nombre}</span>)}
          {(p.items?.length ?? 0) > 2 && <span style={{ color: 'var(--text3)' }}> +{p.items!.length - 2}</span>}
        </div>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>{fmtPrice(p.total)}</div>
        <div style={{ display: 'flex', gap: 5 }}>
          <button className="ab ab-e" onClick={() => setDetailPedido(p)} style={{ flex: 1, justifyContent: 'center' }}><Eye size={12} /></button>
          <button className="ab ab-d" onClick={() => handleDelete(p.id)} disabled={deleting === p.id}><Trash2 size={12} /></button>
          {prev && <button className="ab ab-b" onClick={() => moveToState(p.id, prev)}><ChevronLeft size={13} /></button>}
          {next && (
            <button className="ab ab-b" onClick={() => moveToState(p.id, next)} style={{ flex: 1, justifyContent: 'center', background: 'var(--brand)', color: '#fff' }}>
              <ChevronRight size={13} /><span style={{ fontSize: 11 }}>{ESTADO_INFO[next].label}</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // Manual order subtotal preview
  const manualSubtotal = manualForm.items.reduce((s, it) => s + (parseFloat(it.precio) || 0) * (parseInt(it.qty) || 1), 0);
  const manualTotal = manualSubtotal + (parseFloat(manualForm.domicilio) || 0);

  return (
    <div>
      {/* Search + actions */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <input
          className="s-input"
          style={{ flex: 1, minWidth: 160 }}
          placeholder="Buscar por número o cliente..."
          value={pedidosFiltro}
          onChange={e => setPedidosFiltro(e.target.value)}
        />
        {activosCount > 0 && (
          <span style={{ background: 'var(--brand)', color: '#fff', borderRadius: 20, padding: '5px 12px', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
            {activosCount} nuevo{activosCount > 1 ? 's' : ''}
          </span>
        )}
        <button
          onClick={() => { setManualForm(DEFAULT_MANUAL); setManualOpen(true); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 13px', borderRadius: 20,
            border: '1px solid var(--brand)', background: 'var(--brand-light)',
            color: 'var(--brand)', cursor: 'pointer', fontSize: 13,
            fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}
        >
          <PenLine size={13} /> Pedido manual
        </button>
        {allPedidos.some(p => p.estado === 'entregado' || p.estado === 'cancelado') && (
          <button
            onClick={handleCerrarDia}
            disabled={cerrando}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 13px', borderRadius: 20,
              border: '1px solid var(--border)', background: 'var(--bg)',
              color: 'var(--text2)', cursor: 'pointer', fontSize: 13,
              fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap',
              opacity: cerrando ? .6 : 1,
            }}
            title="Archivar pedidos entregados y cancelados"
          >
            <Archive size={13} />
            {cerrando ? 'Archivando...' : `Cerrar día (${allPedidos.filter(p => p.estado === 'entregado' || p.estado === 'cancelado').length})`}
          </button>
        )}
      </div>

      {/* ════ MOBILE VIEW ════ */}
      <div className="kanban-mobile">
        <div className="order-tabs">
          {COLS.map(col => {
            const count = byCol(col.key).length;
            return (
              <button
                key={col.key}
                className={`order-tab${activeCol === col.key ? ' active' : ''}`}
                onClick={() => setActiveCol(col.key)}
              >
                {col.label}
                {count > 0 && <span className="order-tab-badge">{count}</span>}
              </button>
            );
          })}
        </div>
        {byCol(activeCol).length === 0 ? (
          <div className="empty-s" style={{ marginTop: 32 }}>Sin pedidos en esta columna</div>
        ) : (
          byCol(activeCol).map(p => renderCard(p, true))
        )}
      </div>

      {/* ════ DESKTOP KANBAN ════ */}
      <div
        className="kanban-board"
        style={{ gridTemplateColumns: 'repeat(5, minmax(220px, 1fr))', gap: 12, overflowX: 'auto', paddingBottom: 8 }}
      >
        {COLS.map(col => {
          const colPedidos = byCol(col.key);
          return (
            <div
              key={col.key}
              onDragOver={e => onDragOver(e, col.key)}
              onDrop={() => onDrop(col.key)}
              style={{
                background: dragOver === col.key ? 'var(--bg2)' : 'var(--bg)',
                borderRadius: 14,
                border: `2px solid ${dragOver === col.key ? col.color : 'var(--border)'}`,
                transition: 'border-color .15s, background .15s',
                minHeight: 120,
              }}
            >
              <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.color, flexShrink: 0, display: 'inline-block' }} />
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{col.label}</span>
                </div>
                {colPedidos.length > 0 && (
                  <span style={{ background: col.color, color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>
                    {colPedidos.length}
                  </span>
                )}
              </div>
              <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {colPedidos.length === 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 12, padding: '20px 0' }}>Sin pedidos</div>
                )}
                {colPedidos.map(p => renderCard(p, false))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: Detalle del pedido */}
      <Modal isOpen={!!detailPedido} onClose={() => setDetailPedido(null)} title={`Pedido #${detailPedido?.numero}`} maxWidth={540}>
        {detailPedido && (
          <div>
            {detailPedido.esManual && (
              <div style={{ marginBottom: 12, padding: '6px 12px', borderRadius: 8, background: 'var(--brand-light)', fontSize: 13, color: 'var(--brand)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <PenLine size={13} /> Pedido manual
              </div>
            )}
            {detailPedido.verificacion?.ok === false && (
              <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: '#FEE2E2', fontSize: 13, color: '#B91C1C', fontWeight: 600, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>Pedido sospechoso — no coincide con el catálogo: {detailPedido.verificacion.motivo}</span>
              </div>
            )}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text3)', marginBottom: 8, fontWeight: 600 }}>Cliente</div>
              <div style={{ fontSize: 15 }}><strong>{detailPedido.cliente?.nombre}</strong></div>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>{detailPedido.cliente?.tel}</div>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>{detailPedido.cliente?.correo}</div>
              {!detailPedido.location && (
                <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                  {detailPedido.cliente?.dir}
                  {detailPedido.cliente?.barrio ? ` — ${detailPedido.cliente.barrio}` : ''}
                  {detailPedido.cliente?.comp   ? `, ${detailPedido.cliente.comp}`   : ''}
                </div>
              )}
              {detailPedido.cliente?.recibe && (
                <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>Recibe: {detailPedido.cliente.recibe}</div>
              )}
              {detailPedido.notas && (
                <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4, background: 'var(--bg2)', padding: '6px 10px', borderRadius: 8 }}>
                  📝 {detailPedido.notas}
                </div>
              )}
            </div>

            {detailPedido.location && (
              <div style={{ marginBottom: 16, background: 'var(--bg)', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text3)', marginBottom: 8, fontWeight: 600 }}>Ubicación GPS</div>
                {detailPedido.location.barrio && (
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>🏘 {detailPedido.location.barrio}</div>
                )}
                {detailPedido.location.notes && (
                  <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 2 }}>📝 {detailPedido.location.notes}</div>
                )}
                {detailPedido.location.address && (
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>{detailPedido.location.address}</div>
                )}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {detailPedido.location.distance_km > 0 && (
                    <span style={{ fontSize: 12, color: 'var(--text2)' }}>📏 {detailPedido.location.distance_km} km</span>
                  )}
                  <a
                    href={`https://www.google.com/maps?q=${detailPedido.location.lat},${detailPedido.location.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      fontSize: 12, fontWeight: 600, color: 'var(--brand)',
                      textDecoration: 'none', padding: '5px 10px',
                      borderRadius: 8, border: '1px solid var(--brand)',
                    }}
                  >
                    <ExternalLink size={12} /> Ver en Google Maps
                  </a>
                </div>
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text3)', marginBottom: 8, fontWeight: 600 }}>Productos</div>
              {detailPedido.items?.map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <span>
                    {item.nombre} x{item.qty}
                    {item.extras?.length > 0 && <small style={{ color: 'var(--text3)', marginLeft: 6 }}>+{item.extras.join(', ')}</small>}
                  </span>
                  <span style={{ fontWeight: 600 }}>{fmtPrice(item.precio * item.qty)}</span>
                </div>
              ))}
              {detailPedido.promosAplicadas?.map((p, i) => (
                <div key={`promo-${i}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--border)', color: 'var(--success)' }}>
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
            </div>

            <div style={{ background: 'var(--bg)', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4, color: 'var(--text2)' }}>
                <span>Subtotal</span><span>{fmtPrice(detailPedido.subtotal)}</span>
              </div>
              {detailPedido.domicilio > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4, color: 'var(--text2)' }}>
                  <span>Domicilio</span><span>{fmtPrice(detailPedido.domicilio)}</span>
                </div>
              )}
              {detailPedido.descuento > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4, color: 'var(--success)' }}>
                  <span>Descuento</span><span>-{fmtPrice(detailPedido.descuento)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 18, color: 'var(--brand)', borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 6 }}>
                <span>Total</span><span>{fmtPrice(detailPedido.total)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              {PREV_STATE[detailPedido.estado] && (
                <button className="btn-s" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  onClick={() => { moveToState(detailPedido.id, PREV_STATE[detailPedido.estado]!); setDetailPedido(null); }}>
                  <ChevronLeft size={15} />{ESTADO_INFO[PREV_STATE[detailPedido.estado]!].label}
                </button>
              )}
              {NEXT_STATE[detailPedido.estado] && (
                <button className="btn-p" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  onClick={() => { moveToState(detailPedido.id, NEXT_STATE[detailPedido.estado]!); setDetailPedido(null); }}>
                  {ESTADO_INFO[NEXT_STATE[detailPedido.estado]!].label}<ChevronRight size={15} />
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Pedido manual */}
      {(() => {
        const prodList = Object.values(productos).filter(p => p.activo);
        const catList  = Object.values(categorias).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
        const cartEntries = Object.entries(manualCart).filter(([, q]) => q > 0);
        const manSubtotal = cartEntries.reduce((s, [id, qty]) => s + (productos[id]?.precio ?? 0) * qty, 0);
        const manDom = cfg.domicilioTipo === 'gratis' ? 0 : cfg.domicilioTipo === 'fijo' ? cfg.domicilioValor : parseFloat(manualForm.domicilio) || 0;
        const manPromos = evaluatePromos(Object.values(promociones), cartEntries.map(([id, qty]) => ({ id, name: productos[id]?.nombre ?? '', price: productos[id]?.precio ?? 0, qty, extras: [], imgUrl: '', emoji: '' })), manDom, productos);
        const manTotal = manSubtotal + manDom - manPromos.descuentoProductos;

        return (
          <Modal isOpen={manualOpen} onClose={() => { setManualOpen(false); setManualCart({}); setBarrioQuery(''); setBarrioOpen(false); }} title="Nuevo pedido manual" maxWidth={560}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* ── Datos cliente ── */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Cliente</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="f-field" style={{ marginBottom: 0 }}>
                    <label>Nombre *</label>
                    <input value={manualForm.clienteNombre} onChange={e => setManualForm(f => ({ ...f, clienteNombre: e.target.value }))} placeholder="Nombre completo" />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div className="f-field" style={{ marginBottom: 0 }}>
                      <label>Teléfono</label>
                      <input value={manualForm.clienteTel} onChange={e => setManualForm(f => ({ ...f, clienteTel: e.target.value }))} placeholder="3001234567" />
                    </div>
                    <div className="f-field" style={{ marginBottom: 0, position: 'relative' }}>
                      <label>Barrio</label>
                      <input
                        value={barrioOpen ? barrioQuery : (manualForm.clienteBarrio || barrioQuery)}
                        onFocus={() => { setBarrioOpen(true); setBarrioQuery(manualForm.clienteBarrio); }}
                        onChange={e => { setBarrioQuery(e.target.value); setManualForm(f => ({ ...f, clienteBarrio: '' })); setBarrioOpen(true); }}
                        onBlur={() => setTimeout(() => { setBarrioOpen(false); if (!manualForm.clienteBarrio) setBarrioQuery(''); }, 150)}
                        placeholder="Buscar barrio..."
                        autoComplete="off"
                      />
                      {barrioOpen && barriosList.length > 0 && (
                        <div style={{ position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, maxHeight: 180, overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,.12)', zIndex: 300 }}>
                          {barriosList
                            .filter(b => !barrioQuery || manualForm.clienteBarrio || b.nombre.toLowerCase().includes(barrioQuery.toLowerCase()))
                            .map(b => (
                              <div key={b.id}
                                onMouseDown={() => { setManualForm(f => ({ ...f, clienteBarrio: b.nombre })); setBarrioQuery(b.nombre); setBarrioOpen(false); }}
                                style={{ padding: '9px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--border)', background: manualForm.clienteBarrio === b.nombre ? 'var(--brand-light)' : 'transparent', color: manualForm.clienteBarrio === b.nombre ? 'var(--brand)' : 'var(--text)' }}
                              >
                                {b.nombre}
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div className="f-field" style={{ marginBottom: 0 }}>
                      <label>Dirección</label>
                      <input value={manualForm.clienteDir} onChange={e => setManualForm(f => ({ ...f, clienteDir: e.target.value }))} placeholder="Calle 45 # 23-10" />
                    </div>
                    <div className="f-field" style={{ marginBottom: 0 }}>
                      <label>Notas</label>
                      <input value={manualForm.notas} onChange={e => setManualForm(f => ({ ...f, notas: e.target.value }))} placeholder="Observaciones..." />
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Catálogo de productos ── */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Productos</div>
                {prodList.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--text3)' }}>No hay productos activos</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {(catList.length > 0 ? catList : [{ id: '_', nombre: 'Productos', color: '' }]).map(cat => {
                      const catProds = cat.id === '_' ? prodList : prodList.filter(p => p.categoriaId === cat.id);
                      if (catProds.length === 0) return null;
                      return (
                        <div key={cat.id}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', marginBottom: 6 }}>{cat.nombre}</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {catProds.map(prod => {
                              const qty = manualCart[prod.id] ?? 0;
                              return (
                                <div key={prod.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: qty > 0 ? 'var(--brand-light)' : 'var(--bg)', border: `1px solid ${qty > 0 ? 'var(--brand)' : 'var(--border)'}` }}>
                                  {prod.imgUrl && <img src={prod.imgUrl} alt={prod.nombre} style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />}
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: 13 }}>{prod.nombre}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>{fmtPrice(prod.precio)}</div>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                    <button onClick={() => setManualCart(c => ({ ...c, [prod.id]: Math.max(0, (c[prod.id] ?? 0) - 1) }))}
                                      style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>−</button>
                                    <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 700, fontSize: 14 }}>{qty}</span>
                                    <button onClick={() => setManualCart(c => ({ ...c, [prod.id]: (c[prod.id] ?? 0) + 1 }))}
                                      style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'var(--brand)', color: '#fff', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>+</button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── Domicilio manual (solo si no es fijo/gratis) ── */}
              {cfg.domicilioActivo && cfg.domicilioTipo === 'por_km' && (
                <div className="f-field" style={{ marginBottom: 0 }}>
                  <label>Domicilio (COP)</label>
                  <input type="number" min="0" value={manualForm.domicilio} onChange={e => setManualForm(f => ({ ...f, domicilio: e.target.value }))} placeholder="0" />
                </div>
              )}

              {/* ── Resumen ── */}
              {cartEntries.length > 0 && (
                <div style={{ background: 'var(--bg2)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {cartEntries.map(([id, qty]) => (
                    <div key={id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span>{qty}× {productos[id]?.nombre}</span>
                      <span>{fmtPrice((productos[id]?.precio ?? 0) * qty)}</span>
                    </div>
                  ))}
                  {manPromos.promosAplicadas.length > 0 && manPromos.promosAplicadas.map((p, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--success)' }}>
                      <span>{p.nombre}</span>
                      <span>{p.descuentoProducto ? `-${fmtPrice(p.descuentoProducto)}` : p.tipo === 'compra_lleva' ? 'Gratis' : ''}</span>
                    </div>
                  ))}
                  {manDom > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text2)' }}>
                      <span>Domicilio</span><span>{fmtPrice(manDom)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 16, color: 'var(--brand)', borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
                    <span>Total</span><span>{fmtPrice(manTotal)}</span>
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button className="btn-s" onClick={() => { setManualOpen(false); setManualCart({}); setBarrioQuery(''); setBarrioOpen(false); }}>Cancelar</button>
                <button className="btn-p" onClick={handleCreateManual} disabled={savingManual}>
                  {savingManual ? 'Creando...' : 'Crear pedido'}
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* Modal: PIN de administrador */}
      <Modal isOpen={!!pinTarget} onClose={() => setPinTarget(null)} title={pinTarget?.action === 'entregado' ? 'Confirmar entrega' : 'Confirmar eliminación'} maxWidth={360}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 14, color: 'var(--text2)' }}>
            {pinTarget?.action === 'entregado'
              ? 'Esta acción solo puede realizarla el domiciliario. Ingresa el PIN de administrador para confirmar.'
              : 'Ingresa el PIN de administrador para eliminar este pedido.'}
          </div>
          <input
            type="password"
            inputMode="numeric"
            maxLength={8}
            value={pinInput}
            onChange={e => { setPinInput(e.target.value); setPinError(''); }}
            onKeyDown={e => e.key === 'Enter' && handlePinConfirm()}
            placeholder="PIN"
            autoFocus
            style={{ padding: '12px 14px', borderRadius: 10, border: `1px solid ${pinError ? 'var(--danger)' : 'var(--border)'}`, fontSize: 20, textAlign: 'center', letterSpacing: 6, fontFamily: 'inherit', background: 'var(--surface)', color: 'var(--text)' }}
          />
          {pinError && <div style={{ fontSize: 13, color: 'var(--danger)', textAlign: 'center' }}>{pinError}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button className="btn-s" onClick={() => setPinTarget(null)}>Cancelar</button>
            <button className={`btn-p${pinTarget?.action === 'delete' ? '' : ''}`}
              style={pinTarget?.action === 'delete' ? { background: 'var(--danger)' } : undefined}
              onClick={handlePinConfirm}>
              Confirmar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
