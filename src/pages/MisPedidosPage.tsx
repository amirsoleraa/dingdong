import { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { clienteSupabase } from '@/lib/supabase';
import { getPedidosByClienteUid } from '@/lib/data/pedidos';
import { useClienteAuth } from '@/hooks/useClienteAuth';
import { Sidebar }       from '@/components/client/Sidebar';
import { MobileHeader }  from '@/components/client/MobileHeader';
import { BottomNav }     from '@/components/client/BottomNav';
import { InlineCart }    from '@/components/client/InlineCart';
import { GotoCartButton } from '@/components/client/GotoCartButton';
import { SearchOverlay } from '@/components/client/SearchOverlay';
import { ProductDetail } from '@/components/client/ProductDetail';
import { fmtPrice, ESTADO_INFO } from '@/lib/utils';
import type { Pedido } from '@/types';
import layout from './StorefrontPage.module.css';
import styles from './MisPedidosPage.module.css';

export function MisPedidosPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useClienteAuth();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [detailId,   setDetailId]   = useState<string | null>(null);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      try {
        const list = await getPedidosByClienteUid(user.id, clienteSupabase);
        setPedidos(list);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/login" state={{ from: '/pedidos' }} replace />;

  return (
    <div className={layout.layout}>
      <Sidebar />
      <main className={layout.main}>
        <MobileHeader onSearchOpen={() => setSearchOpen(true)} />
        <div className={layout.content}>
          <h1 className={`${styles.title} brr-display`}>Mis pedidos</h1>

          {loading ? null : pedidos.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}><ClipboardList size={28} /></div>
              <p className={styles.emptyTitle}>Aún no tienes pedidos</p>
              <p className={styles.emptyDesc}>Cuando hagas tu primer pedido, lo verás aquí para repetirlo en un toque.</p>
              <button className={styles.emptyBtn} onClick={() => navigate('/')}>Explorar el menú</button>
            </div>
          ) : (
            <div className={styles.list}>
              {pedidos.map(p => {
                const info = ESTADO_INFO[p.estado] ?? { label: p.estado, css: 'sp-a' };
                const ubicacion = p.location?.address
                  || [p.cliente.dir, p.cliente.barrio].filter(Boolean).join(', ')
                  || 'Sin dirección registrada';
                return (
                  <div key={p.id} className={styles.card}>
                    <div className={styles.cardTop}>
                      <div>
                        <span className={`${styles.numero} brr-eyebrow`}>#{p.numero}</span>
                        <div className={styles.clienteNombre}>{p.cliente.nombre}</div>
                        <div className={styles.ubicacion}>{ubicacion}</div>
                      </div>
                      <span className={`sp ${info.css}`}>{info.label}</span>
                    </div>

                    <div className={styles.itemsList}>
                      {p.items.map((item, i) => (
                        <div key={i} className={styles.itemRow}>
                          <span>{item.qty}× {item.nombre}</span>
                          <span>{fmtPrice(item.precio * item.qty)}</span>
                        </div>
                      ))}
                    </div>

                    <div className={styles.totalsBox}>
                      <div className={styles.totalsRow}>
                        <span>Subtotal</span>
                        <span>{fmtPrice(p.subtotal)}</span>
                      </div>
                      {p.domicilio > 0 && (
                        <div className={styles.totalsRow}>
                          <span>Domicilio</span>
                          <span>{fmtPrice(p.domicilio)}</span>
                        </div>
                      )}
                      {p.descuento > 0 && (
                        <div className={styles.totalsRow} style={{ color: 'var(--brr-success, var(--success))' }}>
                          <span>Descuento</span>
                          <span>-{fmtPrice(p.descuento)}</span>
                        </div>
                      )}
                      <div className={`${styles.totalsRow} ${styles.totalFinal}`}>
                        <span>Total</span>
                        <span>{fmtPrice(p.total)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <InlineCart />
      <GotoCartButton />
      <BottomNav onSearchOpen={() => setSearchOpen(true)} />

      <ProductDetail productId={detailId} onClose={() => setDetailId(null)} />
      <SearchOverlay
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onOpenDetail={(id) => { setDetailId(id); setSearchOpen(false); }}
      />
    </div>
  );
}
