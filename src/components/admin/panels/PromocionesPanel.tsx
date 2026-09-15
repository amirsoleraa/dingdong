import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Tag, Gift, Bike, Ticket } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { listPromociones, createPromocion, updatePromocion, deletePromocion } from '@/lib/data/promociones';
import { useAppStore } from '@/stores/useAppStore';
import { Modal } from '@/components/ui/Modal';
import { Toggle } from '@/components/ui/Toggle';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { tsMs } from '@/lib/utils';
import type { Promocion, TipoPromo } from '@/types';

const TIPO_LABELS: Record<TipoPromo, string> = {
  compra_lleva:       'Compra X y lleva Y gratis',
  compra_descuento:   'Compra X y B con % descuento',
  domicilio_descuento:'Domicilio gratis / con descuento',
  compra_cupon:       'Compra X y gana cupón',
};

const TIPO_ICONS: Record<TipoPromo, React.ElementType> = {
  compra_lleva:       Gift,
  compra_descuento:   Tag,
  domicilio_descuento: Bike,
  compra_cupon:       Ticket,
};

const DEFAULT_FORM: Omit<Promocion, 'id' | 'createdAt'> = {
  nombre: '',
  tipo: 'compra_lleva',
  activa: true,
  descripcion: '',
  productoAId: '',
  cantidadA: 1,
  productoBId: '',
  cantidadB: 1,
  descuentoBPct: 100,
  domicilioPct: 100,
  domicilioGratis: true,
  cuponPct: 10,
};

export function PromocionesPanel() {
  const { productos, showToast } = useAppStore();
  const confirm = useConfirm();
  const [promos,  setPromos]  = useState<Promocion[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen,  setIsOpen]  = useState(false);
  const [editId,  setEditId]  = useState<string | null>(null);
  const [form,    setForm]    = useState<Omit<Promocion, 'id' | 'createdAt'>>(DEFAULT_FORM);
  const [saving,    setSaving]    = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const productosList = Object.values(productos).filter(p => p.activo).sort((a, b) => a.nombre.localeCompare(b.nombre));

  function promoDetail(p: Promocion): string {
    const pA = p.productoAId ? (productos[p.productoAId]?.nombre ?? '—') : null;
    const pB = p.productoBId ? (productos[p.productoBId]?.nombre ?? '—') : null;
    switch (p.tipo) {
      case 'compra_lleva':
        return pA && pB ? `Compra ${p.cantidadA ?? 1}× ${pA} → lleva ${p.cantidadB ?? 1}× ${pB} gratis` : '—';
      case 'compra_descuento':
        return pA && pB ? `Compra ${p.cantidadA ?? 1}× ${pA} → ${pB} con ${p.descuentoBPct ?? 100}% descuento` : '—';
      case 'domicilio_descuento':
        return p.domicilioGratis ? 'Domicilio gratis' : `Domicilio con ${p.domicilioPct ?? 0}% descuento`;
      case 'compra_cupon':
        return pA ? `Compra ${p.cantidadA ?? 1}× ${pA} → cupón de ${p.cuponPct ?? 10}% descuento` : '—';
      default: return '—';
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const list = await listPromociones();
        list.sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));
        setPromos(list);
      } finally {
        setLoading(false);
      }
    }
    load();
    const channel = supabase
      .channel('promociones-admin-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'promociones' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  function openCreate() {
    setEditId(null);
    setForm(DEFAULT_FORM);
    setIsOpen(true);
  }

  function openEdit(p: Promocion) {
    setEditId(p.id);
    setForm({
      nombre: p.nombre, tipo: p.tipo, activa: p.activa, descripcion: p.descripcion ?? '',
      productoAId: p.productoAId ?? '', cantidadA: p.cantidadA ?? 1,
      productoBId: p.productoBId ?? '', cantidadB: p.cantidadB ?? 1,
      descuentoBPct: p.descuentoBPct ?? 100,
      domicilioPct: p.domicilioPct ?? 100, domicilioGratis: p.domicilioGratis ?? true,
      cuponPct: p.cuponPct ?? 10,
    });
    setIsOpen(true);
  }

  function buildPreview(): string {
    const prodA = productos[form.productoAId ?? ''];
    const prodB = productos[form.productoBId ?? ''];
    const nomA  = prodA?.nombre ?? 'el producto A';
    const nomB  = prodB?.nombre ?? 'el producto B';
    switch (form.tipo) {
      case 'compra_lleva':
        return `Compra ${form.cantidadA} o más ${nomA} y lleva ${form.cantidadB} ${nomB} gratis`;
      case 'compra_descuento':
        return `Compra ${form.cantidadA} o más ${nomA} y ${nomB} con ${form.descuentoBPct}% de descuento`;
      case 'domicilio_descuento':
        return form.domicilioGratis
          ? 'Compra por la app y domicilio gratis'
          : `Compra por la app y ${form.domicilioPct}% de descuento en domicilio`;
      case 'compra_cupon':
        return `Compra ${form.cantidadA} o más ${nomA} y gana un cupón de ${form.cuponPct}% de descuento`;
    }
  }

  async function handleSave() {
    if (!form.nombre.trim()) { showToast('El nombre es obligatorio'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        nombre: form.nombre.trim(),
        descripcion: buildPreview(),
      };
      if (editId) {
        await updatePromocion(editId, payload);
        showToast('Promoción actualizada', 'success');
      } else {
        await createPromocion(payload);
        showToast('Promoción creada', 'success');
      }
      setIsOpen(false);
    } catch {
      showToast('Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirm({ title: 'Eliminar promoción', message: '¿Eliminar esta promoción?', danger: true, confirmLabel: 'Eliminar' });
    if (!ok) return;
    await deletePromocion(id);
    showToast('Promoción eliminada');
  }

  async function handleToggle(p: Promocion) {
    await updatePromocion(p.id, { activa: !p.activa });
  }

  const Icon = form.tipo ? TIPO_ICONS[form.tipo] : Tag;

  return (
    <div>
      <div className="admin-card-hdr" style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', marginBottom: 16 }}>
        <div>
          <h3>Promociones ({promos.length})</h3>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
            {promos.filter(p => p.activa).length} activas
          </div>
        </div>
        <button className="btn-add" onClick={openCreate}><Plus size={16} /> Nueva promoción</button>
      </div>

      {loading ? (
        <div className="empty-s">Cargando...</div>
      ) : promos.length === 0 ? (
        <div className="empty-s" style={{ flexDirection: 'column', gap: 8 }}>
          <Tag size={36} style={{ opacity: .4 }} />
          No hay promociones creadas aún.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {promos.map(p => {
            const PromoIcon = TIPO_ICONS[p.tipo];
            const isExp = expandedId === p.id;
            return (
              <div key={p.id} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderLeft: `4px solid ${p.activa ? 'var(--brand)' : 'var(--border)'}`,
                borderRadius: 12, opacity: p.activa ? 1 : 0.65,
                overflow: 'hidden',
              }}>
                {/* Header row — always visible, tappable */}
                <div
                  style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                  onClick={() => setExpandedId(isExp ? null : p.id)}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    background: p.activa ? 'var(--brand-light)' : 'var(--bg2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <PromoIcon size={16} color={p.activa ? 'var(--brand)' : 'var(--text3)'} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{p.nombre}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>{TIPO_LABELS[p.tipo]}</div>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, flexShrink: 0,
                    background: p.activa ? 'var(--brand-light)' : 'var(--bg2)',
                    color: p.activa ? 'var(--brand)' : 'var(--text3)',
                  }}>
                    {p.activa ? 'Activa' : 'Inactiva'}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text3)', flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
                </div>

                {/* Expanded detail */}
                {isExp && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontSize: 13, color: 'var(--text2)', background: 'var(--bg2)', borderRadius: 8, padding: '8px 12px' }}>
                      {promoDetail(p)}
                    </div>
                    {p.descripcion && (
                      <div style={{ fontSize: 13, color: 'var(--text3)' }}>📝 {p.descripcion}</div>
                    )}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className={`ab ${p.activa ? 'ab-d' : 'ab-e'}`} onClick={() => handleToggle(p)} style={{ fontSize: 12 }}>
                        {p.activa ? 'Desactivar' : 'Activar'}
                      </button>
                      <button className="ab ab-e" onClick={() => openEdit(p)} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                        <Pencil size={12} /> Editar
                      </button>
                      <button className="ab ab-d" onClick={() => handleDelete(p.id)} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                        <Trash2 size={12} /> Eliminar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={editId ? 'Editar promoción' : 'Nueva promoción'} maxWidth={500}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="f-field">
            <label>Nombre interno *</label>
            <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Promo de verano" />
          </div>

          <div className="f-field">
            <label>Tipo de promoción</label>
            <select
              value={form.tipo}
              onChange={e => setForm(f => ({ ...f, tipo: e.target.value as TipoPromo }))}
              style={{ fontFamily: 'inherit' }}
            >
              {(Object.keys(TIPO_LABELS) as TipoPromo[]).map(t => (
                <option key={t} value={t}>{TIPO_LABELS[t]}</option>
              ))}
            </select>
          </div>

          {/* Fields for compra_lleva / compra_descuento / compra_cupon */}
          {(form.tipo === 'compra_lleva' || form.tipo === 'compra_descuento' || form.tipo === 'compra_cupon') && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 10 }}>
                <div className="f-field" style={{ margin: 0 }}>
                  <label>Producto A (el que activa)</label>
                  <select value={form.productoAId} onChange={e => setForm(f => ({ ...f, productoAId: e.target.value }))} style={{ fontFamily: 'inherit' }}>
                    <option value="">Cualquier producto</option>
                    {productosList.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
                <div className="f-field" style={{ margin: 0 }}>
                  <label>Cantidad mínima A</label>
                  <input type="number" min="1" value={form.cantidadA ?? 1} onChange={e => setForm(f => ({ ...f, cantidadA: parseInt(e.target.value) || 1 }))} />
                  <span style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Se activa con {form.cantidadA ?? 1} o más</span>
                </div>
              </div>
            </>
          )}

          {(form.tipo === 'compra_lleva' || form.tipo === 'compra_descuento') && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 10 }}>
              <div className="f-field" style={{ margin: 0 }}>
                <label>Producto B ({form.tipo === 'compra_lleva' ? 'gratis' : 'con descuento'})</label>
                <select value={form.productoBId} onChange={e => setForm(f => ({ ...f, productoBId: e.target.value }))} style={{ fontFamily: 'inherit' }}>
                  <option value="">Mismo que A</option>
                  {productosList.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
              <div className="f-field" style={{ margin: 0 }}>
                <label>Cantidad B</label>
                <input type="number" min="1" value={form.cantidadB ?? 1} onChange={e => setForm(f => ({ ...f, cantidadB: parseInt(e.target.value) || 1 }))} />
              </div>
            </div>
          )}

          {form.tipo === 'compra_descuento' && (
            <div className="f-field">
              <label>% Descuento en producto B</label>
              <input type="number" min="1" max="100" value={form.descuentoBPct ?? 100}
                onChange={e => setForm(f => ({ ...f, descuentoBPct: parseInt(e.target.value) || 0 }))} />
            </div>
          )}

          {form.tipo === 'domicilio_descuento' && (
            <>
              <Toggle
                value={form.domicilioGratis ?? true}
                onChange={v => setForm(f => ({ ...f, domicilioGratis: v }))}
                label="Domicilio completamente gratis"
              />
              {!form.domicilioGratis && (
                <div className="f-field">
                  <label>% de descuento en domicilio</label>
                  <input type="number" min="1" max="99" value={form.domicilioPct ?? 50}
                    onChange={e => setForm(f => ({ ...f, domicilioPct: parseInt(e.target.value) || 0 }))} />
                </div>
              )}
            </>
          )}

          {form.tipo === 'compra_cupon' && (
            <div className="f-field">
              <label>% del cupón generado</label>
              <input type="number" min="1" max="100" value={form.cuponPct ?? 10}
                onChange={e => setForm(f => ({ ...f, cuponPct: parseInt(e.target.value) || 0 }))} />
            </div>
          )}

          {/* Preview */}
          <div style={{ background: 'var(--brand-light)', border: '1px solid var(--brand)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--brand)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Icon size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{buildPreview()}</span>
          </div>

          <Toggle value={form.activa} onChange={v => setForm(f => ({ ...f, activa: v }))} label="Activa (visible en el carrito)" />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
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
