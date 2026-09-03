import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rangoDelMes } from "@/lib/fecha";
import {
  getPedidosEmpresaParaFacturacion,
} from "@/lib/data/empresas";
import type { ClienteEmpresa } from "@/lib/types";
import { BackButton } from "@/components/back-button";
import { FacturacionClient } from "./facturacion-cliente";

export const dynamic = "force-dynamic";

function defaultMonthRange(): { desde: string; hasta: string } {
  // El mes por defecto es el mes en curso en Chile, no el del reloj del server.
  return rangoDelMes();
}

export default async function FacturacionPage({
  params,
  searchParams,
}: {
  params: Promise<{ rut: string }>;
  searchParams: Promise<{
    modo?: "fecha" | "guia";
    desde?: string;
    hasta?: string;
    idDesde?: string;
    idHasta?: string;
  }>;
}) {
  const { rut: rutEncoded } = await params;
  const rut = decodeURIComponent(rutEncoded);
  const sp = await searchParams;

  const supabase = await createClient();
  const { data: empresaData } = await supabase
    .from("clientes_empresa")
    .select("*")
    .eq("rut", rut)
    .maybeSingle();
  if (!empresaData) notFound();
  const empresa = empresaData as ClienteEmpresa;

  // Defaults: mes actual
  const def = defaultMonthRange();
  const modo = sp.modo === "guia" ? "guia" : "fecha";
  const desde = sp.desde ?? def.desde;
  const hasta = sp.hasta ?? def.hasta;
  const idDesde = sp.idDesde ? Number(sp.idDesde) : undefined;
  const idHasta = sp.idHasta ? Number(sp.idHasta) : undefined;

  const pedidos = await getPedidosEmpresaParaFacturacion(rut, {
    desde: modo === "fecha" ? desde : undefined,
    hasta: modo === "fecha" ? hasta : undefined,
    idDesde: modo === "guia" ? idDesde : undefined,
    idHasta: modo === "guia" ? idHasta : undefined,
  });

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4">
        <BackButton />
      </div>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">
        Facturación — {empresa.alias || empresa.nombre}
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Elegí el rango de pedidos a facturar y revisá el consolidado.
      </p>

      <FacturacionClient
        empresa={empresa}
        pedidosConItems={pedidos}
        filtros={{ modo, desde, hasta, idDesde, idHasta }}
      />
    </div>
  );
}
