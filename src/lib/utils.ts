// ═══════════════════════════════════════════════
// lib/utils.ts — Helpers de la aplicación
// ═══════════════════════════════════════════════

/** Formatea número como moneda colombiana: $1.234.567 */
export function fmtPrice(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-CO');
}

/** Epoch ms de un timestamp ISO, o 0 si no existe — para ordenar por fecha. */
export function tsMs(iso?: string): number {
  return iso ? new Date(iso).getTime() : 0;
}

/** Genera número de pedido criptográficamente seguro (ej: AB3F2E) */
export function generarNumeroPedido(): string {
  const array = new Uint8Array(3);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
}

/** Mapeo de estados de pedido a etiquetas y colores CSS */
export const ESTADO_INFO: Record<string, { label: string; css: string }> = {
  activos:     { label: 'Activo',       css: 'sp-a' },
  preparando:  { label: 'Preparando',   css: 'sp-p' },
  camino:      { label: 'En camino',    css: 'sp-c' },
  entregado:   { label: 'Entregado',    css: 'sp-e' },
  cancelado:   { label: 'Cancelado',    css: 'sp-x' },
};

/** Valida email */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Valida teléfono colombiano (10 dígitos, opcionalmente +57) */
export function isValidPhone(tel: string): boolean {
  return /^(\+57)?[0-9]{10}$/.test(tel.replace(/\s/g, ''));
}

/** Aplica colores CSS personalizados al DOM (document.documentElement) */
export function applyThemeColors(colors: Record<string, string>): void {
  Object.entries(colors).forEach(([k, v]) => {
    document.documentElement.style.setProperty('--' + k, v);
  });
}

/** Presets de temas de color */
export const COLOR_PRESETS: Record<string, Record<string, string>> = {
  fuego: {
    brand: '#F4521E', 'brand-dark': '#C93D0F', 'brand-light': '#FFF0EB',
    'brand-mid': '#FF6B35', accent: '#FF9A62',
    bg: '#F8F6F2', bg2: '#EDEAE4', bg3: '#E2DDD7', surface: '#FFFFFF',
    text: '#1A1612', text2: '#6B6460', text3: '#A8A09A',
    border: '#E8E4DE', border2: '#D0CBC4',
  },
  cafe: {
    brand: '#FF6229', 'brand-dark': '#E0501A', 'brand-light': 'rgba(255,98,41,.15)',
    'brand-mid': '#FF7A42', accent: '#FFAD7A',
    bg: '#1E1710', bg2: '#2A2018', bg3: '#342A1E', surface: '#261E15',
    text: '#F4EFE6', text2: '#B09080', text3: '#7A6855',
    border: 'rgba(255,255,255,.08)', border2: 'rgba(255,255,255,.13)',
  },
  neutro: {
    brand: '#FF6229', 'brand-dark': '#E0501A', 'brand-light': 'rgba(255,98,41,.15)',
    'brand-mid': '#FF7A42', accent: '#FFAD7A',
    bg: '#1A1A1A', bg2: '#242424', bg3: '#2E2E2E', surface: '#222222',
    text: '#F0F0F0', text2: '#AAAAAA', text3: '#707070',
    border: 'rgba(255,255,255,.08)', border2: 'rgba(255,255,255,.13)',
  },
  medio: {
    brand: '#FF6229', 'brand-dark': '#E0501A', 'brand-light': 'rgba(255,98,41,.15)',
    'brand-mid': '#FF7A42', accent: '#FFAD7A',
    bg: '#2C2218', bg2: '#382C20', bg3: '#44362A', surface: '#342820',
    text: '#F4EFE6', text2: '#C0A890', text3: '#8A7060',
    border: 'rgba(255,255,255,.09)', border2: 'rgba(255,255,255,.15)',
  },
  crema: {
    brand: '#C8421A', 'brand-dark': '#A83410', 'brand-light': '#FFF0EB',
    'brand-mid': '#D9562A', accent: '#E8845A',
    bg: '#FAF6EF', bg2: '#F2EAE0', bg3: '#E8DDD0', surface: '#FFFFFF',
    text: '#2A1F14', text2: '#7A6555', text3: '#B0A090',
    border: '#E4D8CC', border2: '#D0C0AE',
  },
};
