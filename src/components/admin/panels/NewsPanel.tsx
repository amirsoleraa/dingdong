import { useState, useRef } from 'react';
import { Plus, Trash2, Image, Upload, Bell } from 'lucide-react';
import { supabaseReady } from '@/lib/supabase';
import { createNovedad, deleteNovedad } from '@/lib/data/novedades';
import { uploadImage } from '@/lib/cloudinary';
import { useAppStore } from '@/stores/useAppStore';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { tsMs } from '@/lib/utils';
import type { Novedad } from '@/types';

export function NewsPanel() {
  const { novedades, showToast, setNovedades } = useAppStore();
  const confirm = useConfirm();

  const [isOpen, setIsOpen]         = useState(false);
  const [titulo, setTitulo]         = useState('');
  const [desc, setDesc]             = useState('');
  const [imgFile, setImgFile]       = useState<File | null>(null);
  const [imgPreview, setImgPreview] = useState('');
  const [saving, setSaving]         = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const sorted = Object.values(novedades)
    .sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));

  function handleImgChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImgFile(file);
    setImgPreview(URL.createObjectURL(file));
  }

  function resetForm() {
    setTitulo(''); setDesc('');
    setImgFile(null); setImgPreview('');
  }

  async function handleSave() {
    if (!titulo.trim()) { showToast('El título es obligatorio', 'error'); return; }
    if (!supabaseReady)  { showToast('Supabase no configurado', 'error'); return; }
    setSaving(true);
    try {
      let imgUrl = '';
      if (imgFile) {
        imgUrl = await uploadImage(imgFile, 'novedades');
      }

      const id = await createNovedad({ titulo: titulo.trim(), descripcion: desc.trim(), imgUrl, activa: true });
      const novedad: Novedad = { id, titulo: titulo.trim(), descripcion: desc.trim(), imgUrl, activa: true };
      setNovedades({ ...novedades, [id]: novedad });
      showToast('Novedad publicada', 'success');
      setIsOpen(false);
      resetForm();
    } catch {
      showToast('Error al guardar la novedad', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirm({ title: 'Eliminar novedad', message: '¿Eliminar esta novedad?', danger: true, confirmLabel: 'Eliminar' });
    if (!ok) return;
    if (!supabaseReady) return;
    await deleteNovedad(id);
    const next = { ...novedades };
    delete next[id];
    setNovedades(next);
    showToast('Novedad eliminada');
  }

  return (
    <div>
      <div className="admin-card-hdr" style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', marginBottom: 16 }}>
        <h3>Novedades ({sorted.length})</h3>
        <button className="btn-add" onClick={() => setIsOpen(true)}>
          <Plus size={16} /> Nueva novedad
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="empty-s">
          <Bell size={40} style={{ margin: '0 auto 12px' }} />
          No hay novedades publicadas.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sorted.map(n => (
            <div key={n.id} className="admin-card">
              <div style={{ display: 'flex' }}>
                {n.imgUrl && (
                  <img src={n.imgUrl} alt={n.titulo} style={{ width: 100, height: 80, objectFit: 'cover', borderRadius: '16px 0 0 16px', flexShrink: 0 }} />
                )}
                <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{n.titulo}</div>
                    {n.descripcion && (
                      <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4, lineHeight: 1.5 }}>{n.descripcion}</div>
                    )}
                  </div>
                  <button className="ab ab-d" onClick={() => handleDelete(n.id)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={isOpen} onClose={() => { setIsOpen(false); resetForm(); }} title="Nueva novedad">
        <div style={{ marginBottom: 14 }}>
          {imgPreview ? (
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <img src={imgPreview} alt="preview" style={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 12 }} />
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
              <span>Subir imagen de la novedad</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" onChange={handleImgChange} style={{ display: 'none' }} />
        </div>

        <div className="f-field">
          <label>Título *</label>
          <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ej: Horario especial este sábado..." />
        </div>
        <div className="f-field">
          <label>Descripción</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} placeholder="Descripción del producto, precio, detalles..." style={{ resize: 'none' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
          <button className="btn-s" onClick={() => { setIsOpen(false); resetForm(); }}>Cancelar</button>
          <button className="btn-p" onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Upload size={15} />
            {saving ? 'Publicando...' : 'Publicar'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
