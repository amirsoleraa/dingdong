import { useState, useEffect } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAdminInit } from '@/hooks/useAdminInit';
import { useAuth } from '@/hooks/useAuth';
import { getProfile } from '@/lib/data/profiles';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminTopbar } from '@/components/admin/AdminTopbar';
import { Toast } from '@/components/ui/Toast';
import styles from './AdminPage.module.css';

function AdminContent() {
  const ready = useAdminInit();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className={styles.layout}>
      {menuOpen && (
        <div className={styles.overlay} onClick={() => setMenuOpen(false)} />
      )}

      <AdminSidebar mobileOpen={menuOpen} onMobileClose={() => setMenuOpen(false)} />

      <div className={styles.main}>
        <AdminTopbar onMenuToggle={() => setMenuOpen(v => !v)} />
        <div className={styles.content}>
          {ready ? <Outlet /> : (
            <div className="empty-s">Cargando datos...</div>
          )}
        </div>
      </div>

      <Toast />
    </div>
  );
}

function AdminGuard() {
  const { user, loading } = useAuth();
  // null = checking, true = admin, false = not admin
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) { setIsAdmin(null); return; }
    getProfile(user.id)
      .then(profile => setIsAdmin(profile?.role === 'admin'))
      .catch(() => setIsAdmin(false));
  }, [user?.id]);

  if (loading) return null;
  if (!user) return <Navigate to="/admin/login" replace />;
  if (isAdmin === null) return null; // role check in progress
  if (!isAdmin) return <Navigate to="/admin/login" replace />;
  return <AdminContent />;
}

export function AdminPage() {
  return <AdminGuard />;
}
