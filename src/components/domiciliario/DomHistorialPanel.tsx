import { useState, useEffect, useMemo } from 'react';
import { domSupabase } from '@/lib/supabase';
import { listHistorialPedidosSince, listHistorialRutasByDomiciliario } from '@/lib/data/historial';
import { Calendar, X } from 'lucide-react';
import { fmtPrice } from '@/lib/utils';
import type { Pedido, Domiciliario } from '@/types';

interface DiaAgrupado {
  fecha: string;
  fechaLabel: string;
  pedidos: Pedido[];
}

interface DomHistorialPanelProps { domiciliario: Domiciliario; }

export function DomHistorialPanel({ domiciliario }: DomHistorialPanelProps) {
  const [dias,    setDias]    = useState<DiaAgrupado[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // Acotar a los últimos 90 días — antes traía TODA la colección
        // historial_pedidos en cada carga, sin importar el tamaño del negocio.
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 90);
        const cutoffFecha = cutoff.toISOString().slice(0, 10);

        // Fetch from historial_pedidos (admin close-day entries)
        const [hDias, rRutas] = await Promise.all([
          listHistorialPedidosSince(cutoffFecha, domSupabase),
          listHistorialRutasByDomiciliario(domiciliario.id, domSupabase),
        ]);

        // Build a map: fecha -> pedidos[]
        const byFecha: Record<string, { label: string; pedidos: Pedido[] }> = {};

        function addPedidos(fecha: string, label: string, pedidos: Pedido[]) {
          if (!byFecha[fecha]) byFecha[fecha] = { label, pedidos: [] };
          byFecha[fecha].pedidos.push(...pedidos);
        }

        // historial_pedidos: filter to this domiciliario
        hDias.forEach(data => {
          const mine: Pedido[] = (data.pedidos ?? []).filter(
            (p: Pedido) => p.domiciliarioId === domiciliario.id || p.repartidorNombre === domiciliario.nombre
          );
          if (mine.length > 0) addPedidos(data.fecha, data.fechaLabel, mine);
        });

        // historial_rutas: all pedidos belong to this domiciliario
        rRutas.forEach(data => {
          if ((data.pedidosSnapshot ?? []).length > 0) addPedidos(data.fecha, data.fechaLabel, data.pedidosSnapshot!);
        });

        // Deduplicate pedidos by id (a pedido can appear in both if admin also closed day)
        const grouped: DiaAgrupado[] = Object.entries(byFecha).map(([fecha, { label, pedidos }]) => {
          const seen = new Set<string>();
          const unique = pedidos.filter(p => {
            const key = p.id ?? p.numero;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          return { fecha, fechaLabel: label || fecha, pedidos: unique };
        });

        grouped.sort((a, b) => b.fecha.localeCompare(a.fecha));
        setDias(grouped);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [domiciliario]);

  const filtered = useMemo(() => {
    return dias.filter(dia => {
      if (dateFrom && dia.fecha < dateFrom) return false;
      if (dateTo   && dia.fecha > dateTo)   return false;
      return true;
    });
  }, [dias, dateFrom, dateTo]);

  const totalPedidos   = filtered.reduce((s, d) => s + d.pedidos.length, 0);
  const totalEntregado = filtered.reduce((s, d) =>
    s + d.pedidos.filter(p => p.estado === 'entregado').reduce((ss, p) => ss + (p.domicilio ?? 0), 0), 0);

  function toggleExpand(fecha: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(fecha) ? n.delete(fecha) : n.add(fecha); return n; });
  }

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <Calendar size={14} color="var(--text3)" />
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${(dateFrom||dateTo) ? 'var(--brand)' : 'var(--border)'}`, fontSize: 13, fontFamily: 'inherit', background: 'var(--surface)', color: 'var(--text)' }} />
        <span style={{ fontSize: 13, color: 'var(--text3)' }}>—</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${(dateFrom||dateTo) ? 'var(--brand)' : 'var(--border)'}`, fontSize: 13, fontFamily: 'inherit', background: 'var(--surface)', color: 'var(--text)' }} />
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(''); setDateTo(''); }}
            style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontFamily: 'inherit' }}>
            <X size={13} />
          </button>
        )}
      </div>

      {/* Summary */}
      {filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div className="stat-card">
            <div className="stat-value">{totalPedidos}</div>
            <div className="stat-label">Pedidos entregados</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--success)' }}>{fmtPrice(totalEntregado)}</div>
            <div className="stat-label">Total domicilios</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="empty-s">Cargando historial...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-s">Sin pedidos en el período seleccionado</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(dia => {
            const isExp = expanded.has(dia.fecha);
            const entregados = dia.pedidos.filter(p => p.estado === 'entregado');
            const domTotal   = entregados.reduce((s, p) => s + (p.domicilio ?? 0), 0);
            return (
              <div key={dia.fecha} className="admin-card">
                <div style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  onClick={() => toggleExpand(dia.fecha)}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{dia.fechaLabel || dia.fecha}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                      {dia.pedidos.length} pedido{dia.pedidos.length !== 1 ? 's' : ''} · {fmtPrice(domTotal)} en domicilios
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--brand)', fontWeight: 700 }}>{isExp ? '▲' : '▼'}</span>
                </div>
                {isExp && (
                  <div style={{ borderTop: '1px solid var(--border)' }}>
                    {dia.pedidos.map((p, i) => (
                      <div key={p.id ?? i} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '10px 16px', borderBottom: i < dia.pedidos.length - 1 ? '1px solid var(--border)' : 'none',
                        gap: 12,
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--brand)' }}>#{p.numero}</div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{p.cliente?.nombre}</div>
                          <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                            {[p.cliente?.barrio, p.cliente?.dir].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{fmtPrice(p.total)}</div>
                          {(p.domicilio ?? 0) > 0 && (
                            <div style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>Dom: {fmtPrice(p.domicilio)}</div>
                          )}
                          <div style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, marginTop: 2, display: 'inline-block',
                            background: p.estado === 'entregado' ? 'var(--success-light,#dcfce7)' : '#fee2e2',
                            color: p.estado === 'entregado' ? 'var(--success)' : '#dc2626',
                          }}>
                            {p.estado === 'entregado' ? 'Entregado' : 'Cancelado'}
                          </div>
                        </div>
                      </div>
                    ))}
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
