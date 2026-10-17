import type { Pedido, PedidoItem, TipoServicio } from "@/lib/types";

/**
 * Cuántos días hacia atrás se listan los atrasados y los que no tienen fecha.
 *
 * Medido sobre la base real: de 432 pedidos "en proceso", 359 son de hace más
 * de tres meses. No son trabajo pendiente, son pedidos que nunca se cerraron y
 * vienen arrastrados del Access. Listarlos todos convierte el resumen en 400
 * líneas que nadie va a leer, y lo de hoy se pierde entre medio.
 *
 * Los que quedan afuera no se esconden: se cuentan aparte.
 */
export const VENTANA_DIAS = 30;

/** Lo que se plancha: planchado puro y lavado en seco. */
export const SERVICIOS_PLANCHADO: TipoServicio[] = ["planchado", "seco"];

export interface PedidoConItems {
  pedido: Pedido;
  items: PedidoItem[];
}

export interface ResumenDelDia {
  /** Entrega vencida, dentro de la ventana. Lo primero que hay que sacar. */
  atrasados: PedidoConItems[];
  hoy: PedidoConItems[];
  manana: PedidoConItems[];
  /** En proceso y sin fecha de entrega: si no se listan, no existen. */
  sinFecha: PedidoConItems[];
  /** En proceso pero fuera de la ventana. Solo el número. */
  viejos: number;
}

/** El día en Chile de una marca de tiempo, como "2026-10-17". */
function diaDe(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-CA", {
    timeZone: "America/Santiago",
  });
}

function diasEntre(desde: string, hasta: string): number {
  const a = new Date(`${desde}T00:00:00Z`).getTime();
  const b = new Date(`${hasta}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/**
 * Agrupa lo que hay en proceso en lo que hay que hacer.
 *
 * Recibe todo junto y reparte acá en vez de hacer una consulta por grupo: son
 * cuatro recortes de la misma lista, y cada viaje a Supabase cuesta más que
 * recorrerla cuatro veces.
 */
export function agruparResumen(
  pedidos: Pedido[],
  itemsPorPedido: Map<number, PedidoItem[]>,
  hoy: string,
  opciones: { soloPlanchado?: boolean } = {},
): ResumenDelDia {
  const manana = new Date(`${hoy}T00:00:00Z`);
  manana.setUTCDate(manana.getUTCDate() + 1);
  const diaManana = manana.toISOString().slice(0, 10);

  const out: ResumenDelDia = {
    atrasados: [],
    hoy: [],
    manana: [],
    sinFecha: [],
    viejos: 0,
  };

  for (const pedido of pedidos) {
    if (pedido.estado !== "recibido") continue;

    let items = itemsPorPedido.get(pedido.id) ?? [];

    if (opciones.soloPlanchado) {
      items = items.filter((i) =>
        SERVICIOS_PLANCHADO.includes(i.producto_tipo_servicio),
      );
      // Un pedido sin nada que planchar no va al resumen de planchado: quien
      // plancha no tiene por qué leer pedidos que no lo tocan.
      if (items.length === 0) continue;
    }

    const entrega = diaDe(pedido.fecha_entrega);
    const fila = { pedido, items };

    if (entrega === hoy) {
      out.hoy.push(fila);
      continue;
    }
    if (entrega === diaManana) {
      out.manana.push(fila);
      continue;
    }

    // Más allá de mañana todavía no es trabajo de hoy.
    if (entrega && entrega > diaManana) continue;

    const recepcion = diaDe(pedido.fecha_recepcion);
    const antiguedad = recepcion ? diasEntre(recepcion, hoy) : Infinity;
    if (antiguedad > VENTANA_DIAS) {
      out.viejos++;
      continue;
    }

    if (entrega) out.atrasados.push(fila);
    else out.sinFecha.push(fila);
  }

  // Lo más vencido primero: es lo que más molesta al cliente.
  out.atrasados.sort((a, b) =>
    (a.pedido.fecha_entrega ?? "").localeCompare(b.pedido.fecha_entrega ?? ""),
  );
  for (const grupo of [out.hoy, out.manana, out.sinFecha]) {
    grupo.sort((a, b) => a.pedido.id - b.pedido.id);
  }

  return out;
}

/** Cuántas prendas hay que trabajar en un grupo. */
export function contarPrendas(filas: PedidoConItems[]): number {
  return filas.reduce(
    (total, f) => total + f.items.reduce((s, i) => s + i.cantidad, 0),
    0,
  );
}
