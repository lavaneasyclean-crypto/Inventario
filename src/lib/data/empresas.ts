import "server-only";
import { createClient } from "@/lib/supabase/server";
import { esFechaValida, finDeDiaChile, inicioDeDiaChile } from "@/lib/fecha";
import { filtroContiene } from "@/lib/postgrest";
import { enGrupos, traerTodas } from "./paginado";
import { ordenarBolsas } from "@/lib/bolsas";
import { ordenarProductos } from "@/lib/orden-productos";
import type {
  ClienteEmpresa,
  EmpresaBolsa,
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
    baseQuery = baseQuery.or(
      filtroContiene(
        ["rut", "nombre", "alias", "contacto_1", "contacto_2"],
        q,
      ),
    );
  }

  const { data: empresasData } = await baseQuery.order("nombre", {
    ascending: true,
  });
  const empresas = (empresasData ?? []) as ClienteEmpresa[];
  if (empresas.length === 0) return [];

  // Para cada empresa: contar pedidos + último
  const ruts = empresas.map((e) => e.rut);
  // Paginado: entre todas las empresas hay miles de pedidos y PostgREST solo
  // devuelve los primeros mil, asi que los conteos salian cortos.
  const pedidosAgg = await traerTodas<{ rut_empresa: string; fecha: string }>(
    (desde, hasta) =>
      supabase
        .from("pedidos_empresa")
        .select("rut_empresa, fecha")
        .in("rut_empresa", ruts)
        .order("fecha", { ascending: false })
        .range(desde, hasta),
  );

  const aggMap = new Map<string, { count: number; ultima: string | null }>();
  for (const row of pedidosAgg) {
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

  const itemsByPedido = new Map<number, { count: number; unidades: number }>();
  if (pedidoIds.length > 0) {
    // Acacias tiene 415 pedidos y 8.514 lineas: sin paginar, PostgREST
    // devolvia las primeras mil —las de los pedidos mas viejos— y toda la
    // ficha mostraba "0 items".
    const items: Array<{ pedido_empresa_id: number; cantidad: number }> = [];
    for (const grupo of enGrupos(pedidoIds)) {
      items.push(
        ...(await traerTodas<{ pedido_empresa_id: number; cantidad: number }>(
          (desde, hasta) =>
            supabase
              .from("pedidos_empresa_items")
              .select("pedido_empresa_id, cantidad")
              .in("pedido_empresa_id", grupo)
              .range(desde, hasta),
        )),
      );
    }

    for (const it of items) {
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

/**
 * Todo lo que necesita una guía, en un solo viaje.
 *
 * Antes eran cuatro tandas encadenadas: la guía, después sus líneas y la
 * empresa, después las bolsas de esa empresa, después las facturas que la
 * cubren. Cada tanda tiene que esperar a la anterior porque necesita el RUT
 * que vino en la de antes.
 *
 * Contra esta base una consulta tarda unos 230 ms cuando está tranquila, pero
 * una de cada cinco se va a varios segundos. Con cuatro tandas encadenadas la
 * probabilidad de comerse al menos un pozo es cerca del 60%: por eso entrar a
 * una guía se sentía lento "a veces" y no siempre.
 *
 * PostgREST sabe seguir las claves foráneas solo. Pidiendo los anidados en el
 * mismo select, Postgres arma todo de una y vuelve un viaje en vez de cuatro.
 *
 * `bolsas` vienen todas, activas e inactivas: la hoja de devolución necesita
 * las de baja para ponerle nombre a una bolsa vieja, y el editor se queda solo
 * con las activas. Filtrar en JS no cuesta nada y evita pedirlas dos veces.
 */
export interface PedidoEmpresaDetalle {
  pedido: PedidoEmpresa;
  empresa: ClienteEmpresa | null;
  items: PedidoEmpresaItem[];
  bolsas: EmpresaBolsa[];
  productos: ProductoEmpresaAdquirido[];
  facturas: { id: number; folio: string | null }[];
}

/** La forma cruda que devuelve el select con anidados. */
type FilaAnidada = PedidoEmpresa & {
  pedidos_empresa_items: PedidoEmpresaItem[] | null;
  clientes_empresa:
    | (ClienteEmpresa & {
        empresa_bolsas: EmpresaBolsa[] | null;
        empresa_productos:
          | {
              producto_empresa_id: string;
              precio: number | null;
              orden: number | null;
              en_grilla: boolean | null;
              productos_empresa: { nombre: string; activo: boolean } | null;
            }[]
          | null;
      })
    | null;
  facturas_guias:
    | { factura_id: number; facturas: { id: number; folio: string | null } | null }[]
    | null;
};

const SELECT_DETALLE =
  "*," +
  "pedidos_empresa_items(*)," +
  "clientes_empresa(*," +
  "empresa_bolsas(*)," +
  "empresa_productos(producto_empresa_id,precio,orden,en_grilla," +
  "productos_empresa(nombre,activo))" +
  ")," +
  "facturas_guias(factura_id,facturas(id,folio))";

export async function getPedidoEmpresaDetalle(
  id: number,
): Promise<PedidoEmpresaDetalle | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("pedidos_empresa")
    .select(SELECT_DETALLE)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;

  const fila = data as unknown as FilaAnidada;
  const {
    pedidos_empresa_items: itemsCrudos,
    clientes_empresa: empresaCruda,
    facturas_guias: cobertura,
    ...pedido
  } = fila;

  const { empresa_bolsas, empresa_productos, ...empresa } = empresaCruda ?? {
    empresa_bolsas: null,
    empresa_productos: null,
  };

  // Las líneas salen en el orden en que se cargaron: es el orden de la
  // planilla de papel y el que espera quien revisa la guía contra la ropa.
  const items = [...(itemsCrudos ?? [])].sort((a, b) => a.id - b.id);

  const productos = ordenarProductos(
    (empresa_productos ?? [])
      .filter((r) => r.productos_empresa?.activo !== false)
      .map((r) => ({
        producto_empresa_id: r.producto_empresa_id,
        nombre: r.productos_empresa?.nombre ?? "(producto eliminado)",
        precio: r.precio,
        orden: r.orden,
        en_grilla: r.en_grilla ?? true,
      })),
  );

  return {
    pedido: pedido as unknown as PedidoEmpresa,
    empresa: empresaCruda ? (empresa as unknown as ClienteEmpresa) : null,
    items,
    bolsas: ordenarBolsas(empresa_bolsas ?? []),
    productos,
    // RLS ya filtró acá: a quien no es admin le vuelve vacío, que es lo que
    // corresponde. La pantalla solo deja de mostrar los chips de factura.
    facturas: (cobertura ?? [])
      .map((c) => c.facturas)
      .filter((f): f is { id: number; folio: string | null } => f !== null),
  };
}

/**
 * La empresa con lo que hace falta para abrirle una guía nueva.
 *
 * Mismo criterio que `getPedidoEmpresaDetalle`: antes eran dos tandas —la
 * empresa, y recién después sus bolsas y sus precios, que necesitan el RUT—
 * y ahora es una sola. Los chicos de Termomin abren esta pantalla varias
 * veces al día desde el celular, donde cada viaje de más se nota.
 *
 * Las bolsas vuelven solo activas: una dada de baja no debería recibir ropa.
 */
export async function getEmpresaParaGuiaNueva(rut: string): Promise<{
  empresa: ClienteEmpresa;
  bolsas: EmpresaBolsa[];
  productos: ProductoEmpresaAdquirido[];
} | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("clientes_empresa")
    .select(
      "*,empresa_bolsas(*)," +
        "empresa_productos(producto_empresa_id,precio,orden,en_grilla," +
        "productos_empresa(nombre,activo))",
    )
    .eq("rut", rut)
    .maybeSingle();
  if (!data) return null;

  const fila = data as unknown as ClienteEmpresa & {
    empresa_bolsas: EmpresaBolsa[] | null;
    empresa_productos:
      | {
          producto_empresa_id: string;
          precio: number | null;
          orden: number | null;
          en_grilla: boolean | null;
          productos_empresa: { nombre: string; activo: boolean } | null;
        }[]
      | null;
  };
  const { empresa_bolsas, empresa_productos, ...empresa } = fila;

  return {
    empresa: empresa as ClienteEmpresa,
    bolsas: ordenarBolsas((empresa_bolsas ?? []).filter((b) => b.activo)),
    productos: ordenarProductos(
      (empresa_productos ?? [])
        .filter((r) => r.productos_empresa?.activo !== false)
        .map((r) => ({
          producto_empresa_id: r.producto_empresa_id,
          nombre: r.productos_empresa?.nombre ?? "(sin nombre)",
          precio: r.precio,
          orden: r.orden,
          en_grilla: r.en_grilla ?? true,
        })),
    ),
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
  // Paginado, y no por prolijidad: un rango con mas de mil lineas habria
  // emitido una factura por menos de lo que corresponde, sin ninguna senal.
  const items: PedidoEmpresaItem[] = [];
  for (const grupo of enGrupos(ids)) {
    items.push(
      ...(await traerTodas<PedidoEmpresaItem>((desde, hasta) =>
        supabase
          .from("pedidos_empresa_items")
          .select("*")
          .in("pedido_empresa_id", grupo)
          .order("id", { ascending: true })
          .range(desde, hasta),
      )),
    );
  }

  const itemsByPedido = new Map<number, PedidoEmpresaItem[]>();
  for (const it of items) {
    const arr = itemsByPedido.get(it.pedido_empresa_id) ?? [];
    arr.push(it);
    itemsByPedido.set(it.pedido_empresa_id, arr);
  }

  return lista.map((p) => ({
    pedido: p,
    items: itemsByPedido.get(p.id) ?? [],
  }));
}

/**
 * Las guías indicadas, con sus items, siempre que sean de esa empresa y no
 * estén anuladas.
 *
 * Lo usa el registro de facturas para rearmar el consolidado en el servidor en
 * vez de creerle el monto a la pantalla: si el navegador quedó con datos
 * viejos —o alguien toca el request— la factura se emite igual por lo que dice
 * la base.
 */
export async function getPedidosEmpresaPorIds(
  rut: string,
  ids: readonly number[],
): Promise<PedidoEmpresaConItems[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();

  const { data: pedidos } = await supabase
    .from("pedidos_empresa")
    .select("*")
    .eq("rut_empresa", rut)
    .eq("anulado", false)
    .in("id", [...ids])
    .order("fecha", { ascending: true });

  const lista = (pedidos ?? []) as PedidoEmpresa[];
  if (lista.length === 0) return [];

  const items: PedidoEmpresaItem[] = [];
  for (const grupo of enGrupos(lista.map((p) => p.id))) {
    items.push(
      ...(await traerTodas<PedidoEmpresaItem>((desde, hasta) =>
        supabase
          .from("pedidos_empresa_items")
          .select("*")
          .in("pedido_empresa_id", grupo)
          .order("id", { ascending: true })
          .range(desde, hasta),
      )),
    );
  }

  const itemsByPedido = new Map<number, PedidoEmpresaItem[]>();
  for (const it of items) {
    const arr = itemsByPedido.get(it.pedido_empresa_id) ?? [];
    arr.push(it);
    itemsByPedido.set(it.pedido_empresa_id, arr);
  }

  return lista.map((p) => ({
    pedido: p,
    items: itemsByPedido.get(p.id) ?? [],
  }));
}

/**
 * El padron de bolsas de una empresa, en el orden de la grilla: primero las
 * numeradas y despues las que van por nombre.
 */
export async function getBolsasDeEmpresa(
  rut: string,
  opciones: { incluirInactivas?: boolean } = {},
): Promise<EmpresaBolsa[]> {
  const supabase = await createClient();
  let q = supabase.from("empresa_bolsas").select("*").eq("rut_empresa", rut);
  if (!opciones.incluirInactivas) q = q.eq("activo", true);

  const { data } = await q;
  return ordenarBolsas((data ?? []) as EmpresaBolsa[]);
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
    .select("producto_empresa_id, precio, orden, en_grilla, productos_empresa(nombre, activo)")
    .eq("rut_empresa", rut);

  type Row = {
    producto_empresa_id: string;
    precio: number | null;
    orden: number | null;
    en_grilla: boolean;
    productos_empresa: { nombre: string; activo: boolean } | null;
  };

  const rows = (data ?? []) as unknown as Row[];
  return ordenarProductos(
    rows
      .filter((r) => r.productos_empresa?.activo !== false)
      .map((r) => ({
        producto_empresa_id: r.producto_empresa_id,
        nombre: r.productos_empresa?.nombre ?? "(producto eliminado)",
        precio: r.precio,
        orden: r.orden,
        en_grilla: r.en_grilla ?? true,
      })),
  );
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
