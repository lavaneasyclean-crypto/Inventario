import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2 } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { getPedidoEmpresaDetalle } from "@/lib/data/empresas";
import { formatDate } from "@/lib/format";

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

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4">
        <BackButton />
      </div>

      <header className="mb-6">
        <div className="flex items-baseline gap-3">
          <h1 className="font-mono text-3xl font-semibold">#{pedido.id}</h1>
          <span className="text-sm text-muted-foreground">Pedido empresa</span>
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
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-sm tabular-nums">
                    {it.cantidad}×
                  </span>
                  <span className="font-medium">
                    {it.producto_empresa_nombre}
                  </span>
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
        <footer className="flex items-center justify-between border-t bg-muted/40 px-4 py-3">
          <span className="text-sm text-muted-foreground">Total unidades</span>
          <span className="font-mono text-lg font-semibold tabular-nums">
            {totalUnidades}
          </span>
        </footer>
      </section>

      {pedido.detalle && (
        <section className="rounded-xl border bg-background p-4">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
            Detalle / Notas
          </h2>
          <p className="whitespace-pre-wrap text-sm">{pedido.detalle}</p>
        </section>
      )}
    </div>
  );
}
