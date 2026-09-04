/**
 * Formatters para mostrar valores en es-CL al personal de mostrador.
 * Sin librerías externas — Intl es suficiente.
 *
 * Todas las fechas se rinden en hora de Chile explícitamente: el servidor
 * corre en UTC, así que sin `timeZone` un pedido de las 22:30 se mostraría
 * con la fecha del día siguiente.
 */
import {
  TZ_CHILE,
  fechaEnChile,
  hoyEnChile,
  inicioDeDiaChile,
} from "./fecha";

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

const dateLong = new Intl.DateTimeFormat("es-CL", {
  timeZone: TZ_CHILE,
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const dateShort = new Intl.DateTimeFormat("es-CL", {
  timeZone: TZ_CHILE,
  day: "2-digit",
  month: "short",
});

function parse(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatCLP(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  return clp.format(n);
}

export function formatDate(value: string | Date | null | undefined): string {
  const d = parse(value);
  return d ? dateLong.format(d) : "—";
}

export function formatDateShort(value: string | Date | null | undefined): string {
  const d = parse(value);
  return d ? dateShort.format(d) : "—";
}

/**
 * Días calendario transcurridos en Chile, no bloques de 24 horas: un pedido
 * de ayer a las 20:00 visto hoy a las 09:00 lleva 1 día, no 0.
 */
export function diasDesde(value: string | Date | null | undefined): number {
  const d = parse(value);
  if (!d) return 0;
  const desde = Date.parse(inicioDeDiaChile(fechaEnChile(d)));
  const hoy = Date.parse(inicioDeDiaChile(hoyEnChile()));
  // Redondeo porque los días de cambio de hora duran 23 o 25 horas.
  return Math.round((hoy - desde) / 86_400_000);
}
