import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { createCategoria, updateCategoria, deleteCategoria } from '@/lib/data/categorias';
import { uploadImage } from '@/lib/cloudinary';
import { useAppStore } from '@/stores/useAppStore';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import type { Categoria } from '@/types';

const COLOR_SWATCHES = [
  '#F4521E','#EF4444','#F97316','#EAB308','#22C55E',
  '#14B8A6','#3B82F6','#8B5CF6','#EC4899','#111111',
];

export function CategoriesPanel() {
  const { categorias, productos, showToast, setCategorias } = useAppStore();
  const confirm = useConfirm();
  const [isOpen, setIsOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [color, setColor] = useState('#F4521E');
  const [emoji, setEmoji] = useState('');
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [imgPreview, setImgPreview] = useState('');
  const [saving, setSaving] = useState(false);

  const cats = Object.values(categorias).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

  function prodCount(catId: string) {
    return Object.values(productos).filter(p => p.categoriaId === catId).length;
  }

  function openCreate() {
    setEditId(null); setNombre(''); setColor('#F4521E');
    setEmoji(''); setImgFile(null); setImgPreview('');
    setIsOpen(true);
  }
  function openEdit(c: Categoria) {
    setEditId(c.id); setNombre(c.nombre); setColor(c.color);
    setEmoji(c.emoji ?? ''); setImgFile(null); setImgPreview(c.imgUrl ?? '');
    setIsOpen(true);
  }

  function handleImgChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImgFile(file);
    setImgPreview(URL.createObjectURL(file));
  }

  async function handleSave() {
    if (!nombre.trim()) { showToast('El nombre es obligatorio'); return; }
    setSaving(true);
    try {
      let imgUrl = imgPreview;
      if (imgFile) {
        imgUrl = await uploadImage(imgFile, 'categorias');
      }
      const data = { nombre: nombre.trim(), color, emoji: emoji.trim(), imgUrl };

      if (editId) {
        await updateCategoria(editId, data);
        setCategorias({ ...categorias, [editId]: { ...categorias[editId], ...data } });
        showToast('Categoría actualizada');
      } else {
        const newId = await createCategoria({ ...data, orden: cats.length });
        setCategorias({ ...categorias, [newId]: { id: newId, ...data, orden: cats.length } });
        showToast('Categoría creada');
      }
      setIsOpen(false);
    } catch (e) {
      showToast('Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (prodCount(id) > 0) { showToast('No puedes eliminar una categoría con productos asignados'); return; }
    const ok = await confirm({ title: 'Eliminar categoría', message: '¿Eliminar esta categoría?', danger: true, confirmLabel: 'Eliminar' });
    if (!ok) return;
    await deleteCategoria(id);
    const next = { ...categorias };
    delete next[id];
    setCategorias(next);
    showToast('Categoría eliminada');
  }

  return (
    <div>
      <div className="admin-card-hdr" style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', marginBottom: 16 }}>
        <h3>Categorías ({cats.length})</h3>
        <button className="btn-add" onClick={openCreate}>
          <Plus size={16} /> Nueva categoría
        </button>
      </div>

      {cats.length === 0 ? (
        <div className="empty-s">No hay categorías aún.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {cats.map(c => {
            const count = prodCount(c.id);
            return (
              <div key={c.id} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderLeft: `4px solid ${c.color}`,
                borderRadius: 12, padding: '12px 16px',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: c.imgUrl ? 'var(--bg2)' : c.color, flexShrink: 0, border: '2px solid rgba(0,0,0,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, overflow: 'hidden' }}>
                  {c.imgUrl
                    ? <img src={c.imgUrl} alt={c.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : c.emoji || null
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{c.nombre}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                    {count} producto{count !== 1 ? 's' : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button className="ab ab-e" onClick={() => openEdit(c)}><Pencil size={12} /> Editar</button>
                  <button className="ab ab-d" onClick={() => handleDelete(c.id)}><Trash2 size={12} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={editId ? 'Editar categoría' : 'Nueva categoría'}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ width: 72, height: 72, borderRadius: 16, margin: '0 auto 10px', background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, overflow: 'hidden' }}>
            {imgPreview
              ? <img src={imgPreview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span>{emoji || '🍽️'}</span>
            }
          </div>
          <input type="file" accept="image/*" onChange={handleImgChange} style={{ fontSize: 13 }} />
        </div>
        <div className="f-field">
          <label>Nombre *</label>
          <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Asados, Acompañamientos..." />
        </div>
        <div className="f-field">
          <label>Emoji (si no hay imagen)</label>
          <input value={emoji} onChange={e => setEmoji(e.target.value)} placeholder="🍖" />
        </div>
        <div className="f-field">
          <label>Color</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {COLOR_SWATCHES.map(c => (
              <div
                key={c}
                onClick={() => setColor(c)}
                style={{
                  width: 32, height: 32, borderRadius: 8, background: c, cursor: 'pointer',
                  border: `3px solid ${color === c ? 'var(--text)' : 'transparent'}`,
                  transition: 'transform .12s',
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="color" value={color} onChange={e => setColor(e.target.value)}
              style={{ width: 40, height: 40, border: 'none', borderRadius: 8, cursor: 'pointer', padding: 2 }} />
            <input value={color} onChange={e => setColor(e.target.value)} style={{ flex: 1 }}
              className="s-input" placeholder="#F4521E" />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
          <button className="btn-s" onClick={() => setIsOpen(false)}>Cancelar</button>
          <button className="btn-p" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
