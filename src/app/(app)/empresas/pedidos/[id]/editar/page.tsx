import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBolsasDeEmpresa, getPedidoEmpresaDetalle } from "@/lib/data/empresas";
import { celdasDesdeItems } from "@/lib/bolsas";
import { fechaEnChile } from "@/lib/fecha";
import { GrillaBolsas } from "../../grilla-bolsas";
import { ordenarProductos } from "@/lib/orden-productos";
import type { ProductoEmpresaAdquirido } from "@/lib/types";
import { BackButton } from "@/components/back-button";
import { EditarPedidoEmpresaForm } from "./form";

export const dynamic = "force-dynamic";

export default async function EditarPedidoEmpresaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();

  const data = await getPedidoEmpresaDetalle(id);
  if (!data || !data.empresa) notFound();

  // Productos disponibles para esta empresa
  const supabase = await createClient();
  const { data: ep } = await supabase
    .from("empresa_productos")
    .select("producto_empresa_id, precio, orden, en_grilla, productos_empresa(nombre, activo)")
    .eq("rut_empresa", data.empresa.rut);

  type Row = {
    producto_empresa_id: string;
    precio: number | null;
    orden: number | null;
    en_grilla: boolean;
    productos_empresa: { nombre: string; activo: boolean } | null;
  };
  const productos: ProductoEmpresaAdquirido[] = ordenarProductos(
    ((ep ?? []) as unknown as Row[])
      .filter((r) => r.productos_empresa?.activo !== false)
      .map((r) => ({
        producto_empresa_id: r.producto_empresa_id,
        nombre: r.productos_empresa?.nombre ?? "(sin nombre)",
        precio: r.precio,
        orden: r.orden,
        en_grilla: r.en_grilla ?? true,
      })),
  );

  // Las empresas que trabajan por bolsas editan en la misma grilla con que
  // cargaron: el formulario de items sueltos no deja ver de que bolsa es cada
  // linea, que es justo lo que hay que corregir cuando algo se tipeo mal.
  if (data.empresa.usa_bolsas) {
    const bolsas = await getBolsasDeEmpresa(data.empresa.rut);
    const celdas = celdasDesdeItems(data.items);

    // Una linea cuya bolsa se dio de baja no tiene fila donde mostrarse. Se
    // avisa en vez de perderla en silencio al guardar.
    const enGrilla = new Set(bolsas.map((b) => b.id));
    const huerfanas = data.items.filter(
      (it) => it.bolsa_id == null || !enGrilla.has(it.bolsa_id),
    );

    return (
      <div className="p-4 sm:p-6">
        <div className="mb-4">
          <BackButton />
        </div>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">
          Editar guía #{data.pedido.id}
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {data.empresa.alias || data.empresa.nombre} · se guarda reemplazando
          todas las líneas por lo que diga la grilla.
        </p>

        {huerfanas.length > 0 && (
          <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
            <p className="font-medium">
              {huerfanas.length} línea{huerfanas.length === 1 ? "" : "s"} no
              {huerfanas.length === 1 ? " entra" : " entran"} en la grilla
              porque su bolsa no está en el padrón activo:
            </p>
            <ul className="mt-1 flex flex-wrap gap-x-3">
              {huerfanas.map((it) => (
                <li key={it.id}>
                  {it.bolsa_codigo ? `bolsa ${it.bolsa_codigo}` : "sin bolsa"}:{" "}
                  {it.producto_empresa_nombre} × {it.cantidad}
                </li>
              ))}
            </ul>
            <p className="mt-1">
              Si guardás así, se pierden. Reactivá esas bolsas en la ficha de la
              empresa primero.
            </p>
          </div>
        )}

        <GrillaBolsas
          empresa={data.empresa}
          bolsas={bolsas}
          productos={productos}
          inicial={{
            id: data.pedido.id,
            fecha: fechaEnChile(new Date(data.pedido.fecha)),
            detalle: data.pedido.detalle ?? "",
            celdas,
          }}
        />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4">
        <BackButton />
      </div>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">
        Editar pedido #{data.pedido.id}
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {data.empresa.nombre}
        {data.empresa.alias && data.empresa.alias !== data.empresa.nombre
          ? ` (${data.empresa.alias})`
          : ""}
      </p>

      <EditarPedidoEmpresaForm
        pedido={data.pedido}
        recargoExpress={data.empresa.recargo_express}
        rutEmpresa={data.empresa.rut}
        items={data.items}
        productos={productos}
      />
    </div>
  );
}
