import { getAllProductos } from "@/lib/data/productos";
import { TIPO_SERVICIO_LABELS } from "@/lib/types";
import type { Producto, TipoServicio } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { formatCLP } from "@/lib/format";
import { EditarProductoButton, NuevoProductoButton } from "./editor-producto";
import { FiltroCatalogo } from "./filtro-catalogo";

export const dynamic = "force-dynamic";

export default async function CatalogoPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tipo?: string; soloActivos?: string }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim().toLowerCase();
  const tipo = (params.tipo ?? "todos") as TipoServicio | "todos";
  const soloActivos = params.soloActivos === "1";

  const all = await getAllProductos();
  const filtrados = all.filter((p) => {
    if (soloActivos && !p.activo) return false;
    if (tipo !== "todos" && p.tipo_servicio !== tipo) return false;
    if (q) {
      const t = (p.nombre + " " + p.id).toLowerCase();
      if (!t.includes(q)) return false;
    }
    return true;
  });

  // Agrupar por tipo_servicio
  const grupos = new Map<TipoServicio, Producto[]>();
  for (const p of filtrados) {
    const arr = grupos.get(p.tipo_servicio) ?? [];
    arr.push(p);
    grupos.set(p.tipo_servicio, arr);
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Catálogo</h1>
          <p className="text-sm text-muted-foreground">
            Productos y precios. Los cambios quedan registrados en auditoría.
          </p>
        </div>
        <NuevoProductoButton />
      </div>

      <div className="mb-4">
        <FiltroCatalogo initial={{ q, tipo, soloActivos }} />
      </div>

      <p className="mb-3 text-sm text-muted-foreground">
        {filtrados.length === 0
          ? "Sin productos para esta búsqueda."
          : `${filtrados.length} producto${filtrados.length === 1 ? "" : "s"}`}
      </p>

      <div className="flex flex-col gap-6">
        {[...grupos.entries()].map(([tipoSrv, productos]) => (
          <section key={tipoSrv}>
            <h2 className="mb-2 text-base font-semibold">
              {TIPO_SERVICIO_LABELS[tipoSrv]}{" "}
              <span className="text-muted-foreground">({productos.length})</span>
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {productos.map((p) => (
                <li
                  key={p.id}
                  className="flex items-start justify-between gap-3 rounded-lg border bg-background p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{p.nombre}</span>
                      {!p.activo && (
                        <Badge variant="secondary" className="text-xs">
                          Inactivo
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {p.id}
                    </div>
                    <div className="mt-2 font-mono text-base font-semibold tabular-nums">
                      {formatCLP(p.precio)}
                    </div>
                  </div>
                  <EditarProductoButton producto={p} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
