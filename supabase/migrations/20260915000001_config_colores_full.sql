-- config_colores solo tenía 6 de las 14 variables de tema que la app
-- realmente usa (ver src/lib/utils.ts COLOR_PRESETS) — causaba texto
-- invisible en varias pantallas al faltar --text2, --text3, --border, etc.
alter table config_colores
  add column if not exists brand_mid text,
  add column if not exists bg2 text,
  add column if not exists bg3 text,
  add column if not exists surface text,
  add column if not exists text2 text,
  add column if not exists text3 text,
  add column if not exists border text,
  add column if not exists border2 text;
