import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Pedido, PedidoItem } from "@/lib/types";

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
