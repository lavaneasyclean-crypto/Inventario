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
import { IVA_RATE } from "@/lib/facturacion";
import { ahoraEnChile } from "@/lib/fecha";
import { formatCLP, formatFechaCorta } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * La guía que se entrega junto con la ropa de una empresa.
 *
 * Tiene dos formas, y la diferencia no es cosmética:
 *
 *  - **Guía** (por defecto): sin precios. Es el comprobante de qué se retiró,
 *    y quien la recibe en la empresa muchas veces es el de turno en la
 *    recepción, que no tiene por qué ver las tarifas. Importa el conteo y la
 *    firma.
 *  - **Valorizada** (`?valorizada=1`): con precio unitario, importe, neto, IVA
 *    y total. Es la que se entrega a quien paga.
 *
 * Si la empresa trabaja por bolsas, el detalle va agrupado por bolsa y no por
 * producto: así se cuenta bolsa por bolsa al entregar, que es como se devuelve.
 */
export default async function ImprimirPedidoEmpresaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ valorizada?: string }>;
}) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();

  const { valorizada: v } = await searchParams;
  const valorizada = v === "1";

  const data = await getPedidoEmpresaDetalle(id);
  if (!data) notFound();

  const { pedido, empresa, items } = data;
  const totalUnidades = items.reduce((s, it) => s + it.cantidad, 0);

  const neto = items.reduce((s, it) => s + (it.importe ?? 0), 0);
  const iva = Math.round(neto * IVA_RATE);
  const total = neto + iva;
  // Las guías cargadas desde el Access no traen precio: 7.970 líneas de las
  // 8.739 históricas. Valorizar esas daría un total mentiroso, así que se
  // avisa en el papel en vez de imprimir un número que no es.
  const sinPrecio = items.filter((it) => it.precio_unidad === null);

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
        <div className="flex gap-2">
          <Link
            href={`/empresas/pedidos/${id}/imprimir${valorizada ? "" : "?valorizada=1"}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            {valorizada ? "Ver sin precios" : "Ver con precios"}
          </Link>
          <BotonImprimir />
        </div>
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
                precio={
                  valorizada
                    ? it.precio_unidad === null
                      ? "—"
                      : formatCLP(it.precio_unidad)
                    : undefined
                }
                total={
                  valorizada
                    ? it.precio_unidad === null
                      ? "—"
                      : formatCLP(it.importe ?? 0)
                    : undefined
                }
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

        {valorizada && (
          <TicketSeccion>
            <TicketDato etiqueta="NETO" valor={formatCLP(neto)} siempre />
            <TicketDato
              etiqueta={`IVA ${Math.round(IVA_RATE * 100)}%`}
              valor={formatCLP(iva)}
              siempre
            />
            <TicketDato
              etiqueta="TOTAL"
              valor={<strong>{formatCLP(total)}</strong>}
              destacado
              siempre
            />
            {sinPrecio.length > 0 && (
              <p className="mt-1 text-[11px] font-bold">
                Faltan precios en {sinPrecio.length} prenda
                {sinPrecio.length === 1 ? "" : "s"}: el total está incompleto.
              </p>
            )}
          </TicketSeccion>
        )}

        <TicketCondiciones />
        <TicketFirma texto="Nombre, firma y fecha de quien recibe" />
      </Ticket>
    </div>
  );
}
