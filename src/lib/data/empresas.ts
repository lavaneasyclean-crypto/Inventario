import "server-only";
import { createClient } from "@/lib/supabase/server";
import { esFechaValida, finDeDiaChile, inicioDeDiaChile } from "@/lib/fecha";
import type {
  ClienteEmpresa,
  PedidoEmpresa,
  PedidoEmpresaItem,
  ProductoEmpresa,
  ProductoEmpresaAdquirido,
} from "@/lib/types";

const SEARCH_LIMIT = 50;

export interface EmpresaResultado extends ClienteEmpresa {
  pedidos_count: number;
  ultimo_pedido: string | null;
}

export async function searchEmpresas(query: string): Promise<EmpresaResultado[]> {
  const supabase = await createClient();
  const q = query.trim();

  let baseQuery = supabase
    .from("clientes_empresa")
    .select("*")
    .limit(SEARCH_LIMIT);

  if (q) {
    const term = `%${q}%`;
    baseQuery = baseQuery.or(
      `rut.ilike.${term},nombre.ilike.${term},alias.ilike.${term},contacto_1.ilike.${term},contacto_2.ilike.${term}`,
    );
  }

  const { data: empresasData } = await baseQuery.order("nombre", {
    ascending: true,
  });
  const empresas = (empresasData ?? []) as ClienteEmpresa[];
  if (empresas.length === 0) return [];

  // Para cada empresa: contar pedidos + último
  const ruts = empresas.map((e) => e.rut);
  const { data: pedidosAgg } = await supabase
    .from("pedidos_empresa")
    .select("rut_empresa, fecha")
    .in("rut_empresa", ruts)
    .order("fecha", { ascending: false });

  const aggMap = new Map<string, { count: number; ultima: string | null }>();
  for (const row of pedidosAgg ?? []) {
    const r = row.rut_empresa as string;
    const cur = aggMap.get(r);
    if (!cur) aggMap.set(r, { count: 1, ultima: row.fecha as string });
    else cur.count++;
  }

  return empresas.map((e) => ({
    ...e,
    pedidos_count: aggMap.get(e.rut)?.count ?? 0,
    ultimo_pedido: aggMap.get(e.rut)?.ultima ?? null,
  }));
}

export interface EmpresaDetalle {
  empresa: ClienteEmpresa;
  pedidos: Array<PedidoEmpresa & { items_count: number; total_unidades: number }>;
}

export async function getEmpresaDetalle(
  rut: string,
): Promise<EmpresaDetalle | null> {
  const supabase = await createClient();

  const [empresaRes, pedidosRes] = await Promise.all([
    supabase.from("clientes_empresa").select("*").eq("rut", rut).maybeSingle(),
    supabase
      .from("pedidos_empresa")
      .select("*")
      .eq("rut_empresa", rut)
      .order("fecha", { ascending: false }),
  ]);

  if (empresaRes.error || !empresaRes.data) return null;

  const pedidos = (pedidosRes.data ?? []) as PedidoEmpresa[];
  const pedidoIds = pedidos.map((p) => p.id);

  let itemsByPedido = new Map<number, { count: number; unidades: number }>();
  if (pedidoIds.length > 0) {
    const { data: items } = await supabase
      .from("pedidos_empresa_items")
      .select("pedido_empresa_id, cantidad")
      .in("pedido_empresa_id", pedidoIds);

    for (const it of items ?? []) {
      const pid = it.pedido_empresa_id as number;
      const cur = itemsByPedido.get(pid);
      const cantidad = it.cantidad as number;
      if (!cur) itemsByPedido.set(pid, { count: 1, unidades: cantidad });
      else {
        cur.count++;
        cur.unidades += cantidad;
      }
    }
  }

  return {
    empresa: empresaRes.data as ClienteEmpresa,
    pedidos: pedidos.map((p) => ({
      ...p,
      items_count: itemsByPedido.get(p.id)?.count ?? 0,
      total_unidades: itemsByPedido.get(p.id)?.unidades ?? 0,
    })),
  };
}

export async function getPedidoEmpresaDetalle(id: number): Promise<{
  pedido: PedidoEmpresa;
  empresa: ClienteEmpresa | null;
  items: PedidoEmpresaItem[];
} | null> {
  const supabase = await createClient();

  const { data: pedido } = await supabase
    .from("pedidos_empresa")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!pedido) return null;

  const [itemsRes, empresaRes] = await Promise.all([
    supabase
      .from("pedidos_empresa_items")
      .select("*")
      .eq("pedido_empresa_id", id)
      .order("id", { ascending: true }),
    pedido.rut_empresa
      ? supabase
          .from("clientes_empresa")
          .select("*")
          .eq("rut", pedido.rut_empresa)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    pedido: pedido as PedidoEmpresa,
    empresa: (empresaRes.data as ClienteEmpresa | null) ?? null,
    items: (itemsRes.data ?? []) as PedidoEmpresaItem[],
  };
}

export interface PedidoEmpresaConItems {
  pedido: PedidoEmpresa;
  items: PedidoEmpresaItem[];
}

export async function getPedidosEmpresaParaFacturacion(
  rut: string,
  filtros: {
    desde?: string; // YYYY-MM-DD
    hasta?: string; // YYYY-MM-DD
    idDesde?: number;
    idHasta?: number;
  },
): Promise<PedidoEmpresaConItems[]> {
  const supabase = await createClient();

  let q = supabase
    .from("pedidos_empresa")
    .select("*")
    .eq("rut_empresa", rut)
    .order("fecha", { ascending: true })
    .limit(500);

  if (esFechaValida(filtros.desde)) {
    q = q.gte("fecha", inicioDeDiaChile(filtros.desde));
  }
  if (esFechaValida(filtros.hasta)) {
    q = q.lt("fecha", finDeDiaChile(filtros.hasta));
  }
  if (filtros.idDesde !== undefined) {
    q = q.gte("id", filtros.idDesde);
  }
  if (filtros.idHasta !== undefined) {
    q = q.lte("id", filtros.idHasta);
  }

  const { data: pedidos } = await q;
  const lista = (pedidos ?? []) as PedidoEmpresa[];
  if (lista.length === 0) return [];

  const ids = lista.map((p) => p.id);
  const { data: items } = await supabase
    .from("pedidos_empresa_items")
    .select("*")
    .in("pedido_empresa_id", ids)
    .order("id", { ascending: true });

  const itemsByPedido = new Map<number, PedidoEmpresaItem[]>();
  for (const it of (items ?? []) as PedidoEmpresaItem[]) {
    const arr = itemsByPedido.get(it.pedido_empresa_id) ?? [];
    arr.push(it);
    itemsByPedido.set(it.pedido_empresa_id, arr);
  }

  return lista.map((p) => ({
    pedido: p,
    items: itemsByPedido.get(p.id) ?? [],
  }));
}

export async function getProductosEmpresaActivos(): Promise<ProductoEmpresa[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("productos_empresa")
    .select("id, nombre, activo")
    .eq("activo", true)
    .order("nombre", { ascending: true });
  return (data ?? []) as ProductoEmpresa[];
}

/** Productos que una empresa específica ha "adquirido" + sus precios. */
export async function getProductosDeEmpresa(
  rut: string,
): Promise<ProductoEmpresaAdquirido[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("empresa_productos")
    .select("producto_empresa_id, precio, productos_empresa(nombre, activo)")
    .eq("rut_empresa", rut);

  type Row = {
    producto_empresa_id: string;
    precio: number | null;
    productos_empresa: { nombre: string; activo: boolean } | null;
  };

  const rows = (data ?? []) as unknown as Row[];
  return rows
    .filter((r) => r.productos_empresa?.activo !== false)
    .map((r) => ({
      producto_empresa_id: r.producto_empresa_id,
      nombre: r.productos_empresa?.nombre ?? "(producto eliminado)",
      precio: r.precio,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** Productos del catálogo global que la empresa NO ha adquirido todavía. */
export async function getProductosGlobalesDisponibles(
  rut: string,
): Promise<ProductoEmpresa[]> {
  const supabase = await createClient();

  const { data: adquiridos } = await supabase
    .from("empresa_productos")
    .select("producto_empresa_id")
    .eq("rut_empresa", rut);
  const yaAdquiridos = new Set(
    (adquiridos ?? []).map((r) => r.producto_empresa_id as string),
  );

  const { data: todos } = await supabase
    .from("productos_empresa")
    .select("id, nombre, activo")
    .eq("activo", true)
    .order("nombre", { ascending: true });

  return ((todos ?? []) as ProductoEmpresa[]).filter(
    (p) => !yaAdquiridos.has(p.id),
  );
}
