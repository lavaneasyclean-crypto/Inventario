/**
 * Orden de las prendas de una empresa.
 *
 * Importa más de lo que parece: la grilla de bolsas usa este orden para sus
 * columnas y se carga copiando de una planilla de papel. Si las columnas no
 * siguen el mismo orden que el papel, cada fila de siete celdas es una
 * oportunidad de anotar la cantidad en la prenda de al lado.
 */
import type { ProductoEmpresaAdquirido } from "./types";

type Ordenable = Pick<ProductoEmpresaAdquirido, "nombre" | "orden">;

/**
 * Las que tienen posición explícita van primero, en su orden; las que no,
 * después y alfabéticas.
 *
 * La mezcla pasa de verdad: cuando se agrega una prenda a una empresa que ya
 * tenía su orden acomodado, la nueva entra sin posición. Mandarla al final es
 * lo menos sorprendente —aparece donde se la puede encontrar y no corre las
 * columnas que ya estaban— y se acomoda cuando haga falta.
 */
export function compararProductos(a: Ordenable, b: Ordenable): number {
  const oa = a.orden;
  const ob = b.orden;
  const aTiene = oa !== null && oa !== undefined;
  const bTiene = ob !== null && ob !== undefined;

  if (aTiene && bTiene && oa !== ob) return oa - ob;
  if (aTiene && !bTiene) return -1;
  if (!aTiene && bTiene) return 1;
  return a.nombre.localeCompare(b.nombre, "es");
}

export function ordenarProductos<T extends Ordenable>(
  productos: readonly T[],
): T[] {
  return [...productos].sort(compararProductos);
}

/**
 * Mueve una prenda un lugar hacia arriba o hacia abajo.
 *
 * Devuelve la lista completa en el orden nuevo, que es lo que se le manda al
 * servidor. Reescribir todas las posiciones en vez de intercambiar dos es a
 * propósito: así el resultado no depende de que las que ya existían estén
 * numeradas de forma consistente, que es justo lo que no se puede garantizar
 * cuando algunas vienen en NULL.
 */
export function moverProducto<T extends { producto_empresa_id: string }>(
  productos: readonly T[],
  id: string,
  direccion: -1 | 1,
): T[] {
  const i = productos.findIndex((p) => p.producto_empresa_id === id);
  if (i < 0) return [...productos];

  const destino = i + direccion;
  if (destino < 0 || destino >= productos.length) return [...productos];

  const copia = [...productos];
  [copia[i], copia[destino]] = [copia[destino], copia[i]];
  return copia;
}
