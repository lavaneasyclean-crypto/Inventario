import { createClient } from "@/lib/supabase/server";
import {
  getProductosEmpresaActivos,
  searchEmpresas,
} from "@/lib/data/empresas";
import type { ClienteEmpresa } from "@/lib/types";
import { BackButton } from "@/components/back-button";
import { NuevoPedidoEmpresaForm } from "./form";

export const dynamic = "force-dynamic";

export default async function NuevoPedidoEmpresaPage({
  searchParams,
}: {
  searchParams: Promise<{ rut?: string }>;
}) {
  const { rut } = await searchParams;

  let empresaInicial: ClienteEmpresa | null = null;
  if (rut) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("clientes_empresa")
      .select("*")
      .eq("rut", decodeURIComponent(rut))
      .maybeSingle();
    empresaInicial = (data as ClienteEmpresa) ?? null;
  }

  // Lista completa de empresas (son pocas) y productos empresa activos
  const [empresas, productos] = await Promise.all([
    searchEmpresas(""),
    getProductosEmpresaActivos(),
  ]);

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4">
        <BackButton />
      </div>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">
        Nuevo pedido de empresa
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Elegí la empresa, agregá los productos y confirmá.
      </p>

      <NuevoPedidoEmpresaForm
        empresas={empresas}
        productos={productos}
        empresaInicial={empresaInicial}
      />
    </div>
  );
}
