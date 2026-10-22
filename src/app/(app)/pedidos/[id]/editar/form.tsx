"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { BotonGuardar } from "@/components/boton-guardar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCLP } from "@/lib/format";
import { importeLinea } from "@/lib/medidas";
import type { Pedido, PedidoItem, Producto } from "@/lib/types";
import {
  SelectorItems,
  parseMedida,
  type ItemDraft,
} from "../../nuevo/selector-items";
import { actualizarPedido } from "../actions";

/** Lo guardado se vuelve borrador: las medidas pasan a texto para poder tipear. */
function aBorrador(it: PedidoItem): ItemDraft {
  return {
    key: `g${it.id}`,
    producto_id: it.producto_id ?? "",
    nombre: it.producto_nombre,
    tipo_servicio: it.producto_tipo_servicio,
    unidad_cobro: it.unidad_cobro ?? "unidad",
    precio_unidad: Number(it.precio_unidad ?? 0),
    cantidad: it.cantidad,
    ancho: it.ancho === null ? "" : String(it.ancho).replace(".", ","),
    largo: it.largo === null ? "" : String(it.largo).replace(".", ","),
    detalle: it.detalle_prenda ?? "",
  };
}

/** "2026-10-19" para el input date, desde lo que hay guardado. */
function aDiaInput(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-CA", {
    timeZone: "America/Santiago",
  });
}

export function EditarPedidoForm({
  pedido,
  items: itemsGuardados,
  productos,
}: {
  pedido: Pedido;
  items: PedidoItem[];
  productos: Producto[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<ItemDraft[]>(
    itemsGuardados.map(aBorrador),
  );
  const [fechaEntrega, setFechaEntrega] = useState(
    aDiaInput(pedido.fecha_entrega),
  );
  const [notas, setNotas] = useState(pedido.notas ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = items.reduce((s, it) => {
    const i = importeLinea({
      unidad: it.unidad_cobro,
      precioUnidad: it.precio_unidad,
      cantidad: it.cantidad,
      ancho: parseMedida(it.ancho),
      largo: parseMedida(it.largo),
    });
    return s + (i ?? 0);
  }, 0);

  const cambioElTotal = Number(pedido.total_venta) !== total;

  const guardar = async () => {
    setError(null);
    if (items.length === 0) {
      setError("El pedido necesita al menos un item.");
      return;
    }

    setGuardando(true);
    const res = await actualizarPedido(pedido.id, {
      version: pedido.updated_at,
      fecha_entrega: fechaEntrega || null,
      notas: notas.trim() || null,
      items: items.map((it) => ({
        producto_id: it.producto_id,
        nombre: it.nombre,
        tipo_servicio: it.tipo_servicio,
        unidad_cobro: it.unidad_cobro,
        ancho: parseMedida(it.ancho),
        largo: parseMedida(it.largo),
        precio_unidad: it.precio_unidad,
        cantidad: it.cantidad,
        detalle: it.detalle.trim() || null,
      })),
    });
    setGuardando(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast.success("Pedido actualizado");
    router.push(`/pedidos/${pedido.id}`);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <section className="rounded-xl border bg-background p-4">
          <h2 className="mb-3 text-base font-semibold">Items</h2>
          <SelectorItems
            productos={productos}
            items={items}
            onChange={setItems}
          />
        </section>
      </div>

      <div className="flex w-full flex-col gap-6 lg:sticky lg:top-20 lg:w-[22rem] lg:shrink-0">
        <section className="rounded-xl border bg-background p-4">
          <h2 className="mb-3 text-base font-semibold">Detalles</h2>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fecha_entrega">Fecha de entrega</Label>
            <Input
              id="fecha_entrega"
              type="date"
              value={fechaEntrega}
              onChange={(e) => setFechaEntrega(e.target.value)}
              className="h-10"
            />
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            <Label htmlFor="notas">Notas internas</Label>
            <Input
              id="notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Observaciones del pedido"
              className="h-10"
            />
          </div>
        </section>

        {pedido.pagado && cambioElTotal && (
          <div className="flex gap-2 rounded-xl border border-amber-500/40 bg-amber-50 p-3 text-sm dark:bg-amber-950/20">
            <TriangleAlert className="size-4 shrink-0 text-amber-700 dark:text-amber-400" />
            <div className="text-amber-900 dark:text-amber-200">
              Este pedido ya está cobrado por{" "}
              <strong>{formatCLP(Number(pedido.monto_abonado))}</strong> y el
              total pasa a ser <strong>{formatCLP(total)}</strong>. Revisá el
              cobro después de guardar.
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="rounded-xl border bg-background p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-xl font-semibold tabular-nums">
              {formatCLP(total)}
            </span>
          </div>
          <BotonGuardar
            size="lg"
            pending={guardando}
            faltan={[items.length === 0 && "al menos un item"]}
            onClick={guardar}
            className="h-11 w-full text-base"
          >
            <Check className="size-5" />
            {guardando ? "Guardando…" : "Guardar cambios"}
          </BotonGuardar>
        </div>
      </div>
    </div>
  );
}
