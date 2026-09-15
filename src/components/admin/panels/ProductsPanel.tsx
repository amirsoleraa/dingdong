import { useState } from 'react';
import { Plus, Pencil, Trash2, Eye, EyeOff } from 'lucide-react';
import { createProducto, updateProducto, deleteProducto } from '@/lib/data/productos';
import { uploadImage } from '@/lib/cloudinary';
import { useAppStore } from '@/stores/useAppStore';
import { useAdminStore } from '@/stores/useAdminStore';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { TagInput } from '@/components/ui/TagInput';
import { Toggle } from '@/components/ui/Toggle';
import { fmtPrice } from '@/lib/utils';
import type { Producto, ProductoAdicional } from '@/types';

interface ProdForm {
  nombre: string;
  descripcion: string;
  precio: string;
  costo: string;
  emoji: string;
  categoriaId: string;
  tipo: 'comestible' | 'nocomestible';
  activo: boolean;
}

const DEFAULT_FORM: ProdForm = {
  nombre: '', descripcion: '', precio: '', costo: '',
  emoji: '🍖', categoriaId: '', tipo: 'comestible', activo: true,
};

export function ProductsPanel() {
  const { productos, categorias, adicionales, showToast, setProductos } = useAppStore();
  const { productosFiltro, setProductosFiltro, tmpIngrTags, setTmpIngrTags } = useAdminStore();
  const confirm = useConfirm();

  const [isOpen, setIsOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ProdForm>(DEFAULT_FORM);
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [imgPreview, setImgPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [tmpAdicionales, setTmpAdicionales] = useState<ProductoAdicional[]>([]);

  const filtered = Object.values(productos).filter(p =>
    !productosFiltro || p.nombre.toLowerCase().includes(productosFiltro.toLowerCase())
  );

  function openCreate() {
    setEditId(null);
    setForm(DEFAULT_FORM);
    setTmpIngrTags([]);
    setTmpAdicionales([]);
    setImgFile(null);
    setImgPreview('');
    setIsOpen(true);
  }

  function openEdit(p: Producto) {
    setEditId(p.id);
    setForm({
      nombre: p.nombre, descripcion: p.descripcion ?? '',
      precio: String(p.precio), costo: String(p.costo ?? ''),
      emoji: p.emoji ?? '🍖', categoriaId: p.categoriaId,
      tipo: p.tipo, activo: p.activo,
    });
    setTmpIngrTags(p.ingredientes ?? []);
    // Guard: existing products may have legacy string[] adicionales
    const loaded = (p.adicionales ?? []).filter(
      (a): a is ProductoAdicional => typeof a === 'object' && 'adicionalId' in a
    );
    setTmpAdicionales(loaded);
    setImgFile(null);
    setImgPreview(p.imgUrl ?? '');
    setIsOpen(true);
  }

  function toggleAdicional(adicionalId: string) {
    setTmpAdicionales(prev => {
      if (prev.find(a => a.adicionalId === adicionalId)) {
        return prev.filter(a => a.adicionalId !== adicionalId);
      }
      return [...prev, { adicionalId, cantidadMax: 1 }];
    });
  }

  function setCantidadMax(adicionalId: string, cantidadMax: number) {
    setTmpAdicionales(prev =>
      prev.map(a => a.adicionalId === adicionalId ? { ...a, cantidadMax } : a)
    );
  }

  async function handleSave() {
    if (!form.nombre.trim() || !form.precio) {
      showToast('Nombre y precio son obligatorios');
      return;
    }
    setSaving(true);
    try {
      let imgUrl = imgPreview;
      if (imgFile) {
        imgUrl = await uploadImage(imgFile, 'productos');
      }

      const data: Omit<Producto, 'id'> = {
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim(),
        precio: parseFloat(form.precio) || 0,
        costo: parseFloat(form.costo) || 0,
        emoji: form.emoji || '🍖',
        imgUrl,
        categoriaId: form.categoriaId,
        tipo: form.tipo,
        ingredientes: form.tipo === 'comestible' ? tmpIngrTags : [],
        adicionales: tmpAdicionales,
        activo: form.activo,
      };

      if (editId) {
        await updateProducto(editId, data);
        setProductos({ ...productos, [editId]: { id: editId, ...data } });
        showToast('Producto actualizado', 'success');
      } else {
        const newId = await createProducto(data);
        setProductos({ ...productos, [newId]: { id: newId, ...data } });
        showToast('Producto creado', 'success');
      }
      setIsOpen(false);
    } catch (e) {
      showToast('Error al guardar el producto', 'error');
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirm({ title: 'Eliminar producto', message: '¿Eliminar este producto?', danger: true, confirmLabel: 'Eliminar' });
    if (!ok) return;
    await deleteProducto(id);
    const next = { ...productos };
    delete next[id];
    setProductos(next);
    showToast('Producto eliminado');
  }

  async function toggleActivo(p: Producto) {
    await updateProducto(p.id, { activo: !p.activo });
    setProductos({ ...productos, [p.id]: { ...p, activo: !p.activo } });
  }

  const precio = parseFloat(form.precio) || 0;
  const costo  = parseFloat(form.costo)  || 0;
  const ganancia = precio - costo;
  const pct = precio > 0 ? Math.round(ganancia / precio * 100) : 0;

  function handleImgChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImgFile(file);
    setImgPreview(URL.createObjectURL(file));
  }

  return (
    <div>
      <div className="admin-card-hdr" style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', marginBottom: 16 }}>
        <h3>Productos ({filtered.length})</h3>
        <button className="btn-add" onClick={openCreate}>
          <Plus size={16} /> Nuevo producto
        </button>
      </div>

      <input
        className="s-input"
        style={{ width: '100%', marginBottom: 16 }}
        placeholder="Buscar producto..."
        value={productosFiltro}
        onChange={e => setProductosFiltro(e.target.value)}
      />

      <div className="prods-admin-grid">
        {filtered.map(p => {
          const cat = categorias[p.categoriaId];
          return (
            <div key={p.id} className="pac" style={{ opacity: p.activo ? 1 : .5 }}>
              <div className="pac-img">
                {p.imgUrl ? <img src={p.imgUrl} alt={p.nombre} /> : <span>{p.emoji ?? '🍖'}</span>}
              </div>
              <div className="pac-name">{p.nombre}</div>
              <div className="pac-price">{fmtPrice(p.precio)}</div>
              {cat && (
                <div className="pac-cat" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color, display: 'inline-block' }} />
                  {cat.nombre}
                </div>
              )}
              <div className="pac-actions">
                <button className="ab ab-e" onClick={() => openEdit(p)} title="Editar">
                  <Pencil size={12} /> Editar
                </button>
                <button className="ab ab-b" onClick={() => toggleActivo(p)} title={p.activo ? 'Ocultar' : 'Mostrar'}>
                  {p.activo ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
                <button className="ab ab-d" onClick={() => handleDelete(p.id)} title="Eliminar">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="empty-s">No hay productos. Crea el primero.</div>
      )}

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={editId ? 'Editar producto' : 'Nuevo producto'} maxWidth={560}>
        <div>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ width: 80, height: 80, borderRadius: 16, margin: '0 auto 10px', background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, overflow: 'hidden' }}>
              {imgPreview
                ? <img src={imgPreview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span>{form.emoji}</span>
              }
            </div>
            <input type="file" accept="image/*" onChange={handleImgChange} style={{ fontSize: 13 }} />
          </div>

          <div className="f-field">
            <label>Nombre *</label>
            <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Nombre del producto" />
          </div>
          <div className="f-field">
            <label>Descripción</label>
            <textarea value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} rows={2} placeholder="Descripción corta..." style={{ resize: 'none' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="f-field">
              <label>Precio *</label>
              <input type="number" min="0" value={form.precio} onChange={e => setForm(f => ({ ...f, precio: e.target.value }))} placeholder="0" />
            </div>
            <div className="f-field">
              <label>Costo</label>
              <input type="number" min="0" value={form.costo} onChange={e => setForm(f => ({ ...f, costo: e.target.value }))} placeholder="0" />
            </div>
          </div>
          {precio > 0 && (
            <div className="gan-badge">Ganancia: {fmtPrice(ganancia)} ({pct}%)</div>
          )}
          <div className="f-field">
            <label>Emoji (si no hay imagen)</label>
            <input value={form.emoji} onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))} placeholder="🍖" />
          </div>
          <div className="f-field">
            <label>Categoría</label>
            <select value={form.categoriaId} onChange={e => setForm(f => ({ ...f, categoriaId: e.target.value }))}>
              <option value="">Sin categoría</option>
              {Object.values(categorias).map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
          <div className="f-field">
            <label>Tipo</label>
            <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as ProdForm['tipo'] }))}>
              <option value="comestible">Comestible</option>
              <option value="nocomestible">No comestible</option>
            </select>
          </div>
          {form.tipo === 'comestible' && (
            <div className="f-field">
              <label>Ingredientes</label>
              <TagInput tags={tmpIngrTags} onChange={setTmpIngrTags} placeholder="Ej: Papa, Cebolla..." />
            </div>
          )}
          <div className="f-field">
            <label>Adicionales disponibles</label>
            {Object.keys(adicionales).length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text2)', padding: '8px 0' }}>
                No hay adicionales creados. Ve a <strong>Adicionales</strong> para crear primero.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                {Object.values(adicionales)
                  .filter(a => a.activo)
                  .sort((a, b) => a.nombre.localeCompare(b.nombre))
                  .map(ad => {
                    const sel = tmpAdicionales.find(a => a.adicionalId === ad.id);
                    return (
                      <div key={ad.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 10px', borderRadius: 8,
                        background: sel ? 'rgba(var(--brand-rgb, 255 98 41) / .08)' : 'var(--bg2)',
                        border: `1px solid ${sel ? 'rgba(var(--brand-rgb, 255 98 41) / .3)' : 'var(--border)'}`,
                        cursor: 'pointer', transition: 'all .15s',
                      }} onClick={() => toggleAdicional(ad.id)}>
                        <input
                          type="checkbox"
                          checked={!!sel}
                          onChange={() => toggleAdicional(ad.id)}
                          onClick={e => e.stopPropagation()}
                          style={{ accentColor: 'var(--brand)', width: 15, height: 15, flexShrink: 0, cursor: 'pointer' }}
                        />
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{ad.nombre}</span>
                        <span style={{ fontSize: 12, color: 'var(--brand)', fontWeight: 600 }}>{fmtPrice(ad.precio)}</span>
                        {sel && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={e => e.stopPropagation()}>
                            <span style={{ fontSize: 12, color: 'var(--text2)' }}>Máx:</span>
                            <input
                              type="number"
                              min="1"
                              max="20"
                              value={sel.cantidadMax}
                              onChange={e => setCantidadMax(ad.id, Math.max(1, parseInt(e.target.value) || 1))}
                              style={{ width: 52, textAlign: 'center', padding: '3px 6px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)' }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
          <Toggle value={form.activo} onChange={v => setForm(f => ({ ...f, activo: v }))} label="Visible en la tienda" />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 20 }}>
            <button className="btn-s" onClick={() => setIsOpen(false)}>Cancelar</button>
            <button className="btn-p" onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
