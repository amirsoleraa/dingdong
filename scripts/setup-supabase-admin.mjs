/**
 * Crea el primer usuario administrador en Supabase.
 * Uso: node scripts/setup-supabase-admin.mjs correo@ejemplo.com contraseña123 [--force]
 *
 * Requisito previo: haber aplicado supabase/setup_completo.sql en el proyecto.
 *
 * A diferencia del bootstrap de Firebase (scripts/setup-admin.mjs), este
 * script usa la service role key directamente — no depende de una regla RLS
 * alcanzable desde el cliente, así que no hay ventana de "primer admin"
 * explotable vía la API pública.
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';

const __dir = dirname(fileURLToPath(import.meta.url));

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
      .map((l) => {
        const idx = l.indexOf('=');
        return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
      })
  );
}

const env = { ...loadEnvFile(join(__dir, '../.env')), ...loadEnvFile(join(__dir, '../.env.local')) };

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌  No se encontraron VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env/.env.local');
  process.exit(1);
}

const args = process.argv.slice(2);
const force = args.includes('--force');
const [email, password] = args.filter((a) => !a.startsWith('--'));

if (!email || !password) {
  console.error('Uso: node scripts/setup-supabase-admin.mjs correo@ejemplo.com contraseña123 [--force]');
  process.exit(1);
}
if (password.length < 6) {
  console.error('❌  La contraseña debe tener al menos 6 caracteres');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── 1. Bloquear bootstrap si ya existe un admin (salvo --force) ────────────
if (!force) {
  const { count, error } = await admin
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'admin');
  if (error) {
    console.error('❌  Error consultando profiles:', error.message);
    process.exit(1);
  }
  if (count > 0) {
    console.error(`❌  Ya existe ${count} admin(s). Usa --force si de verdad quieres crear otro.`);
    process.exit(1);
  }
}

// ── 2. Crear (o reutilizar) el usuario en Supabase Auth ─────────────────────
console.log(`\n🔧  Creando usuario: ${email} …`);
let userId;

const { data: created, error: createErr } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});

if (createErr) {
  if (createErr.code === 'email_exists' || /already been registered/i.test(createErr.message)) {
    console.log('   El correo ya existe en Supabase Auth — buscando su usuario…');
    const { data: list, error: listErr } = await admin.auth.admin.listUsers();
    if (listErr) {
      console.error('❌  Error buscando usuario existente:', listErr.message);
      process.exit(1);
    }
    const existing = list.users.find((u) => u.email === email);
    if (!existing) {
      console.error('❌  No se pudo encontrar el usuario existente con ese correo.');
      process.exit(1);
    }
    userId = existing.id;
    console.log(`   ✅ Usuario ya existía. ID: ${userId}`);
  } else {
    console.error('❌  Error al crear usuario:', createErr.message);
    process.exit(1);
  }
} else {
  userId = created.user.id;
  console.log(`   ✅ Usuario creado. ID: ${userId}`);
}

// ── 3. Crear/actualizar profiles row con role: admin ────────────────────────
console.log('\n🔧  Guardando rol de administrador…');
const { error: profileErr } = await admin
  .from('profiles')
  .upsert({ id: userId, role: 'admin', email }, { onConflict: 'id' });

if (profileErr) {
  console.error('❌  Error al guardar el perfil:', profileErr.message);
  process.exit(1);
}
console.log('   ✅ profiles.' + userId + ' guardado con role: admin');

console.log(`
╔══════════════════════════════════════════════╗
║  ✅  Admin creado exitosamente               ║
║                                              ║
║  Correo:    ${email.padEnd(32)}║
║  ID:        ${userId.padEnd(32)}║
║                                              ║
║  Ingresa en: /admin/login                    ║
╚══════════════════════════════════════════════╝
`);
