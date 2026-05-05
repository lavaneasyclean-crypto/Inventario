import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  MapPin,
  Mail,
  Phone,
  Package,
  Plus,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getEmpresaDetalle } from "@/lib/data/empresas";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EditarEmpresaButton } from "../editor-empresa";

export const dynamic = "force-dynamic";

export default async function EmpresaDetallePage({
  params,
}: {
  params: Promise<{ rut: string }>;
}) {
  const { rut: rutEncoded } = await params;
  const rut = decodeURIComponent(rutEncoded);

  const data = await getEmpresaDetalle(rut);
  if (!data) notFound();

  const { empresa, pedidos } = data;
  const direccion = [empresa.calle, empresa.comuna].filter(Boolean).join(", ");

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4">
        <Link
          href="/empresas"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        >
          <ArrowLeft className="size-4" /> Volver a empresas
        </Link>
      </div>

      <header className="mb-6 rounded-xl border bg-background p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{empresa.nombre}</h1>
            {empresa.alias && empresa.alias !== empresa.nombre && (
              <p className="text-sm text-muted-foreground">
                Alias: {empresa.alias}
              </p>
            )}
            <p className="font-mono text-sm text-muted-foreground">
              {empresa.rut}
            </p>
          </div>
          <EditarEmpresaButton empresa={empresa} />
        </div>

        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          {direccion && (
            <div className="flex items-start gap-2 text-muted-foreground">
              <MapPin className="mt-0.5 size-4 shrink-0" />
              <span>{direccion}</span>
            </div>
          )}
          {empresa.contacto_1 && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="size-4" />
              <a
                href={`tel:${empresa.contacto_1}`}
                className="hover:text-foreground hover:underline"
              >
                {empresa.contacto_1}
              </a>
            </div>
          )}
          {empresa.contacto_2 && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="size-4" />
              <a
                href={`tel:${empresa.contacto_2}`}
                className="hover:text-foreground hover:underline"
              >
                {empresa.contacto_2}
              </a>
            </div>
          )}
          {empresa.correo && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="size-4" />
              <a
                href={`mailto:${empresa.correo}`}
                className="hover:text-foreground hover:underline"
              >
                {empresa.correo}
              </a>
            </div>
          )}
        </div>
      </header>

      <div className="mb-6">
        <Link
          href={`/empresas/pedidos/nuevo?rut=${encodeURIComponent(empresa.rut)}`}
          className={cn(buttonVariants({ size: "lg" }), "h-11 px-4 text-base")}
        >
          <Plus className="size-5" /> Nuevo pedido para {empresa.alias || empresa.nombre}
        </Link>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Historial de pedidos{" "}
          <span className="text-base font-normal text-muted-foreground">
            ({pedidos.length})
          </span>
        </h2>
        {pedidos.length === 0 ? (
          <div className="rounded-xl border bg-background p-12 text-center text-sm text-muted-foreground">
            Esta empresa todavía no tiene pedidos.
          </div>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {pedidos.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/empresas/pedidos/${p.id}`}
                  className="block rounded-lg border bg-background p-4 transition-colors hover:bg-accent"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-base font-semibold">
                      #{p.id}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(p.fecha)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Package className="size-3.5" />
                    <span>
                      {p.items_count} item{p.items_count === 1 ? "" : "s"} ·{" "}
                      {p.total_unidades} unidad
                      {p.total_unidades === 1 ? "" : "es"}
                    </span>
                  </div>
                  {p.detalle && (
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                      {p.detalle}
                    </p>
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
