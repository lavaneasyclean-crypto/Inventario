/**
 * Lógica pura de cálculo del consolidado de facturación.
 * Separada del componente UI para poder testearla.
 */
import type { PedidoEmpresa, PedidoEmpresaItem } from "./types";

export const IVA_RATE = 0.19;

export interface LineaConsolidada {
  key: string;
  nombre: string;
  /**
   * Lo que se imprime en la planilla. Es el nombre a secas, salvo cuando el
   * mismo producto aparece con mas de un precio en el periodo: ahi lleva el
   * precio entre parentesis para que se distingan las dos filas.
   */
  etiqueta: string;
  cantidad: number;
  precio_unidad: number | null;
  importe: number;
  sinPrecio: boolean;
}

export interface Consolidado {
  lineas: LineaConsolidada[];
  neto: number;
  iva: number;
  total: number;
}

interface PedidoConItems {
  pedido: PedidoEmpresa;
  items: PedidoEmpresaItem[];
}

/**
 * Clave de agrupacion de una linea. Incluye el precio a proposito: si a mitad
 * de mes cambia el precio de un producto, las guias viejas conservan el suyo y
 * las nuevas traen el nuevo. Agrupando solo por producto, la fila mostraria
 * una cantidad total contra un solo precio y la multiplicacion no daria:
 *
 *   Sabana | 30 | $500 | $25.000        <- 30 x 500 = 15.000, no 25.000
 *
 * Separadas por precio, cada fila cierra sola y el cliente puede verificarla.
 *
 * Se exporta porque el Excel necesita mapear cada item a su fila con la misma
 * clave; hacerlo por nombre mandaria las dos a la misma.
 */
export function claveLinea(
  productoId: string | null,
  nombre: string,
  precio: number | null,
): string {
  return `${productoId ?? "_"}|${nombre}|${precio ?? "sp"}`;
}

/**
 * Consolida los items de los pedidos seleccionados en líneas únicas por
 * (producto_empresa_id, nombre, precio). Suma cantidades, multiplica por el
 * precio unitario para obtener importe. Items sin precio no suman al total y
 * se marcan con sinPrecio=true.
 */
export function consolidarPedidos(
  pedidos: readonly PedidoConItems[],
  seleccionadosIds: ReadonlySet<number>,
): Consolidado {
  const map = new Map<string, LineaConsolidada>();

  for (const { pedido, items } of pedidos) {
    if (!seleccionadosIds.has(pedido.id)) continue;
    for (const it of items) {
      const key = claveLinea(
        it.producto_empresa_id,
        it.producto_empresa_nombre,
        it.precio_unidad,
      );
      const cur = map.get(key);
      if (cur) {
        cur.cantidad += it.cantidad;
        if (it.precio_unidad !== null) {
          cur.importe += it.precio_unidad * it.cantidad;
        } else {
          cur.sinPrecio = true;
        }
      } else {
        map.set(key, {
          key,
          nombre: it.producto_empresa_nombre,
          etiqueta: it.producto_empresa_nombre,
          cantidad: it.cantidad,
          precio_unidad: it.precio_unidad,
          importe:
            it.precio_unidad === null
              ? 0
              : it.precio_unidad * it.cantidad,
          sinPrecio: it.precio_unidad === null,
        });
      }
    }
  }

  const lineas = Array.from(map.values());

  // Solo se aclara el precio en las que hacen falta: si el producto tiene uno
  // solo, agregarlo seria ruido.
  const vecesPorNombre = new Map<string, number>();
  for (const l of lineas) {
    vecesPorNombre.set(l.nombre, (vecesPorNombre.get(l.nombre) ?? 0) + 1);
  }
  for (const l of lineas) {
    if ((vecesPorNombre.get(l.nombre) ?? 0) > 1) {
      l.etiqueta =
        l.precio_unidad === null
          ? `${l.nombre} (sin precio)`
          : `${l.nombre} (a $${l.precio_unidad.toLocaleString("es-CL")})`;
    }
  }

  lineas.sort(
    (a, b) =>
      a.nombre.localeCompare(b.nombre, "es") ||
      (a.precio_unidad ?? -1) - (b.precio_unidad ?? -1),
  );
  const neto = lineas.reduce((s, l) => s + l.importe, 0);
  const iva = Math.round(neto * IVA_RATE);
  const total = neto + iva;
  return { lineas, neto, iva, total };
}
