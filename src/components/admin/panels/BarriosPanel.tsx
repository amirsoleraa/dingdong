import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Download, GitMerge } from 'lucide-react';
import { createBarrio, updateBarrio, deleteBarrio, createBarriosBulk, deleteBarriosBulk } from '@/lib/data/barrios';
import { useAppStore } from '@/stores/useAppStore';
import { Modal } from '@/components/ui/Modal';
import { Toggle } from '@/components/ui/Toggle';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import type { Barrio } from '@/types';

const BARRIOS_DEFAULT = [
  '13 de Junio','20 de Julio','Alcibia','Alameda la Victoria','Alto Bosque',
  'Altos de San Isidro','Almirante Colón','Armenia','Arroz Barato','Amberes',
  'Antonio José de Sucre','Barrio Chino','Barrio Obrero','Bayunca','Bellavista',
  'Bocagrande','Boston','Bosquecito','Bruselas','Canapote','Ceballos','Chambacú',
  'Chipre','Chiquinquirá','Crespo','Crespito','Daniel Lemaitre','El Bosque',
  'El Cabrero','El Carmelo','El Centro','El Espinal','El Gallo','El Pozón',
  'El Prado','España','Fredonia','Getsemaní','José Antonio Galán','Juan XXIII',
  'Junín','La Boquilla','La Candelaria','La Castellana','La Concepción',
  'La Esperanza','La Floresta','La Gloria','La Laguito','La María','La Plaza',
  'La Quinta','Las Américas','Las Brisas','Las Gaviotas','Las Palmeras',
  'Las Palmas','Libertador','Lo Amador','Loma Fresca','Los Alpes','Los Cerros',
  'Los Comuneros','Manga','Marbella','Martínez Martelo','Mirador de Nuevo Bosque',
  'Nariño','Nueva Granada','Nuevo Bosque','Nuevo Paraíso','Nuevo Porvenir',
  'Nueve de Abril','Olaya Herrera','Palestina','Paraguay','Paulo VI 1','Paulo VI 2',
  'Pedro Salazar','Petare','Pie de la Popa','Pie del Cerro','Piedra de Bolívar',
  'Policarpa','Pontezuela','Puerta de Hierro','Punta Canoa','República de Chile',
  'República de Venezuela','República del Caribe','República del Líbano',
  'San Bernardo','San Bernardo de Asís','San Diego','San Francisco','San Isidro',
  'San José Obrero','San Pedro','San Pedro y Libertad','Santa Clara','Santa María',
  'Santa Mónica','Siete de Agosto','Tesca Nuevo','Tesca Viejo','Torices',
  'Viejo Porvenir','Villa Estrella','Virgen del Carmen','Arroyo de Piedra',
  'Arroyo Grande','Albornoz',
];

export function BarriosPanel() {
  const { barrios, setBarrios, showToast } = useAppStore();
  const confirm = useConfirm();
  const [isOpen, setIsOpen]   = useState(false);
  const [editId, setEditId]   = useState<string | null>(null);
  const [nombre, setNombre]   = useState('');
  const [activo, setActivo]   = useState(true);
  const [saving, setSaving]   = useState(false);
  const [importing, setImporting] = useState(false);
  const [search, setSearch]   = useState('');

  // Auto-import on first load if collection is empty
  useEffect(() => {
    if (Object.keys(barrios).length === 0) {
      autoImport();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function autoImport() {
    setImporting(true);
    try {
      const newBarrios = await createBarriosBulk(
        BARRIOS_DEFAULT.map((nombre, i) => ({ nombre, activo: true, orden: i }))
      );
      setBarrios(newBarrios);
    } catch {
      // silent — user can still use the button
    } finally {
      setImporting(false);
    }
  }

  const list = Object.values(barrios)
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.nombre.localeCompare(b.nombre));

  const filtered = search
    ? list.filter(b => b.nombre.toLowerCase().includes(search.toLowerCase()))
    : list;

  const activeCount   = list.filter(b => b.activo).length;
  const inactiveCount = list.length - activeCount;

  function openCreate() {
    setEditId(null); setNombre(''); setActivo(true);
    setIsOpen(true);
  }
  function openEdit(b: Barrio) {
    setEditId(b.id); setNombre(b.nombre); setActivo(b.activo);
    setIsOpen(true);
  }

  async function handleSave() {
    if (!nombre.trim()) { showToast('El nombre es obligatorio'); return; }
    setSaving(true);
    try {
      if (editId) {
        await updateBarrio(editId, { nombre: nombre.trim(), activo });
        setBarrios({ ...barrios, [editId]: { ...barrios[editId], nombre: nombre.trim(), activo } });
        showToast('Barrio actualizado', 'success');
      } else {
        const newId = await createBarrio({ nombre: nombre.trim(), activo, orden: list.length });
        setBarrios({ ...barrios, [newId]: { id: newId, nombre: nombre.trim(), activo, orden: list.length } });
        showToast('Barrio creado', 'success');
      }
      setIsOpen(false);
    } catch {
      showToast('Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirm({ title: 'Eliminar barrio', message: '¿Eliminar este barrio?', danger: true, confirmLabel: 'Eliminar' });
    if (!ok) return;
    await deleteBarrio(id);
    const next = { ...barrios };
    delete next[id];
    setBarrios(next);
    showToast('Barrio eliminado');
  }

  async function handleToggle(b: Barrio) {
    await updateBarrio(b.id, { activo: !b.activo });
    setBarrios({ ...barrios, [b.id]: { ...b, activo: !b.activo } });
  }

  async function deduplicar() {
    const grupos: Record<string, typeof list> = {};
    list.forEach(b => {
      const key = b.nombre.trim().toLowerCase();
      if (!grupos[key]) grupos[key] = [];
      grupos[key].push(b);
    });
    const duplicados = Object.values(grupos).filter(g => g.length > 1);
    if (duplicados.length === 0) { showToast('No hay duplicados', 'info'); return; }
    const toDelete: string[] = [];
    duplicados.forEach(g => {
      const sorted = [...g].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
      sorted.slice(1).forEach(b => toDelete.push(b.id));
    });
    await deleteBarriosBulk(toDelete);
    const next = { ...barrios };
    toDelete.forEach(id => delete next[id]);
    setBarrios(next);
    showToast(`${toDelete.length} duplicados eliminados`, 'success');
  }

  async function importDefaults() {
    if (list.length > 0) {
      const ok = await confirm({
        title: 'Importar barrios',
        message: `Ya existen ${list.length} barrios. ¿Deseas agregar los predeterminados de Cartagena a los existentes?`,
        confirmLabel: 'Agregar',
      });
      if (!ok) return;
    }
    setImporting(true);
    try {
      const existingNames = new Set(list.map(b => b.nombre.toLowerCase()));
      const toAdd = BARRIOS_DEFAULT.filter(n => !existingNames.has(n.toLowerCase()));
      if (toAdd.length === 0) { showToast('Todos los barrios ya están en la lista', 'info'); return; }

      const created = await createBarriosBulk(
        toAdd.map((nombre, i) => ({ nombre, activo: true, orden: list.length + i }))
      );
      setBarrios({ ...barrios, ...created });
      showToast(`${toAdd.length} barrios importados`, 'success');
    } catch {
      showToast('Error al importar', 'error');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div>
      <div className="admin-card-hdr" style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', marginBottom: 16 }}>
        <div>
          <h3>Barrios ({list.length})</h3>
          {list.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              {activeCount} activos · {inactiveCount} inactivos
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-s" onClick={deduplicar} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }} title="Eliminar barrios con nombre repetido">
            <GitMerge size={14} /> Limpiar dup.
          </button>
          <button className="btn-s" onClick={importDefaults} disabled={importing} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <Download size={14} />
            {importing ? 'Importando...' : 'Barrios de Cartagena'}
          </button>
          <button className="btn-add" onClick={openCreate}>
            <Plus size={16} /> Nuevo barrio
          </button>
        </div>
      </div>

      {list.length > 4 && (
        <input
          className="s-input"
          placeholder="Buscar barrio..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ marginBottom: 12 }}
        />
      )}

      {filtered.length === 0 ? (
        <div className="empty-s">
          {list.length === 0
            ? 'No hay barrios. Importa los de Cartagena o crea uno.'
            : 'Sin resultados para la búsqueda.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(b => (
            <div key={b.id} style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderLeft: `4px solid ${b.activo ? 'var(--brand)' : 'var(--border)'}`,
              borderRadius: 10, padding: '10px 14px',
              display: 'flex', alignItems: 'center', gap: 10,
              opacity: b.activo ? 1 : 0.55,
            }}>
              <div style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{b.nombre}</div>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, flexShrink: 0,
                background: b.activo ? 'var(--brand-light)' : 'var(--bg2)',
                color: b.activo ? 'var(--brand)' : 'var(--text3)',
              }}>
                {b.activo ? 'Activo' : 'Inactivo'}
              </span>
              <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                <button
                  className={`ab ${b.activo ? 'ab-d' : 'ab-e'}`}
                  onClick={() => handleToggle(b)}
                  title={b.activo ? 'Desactivar' : 'Activar'}
                  style={{ fontSize: 11 }}
                >
                  {b.activo ? 'Desactivar' : 'Activar'}
                </button>
                <button className="ab ab-e" onClick={() => openEdit(b)} title="Editar"><Pencil size={12} /></button>
                <button className="ab ab-d" onClick={() => handleDelete(b.id)} title="Eliminar"><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={editId ? 'Editar barrio' : 'Nuevo barrio'} maxWidth={420}>
        <div className="f-field">
          <label>Nombre *</label>
          <input
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="Ej: El Prado"
            onKeyDown={e => e.key === 'Enter' && handleSave()}
          />
        </div>
        <Toggle value={activo} onChange={setActivo} label="Activo (visible en el formulario)" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
          <button className="btn-s" onClick={() => setIsOpen(false)}>Cancelar</button>
          <button className="btn-p" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
