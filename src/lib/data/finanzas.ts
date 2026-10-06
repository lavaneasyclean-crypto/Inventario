import "server-only";
import { createClient } from "@/lib/supabase/server";
import { esFechaValida } from "@/lib/fecha";
import { filtroContiene } from "@/lib/postgrest";
import { enGrupos, traerTodas } from "./paginado";
import type {
  CategoriaGasto,
  ClienteEmpresa,
  EstadoFactura,
  Factura,
  FacturaAbono,
  FacturaLinea,
  Gasto,
  PedidoEmpresa,
  TipoFactura,
} from "@/lib/types";

const LIMITE = 300;

/**
 * Factura con el nombre de la empresa ya resuelto. PostgREST sabe traerlo en
 * el mismo viaje por la foreign key, así que no hace falta una segunda
 * consulta para poder listar.
 */
export interface FacturaConEmpresa extends Factura {
  empresa_nombre: string;
  empresa_alias: string | null;
}

type FilaConEmpresa = Factura & {
  clientes_empresa: { nombre: string; alias: string | null } | null;
};

function aplanar(fila: FilaConEmpresa): FacturaConEmpresa {
  const { clientes_empresa, ...factura } = fila;
  return {
    ...factura,
    empresa_nombre: clientes_empresa?.nombre ?? "(empresa eliminada)",
    empresa_alias: clientes_empresa?.alias ?? null,
  };
}

export interface FacturasFilter {
  /** Busca en el folio y en el nombre de la empresa. */
  q?: string;
  rut?: string;
  estado?: EstadoFactura | "todos";
  tipo?: TipoFactura | "todos";
  /** Rango sobre la fecha de emisión. */
  desde?: string;
  hasta?: string;
}

export async function searchFacturas(
  filtros: FacturasFilter = {},
): Promise<FacturaConEmpresa[]> {
  const supabase = await createClient();

  let q = supabase
    .from("facturas")
    .select("*, clientes_empresa(nombre, alias)")
    .order("fecha", { ascending: false })
    .order("id", { ascending: false })
    .limit(LIMITE);

  if (filtros.rut) q = q.eq("rut_empresa", filtros.rut);
  if (filtros.estado && filtros.estado !== "todos") {
    q = q.eq("estado", filtros.estado);
  }
  if (filtros.tipo && filtros.tipo !== "todos") q = q.eq("tipo", filtros.tipo);
  if (esFechaValida(filtros.desde)) q = q.gte("fecha", filtros.desde);
  if (esFechaValida(filtros.hasta)) q = q.lte("fecha", filtros.hasta);

  const termino = filtros.q?.trim();
  if (termino) {
    // El nombre de la empresa vive en la otra tabla y `or` no la alcanza, así
    // que el texto se busca en el folio y —abajo, en memoria— en el nombre.
    q = q.or(filtroContiene(["folio", "notas"], termino));
  }

  const { data } = await q;
  return ((data ?? []) as FilaConEmpresa[]).map(aplanar);
}

/**
 * Igual que `searchFacturas` pero sin el filtro de texto, porque buscar por
 * nombre de empresa exige mirar la tabla relacionada. Se resuelve con dos
 * consultas: primero qué empresas matchean, después sus facturas.
 */
export async function searchFacturasConTexto(
  filtros: FacturasFilter = {},
): Promise<FacturaConEmpresa[]> {
  const termino = filtros.q?.trim();
  if (!termino) return searchFacturas(filtros);

  const supabase = await createClient();
  const { data: empresas } = await supabase
    .from("clientes_empresa")
    .select("rut")
    .or(filtroContiene(["rut", "nombre", "alias"], termino));
  const ruts = (empresas ?? []).map((e) => e.rut as string);

  const [porFolio, porEmpresa] = await Promise.all([
    searchFacturas(filtros),
    ruts.length > 0
      ? (async () => {
          let q = supabase
            .from("facturas")
            .select("*, clientes_empresa(nombre, alias)")
            .in("rut_empresa", ruts)
            .order("fecha", { ascending: false })
            .limit(LIMITE);
          if (filtros.estado && filtros.estado !== "todos") {
            q = q.eq("estado", filtros.estado);
          }
          if (filtros.tipo && filtros.tipo !== "todos") {
            q = q.eq("tipo", filtros.tipo);
          }
          if (esFechaValida(filtros.desde)) q = q.gte("fecha", filtros.desde);
          if (esFechaValida(filtros.hasta)) q = q.lte("fecha", filtros.hasta);
          const { data } = await q;
          return ((data ?? []) as FilaConEmpresa[]).map(aplanar);
        })()
      : Promise.resolve([] as FacturaConEmpresa[]),
  ]);

  const porId = new Map<number, FacturaConEmpresa>();
  for (const f of [...porFolio, ...porEmpresa]) porId.set(f.id, f);
  return [...porId.values()].sort(
    (a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id,
  );
}

export interface FacturaDetalle {
  factura: Factura;
  empresa: ClienteEmpresa | null;
  lineas: FacturaLinea[];
  abonos: FacturaAbono[];
  guias: PedidoEmpresa[];
  /** La otra mitad del período: la express de una normal, o al revés. */
  hermana: Factura | null;
}

export async function getFacturaDetalle(
  id: number,
): Promise<FacturaDetalle | null> {
  const supabase = await createClient();

  const { data: facturaData } = await supabase
    .from("facturas")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!facturaData) return null;
  const factura = facturaData as Factura;

  const [lineasRes, abonosRes, guiasRes, empresaRes] = await Promise.all([
    supabase
      .from("facturas_lineas")
      .select("*")
      .eq("factura_id", id)
      .order("nombre", { ascending: true }),
    supabase
      .from("facturas_abonos")
      .select("*")
      .eq("factura_id", id)
      .order("fecha", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("facturas_guias")
      .select("pedido_empresa_id")
      .eq("factura_id", id),
    supabase
      .from("clientes_empresa")
      .select("*")
      .eq("rut", factura.rut_empresa)
      .maybeSingle(),
  ]);

  const guiaIds = (guiasRes.data ?? []).map(
    (g) => g.pedido_empresa_id as number,
  );

  let guias: PedidoEmpresa[] = [];
  let hermana: Factura | null = null;

  if (guiaIds.length > 0) {
    const [pedidosRes, hermanaRes] = await Promise.all([
      supabase
        .from("pedidos_empresa")
        .select("*")
        .in("id", guiaIds)
        .order("fecha", { ascending: true }),
      // El documento del otro tipo que comparte guías con este. Se busca por
      // una sola guía: si comparten una, comparten el período.
      supabase
        .from("facturas_guias")
        .select("facturas!inner(*)")
        .eq("pedido_empresa_id", guiaIds[0])
        .neq("facturas.tipo", factura.tipo)
        .neq("facturas.estado", "anulada")
        .limit(1),
    ]);
    guias = (pedidosRes.data ?? []) as PedidoEmpresa[];
    // PostgREST devuelve el embed como arreglo aunque la FK sea a-uno.
    const fila = (hermanaRes.data ?? [])[0] as unknown as
      | { facturas: Factura | Factura[] | null }
      | undefined;
    const embed = fila?.facturas;
    hermana = Array.isArray(embed) ? (embed[0] ?? null) : (embed ?? null);
  }

  return {
    factura,
    empresa: (empresaRes.data as ClienteEmpresa | null) ?? null,
    lineas: (lineasRes.data ?? []) as FacturaLinea[],
    abonos: (abonosRes.data ?? []) as FacturaAbono[],
    guias,
    hermana,
  };
}

/**
 * Qué guías de esta empresa ya están facturadas y en qué documento.
 *
 * Es lo que permite que la pantalla de facturación avise "la #1562 ya está en
 * la factura del 30-ago" en vez de dejar que se facture dos veces. Se separa
 * por tipo porque una guía express legítimamente está en dos.
 */
export interface GuiaFacturada {
  normal: number | null;
  express: number | null;
}

export async function getGuiasFacturadas(
  pedidoIds: readonly number[],
): Promise<Map<number, GuiaFacturada>> {
  const mapa = new Map<number, GuiaFacturada>();
  if (pedidoIds.length === 0) return mapa;

  type Fila = {
    pedido_empresa_id: number;
    facturas: { id: number; tipo: TipoFactura } | null;
  };

  const supabase = await createClient();
  const data: Fila[] = [];
  for (const grupo of enGrupos([...pedidoIds])) {
    data.push(
      ...((await traerTodas((desde, hasta) =>
        supabase
          .from("facturas_guias")
          .select("pedido_empresa_id, facturas!inner(id, tipo, estado)")
          .in("pedido_empresa_id", grupo)
          .neq("facturas.estado", "anulada")
          .range(desde, hasta),
      )) as unknown as Fila[]),
    );
  }

  for (const fila of data) {
    if (!fila.facturas) continue;
    const actual = mapa.get(fila.pedido_empresa_id) ?? {
      normal: null,
      express: null,
    };
    actual[fila.facturas.tipo] = fila.facturas.id;
    mapa.set(fila.pedido_empresa_id, actual);
  }
  return mapa;
}

// =========================================================
// Gastos
// =========================================================

export interface GastosFilter {
  q?: string;
  categoria?: CategoriaGasto | "todas";
  pago?: "todos" | "pagado" | "pendiente";
  desde?: string;
  hasta?: string;
}

export async function searchGastos(
  filtros: GastosFilter = {},
): Promise<Gasto[]> {
  const supabase = await createClient();

  let q = supabase
    .from("gastos")
    .select("*")
    .order("fecha", { ascending: false })
    .order("id", { ascending: false })
    .limit(LIMITE);

  if (filtros.categoria && filtros.categoria !== "todas") {
    q = q.eq("categoria", filtros.categoria);
  }
  if (filtros.pago === "pagado") q = q.eq("pagado", true);
  if (filtros.pago === "pendiente") q = q.eq("pagado", false);
  if (esFechaValida(filtros.desde)) q = q.gte("fecha", filtros.desde);
  if (esFechaValida(filtros.hasta)) q = q.lte("fecha", filtros.hasta);

  const termino = filtros.q?.trim();
  if (termino) {
    q = q.or(filtroContiene(["descripcion", "proveedor", "documento"], termino));
  }

  const { data } = await q;
  return (data ?? []) as Gasto[];
}

export async function getGasto(id: number): Promise<Gasto | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("gastos")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as Gasto | null) ?? null;
}

// =========================================================
// Resumen
// =========================================================

export interface DatosResumen {
  /** Todo lo abierto, de cualquier fecha: es la pregunta "cuánto nos deben". */
  facturasPendientes: Factura[];
  gastosPendientes: Gasto[];
  /** Lo que se movió dentro del rango consultado. */
  facturasDelPeriodo: FacturaConEmpresa[];
  gastosDelPeriodo: Gasto[];
}

export async function getDatosResumen(
  desde: string,
  hasta: string,
): Promise<DatosResumen> {
  const supabase = await createClient();

  const [pendientesF, pendientesG, periodoF, periodoG] = await Promise.all([
    supabase
      .from("facturas")
      .select("*")
      .eq("estado", "pendiente")
      .order("fecha_vence", { ascending: true })
      .limit(LIMITE),
    supabase
      .from("gastos")
      .select("*")
      .eq("pagado", false)
      .order("fecha_vence", { ascending: true })
      .limit(LIMITE),
    supabase
      .from("facturas")
      .select("*, clientes_empresa(nombre, alias)")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: false })
      .limit(LIMITE),
    supabase
      .from("gastos")
      .select("*")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: false })
      .limit(LIMITE),
  ]);

  return {
    facturasPendientes: (pendientesF.data ?? []) as Factura[],
    gastosPendientes: (pendientesG.data ?? []) as Gasto[],
    facturasDelPeriodo: ((periodoF.data ?? []) as FilaConEmpresa[]).map(aplanar),
    gastosDelPeriodo: (periodoG.data ?? []) as Gasto[],
  };
}

/** Empresas activas, para el selector de la factura cargada a mano. */
export async function getEmpresasParaSelector(): Promise<
  Array<Pick<ClienteEmpresa, "rut" | "nombre" | "alias">>
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("clientes_empresa")
    .select("rut, nombre, alias")
    .eq("activo", true)
    .order("nombre", { ascending: true });
  return (data ?? []) as Array<Pick<ClienteEmpresa, "rut" | "nombre" | "alias">>;
}
