/**
 * Exporta todas las colecciones de Firestore a JSON local (migrate-export/),
 * como primer paso de la migración a Supabase.
 *
 * Uso: node scripts/migrate/export-firestore.mjs /ruta/a/service-account.json
 *
 * Convierte los Timestamp de Firestore a ISO 8601 directamente en la
 * exportación (evita un paso de transform aparte para las fechas).
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dir, '../../migrate-export');

const keyPath = process.argv[2];
if (!keyPath || !existsSync(keyPath)) {
  console.error('Uso: node scripts/migrate/export-firestore.mjs /ruta/a/service-account.json');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

mkdirSync(OUT_DIR, { recursive: true });

function serialize(value) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = serialize(v);
    return out;
  }
  return value;
}

async function dumpCollection(name) {
  const snap = await db.collection(name).get();
  const docs = snap.docs.map(d => ({ id: d.id, ...serialize(d.data()) }));
  writeFileSync(join(OUT_DIR, `${name}.json`), JSON.stringify(docs, null, 2));
  console.log(`✅ ${name}: ${docs.length} documentos`);
  return docs;
}

async function dumpDoc(collectionName, docId, outName = `${collectionName}_${docId}`) {
  const snap = await db.collection(collectionName).doc(docId).get();
  const data = snap.exists ? serialize(snap.data()) : null;
  writeFileSync(join(OUT_DIR, `${outName}.json`), JSON.stringify(data, null, 2));
  console.log(`✅ ${collectionName}/${docId}: ${data ? 'ok' : 'no existe'}`);
}

async function main() {
  console.log('--- Exportando colecciones ---');
  await dumpCollection('users');
  await dumpCollection('categorias');
  await dumpCollection('productos');
  await dumpCollection('adicionales');
  await dumpCollection('novedades');
  await dumpCollection('publicidades');
  await dumpCollection('barrios');
  await dumpCollection('promociones');
  await dumpCollection('cupones');
  await dumpCollection('pedidos');
  await dumpCollection('rutas');
  await dumpCollection('historial_pedidos');
  await dumpCollection('historial_rutas');
  const domiciliarios = await dumpCollection('domiciliarios');
  await dumpCollection('clientes');

  console.log('--- Exportando docs de config ---');
  await dumpDoc('config', 'main');
  await dumpDoc('config', 'colores');
  await dumpDoc('config', 'delivery_settings');
  await dumpDoc('config', 'adminSettings');

  console.log('--- Exportando notificaciones (subcolección por domiciliario) ---');
  const allNotifs = [];
  for (const dom of domiciliarios) {
    const snap = await db.collection('notificaciones').doc(dom.id).collection('items').get();
    snap.docs.forEach(d => allNotifs.push({ id: d.id, domiciliarioId: dom.id, ...serialize(d.data()) }));
  }
  writeFileSync(join(OUT_DIR, 'notificaciones.json'), JSON.stringify(allNotifs, null, 2));
  console.log(`✅ notificaciones: ${allNotifs.length} documentos`);

  console.log('\nExportación completa en', OUT_DIR);
}

main().catch(e => { console.error('FALLO:', e); process.exit(1); });
