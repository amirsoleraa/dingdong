import { useState } from 'react';
import { Plus, Pencil, Trash2, Bike, Phone, User, Lock, Eye, EyeOff } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { createDomiciliario, updateDomiciliario, deleteDomiciliario } from '@/lib/data/domiciliarios';
import { createProfile } from '@/lib/data/profiles';
import { useAppStore } from '@/stores/useAppStore';
import { Modal } from '@/components/ui/Modal';
import { Toggle } from '@/components/ui/Toggle';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { fmtPrice } from '@/lib/utils';
import type { Domiciliario } from '@/types';

const DOM_EMAIL_DOMAIN = '@dom.barrileros.co';

/**
 * Cliente Supabase desechable (sin persistir sesión) para crear la cuenta de
 * Auth del nuevo domiciliario sin pisar la sesión del admin en este mismo
 * navegador — equivalente a la "secondary app" que usaba Firebase.
 */
function getThrowawayClient() {
  return createClient(
    import.meta.env.VITE_SUPABASE_URL as string,
    import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

interface DomForm {
  nombre: string;
  tel: string;
  pagoBase: string;
  activo: boolean;
  usuario: string;
  password: string;
}
const DEFAULT_FORM: DomForm = { nombre: '', tel: '', pagoBase: '', activo: true, usuario: '', password: '' };

export function DomiciliariosPanel() {
  const { domiciliarios, setDomiciliarios, showToast } = useAppStore();
  const confirm = useConfirm();
  const [isOpen, setIsOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm]     = useState<DomForm>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const list = Object.values(domiciliarios)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  function openCreate() {
    setEditId(null); setForm(DEFAULT_FORM); setShowPass(false); setIsOpen(true);
  }
  function openEdit(d: Domiciliario) {
    setEditId(d.id);
    setForm({
      nombre: d.nombre, tel: d.tel ?? '',
      pagoBase: d.pagoBase ? String(d.pagoBase) : '',
      activo: d.activo, usuario: d.usuario ?? '', password: '',
    });
    setShowPass(false); setIsOpen(true);
  }

  async function handleSave() {
    if (!form.nombre.trim()) { showToast('El nombre es obligatorio'); return; }
    if (!editId && !form.usuario.trim()) { showToast('El usuario es obligatorio'); return; }
    if (!editId && form.password.length < 6) { showToast('La contraseña debe tener al menos 6 caracteres'); return; }
    setSaving(true);
    try {
      const pagoBase = parseFloat(form.pagoBase) || 0;
      const tel = form.tel.trim();

      if (editId) {
        const data: Partial<Omit<Domiciliario, 'id'>> = {
          nombre: form.nombre.trim(), tel, pagoBase, activo: form.activo,
        };
        await updateDomiciliario(editId, data);
        setDomiciliarios({ ...domiciliarios, [editId]: { ...domiciliarios[editId], ...data } });
        showToast('Domiciliario actualizado', 'success');
      } else {
        // Cuenta de Auth vía cliente desechable, para no pisar la sesión del admin
        const email = `${form.usuario.trim()}${DOM_EMAIL_DOMAIN}`;
        const throwaway = getThrowawayClient();
        const { data: signUpData, error: signUpError } = await throwaway.auth.signUp({ email, password: form.password });
        await throwaway.auth.signOut();
        if (signUpError || !signUpData.user) {
          if (signUpError?.code === 'user_already_exists') {
            showToast('Ese usuario ya existe. Elige otro nombre de usuario.', 'error');
          } else {
            showToast('Error al crear cuenta de acceso. Verifica el usuario.', 'error');
          }
          setSaving(false);
          return;
        }
        const uid = signUpData.user.id;
        const data: Omit<Domiciliario, 'id'> = {
          nombre: form.nombre.trim(), tel, pagoBase, activo: form.activo,
          usuario: form.usuario.trim(), uid,
        };
        const newId = await createDomiciliario(data);
        await createProfile({ id: uid, role: 'domiciliario', domiciliarioId: newId });
        setDomiciliarios({ ...domiciliarios, [newId]: { id: newId, ...data } });
        showToast('Domiciliario creado', 'success');
      }
      setIsOpen(false);
    } catch (e) {
      console.error(e);
      showToast('Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirm({ title: 'Eliminar domiciliario', message: '¿Eliminar este domiciliario del registro?', danger: true, confirmLabel: 'Eliminar' });
    if (!ok) return;
    await deleteDomiciliario(id);
    const next = { ...domiciliarios };
    delete next[id];
    setDomiciliarios(next);
    showToast('Domiciliario eliminado');
  }

  return (
    <div>
      <div className="admin-card-hdr" style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', marginBottom: 16 }}>
        <h3>Domiciliarios ({list.length})</h3>
        <button className="btn-add" onClick={openCreate}>
          <Plus size={16} /> Nuevo domiciliario
        </button>
      </div>

      {list.length === 0 ? (
        <div className="empty-s" style={{ flexDirection: 'column', gap: 8 }}>
          <Bike size={36} style={{ opacity: .4 }} />
          No hay domiciliarios registrados aún.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {list.map(d => (
            <div key={d.id} style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderLeft: `4px solid ${d.activo ? 'var(--brand)' : 'var(--border)'}`,
              borderRadius: 12, padding: '12px 16px',
              display: 'flex', alignItems: 'center', gap: 12,
              opacity: d.activo ? 1 : 0.6,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12, background: d.activo ? 'var(--brand-light)' : 'var(--bg2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Bike size={18} color={d.activo ? 'var(--brand)' : 'var(--text3)'} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{d.nombre}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {d.tel && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Phone size={10} /> {d.tel}
                    </span>
                  )}
                  {d.usuario && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <User size={10} /> {d.usuario}
                    </span>
                  )}
                  {d.pagoBase ? (
                    <span style={{ color: 'var(--brand)', fontWeight: 600 }}>
                      {fmtPrice(d.pagoBase)} / ruta
                    </span>
                  ) : null}
                </div>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, flexShrink: 0,
                background: d.activo ? 'var(--brand-light)' : 'var(--bg2)',
                color: d.activo ? 'var(--brand)' : 'var(--text3)',
              }}>
                {d.activo ? 'Activo' : 'Inactivo'}
              </span>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button className="ab ab-e" onClick={() => openEdit(d)}><Pencil size={12} /> Editar</button>
                <button className="ab ab-d" onClick={() => handleDelete(d.id)}><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={editId ? 'Editar domiciliario' : 'Nuevo domiciliario'} maxWidth={440}>
        <div>
          <div className="f-field">
            <label>Nombre completo *</label>
            <input
              value={form.nombre}
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              placeholder="Nombre completo"
            />
          </div>
          <div className="f-field">
            <label>Teléfono</label>
            <input
              value={form.tel}
              onChange={e => setForm(f => ({ ...f, tel: e.target.value }))}
              placeholder="3001234567"
              maxLength={10}
            />
          </div>
          <div className="f-field">
            <label>Pago por ruta (COP)</label>
            <input
              type="number" min="0"
              value={form.pagoBase}
              onChange={e => setForm(f => ({ ...f, pagoBase: e.target.value }))}
              placeholder="Ej: 15000"
            />
          </div>
          {parseFloat(form.pagoBase) > 0 && (
            <div style={{ fontSize: 13, color: 'var(--brand)', background: 'var(--brand-light)', padding: '8px 12px', borderRadius: 8, marginBottom: 12 }}>
              Gana {fmtPrice(parseFloat(form.pagoBase))} por cada ruta completada
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0 12px', paddingTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>
              Acceso al portal
            </div>
            <div className="f-field">
              <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}><User size={12} /> Usuario *</label>
              <input
                value={form.usuario}
                onChange={e => setForm(f => ({ ...f, usuario: e.target.value.toLowerCase().replace(/\s/g, '') }))}
                placeholder="juan123"
                disabled={!!editId && !!domiciliarios[editId]?.uid}
              />
              {editId && domiciliarios[editId]?.uid && (
                <span style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>El usuario no se puede cambiar después de creado</span>
              )}
            </div>
            {editId ? (
              <div style={{ fontSize: 12, color: 'var(--text3)', background: 'var(--bg2)', borderRadius: 8, padding: '8px 10px' }}>
                Para restablecer la contraseña de acceso, usa{' '}
                <code>node scripts/reset-domiciliario-password.mjs {form.usuario}</code> desde la terminal.
              </div>
            ) : (
              <div className="f-field">
                <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Lock size={12} /> Contraseña *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Mínimo 6 caracteres"
                    style={{ paddingRight: 40 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)' }}
                  >
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
            )}
          </div>

          <Toggle value={form.activo} onChange={v => setForm(f => ({ ...f, activo: v }))} label="Activo" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 20 }}>
            <button className="btn-s" onClick={() => setIsOpen(false)}>Cancelar</button>
            <button className="btn-p" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
