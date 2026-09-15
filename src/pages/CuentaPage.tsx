import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { ArrowLeft, LogOut, User as UserIcon } from 'lucide-react';
import { updateClienteProfile } from '@/lib/data/clientes';
import { useClienteAuth } from '@/hooks/useClienteAuth';
import { useClienteStore } from '@/stores/useClienteStore';
import { useAppStore } from '@/stores/useAppStore';
import { isValidPhone } from '@/lib/utils';

export function CuentaPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading, logOut } = useClienteAuth();
  const { cliente, loading: clienteLoading } = useClienteStore();
  const { showToast } = useAppStore();

  const [editando,   setEditando]   = useState(false);
  const [nombre,     setNombre]     = useState('');
  const [telefono,   setTelefono]   = useState('');
  const [saving,     setSaving]     = useState(false);

  if (authLoading || clienteLoading) return null;
  if (!user) return <Navigate to="/login" replace />;

  function startEdit() {
    setNombre(cliente?.nombre ?? '');
    setTelefono(cliente?.telefono ?? '');
    setEditando(true);
  }

  async function saveProfile() {
    if (telefono && !isValidPhone(telefono)) { showToast('Teléfono inválido', 'error'); return; }
    setSaving(true);
    try {
      await updateClienteProfile(user!.id, { nombre: nombre.trim(), telefono: telefono.trim() });
      showToast('Perfil actualizado', 'success');
      setEditando(false);
    } catch {
      showToast('Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    await logOut();
    navigate('/', { replace: true });
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '20px 16px 80px' }}>
      <button
        onClick={() => navigate('/')}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 20, fontSize: 14, color: 'var(--text2)', fontFamily: 'inherit' }}
      >
        <ArrowLeft size={16} /> Volver
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--brand-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <UserIcon size={26} color="var(--brand)" />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 17 }}>{cliente?.nombre || 'Sin nombre'}</div>
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>{cliente?.correo || cliente?.telefono}</div>
        </div>
      </div>

      <div className="admin-card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: editando ? 12 : 6 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Mis datos</h3>
          {!editando && <button className="btn-s" style={{ fontSize: 12, padding: '5px 10px' }} onClick={startEdit}>Editar</button>}
        </div>
        {editando ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="f-field" style={{ margin: 0 }}>
              <label>Nombre</label>
              <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Tu nombre" autoComplete="off" />
            </div>
            <div className="f-field" style={{ margin: 0 }}>
              <label>Teléfono</label>
              <input value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="3001234567" maxLength={10} autoComplete="off" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button className="btn-s" onClick={() => setEditando(false)} disabled={saving}>Cancelar</button>
              <button className="btn-p" onClick={saveProfile} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 14, color: 'var(--text2)' }}>
            {cliente?.telefono || 'Sin teléfono guardado'}
          </div>
        )}
      </div>

      <button
        onClick={handleLogout}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', justifyContent: 'center', padding: 12, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--danger, #dc2626)', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}
      >
        <LogOut size={16} /> Cerrar sesión
      </button>
    </div>
  );
}
