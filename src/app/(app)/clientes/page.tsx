import Link from "next/link";
import { Search, Phone, MapPin, Package } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { searchClientes } from "@/lib/data/clientes";
import { formatDateShort } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const resultados = await searchClientes(q);

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
        <p className="text-sm text-muted-foreground">
          Buscá por RUT, nombre o teléfono
        </p>
      </div>

      <form className="mb-6 flex gap-2" action="/clientes" method="get">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Ej: 12345678-9, María, +56 9..."
            className="h-11 pl-9 text-base"
            autoFocus
          />
        </div>
        <Button type="submit" size="lg" className="h-11 px-5">
          Buscar
        </Button>
      </form>

      {q && resultados.length === 0 ? (
        <div className="rounded-xl border bg-background p-12 text-center">
          <p className="text-base font-medium">Sin resultados para “{q}”</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Probá con otra parte del nombre, el RUT sin puntos o el teléfono.
          </p>
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {resultados.map((c) => (
            <li key={c.rut}>
              <Link
                href={`/clientes/${encodeURIComponent(c.rut)}`}
                className="flex flex-col gap-2 rounded-lg border bg-background p-4 transition-colors hover:bg-accent"
              >
                <div className="font-medium">{c.nombre || "(sin nombre)"}</div>
                <div className="font-mono text-xs text-muted-foreground">
                  {c.rut}
                </div>
                <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {c.telefono && (
                    <span className="flex items-center gap-1">
                      <Phone className="size-3" /> {c.telefono}
                    </span>
                  )}
                  {c.comuna && (
                    <span className="flex items-center gap-1">
                      <MapPin className="size-3" /> {c.comuna}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 font-medium">
                    <Package className="size-3" /> {c.pedidos_count} pedido
                    {c.pedidos_count === 1 ? "" : "s"}
                  </span>
                  {c.ultimo_pedido && (
                    <span className="text-muted-foreground">
                      Último: {formatDateShort(c.ultimo_pedido)}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!q && resultados.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Mostrando los {resultados.length} primeros clientes alfabéticamente.
          Buscá arriba para filtrar.
        </p>
      )}
    </div>
  );
}
