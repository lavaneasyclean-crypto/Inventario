/**
 * Lógica pura de finanzas: desglose de IVA, vencimientos y los totales que
 * muestra el resumen. Separada de las pantallas para poder testearla.
 *
 * Todas las fechas de este módulo son días del calendario ("YYYY-MM-DD"),
 * porque así viven en la base (columnas `date`). Compararlas con `<` funciona
 * tal cual: el formato ISO ordena igual como texto que como fecha, y así no
 * hay que construir un Date —ni elegirle una hora— para saber si una factura
 * está vencida.
 */
import { IVA_RATE } from "./facturacion";
import { esFechaValida, sumarDias } from "./fecha";
import type { EstadoFactura, Factura, Gasto } from "./types";

export { IVA_RATE };

/** Días de crédito que se le dan a una empresa si nadie dice otra cosa. */
export const DIAS_VENCIMIENTO_DEFAULT = 30;

/** Con cuántos días de anticipación se avisa que algo está por vencer. */
export const DIAS_AVISO_VENCIMIENTO = 7;

export interface DesgloseIva {
  neto: number;
  iva: number;
  total: number;
}

/**
 * Neto → neto + IVA. Mismo redondeo que el consolidado de facturación, para
 * que una factura cargada a mano y una registrada desde las guías den lo
 * mismo ante el mismo neto.
 */
export function desgloseIva(neto: number): DesgloseIva {
  const n = Math.round(neto);
  const iva = Math.round(n * IVA_RATE);
  return { neto: n, iva, total: n + iva };
}

/** Fecha de vencimiento sugerida al emitir: 30 días después. */
export function vencimientoPorDefecto(
  fechaEmision: string,
  dias: number = DIAS_VENCIMIENTO_DEFAULT,
): string {
  return sumarDias(fechaEmision, dias);
}

export type Vencimiento = "sin_fecha" | "vencido" | "por_vencer" | "al_dia";

/**
 * En qué punto del vencimiento está algo que todavía no se pagó. No sabe nada
 * de facturas ni de gastos: los dos lo usan igual.
 *
 * El día del vencimiento todavía cuenta como al día — vencer "el 30" significa
 * que el 30 se puede pagar.
 */
export function estadoVencimiento(
  fechaVence: string | null | undefined,
  hoy: string,
  diasAviso: number = DIAS_AVISO_VENCIMIENTO,
): Vencimiento {
  if (!esFechaValida(fechaVence)) return "sin_fecha";
  if (fechaVence < hoy) return "vencido";
  if (fechaVence <= sumarDias(hoy, diasAviso)) return "por_vencer";
  return "al_dia";
}

/** Días hasta el vencimiento. Negativo si ya pasó, null si no hay fecha. */
export function diasHastaVencer(
  fechaVence: string | null | undefined,
  hoy: string,
): number | null {
  if (!esFechaValida(fechaVence) || !esFechaValida(hoy)) return null;
  const a = Date.parse(`${hoy}T00:00:00Z`);
  const b = Date.parse(`${fechaVence}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * Estado que se muestra en pantalla. Combina el estado guardado con el
 * vencimiento: "vencida" no es una columna de la base, es una factura
 * pendiente cuya fecha ya pasó.
 */
export type EstadoMostrado =
  | EstadoFactura
  | "vencida"
  | "por_vencer"
  | "parcial";

/**
 * Lo que falta cobrar. Nunca negativo: si la empresa pagó de más —pasa, con
 * transferencias redondeadas— el saldo es cero y no un crédito, que es otro
 * problema y no se modela acá.
 */
export function saldoFactura(
  factura: Pick<Factura, "total" | "monto_pagado">,
): number {
  return Math.max(0, factura.total - (factura.monto_pagado ?? 0));
}

export function estadoMostradoFactura(
  factura: Pick<Factura, "estado" | "fecha_vence" | "total" | "monto_pagado">,
  hoy: string,
): EstadoMostrado {
  if (factura.estado !== "pendiente") return factura.estado;
  // El vencimiento manda sobre el pago parcial: una factura abonada a medias
  // que ya vencio sigue siendo un problema de cobranza, y decir "parcial" en
  // vez de "vencida" lo esconderia.
  const v = estadoVencimiento(factura.fecha_vence, hoy);
  if (v === "vencido") return "vencida";
  if (v === "por_vencer") return "por_vencer";
  if ((factura.monto_pagado ?? 0) > 0) return "parcial";
  return "pendiente";
}

export interface Monto {
  cantidad: number;
  total: number;
}

export interface ResumenCuenta {
  /** Todo lo que sigue abierto, sin importar de cuándo sea. */
  pendiente: Monto;
  /** El subconjunto de lo pendiente cuyo plazo ya pasó. */
  vencido: Monto;
  /** Lo pendiente que vence dentro de los próximos días de aviso. */
  porVencer: Monto;
  /** Lo que se movió de plata en el período consultado. */
  liquidado: Monto;
}

const CERO: Monto = { cantidad: 0, total: 0 };

function sumar(m: Monto, monto: number): Monto {
  return { cantidad: m.cantidad + 1, total: m.total + monto };
}

/**
 * Resume las facturas de una consulta.
 *
 * `pendiente` incluye todas las abiertas, aunque sean de meses anteriores:
 * la pregunta "cuánto nos deben" no se responde mirando solo este mes. En
 * cambio `liquidado` sí se limita a lo que trajo la consulta, porque es lo que
 * entró en el período.
 *
 * Las anuladas no suman a nada: se listan para que quede el rastro, pero
 * dejaron de ser plata.
 */
export function resumirFacturas(
  facturas: readonly Pick<
    Factura,
    "estado" | "fecha_vence" | "total" | "monto_pagado"
  >[],
  hoy: string,
): ResumenCuenta {
  let pendiente = CERO;
  let vencido = CERO;
  let porVencer = CERO;
  let liquidado = CERO;

  for (const f of facturas) {
    if (f.estado === "anulada") continue;

    // Lo abonado ya entró, esté o no saldada la factura. Contarlo solo cuando
    // está pagada del todo haría que un mes de muchos pagos parciales
    // apareciera como si no hubiera entrado nada.
    //
    // `pagada` manda sobre la suma: si el código corre antes de aplicar
    // 0011_facturas_abonos, `monto_pagado` llega undefined y una factura
    // cobrada aparecería como deuda entera.
    const cobrado =
      f.estado === "pagada"
        ? f.total
        : Math.min(f.monto_pagado ?? 0, f.total);
    if (cobrado > 0) liquidado = sumar(liquidado, cobrado);

    if (f.estado === "pagada") continue;

    // Lo que falta, no el total: una factura de 100 con 80 abonados debe 20.
    const saldo = saldoFactura(f);
    if (saldo <= 0) continue;

    pendiente = sumar(pendiente, saldo);
    const v = estadoVencimiento(f.fecha_vence, hoy);
    if (v === "vencido") vencido = sumar(vencido, saldo);
    else if (v === "por_vencer") porVencer = sumar(porVencer, saldo);
  }

  return { pendiente, vencido, porVencer, liquidado };
}

/** Igual que `resumirFacturas`, pero los gastos usan `pagado` y `monto`. */
export function resumirGastos(
  gastos: readonly Pick<Gasto, "pagado" | "fecha_vence" | "monto">[],
  hoy: string,
): ResumenCuenta {
  let pendiente = CERO;
  let vencido = CERO;
  let porVencer = CERO;
  let liquidado = CERO;

  for (const g of gastos) {
    if (g.pagado) {
      liquidado = sumar(liquidado, g.monto);
      continue;
    }
    pendiente = sumar(pendiente, g.monto);
    const v = estadoVencimiento(g.fecha_vence, hoy);
    if (v === "vencido") vencido = sumar(vencido, g.monto);
    else if (v === "por_vencer") porVencer = sumar(porVencer, g.monto);
  }

  return { pendiente, vencido, porVencer, liquidado };
}

const MESES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

const PERIODO_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** "2026-09-15" → "2026-09". El mes al que se imputa un gasto. */
export function periodoDeFecha(fecha: string): string {
  if (!esFechaValida(fecha)) throw new RangeError(`Fecha inválida: ${fecha}`);
  return fecha.slice(0, 7);
}

export function esPeriodoValido(periodo: string | null | undefined): periodo is string {
  return !!periodo && PERIODO_RE.test(periodo);
}

/** "2026-09" → "sep 2026". Devuelve "—" si no es un período válido. */
export function etiquetaPeriodo(periodo: string | null | undefined): string {
  if (!esPeriodoValido(periodo)) return "—";
  const [anio, mes] = periodo.split("-");
  return `${MESES[Number(mes) - 1]} ${anio}`;
}

/**
 * Rango de fechas que cubre un conjunto de guías. Es lo que se guarda en
 * `periodo_desde` / `periodo_hasta` al registrar la factura, para poder decir
 * "la factura de septiembre" sin volver a mirar las guías.
 */
export function rangoDeFechas(
  fechas: readonly string[],
): { desde: string; hasta: string } | null {
  const dias = fechas
    .map((f) => f.slice(0, 10))
    .filter((f) => esFechaValida(f))
    .sort();
  if (dias.length === 0) return null;
  return { desde: dias[0], hasta: dias[dias.length - 1] };
}
