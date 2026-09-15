import { supabase } from '@/lib/supabase';
import type { AppConfig, ThemeColors, DeliverySettings, AdminSettings } from '@/types';

function mapMain(row: Record<string, unknown> | null): Partial<AppConfig> {
  if (!row) return {};
  return {
    nombreComercio: row.nombre_comercio as string,
    logoEmoji: row.logo_emoji as string,
    logoUrl: row.logo_url as string,
    domicilioActivo: row.domicilio_activo as boolean,
    domicilioTipo: row.domicilio_tipo as AppConfig['domicilioTipo'],
    domicilioValor: row.domicilio_valor as number,
    mensajeConfirmacion: row.mensaje_confirmacion as string,
    whatsappNumero: row.whatsapp_numero as string | undefined,
    camposFormulario: row.campos_formulario as AppConfig['camposFormulario'],
    mapCountryCode: row.map_country_code as string | undefined,
  };
}

function toMainRow(cfg: Partial<AppConfig>): Record<string, unknown> {
  const row: Record<string, unknown> = { id: true };
  if (cfg.nombreComercio !== undefined) row.nombre_comercio = cfg.nombreComercio;
  if (cfg.logoEmoji !== undefined) row.logo_emoji = cfg.logoEmoji;
  if (cfg.logoUrl !== undefined) row.logo_url = cfg.logoUrl;
  if (cfg.domicilioActivo !== undefined) row.domicilio_activo = cfg.domicilioActivo;
  if (cfg.domicilioTipo !== undefined) row.domicilio_tipo = cfg.domicilioTipo;
  if (cfg.domicilioValor !== undefined) row.domicilio_valor = cfg.domicilioValor;
  if (cfg.mensajeConfirmacion !== undefined) row.mensaje_confirmacion = cfg.mensajeConfirmacion;
  if (cfg.whatsappNumero !== undefined) row.whatsapp_numero = cfg.whatsappNumero;
  if (cfg.camposFormulario !== undefined) row.campos_formulario = cfg.camposFormulario;
  if (cfg.mapCountryCode !== undefined) row.map_country_code = cfg.mapCountryCode;
  return row;
}

export async function getConfigMain(): Promise<Partial<AppConfig>> {
  const { data } = await supabase.from('config_main').select('*').maybeSingle();
  return mapMain(data);
}

export async function saveConfigMain(cfg: Partial<AppConfig>): Promise<void> {
  const { error } = await supabase.from('config_main').upsert(toMainRow(cfg), { onConflict: 'id' });
  if (error) throw error;
}

function mapColores(row: Record<string, unknown> | null): ThemeColors {
  if (!row) return {};
  return {
    brand: row.brand as string | undefined,
    'brand-dark': row.brand_dark as string | undefined,
    'brand-light': row.brand_light as string | undefined,
    bg: row.bg as string | undefined,
    text: row.text_color as string | undefined,
    accent: row.accent as string | undefined,
  };
}

export async function getConfigColores(): Promise<ThemeColors | null> {
  const { data } = await supabase.from('config_colores').select('*').maybeSingle();
  return data ? mapColores(data) : null;
}

export async function saveConfigColores(colores: ThemeColors): Promise<void> {
  const { error } = await supabase.from('config_colores').upsert({
    id: true,
    brand: colores.brand,
    brand_dark: colores['brand-dark'],
    brand_light: colores['brand-light'],
    bg: colores.bg,
    text_color: colores.text,
    accent: colores.accent,
  }, { onConflict: 'id' });
  if (error) throw error;
}

function mapDelivery(row: Record<string, unknown> | null): DeliverySettings | null {
  if (!row) return null;
  return {
    origin_lat: row.origin_lat as number,
    origin_lng: row.origin_lng as number,
    origin_address: row.origin_address as string,
    price_per_km: row.price_per_km as number,
    min_delivery_fee: row.min_delivery_fee as number | undefined,
    updated_at: row.updated_at as string | undefined,
  };
}

export async function getDeliverySettings(): Promise<DeliverySettings | null> {
  const { data } = await supabase.from('config_delivery_settings').select('*').maybeSingle();
  return mapDelivery(data);
}

export async function saveDeliverySettings(settings: DeliverySettings): Promise<void> {
  const { error } = await supabase.from('config_delivery_settings').upsert({
    id: true,
    origin_lat: settings.origin_lat,
    origin_lng: settings.origin_lng,
    origin_address: settings.origin_address,
    price_per_km: settings.price_per_km,
    min_delivery_fee: settings.min_delivery_fee,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (error) throw error;
}

export async function getAdminSettings(): Promise<AdminSettings | null> {
  const { data } = await supabase.from('config_admin_settings').select('*').maybeSingle();
  if (!data) return null;
  return { historialPin: data.historial_pin as string | undefined, adminPin: data.admin_pin as string | undefined };
}

export async function saveAdminSettings(settings: AdminSettings): Promise<void> {
  const { error } = await supabase.from('config_admin_settings').upsert({
    id: true,
    historial_pin: settings.historialPin,
    admin_pin: settings.adminPin,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (error) throw error;
}
