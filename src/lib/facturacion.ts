/**
 * Lógica pura de cálculo del consolidado de facturación.
 * Separada del componente UI para poder testearla.
 */
import type { PedidoEmpresa, PedidoEmpresaItem } from "./types";

export const IVA_RATE = 0.19;

export interface LineaConsolidada {
  key: string;
  nombre: string;
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
 * Consolida los items de los pedidos seleccionados en líneas únicas
 * por (producto_empresa_id, nombre). Suma cantidades, multiplica por
 * el precio unitario para obtener importe. Items sin precio no suman
 * al total y se marcan con sinPrecio=true.
 */
export function consolidarPedidos(
  pedidos: readonly PedidoConItems[],
  seleccionadosIds: ReadonlySet<number>,
): Consolidado {
  const map = new Map<string, LineaConsolidada>();

  for (const { pedido, items } of pedidos) {
    if (!seleccionadosIds.has(pedido.id)) continue;
    for (const it of items) {
      const key = `${it.producto_empresa_id ?? "_"}|${it.producto_empresa_nombre}`;
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

  const lineas = Array.from(map.values()).sort((a, b) =>
    a.nombre.localeCompare(b.nombre, "es"),
  );
  const neto = lineas.reduce((s, l) => s + l.importe, 0);
  const iva = Math.round(neto * IVA_RATE);
  const total = neto + iva;
  return { lineas, neto, iva, total };
}
