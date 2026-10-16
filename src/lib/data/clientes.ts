import "server-only";
import { createClient } from "@/lib/supabase/server";
import { filtroContienePorCampo } from "@/lib/postgrest";
import type { Cliente, Pedido } from "@/lib/types";

const SEARCH_LIMIT = 50;

export interface ClienteResultado extends Cliente {
  pedidos_count: number;
  ultimo_pedido: string | null;
}

/**
 * Busca clientes por RUT, nombre o teléfono. Devuelve hasta 50 resultados.
 * Si la query está vacía devuelve los clientes con pedidos más recientes.
 */
export async function searchClientes(query: string): Promise<ClienteResultado[]> {
  const supabase = await createClient();
  const q = query.trim();

  // `clientes_resumen` (migrations/0018) ya trae la cantidad de pedidos y la
  // fecha del último. Antes esto eran dos viajes, y el segundo se bajaba
  // *todos* los pedidos de los 50 clientes para contarlos en JavaScript: 325
  // filas y 25 KB para calcular un numero y una fecha. Cada viaje cuesta mas
  // de medio segundo, así que pesaba mas el viaje que la cuenta.
  let baseQuery = supabase
    .from("clientes_resumen")
    .select(
      "rut, nombre, comuna, calle, dpto, telefono, correo, pedidos_count, ultimo_pedido",
    )
    .limit(SEARCH_LIMIT);

  if (q) {
    // Normalizar RUT: si parece un RUT, quitar puntos para matchear formato canónico
    const rutNorm = q.replace(/\./g, "").toUpperCase();
    baseQuery = baseQuery.or(
      filtroContienePorCampo([
        ["rut", rutNorm],
        ["nombre", q],
        ["telefono", q],
      ]),
    );
  }

  const { data } = await baseQuery.order("nombre", {
    ascending: true,
    nullsFirst: false,
  });

  return (data ?? []) as ClienteResultado[];
}

export interface ClienteDetalle {
  cliente: Cliente;
  pedidos: Pedido[];
  totales: {
    pedidos_count: number;
    total_gastado: number;
    total_pendiente_pago: number;
  };
}

export async function getClienteDetalle(
  rut: string,
): Promise<ClienteDetalle | null> {
  const supabase = await createClient();

  const [clienteRes, pedidosRes] = await Promise.all([
    supabase.from("clientes").select("*").eq("rut", rut).maybeSingle(),
    supabase
      .from("pedidos")
      .select("*")
      .eq("rut_cliente", rut)
      .order("fecha_recepcion", { ascending: false }),
  ]);

  if (clienteRes.error || !clienteRes.data) return null;

  const pedidos = (pedidosRes.data ?? []) as Pedido[];

  const total_gastado = pedidos
    .filter((p) => p.estado !== "anulado")
    .reduce((sum, p) => sum + Number(p.total_venta || 0), 0);

  const total_pendiente_pago = pedidos
    .filter((p) => !p.pagado && p.estado !== "anulado")
    .reduce((sum, p) => sum + (Number(p.total_venta || 0) - Number(p.monto_abonado || 0)), 0);

  return {
    cliente: clienteRes.data as Cliente,
    pedidos,
    totales: {
      pedidos_count: pedidos.length,
      total_gastado,
      total_pendiente_pago,
    },
  };
}
