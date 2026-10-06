import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { BotonImprimir } from "@/components/boton-imprimir";
import {
  Ticket,
  TicketCondiciones,
  TicketDato,
  TicketEncabezado,
  TicketPrenda,
  TicketRenglones,
  TicketSeccion,
  TicketTablaCabecera,
  TicketTotal,
} from "@/components/ticket";
import { getPedidoDetalle } from "@/lib/data/pedidos";
import { ahoraEnChile } from "@/lib/fecha";
import { formatCLP, formatFechaCorta } from "@/lib/format";
import { FORMA_PAGO_LABELS, TIPO_SERVICIO_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * La guía que se le entrega al cliente de mostrador.
 *
 * Replica la que venía imprimiendo el Access: mismo orden de campos, misma
 * tabla de prendas y las mismas condiciones al pie. Es el papel con el que el
 * cliente vuelve a retirar, así que lo que salta a la vista es el número de
 * pedido y la fecha de entrega.
 */
export default async function ImprimirPedidoPage({
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
  const total = Number(pedido.total_venta);
  const abonado = Number(pedido.monto_abonado);
  const saldo = Math.max(0, total - abonado);

  const direccion = [pedido.direccion].filter(Boolean).join(", ");

  return (
    <div className="p-4 sm:p-6 print:p-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link
          href={`/pedidos/${id}`}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        >
          <ArrowLeft className="size-4" /> Volver al pedido
        </Link>
        <BotonImprimir />
      </div>

      <Ticket>
        <TicketEncabezado impresoEl={ahoraEnChile()} />

        <TicketSeccion>
          <TicketDato etiqueta="Pedido" valor={pedido.id} destacado />
          <TicketDato etiqueta="RUT" valor={pedido.rut_cliente} siempre />
          <TicketDato
            etiqueta="Nombre"
            valor={<strong>{pedido.nombre_cliente || "SIN REGISTRO"}</strong>}
            siempre
          />
          <TicketDato etiqueta="Contacto" valor={pedido.contacto} siempre />
          <TicketDato
            etiqueta="Recepción"
            valor={formatFechaCorta(pedido.fecha_recepcion)}
          />
          <TicketDato
            etiqueta="Pago"
            valor={pedido.pagado ? FORMA_PAGO_LABELS[pedido.forma_pago] : ""}
            siempre
          />
          <TicketDato
            etiqueta="Entrega"
            valor={
              pedido.fecha_entrega ? formatFechaCorta(pedido.fecha_entrega) : "—"
            }
            destacado
          />
          <TicketDato etiqueta="Dirección" valor={direccion} siempre />
          <TicketDato etiqueta="Abono" valor={formatCLP(abonado)} siempre />
        </TicketSeccion>

        <TicketSeccion sinLinea>
          <TicketTablaCabecera />
          {items.map((it) => (
            <TicketPrenda
              key={it.id}
              nombre={it.producto_nombre}
              categoria={TIPO_SERVICIO_LABELS[it.producto_tipo_servicio]}
              precio={formatCLP(it.precio_unidad)}
              cantidad={it.cantidad}
              total={formatCLP(it.importe)}
              detalle={it.detalle_prenda}
            />
          ))}
        </TicketSeccion>

        <TicketSeccion sinLinea>
          <TicketTotal etiqueta="Total Venta" valor={formatCLP(total)} grande />
          {saldo > 0 && abonado > 0 && (
            <TicketTotal etiqueta="Saldo por pagar" valor={formatCLP(saldo)} />
          )}
          <p className="mt-2 text-[11px]">Detalle</p>
          <TicketRenglones />
        </TicketSeccion>

        {pedido.notas && (
          <p className="whitespace-pre-wrap pt-1 text-[11px]">{pedido.notas}</p>
        )}

        <TicketCondiciones />
      </Ticket>
    </div>
  );
}
