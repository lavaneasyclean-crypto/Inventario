/**
 * Fechas ancladas a Chile continental.
 *
 * El negocio ocurre siempre en Chile, pero ningún proceso corre ahí: Netlify
 * ejecuta en UTC y el navegador usa la zona del equipo. Derivar un día de la
 * zona horaria del proceso hace que un pedido recibido a las 22:30 aparezca
 * como del día siguiente. Por eso toda conversión pasa por acá.
 *
 * Chile alterna entre UTC-4 (invierno) y UTC-3 (verano), así que el offset
 * tampoco se puede hardcodear: se deriva de la fecha con Intl.
 */

export const TZ_CHILE = "America/Santiago";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

const partesFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ_CHILE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

interface Partes {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function partesEnChile(d: Date): Partes {
  const p = Object.fromEntries(
    partesFmt.formatToParts(d).map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
  };
}

/** Minutos que Chile lleva respecto de UTC en ese instante (-240 o -180). */
export function offsetChile(d: Date): number {
  const p = partesEnChile(d);
  const comoUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Se descartan los ms para que la resta sea múltiplo exacto de minutos.
  return (comoUTC - Math.floor(d.getTime() / 1000) * 1000) / 60_000;
}

/** true si el string tiene forma YYYY-MM-DD y es un día que existe. */
export function esFechaValida(fecha: string | null | undefined): fecha is string {
  if (!fecha || !FECHA_RE.test(fecha)) return false;
  const [y, m, d] = fecha.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return (
    t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
  );
}

function partirFecha(fecha: string): [number, number, number] {
  if (!esFechaValida(fecha)) {
    throw new RangeError(`Fecha inválida: ${fecha}`);
  }
  const [y, m, d] = fecha.split("-").map(Number);
  return [y, m, d];
}

/**
 * Instante UTC (ISO) correspondiente a `fecha` a las `hora`:00 en Chile.
 *
 * Se resuelve en dos pasos porque el offset depende del instante que estamos
 * calculando: se estima con el offset del mediodía UTC de ese día y, si el
 * resultado cae del otro lado de un cambio de hora, se recalcula.
 */
function instanteChile(fecha: string, hora: number): string {
  const [y, m, d] = partirFecha(fecha);
  const nominal = Date.UTC(y, m - 1, d, hora);
  const off = offsetChile(new Date(Date.UTC(y, m - 1, d, 12)));
  let t = nominal - off * 60_000;
  const off2 = offsetChile(new Date(t));
  if (off2 !== off) t = nominal - off2 * 60_000;
  return new Date(t).toISOString();
}

/** "YYYY-MM-DD" del instante dado, leído en hora de Chile. */
export function fechaEnChile(d: Date = new Date()): string {
  const p = partesEnChile(d);
  const mm = String(p.month).padStart(2, "0");
  const dd = String(p.day).padStart(2, "0");
  return `${p.year}-${mm}-${dd}`;
}

/** "YYYY-MM-DD" de hoy en Chile. */
export function hoyEnChile(): string {
  return fechaEnChile(new Date());
}

/** Instante UTC (ISO) en que empieza el día `fecha` en Chile. */
export function inicioDeDiaChile(fecha: string): string {
  return instanteChile(fecha, 0);
}

/**
 * Instante UTC (ISO) en que empieza el día siguiente a `fecha` en Chile.
 * Es el límite superior *exclusivo* de un rango cuyo "hasta" es inclusivo.
 */
export function finDeDiaChile(fecha: string): string {
  return inicioDeDiaChile(sumarDias(fecha, 1));
}

/**
 * Instante UTC (ISO) del mediodía de `fecha` en Chile. Es lo que se guarda
 * cuando el usuario eligió un día sin hora: al mediodía ningún cambio de
 * offset ni de zona alcanza a mover el día.
 */
export function mediodiaChile(fecha: string): string {
  return instanteChile(fecha, 12);
}

/** Suma días calendario a un "YYYY-MM-DD" y devuelve otro "YYYY-MM-DD". */
export function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = partirFecha(fecha);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Primer y último día del mes al que pertenece `fecha` (hoy en Chile por defecto). */
export function rangoDelMes(fecha: string = hoyEnChile()): {
  desde: string;
  hasta: string;
} {
  const [y, m] = partirFecha(fecha);
  const desde = `${y}-${String(m).padStart(2, "0")}-01`;
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { desde, hasta: `${y}-${String(m).padStart(2, "0")}-${ultimo}` };
}
