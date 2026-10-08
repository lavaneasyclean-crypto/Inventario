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
  TicketFirma,
  TicketPrenda,
  TicketSeccion,
} from "@/components/ticket";
import { agruparPorBolsa } from "@/lib/bolsas";
import { getBolsasDeEmpresa, getPedidoEmpresaDetalle } from "@/lib/data/empresas";
import { ahoraEnChile } from "@/lib/fecha";
import { formatFechaCorta } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * La guía que se entrega junto con la ropa de una empresa.
 *
 * No lleva precios: es el comprobante de qué se retiró, y quien la recibe en
 * la empresa no tiene por qué ver las tarifas. Lo que importa es el conteo y
 * la firma al pie.
 *
 * Si la empresa trabaja por bolsas, el detalle va agrupado por bolsa y no por
 * producto: así se cuenta bolsa por bolsa al entregar, que es como se devuelve.
 */
export default async function ImprimirPedidoEmpresaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();

  const data = await getPedidoEmpresaDetalle(id);
  if (!data) notFound();

  const { pedido, empresa, items } = data;
  const totalUnidades = items.reduce((s, it) => s + it.cantidad, 0);

  const porBolsa = empresa?.usa_bolsas
    ? agruparPorBolsa(
        items,
        await getBolsasDeEmpresa(empresa.rut, { incluirInactivas: true }),
      )
    : null;

  return (
    <div className="p-4 sm:p-6 print:p-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link
          href={`/empresas/pedidos/${id}`}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        >
          <ArrowLeft className="size-4" /> Volver a la guía
        </Link>
        <BotonImprimir />
      </div>

      <Ticket>
        <TicketEncabezado impresoEl={ahoraEnChile()} />

        <TicketSeccion>
          <TicketDato etiqueta="Guía" valor={pedido.id} destacado />
          <TicketDato
            etiqueta="Empresa"
            valor={<strong>{empresa?.nombre ?? pedido.alias ?? "—"}</strong>}
            siempre
          />
          <TicketDato etiqueta="RUT" valor={empresa?.rut} siempre />
          <TicketDato etiqueta="Dirección" valor={empresa?.calle} />
          <TicketDato
            etiqueta="Retiro"
            valor={formatFechaCorta(pedido.fecha)}
            destacado
          />
          <TicketDato etiqueta="Detalle" valor={pedido.detalle} />
          {pedido.express && (
            <TicketDato etiqueta="Servicio" valor={<strong>EXPRESS</strong>} />
          )}
        </TicketSeccion>

        {porBolsa && porBolsa.bolsas.length > 0 ? (
          <>
            {porBolsa.bolsas.map((b) => (
              <TicketSeccion
                key={b.codigo}
                titulo={`Bolsa ${b.codigo}${b.nombre ? ` — ${b.nombre}` : ""} · ${b.totalPrendas} prendas`}
              >
                {b.lineas.map((l) => (
                  <TicketPrenda
                    key={`${l.producto_empresa_id}-${l.nombre}`}
                    nombre={l.nombre}
                    cantidad={l.cantidad}
                  />
                ))}
              </TicketSeccion>
            ))}
            {porBolsa.sinBolsa.length > 0 && (
              <TicketSeccion titulo="Sin bolsa">
                {porBolsa.sinBolsa.map((l, i) => (
                  <TicketPrenda key={i} nombre={l.nombre} cantidad={l.cantidad} />
                ))}
              </TicketSeccion>
            )}
          </>
        ) : (
          <TicketSeccion titulo={`Prendas · ${totalUnidades} unidades`}>
            {items.map((it) => (
              <TicketPrenda
                key={it.id}
                nombre={it.producto_empresa_nombre}
                cantidad={it.cantidad}
                detalle={it.detalle_prenda}
              />
            ))}
          </TicketSeccion>
        )}

        <TicketSeccion sinLinea>
          <TicketDato
            etiqueta="TOTAL"
            valor={`${totalUnidades} prendas${porBolsa ? ` en ${porBolsa.bolsas.length} bolsas` : ""}`}
            destacado
          />
        </TicketSeccion>

        <TicketCondiciones />
        <TicketFirma texto="Nombre, firma y fecha de quien recibe" />
      </Ticket>
    </div>
  );
}
