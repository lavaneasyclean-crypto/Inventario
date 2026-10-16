import "server-only";
import { createClient } from "@/lib/supabase/server";
import { esFechaValida, finDeDiaChile, inicioDeDiaChile } from "@/lib/fecha";
import { filtroContienePorCampo } from "@/lib/postgrest";
import { normalizeRut } from "@/lib/rut";
import type { EstadoPedido, Pedido, PedidoItem } from "@/lib/types";

export interface DashboardData {
  pendientes: Pedido[];
  listos: Pedido[];
  porCobrar: Pedido[];
  totales: {
    pendientes: number;
    listos: number;
    porCobrar: number;
  };
}

const DASH_LIMIT = 30;

export async function getDashboardData(): Promise<DashboardData> {
  const supabase = await createClient();

  const [pendientes, listos, porCobrar] = await Promise.all([
    supabase
      .from("pedidos")
      .select("*", { count: "exact" })
      .eq("estado", "recibido")
      .order("fecha_recepcion", { ascending: false })
      .limit(DASH_LIMIT),
    supabase
      .from("pedidos")
      .select("*", { count: "exact" })
      .eq("estado", "listo")
      .order("fecha_recepcion", { ascending: false })
      .limit(DASH_LIMIT),
    supabase
      .from("pedidos")
      .select("*", { count: "exact" })
      .eq("pagado", false)
      .neq("estado", "anulado")
      .order("fecha_recepcion", { ascending: false })
      .limit(DASH_LIMIT),
  ]);

  return {
    pendientes: (pendientes.data ?? []) as Pedido[],
    listos: (listos.data ?? []) as Pedido[],
    porCobrar: (porCobrar.data ?? []) as Pedido[],
    totales: {
      pendientes: pendientes.count ?? 0,
      listos: listos.count ?? 0,
      porCobrar: porCobrar.count ?? 0,
    },
  };
}

// =========================================================
// Lista de pedidos con filtros + paginación
// =========================================================

export const PEDIDOS_PAGE_SIZE = 50;

export interface PedidosFilter {
  q?: string;
  estado?: EstadoPedido | "todos";
  pago?: "pagado" | "sin_pagar" | "todos";
  desde?: string;   // YYYY-MM-DD
  hasta?: string;   // YYYY-MM-DD
  page?: number;
}

export interface PedidosListResult {
  pedidos: Pedido[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function searchPedidos(
  f: PedidosFilter,
): Promise<PedidosListResult> {
  const supabase = await createClient();
  const page = Math.max(1, f.page ?? 1);
  const pageSize = PEDIDOS_PAGE_SIZE;

  let query = supabase.from("pedidos").select("*", { count: "exact" });

  // Busqueda libre por numero de pedido, nombre o RUT.
  //
  // Antes, un termino de solo digitos se tomaba como numero de pedido y nada
  // mas. Un RUT sin guion es todo digitos, asi que buscar por RUT no tenia
  // forma de funcionar: "201588" se iba a buscar el pedido numero 201588.
  //
  // Ahora los tres caminos van en el mismo OR. El RUT se busca tal cual se
  // escribio *y* normalizado, porque en la base esta canonico con guion:
  // quien tipea "201588" encuentra por el pedazo, y quien tipea el RUT
  // completo sin guion tambien.
  if (f.q?.trim()) {
    const term = f.q.trim();

    const pares: Array<[string, string]> = [
      ["nombre_cliente", term],
      ["rut_cliente", term],
    ];
    const rutNorm = normalizeRut(term);
    if (rutNorm && rutNorm !== term) pares.push(["rut_cliente", rutNorm]);

    const partes = [filtroContienePorCampo(pares)];
    // El limite de digitos evita mandar a Postgres un numero que no entra en
    // bigint cuando alguien pega cualquier cosa.
    if (/^\d{1,15}$/.test(term)) partes.push(`id.eq.${term}`);

    query = query.or(partes.join(","));
  }

  if (f.estado && f.estado !== "todos") {
    query = query.eq("estado", f.estado);
  }

  if (f.pago === "pagado") query = query.eq("pagado", true);
  if (f.pago === "sin_pagar") query = query.eq("pagado", false);

  // Los rangos vienen de la query string, así que se descarta lo que no sea
  // una fecha real en vez de mandarle basura a Postgres.
  if (esFechaValida(f.desde)) {
    query = query.gte("fecha_recepcion", inicioDeDiaChile(f.desde));
  }
  if (esFechaValida(f.hasta)) {
    // "hasta" es inclusivo: el límite es el inicio del día siguiente.
    query = query.lt("fecha_recepcion", finDeDiaChile(f.hasta));
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, count } = await query
    .order("fecha_recepcion", { ascending: false })
    .range(from, to);

  const total = count ?? 0;
  return {
    pedidos: (data ?? []) as Pedido[],
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getPedidoDetalle(id: number): Promise<{
  pedido: Pedido;
  items: PedidoItem[];
} | null> {
  const supabase = await createClient();

  const [pedidoRes, itemsRes] = await Promise.all([
    supabase.from("pedidos").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("pedidos_items")
      .select("*")
      .eq("pedido_id", id)
      .order("id", { ascending: true }),
  ]);

  if (pedidoRes.error || !pedidoRes.data) return null;

  return {
    pedido: pedidoRes.data as Pedido,
    items: (itemsRes.data ?? []) as PedidoItem[],
  };
}
