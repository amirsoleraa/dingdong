/**
 * Restablece la contraseña de acceso de un domiciliario existente.
 * Uso: node scripts/reset-domiciliario-password.mjs usuario nuevaContraseña123
 *
 * Corre con la service role key (nunca en el navegador) porque cambiar la
 * contraseña de OTRO usuario requiere la Admin API de Supabase Auth — ya no
 * es posible reautenticar con la contraseña vieja como hacía la versión de
 * Firebase, porque esa contraseña ya no se guarda en texto plano.
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

const [usuario, password] = process.argv.slice(2);
if (!usuario || !password) {
  console.error('Uso: node scripts/reset-domiciliario-password.mjs usuario nuevaContraseña123');
  process.exit(1);
}
if (password.length < 6) {
  console.error('❌  La contraseña debe tener al menos 6 caracteres');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const email = `${usuario.trim().toLowerCase()}@dom.barrileros.co`;

const { data: dom, error: domErr } = await admin
  .from('domiciliarios')
  .select('id, uid, nombre')
  .eq('usuario', usuario.trim().toLowerCase())
  .maybeSingle();

if (domErr || !dom?.uid) {
  console.error(`❌  No se encontró un domiciliario con usuario "${usuario}"`);
  process.exit(1);
}

const { error: updErr } = await admin.auth.admin.updateUserById(dom.uid, { password });
if (updErr) {
  console.error('❌  Error al actualizar la contraseña:', updErr.message);
  process.exit(1);
}

console.log(`✅  Contraseña actualizada para ${dom.nombre} (${email})`);
