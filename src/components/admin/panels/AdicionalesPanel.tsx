import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { createAdicional, updateAdicional, deleteAdicional } from '@/lib/data/adicionales';
import { useAppStore } from '@/stores/useAppStore';
import { Modal } from '@/components/ui/Modal';
import { Toggle } from '@/components/ui/Toggle';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { fmtPrice } from '@/lib/utils';
import type { Adicional } from '@/types';

interface AdicionalForm {
  nombre: string;
  precio: string;
  costo: string;
  activo: boolean;
}

const DEFAULT_FORM: AdicionalForm = {
  nombre: '', precio: '', costo: '', activo: true,
};

export function AdicionalesPanel() {
  const { adicionales, setAdicionales, showToast } = useAppStore();
  const confirm = useConfirm();
  const [isOpen, setIsOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<AdicionalForm>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  const list = Object.values(adicionales).sort((a, b) => a.nombre.localeCompare(b.nombre));

  function openCreate() {
    setEditId(null);
    setForm(DEFAULT_FORM);
    setIsOpen(true);
  }

  function openEdit(a: Adicional) {
    setEditId(a.id);
    setForm({ nombre: a.nombre, precio: String(a.precio), costo: String(a.costo), activo: a.activo });
    setIsOpen(true);
  }

  async function handleSave() {
    if (!form.nombre.trim()) { showToast('El nombre es obligatorio'); return; }
    setSaving(true);
    try {
      const data: Omit<Adicional, 'id'> = {
        nombre: form.nombre.trim(),
        precio: parseFloat(form.precio) || 0,
        costo: parseFloat(form.costo) || 0,
        activo: form.activo,
      };
      if (editId) {
        await updateAdicional(editId, data);
        setAdicionales({ ...adicionales, [editId]: { id: editId, ...data } });
        showToast('Adicional actualizado', 'success');
      } else {
        const newId = await createAdicional(data);
        setAdicionales({ ...adicionales, [newId]: { id: newId, ...data } });
        showToast('Adicional creado', 'success');
      }
      setIsOpen(false);
    } catch (e) {
      showToast('Error al guardar', 'error');
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirm({ title: 'Eliminar adicional', message: '¿Eliminar este adicional?', danger: true, confirmLabel: 'Eliminar' });
    if (!ok) return;
    await deleteAdicional(id);
    const next = { ...adicionales };
    delete next[id];
    setAdicionales(next);
    showToast('Adicional eliminado');
  }

  const precio = parseFloat(form.precio) || 0;
  const costo  = parseFloat(form.costo)  || 0;
  const ganancia = precio - costo;
  const pct = precio > 0 ? Math.round(ganancia / precio * 100) : 0;

  return (
    <div>
      <div className="admin-card-hdr" style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', marginBottom: 16 }}>
        <h3>Adicionales ({list.length})</h3>
        <button className="btn-add" onClick={openCreate}>
          <Plus size={16} /> Nuevo adicional
        </button>
      </div>

      {list.length === 0 ? (
        <div className="empty-s">No hay adicionales. Crea el primero.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {list.map(a => {
            const g = a.precio - a.costo;
            const p = a.precio > 0 ? Math.round(g / a.precio * 100) : 0;
            return (
              <div key={a.id} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderLeft: `4px solid ${a.activo ? 'var(--brand)' : 'var(--border)'}`,
                borderRadius: 12, padding: '12px 16px',
                display: 'flex', alignItems: 'center', gap: 12,
                opacity: a.activo ? 1 : 0.6,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{a.nombre}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--brand)', fontWeight: 600 }}>{fmtPrice(a.precio)}</span>
                    <span>Costo: {fmtPrice(a.costo)}</span>
                    <span style={{ color: g >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      Ganancia: {fmtPrice(g)} ({p}%)
                    </span>
                  </div>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, flexShrink: 0,
                  background: a.activo ? 'var(--brand-light)' : 'var(--bg2)',
                  color: a.activo ? 'var(--brand)' : 'var(--text3)',
                }}>
                  {a.activo ? 'Activo' : 'Inactivo'}
                </span>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button className="ab ab-e" onClick={() => openEdit(a)} title="Editar"><Pencil size={12} /> Editar</button>
                  <button className="ab ab-d" onClick={() => handleDelete(a.id)} title="Eliminar"><Trash2 size={12} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={editId ? 'Editar adicional' : 'Nuevo adicional'} maxWidth={460}>
        <div>
          <div className="f-field">
            <label>Nombre *</label>
            <input
              value={form.nombre}
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              placeholder="Ej: Queso extra, Salsa chimichurri..."
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="f-field">
              <label>Precio (al cliente)</label>
              <input type="number" min="0" value={form.precio}
                onChange={e => setForm(f => ({ ...f, precio: e.target.value }))} placeholder="0" />
            </div>
            <div className="f-field">
              <label>Costo interno</label>
              <input type="number" min="0" value={form.costo}
                onChange={e => setForm(f => ({ ...f, costo: e.target.value }))} placeholder="0" />
            </div>
          </div>
          {precio > 0 && (
            <div className="gan-badge">Ganancia: {fmtPrice(ganancia)} ({pct}%)</div>
          )}
          <Toggle value={form.activo} onChange={v => setForm(f => ({ ...f, activo: v }))} label="Activo (disponible en productos)" />
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
