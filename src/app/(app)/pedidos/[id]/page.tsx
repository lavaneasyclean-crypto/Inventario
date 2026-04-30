import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BellRing, Phone, MapPin, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getPedidoDetalle } from "@/lib/data/pedidos";
import { formatCLP, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  ESTADO_LABELS,
  FORMA_PAGO_LABELS,
  TIPO_SERVICIO_LABELS,
} from "@/lib/types";
import { AccionesPedido } from "./acciones-pedido";

export const dynamic = "force-dynamic";

export default async function PedidoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();

  const data = await getPedidoDetalle(id);
  if (!data) notFound();

  const { pedido, items } = data;

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4">
        <Link
          href="/"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        >
          <ArrowLeft className="size-4" /> Volver
        </Link>
      </div>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-3xl font-semibold">#{pedido.id}</h1>
            <Badge
              variant={
                pedido.estado === "entregado"
                  ? "outline"
                  : pedido.estado === "anulado"
                    ? "destructive"
                    : pedido.estado === "listo"
                      ? "default"
                      : "secondary"
              }
            >
              {ESTADO_LABELS[pedido.estado]}
            </Badge>
            {pedido.pagado ? (
              <Badge variant="outline" className="border-green-600 text-green-700 dark:text-green-400">
                Pagado
              </Badge>
            ) : (
              <Badge variant="outline" className="border-amber-600 text-amber-700 dark:text-amber-400">
                Sin pagar
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Recibido el {formatDate(pedido.fecha_recepcion)}
          </p>
        </div>
      </header>

      {/* Info del cliente */}
      <section className="mb-6 grid gap-3 rounded-xl border bg-background p-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Cliente</h2>
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex items-center gap-2">
            <User className="size-4 text-muted-foreground" />
            <span className="font-medium">
              {pedido.nombre_cliente || "—"}
            </span>
            {pedido.rut_cliente && (
              <span className="text-muted-foreground">
                · {pedido.rut_cliente}
              </span>
            )}
          </div>
          {pedido.contacto && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="size-4" /> {pedido.contacto}
            </div>
          )}
          {pedido.direccion && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="size-4" /> {pedido.direccion}
            </div>
          )}
          {pedido.aviso_enviado && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <BellRing className="size-4" /> Aviso enviado al cliente
            </div>
          )}
        </div>
      </section>

      {/* Items */}
      <section className="mb-6 rounded-xl border bg-background">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Items ({items.length})
          </h2>
        </header>
        {items.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            Este pedido no tiene items registrados.
          </p>
        ) : (
          <ul className="divide-y">
            {items.map((it) => (
              <li key={it.id} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <div className="font-medium">
                      {it.cantidad} ×{" "}
                      <span>{it.producto_nombre}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {TIPO_SERVICIO_LABELS[it.producto_tipo_servicio]} ·{" "}
                      {formatCLP(it.precio_unidad)} c/u
                    </div>
                  </div>
                  <div className="font-mono text-sm font-semibold tabular-nums">
                    {formatCLP(it.importe)}
                  </div>
                </div>
                {it.detalle_prenda && (
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">
                    {it.detalle_prenda}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        <footer className="flex items-center justify-between border-t bg-muted/40 px-4 py-3">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="font-mono text-lg font-semibold tabular-nums">
            {formatCLP(pedido.total_venta)}
          </span>
        </footer>
      </section>

      {/* Pago */}
      {pedido.pagado && (
        <section className="mb-6 rounded-xl border bg-background p-4 text-sm">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
            Pago
          </h2>
          <dl className="grid grid-cols-2 gap-y-1">
            <dt className="text-muted-foreground">Forma de pago</dt>
            <dd className="text-right font-medium">
              {FORMA_PAGO_LABELS[pedido.forma_pago]}
            </dd>
            <dt className="text-muted-foreground">Monto abonado</dt>
            <dd className="text-right font-medium">
              {formatCLP(pedido.monto_abonado)}
            </dd>
            <dt className="text-muted-foreground">Fecha de pago</dt>
            <dd className="text-right font-medium">
              {formatDate(pedido.fecha_pago)}
            </dd>
          </dl>
        </section>
      )}

      {/* Acciones */}
      <section className="rounded-xl border bg-background p-4">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          Acciones
        </h2>
        <AccionesPedido pedido={pedido} />
      </section>
    </div>
  );
}
