import type { UnidadCobro } from "./medidas";
export type { UnidadCobro };

/**
 * Tipos del dominio. No autogenerados — escritos a mano para mantener
 * legibilidad. Si crece la complejidad consideramos `supabase gen types`.
 */

export type EstadoPedido = "recibido" | "listo" | "entregado" | "anulado";

export type FormaPago = "efectivo" | "transferencia" | "redcompra" | "no_pago";

export type TipoServicio =
  | "lavado"
  | "seco"
  | "planchado"
  | "manchas"
  | "aplicaciones"
  | "ganchos"
  | "delivery"
  | "pedido_especial"
  | "descuento"
  | "secado";

export interface Pedido {
  id: number;
  rut_cliente: string | null;
  nombre_cliente: string | null;
  contacto: string | null;
  direccion: string | null;
  estado: EstadoPedido;
  pagado: boolean;
  forma_pago: FormaPago;
  monto_abonado: string;
  total_venta: string;
  aviso_enviado: boolean;
  fecha_recepcion: string;
  fecha_pago: string | null;
  fecha_entrega: string | null;
  fecha_retiro: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export interface PedidoItem {
  id: number;
  pedido_id: number;
  producto_id: string | null;
  producto_nombre: string;
  producto_tipo_servicio: TipoServicio;
  /** Snapshot: cómo se cobraba el producto cuando se tomó el pedido. */
  unidad_cobro: UnidadCobro;
  ancho: string | null;
  largo: string | null;
  precio_unidad: string;
  /** Piezas. La medida va aparte, en ancho/largo. */
  cantidad: number;
  importe: string;
  detalle_prenda: string | null;
  created_at: string;
}

export interface Cliente {
  rut: string;
  nombre: string | null;
  comuna: string | null;
  calle: string | null;
  dpto: string | null;
  telefono: string | null;
  correo: string | null;
}

export interface Producto {
  id: string;
  nombre: string;
  tipo_servicio: TipoServicio;
  /** Precio por unidad de cobro: por pieza, por m² o por metro lineal. */
  precio: number;
  unidad_cobro: UnidadCobro;
  activo: boolean;
}

export interface ClienteEmpresa {
  rut: string;
  nombre: string;
  alias: string | null;
  comuna: string | null;
  calle: string | null;
  contacto_1: string | null;
  contacto_2: string | null;
  correo: string | null;
  activo: boolean;
  /**
   * Porcentaje adicional que cobra esta empresa por una guia express.
   * 0 = no cobra express.
   */
  recargo_express: number;
}

export interface PedidoEmpresa {
  id: number;
  rut_empresa: string | null;
  alias: string | null;
  fecha: string;
  detalle: string | null;
  anulado: boolean;
  /** Se lavo y devolvio apurada: paga el recargo de la empresa. */
  express: boolean;
  created_at: string;
  updated_at: string;
}

export interface PedidoEmpresaItem {
  id: number;
  pedido_empresa_id: number;
  producto_empresa_id: string | null;
  producto_empresa_nombre: string;
  precio_unidad: number | null;
  importe: number | null;
  cantidad: number;
  detalle_prenda: string | null;
  created_at: string;
}

export interface ProductoEmpresa {
  id: string;
  nombre: string;
  activo: boolean;
}

/**
 * Producto empresa con el contexto de "adquisición" de una empresa específica:
 * el mismo producto del catálogo global puede tener distinto precio según la empresa.
 */
export interface ProductoEmpresaAdquirido {
  producto_empresa_id: string;
  nombre: string;
  precio: number | null;
}

// =========================================================
// Finanzas
//
// A diferencia de los pedidos, acá la plata viaja como `number`: las columnas
// son `integer` (pesos sin decimales) y PostgREST las serializa como número.
// Las `numeric` de pedidos llegan como string, de ahí la diferencia.
//
// Las fechas son días del calendario ("YYYY-MM-DD"), no instantes: la columna
// es `date`. No hay que pasarlas por los helpers de zona horaria.
// =========================================================

export type EstadoFactura = "pendiente" | "pagada" | "anulada";

/**
 * Un periodo puede necesitar dos documentos: la factura normal cobra todas las
 * guias a precio base y la express cobra aparte el recargo de las apuradas.
 * Se separan porque el facturador electronico no acepta tantos items juntos.
 */
export type TipoFactura = "normal" | "express";

export interface Factura {
  id: number;
  rut_empresa: string;
  tipo: TipoFactura;
  /** Número del SII. Vacío hasta que vuelve del facturador electrónico. */
  folio: string | null;
  fecha: string;
  fecha_vence: string | null;
  periodo_desde: string | null;
  periodo_hasta: string | null;
  neto: number;
  iva: number;
  total: number;
  estado: EstadoFactura;
  fecha_pago: string | null;
  forma_pago: FormaPago | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

/** Snapshot de una línea del consolidado al momento de emitir la factura. */
export interface FacturaLinea {
  id: number;
  factura_id: number;
  producto_empresa_id: string | null;
  nombre: string;
  cantidad: number;
  precio_unidad: number | null;
  importe: number;
}

export type CategoriaGasto =
  | "luz"
  | "agua"
  | "gas"
  | "arriendo"
  | "internet"
  | "telefono"
  | "insumos"
  | "remuneraciones"
  | "impuestos"
  | "mantencion"
  | "otros";

export interface Gasto {
  id: number;
  categoria: CategoriaGasto;
  descripcion: string;
  proveedor: string | null;
  /** N° de la boleta o factura del proveedor, para cruzar con el papel. */
  documento: string | null;
  fecha: string;
  fecha_vence: string | null;
  /** Mes del consumo, "YYYY-MM". La boleta de octubre puede ser de septiembre. */
  periodo: string | null;
  monto: number;
  pagado: boolean;
  fecha_pago: string | null;
  forma_pago: FormaPago | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export const TIPO_FACTURA_LABELS: Record<TipoFactura, string> = {
  normal: "Factura",
  express: "Recargo express",
};

export const ESTADO_FACTURA_LABELS: Record<EstadoFactura, string> = {
  pendiente: "Por cobrar",
  pagada: "Pagada",
  anulada: "Anulada",
};

export const CATEGORIA_GASTO_LABELS: Record<CategoriaGasto, string> = {
  luz: "Luz",
  agua: "Agua",
  gas: "Gas",
  arriendo: "Arriendo",
  internet: "Internet",
  telefono: "Teléfono",
  insumos: "Insumos",
  remuneraciones: "Remuneraciones",
  impuestos: "Impuestos",
  mantencion: "Mantención",
  otros: "Otros",
};

/** Orden de los desplegables: lo que más se carga, primero. */
export const CATEGORIAS_GASTO: CategoriaGasto[] = [
  "luz",
  "agua",
  "gas",
  "insumos",
  "remuneraciones",
  "arriendo",
  "internet",
  "telefono",
  "impuestos",
  "mantencion",
  "otros",
];

/**
 * Formas de pago que tienen sentido al registrar un pago recibido o hecho.
 * Se excluye `no_pago`, que en los pedidos de mostrador significa "todavía no
 * pagó" y acá lo dice el estado.
 */
export const FORMAS_PAGO_REALES: FormaPago[] = [
  "transferencia",
  "efectivo",
  "redcompra",
];

export const ESTADO_LABELS: Record<EstadoPedido, string> = {
  recibido: "En proceso",
  listo: "Listo para retirar",
  entregado: "Entregado",
  anulado: "Anulado",
};

export const FORMA_PAGO_LABELS: Record<FormaPago, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  redcompra: "RedCompra",
  no_pago: "No pago",
};

export const TIPO_SERVICIO_LABELS: Record<TipoServicio, string> = {
  lavado: "Lavado",
  seco: "Lavado en seco",
  planchado: "Planchado",
  manchas: "Manchas",
  aplicaciones: "Aplicaciones",
  ganchos: "Ganchos",
  delivery: "Delivery",
  pedido_especial: "Pedido especial",
  descuento: "Descuento",
  secado: "Secado",
};
