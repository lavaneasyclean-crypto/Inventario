import Link from "next/link";
import { Phone, MapPin, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { searchEmpresas } from "@/lib/data/empresas";
import { formatDateShort } from "@/lib/format";
import { NuevaEmpresaButton } from "./editor-empresa";
import { Buscador } from "@/components/buscador";

export const dynamic = "force-dynamic";

export default async function EmpresasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const resultados = await searchEmpresas(q);

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Empresas</h1>
          <p className="text-sm text-muted-foreground">
            Buscá por nombre, alias, RUT o contacto
          </p>
        </div>
        <NuevaEmpresaButton />
      </div>

      <form className="mb-6 flex gap-2" action="/empresas" method="get">
        <Buscador
          defaultValue={q}
          placeholder="Ej: Hostal, Alma Spa, +56 9..."
          autoFocus
        />
        <Button type="submit" size="lg" className="h-11 px-5">
          Buscar
        </Button>
      </form>

      {q && resultados.length === 0 ? (
        <div className="rounded-xl border bg-background p-12 text-center">
          <p className="text-base font-medium">Sin resultados para &ldquo;{q}&rdquo;</p>
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {resultados.map((e) => (
            <li key={e.rut}>
              <Link
                href={`/empresas/${encodeURIComponent(e.rut)}`}
                className="flex flex-col gap-2 rounded-lg border bg-background p-4 transition-colors hover:bg-accent"
              >
                <div>
                  <div className="font-medium">{e.nombre}</div>
                  {e.alias && e.alias !== e.nombre && (
                    <div className="text-xs text-muted-foreground">
                      Alias: {e.alias}
                    </div>
                  )}
                  <div className="font-mono text-xs text-muted-foreground">
                    {e.rut}
                  </div>
                </div>
                <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {e.contacto_1 && (
                    <span className="flex items-center gap-1">
                      <Phone className="size-3" /> {e.contacto_1}
                    </span>
                  )}
                  {e.comuna && (
                    <span className="flex items-center gap-1">
                      <MapPin className="size-3" /> {e.comuna}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 font-medium">
                    <Package className="size-3" /> {e.pedidos_count} pedido
                    {e.pedidos_count === 1 ? "" : "s"}
                  </span>
                  {e.ultimo_pedido && (
                    <span className="text-muted-foreground">
                      Último: {formatDateShort(e.ultimo_pedido)}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
