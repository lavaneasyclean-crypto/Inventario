import { Suspense } from "react";
import { History } from "lucide-react";
import { getHistorial, type HistorialFiltro } from "@/lib/data/auditoria";
import { EsqueletoLista } from "@/components/esqueletos";
import { FiltrosHistorial } from "./filtros";
import { Registro } from "./registro";

export const dynamic = "force-dynamic";

function parseFiltros(
  p: Record<string, string | string[] | undefined>,
): HistorialFiltro {
  const get = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : undefined);
  return {
    q: get("q"),
    entidad: get("entidad"),
    accion: get("accion"),
    desde: get("desde"),
    hasta: get("hasta"),
  };
}

/** La lista, aparte, para que el esqueleto aparezca mientras consulta. */
async function Lista({ filtros }: { filtros: HistorialFiltro }) {
  const registros = await getHistorial(filtros);

  if (registros.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center">
        <History className="mx-auto mb-2 size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No hay movimientos para este filtro.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          El historial empieza a correr desde que se instaló: lo que pasó antes
          no quedó registrado.
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="mb-2 text-sm text-muted-foreground">
        {registros.length === 200
          ? "Últimos 200 movimientos. Afiná los filtros para ver más atrás."
          : `${registros.length} movimiento${registros.length === 1 ? "" : "s"}`}
      </p>
      <ul className="flex flex-col gap-2">
        {registros.map((r) => (
          <Registro key={r.id} reg={r} />
        ))}
      </ul>
    </>
  );
}

export default async function HistorialPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filtros = parseFiltros(params);

  return (
    <div className="p-4 sm:p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Historial</h1>
        <p className="text-sm text-muted-foreground">
          Quién cambió qué, y de qué a qué
        </p>
      </header>

      <FiltrosHistorial />

      {/* La `key` hace que el esqueleto vuelva a aparecer al cambiar un
          filtro. Sin ella, React reusa el resultado viejo y la pantalla se
          queda quieta mientras consulta. */}
      <Suspense key={JSON.stringify(filtros)} fallback={<EsqueletoLista filas={8} />}>
        <Lista filtros={filtros} />
      </Suspense>
    </div>
  );
}
