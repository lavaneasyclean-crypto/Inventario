import { createClient } from "@/lib/supabase/server";
import { getProductosActivos } from "@/lib/data/productos";
import type { Cliente } from "@/lib/types";
import { NuevoPedidoForm } from "./nuevo-pedido-form";
import { BackButton } from "@/components/back-button";

export const dynamic = "force-dynamic";

export default async function NuevoPedidoPage({
  searchParams,
}: {
  searchParams: Promise<{ rut?: string }>;
}) {
  const { rut } = await searchParams;

  let clientePrefill: Cliente | null = null;
  if (rut) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("clientes")
      .select("rut, nombre, telefono, correo, comuna, calle, dpto")
      .eq("rut", decodeURIComponent(rut))
      .maybeSingle();
    clientePrefill = (data as Cliente) ?? null;
  }

  const productos = await getProductosActivos();

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4">
        <BackButton />
      </div>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">
        Nuevo pedido
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Buscá al cliente, agregá los productos y confirmá.
      </p>

      <NuevoPedidoForm productos={productos} clienteInicial={clientePrefill} />
    </div>
  );
}
