/**
 * Productos que se cobran por medida.
 *
 * La mayoría del catálogo se cobra por pieza: una camisa, una sábana. Pero las
 * alfombras se cobran por metro cuadrado y las cortinas por metro lineal, así
 * que el precio del producto no alcanza para saber cuánto sale una prenda: hay
 * que medirla.
 *
 * El importe de una línea es siempre:
 *
 *     precio_unidad × medida cobrada × cantidad de piezas
 *
 * donde la medida cobrada vale 1 para lo que va por unidad. Así `cantidad`
 * sigue significando piezas en todos lados (boleta, histórico, facturación) y
 * las líneas viejas no cambian de sentido.
 *
 * Esta lógica está duplicada a propósito en `migrations/0008`: la base calcula
 * el importe que se guarda, y esto calcula el que se muestra en el mostrador
 * antes de guardar. Los tests fijan que den lo mismo.
 */

export type UnidadCobro = "unidad" | "m2" | "metro_lineal";

export const UNIDAD_COBRO_LABELS: Record<UnidadCobro, string> = {
  unidad: "Por unidad",
  m2: "Por metro cuadrado",
  metro_lineal: "Por metro lineal",
};

/** Cómo se lee el precio del producto en pantalla. */
export const UNIDAD_PRECIO_LABELS: Record<UnidadCobro, string> = {
  unidad: "c/u",
  m2: "el m²",
  metro_lineal: "el metro",
};

/** Qué medidas hay que pedirle a quien atiende. */
export function medidasQueRequiere(unidad: UnidadCobro): {
  ancho: boolean;
  largo: boolean;
} {
  return {
    ancho: unidad === "m2",
    largo: unidad === "m2" || unidad === "metro_lineal",
  };
}

/**
 * Redondeo hacia arriba al medio metro. Una alfombra de 1,4 × 2,1 da 2,94 m²
 * y se cobra 3,0; una cortina de 2,3 m se cobra 2,5.
 */
export function redondearMedida(valor: number): number {
  return Math.ceil(valor * 2) / 2;
}

/**
 * Medida por la que se multiplica el precio. Devuelve null si al producto le
 * faltan medidas: el importe todavía no se puede calcular.
 */
export function medidaCobrada(
  unidad: UnidadCobro,
  ancho: number | null | undefined,
  largo: number | null | undefined,
): number | null {
  if (unidad === "unidad") return 1;

  if (unidad === "metro_lineal") {
    if (!esMedidaValida(largo)) return null;
    return redondearMedida(largo);
  }

  // m2
  if (!esMedidaValida(ancho) || !esMedidaValida(largo)) return null;
  return redondearMedida(ancho * largo);
}

function esMedidaValida(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/**
 * Importe de una línea, redondeado a peso. Devuelve null si faltan medidas.
 */
export function importeLinea(params: {
  unidad: UnidadCobro;
  precioUnidad: number;
  cantidad: number;
  ancho?: number | null;
  largo?: number | null;
}): number | null {
  const medida = medidaCobrada(params.unidad, params.ancho, params.largo);
  if (medida === null) return null;
  return Math.round(params.precioUnidad * medida * params.cantidad);
}

/** Texto corto con las medidas, para mostrar en la línea del pedido. */
export function describirMedida(
  unidad: UnidadCobro,
  ancho: number | null | undefined,
  largo: number | null | undefined,
): string | null {
  const medida = medidaCobrada(unidad, ancho, largo);
  if (unidad === "unidad" || medida === null) return null;

  const n = (v: number) => v.toLocaleString("es-CL", { maximumFractionDigits: 2 });
  if (unidad === "metro_lineal") return `${n(largo!)} m → ${n(medida)} m`;
  return `${n(ancho!)} × ${n(largo!)} m → ${n(medida)} m²`;
}
