/**
 * Lógica pura de cálculo del consolidado de facturación.
 * Separada del componente UI para poder testearla.
 */
import type { PedidoEmpresa, PedidoEmpresaItem } from "./types";

export const IVA_RATE = 0.19;

export interface LineaConsolidada {
  key: string;
  producto_empresa_id: string | null;
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
 * Precio unitario del recargo por servicio express.
 *
 * No es el precio express: es *solo el adicional*. La guía express se cobra
 * dos veces —una a precio base en la factura normal, junto con todas las
 * demás, y otra acá por el porcentaje extra— porque el facturador electrónico
 * no acepta tantos items en un mismo documento.
 *
 * Se redondea por unidad y no al final, para que el precio unitario que ve el
 * cliente en la factura multiplicado por la cantidad dé exactamente el
 * subtotal impreso.
 */
export function precioExpress(precioBase: number, recargoPct: number): number {
  return Math.round((precioBase * recargoPct) / 100);
}

interface OpcionesConsolidado {
  /** Deja fuera las guías que no vinieron express. */
  soloExpress?: boolean;
  /** Convierte el precio guardado en el que se va a cobrar. */
  precio?: (base: number) => number;
}

/**
 * Consolida los items de los pedidos seleccionados en líneas únicas por
 * (producto_empresa_id, nombre, precio). Suma cantidades, multiplica por el
 * precio unitario para obtener importe. Items sin precio no suman al total y
 * se marcan con sinPrecio=true.
 */
function consolidar(
  pedidos: readonly PedidoConItems[],
  seleccionadosIds: ReadonlySet<number>,
  opciones: OpcionesConsolidado = {},
): Consolidado {
  const map = new Map<string, LineaConsolidada>();
  const convertir = opciones.precio;

  for (const { pedido, items } of pedidos) {
    if (!seleccionadosIds.has(pedido.id)) continue;
    if (opciones.soloExpress && !pedido.express) continue;
    for (const it of items) {
      // La clave lleva el precio ya convertido: es el que se imprime, y dos
      // precios base distintos que caen en el mismo recargo son una sola
      // línea para el cliente.
      const precio =
        it.precio_unidad === null || !convertir
          ? it.precio_unidad
          : convertir(it.precio_unidad);
      const key = claveLinea(
        it.producto_empresa_id,
        it.producto_empresa_nombre,
        precio,
      );
      const cur = map.get(key);
      if (cur) {
        cur.cantidad += it.cantidad;
        if (precio !== null) {
          cur.importe += precio * it.cantidad;
        } else {
          cur.sinPrecio = true;
        }
      } else {
        map.set(key, {
          key,
          producto_empresa_id: it.producto_empresa_id,
          nombre: it.producto_empresa_nombre,
          etiqueta: it.producto_empresa_nombre,
          cantidad: it.cantidad,
          precio_unidad: precio,
          importe: precio === null ? 0 : precio * it.cantidad,
          sinPrecio: precio === null,
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

/** Consolidado de la factura normal: todas las guías marcadas, a precio base. */
export function consolidarPedidos(
  pedidos: readonly PedidoConItems[],
  seleccionadosIds: ReadonlySet<number>,
): Consolidado {
  return consolidar(pedidos, seleccionadosIds);
}

/**
 * Consolidado de la factura de recargo: solo las guías express, y solo el
 * porcentaje adicional.
 */
export function consolidarExpress(
  pedidos: readonly PedidoConItems[],
  seleccionadosIds: ReadonlySet<number>,
  recargoPct: number,
): Consolidado {
  return consolidar(pedidos, seleccionadosIds, {
    soloExpress: true,
    precio: (base) => precioExpress(base, recargoPct),
  });
}

/**
 * Si corresponde recordarle a la persona que bajó la planilla pero no registró
 * la facturación.
 *
 * Bajar el Excel y registrar son dos acciones separadas a propósito —a veces
 * se baja solo para revisar antes de emitir— y esa separación es la forma
 * fácil de que el seguimiento quede con agujeros.
 *
 * La parte que no es obvia es el solapamiento parcial: si *alguna* de las
 * guías ya está en un documento vigente, el recordatorio NO va. Registrar
 * estaría bloqueado de todos modos, y el aviso que corresponde ahí es el de
 * "ya facturadas", que además ofrece desmarcarlas. Dos carteles diciendo
 * cosas distintas sobre lo mismo es peor que uno.
 */
export function debeRecordarRegistro({
  exportado,
  ocultado,
  guiaIds,
  idsYaFacturadas,
}: {
  /** Ya se bajó la planilla de este documento en esta visita. */
  exportado: boolean;
  /** La persona cerró el aviso. */
  ocultado: boolean;
  /** Guías que entrarían en el documento. */
  guiaIds: readonly number[];
  /** De esas, las que ya están en un documento vigente del mismo tipo. */
  idsYaFacturadas: readonly number[];
}): boolean {
  if (!exportado || ocultado) return false;
  if (guiaIds.length === 0) return false;
  return idsYaFacturadas.length === 0;
}

export interface Facturacion {
  /** Todas las guías marcadas, a precio base. Siempre existe. */
  principal: Consolidado;
  /**
   * El recargo de las express. `null` cuando la empresa no cobra express o
   * cuando ninguna de las guías marcadas lo es: ahí no hay segundo documento
   * que emitir.
   */
  express: Consolidado | null;
  /** Ids de las guías express incluidas, para registrar la segunda factura. */
  idsExpress: number[];
}

/**
 * Los dos documentos de un período en una sola pasada.
 *
 * Ojo con el total: el neto de `principal` ya incluye las guías express a
 * precio base, así que lo que factura el período es la suma de los dos netos,
 * no uno u otro.
 */
export function consolidarFacturacion(
  pedidos: readonly PedidoConItems[],
  seleccionadosIds: ReadonlySet<number>,
  recargoPct: number,
): Facturacion {
  const principal = consolidarPedidos(pedidos, seleccionadosIds);

  const idsExpress = pedidos
    .filter((p) => seleccionadosIds.has(p.pedido.id) && p.pedido.express)
    .map((p) => p.pedido.id);

  // Si el codigo se despliega antes de aplicar 0010_pedidos_express, la
  // columna no existe todavia y el recargo llega undefined. Sin esta guarda
  // `undefined <= 0` es false, el calculo sigue, y la pantalla muestra NaN en
  // vez de simplemente no ofrecer el documento express.
  if (!Number.isFinite(recargoPct) || recargoPct <= 0 || idsExpress.length === 0) {
    return { principal, express: null, idsExpress };
  }

  const express = consolidarExpress(pedidos, seleccionadosIds, recargoPct);
  // Guías express sin ninguna línea con precio no dan documento: facturar un
  // recargo de cero es emitir un papel en blanco.
  if (express.neto === 0) {
    return { principal, express: null, idsExpress };
  }
  return { principal, express, idsExpress };
}
