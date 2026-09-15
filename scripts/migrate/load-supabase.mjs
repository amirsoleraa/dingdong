/**
 * Carga en Supabase los datos exportados de Firestore (migrate-export/).
 *
 * Requisito previo (correr en el SQL Editor de Supabase, una sola vez):
 *   alter table pedidos disable trigger trg_verificar_pedido;
 *   alter table pedidos disable trigger trg_on_nuevo_pedido;
 *
 * Y al terminar esta carga, volver a habilitarlos:
 *   alter table pedidos enable trigger trg_verificar_pedido;
 *   alter table pedidos enable trigger trg_on_nuevo_pedido;
 *
 * Uso: node scripts/migrate/load-supabase.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dir, '../../migrate-export');

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
      .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
  );
}
const env = { ...loadEnvFile(join(__dir, '../../.env')), ...loadEnvFile(join(__dir, '../../.env.local')) };
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Faltan VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env/.env.local');
  process.exit(1);
}
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

function read(name) {
  const p = join(DATA_DIR, `${name}.json`);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}
function randomPassword() {
  return crypto.randomBytes(12).toString('base64url');
}
function throwIfErr(label, error) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

const credentialsReport = [];

async function main() {
  // ── 1. Catálogo (sin dependencias de auth) ────────────────────────────
  console.log('\n--- Categorías ---');
  const categorias = read('categorias') ?? [];
  const catIdMap = new Map();
  for (const c of categorias) {
    const { data, error } = await admin.from('categorias').insert({
      nombre: c.nombre, color: c.color, emoji: c.emoji || null, img_url: c.imgUrl || null, orden: c.orden ?? 0,
    }).select('id').single();
    throwIfErr('categorias', error);
    catIdMap.set(c.id, data.id);
  }
  console.log(`✅ ${catIdMap.size} categorías`);

  console.log('\n--- Adicionales ---');
  const adicionales = read('adicionales') ?? [];
  const adIdMap = new Map();
  for (const a of adicionales) {
    const { data, error } = await admin.from('adicionales').insert({
      nombre: a.nombre, precio: a.precio, costo: a.costo, activo: a.activo,
    }).select('id').single();
    throwIfErr('adicionales', error);
    adIdMap.set(a.id, data.id);
  }
  console.log(`✅ ${adIdMap.size} adicionales`);

  console.log('\n--- Productos ---');
  const productos = read('productos') ?? [];
  const prodIdMap = new Map();
  for (const p of productos) {
    const { data, error } = await admin.from('productos').insert({
      nombre: p.nombre, descripcion: p.descripcion || null, precio: p.precio, costo: p.costo ?? null,
      emoji: p.emoji || null, img_url: p.imgUrl || null,
      categoria_id: p.categoriaId ? (catIdMap.get(p.categoriaId) ?? null) : null,
      tipo: p.tipo, ingredientes: p.ingredientes ?? [], activo: p.activo,
    }).select('id').single();
    throwIfErr('productos', error);
    prodIdMap.set(p.id, data.id);
    for (const pa of p.adicionales ?? []) {
      const newAdId = adIdMap.get(pa.adicionalId);
      if (!newAdId) continue;
      const { error: paErr } = await admin.from('producto_adicionales').insert({
        producto_id: data.id, adicional_id: newAdId, cantidad_max: pa.cantidadMax ?? 1,
      });
      throwIfErr('producto_adicionales', paErr);
    }
  }
  console.log(`✅ ${prodIdMap.size} productos`);

  console.log('\n--- Novedades / Publicidades / Barrios ---');
  for (const n of read('novedades') ?? []) {
    const { error } = await admin.from('novedades').insert({
      titulo: n.titulo, descripcion: n.descripcion || null, img_url: n.imgUrl || null, activa: n.activa ?? true,
    });
    throwIfErr('novedades', error);
  }
  for (const p of read('publicidades') ?? []) {
    const { error } = await admin.from('publicidades').insert({
      titulo: p.titulo, descripcion: p.descripcion || null, img_url: p.imgUrl || null, activa: p.activa, orden: p.orden ?? 0,
    });
    throwIfErr('publicidades', error);
  }
  const barrios = read('barrios') ?? [];
  if (barrios.length > 0) {
    const { error } = await admin.from('barrios').insert(
      barrios.map(b => ({ nombre: b.nombre, activo: b.activo, orden: b.orden ?? 0 }))
    );
    throwIfErr('barrios', error);
  }
  console.log(`✅ novedades/publicidades/barrios cargados`);

  console.log('\n--- Promociones ---');
  const promociones = read('promociones') ?? [];
  const promoIdMap = new Map();
  for (const p of promociones) {
    const { data, error } = await admin.from('promociones').insert({
      nombre: p.nombre, tipo: p.tipo, activa: p.activa, descripcion: p.descripcion || null,
      producto_a_id: p.productoAId ? (prodIdMap.get(p.productoAId) ?? null) : null, cantidad_a: p.cantidadA ?? null,
      producto_b_id: p.productoBId ? (prodIdMap.get(p.productoBId) ?? null) : null, cantidad_b: p.cantidadB ?? null,
      descuento_b_pct: p.descuentoBPct ?? null, domicilio_pct: p.domicilioPct ?? null,
      domicilio_gratis: p.domicilioGratis ?? null, cupon_pct: p.cuponPct ?? null,
    }).select('id').single();
    throwIfErr('promociones', error);
    promoIdMap.set(p.id, data.id);
  }
  console.log(`✅ ${promoIdMap.size} promociones`);

  console.log('\n--- Cupones ---');
  const cupones = read('cupones') ?? [];
  for (const c of cupones) {
    const { error } = await admin.from('cupones').insert({
      codigo: c.codigo, tipo: c.tipo, valor: c.valor, limite: c.limite, usos: c.usos, activo: c.activo,
      cliente_nombre: c.clienteNombre || null, cliente_tel: c.clienteTel || null, pedido_numero: c.pedidoNumero || null,
      promo_nombre: c.promoNombre || null, promo_id: c.promoId ? (promoIdMap.get(c.promoId) ?? null) : null,
      origen: c.origen || null,
    });
    throwIfErr('cupones', error);
  }
  const cuponCodigos = new Set(cupones.map(c => c.codigo));
  console.log(`✅ ${cupones.length} cupones`);

  console.log('\n--- Config ---');
  const cfgMain = read('config_main');
  if (cfgMain) {
    const { error } = await admin.from('config_main').upsert({
      id: true, nombre_comercio: cfgMain.nombreComercio, logo_emoji: cfgMain.logoEmoji, logo_url: cfgMain.logoUrl,
      domicilio_activo: cfgMain.domicilioActivo, domicilio_tipo: cfgMain.domicilioTipo, domicilio_valor: cfgMain.domicilioValor,
      mensaje_confirmacion: cfgMain.mensajeConfirmacion, whatsapp_numero: cfgMain.whatsappNumero || null,
      campos_formulario: cfgMain.camposFormulario || null, map_country_code: cfgMain.mapCountryCode || null,
    }, { onConflict: 'id' });
    throwIfErr('config_main', error);
  }
  const cfgColores = read('config_colores');
  if (cfgColores) {
    const { error } = await admin.from('config_colores').upsert({
      id: true, brand: cfgColores.brand, brand_dark: cfgColores['brand-dark'], brand_light: cfgColores['brand-light'],
      bg: cfgColores.bg, text_color: cfgColores.text, accent: cfgColores.accent,
    }, { onConflict: 'id' });
    throwIfErr('config_colores', error);
  }
  const cfgDelivery = read('config_delivery_settings');
  if (cfgDelivery) {
    const { error } = await admin.from('config_delivery_settings').upsert({
      id: true, origin_lat: cfgDelivery.origin_lat, origin_lng: cfgDelivery.origin_lng, origin_address: cfgDelivery.origin_address,
      price_per_km: cfgDelivery.price_per_km, min_delivery_fee: cfgDelivery.min_delivery_fee ?? null,
    }, { onConflict: 'id' });
    throwIfErr('config_delivery_settings', error);
  }
  const cfgAdmin = read('config_adminSettings');
  if (cfgAdmin) {
    const { error } = await admin.from('config_admin_settings').upsert({
      id: true, historial_pin: cfgAdmin.historialPin || null, admin_pin: cfgAdmin.adminPin || null,
    }, { onConflict: 'id' });
    throwIfErr('config_admin_settings', error);
  }
  console.log('✅ config cargada');

  // ── 2. Cuentas de Auth + roles ─────────────────────────────────────────
  console.log('\n--- Admins ---');
  const users = read('users') ?? [];
  for (const u of users.filter(u => u.role === 'admin')) {
    if (!u.email) { console.warn(`⚠️  admin sin email, se omite: ${u.id}`); continue; }
    const password = randomPassword();
    const { data, error } = await admin.auth.admin.createUser({ email: u.email, password, email_confirm: true });
    if (error) { console.warn(`⚠️  no se pudo crear admin ${u.email}: ${error.message}`); continue; }
    await admin.from('profiles').insert({ id: data.user.id, role: 'admin', email: u.email });
    credentialsReport.push({ tipo: 'admin', email: u.email, password });
  }

  console.log('\n--- Domiciliarios (cuentas + registros) ---');
  const domiciliarios = read('domiciliarios') ?? [];
  const domIdMap = new Map(); // old Firestore domiciliario doc id -> new Supabase domiciliarios.id
  for (const d of domiciliarios) {
    const email = `${d.usuario}@dom.barrileros.co`;
    const password = randomPassword();
    const { data: authData, error: authErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (authErr) { console.warn(`⚠️  no se pudo crear cuenta de ${d.nombre} (${email}): ${authErr.message}`); continue; }
    const { data: domRow, error: domErr } = await admin.from('domiciliarios').insert({
      nombre: d.nombre, tel: d.tel || null, activo: d.activo, pago_base: d.pagoBase ?? null,
      usuario: d.usuario, uid: authData.user.id,
    }).select('id').single();
    throwIfErr('domiciliarios', domErr);
    domIdMap.set(d.id, domRow.id);
    await admin.from('profiles').insert({ id: authData.user.id, role: 'domiciliario', domiciliario_id: domRow.id });
    credentialsReport.push({ tipo: 'domiciliario', nombre: d.nombre, usuario: d.usuario, email, password });
  }
  console.log(`✅ ${domIdMap.size} domiciliarios migrados`);

  console.log('\n--- Clientes (cuentas + perfiles) ---');
  const clientes = read('clientes') ?? [];
  const clienteAuthMap = new Map(); // old Firebase uid -> new Supabase auth uid
  for (const c of clientes) {
    if (!c.correo) { console.warn(`⚠️  cliente sin correo, se omite: ${c.id} (${c.nombre})`); continue; }
    const password = randomPassword();
    const { data, error } = await admin.auth.admin.createUser({ email: c.correo, password, email_confirm: true });
    if (error) { console.warn(`⚠️  no se pudo crear cliente ${c.correo}: ${error.message}`); continue; }
    const { error: rowErr } = await admin.from('clientes').insert({
      id: data.user.id, nombre: c.nombre || '', correo: c.correo, telefono: c.telefono || null,
      favoritos: (c.favoritos ?? []).map(pid => prodIdMap.get(pid)).filter(Boolean),
    });
    throwIfErr('clientes', rowErr);
    clienteAuthMap.set(c.id, data.user.id);
  }
  console.log(`✅ ${clienteAuthMap.size} clientes migrados (deberán restablecer su contraseña)`);

  // ── 3. Pedidos, rutas, historial, notificaciones ────────────────────────
  console.log('\n--- Pedidos ---');
  const pedidos = read('pedidos') ?? [];
  const pedidoIdMap = new Map();
  for (const p of pedidos) {
    const newId = crypto.randomUUID();
    const cupon = p.cupon && cuponCodigos.has(p.cupon) ? p.cupon : null;
    const { error } = await admin.from('pedidos').insert({
      id: newId, numero: p.numero, estado: p.estado,
      cliente_nombre: p.cliente?.nombre || null, cliente_correo: p.cliente?.correo || null, cliente_tel: p.cliente?.tel || null,
      cliente_dir: p.cliente?.dir || null, cliente_barrio: p.cliente?.barrio || null, cliente_comp: p.cliente?.comp || null,
      cliente_recibe: p.cliente?.recibe || null,
      cliente_uid: p.clienteUid ? (clienteAuthMap.get(p.clienteUid) ?? null) : null,
      items: p.items, subtotal: p.subtotal, domicilio: p.domicilio, descuento: p.descuento, total: p.total,
      cupon, mensaje_confirmacion: p.mensajeConfirmacion || '', location: p.location ?? null,
      ruta_nombre: p.rutaNombre || null, repartidor_nombre: p.repartidorNombre || null,
      domiciliario_id: p.domiciliarioId ? (domIdMap.get(p.domiciliarioId) ?? null) : null,
      nota_pendiente: p.notaPendiente || null, es_manual: p.esManual ?? false, notas: p.notas || null,
      promos_aplicadas: p.promosAplicadas ?? null, verificacion: p.verificacion ?? null,
      created_at: p.createdAt ?? new Date().toISOString(),
    });
    throwIfErr('pedidos', error);
    pedidoIdMap.set(p.id, newId);
  }
  console.log(`✅ ${pedidoIdMap.size} pedidos`);

  console.log('\n--- Rutas ---');
  const rutas = read('rutas') ?? [];
  for (const r of rutas) {
    const { error } = await admin.from('rutas').insert({
      nombre: r.nombre, repartidor: r.repartidor || null,
      domiciliario_id: r.domiciliarioId ? (domIdMap.get(r.domiciliarioId) ?? null) : null,
      pedido_ids: (r.pedidoIds ?? []).map(id => pedidoIdMap.get(id)).filter(Boolean),
      estado: r.estado, created_at: r.createdAt ?? new Date().toISOString(),
      completada_en: r.completadaEn ?? null, pedidos_snapshot: r.pedidosSnapshot ?? null,
    });
    throwIfErr('rutas', error);
  }
  console.log(`✅ ${rutas.length} rutas`);

  console.log('\n--- Historial de pedidos ---');
  const historialPedidos = read('historial_pedidos') ?? [];
  for (const h of historialPedidos) {
    const { error } = await admin.from('historial_pedidos').insert({
      fecha: h.fecha, fecha_label: h.fechaLabel, pedidos: h.pedidos ?? [],
      total_entregados: h.totalEntregados ?? 0, total_cancelados: h.totalCancelados ?? 0, total_recaudo: h.totalRecaudo ?? 0,
      creado_en: h.creadoEn ?? new Date().toISOString(),
    });
    throwIfErr('historial_pedidos', error);
  }
  console.log(`✅ ${historialPedidos.length} días de historial`);

  console.log('\n--- Historial de rutas ---');
  const historialRutas = read('historial_rutas') ?? [];
  let hrSkipped = 0;
  for (const h of historialRutas) {
    const domId = h.domiciliarioId ? domIdMap.get(h.domiciliarioId) : null;
    if (h.domiciliarioId && !domId) { hrSkipped++; continue; }
    const { error } = await admin.from('historial_rutas').insert({
      fecha: h.fecha, fecha_label: h.fechaLabel, ruta_nombre: h.rutaNombre || null,
      domiciliario_id: domId, domiciliario_nombre: h.domiciliarioNombre || null,
      pedidos: h.pedidos ?? [], created_at: h.creadoEn ?? new Date().toISOString(),
    });
    throwIfErr('historial_rutas', error);
  }
  console.log(`✅ ${historialRutas.length - hrSkipped} historial de rutas (${hrSkipped} omitidos por domiciliario huérfano)`);

  console.log('\n--- Notificaciones ---');
  const notificaciones = read('notificaciones') ?? [];
  let notifSkipped = 0;
  for (const n of notificaciones) {
    const domId = domIdMap.get(n.domiciliarioId);
    if (!domId) { notifSkipped++; continue; }
    const { error } = await admin.from('notificaciones').insert({
      domiciliario_id: domId, tipo: n.tipo, mensaje: n.mensaje || null,
      leida: n.leida ?? false, ruta_id: null, pedido_id: n.pedidoId ? (pedidoIdMap.get(n.pedidoId) ?? null) : null,
      numero: n.numero || null, cliente_nombre: n.clienteNombre || null, created_at: n.createdAt ?? new Date().toISOString(),
    });
    throwIfErr('notificaciones', error);
  }
  console.log(`✅ ${notificaciones.length - notifSkipped} notificaciones (${notifSkipped} omitidas por domiciliario huérfano)`);

  // ── Reporte final de credenciales ───────────────────────────────────────
  console.log('\n\n========== CREDENCIALES NUEVAS (guárdalas, no se van a repetir) ==========');
  for (const c of credentialsReport) {
    if (c.tipo === 'admin') console.log(`ADMIN   | ${c.email} | ${c.password}`);
    else console.log(`DOMICIL.| ${c.nombre} (usuario: ${c.usuario}) | ${c.email} | ${c.password}`);
  }
  console.log('============================================================================');
  console.log('\nLos clientes migrados deberán usar "Olvidé mi contraseña" (o Google, si activas "Allow manual linking" en Supabase) para volver a entrar.');
}

main().catch(e => { console.error('\n❌ FALLO:', e); process.exit(1); });
