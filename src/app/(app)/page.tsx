import Link from "next/link";
import { Plus, ClipboardList, CheckCheck, AlertCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PedidoCard } from "@/components/dashboard/pedido-card";
import { getDashboardData } from "@/lib/data/pedidos";
import type { Pedido } from "@/lib/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function InicioPage() {
  const data = await getDashboardData();

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inicio</h1>
          <p className="text-sm text-muted-foreground">
            Resumen de pedidos del día
          </p>
        </div>
        <Link
          href="/pedidos/nuevo"
          className={cn(buttonVariants({ size: "lg" }), "h-11 px-4 text-base")}
        >
          <Plus className="size-5" /> Nuevo pedido
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Columna
          titulo="Pendientes"
          subtitulo="En proceso de lavado o planchado"
          icon={<ClipboardList className="size-5" />}
          total={data.totales.pendientes}
          mostrados={data.pendientes.length}
          pedidos={data.pendientes}
          emptyText="Nada en proceso. Todo al día."
        />
        <Columna
          titulo="Listos para retirar"
          subtitulo="Esperando que el cliente los venga a buscar"
          icon={<CheckCheck className="size-5" />}
          total={data.totales.listos}
          mostrados={data.listos.length}
          pedidos={data.listos}
          emptyText="Sin pedidos listos."
        />
        <Columna
          titulo="Por cobrar"
          subtitulo="Pedidos sin pagar (cualquier estado)"
          icon={<AlertCircle className="size-5" />}
          total={data.totales.porCobrar}
          mostrados={data.porCobrar.length}
          pedidos={data.porCobrar}
          emptyText="Todos cobrados."
        />
      </div>
    </div>
  );
}

function Columna({
  titulo,
  subtitulo,
  icon,
  total,
  mostrados,
  pedidos,
  emptyText,
}: {
  titulo: string;
  subtitulo: string;
  icon: React.ReactNode;
  total: number;
  mostrados: number;
  pedidos: Pedido[];
  emptyText: string;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-background p-4">
      <header className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="text-muted-foreground">{icon}</div>
          <div>
            <h2 className="text-base font-semibold">{titulo}</h2>
            <p className="text-xs text-muted-foreground">{subtitulo}</p>
          </div>
        </div>
        <div className="rounded-full bg-muted px-3 py-1 text-sm font-semibold tabular-nums">
          {total}
        </div>
      </header>

      {pedidos.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {emptyText}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {pedidos.map((p) => (
            <PedidoCard key={p.id} pedido={p} />
          ))}
          {total > mostrados && (
            <p className="pt-1 text-center text-xs text-muted-foreground">
              Mostrando {mostrados} de {total}.{" "}
              <Link href="/pedidos" className="underline">
                Ver todos
              </Link>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
