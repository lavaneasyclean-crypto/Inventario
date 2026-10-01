import Link from "next/link";
import { Building2, Calendar, FileText } from "lucide-react";
import {
  getEmpresasParaSelector,
  searchFacturasConTexto,
  type FacturasFilter,
} from "@/lib/data/finanzas";
import { hoyEnChile } from "@/lib/fecha";
import { resumirFacturas, saldoFactura } from "@/lib/finanzas";
import { formatCLP } from "@/lib/format";
import type { EstadoFactura, TipoFactura } from "@/lib/types";
import { BadgeEstadoFactura, BadgeTipoFactura } from "../badges";
import { FiltrosFacturas } from "./filtros-facturas";
import { NuevaFacturaButton } from "./nueva-factura";

export const dynamic = "force-dynamic";

const ESTADOS = new Set<EstadoFactura | "todos">([
  "todos",
  "pendiente",
  "pagada",
  "anulada",
]);
const TIPOS = new Set<TipoFactura | "todos">(["todos", "normal", "express"]);

function parseFiltros(
  params: Record<string, string | string[] | undefined>,
): FacturasFilter {
  const get = (k: string) =>
    typeof params[k] === "string" ? (params[k] as string) : undefined;

  const estado = get("estado");
  const tipo = get("tipo");

  return {
    q: get("q"),
    rut: get("rut"),
    estado: ESTADOS.has(estado as EstadoFactura) ? (estado as EstadoFactura) : "todos",
    tipo: TIPOS.has(tipo as TipoFactura) ? (tipo as TipoFactura) : "todos",
    desde: get("desde") || undefined,
    hasta: get("hasta") || undefined,
  };
}

export default async function FacturasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filtros = parseFiltros(params);
  const hoy = hoyEnChile();

  const [facturas, empresas] = await Promise.all([
    searchFacturasConTexto(filtros),
    getEmpresasParaSelector(),
  ]);

  const resumen = resumirFacturas(facturas, hoy);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {facturas.length === 0
            ? "Sin facturas para este filtro."
            : `${facturas.length} factura${facturas.length === 1 ? "" : "s"} · ${formatCLP(resumen.pendiente.total)} por cobrar`}
        </p>
        <NuevaFacturaButton empresas={empresas} hoy={hoy} />
      </div>

      <FiltrosFacturas initial={filtros} />

      {facturas.length === 0 ? (
        <div className="rounded-xl border bg-background p-12 text-center">
          <p className="text-base font-medium">Sin facturas</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Las facturas se registran desde{" "}
            <Link href="/empresas" className="underline">
              la ficha de cada empresa
            </Link>
            , en &ldquo;Facturar período&rdquo;. También podés cargar una a
            mano.
          </p>
        </div>
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {facturas.map((f) => (
            <li key={f.id}>
              <Link
                href={`/finanzas/facturas/${f.id}`}
                className={`block rounded-xl border p-4 transition-colors hover:bg-accent ${
                  f.estado === "anulada" ? "opacity-60" : "bg-background"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 font-mono text-base font-semibold">
                        <FileText className="size-4 text-muted-foreground" />
                        {f.folio ? `N° ${f.folio}` : `sin folio (#${f.id})`}
                      </span>
                      <BadgeTipoFactura tipo={f.tipo} />
                    </div>
                    <span className="inline-flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                      <Building2 className="size-3.5 shrink-0" />
                      {f.empresa_alias || f.empresa_nombre}
                    </span>
                  </div>
                  <span className="shrink-0 text-right">
                    <span className="block font-mono text-lg font-bold tabular-nums">
                      {formatCLP(f.total)}
                    </span>
                    {f.estado === "pendiente" && f.monto_pagado > 0 && (
                      <span className="block text-xs text-muted-foreground">
                        pagado {formatCLP(f.monto_pagado)} · falta{" "}
                        <strong className="text-foreground">
                          {formatCLP(saldoFactura(f))}
                        </strong>
                      </span>
                    )}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="size-3.5" />
                    Emitida {f.fecha}
                    {f.periodo_desde && f.periodo_hasta && (
                      <>
                        {" · período "}
                        {f.periodo_desde} a {f.periodo_hasta}
                      </>
                    )}
                  </span>
                  <BadgeEstadoFactura factura={f} hoy={hoy} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
