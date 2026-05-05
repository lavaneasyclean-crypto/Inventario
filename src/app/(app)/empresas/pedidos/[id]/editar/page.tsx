import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPedidoEmpresaDetalle } from "@/lib/data/empresas";
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
    .select("producto_empresa_id, precio, productos_empresa(nombre, activo)")
    .eq("rut_empresa", data.empresa.rut);

  type Row = {
    producto_empresa_id: string;
    precio: number | null;
    productos_empresa: { nombre: string; activo: boolean } | null;
  };
  const productos: ProductoEmpresaAdquirido[] = ((ep ?? []) as unknown as Row[])
    .filter((r) => r.productos_empresa?.activo !== false)
    .map((r) => ({
      producto_empresa_id: r.producto_empresa_id,
      nombre: r.productos_empresa?.nombre ?? "(sin nombre)",
      precio: r.precio,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

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
        items={data.items}
        productos={productos}
      />
    </div>
  );
}
