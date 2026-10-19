import { notFound } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { getPedidoDetalle } from "@/lib/data/pedidos";
import { getProductosActivos } from "@/lib/data/productos";
import { EditarPedidoForm } from "./form";

export const dynamic = "force-dynamic";

export default async function EditarPedidoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();

  const [data, productos] = await Promise.all([
    getPedidoDetalle(id),
    getProductosActivos(),
  ]);
  if (!data) notFound();

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4">
        <BackButton />
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Editar pedido <span className="font-mono">#{data.pedido.id}</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          {data.pedido.nombre_cliente || "Sin nombre"} · Cambiá las prendas, la
          fecha de entrega o las notas.
        </p>
      </div>

      <EditarPedidoForm
        pedido={data.pedido}
        items={data.items}
        productos={productos}
      />
    </div>
  );
}
