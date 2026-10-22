import { Button } from "@/components/ui/button";
import { searchEmpresas } from "@/lib/data/empresas";
import { esAdmin } from "@/lib/data/perfil";
import { NuevaEmpresaButton } from "./editor-empresa";
import { TarjetaEmpresa } from "./tarjeta-empresa";
import { Buscador } from "@/components/buscador";

export const dynamic = "force-dynamic";

export default async function EmpresasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  // Las inactivas se listan para todos. No desaparecen: se ven apagadas y
  // quien no es admin no las puede abrir. Esconderlas dejaba a quien buscaba
  // una pensando que se habia borrado.
  const admin = await esAdmin();
  const resultados = await searchEmpresas(q, { incluirInactivas: true });

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
              <TarjetaEmpresa empresa={e} admin={admin} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
