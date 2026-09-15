import { useMemo, useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { Package, DollarSign, TrendingUp, Bike, MapPin, Calendar, X } from 'lucide-react';
import { listHistorialPedidos } from '@/lib/data/historial';
import { useAdminStore } from '@/stores/useAdminStore';
import { fmtPrice } from '@/lib/utils';
import type { HistorialDia, Pedido } from '@/types';

type Period = 'hoy' | 'semana' | 'mes' | 'año';

const PERIOD_LABELS: Record<Period, string> = { hoy: 'Hoy', semana: 'Semana', mes: 'Mes', año: 'Año' };

function startOf(period: Period): Date {
  const now = new Date();
  if (period === 'hoy') return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'semana') {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    d.setDate(d.getDate() - 6);
    return d;
  }
  if (period === 'mes') return new Date(now.getFullYear(), now.getMonth(), 1);
  return new Date(now.getFullYear(), 0, 1);
}

export function DashboardPanel() {
  const { pedidos } = useAdminStore();
  const [period, setPeriod]     = useState<Period>('hoy');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [historial, setHistorial] = useState<HistorialDia[]>([]);
  const [loadingHist, setLoadingHist] = useState(true);

  const hasCustomRange = !!(dateFrom || dateTo);

  // Load historial once for longer period analysis
  useEffect(() => {
    listHistorialPedidos()
      .then(setHistorial)
      .catch(() => {})
      .finally(() => setLoadingHist(false));
  }, []);

  const allActive = Object.values(pedidos);
  const inTransit = allActive.filter(p => p.estado === 'camino').length;
  const newOrders = allActive.filter(p => p.estado === 'activos').length;

  // All historical pedidos for the selected period / custom range
  const periodPedidos = useMemo(() => {
    let start: Date;
    let end: Date | null = null;

    if (hasCustomRange) {
      start = dateFrom ? new Date(dateFrom + 'T00:00:00') : new Date(0);
      end   = dateTo   ? new Date(dateTo   + 'T23:59:59') : null;
    } else {
      start = startOf(period);
    }

    const fromHist: Pedido[] = [];
    historial.forEach(dia => {
      if (dia.creadoEn) {
        const d = new Date(dia.creadoEn);
        if (d >= start && (!end || d <= end)) fromHist.push(...(dia.pedidos ?? []));
      }
    });
    const activeInPeriod = allActive.filter(p => {
      if (!p.createdAt) return false;
      const d = new Date(p.createdAt);
      return d >= start && (!end || d <= end);
    });
    return [...fromHist, ...activeInPeriod];
  }, [period, historial, allActive, hasCustomRange, dateFrom, dateTo]);

  const stats = useMemo(() => {
    const entregados = periodPedidos.filter(p => p.estado === 'entregado');
    const revenue    = entregados.reduce((s, p) => s + p.total, 0);
    return {
      pedidos: periodPedidos.length,
      entregados: entregados.length,
      revenue,
    };
  }, [periodPedidos]);

  // 7-day chart (always last 7 days)
  const chartData = useMemo(() => {
    const days: { day: string; pedidos: number; revenue: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
      const next = new Date(d); next.setDate(next.getDate() + 1);

      const dPedidos = [
        ...allActive.filter(p => p.createdAt && new Date(p.createdAt) >= d && new Date(p.createdAt) < next),
        ...historial.flatMap(dia => {
          if (!dia.creadoEn) return [];
          const dDate = new Date(dia.creadoEn);
          return dDate >= d && dDate < next ? dia.pedidos ?? [] : [];
        }),
      ];

      days.push({
        day: d.toLocaleDateString('es-CO', { weekday: 'short' }),
        pedidos: dPedidos.length,
        revenue: dPedidos.filter(p => p.estado === 'entregado').reduce((s, p) => s + p.total, 0),
      });
    }
    return days;
  }, [allActive, historial]);

  // Top products
  const topProducts = useMemo(() => {
    const counts: Record<string, { nombre: string; qty: number }> = {};
    periodPedidos.forEach(p => {
      p.items?.forEach(item => {
        if (!counts[item.id]) counts[item.id] = { nombre: item.nombre, qty: 0 };
        counts[item.id].qty += item.qty;
      });
    });
    return Object.values(counts).sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [periodPedidos]);

  // Top barrios
  const topBarrios = useMemo(() => {
    const counts: Record<string, number> = {};
    periodPedidos.forEach(p => {
      const b = p.cliente?.barrio || p.location?.barrio;
      if (b) counts[b] = (counts[b] ?? 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [periodPedidos]);

  // Domiciliario stats
  const domStats = useMemo(() => {
    const counts: Record<string, { rutas: number }> = {};
    historial.forEach(dia => {
      dia.pedidos?.forEach(p => {
        if (p.repartidorNombre) {
          if (!counts[p.repartidorNombre]) counts[p.repartidorNombre] = { rutas: 0 };
          counts[p.repartidorNombre].rutas++;
        }
      });
    });
    return Object.entries(counts).sort((a, b) => b[1].rutas - a[1].rutas).slice(0, 5);
  }, [historial]);

  const periodTabs: Period[] = ['hoy', 'semana', 'mes', 'año'];

  return (
    <div>
      {/* Period tabs + date range */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg2)', padding: 4, borderRadius: 10, border: '1px solid var(--border)', opacity: hasCustomRange ? 0.4 : 1 }}>
          {periodTabs.map(p => (
            <button
              key={p}
              onClick={() => { setPeriod(p); setDateFrom(''); setDateTo(''); }}
              style={{
                padding: '7px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 600, fontFamily: 'inherit', transition: 'all .15s',
                background: period === p && !hasCustomRange ? 'var(--surface)' : 'transparent',
                color: period === p && !hasCustomRange ? 'var(--text)' : 'var(--text2)',
                boxShadow: period === p && !hasCustomRange ? '0 1px 4px rgba(0,0,0,.1)' : 'none',
              }}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Calendar size={14} color="var(--text3)" />
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${hasCustomRange ? 'var(--brand)' : 'var(--border)'}`, fontSize: 13, fontFamily: 'inherit', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}
          />
          <span style={{ fontSize: 13, color: 'var(--text3)' }}>—</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${hasCustomRange ? 'var(--brand)' : 'var(--border)'}`, fontSize: 13, fontFamily: 'inherit', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}
          />
          {hasCustomRange && (
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); }}
              style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontFamily: 'inherit' }}
              title="Limpiar rango"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <Package size={24} color="var(--brand)" />
          <div className="stat-value">{stats.pedidos}</div>
          <div className="stat-label">Pedidos ({hasCustomRange ? 'rango' : PERIOD_LABELS[period].toLowerCase()})</div>
        </div>
        <div className="stat-card">
          <DollarSign size={24} color="var(--success)" />
          <div className="stat-value">{fmtPrice(stats.revenue)}</div>
          <div className="stat-label">Ingresos ({hasCustomRange ? 'rango' : PERIOD_LABELS[period].toLowerCase()})</div>
        </div>
        <div className="stat-card">
          <TrendingUp size={24} color="var(--brand)" />
          <div className="stat-value">{newOrders}</div>
          <div className="stat-label">Nuevos ahora</div>
        </div>
        <div className="stat-card">
          <Bike size={24} color="var(--accent)" />
          <div className="stat-value">{inTransit}</div>
          <div className="stat-label">En camino</div>
        </div>
      </div>

      {/* 7-day chart */}
      <div className="admin-card">
        <div className="admin-card-hdr">
          <h3>Pedidos últimos 7 días</h3>
        </div>
        <div style={{ padding: '20px 20px 10px' }}>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: 10, border: '1px solid var(--border)', fontSize: 13 }}
                cursor={{ fill: 'var(--brand-light)' }}
                formatter={(value: number, name: string) =>
                  name === 'revenue' ? [fmtPrice(value), 'Ingresos'] : [value, 'Pedidos']
                }
              />
              <Bar dataKey="pedidos" name="Pedidos" fill="var(--brand)" radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {/* Top productos */}
        {topProducts.length > 0 && (
          <div className="admin-card">
            <div className="admin-card-hdr"><h3>Productos más vendidos</h3></div>
            <div style={{ padding: '0 0 8px' }}>
              {topProducts.map((p, i) => (
                <div key={p.nombre} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 20px', borderBottom: i < topProducts.length - 1 ? '1px solid var(--border)' : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      width: 24, height: 24, borderRadius: 7, background: 'var(--brand)',
                      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700,
                    }}>#{i + 1}</span>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{p.nombre}</span>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600 }}>{p.qty} uds</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top barrios */}
        {topBarrios.length > 0 && (
          <div className="admin-card">
            <div className="admin-card-hdr">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <MapPin size={15} color="var(--brand)" /> Top barrios
              </h3>
            </div>
            <div style={{ padding: '0 0 8px' }}>
              {topBarrios.map(([barrio, count], i) => (
                <div key={barrio} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 20px', borderBottom: i < topBarrios.length - 1 ? '1px solid var(--border)' : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      width: 24, height: 24, borderRadius: 7, background: 'var(--brand-light)',
                      color: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700,
                    }}>#{i + 1}</span>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{barrio}</span>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600 }}>{count} pedidos</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Domiciliarios */}
        {domStats.length > 0 && (
          <div className="admin-card">
            <div className="admin-card-hdr">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Bike size={15} color="var(--brand)" /> Domiciliarios
              </h3>
            </div>
            <div style={{ padding: '0 0 8px' }}>
              {domStats.map(([nombre, data], i) => (
                <div key={nombre} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 20px', borderBottom: i < domStats.length - 1 ? '1px solid var(--border)' : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      width: 24, height: 24, borderRadius: 7, background: 'var(--brand-light)',
                      color: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700,
                    }}>#{i + 1}</span>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{nombre}</span>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600 }}>{data.rutas} pedidos</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {loadingHist && (
        <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>
          Cargando datos históricos…
        </div>
      )}
    </div>
  );
}
