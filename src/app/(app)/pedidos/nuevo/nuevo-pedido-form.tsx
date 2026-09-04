"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { mediodiaChile } from "@/lib/fecha";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Cliente, FormaPago, Producto } from "@/lib/types";
import { FORMA_PAGO_LABELS } from "@/lib/types";
import { SelectorCliente } from "./selector-cliente";
import {
  SelectorItems,
  importeDeItem,
  itemsSinMedida,
  parseMedida,
  type ItemDraft,
} from "./selector-items";
import { crearPedido } from "./actions";

export function NuevoPedidoForm({
  productos,
  clienteInicial,
}: {
  productos: Producto[];
  clienteInicial: Cliente | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cliente, setCliente] = useState<Cliente | null>(clienteInicial);
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [fechaEntrega, setFechaEntrega] = useState("");
  const [notas, setNotas] = useState("");
  const [pagar, setPagar] = useState(false);
  const [formaPago, setFormaPago] = useState<FormaPago>("efectivo");

  const total = items.reduce((s, it) => s + (importeDeItem(it) ?? 0), 0);
  // Una alfombra sin medidas no tiene precio: no se puede cerrar el pedido.
  const sinMedida = itemsSinMedida(items);
  const canSubmit =
    !!cliente && items.length > 0 && sinMedida.length === 0 && !loading;

  const handleSubmit = async () => {
    if (!cliente) {
      setError("Seleccioná o creá un cliente.");
      return;
    }
    if (items.length === 0) {
      setError("Agregá al menos un item.");
      return;
    }
    if (sinMedida.length > 0) {
      setError(
        `Falta la medida de: ${sinMedida.map((it) => it.nombre).join(", ")}.`,
      );
      return;
    }
    setError(null);
    setLoading(true);

    try {
      console.log("[nuevo-pedido] enviando crearPedido");
      const res = await crearPedido({
        rut_cliente:    cliente.rut,
        nombre_cliente: cliente.nombre,
        contacto:       cliente.telefono,
        direccion:      [cliente.calle, cliente.dpto, cliente.comuna]
          .filter(Boolean)
          .join(", ") || null,
        fecha_entrega:  fechaEntrega ? mediodiaChile(fechaEntrega) : null,
        notas:          notas.trim() || null,
        pagado:         pagar,
        forma_pago:     pagar ? formaPago : "no_pago",
        items: items.map((it) => ({
          producto_id:   it.producto_id,
          nombre:        it.nombre,
          tipo_servicio: it.tipo_servicio,
          unidad_cobro:  it.unidad_cobro,
          ancho:         parseMedida(it.ancho),
          largo:         parseMedida(it.largo),
          precio_unidad: it.precio_unidad,
          cantidad:      it.cantidad,
          detalle:       it.detalle.trim() || null,
        })),
      });
      console.log("[nuevo-pedido] resultado:", res);

      // Liberamos el botón antes de navegar para que el usuario nunca lo
      // vea atascado. La navegación a /pedidos/[id] usará su propio loading.
      setLoading(false);

      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/pedidos/${res.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[nuevo-pedido] excepcion:", err);
      setError(
        `No se pudo crear el pedido: ${msg}. Refrescá la página y volvé a intentar.`,
      );
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Section title="1. Cliente">
        <SelectorCliente
          cliente={cliente}
          onSelect={setCliente}
          onClear={() => setCliente(null)}
        />
      </Section>

      <Section title="2. Items">
        <SelectorItems
          productos={productos}
          items={items}
          onChange={setItems}
        />
      </Section>

      <Section title="3. Detalles">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fecha_entrega">Fecha de entrega prometida</Label>
            <Input
              id="fecha_entrega"
              type="date"
              value={fechaEntrega}
              onChange={(e) => setFechaEntrega(e.target.value)}
              className="h-10"
            />
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-1.5">
          <Label htmlFor="notas">Notas internas (opcional)</Label>
          <Input
            id="notas"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Cualquier observación general del pedido"
            className="h-10"
          />
        </div>
      </Section>

      <Section title="4. Pago">
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-3 text-base">
            <input
              type="checkbox"
              checked={pagar}
              onChange={(e) => setPagar(e.target.checked)}
              className="size-5"
            />
            <span>Cobrar ahora</span>
          </label>

          {pagar && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="forma_pago">Forma de pago</Label>
              <Select
                value={formaPago}
                onValueChange={(v) => setFormaPago(v as FormaPago)}
              >
                <SelectTrigger id="forma_pago" className="h-10 max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["efectivo", "transferencia", "redcompra"] as const).map(
                    (f) => (
                      <SelectItem key={f} value={f}>
                        {FORMA_PAGO_LABELS[f]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </Section>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t bg-background/95 p-4 backdrop-blur sm:-mx-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          {items.length === 0
            ? "Sin items"
            : `${items.length} item${items.length === 1 ? "" : "s"} · Total ${total.toLocaleString(
                "es-CL",
                { style: "currency", currency: "CLP", maximumFractionDigits: 0 },
              )}`}
        </div>
        <Button
          type="button"
          size="lg"
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="h-11 px-6 text-base"
        >
          <Check className="size-5" />
          {loading ? "Creando…" : "Crear pedido"}
        </Button>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-background p-4">
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}
