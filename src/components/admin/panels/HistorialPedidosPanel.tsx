import { useState, useEffect, useMemo } from 'react';
import { subscribeToHistorialPedidos, updateHistorialDia, deleteHistorialDia } from '@/lib/data/historial';
import { useAppStore } from '@/stores/useAppStore';
import { useAdminStore } from '@/stores/useAdminStore';
import { fmtPrice } from '@/lib/utils';
import { ChevronDown, ChevronUp, Lock, Unlock, Edit2, Save, X, FileText, Calendar, Trash2 } from 'lucide-react';
import type { HistorialDia, Pedido } from '@/types';

function printFactura(p: Pedido, fechaLabel: string, nombreComercio: string) {
  const items = (p.items ?? []).map(it => `
    <tr>
      <td>${it.nombre}${it.extras?.length ? ` <small>(+${it.extras.join(', ')})</small>` : ''}</td>
      <td style="text-align:center">${it.qty}</td>
      <td style="text-align:right">$${Math.round(it.precio * it.qty).toLocaleString('es-CO')}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Factura #${p.numero}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #111; padding: 32px; max-width: 420px; margin: 0 auto; }
    h1  { font-size: 22px; font-weight: 800; margin-bottom: 2px; }
    .sub { color: #666; font-size: 12px; margin-bottom: 20px; }
    .divider { border: none; border-top: 1px solid #e5e7eb; margin: 14px 0; }
    .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #9ca3af; margin-bottom: 8px; }
    .info-row { font-size: 13px; margin-bottom: 3px; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    th { font-size: 11px; color: #6b7280; font-weight: 600; text-align: left; padding: 4px 0; border-bottom: 1px solid #e5e7eb; }
    td { padding: 7px 0; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
    td small { color: #9ca3af; font-size: 11px; }
    .totals { margin-top: 6px; }
    .totals tr td { border: none; padding: 3px 0; }
    .total-row td { font-weight: 800; font-size: 17px; padding-top: 8px; border-top: 2px solid #111 !important; }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 11px; font-weight: 700;
             background: ${p.estado === 'entregado' ? '#dcfce7' : '#fee2e2'};
             color: ${p.estado === 'entregado' ? '#15803d' : '#dc2626'}; }
    .print-btn { display: block; margin-bottom: 24px; padding: 9px 20px; background: #111; color: #fff;
                 border: none; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; }
    @media print { .print-btn { display: none; } }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">🖨 Imprimir / Guardar PDF</button>
  <h1>${nombreComercio}</h1>
  <div class="sub">Pedido #${p.numero} &nbsp;·&nbsp; ${fechaLabel}</div>
  <hr class="divider">
  <div class="section-title">Estado</div>
  <div class="info-row"><span class="badge">${p.estado === 'entregado' ? 'Entregado' : 'Cancelado'}</span></div>
  <hr class="divider">
  <div class="section-title">Cliente</div>
  <div class="info-row"><strong>${p.cliente?.nombre ?? ''}</strong></div>
  ${p.cliente?.tel    ? `<div class="info-row">${p.cliente.tel}</div>` : ''}
  ${p.cliente?.correo ? `<div class="info-row">${p.cliente.correo}</div>` : ''}
  ${p.cliente?.dir    ? `<div class="info-row">${p.cliente.dir}${p.cliente.barrio ? ` — ${p.cliente.barrio}` : ''}${p.cliente.comp ? `, ${p.cliente.comp}` : ''}</div>` : ''}
  ${p.cliente?.recibe ? `<div class="info-row" style="color:#666">Recibe: ${p.cliente.recibe}</div>` : ''}
  <hr class="divider">
  <div class="section-title">Productos</div>
  <table>
    <thead><tr><th>Producto</th><th style="text-align:center">Cant.</th><th style="text-align:right">Precio</th></tr></thead>
    <tbody>${items}</tbody>
  </table>
  <table class="totals" style="margin-top:12px">
    ${p.subtotal !== p.total ? `<tr><td style="color:#666">Subtotal</td><td style="text-align:right">$${Math.round(p.subtotal).toLocaleString('es-CO')}</td></tr>` : ''}
    ${p.domicilio > 0 ? `<tr><td style="color:#666">Domicilio</td><td style="text-align:right">$${Math.round(p.domicilio).toLocaleString('es-CO')}</td></tr>` : ''}
    ${p.descuento > 0 ? `<tr><td style="color:#16a34a">Descuento</td><td style="text-align:right;color:#16a34a">-$${Math.round(p.descuento).toLocaleString('es-CO')}</td></tr>` : ''}
    <tr class="total-row"><td>Total</td><td style="text-align:right">$${Math.round(p.total).toLocaleString('es-CO')}</td></tr>
  </table>
  ${p.rutaNombre || p.repartidorNombre ? `
  <hr class="divider">
  <div class="section-title">Entrega</div>
  ${p.rutaNombre       ? `<div class="info-row">Ruta: <strong>${p.rutaNombre}</strong></div>` : ''}
  ${p.repartidorNombre ? `<div class="info-row">Repartidor: <strong>${p.repartidorNombre}</strong></div>` : ''}
  ` : ''}
</body>
</html>`;

  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
}

export function HistorialPedidosPanel() {
  const { cfg, showToast } = useAppStore();
  const { adminSettings } = useAdminStore();
  const [dias, setDias]             = useState<HistorialDia[]>([]);
  const [loading, setLoading]       = useState(true);
  const [expanded, setExpanded]     = useState<Set<string>>(new Set());
  const [pinUnlocked, setPinUnlocked] = useState(false);
  const [pinInput, setPinInput]     = useState('');
  const [showPinInput, setShowPinInput] = useState(false);
  const [editingPedido, setEditingPedido] = useState<{ diaId: string; pedidoId: string } | null>(null);
  const [editEstado, setEditEstado] = useState<'entregado' | 'cancelado'>('entregado');
  const [editRepartidor, setEditRepartidor] = useState('');
  const [saving, setSaving]         = useState(false);

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');

  useEffect(() => {
    const unsub = subscribeToHistorialPedidos(list => {
      setDias(list);
      setLoading(false);
    });
    return unsub;
  }, []);

  // Filtered dias by date range
  const filtered = useMemo(() => {
    return dias.filter(d => {
      if (!d.fecha) return true;
      if (dateFrom && d.fecha < dateFrom) return false;
      if (dateTo   && d.fecha > dateTo)   return false;
      return true;
    });
  }, [dias, dateFrom, dateTo]);

  const groupedFiltered = useMemo(() => {
    type G = {
      fecha: string; fechaLabel: string;
      pedidos: Array<Pedido & { _diaId: string }>;
      totalEntregados: number; totalCancelados: number; totalRecaudo: number;
      docIds: string[];
    };
    const map: Record<string, G> = {};
    for (const dia of filtered) {
      if (!map[dia.fecha]) {
        map[dia.fecha] = {
          fecha: dia.fecha, fechaLabel: dia.fechaLabel,
          pedidos: dia.pedidos.map(p => ({ ...p, _diaId: dia.id })),
          totalEntregados: dia.totalEntregados,
          totalCancelados: dia.totalCancelados,
          totalRecaudo: dia.totalRecaudo,
          docIds: [dia.id],
        };
      } else {
        map[dia.fecha].pedidos.push(...dia.pedidos.map(p => ({ ...p, _diaId: dia.id })));
        map[dia.fecha].totalEntregados += dia.totalEntregados;
        map[dia.fecha].totalCancelados += dia.totalCancelados;
        map[dia.fecha].totalRecaudo += dia.totalRecaudo;
        map[dia.fecha].docIds.push(dia.id);
      }
    }
    return Object.values(map).sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [filtered]);

  // Summary for filtered period
  const summary = useMemo(() => ({
    dias: groupedFiltered.length,
    entregados: filtered.reduce((s, d) => s + d.totalEntregados, 0),
    cancelados: filtered.reduce((s, d) => s + d.totalCancelados, 0),
    recaudo: filtered.reduce((s, d) => s + d.totalRecaudo, 0),
  }), [filtered, groupedFiltered]);

  function handleUnlock() {
    const pin = adminSettings?.historialPin ?? '';
    if (!pin) { showToast('Configura un PIN en Configuración > General primero', 'error'); return; }
    if (pinInput === pin) {
      setPinUnlocked(true);
      setShowPinInput(false);
      setPinInput('');
      showToast('Historial desbloqueado para edición', 'success');
    } else {
      showToast('PIN incorrecto', 'error');
      setPinInput('');
    }
  }

  function startEdit(diaId: string, pedido: Pedido) {
    setEditingPedido({ diaId, pedidoId: pedido.id });
    setEditEstado(pedido.estado as 'entregado' | 'cancelado');
    setEditRepartidor(pedido.repartidorNombre ?? '');
  }

  async function handleSaveEdit() {
    if (!editingPedido) return;
    setSaving(true);
    try {
      const dia = dias.find(d => d.id === editingPedido.diaId);
      if (!dia) return;
      const updatedPedidos = dia.pedidos.map(p =>
        p.id === editingPedido.pedidoId
          ? { ...p, estado: editEstado, repartidorNombre: editRepartidor }
          : p
      );
      const totalEntregados = updatedPedidos.filter(p => p.estado === 'entregado').length;
      const totalCancelados = updatedPedidos.filter(p => p.estado === 'cancelado').length;
      const totalRecaudo    = updatedPedidos.filter(p => p.estado === 'entregado').reduce((s, p) => s + p.total, 0);
      await updateHistorialDia(editingPedido.diaId, {
        pedidos: updatedPedidos, totalEntregados, totalCancelados, totalRecaudo,
      });
      setEditingPedido(null);
      showToast('Cambios guardados', 'success');
    } catch {
      showToast('Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  }

  function toggleExpand(id: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  return (
    <div style={{ maxWidth: 720 }}>
      {/* Cabecera */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ fontWeight: 700, fontSize: 16, margin: 0 }}>Historial de pedidos</h3>
        {pinUnlocked ? (
          <button
            onClick={() => { setPinUnlocked(false); setEditingPedido(null); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--success)', background: 'var(--success-bg)', color: 'var(--success)', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}
          >
            <Unlock size={13} /> Edición activa
          </button>
        ) : (
          <button
            onClick={() => setShowPinInput(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text2)', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}
          >
            <Lock size={13} /> Desbloquear edición
          </button>
        )}
      </div>

      {/* Filters */}
      {dias.length > 0 && (
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

      {/* Summary bar */}
      {filtered.length > 0 && (
        <div style={{ display: 'flex', gap: 14, marginBottom: 14, padding: '10px 14px', background: 'var(--bg2)', borderRadius: 10, border: '1px solid var(--border)', flexWrap: 'wrap', fontSize: 13 }}>
          <span style={{ color: 'var(--text3)' }}>{summary.dias} día{summary.dias !== 1 ? 's' : ''}</span>
          <span style={{ color: 'var(--success)', fontWeight: 600 }}>{summary.entregados} entregados</span>
          {summary.cancelados > 0 && <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{summary.cancelados} cancelados</span>}
          <span style={{ fontWeight: 700, color: 'var(--brand)' }}>{fmtPrice(summary.recaudo)} recaudado</span>
        </div>
      )}

      {/* PIN input */}
      {showPinInput && !pinUnlocked && (
        <div style={{ background: 'var(--bg2)', borderRadius: 12, padding: '12px 14px', marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center', border: '1px solid var(--border)' }}>
          <input
            type="password"
            placeholder="Ingresa el PIN"
            value={pinInput}
            onChange={e => setPinInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleUnlock()}
            autoFocus
            style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, fontFamily: 'inherit', background: 'var(--surface)', color: 'var(--text)' }}
          />
          <button className="btn-p" onClick={handleUnlock} style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>
            Verificar
          </button>
          <button
            onClick={() => { setShowPinInput(false); setPinInput(''); }}
            style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontFamily: 'inherit' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ height: 72, borderRadius: 12, background: 'var(--bg2)', animation: 'pulse 1.4s ease-in-out infinite', opacity: 0.6 }} />
          ))}
        </div>
      ) : dias.length === 0 ? (
        <div className="empty-s" style={{ flexDirection: 'column', gap: 8 }}>
          <div>No hay historial aún.</div>
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>
            Usa <strong>Cerrar día</strong> en el panel de Pedidos para archivar los pedidos finalizados.
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-s">Sin registros para el período seleccionado.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {groupedFiltered.map(dia => {
            const isExp = expanded.has(dia.fecha);
            return (
              <div key={dia.fecha} className="admin-card">
                <div
                  style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
                  onClick={() => toggleExpand(dia.fecha)}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{dia.fechaLabel}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      <span style={{ color: 'var(--success)', fontWeight: 600 }}>{dia.totalEntregados} entregados</span>
                      {dia.totalCancelados > 0 && (
                        <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{dia.totalCancelados} cancelados</span>
                      )}
                      <span style={{ fontWeight: 700, color: 'var(--brand)' }}>{fmtPrice(dia.totalRecaudo)} recaudado</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {pinUnlocked && (
                      <button
                        onClick={e => { e.stopPropagation(); Promise.all(dia.docIds.map(id => deleteHistorialDia(id))).then(() => showToast('Día eliminado', 'success')).catch(() => showToast('Error al eliminar', 'error')); }}
                        style={{ width: 28, height: 28, borderRadius: 7, border: 'none', background: '#fee2e2', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title="Eliminar este día del historial"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                    {isExp ? <ChevronUp size={16} color="var(--text3)" /> : <ChevronDown size={16} color="var(--text3)" />}
                  </div>
                </div>

                {isExp && (
                  <div style={{ borderTop: '1px solid var(--border)' }}>
                    {dia.pedidos.map((p, idx) => {
                      const pDiaId = (p as Pedido & { _diaId: string })._diaId;
                      const isEditing = editingPedido?.diaId === pDiaId && editingPedido?.pedidoId === p.id;
                      return (
                        <div
                          key={p.id ?? idx}
                          style={{
                            padding: '12px 16px',
                            borderBottom: idx < dia.pedidos.length - 1 ? '1px solid var(--border)' : 'none',
                            background: isEditing ? 'var(--bg2)' : 'transparent',
                          }}
                        >
                          {isEditing ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                                <select
                                  value={editEstado}
                                  onChange={e => setEditEstado(e.target.value as 'entregado' | 'cancelado')}
                                  style={{ flex: 1, minWidth: 140, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, fontFamily: 'inherit', background: 'var(--surface)', color: 'var(--text)' }}
                                >
                                  <option value="entregado">Entregado</option>
                                  <option value="cancelado">Cancelado</option>
                                </select>
                                <input
                                  value={editRepartidor}
                                  onChange={e => setEditRepartidor(e.target.value)}
                                  placeholder="Repartidor"
                                  style={{ flex: 1, minWidth: 140, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, fontFamily: 'inherit', background: 'var(--surface)', color: 'var(--text)' }}
                                />
                              </div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn-s" onClick={() => setEditingPedido(null)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                  <X size={13} /> Cancelar
                                </button>
                                <button className="btn-p" onClick={handleSaveEdit} disabled={saving} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                  <Save size={13} /> {saving ? 'Guardando...' : 'Guardar'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                                  <span style={{ fontWeight: 700, fontSize: 13, fontFamily: 'monospace', color: 'var(--brand)' }}>
                                    #{p.numero}
                                  </span>
                                  <span style={{
                                    fontSize: 11, fontWeight: 600, borderRadius: 6, padding: '2px 8px',
                                    background: p.estado === 'entregado' ? 'var(--success-bg)' : 'var(--danger-bg)',
                                    color:      p.estado === 'entregado' ? 'var(--success)'    : 'var(--danger)',
                                  }}>
                                    {p.estado === 'entregado' ? 'Entregado' : 'Cancelado'}
                                  </span>
                                  {p.esManual && (
                                    <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 6, padding: '2px 8px', background: 'var(--brand-light)', color: 'var(--brand)' }}>
                                      Manual
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: 14, fontWeight: 600 }}>{p.cliente?.nombre}</div>
                                {(p.cliente?.tel || p.cliente?.barrio || p.cliente?.dir) && (
                                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                                    {[p.cliente?.tel, p.cliente?.barrio, p.cliente?.dir].filter(Boolean).join(' · ')}
                                  </div>
                                )}
                                {(p.rutaNombre || p.repartidorNombre) && (
                                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                                    {p.rutaNombre && <span>Ruta: <strong>{p.rutaNombre}</strong></span>}
                                    {p.repartidorNombre && <span style={{ marginLeft: 8 }}>· {p.repartidorNombre}</span>}
                                  </div>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontWeight: 700, fontSize: 14 }}>{fmtPrice(p.total)}</div>
                                </div>
                                <button
                                  onClick={() => printFactura(p, dia.fechaLabel, cfg.nombreComercio)}
                                  style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)' }}
                                  title="Ver factura"
                                >
                                  <FileText size={13} />
                                </button>
                                {pinUnlocked && (
                                  <button
                                    onClick={() => startEdit(pDiaId, p)}
                                    style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)' }}
                                    title="Editar"
                                  >
                                    <Edit2 size={13} />
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
