import { useState, useEffect, useMemo } from 'react';
import { domSupabase } from '@/lib/supabase';
import { listHistorialPedidos } from '@/lib/data/historial';
import { Calendar, X, DollarSign, Package, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { fmtPrice } from '@/lib/utils';
import type { HistorialDia, Pedido, Domiciliario } from '@/types';

interface DomCarteraPanelProps { domiciliario: Domiciliario; }

export function DomCarteraPanel({ domiciliario }: DomCarteraPanelProps) {
  const [dias,    setDias]    = useState<HistorialDia[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');

  useEffect(() => {
    listHistorialPedidos(domSupabase)
      .then(setDias)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const myPedidos = useMemo((): Pedido[] => {
    const all: Pedido[] = [];
    dias.forEach(dia => {
      (dia.pedidos ?? []).forEach((p: Pedido) => {
        if ((p.domiciliarioId === domiciliario.id || p.repartidorNombre === domiciliario.nombre) && p.estado === 'entregado') {
          all.push(p);
        }
      });
    });
    return all;
  }, [dias, domiciliario]);

  const filtered = useMemo(() => {
    return myPedidos.filter(p => {
      if (!dateFrom && !dateTo) return true;
      // Estimate date from historial context via domiciliario
      return true; // All — historial_pedidos doesn't embed individual dates easily; show all in range based on dia.fecha
    });
  }, [myPedidos, dateFrom, dateTo]);

  const filteredByDia = useMemo(() => {
    return dias.map(dia => {
      const pedidosFiltrados = (dia.pedidos ?? []).filter(
        (p: Pedido) => (p.domiciliarioId === domiciliario.id || p.repartidorNombre === domiciliario.nombre) && p.estado === 'entregado'
      );
      return { dia, pedidos: pedidosFiltrados };
    }).filter(({ dia, pedidos }) => {
      if (pedidos.length === 0) return false;
      if (!dia.fecha) return true;
      if (dateFrom && dia.fecha < dateFrom) return false;
      if (dateTo   && dia.fecha > dateTo)   return false;
      return true;
    });
  }, [dias, domiciliario, dateFrom, dateTo]);

  const totalPedidos    = filteredByDia.reduce((s, d) => s + d.pedidos.length, 0);
  const totalDomicilios = filteredByDia.reduce((s, d) => s + d.pedidos.reduce((ss, p) => ss + p.domicilio, 0), 0);
  const avgDomicilio    = totalPedidos > 0 ? totalDomicilios / totalPedidos : 0;

  // 7-day chart from historial
  const chartData = useMemo(() => {
    const days: { day: string; domicilios: number; pedidos: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d    = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
      const iso  = d.toISOString().slice(0, 10);
      const dia  = dias.find(dd => dd.fecha === iso);
      const peds = dia
        ? (dia.pedidos ?? []).filter((p: Pedido) => (p.domiciliarioId === domiciliario.id || p.repartidorNombre === domiciliario.nombre) && p.estado === 'entregado')
        : [];
      days.push({
        day: d.toLocaleDateString('es-CO', { weekday: 'short' }),
        pedidos: peds.length,
        domicilios: peds.reduce((s, p) => s + p.domicilio, 0),
      });
    }
    return days;
  }, [dias, domiciliario]);

  return (
    <div>
      {/* Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
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

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <Package size={24} color="var(--brand)" />
          <div className="stat-value">{totalPedidos}</div>
          <div className="stat-label">Pedidos entregados</div>
        </div>
        <div className="stat-card">
          <DollarSign size={24} color="var(--success)" />
          <div className="stat-value" style={{ color: 'var(--success)' }}>{fmtPrice(totalDomicilios)}</div>
          <div className="stat-label">Total domicilios</div>
        </div>
        <div className="stat-card">
          <TrendingUp size={24} color="var(--brand)" />
          <div className="stat-value">{fmtPrice(Math.round(avgDomicilio))}</div>
          <div className="stat-label">Promedio por pedido</div>
        </div>
      </div>

      {/* 7-day chart */}
      <div className="admin-card" style={{ marginBottom: 20 }}>
        <div className="admin-card-hdr"><h3>Últimos 7 días</h3></div>
        <div style={{ padding: '20px 20px 10px' }}>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: 10, border: '1px solid var(--border)', fontSize: 13 }}
                cursor={{ fill: 'var(--brand-light)' }}
                formatter={(value: number, name: string) =>
                  name === 'domicilios' ? [fmtPrice(value), 'Domicilios'] : [value, 'Pedidos']
                }
              />
              <Bar dataKey="pedidos" name="Pedidos" fill="var(--brand)" radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detalle por día */}
      {loading ? (
        <div className="empty-s">Cargando cartera...</div>
      ) : filteredByDia.length === 0 ? (
        <div className="empty-s">Sin datos en el período seleccionado</div>
      ) : (
        <div className="admin-card">
          <div className="admin-card-hdr"><h3>Detalle por pedido</h3></div>
          <div>
            {filteredByDia.map(({ dia, pedidos }) => (
              <div key={dia.id}>
                <div style={{ padding: '8px 16px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, color: 'var(--text3)' }}>
                  {dia.fechaLabel || dia.fecha} — {pedidos.length} pedido{pedidos.length !== 1 ? 's' : ''}
                </div>
                {pedidos.map((p, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 16px', borderBottom: '1px solid var(--border)', gap: 12,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--brand)' }}>#{p.numero}</div>
                      <div style={{ fontSize: 13 }}>{p.cliente?.nombre}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                        {[p.cliente?.barrio, p.location?.barrio].filter(Boolean)[0]}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 12, color: 'var(--text3)' }}>Pedido</div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{fmtPrice(p.total)}</div>
                      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>Domicilio</div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--success)' }}>{fmtPrice(p.domicilio)}</div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
              <span>Total domicilios generados</span>
              <span style={{ color: 'var(--success)' }}>{fmtPrice(totalDomicilios)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
