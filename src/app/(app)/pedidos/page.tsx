import Link from "next/link";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PedidoCard } from "@/components/dashboard/pedido-card";
import { searchPedidos, type PedidosFilter } from "@/lib/data/pedidos";
import type { EstadoPedido } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FiltrosPedidos } from "./filtros-pedidos";

export const dynamic = "force-dynamic";

const VALID_ESTADOS = new Set<EstadoPedido | "todos">([
  "todos",
  "recibido",
  "listo",
  "entregado",
  "anulado",
]);

const VALID_PAGOS = new Set(["todos", "pagado", "sin_pagar"]);

function parseFilters(params: Record<string, string | string[] | undefined>): PedidosFilter {
  const get = (k: string) =>
    typeof params[k] === "string" ? (params[k] as string) : undefined;

  const estado = get("estado");
  const pago = get("pago");
  const pageStr = get("page");
  const page = pageStr ? Math.max(1, parseInt(pageStr, 10) || 1) : 1;

  return {
    q:      get("q"),
    estado: estado && VALID_ESTADOS.has(estado as EstadoPedido | "todos")
      ? (estado as EstadoPedido | "todos")
      : "todos",
    pago:   pago && VALID_PAGOS.has(pago)
      ? (pago as PedidosFilter["pago"])
      : "todos",
    desde:  get("desde") || undefined,
    hasta:  get("hasta") || undefined,
    page,
  };
}

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);
  const result = await searchPedidos(filters);

  const desde = (filters.page! - 1) * result.pageSize + 1;
  const hasta = Math.min(filters.page! * result.pageSize, result.total);

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pedidos</h1>
          <p className="text-sm text-muted-foreground">
            Buscá y filtrá entre todos los pedidos
          </p>
        </div>
        <Link
          href="/pedidos/nuevo"
          className={cn(buttonVariants({ size: "lg" }), "h-11 px-4 text-base")}
        >
          <Plus className="size-5" /> Nuevo pedido
        </Link>
      </div>

      <div className="mb-4">
        <FiltrosPedidos initial={filters} />
      </div>

      <div className="mb-3 flex items-center justify-between text-sm text-muted-foreground">
        {result.total === 0 ? (
          <span>Sin resultados</span>
        ) : (
          <span>
            Mostrando <strong className="text-foreground">{desde}</strong>–
            <strong className="text-foreground">{hasta}</strong> de{" "}
            <strong className="text-foreground">
              {result.total.toLocaleString("es-CL")}
            </strong>{" "}
            pedidos
          </span>
        )}
      </div>

      {result.total === 0 ? (
        <div className="rounded-xl border bg-background p-12 text-center">
          <p className="text-base font-medium">Sin pedidos para esta búsqueda</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Probá ajustar los filtros o limpiar para ver todos.
          </p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {result.pedidos.map((p) => (
            <PedidoCard key={p.id} pedido={p} />
          ))}
        </div>
      )}

      {result.totalPages > 1 && (
        <Pagination filters={filters} totalPages={result.totalPages} />
      )}
    </div>
  );
}

function buildHref(filters: PedidosFilter, page: number): string {
  const sp = new URLSearchParams();
  if (filters.q) sp.set("q", filters.q);
  if (filters.estado && filters.estado !== "todos") sp.set("estado", filters.estado);
  if (filters.pago && filters.pago !== "todos") sp.set("pago", filters.pago);
  if (filters.desde) sp.set("desde", filters.desde);
  if (filters.hasta) sp.set("hasta", filters.hasta);
  if (page > 1) sp.set("page", String(page));
  const qs = sp.toString();
  return qs ? `/pedidos?${qs}` : "/pedidos";
}

function Pagination({
  filters,
  totalPages,
}: {
  filters: PedidosFilter;
  totalPages: number;
}) {
  const page = filters.page!;
  const prev = page > 1 ? buildHref(filters, page - 1) : null;
  const next = page < totalPages ? buildHref(filters, page + 1) : null;

  return (
    <nav className="mt-6 flex items-center justify-between gap-2">
      {prev ? (
        <Link
          href={prev}
          className={cn(
            buttonVariants({ variant: "outline", size: "default" }),
            "h-10",
          )}
        >
          <ChevronLeft className="size-4" /> Anterior
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-muted-foreground">
        Página <strong className="text-foreground">{page}</strong> de{" "}
        <strong className="text-foreground">{totalPages}</strong>
      </span>
      {next ? (
        <Link
          href={next}
          className={cn(
            buttonVariants({ variant: "outline", size: "default" }),
            "h-10",
          )}
        >
          Siguiente <ChevronRight className="size-4" />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
