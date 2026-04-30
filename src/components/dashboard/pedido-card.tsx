import Link from "next/link";
import { CheckCircle2, AlertCircle, BellRing } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCLP, formatDate, diasDesde } from "@/lib/format";
import type { Pedido } from "@/lib/types";
import { ESTADO_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";

const estadoVariant: Record<Pedido["estado"], "default" | "secondary" | "outline" | "destructive"> = {
  recibido: "secondary",
  listo: "default",
  entregado: "outline",
  anulado: "destructive",
};

export function PedidoCard({ pedido }: { pedido: Pedido }) {
  const dias = diasDesde(pedido.fecha_recepcion);

  return (
    <Link
      href={`/pedidos/${pedido.id}`}
      className="block rounded-lg border bg-card p-4 transition-colors hover:bg-accent active:bg-accent/80"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-mono text-lg font-semibold">#{pedido.id}</div>
        <Badge variant={estadoVariant[pedido.estado]}>
          {ESTADO_LABELS[pedido.estado]}
        </Badge>
      </div>

      <div className="mt-1 line-clamp-1 text-sm font-medium">
        {pedido.nombre_cliente || pedido.rut_cliente || "Sin cliente"}
      </div>

      <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
        <span>{formatDate(pedido.fecha_recepcion)}</span>
        <span className="font-semibold text-foreground">
          {formatCLP(pedido.total_venta)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {pedido.pagado ? (
          <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400">
            <CheckCircle2 className="size-3.5" /> Pagado
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
            <AlertCircle className="size-3.5" /> Sin pagar
          </span>
        )}
        {pedido.aviso_enviado && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <BellRing className="size-3.5" /> Avisado
          </span>
        )}
        {dias >= 7 && pedido.estado !== "entregado" && (
          <span
            className={cn(
              "ml-auto rounded px-1.5 py-0.5 text-xs font-medium",
              dias >= 30 ? "bg-destructive/15 text-destructive" : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
            )}
          >
            {dias} días
          </span>
        )}
      </div>
    </Link>
  );
}
