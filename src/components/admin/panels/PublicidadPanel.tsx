import { useState, useRef, useEffect } from 'react';
import { Plus, Trash2, Image, Upload, ArrowUp, ArrowDown, Eye, EyeOff, Megaphone } from 'lucide-react';
import { listPublicidades, createPublicidad, updatePublicidad, deletePublicidad, reorderPublicidades } from '@/lib/data/publicidades';
import { uploadImage } from '@/lib/cloudinary';
import { useAppStore } from '@/stores/useAppStore';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import type { Publicidad } from '@/types';

export function PublicidadPanel() {
  const { showToast, publicidades, setPublicidades } = useAppStore();
  const confirm = useConfirm();

  // lista local con TODAS (activas e inactivas) para gestión
  const [all, setAll] = useState<Publicidad[]>([]);
  const [loading, setLoading]     = useState(true);
  const [isOpen, setIsOpen]       = useState(false);
  const [editId, setEditId]       = useState<string | null>(null);
  const [titulo, setTitulo]       = useState('');
  const [desc, setDesc]           = useState('');
  const [imgFile, setImgFile]     = useState<File | null>(null);
  const [imgPreview, setImgPreview] = useState('');
  const [saving, setSaving]       = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadAll() {
    setLoading(true);
    try {
      const list = await listPublicidades();
      list.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
      setAll(list);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  function syncStore(list: Publicidad[]) {
    setAll(list);
    setPublicidades(list.filter(p => p.activa));
  }

  function openCreate() {
    setEditId(null); setTitulo(''); setDesc('');
    setImgFile(null); setImgPreview('');
    setIsOpen(true);
  }

  function openEdit(p: Publicidad) {
    setEditId(p.id); setTitulo(p.titulo); setDesc(p.descripcion ?? '');
    setImgFile(null); setImgPreview(p.imgUrl ?? '');
    setIsOpen(true);
  }

  function resetForm() {
    setTitulo(''); setDesc(''); setImgFile(null); setImgPreview('');
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleSave() {
    if (!titulo.trim()) { showToast('El título es obligatorio', 'error'); return; }
    setSaving(true);
    try {
      let imgUrl = imgPreview;
      if (imgFile) imgUrl = await uploadImage(imgFile, 'publicidades');

      if (editId) {
        await updatePublicidad(editId, { titulo: titulo.trim(), descripcion: desc.trim(), imgUrl });
        const updated = all.map(p => p.id === editId ? { ...p, titulo: titulo.trim(), descripcion: desc.trim(), imgUrl } : p);
        syncStore(updated);
        showToast('Publicidad actualizada', 'success');
      } else {
        const orden = all.length;
        const newId = await createPublicidad({ titulo: titulo.trim(), descripcion: desc.trim(), imgUrl, activa: true, orden });
        const newPub: Publicidad = { id: newId, titulo: titulo.trim(), descripcion: desc.trim(), imgUrl, activa: true, orden };
        syncStore([...all, newPub]);
        showToast('Publicidad creada', 'success');
      }
      setIsOpen(false); resetForm();
    } catch {
      showToast('Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActiva(p: Publicidad) {
    await updatePublicidad(p.id, { activa: !p.activa });
    syncStore(all.map(x => x.id === p.id ? { ...x, activa: !p.activa } : x));
  }

  async function handleDelete(id: string) {
    const ok = await confirm({ title: 'Eliminar publicidad', message: '¿Eliminar esta publicidad?', danger: true, confirmLabel: 'Eliminar' });
    if (!ok) return;
    await deletePublicidad(id);
    syncStore(all.filter(p => p.id !== id));
    showToast('Publicidad eliminada');
  }

  async function move(idx: number, dir: -1 | 1) {
    const next = [...all];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    // actualizar campo orden en todos
    const reordered = next.map((p, i) => ({ ...p, orden: i }));
    await reorderPublicidades(reordered.map(p => ({ id: p.id, orden: p.orden })));
    syncStore(reordered);
  }

  return (
    <div>
      <div className="admin-card-hdr" style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', marginBottom: 16 }}>
        <h3>Publicidades del carrusel ({all.length})</h3>
        <button className="btn-add" onClick={openCreate}>
          <Plus size={16} /> Nueva publicidad
        </button>
      </div>

      {loading ? (
        <div className="empty-s">Cargando...</div>
      ) : all.length === 0 ? (
        <div className="empty-s">
          <Megaphone size={40} style={{ margin: '0 auto 12px', opacity: .4 }} />
          No hay publicidades. Crea la primera para llenar el carrusel.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {all.map((p, idx) => (
            <div key={p.id} className="admin-card" style={{ opacity: p.activa ? 1 : .5 }}>
              <div style={{ display: 'flex', gap: 0 }}>
                {/* Imagen o placeholder */}
                <div style={{
                  width: 96, flexShrink: 0, background: 'var(--bg2)',
                  borderRadius: '16px 0 0 16px', overflow: 'hidden',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {p.imgUrl
                    ? <img src={p.imgUrl} alt={p.titulo} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <Megaphone size={24} style={{ opacity: .3 }} />
                  }
                </div>

                {/* Info + acciones */}
                <div style={{ flex: 1, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{p.titulo}</div>
                      {p.descripcion && (
                        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2, lineHeight: 1.4 }}>{p.descripcion}</div>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                        Posición {idx + 1} de {all.length}
                      </div>
                    </div>
                    {/* Estado */}
                    <span className={`sp ${p.activa ? 'sp-a' : 'sp-x'}`} style={{ flexShrink: 0 }}>
                      {p.activa ? 'Activa' : 'Oculta'}
                    </span>
                  </div>

                  {/* Botones */}
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    <button className="ab ab-e" onClick={() => openEdit(p)} style={{ fontSize: 12 }}>Editar</button>
                    <button className="ab ab-b" onClick={() => toggleActiva(p)} title={p.activa ? 'Ocultar' : 'Mostrar'}>
                      {p.activa ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                    <button className="ab ab-e" onClick={() => move(idx, -1)} disabled={idx === 0} style={{ opacity: idx === 0 ? .3 : 1 }}>
                      <ArrowUp size={12} />
                    </button>
                    <button className="ab ab-e" onClick={() => move(idx, 1)} disabled={idx === all.length - 1} style={{ opacity: idx === all.length - 1 ? .3 : 1 }}>
                      <ArrowDown size={12} />
                    </button>
                    <button className="ab ab-d" onClick={() => handleDelete(p.id)}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={isOpen} onClose={() => { setIsOpen(false); resetForm(); }} title={editId ? 'Editar publicidad' : 'Nueva publicidad'}>
        {/* Imagen */}
        <div style={{ marginBottom: 14 }}>
          {imgPreview ? (
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <img src={imgPreview} alt="preview" style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 12 }} />
              <button
                onClick={() => { setImgFile(null); setImgPreview(''); if (fileRef.current) fileRef.current.value = ''; }}
                style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,.5)', color: '#fff', border: 'none', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}
              >
                Quitar
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              style={{ width: '100%', height: 100, border: '2px dashed var(--border2)', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text3)', cursor: 'pointer', background: 'var(--bg)', fontSize: 13 }}
            >
              <Image size={24} />
              <span>Subir imagen (recomendado 520×160px)</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*"
            onChange={e => { const f = e.target.files?.[0]; if (!f) return; setImgFile(f); setImgPreview(URL.createObjectURL(f)); }}
            style={{ display: 'none' }}
          />
        </div>

        <div className="f-field">
          <label>Título *</label>
          <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ej: Combo fin de semana" />
        </div>
        <div className="f-field">
          <label>Descripción</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} placeholder="Detalle o llamada a la acción..." style={{ resize: 'none' }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
          <button className="btn-s" onClick={() => { setIsOpen(false); resetForm(); }}>Cancelar</button>
          <button className="btn-p" onClick={handleSave} disabled={saving}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Upload size={15} />
            {saving ? 'Guardando...' : editId ? 'Actualizar' : 'Publicar'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
