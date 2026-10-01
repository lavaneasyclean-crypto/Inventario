import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  Scale,
} from "lucide-react";
import { getDatosResumen } from "@/lib/data/finanzas";
import { hoyEnChile, rangoDelMes } from "@/lib/fecha";
import { esPeriodoValido, etiquetaPeriodo, resumirFacturas, resumirGastos } from "@/lib/finanzas";
import { formatCLP } from "@/lib/format";
import { CATEGORIA_GASTO_LABELS } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BadgeEstadoFactura, BadgeEstadoGasto } from "./badges";

export const dynamic = "force-dynamic";

export default async function ResumenFinanzasPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const sp = await searchParams;
  const hoy = hoyEnChile();
  const periodo = esPeriodoValido(sp.periodo) ? sp.periodo : hoy.slice(0, 7);
  const { desde, hasta } = rangoDelMes(`${periodo}-01`);

  const datos = await getDatosResumen(desde, hasta);

  // Lo pendiente se mide sobre todo lo abierto, no sobre el mes: la pregunta
  // "cuánto nos deben" no se responde mirando solo septiembre.
  const porCobrar = resumirFacturas(datos.facturasPendientes, hoy);
  const porPagar = resumirGastos(datos.gastosPendientes, hoy);

  // Lo del mes sí se mide por fecha de emisión del documento.
  const facturadoMes = datos.facturasDelPeriodo
    .filter((f) => f.estado !== "anulada")
    .reduce((s, f) => s + f.total, 0);
  const gastosMes = datos.gastosDelPeriodo.reduce((s, g) => s + g.monto, 0);
  const balance = facturadoMes - gastosMes;

  const vencidas = datos.facturasPendientes
    .filter((f) => f.fecha_vence && f.fecha_vence < hoy)
    .slice(0, 6);
  const gastosVencidos = datos.gastosPendientes
    .filter((g) => g.fecha_vence && g.fecha_vence < hoy)
    .slice(0, 6);

  return (
    <div className="flex flex-col gap-6">
      <form method="get" className="rounded-xl border bg-background p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="periodo">Mes</Label>
            <Input
              id="periodo"
              type="month"
              name="periodo"
              defaultValue={periodo}
              className="h-10"
            />
          </div>
          <Button type="submit" size="sm" className="h-10">
            Ver mes
          </Button>
        </div>
      </form>

      <div className="grid gap-4 sm:grid-cols-2">
        <Tarjeta
          titulo="Por cobrar"
          subtitulo="Facturas abiertas, de cualquier mes"
          icon={<ArrowDownLeft className="size-5" />}
          monto={porCobrar.pendiente.total}
          detalle={`${porCobrar.pendiente.cantidad} factura${porCobrar.pendiente.cantidad === 1 ? "" : "s"}`}
          alerta={
            porCobrar.vencido.total > 0
              ? `${formatCLP(porCobrar.vencido.total)} vencido`
              : null
          }
          href="/finanzas/facturas?estado=pendiente"
        />
        <Tarjeta
          titulo="Por pagar"
          subtitulo="Gastos sin pagar, de cualquier mes"
          icon={<ArrowUpRight className="size-5" />}
          monto={porPagar.pendiente.total}
          detalle={`${porPagar.pendiente.cantidad} gasto${porPagar.pendiente.cantidad === 1 ? "" : "s"}`}
          alerta={
            porPagar.vencido.total > 0
              ? `${formatCLP(porPagar.vencido.total)} vencido`
              : null
          }
          href="/finanzas/gastos?pago=pendiente"
        />
      </div>

      <section className="rounded-xl border bg-background p-4">
        <header className="mb-4 flex items-center gap-2">
          <Scale className="size-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">
            Movimiento de {etiquetaPeriodo(periodo)}
          </h2>
        </header>
        <div className="grid gap-4 sm:grid-cols-3">
          <Cifra
            etiqueta="Facturado"
            ayuda="Documentos emitidos este mes, con IVA"
            valor={facturadoMes}
          />
          <Cifra
            etiqueta="Gastos"
            ayuda="Gastos con fecha de este mes"
            valor={gastosMes}
          />
          <Cifra
            etiqueta="Diferencia"
            ayuda="Facturado menos gastos"
            valor={balance}
            destacar
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          La diferencia compara lo emitido contra lo gastado en el mes. No es
          caja: una factura emitida en septiembre puede cobrarse en octubre.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-background p-4">
          <header className="mb-3 flex items-center gap-2">
            <AlertTriangle className="size-4 text-destructive" />
            <h2 className="text-base font-semibold">Facturas vencidas</h2>
          </header>
          {vencidas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Ninguna factura vencida. Al día.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {vencidas.map((f) => (
                <li key={f.id}>
                  <Link
                    href={`/finanzas/facturas/${f.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {f.folio ? `Folio ${f.folio}` : `Factura #${f.id}`}
                      </div>
                      <BadgeEstadoFactura factura={f} hoy={hoy} />
                    </div>
                    <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
                      {formatCLP(f.total)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border bg-background p-4">
          <header className="mb-3 flex items-center gap-2">
            <CalendarClock className="size-4 text-destructive" />
            <h2 className="text-base font-semibold">Gastos vencidos</h2>
          </header>
          {gastosVencidos.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Ningún gasto vencido.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {gastosVencidos.map((g) => (
                <li
                  key={g.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {CATEGORIA_GASTO_LABELS[g.categoria]} — {g.descripcion}
                    </div>
                    <BadgeEstadoGasto gasto={g} hoy={hoy} />
                  </div>
                  <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
                    {formatCLP(g.monto)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Tarjeta({
  titulo,
  subtitulo,
  icon,
  monto,
  detalle,
  alerta,
  href,
}: {
  titulo: string;
  subtitulo: string;
  icon: React.ReactNode;
  monto: number;
  detalle: string;
  alerta: string | null;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-2 rounded-xl border bg-background p-4 transition-colors hover:bg-accent"
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <div>
          <h2 className="text-base font-semibold text-foreground">{titulo}</h2>
          <p className="text-xs">{subtitulo}</p>
        </div>
      </div>
      <p className="font-mono text-3xl font-bold tabular-nums">
        {formatCLP(monto)}
      </p>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">{detalle}</span>
        {alerta && (
          <span className="rounded bg-destructive/10 px-2 py-0.5 font-medium text-destructive">
            {alerta}
          </span>
        )}
      </div>
    </Link>
  );
}

function Cifra({
  etiqueta,
  ayuda,
  valor,
  destacar = false,
}: {
  etiqueta: string;
  ayuda: string;
  valor: number;
  destacar?: boolean;
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs font-medium text-muted-foreground">{etiqueta}</p>
      <p
        className={`font-mono text-xl font-semibold tabular-nums ${
          destacar && valor < 0 ? "text-destructive" : ""
        }`}
      >
        {formatCLP(valor)}
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{ayuda}</p>
    </div>
  );
}
