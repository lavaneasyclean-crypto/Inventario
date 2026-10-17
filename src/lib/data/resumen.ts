import "server-only";
import { createClient } from "@/lib/supabase/server";
import { agruparResumen, type ResumenDelDia } from "@/lib/resumen";
import type { Pedido, PedidoItem } from "@/lib/types";
import { enGrupos, traerTodas } from "./paginado";

/**
 * Lo que hay que trabajar hoy.
 *
 * Se arma en dos pasadas a propósito. La primera agrupa solo por fecha, sin
 * items, para saber qué pedidos entran; la segunda trae los items de esos y
 * nada más. Traer los items de los 432 pedidos en proceso serían miles de
 * filas, y 359 de esos pedidos son viejos que ni se listan.
 */
export async function getResumenDelDia(
  hoy: string,
  opciones: { soloPlanchado?: boolean } = {},
): Promise<ResumenDelDia> {
  const supabase = await createClient();

  const pedidos = await traerTodas<Pedido>((desde, hasta) =>
    supabase
      .from("pedidos")
      .select("*")
      .eq("estado", "recibido")
      .order("id", { ascending: true })
      .range(desde, hasta),
  );

  const sinItems = agruparResumen(pedidos, new Map(), hoy);
  const relevantes = [
    ...sinItems.atrasados,
    ...sinItems.hoy,
    ...sinItems.manana,
    ...sinItems.sinFecha,
  ].map((f) => f.pedido.id);

  if (relevantes.length === 0) return sinItems;

  // `in` con muchos ids no entra en una URL, así que va por tandas.
  const items: PedidoItem[] = [];
  for (const tanda of enGrupos(relevantes, 200)) {
    const filas = await traerTodas<PedidoItem>((desde, hasta) =>
      supabase
        .from("pedidos_items")
        .select("*")
        .in("pedido_id", tanda)
        .order("id", { ascending: true })
        .range(desde, hasta),
    );
    items.push(...filas);
  }

  const porPedido = new Map<number, PedidoItem[]>();
  for (const i of items) {
    porPedido.set(i.pedido_id, [...(porPedido.get(i.pedido_id) ?? []), i]);
  }

  return agruparResumen(pedidos, porPedido, hoy, opciones);
}
