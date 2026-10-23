import Link from "next/link";
import { AlertTriangle, CalendarClock, CalendarDays, HelpCircle } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { BotonImprimir } from "@/components/boton-imprimir";
import { buttonVariants } from "@/components/ui/button";
import { getResumenDelDia } from "@/lib/data/resumen";
import { hoyEnChile } from "@/lib/fecha";
import { formatDateShort } from "@/lib/format";
import { contarPrendas, VENTANA_DIAS, type PedidoConItems } from "@/lib/resumen";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ResumenPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { tipo } = await searchParams;
  const soloPlanchado = tipo === "planchado";

  const hoy = hoyEnChile();
  const resumen = await getResumenDelDia(hoy, { soloPlanchado });

  const grupos = [
    {
      clave: "atrasados",
      titulo: "Atrasados",
      icono: AlertTriangle,
      filas: resumen.atrasados,
      urgente: true,
      vacio: "Nada atrasado.",
    },
    {
      clave: "hoy",
      titulo: "Para hoy",
      icono: CalendarDays,
      filas: resumen.hoy,
      urgente: false,
      vacio: "Nada comprometido para hoy.",
    },
    {
      clave: "manana",
      titulo: "Para mañana",
      icono: CalendarClock,
      filas: resumen.manana,
      urgente: false,
      vacio: "Nada comprometido para mañana.",
    },
    {
      clave: "sinFecha",
      titulo: "Sin fecha de entrega",
      icono: HelpCircle,
      filas: resumen.sinFecha,
      urgente: false,
      vacio: "Todos tienen fecha.",
    },
  ];

  const totalPedidos = grupos.reduce((s, g) => s + g.filas.length, 0);

  return (
    /* En pantalla se lee ancho; en papel sale por la misma térmica de 5
       pulgadas que las guías, así que toma su ancho y su cuerpo de letra.
       Ver components/ticket.tsx, que define el formato. */
    <div className="p-4 sm:p-6 print:max-w-[119mm] print:p-0 print:text-[12px] print:leading-tight print:text-black">
      <div className="print:hidden">
        <BackButton />
      </div>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight print:text-base">
            {soloPlanchado ? "Resumen de planchado" : "Resumen del día"}
          </h1>
          <p className="text-sm text-muted-foreground print:text-[11px] print:text-black">
            {formatDateShort(hoy)} · {totalPedidos} pedido
            {totalPedidos === 1 ? "" : "s"} ·{" "}
            {contarPrendas(grupos.flatMap((g) => g.filas))} prendas
            {soloPlanchado ? " para planchar" : ""}
          </p>
        </div>

        <div className="flex gap-2 print:hidden">
          <Link
            href={soloPlanchado ? "/pedidos/resumen" : "/pedidos/resumen?tipo=planchado"}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            {soloPlanchado ? "Ver todo" : "Solo planchado"}
          </Link>
          <BotonImprimir />
        </div>
      </div>

      <div className="flex flex-col gap-5 print:gap-3">
        {grupos.map((g) => (
          <Grupo
            key={g.clave}
            titulo={g.titulo}
            icono={g.icono}
            filas={g.filas}
            urgente={g.urgente}
            vacio={g.vacio}
            hoy={hoy}
          />
        ))}
      </div>

      {resumen.viejos > 0 && (
        <p className="mt-6 border-t pt-3 text-xs text-muted-foreground print:text-black">
          Además hay <strong>{resumen.viejos}</strong> pedidos en proceso de
          hace más de {VENTANA_DIAS} días, que no se listan acá para no tapar
          el trabajo del día.{" "}
          <Link
            href="/pedidos?estado=recibido"
            className="underline print:hidden"
          >
            Verlos en Pedidos
          </Link>
        </p>
      )}
    </div>
  );
}

function Grupo({
  titulo,
  icono: Icono,
  filas,
  urgente,
  vacio,
  hoy,
}: {
  titulo: string;
  icono: typeof AlertTriangle;
  filas: PedidoConItems[];
  urgente: boolean;
  vacio: string;
  hoy: string;
}) {
  return (
    <section className="break-inside-avoid">
      <h2
        className={cn(
          "mb-2 flex items-center gap-2 border-b border-black pb-1 text-base font-semibold print:mb-1 print:text-[13px]",
          urgente && filas.length > 0 && "text-destructive print:text-black",
        )}
      >
        <Icono className="size-4 print:hidden" aria-hidden />
        {titulo}
        <span className="font-normal text-muted-foreground print:text-[11px] print:text-black">
          · {filas.length} pedido{filas.length === 1 ? "" : "s"} ·{" "}
          {contarPrendas(filas)} prendas
        </span>
      </h2>

      {filas.length === 0 ? (
        <p className="py-1 text-sm text-muted-foreground print:text-black">{vacio}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {filas.map(({ pedido, items }) => (
            <li
              key={pedido.id}
              className="break-inside-avoid py-2 text-sm print:py-1 print:text-[11px]"
            >
              <div className="flex flex-wrap items-baseline gap-x-3">
                {/* Una casilla para marcar a mano: el papel se trabaja
                    tachando, no leyendo. */}
                <span
                  className="hidden size-3.5 shrink-0 border border-black print:inline-block"
                  aria-hidden
                />
                <span className="font-mono font-semibold">#{pedido.id}</span>
                <span className="font-medium">
                  {pedido.nombre_cliente || "Sin nombre"}
                </span>
                {pedido.contacto && (
                  <span className="text-muted-foreground print:text-black">
                    {pedido.contacto}
                  </span>
                )}
                <Entrega fecha={pedido.fecha_entrega} hoy={hoy} />
              </div>

              <div className="mt-0.5 pl-1 text-muted-foreground print:text-[11px] print:text-black">
                {items.length === 0
                  ? "Sin items cargados"
                  : items
                      .map(
                        (i) =>
                          `${i.cantidad}× ${i.producto_nombre}${
                            i.detalle_prenda ? ` (${i.detalle_prenda})` : ""
                          }`,
                      )
                      .join(" · ")}
              </div>

              {pedido.notas && (
                <div className="mt-0.5 pl-1 text-xs italic text-muted-foreground print:text-[10px] print:text-black">
                  {pedido.notas}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Cuántos días lleva vencida la entrega, que es lo que decide la urgencia. */
function Entrega({ fecha, hoy }: { fecha: string | null; hoy: string }) {
  if (!fecha) return null;

  const dia = new Date(fecha).toLocaleDateString("en-CA", {
    timeZone: "America/Santiago",
  });
  if (dia >= hoy) {
    return (
      <span className="text-muted-foreground print:text-black">
        entrega {formatDateShort(fecha)}
      </span>
    );
  }

  const dias = Math.round(
    (new Date(`${hoy}T00:00:00Z`).getTime() -
      new Date(`${dia}T00:00:00Z`).getTime()) /
      86_400_000,
  );
  return (
    <span className="font-medium text-destructive print:text-black print:underline">
      vencido hace {dias} día{dias === 1 ? "" : "s"}
    </span>
  );
}
