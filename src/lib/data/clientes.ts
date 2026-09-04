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

  let baseQuery = supabase
    .from("clientes")
    .select("rut, nombre, comuna, calle, dpto, telefono, correo")
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

  const { data: clientesData } = await baseQuery.order("nombre", {
    ascending: true,
    nullsFirst: false,
  });

  const clientes = (clientesData ?? []) as Cliente[];
  if (clientes.length === 0) return [];

  // Para cada cliente: contar pedidos y obtener fecha del último
  const ruts = clientes.map((c) => c.rut);
  const { data: pedidosAgg } = await supabase
    .from("pedidos")
    .select("rut_cliente, fecha_recepcion")
    .in("rut_cliente", ruts)
    .order("fecha_recepcion", { ascending: false });

  const aggMap = new Map<string, { count: number; ultima: string | null }>();
  for (const row of pedidosAgg ?? []) {
    const r = row.rut_cliente as string;
    const cur = aggMap.get(r);
    if (!cur) {
      aggMap.set(r, { count: 1, ultima: row.fecha_recepcion as string });
    } else {
      cur.count++;
    }
  }

  return clientes.map((c) => ({
    ...c,
    pedidos_count: aggMap.get(c.rut)?.count ?? 0,
    ultimo_pedido: aggMap.get(c.rut)?.ultima ?? null,
  }));
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
