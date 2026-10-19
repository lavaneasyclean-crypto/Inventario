/**
 * Qué cambió en las líneas de un pedido o de una guía.
 *
 * El problema: guardar reemplaza **todas** las líneas. Se borran las que
 * había y se insertan las nuevas, aunque se haya tocado una sola. Un trigger
 * fila por fila vería doce borrados y doce altas y no sabría decir qué pasó:
 * técnicamente exacto, prácticamente inútil.
 *
 * Acá se compara el antes contra el después y sale lo que una persona
 * diría: "al Ambo le cambiaste el detalle", "sacaste una camisa", "la bolsa
 * 21 pasó de 3 poleras a 5".
 *
 * Las líneas no tienen identidad estable —se borran y se crean de nuevo, con
 * ids nuevos— así que se emparejan por lo que las define para quien mira: la
 * prenda, y la bolsa si la hay. Dos líneas de la misma prenda en la misma
 * bolsa se tratan como una sola y se suman, que es como se leen igual.
 */

export interface LineaComparable {
  /** Nombre de la prenda, como se muestra. */
  nombre: string;
  cantidad: number;
  /** El detalle escrito a mano, si lo hay. */
  detalle?: string | null;
  /** Código de bolsa, en las guías que trabajan así. */
  bolsa?: string | null;
}

export interface CambioLinea {
  linea: string;
  antes: string | null;
  despues: string | null;
}

/** Lo que identifica una línea para quien la mira. */
function clave(l: LineaComparable): string {
  return `${l.bolsa ?? ""}\u0000${l.nombre}`;
}

/** Cómo se nombra esa línea en el historial. */
function etiqueta(l: LineaComparable): string {
  return l.bolsa ? `${l.nombre} (bolsa ${l.bolsa})` : l.nombre;
}

/** El contenido de una línea, para comparar y para mostrar. */
function contenido(cantidad: number, detalle: string | null): string {
  const d = (detalle ?? "").trim();
  return d ? `${cantidad} — ${d}` : String(cantidad);
}

interface Juntadas {
  etiqueta: string;
  cantidad: number;
  detalles: string[];
}

/** Junta las líneas repetidas de la misma prenda en la misma bolsa. */
function agrupar(lineas: LineaComparable[]): Map<string, Juntadas> {
  const m = new Map<string, Juntadas>();
  for (const l of lineas) {
    const k = clave(l);
    const prev = m.get(k);
    const det = (l.detalle ?? "").trim();
    if (prev) {
      prev.cantidad += l.cantidad;
      if (det) prev.detalles.push(det);
    } else {
      m.set(k, {
        etiqueta: etiqueta(l),
        cantidad: l.cantidad,
        detalles: det ? [det] : [],
      });
    }
  }
  return m;
}

/**
 * El antes y el después de las líneas, listo para guardar en el historial.
 *
 * Devuelve `null` cuando no cambió nada: así quien llama sabe que no tiene
 * sentido escribir un registro. Un guardado que no cambió líneas no es un
 * cambio de líneas.
 */
export function diffItems(
  antes: LineaComparable[],
  despues: LineaComparable[],
): CambioLinea[] | null {
  const a = agrupar(antes);
  const d = agrupar(despues);

  const claves = [...new Set([...a.keys(), ...d.keys()])];
  const cambios: CambioLinea[] = [];

  for (const k of claves) {
    const va = a.get(k);
    const vd = d.get(k);
    const ca = va ? contenido(va.cantidad, va.detalles.join(" / ")) : null;
    const cd = vd ? contenido(vd.cantidad, vd.detalles.join(" / ")) : null;
    if (ca === cd) continue;
    cambios.push({ linea: (vd ?? va)!.etiqueta, antes: ca, despues: cd });
  }

  if (cambios.length === 0) return null;
  cambios.sort((x, y) => x.linea.localeCompare(y.linea, "es"));
  return cambios;
}

/** Una frase corta para encabezar el registro. */
export function resumirDiff(cambios: CambioLinea[]): string {
  const sacadas = cambios.filter((c) => c.despues === null).length;
  const puestas = cambios.filter((c) => c.antes === null).length;
  const tocadas = cambios.length - sacadas - puestas;

  const partes: string[] = [];
  if (puestas) partes.push(`${puestas} agregada${puestas === 1 ? "" : "s"}`);
  if (tocadas) partes.push(`${tocadas} cambiada${tocadas === 1 ? "" : "s"}`);
  if (sacadas) partes.push(`${sacadas} quitada${sacadas === 1 ? "" : "s"}`);
  return partes.join(", ");
}
