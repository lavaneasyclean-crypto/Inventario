import { getProveedores, searchProveedores } from "@/lib/data/proveedores";
import { FiltrosProveedores } from "./filtros-proveedores";
import { NuevoProveedorButton } from "./editor-proveedor";
import { ListaProveedores } from "./lista-proveedores";

export const dynamic = "force-dynamic";

export default async function ProveedoresPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";

  // Los inactivos se muestran siempre acá: esta es la pantalla donde se los
  // va a buscar justamente para reactivarlos o corregirles un dato.
  const proveedores = q
    ? await searchProveedores(q, { incluirInactivos: true })
    : await getProveedores({ incluirInactivos: true });

  const activos = proveedores.filter((p) => p.activo).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {proveedores.length === 0
            ? q
              ? "Ninguno coincide con la búsqueda."
              : "Todavía no hay proveedores cargados."
            : `${proveedores.length} proveedor${proveedores.length === 1 ? "" : "es"}${
                activos === proveedores.length ? "" : ` · ${activos} activo${activos === 1 ? "" : "s"}`
              }`}
        </p>
        <NuevoProveedorButton />
      </div>

      <FiltrosProveedores inicial={q} />

      {proveedores.length === 0 ? (
        <div className="rounded-xl border bg-background p-12 text-center">
          <p className="text-base font-medium">Sin proveedores</p>
          <p className="mt-1 text-sm text-muted-foreground">
            A quién le pagamos: el del detergente, la empresa de la luz, el
            contador. Guardar su RUT y su cuenta acá evita andar buscándolos en
            WhatsApp cada vez que hay que transferir.
          </p>
        </div>
      ) : (
        <ListaProveedores proveedores={proveedores} />
      )}
    </div>
  );
}
