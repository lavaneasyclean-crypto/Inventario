import { createClient } from "@/lib/supabase/server";
import { searchEmpresas } from "@/lib/data/empresas";
import type {
  ClienteEmpresa,
  ProductoEmpresaAdquirido,
} from "@/lib/types";
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

  const empresas = await searchEmpresas("");

  // Cargo productos por empresa de TODAS las empresas. Es chico (10 empresas
  // x ~30 productos = 300 filas como mucho) y nos permite filtrar
  // instantáneamente sin round-trips cuando el usuario cambia de empresa.
  const supabase = await createClient();
  const { data: ep } = await supabase
    .from("empresa_productos")
    .select(
      "rut_empresa, producto_empresa_id, precio, productos_empresa(nombre, activo)",
    );

  type Row = {
    rut_empresa: string;
    producto_empresa_id: string;
    precio: number | null;
    productos_empresa: { nombre: string; activo: boolean } | null;
  };
  const productosByEmpresa = new Map<string, ProductoEmpresaAdquirido[]>();
  for (const row of (ep ?? []) as unknown as Row[]) {
    if (row.productos_empresa?.activo === false) continue;
    const arr = productosByEmpresa.get(row.rut_empresa) ?? [];
    arr.push({
      producto_empresa_id: row.producto_empresa_id,
      nombre: row.productos_empresa?.nombre ?? "(sin nombre)",
      precio: row.precio,
    });
    productosByEmpresa.set(row.rut_empresa, arr);
  }
  for (const arr of productosByEmpresa.values()) {
    arr.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }
  const productosByEmpresaObj: Record<string, ProductoEmpresaAdquirido[]> = {};
  for (const [k, v] of productosByEmpresa.entries()) {
    productosByEmpresaObj[k] = v;
  }

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
        productosByEmpresa={productosByEmpresaObj}
        empresaInicial={empresaInicial}
      />
    </div>
  );
}
