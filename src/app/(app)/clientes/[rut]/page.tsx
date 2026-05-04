import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  MapPin,
  Mail,
  Phone,
  Package,
  AlertCircle,
  Plus,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PedidoCard } from "@/components/dashboard/pedido-card";
import { getClienteDetalle } from "@/lib/data/clientes";
import { formatCLP, formatDateShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EditarCliente } from "./editar-cliente";

export const dynamic = "force-dynamic";

export default async function ClienteDetallePage({
  params,
}: {
  params: Promise<{ rut: string }>;
}) {
  const { rut: rutEncoded } = await params;
  const rut = decodeURIComponent(rutEncoded);

  const data = await getClienteDetalle(rut);
  if (!data) notFound();

  const { cliente, pedidos, totales } = data;
  const direccion = [cliente.calle, cliente.dpto, cliente.comuna]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4">
        <Link
          href="/clientes"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        >
          <ArrowLeft className="size-4" /> Volver a clientes
        </Link>
      </div>

      {/* Header con datos del cliente */}
      <header className="mb-6 rounded-xl border bg-background p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">
              {cliente.nombre || "(sin nombre)"}
            </h1>
            <p className="font-mono text-sm text-muted-foreground">
              {cliente.rut}
            </p>
          </div>
          <EditarCliente cliente={cliente} />
        </div>

        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          {direccion && (
            <div className="flex items-start gap-2 text-muted-foreground">
              <MapPin className="mt-0.5 size-4 shrink-0" />
              <span>{direccion}</span>
            </div>
          )}
          {cliente.telefono && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="size-4" />
              <a
                href={`tel:${cliente.telefono}`}
                className="hover:text-foreground hover:underline"
              >
                {cliente.telefono}
              </a>
            </div>
          )}
          {cliente.correo && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="size-4" />
              <a
                href={`mailto:${cliente.correo}`}
                className="hover:text-foreground hover:underline"
              >
                {cliente.correo}
              </a>
            </div>
          )}
        </div>
      </header>

      {/* Resumen */}
      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat
          icon={<Package className="size-5" />}
          label="Pedidos"
          value={String(totales.pedidos_count)}
          sub={
            pedidos[0]
              ? `Último: ${formatDateShort(pedidos[0].fecha_recepcion)}`
              : "Sin pedidos"
          }
        />
        <Stat
          label="Total gastado"
          value={formatCLP(totales.total_gastado)}
          sub="Histórico, sin anulados"
        />
        <Stat
          icon={
            totales.total_pendiente_pago > 0 ? (
              <AlertCircle className="size-5 text-amber-600" />
            ) : null
          }
          label="Pendiente de cobro"
          value={formatCLP(totales.total_pendiente_pago)}
          sub={
            totales.total_pendiente_pago > 0
              ? "Atención: hay pedidos sin pagar"
              : "Todo cobrado"
          }
          highlight={totales.total_pendiente_pago > 0}
        />
      </section>

      {/* Acciones */}
      <div className="mb-6">
        <Link
          href={`/pedidos/nuevo?rut=${encodeURIComponent(cliente.rut)}`}
          className={cn(buttonVariants({ size: "lg" }), "h-11 px-4 text-base")}
        >
          <Plus className="size-5" /> Nuevo pedido para {cliente.nombre || cliente.rut}
        </Link>
      </div>

      {/* Historial de pedidos */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Historial de pedidos</h2>
        {pedidos.length === 0 ? (
          <div className="rounded-xl border bg-background p-12 text-center text-sm text-muted-foreground">
            Este cliente todavía no tiene pedidos.
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {pedidos.map((p) => (
              <PedidoCard key={p.id} pedido={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
  highlight = false,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-background p-4",
        highlight && "border-amber-500/40 bg-amber-50 dark:bg-amber-950/20",
      )}
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}
