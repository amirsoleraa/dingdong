// ═══════════════════════════════════════════════
// types/index.ts — Tipos TypeScript del dominio
// ═══════════════════════════════════════════════

export interface CamposFormulario {
  correo?: boolean;
  tel?: boolean;
  dir?: boolean;
  barrio?: boolean;
  comp?: boolean;
  recibe?: boolean;
}

export interface AppConfig {
  nombreComercio: string;
  logoEmoji: string;
  logoUrl: string;
  domicilioActivo: boolean;
  domicilioTipo: 'fijo' | 'gratis' | 'por_km';
  domicilioValor: number;
  mensajeConfirmacion: string;
  whatsappNumero?: string;
  camposFormulario?: CamposFormulario;
  mapCountryCode?: string;
}

export interface AdminSettings {
  historialPin?: string;
  adminPin?: string;
}

export interface DeliverySettings {
  origin_lat: number;
  origin_lng: number;
  origin_address: string;
  price_per_km: number;
  min_delivery_fee?: number;
  updated_at?: unknown;
}

export interface LocationData {
  lat: number;
  lng: number;
  address: string;
  barrio: string;
  notes: string;
  distance_km: number;
  delivery_fee: number;
}

export interface Categoria {
  id: string;
  nombre: string;
  color: string;
  emoji?: string;
  imgUrl?: string;
  orden?: number;
}

export interface Adicional {
  id: string;
  nombre: string;
  precio: number;
  costo: number;
  activo: boolean;
}

export interface ProductoAdicional {
  adicionalId: string;
  cantidadMax: number;
}

export interface Producto {
  id: string;
  nombre: string;
  descripcion?: string;
  precio: number;
  costo?: number;
  emoji?: string;
  imgUrl?: string;
  categoriaId: string;
  tipo: 'comestible' | 'nocomestible';
  ingredientes: string[];
  adicionales: ProductoAdicional[];
  activo: boolean;
}

export interface CartItem {
  id: string;
  name: string;
  price: number;
  emoji: string;
  imgUrl: string;
  qty: number;
  extras: string[];
}

export interface DatosEnvio {
  nombre: string;
  correo?: string;
  tel?: string;
  dir?: string;
  barrio?: string;
  comp?: string;
  recibe?: string;
}

export interface PedidoItem {
  id: string;
  nombre: string;
  precio: number;
  qty: number;
  extras: string[];
}

export interface Pedido {
  id: string;
  numero: string;
  estado: 'activos' | 'preparando' | 'camino' | 'entregado' | 'cancelado';
  cliente: DatosEnvio;
  clienteUid?: string | null;
  items: PedidoItem[];
  subtotal: number;
  domicilio: number;
  descuento: number;
  total: number;
  cupon: string | null;
  mensajeConfirmacion: string;
  location?: LocationData | null;
  createdAt?: string;
  rutaNombre?: string;
  repartidorNombre?: string;
  domiciliarioId?: string;
  notaPendiente?: string;
  esManual?: boolean;
  notas?: string;
  promosAplicadas?: PromoAplicada[];
  verificacion?: PedidoVerificacion;
}

export interface RutaEntrega {
  id: string;
  nombre: string;
  repartidor?: string;
  domiciliarioId?: string;
  pedidoIds: string[];
  estado: 'activa' | 'completada';
  createdAt?: string;
  completadaEn?: string;
  pedidosSnapshot?: Pedido[];
}

export interface Barrio {
  id: string;
  nombre: string;
  activo: boolean;
  orden?: number;
}

export interface Domiciliario {
  id: string;
  nombre: string;
  tel?: string;
  activo: boolean;
  pagoBase?: number;
  usuario?: string;
  password?: string;
  uid?: string;
}

export interface HistorialDia {
  id: string;
  fecha: string;
  fechaLabel: string;
  pedidos: Pedido[];
  totalEntregados: number;
  totalCancelados: number;
  totalRecaudo: number;
  creadoEn?: string;
}

export interface Publicidad {
  id: string;
  titulo: string;
  descripcion?: string;
  imgUrl?: string;
  activa: boolean;
  orden: number;
  createdAt?: string;
}

export interface Cupon {
  id: string;
  codigo: string;
  tipo: 'porcentaje' | 'fijo';
  valor: number;
  limite: number;
  usos: number;
  activo: boolean;
}

export interface Novedad {
  id: string;
  titulo: string;
  descripcion?: string;
  imgUrl?: string;
  activa?: boolean;
  createdAt?: string;
}

export interface ThemeColors {
  brand?: string;
  'brand-dark'?: string;
  'brand-light'?: string;
  'brand-mid'?: string;
  accent?: string;
  bg?: string;
  bg2?: string;
  bg3?: string;
  surface?: string;
  text?: string;
  text2?: string;
  text3?: string;
  border?: string;
  border2?: string;
}

export type PedidoTab = 'activos' | 'preparando' | 'camino' | 'entregado' | 'cancelado';

export interface Notificacion {
  id: string;
  tipo: 'asignacion_ruta' | 'reasignacion' | 'nuevo_pedido';
  mensaje: string;
  leida: boolean;
  rutaId?: string;
  pedidoId?: string;
  createdAt?: string;
}

export type TipoPromo = 'compra_lleva' | 'compra_descuento' | 'domicilio_descuento' | 'compra_cupon';

export interface Promocion {
  id: string;
  nombre: string;
  tipo: TipoPromo;
  activa: boolean;
  descripcion?: string;
  productoAId?: string;
  cantidadA?: number;
  productoBId?: string;
  cantidadB?: number;
  descuentoBPct?: number;
  domicilioPct?: number;
  domicilioGratis?: boolean;
  cuponPct?: number;
  createdAt?: string;
}

export interface ClienteProfile {
  id: string;
  nombre: string;
  correo?: string;
  telefono?: string;
  favoritos: string[];
  createdAt?: string;
}

export interface PedidoVerificacion {
  ok: boolean;
  motivo?: string;
  subtotal_real?: number;
  verificado_en?: string;
}

export interface PromoAplicada {
  promoId: string;
  nombre: string;
  tipo: TipoPromo;
  descuentoProducto?: number;
  descuentoDomicilio?: number;
  cuponGenerado?: string;
  productoBNombre?: string;
  productoBId?: string;
  cantidadBReal?: number;
  cuponPct?: number;
  isVirtualGift?: boolean;
}
