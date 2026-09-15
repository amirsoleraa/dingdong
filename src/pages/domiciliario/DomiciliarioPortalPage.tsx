import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Bike, Bell, LogOut, Route, History, Wallet, X } from 'lucide-react';
import { domSupabase } from '@/lib/supabase';
import { subscribeToPedidos } from '@/lib/data/pedidos';
import { subscribeToNotificaciones, markNotificacionLeida } from '@/lib/data/notificaciones';
import { useDomAuth } from '@/hooks/useDomAuth';
import { useFirebaseInit } from '@/hooks/useFirebaseInit';
import { useAdminStore } from '@/stores/useAdminStore';
import { DomRutasPanel }    from '@/components/domiciliario/DomRutasPanel';
import { DomHistorialPanel } from '@/components/domiciliario/DomHistorialPanel';
import { DomCarteraPanel }   from '@/components/domiciliario/DomCarteraPanel';
import { Toast } from '@/components/ui/Toast';
import { ConfirmProvider } from '@/components/ui/ConfirmDialog';
import { useAppStore } from '@/stores/useAppStore';
import type { Notificacion } from '@/types';

type Tab = 'rutas' | 'historial' | 'cartera';

const TABS = [
  { key: 'rutas' as Tab,     icon: Route,   label: 'Rutas' },
  { key: 'historial' as Tab, icon: History,  label: 'Historial' },
  { key: 'cartera' as Tab,   icon: Wallet,   label: 'Cartera' },
];

function PortalContent() {
  useFirebaseInit();
  const { cfg } = useAppStore();
  const { setPedidos } = useAdminStore();

  // Subscribe to pedidos en camino (accesible por domiciliarios vía RLS)
  useEffect(() => {
    const unsub = subscribeToPedidos((event, row, oldId) => {
      if ((event === 'INSERT' || event === 'UPDATE') && row) {
        setPedidos(prev => ({ ...prev, [row.id]: row }));
      } else if (event === 'DELETE' && oldId) {
        setPedidos(prev => { const n = { ...prev }; delete n[oldId]; return n; });
      }
    }, domSupabase);
    return unsub;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const { session, logOut } = useDomAuth();
  const [tab,   setTab]   = useState<Tab>('rutas');
  const [notifs, setNotifs] = useState<Notificacion[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);

  const dom = session?.domiciliario;

  useEffect(() => {
    if (!dom?.id) return;
    const unsub = subscribeToNotificaciones(dom.id, setNotifs, domSupabase);
    return unsub;
  }, [dom?.id]);

  const unread = notifs.filter(n => !n.leida).length;

  async function markAllRead() {
    if (!dom?.id) return;
    await Promise.all(
      notifs.filter(n => !n.leida).map(n => markNotificacionLeida(n.id, domSupabase).catch(() => {}))
    );
  }

  function handleOpenNotifs() {
    setNotifOpen(true);
    markAllRead();
  }

  if (!dom) return null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        padding: '0 16px', height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--brand-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Bike size={17} color="var(--brand)" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{dom.nombre}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>{cfg.nombreComercio}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={handleOpenNotifs}
            style={{ position: 'relative', width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)', fontFamily: 'inherit' }}
          >
            <Bell size={17} />
            {unread > 0 && (
              <span style={{
                position: 'absolute', top: 4, right: 4, width: 16, height: 16, borderRadius: '50%',
                background: 'var(--brand)', color: '#fff', fontSize: 9, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{unread > 9 ? '9+' : unread}</span>
            )}
          </button>
          <button
            onClick={logOut}
            style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontFamily: 'inherit' }}
            title="Cerrar sesión"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '0 4px' }}>
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                padding: '10px 4px 8px',
                border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
                borderBottom: active ? '2px solid var(--brand)' : '2px solid transparent',
                color: active ? 'var(--brand)' : 'var(--text3)',
                fontSize: 11, fontWeight: active ? 700 : 500,
                transition: 'all .15s',
              }}
            >
              <Icon size={18} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ padding: '16px', maxWidth: 680, margin: '0 auto' }}>
        {tab === 'rutas'     && <DomRutasPanel    domiciliario={dom} />}
        {tab === 'historial' && <DomHistorialPanel domiciliario={dom} />}
        {tab === 'cartera'   && <DomCarteraPanel   domiciliario={dom} />}
      </div>

      {/* Notifications drawer */}
      {notifOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex' }}>
          <div style={{ flex: 1, background: 'rgba(0,0,0,.4)' }} onClick={() => setNotifOpen(false)} />
          <div style={{
            width: 320, maxWidth: '90vw', background: 'var(--surface)',
            display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 20px rgba(0,0,0,.12)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 16px 12px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ fontWeight: 700, fontSize: 16 }}>Notificaciones</h3>
              <button onClick={() => setNotifOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {notifs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text3)', fontSize: 14 }}>
                  <Bell size={32} style={{ margin: '0 auto 8px', opacity: .3 }} />
                  Sin notificaciones
                </div>
              ) : (
                notifs.map(n => (
                  <div key={n.id} style={{
                    padding: '12px 16px', borderBottom: '1px solid var(--border)',
                    background: n.leida ? 'transparent' : 'var(--brand-light)',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: n.leida ? 400 : 600 }}>{n.mensaje}</div>
                    {n.createdAt && (
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                        {new Date(n.createdAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <Toast />
    </div>
  );
}

function DomGuard() {
  const { session, loading } = useDomAuth();
  if (loading) return null;
  if (!session) return <Navigate to="/domiciliario/login" replace />;
  return <PortalContent />;
}

export function DomiciliarioPortalPage() {
  return (
    <ConfirmProvider>
      <DomGuard />
    </ConfirmProvider>
  );
}
