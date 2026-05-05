import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/back-button";
import { getPedidoEmpresaDetalle } from "@/lib/data/empresas";
import { formatCLP, formatDate } from "@/lib/format";
import { AccionesPedidoEmpresa } from "./acciones-pedido-empresa";

export const dynamic = "force-dynamic";

export default async function PedidoEmpresaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();

  const data = await getPedidoEmpresaDetalle(id);
  if (!data) notFound();

  const { pedido, empresa, items } = data;
  const totalUnidades = items.reduce((s, it) => s + it.cantidad, 0);
  const totalImporte = items.reduce((s, it) => s + (it.importe ?? 0), 0);
  const algunSinPrecio = items.some((it) => it.importe === null);

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4">
        <BackButton />
      </div>

      <header className="mb-6">
        <div className="flex items-baseline gap-3">
          <h1 className="font-mono text-3xl font-semibold">#{pedido.id}</h1>
          <span className="text-sm text-muted-foreground">Pedido empresa</span>
          {pedido.anulado && (
            <Badge variant="destructive">Anulado</Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatDate(pedido.fecha)}
        </p>
      </header>

      {empresa && (
        <section className="mb-6 rounded-xl border bg-background p-4">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
            Empresa
          </h2>
          <Link
            href={`/empresas/${encodeURIComponent(empresa.rut)}`}
            className="flex items-center gap-2 hover:underline"
          >
            <Building2 className="size-4 text-muted-foreground" />
            <span className="font-medium">{empresa.nombre}</span>
            {empresa.alias && empresa.alias !== empresa.nombre && (
              <span className="text-sm text-muted-foreground">({empresa.alias})</span>
            )}
            <span className="ml-auto font-mono text-xs text-muted-foreground">
              {empresa.rut}
            </span>
          </Link>
        </section>
      )}

      <section className="mb-6 rounded-xl border bg-background">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Items ({items.length})
          </h2>
        </header>
        {items.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            Este pedido no tiene items.
          </p>
        ) : (
          <ul className="divide-y">
            {items.map((it) => (
              <li key={it.id} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-sm tabular-nums">
                      {it.cantidad}×
                    </span>
                    <span className="font-medium">
                      {it.producto_empresa_nombre}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-3 text-sm">
                    <span className="text-muted-foreground">
                      {it.precio_unidad === null
                        ? "—"
                        : `${formatCLP(it.precio_unidad)} c/u`}
                    </span>
                    <span className="font-mono font-semibold tabular-nums">
                      {it.importe === null ? "—" : formatCLP(it.importe)}
                    </span>
                  </div>
                </div>
                {it.detalle_prenda && (
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">
                    {it.detalle_prenda}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        <footer className="grid grid-cols-2 gap-1 border-t bg-muted/40 px-4 py-3 text-sm">
          <span className="text-muted-foreground">Total unidades</span>
          <span className="text-right font-mono tabular-nums">
            {totalUnidades}
          </span>
          <span className="text-muted-foreground">Subtotal</span>
          <span className="text-right font-mono font-semibold tabular-nums">
            {algunSinPrecio && totalImporte === 0
              ? "—"
              : formatCLP(totalImporte)}
          </span>
        </footer>
      </section>

      {pedido.detalle && (
        <section className="mb-6 rounded-xl border bg-background p-4">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
            Detalle / Notas
          </h2>
          <p className="whitespace-pre-wrap text-sm">{pedido.detalle}</p>
        </section>
      )}

      <section className="rounded-xl border bg-background p-4">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          Acciones
        </h2>
        <AccionesPedidoEmpresa id={pedido.id} anulado={pedido.anulado} />
      </section>
    </div>
  );
}
