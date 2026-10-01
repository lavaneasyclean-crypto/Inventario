import { searchGastos, type GastosFilter } from "@/lib/data/finanzas";
import { hoyEnChile } from "@/lib/fecha";
import { resumirGastos } from "@/lib/finanzas";
import { formatCLP } from "@/lib/format";
import { CATEGORIAS_GASTO, type CategoriaGasto } from "@/lib/types";
import { FiltrosGastos } from "./filtros-gastos";
import { NuevoGastoButton } from "./editor-gasto";
import { ListaGastos } from "./lista-gastos";

export const dynamic = "force-dynamic";

const CATEGORIAS = new Set<string>(CATEGORIAS_GASTO);
const PAGOS = new Set(["todos", "pagado", "pendiente"]);

function parseFiltros(
  params: Record<string, string | string[] | undefined>,
): GastosFilter {
  const get = (k: string) =>
    typeof params[k] === "string" ? (params[k] as string) : undefined;

  const categoria = get("categoria");
  const pago = get("pago");

  return {
    q: get("q"),
    categoria:
      categoria && CATEGORIAS.has(categoria)
        ? (categoria as CategoriaGasto)
        : "todas",
    pago: pago && PAGOS.has(pago) ? (pago as GastosFilter["pago"]) : "todos",
    desde: get("desde") || undefined,
    hasta: get("hasta") || undefined,
  };
}

export default async function GastosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filtros = parseFiltros(params);
  const hoy = hoyEnChile();

  const gastos = await searchGastos(filtros);
  const resumen = resumirGastos(gastos, hoy);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {gastos.length === 0
            ? "Sin gastos para este filtro."
            : `${gastos.length} gasto${gastos.length === 1 ? "" : "s"} · ${formatCLP(resumen.pendiente.total)} por pagar`}
        </p>
        <NuevoGastoButton hoy={hoy} />
      </div>

      <FiltrosGastos initial={filtros} />

      {gastos.length === 0 ? (
        <div className="rounded-xl border bg-background p-12 text-center">
          <p className="text-base font-medium">Sin gastos</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Anotá acá la luz, el agua, los insumos y las remuneraciones. Se
            cargan al recibir la boleta y se marcan pagados al pagarla.
          </p>
        </div>
      ) : (
        <ListaGastos gastos={gastos} hoy={hoy} />
      )}
    </div>
  );
}
