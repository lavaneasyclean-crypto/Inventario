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
  precio_unidad: string;
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
