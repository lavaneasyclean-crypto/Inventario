import { Badge } from "@/components/ui/badge";
import {
  diasHastaVencer,
  estadoMostradoFactura,
  estadoVencimiento,
  saldoFactura,
} from "@/lib/finanzas";
import { formatCLP } from "@/lib/format";
import type { Factura, Gasto } from "@/lib/types";

/**
 * El estado que se muestra no es el que está guardado: "vencida" sale de
 * comparar el vencimiento con hoy. `hoy` llega por props y no se lee acá para
 * que el servidor y el cliente pinten lo mismo, y para que sea el día en
 * Chile y no el del reloj de Netlify.
 */

function textoVencimiento(fechaVence: string | null, hoy: string): string {
  const dias = diasHastaVencer(fechaVence, hoy);
  if (dias === null) return "";
  if (dias < 0) {
    const d = Math.abs(dias);
    return `hace ${d} día${d === 1 ? "" : "s"}`;
  }
  if (dias === 0) return "vence hoy";
  return `en ${dias} día${dias === 1 ? "" : "s"}`;
}

export function BadgeEstadoFactura({
  factura,
  hoy,
}: {
  factura: Pick<Factura, "estado" | "fecha_vence" | "total" | "monto_pagado">;
  hoy: string;
}) {
  const estado = estadoMostradoFactura(factura, hoy);
  const saldo = saldoFactura(factura);

  if (estado === "pagada") {
    return (
      <Badge className="bg-emerald-600 text-white dark:bg-emerald-700">
        Pagada
      </Badge>
    );
  }
  if (estado === "anulada") {
    return <Badge variant="destructive">Anulada</Badge>;
  }
  if (estado === "vencida") {
    return (
      <Badge variant="destructive">
        Vencida {textoVencimiento(factura.fecha_vence, hoy)}
        {factura.monto_pagado > 0 && ` · falta ${formatCLP(saldo)}`}
      </Badge>
    );
  }
  if (estado === "parcial") {
    return (
      <Badge className="bg-amber-500 text-white dark:bg-amber-600">
        Falta {formatCLP(saldo)}
      </Badge>
    );
  }
  if (estado === "por_vencer") {
    return (
      <Badge className="bg-amber-500 text-white dark:bg-amber-600">
        Vence {textoVencimiento(factura.fecha_vence, hoy)}
        {factura.monto_pagado > 0 && ` · falta ${formatCLP(saldo)}`}
      </Badge>
    );
  }
  return <Badge variant="secondary">Por cobrar</Badge>;
}

export function BadgeEstadoGasto({
  gasto,
  hoy,
}: {
  gasto: Pick<Gasto, "pagado" | "fecha_vence">;
  hoy: string;
}) {
  if (gasto.pagado) {
    return (
      <Badge className="bg-emerald-600 text-white dark:bg-emerald-700">
        Pagado
      </Badge>
    );
  }
  const v = estadoVencimiento(gasto.fecha_vence, hoy);
  if (v === "vencido") {
    return (
      <Badge variant="destructive">
        Vencido {textoVencimiento(gasto.fecha_vence, hoy)}
      </Badge>
    );
  }
  if (v === "por_vencer") {
    return (
      <Badge className="bg-amber-500 text-white dark:bg-amber-600">
        Vence {textoVencimiento(gasto.fecha_vence, hoy)}
      </Badge>
    );
  }
  return <Badge variant="secondary">Por pagar</Badge>;
}

/** La factura de recargo se distingue a simple vista de la normal. */
export function BadgeTipoFactura({ tipo }: { tipo: "normal" | "express" }) {
  if (tipo !== "express") return null;
  return (
    <Badge className="bg-violet-600 text-white dark:bg-violet-700">
      Express
    </Badge>
  );
}
