import { notFound } from "next/navigation";
import { getPedidoEmpresaDetalle } from "@/lib/data/empresas";
import { celdasDesdeItems } from "@/lib/bolsas";
import { fechaEnChile } from "@/lib/fecha";
import { GrillaBolsas } from "../../grilla-bolsas";
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

  const productos = data.productos;

  // Las empresas que trabajan por bolsas editan en la misma grilla con que
  // cargaron: el formulario de items sueltos no deja ver de que bolsa es cada
  // linea, que es justo lo que hay que corregir cuando algo se tipeo mal.
  if (data.empresa.usa_bolsas) {
    // Para editar solo sirven las activas: una bolsa dada de baja no
    // deberia poder recibir ropa nueva.
    const bolsas = data.bolsas.filter((b) => b.activo);
    const celdas = celdasDesdeItems(data.items);
    // Lo que no vino en una bolsa —el traslado— va en su propia seccion.
    const otros: Record<string, string> = {};
    for (const it of data.items) {
      if (it.bolsa_id != null || !it.producto_empresa_id) continue;
      otros[it.producto_empresa_id] = String(
        (Number(otros[it.producto_empresa_id]) || 0) + it.cantidad,
      );
    }

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
          productos={productos.filter((p) => p.en_grilla)}
          otrosProductos={productos.filter((p) => !p.en_grilla)}
          inicial={{
            id: data.pedido.id,
            version: data.pedido.updated_at,
            fecha: fechaEnChile(new Date(data.pedido.fecha)),
            detalle: data.pedido.detalle ?? "",
            celdas,
            otros,
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
