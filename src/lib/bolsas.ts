/**
 * Lógica pura de las bolsas por trabajador.
 *
 * Termomín y Termochemical no mandan un bulto de ropa: mandan la bolsa de cada
 * trabajador, numerada, y hay que devolverla tal cual. Una guía de estas
 * empresas es una grilla —fila por bolsa, columna por prenda— y no una lista
 * de items sueltos.
 */
import type { EmpresaBolsa, PedidoEmpresaItem } from "./types";

/**
 * Orden de la grilla: primero las bolsas numeradas, de menor a mayor, después
 * las que se identifican por nombre, alfabéticas.
 *
 * Ordenar los códigos como texto a secas pondría la 10 antes que la 2, y
 * ordenarlos como número mandaría "Nicolás" al principio junto a todos los
 * NaN. Por eso se separan los dos mundos antes de comparar.
 *
 * Se deriva en vez de guardar una columna `orden` para no tener que renumerar
 * el padrón cada vez que entra alguien nuevo.
 */
export function compararBolsas(
  a: Pick<EmpresaBolsa, "codigo">,
  b: Pick<EmpresaBolsa, "codigo">,
): number {
  const na = Number(a.codigo);
  const nb = Number(b.codigo);
  const aEsNumero = a.codigo.trim() !== "" && Number.isFinite(na);
  const bEsNumero = b.codigo.trim() !== "" && Number.isFinite(nb);

  if (aEsNumero && bEsNumero) return na - nb;
  if (aEsNumero) return -1;
  if (bEsNumero) return 1;
  return a.codigo.localeCompare(b.codigo, "es");
}

export function ordenarBolsas<T extends Pick<EmpresaBolsa, "codigo">>(
  bolsas: readonly T[],
): T[] {
  return [...bolsas].sort(compararBolsas);
}

/**
 * Normaliza un código tipeado a mano.
 *
 * Los números pierden los ceros a la izquierda —"07" y "7" son la misma
 * bolsa— y lo demás solo se recorta. Sin esto el padrón se llena de
 * duplicados que se ven iguales en pantalla.
 */
export function normalizarCodigoBolsa(codigo: string): string {
  const limpio = codigo.trim().replace(/\s+/g, " ");
  if (/^\d+$/.test(limpio)) return String(Number(limpio));
  return limpio;
}

export interface LineaBolsa {
  producto_empresa_id: string | null;
  nombre: string;
  cantidad: number;
}

export interface BolsaConContenido {
  codigo: string;
  nombre: string | null;
  lineas: LineaBolsa[];
  totalPrendas: number;
}

/**
 * Agrupa las líneas de una guía por bolsa: lo que necesita la hoja de
 * devolución.
 *
 * Es la vista opuesta a la de facturación. Para cobrar importa el producto
 * (52 poleras en total); para devolver importa la bolsa (la 3 lleva 6 poleras,
 * 1 pantalón y 1 polerón) y el precio no pinta nada.
 *
 * Las líneas sin bolsa se juntan bajo `sinBolsa`, que no debería pasar en una
 * empresa que trabaja así, pero pasa cuando alguien carga una guía antes de
 * armar el padrón.
 */
export function agruparPorBolsa(
  items: readonly PedidoEmpresaItem[],
  bolsas: readonly EmpresaBolsa[] = [],
): { bolsas: BolsaConContenido[]; sinBolsa: LineaBolsa[] } {
  const nombrePorCodigo = new Map(
    bolsas.map((b) => [b.codigo, b.nombre] as const),
  );

  const porBolsa = new Map<string, BolsaConContenido>();
  const sinBolsa: LineaBolsa[] = [];

  for (const it of items) {
    const linea: LineaBolsa = {
      producto_empresa_id: it.producto_empresa_id,
      nombre: it.producto_empresa_nombre,
      cantidad: it.cantidad,
    };

    if (!it.bolsa_codigo) {
      sinBolsa.push(linea);
      continue;
    }

    const actual = porBolsa.get(it.bolsa_codigo);
    if (actual) {
      // El mismo producto dos veces en la misma bolsa se suma en vez de
      // repetirse: en la hoja impresa dos filas iguales se leen como un error.
      const previa = actual.lineas.find(
        (l) => l.nombre === linea.nombre &&
               l.producto_empresa_id === linea.producto_empresa_id,
      );
      if (previa) previa.cantidad += linea.cantidad;
      else actual.lineas.push(linea);
      actual.totalPrendas += linea.cantidad;
    } else {
      porBolsa.set(it.bolsa_codigo, {
        codigo: it.bolsa_codigo,
        nombre: nombrePorCodigo.get(it.bolsa_codigo) ?? null,
        lineas: [linea],
        totalPrendas: linea.cantidad,
      });
    }
  }

  const lista = ordenarBolsas([...porBolsa.values()]);
  for (const b of lista) {
    b.lineas.sort((x, y) => x.nombre.localeCompare(y.nombre, "es"));
  }

  return { bolsas: lista, sinBolsa };
}

/**
 * Celdas de la grilla de carga, indexadas por "bolsaId|productoId".
 *
 * Se usa una sola clave plana en vez de un mapa anidado porque la grilla
 * escribe celda por celda y un objeto por fila obligaria a copiar la fila
 * entera en cada tecla.
 */
export function claveCelda(bolsaId: number, productoId: string): string {
  return `${bolsaId}|${productoId}`;
}

export interface ItemDeGrilla {
  bolsa_id: number;
  producto_empresa_id: string;
  cantidad: number;
}

/**
 * Convierte la grilla en la lista de items que espera `crear_pedido_empresa`.
 * Las celdas vacías o en cero no generan línea.
 */
export function itemsDesdeGrilla(
  celdas: Readonly<Record<string, string>>,
): ItemDeGrilla[] {
  const items: ItemDeGrilla[] = [];
  for (const [clave, valor] of Object.entries(celdas)) {
    const cantidad = Number(valor);
    if (!Number.isFinite(cantidad) || cantidad <= 0) continue;
    const corte = clave.indexOf("|");
    if (corte <= 0) continue;
    const bolsaId = Number(clave.slice(0, corte));
    const productoId = clave.slice(corte + 1);
    if (!Number.isFinite(bolsaId) || !productoId) continue;
    items.push({
      bolsa_id: bolsaId,
      producto_empresa_id: productoId,
      cantidad: Math.trunc(cantidad),
    });
  }
  return items;
}

/** Totales por producto de la grilla, para el pie que cierra contra la planilla. */
export function totalesPorProducto(
  celdas: Readonly<Record<string, string>>,
): Map<string, number> {
  const totales = new Map<string, number>();
  for (const it of itemsDesdeGrilla(celdas)) {
    totales.set(
      it.producto_empresa_id,
      (totales.get(it.producto_empresa_id) ?? 0) + it.cantidad,
    );
  }
  return totales;
}
