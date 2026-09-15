import { useState } from 'react';
import { Plus, Pencil, Trash2, RefreshCw } from 'lucide-react';
import { createCupon, updateCupon, deleteCupon } from '@/lib/data/cupones';
import { useAppStore } from '@/stores/useAppStore';
import { Modal } from '@/components/ui/Modal';
import { Toggle } from '@/components/ui/Toggle';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { fmtPrice } from '@/lib/utils';
import type { Cupon } from '@/types';

interface CuponForm {
  codigo: string;
  tipo: 'porcentaje' | 'fijo';
  valor: string;
  limite: string;
  activo: boolean;
}

const DEFAULT_FORM: CuponForm = { codigo: '', tipo: 'porcentaje', valor: '', limite: '0', activo: true };

export function CouponsPanel() {
  const { cupones, showToast, setCupones } = useAppStore();
  const confirm = useConfirm();
  const [isOpen, setIsOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CuponForm>(DEFAULT_FORM);
  const [editUsos, setEditUsos] = useState(0);
  const [saving, setSaving] = useState(false);

  const list = Object.values(cupones).sort((a, b) => a.codigo.localeCompare(b.codigo));

  function genCodigo() {
    const arr = new Uint8Array(4);
    crypto.getRandomValues(arr);
    const code = Array.from(arr, b => b.toString(36)).join('').toUpperCase().slice(0, 6);
    setForm(f => ({ ...f, codigo: code }));
  }

  function openCreate() {
    setEditId(null); setForm(DEFAULT_FORM); setEditUsos(0);
    setIsOpen(true);
  }
  function openEdit(c: Cupon) {
    setEditId(c.id);
    setForm({ codigo: c.codigo, tipo: c.tipo, valor: String(c.valor), limite: String(c.limite), activo: c.activo });
    setEditUsos(c.usos);
    setIsOpen(true);
  }

  async function handleSave() {
    if (!form.codigo.trim() || !form.valor) { showToast('Código y valor son obligatorios'); return; }
    setSaving(true);
    try {
      const data: Omit<Cupon, 'id' | 'usos'> = {
        codigo: form.codigo.trim().toUpperCase(),
        tipo: form.tipo,
        valor: parseFloat(form.valor) || 0,
        limite: parseInt(form.limite) || 0,
        activo: form.activo,
      };
      if (editId) {
        await updateCupon(editId, data);
        setCupones({ ...cupones, [editId]: { id: editId, usos: editUsos, ...data } });
        showToast('Cupón actualizado');
      } else {
        await createCupon({ ...data, usos: 0 });
        setCupones({ ...cupones, [data.codigo]: { id: data.codigo, usos: 0, ...data } });
        showToast('Cupón creado');
      }
      setIsOpen(false);
    } catch (e) {
      showToast('Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirm({ title: 'Eliminar cupón', message: '¿Eliminar este cupón?', danger: true, confirmLabel: 'Eliminar' });
    if (!ok) return;
    await deleteCupon(id);
    const next = { ...cupones };
    delete next[id];
    setCupones(next);
    showToast('Cupón eliminado');
  }

  return (
    <div>
      <div className="admin-card-hdr" style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', marginBottom: 16 }}>
        <h3>Cupones ({list.length})</h3>
        <button className="btn-add" onClick={openCreate}><Plus size={16} /> Generar cupón</button>
      </div>

      <div className="admin-card">
        {list.length === 0 ? (
          <div className="empty-s">No hay cupones. Crea el primero.</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr><th>Código</th><th>Descuento</th><th>Usos</th><th>Estado</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              {list.map(c => (
                <tr key={c.id}>
                  <td><strong style={{ fontFamily: 'Syne, sans-serif', letterSpacing: 1 }}>{c.codigo}</strong></td>
                  <td>
                    {c.tipo === 'porcentaje' ? `${c.valor}%` : fmtPrice(c.valor)}
                  </td>
                  <td>
                    {c.usos}
                    {c.limite > 0 && <span style={{ color: 'var(--text3)', fontSize: 12 }}> / {c.limite}</span>}
                  </td>
                  <td>
                    <span className={`sp ${c.activo ? 'sp-a' : 'sp-x'}`}>
                      {c.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="ab ab-e" onClick={() => openEdit(c)}><Pencil size={12} /> Editar</button>
                      <button className="ab ab-d" onClick={() => handleDelete(c.id)}><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={editId ? 'Editar cupón' : 'Nuevo cupón'}>
        <div className="f-field">
          <label>Código</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={form.codigo}
              onChange={e => setForm(f => ({ ...f, codigo: e.target.value.toUpperCase() }))}
              placeholder="PROMO20"
              style={{ flex: 1, textTransform: 'uppercase', letterSpacing: 2 }}
            />
            <button className="ab ab-e" onClick={genCodigo} type="button" style={{ padding: '10px 12px' }}>
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
        <div className="f-field">
          <label>Tipo de descuento</label>
          <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as CuponForm['tipo'] }))}>
            <option value="porcentaje">Porcentaje (%)</option>
            <option value="fijo">Monto fijo ($)</option>
          </select>
        </div>
        <div className="f-field">
          <label>Valor *</label>
          <input type="number" min="0" value={form.valor}
            onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
            placeholder={form.tipo === 'porcentaje' ? 'Ej: 20' : 'Ej: 5000'} />
        </div>
        <div className="f-field">
          <label>Límite de usos (0 = ilimitado)</label>
          <input type="number" min="0" value={form.limite}
            onChange={e => setForm(f => ({ ...f, limite: e.target.value }))} placeholder="0" />
        </div>
        <Toggle value={form.activo} onChange={v => setForm(f => ({ ...f, activo: v }))} label="Cupón activo" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 20 }}>
          <button className="btn-s" onClick={() => setIsOpen(false)}>Cancelar</button>
          <button className="btn-p" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
