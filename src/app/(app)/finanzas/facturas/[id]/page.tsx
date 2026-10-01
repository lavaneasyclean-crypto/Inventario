import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, Link2, Package } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getFacturaDetalle } from "@/lib/data/finanzas";
import { hoyEnChile } from "@/lib/fecha";
import { formatCLP, formatDateShort } from "@/lib/format";
import { FORMA_PAGO_LABELS, TIPO_FACTURA_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BadgeEstadoFactura, BadgeTipoFactura } from "../../badges";
import { AccionesFactura } from "./acciones-factura";

export const dynamic = "force-dynamic";

export default async function FacturaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idRaw } = await params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const detalle = await getFacturaDetalle(id);
  if (!detalle) notFound();

  const { factura, empresa, lineas, guias, hermana } = detalle;
  const hoy = hoyEnChile();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/finanzas/facturas"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        >
          <ArrowLeft className="size-4" /> Volver a facturas
        </Link>
      </div>

      <header className="rounded-xl border bg-background p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">
                {factura.folio ? `Factura N° ${factura.folio}` : "Factura sin folio"}
              </h2>
              <BadgeTipoFactura tipo={factura.tipo} />
              <BadgeEstadoFactura factura={factura} hoy={hoy} />
            </div>
            {empresa && (
              <Link
                href={`/empresas/${encodeURIComponent(empresa.rut)}`}
                className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline"
              >
                <Building2 className="size-3.5" />
                {empresa.alias || empresa.nombre} · {empresa.rut}
              </Link>
            )}
          </div>
          <div className="text-right">
            <p className="font-mono text-2xl font-bold tabular-nums">
              {formatCLP(factura.total)}
            </p>
            <p className="text-xs text-muted-foreground">
              Neto {formatCLP(factura.neto)} + IVA {formatCLP(factura.iva)}
            </p>
          </div>
        </div>

        {factura.tipo === "express" && (
          <p className="mt-3 rounded border border-violet-500/40 bg-violet-50 px-3 py-2 text-xs text-violet-900 dark:bg-violet-950/20 dark:text-violet-300">
            Este documento cobra <strong>solo el recargo</strong> por servicio
            express. Las mismas guías ya van a precio base en la factura normal
            del período.
          </p>
        )}

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
          <Dato etiqueta="Emitida" valor={factura.fecha} />
          <Dato etiqueta="Vence" valor={factura.fecha_vence ?? "—"} />
          <Dato
            etiqueta="Período facturado"
            valor={
              factura.periodo_desde && factura.periodo_hasta
                ? `${factura.periodo_desde} a ${factura.periodo_hasta}`
                : "—"
            }
          />
          <Dato
            etiqueta="Pago"
            valor={
              factura.fecha_pago
                ? `${factura.fecha_pago}${
                    factura.forma_pago
                      ? ` · ${FORMA_PAGO_LABELS[factura.forma_pago]}`
                      : ""
                  }`
                : "—"
            }
          />
        </dl>

        {factura.notas && (
          <p className="mt-3 text-sm text-muted-foreground">{factura.notas}</p>
        )}

        <div className="mt-4">
          <AccionesFactura factura={factura} hoy={hoy} />
        </div>
      </header>

      {hermana && (
        <Link
          href={`/finanzas/facturas/${hermana.id}`}
          className="flex items-center justify-between gap-3 rounded-xl border bg-background p-4 transition-colors hover:bg-accent"
        >
          <span className="inline-flex items-center gap-2 text-sm">
            <Link2 className="size-4 text-muted-foreground" />
            El mismo período tiene {TIPO_FACTURA_LABELS[hermana.tipo].toLowerCase()}:{" "}
            <strong>
              {hermana.folio ? `N° ${hermana.folio}` : `#${hermana.id}`}
            </strong>
          </span>
          <span className="font-mono text-sm font-semibold tabular-nums">
            {formatCLP(hermana.total)}
          </span>
        </Link>
      )}

      <section className="rounded-xl border bg-background p-4">
        <h2 className="mb-3 text-lg font-semibold">
          Detalle facturado{" "}
          <span className="text-base font-normal text-muted-foreground">
            ({lineas.length} línea{lineas.length === 1 ? "" : "s"})
          </span>
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Es una copia congelada del consolidado al momento de emitir. Si
          después cambian los precios, esto no se mueve.
        </p>
        {lineas.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            Esta factura se cargó a mano, sin detalle de líneas.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-2 font-medium">Producto</th>
                  <th className="pb-2 pr-2 text-right font-medium">Cantidad</th>
                  <th className="pb-2 pr-2 text-right font-medium">
                    Precio unitario
                  </th>
                  <th className="pb-2 text-right font-medium">Importe</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="py-2 pr-2">{l.nombre}</td>
                    <td className="py-2 pr-2 text-right font-mono tabular-nums">
                      {l.cantidad}
                    </td>
                    <td className="py-2 pr-2 text-right font-mono tabular-nums">
                      {l.precio_unidad === null ? "—" : formatCLP(l.precio_unidad)}
                    </td>
                    <td className="py-2 text-right font-mono font-semibold tabular-nums">
                      {formatCLP(l.importe)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="pt-3 pr-2 text-right text-muted-foreground">
                    TOTAL NETO
                  </td>
                  <td className="pt-3 text-right font-mono tabular-nums">
                    {formatCLP(factura.neto)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={3} className="pr-2 text-right text-muted-foreground">
                    IVA 19%
                  </td>
                  <td className="text-right font-mono tabular-nums">
                    {formatCLP(factura.iva)}
                  </td>
                </tr>
                <tr className="border-t">
                  <td colSpan={3} className="pt-2 pr-2 text-right text-base font-semibold">
                    TOTAL
                  </td>
                  <td className="pt-2 text-right font-mono text-base font-bold tabular-nums">
                    {formatCLP(factura.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-background p-4">
        <h2 className="mb-3 text-lg font-semibold">
          Guías incluidas{" "}
          <span className="text-base font-normal text-muted-foreground">
            ({guias.length})
          </span>
        </h2>
        {guias.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            Sin guías asociadas.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {guias.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/empresas/pedidos/${g.id}`}
                  className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-accent"
                >
                  <Package className="size-3.5 text-muted-foreground" />
                  <span className="font-mono font-semibold">#{g.id}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateShort(g.fecha)}
                  </span>
                  {g.express && (
                    <Badge className="bg-violet-600 text-white dark:bg-violet-700">
                      Express
                    </Badge>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{etiqueta}</dt>
      <dd className="font-medium">{valor}</dd>
    </div>
  );
}
