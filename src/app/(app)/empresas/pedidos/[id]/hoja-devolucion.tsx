import Link from "next/link";
import { PackageCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { agruparPorBolsa } from "@/lib/bolsas";
import { cn } from "@/lib/utils";
import type { EmpresaBolsa, PedidoEmpresaItem } from "@/lib/types";

/**
 * Qué lleva cada bolsa, para devolverla igual que entró.
 *
 * Es la vista opuesta a la de facturación: para cobrar importa el producto
 * (52 poleras en total), para devolver importa la bolsa (la 3 lleva 6 poleras,
 * 1 pantalón y 1 polerón) y el precio no pinta nada, por eso no aparece.
 */
export function HojaDevolucion({
  pedidoId,
  items,
  bolsas,
}: {
  pedidoId: number;
  items: PedidoEmpresaItem[];
  bolsas: EmpresaBolsa[];
}) {
  const { bolsas: contenido, sinBolsa } = agruparPorBolsa(items, bolsas);

  if (contenido.length === 0 && sinBolsa.length === 0) return null;

  const totalPrendas = contenido.reduce((s, b) => s + b.totalPrendas, 0);

  return (
    <section className="mb-6 rounded-xl border bg-background p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PackageCheck className="size-5 text-muted-foreground" />
          <div>
            <h2 className="text-lg font-semibold">
              Devolución por bolsa{" "}
              <span className="text-base font-normal text-muted-foreground">
                ({contenido.length})
              </span>
            </h2>
            <p className="text-xs text-muted-foreground">
              {totalPrendas} prenda{totalPrendas === 1 ? "" : "s"} en total.
              Cada bolsa vuelve con lo que dice acá.
            </p>
          </div>
        </div>
        <Link
          href={`/empresas/pedidos/${pedidoId}/devolucion`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Ver para imprimir
        </Link>
      </header>

      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {contenido.map((b) => (
          <li key={b.codigo} className="rounded-lg border p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-base font-semibold">
                {b.codigo}
              </span>
              <span className="text-xs text-muted-foreground">
                {b.totalPrendas} prenda{b.totalPrendas === 1 ? "" : "s"}
              </span>
            </div>
            {b.nombre && (
              <p className="text-xs text-muted-foreground">{b.nombre}</p>
            )}
            <ul className="mt-1.5 flex flex-col gap-0.5 text-sm">
              {b.lineas.map((l) => (
                <li
                  key={`${l.producto_empresa_id}-${l.nombre}`}
                  className="flex justify-between gap-2"
                >
                  <span className="truncate">{l.nombre}</span>
                  <span className="font-mono font-semibold tabular-nums">
                    {l.cantidad}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      {sinBolsa.length > 0 && (
        <div className="mt-3 rounded border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
          <p className="font-medium">
            {sinBolsa.length} línea{sinBolsa.length === 1 ? "" : "s"} sin bolsa
            asignada:
          </p>
          <ul className="mt-1 flex flex-wrap gap-x-3">
            {sinBolsa.map((l, i) => (
              <li key={i}>
                {l.nombre} × {l.cantidad}
              </li>
            ))}
          </ul>
          <p className="mt-1">
            Pasa cuando la guía se cargó antes de armar el padrón. Editala para
            asignarlas.
          </p>
        </div>
      )}
    </section>
  );
}
