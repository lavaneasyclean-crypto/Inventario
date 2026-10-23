import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getPedidoEmpresaDetalle } from "@/lib/data/empresas";
import { agruparPorBolsa } from "@/lib/bolsas";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BotonImprimir } from "@/components/boton-imprimir";

export const dynamic = "force-dynamic";

/**
 * Hoja de devolución para imprimir y mandar con la ropa.
 *
 * Es una página aparte y no un modal porque se imprime: necesita ser toda la
 * hoja, sin el menú lateral ni la barra de arriba. `print:` esconde lo que no
 * va al papel.
 */
export default async function DevolucionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();

  const data = await getPedidoEmpresaDetalle(id);
  if (!data) notFound();

  const { bolsas: contenido, sinBolsa } = agruparPorBolsa(
    data.items,
    data.bolsas,
  );

  const totalPrendas = contenido.reduce((s, b) => s + b.totalPrendas, 0);

  return (
    /* Sale por la misma térmica de 5 pulgadas que las guías: ancho fijo de
       119 mm y todo en negro. Ver components/ticket.tsx. */
    <div className="p-4 sm:p-6 print:max-w-[119mm] print:p-0 print:text-[12px] print:leading-tight print:text-black">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link
          href={`/empresas/pedidos/${id}`}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        >
          <ArrowLeft className="size-4" /> Volver a la guía
        </Link>
        <BotonImprimir />
      </div>

      <header className="mb-4 border-b pb-3">
        <h1 className="text-2xl font-semibold print:text-base">
          Devolución — guía #{data.pedido.id}
        </h1>
        <p className="text-sm text-muted-foreground print:text-black">
          {data.empresa?.nombre ?? "Empresa eliminada"} ·{" "}
          {formatDate(data.pedido.fecha)}
          {data.pedido.detalle ? ` · ${data.pedido.detalle}` : ""}
        </p>
        <p className="mt-1 text-sm">
          <strong>{contenido.length}</strong> bolsa
          {contenido.length === 1 ? "" : "s"} ·{" "}
          <strong>{totalPrendas}</strong> prenda
          {totalPrendas === 1 ? "" : "s"}
        </p>
      </header>

      {contenido.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-muted/30 p-8 text-center text-sm text-muted-foreground print:text-black">
          Esta guía no tiene prendas asignadas a una bolsa.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-1 print:gap-2">
          {contenido.map((b) => (
            <section
              key={b.codigo}
              className="break-inside-avoid rounded-lg border p-3 print:rounded-none print:border-black print:p-2"
            >
              <div className="flex items-baseline justify-between gap-2 border-b pb-1">
                <span className="font-mono text-lg font-bold">{b.codigo}</span>
                <span className="text-xs text-muted-foreground print:text-black">
                  {b.totalPrendas} prenda{b.totalPrendas === 1 ? "" : "s"}
                </span>
              </div>
              {b.nombre && (
                <p className="mt-0.5 text-xs text-muted-foreground print:text-black">
                  {b.nombre}
                </p>
              )}
              <table className="mt-1.5 w-full text-sm print:text-[11px]">
                <tbody>
                  {b.lineas.map((l) => (
                    <tr key={`${l.producto_empresa_id}-${l.nombre}`}>
                      <td className="py-0.5 pr-2">{l.nombre}</td>
                      <td className="py-0.5 text-right font-mono font-semibold tabular-nums">
                        {l.cantidad}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}

      {sinBolsa.length > 0 && (
        <section className="mt-4 break-inside-avoid rounded-lg border border-dashed p-3">
          <h2 className="text-sm font-semibold">Sin bolsa asignada</h2>
          <ul className="mt-1 text-sm">
            {sinBolsa.map((l, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span>{l.nombre}</span>
                <span className="font-mono font-semibold">{l.cantidad}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
