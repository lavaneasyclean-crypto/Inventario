"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Search, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCLP } from "@/lib/format";
import type {
  PedidoEmpresa,
  PedidoEmpresaItem,
  ProductoEmpresaAdquirido,
} from "@/lib/types";
import { actualizarPedidoEmpresa } from "../actions";

interface ItemDraft {
  key: string;
  producto_empresa_id: string;
  nombre: string;
  precio_unidad: number | null;
  cantidad: number;
  detalle: string;
}

export function EditarPedidoEmpresaForm({
  pedido,
  items: itemsIniciales,
  productos,
}: {
  pedido: PedidoEmpresa;
  items: PedidoEmpresaItem[];
  productos: ProductoEmpresaAdquirido[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fecha, setFecha] = useState(() => pedido.fecha.slice(0, 10));
  const [detalle, setDetalle] = useState(pedido.detalle ?? "");
  const [items, setItems] = useState<ItemDraft[]>(() =>
    itemsIniciales.map((it) => ({
      key: crypto.randomUUID(),
      producto_empresa_id: it.producto_empresa_id ?? "",
      nombre: it.producto_empresa_nombre,
      precio_unidad: it.precio_unidad,
      cantidad: it.cantidad,
      detalle: it.detalle_prenda ?? "",
    })),
  );
  const [productoQuery, setProductoQuery] = useState("");
  const [productoFocused, setProductoFocused] = useState(false);
  const productoInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = productoQuery.trim().toLowerCase();
    if (!q) return productos;
    return productos.filter((p) =>
      (p.nombre + " " + p.producto_empresa_id).toLowerCase().includes(q),
    );
  }, [productos, productoQuery]);
  const showDropdown = productoFocused || productoQuery.trim().length > 0;

  const totalUnidades = items.reduce((s, it) => s + it.cantidad, 0);
  const totalImporte = items.reduce(
    (s, it) => s + (it.precio_unidad ?? 0) * it.cantidad,
    0,
  );
  const algunSinPrecio = items.some((it) => it.precio_unidad === null);
  const canSubmit = items.length > 0 && !loading;

  const addItem = (p: ProductoEmpresaAdquirido) => {
    setItems((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        producto_empresa_id: p.producto_empresa_id,
        nombre: p.nombre,
        precio_unidad: p.precio,
        cantidad: 1,
        detalle: "",
      },
    ]);
    setProductoQuery("");
    setProductoFocused(false);
    productoInputRef.current?.blur();
  };

  const updateItem = (key: string, patch: Partial<ItemDraft>) =>
    setItems((prev) =>
      prev.map((it) => (it.key === key ? { ...it, ...patch } : it)),
    );

  const removeItem = (key: string) =>
    setItems((prev) => prev.filter((it) => it.key !== key));

  const handleSubmit = async () => {
    if (items.length === 0) {
      setError("Agregá al menos un item");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await actualizarPedidoEmpresa(pedido.id, {
        fecha: new Date(`${fecha}T12:00:00-03:00`).toISOString(),
        detalle: detalle.trim() || null,
        items: items.map((it) => ({
          producto_empresa_id: it.producto_empresa_id,
          nombre: it.nombre,
          precio_unidad: it.precio_unidad,
          cantidad: it.cantidad,
          detalle: it.detalle.trim() || null,
        })),
      });
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/empresas/pedidos/${pedido.id}`);
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Section title="Items">
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-muted/30 p-4 text-center text-sm text-muted-foreground">
            Agregá al menos un item para guardar el pedido.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((it) => (
              <li key={it.key} className="rounded-lg border bg-background p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="font-medium">{it.nombre}</div>
                    <div className="text-xs text-muted-foreground">
                      {it.precio_unidad === null ? (
                        <span className="text-amber-700 dark:text-amber-400">
                          ⚠ Sin precio
                        </span>
                      ) : (
                        `${formatCLP(it.precio_unidad)} c/u`
                      )}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeItem(it.key)}
                    aria-label="Quitar item"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
                <div className="mt-2 grid grid-cols-[100px_1fr_auto] items-end gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Cantidad
                    </label>
                    <Input
                      type="number"
                      min={1}
                      value={it.cantidad}
                      onChange={(e) =>
                        updateItem(it.key, {
                          cantidad: Math.max(1, parseInt(e.target.value || "1")),
                        })
                      }
                      className="h-10"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Detalle (opcional)
                    </label>
                    <Input
                      value={it.detalle}
                      onChange={(e) =>
                        updateItem(it.key, { detalle: e.target.value })
                      }
                      className="h-10"
                    />
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Importe
                    </label>
                    <span className="px-2 font-mono text-sm font-semibold tabular-nums">
                      {it.precio_unidad === null
                        ? "—"
                        : formatCLP(it.precio_unidad * it.cantidad)}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {productos.length > 0 && (
          <div className="mt-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={productoInputRef}
                value={productoQuery}
                onChange={(e) => setProductoQuery(e.target.value)}
                onFocus={() => setProductoFocused(true)}
                onBlur={() => setTimeout(() => setProductoFocused(false), 150)}
                placeholder={
                  items.length === 0
                    ? `Tocá para ver ${productos.length} productos...`
                    : "Agregar otro item..."
                }
                className="h-11 pl-9 text-base"
              />
            </div>
            {showDropdown && (
              <ul className="mt-2 max-h-80 overflow-y-auto rounded-lg border bg-background">
                {filtered.length === 0 ? (
                  <li className="px-3 py-3 text-sm text-muted-foreground">
                    Sin resultados.
                  </li>
                ) : (
                  filtered.map((p) => (
                    <li key={p.producto_empresa_id}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => addItem(p)}
                        className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-accent"
                      >
                        <div>
                          <div className="font-medium">{p.nombre}</div>
                          <div className="text-xs text-muted-foreground">
                            {p.precio === null
                              ? "Sin precio"
                              : `${formatCLP(p.precio)} c/u`}
                          </div>
                        </div>
                        <Plus className="size-4 text-muted-foreground" />
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        )}

        {algunSinPrecio && (
          <div className="mt-2 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Hay items sin precio. Podés guardar igual y completar después en
              la ficha de la empresa.
            </span>
          </div>
        )}
      </Section>

      <Section title="Detalles">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fecha">Fecha</Label>
            <Input
              id="fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="h-10"
            />
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-1.5">
          <Label htmlFor="detalle">Detalle / Notas</Label>
          <Input
            id="detalle"
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
            className="h-10"
          />
        </div>
      </Section>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t bg-background/95 p-4 backdrop-blur sm:-mx-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          {items.length} item{items.length === 1 ? "" : "s"} · {totalUnidades}{" "}
          unidades
          {totalImporte > 0 && (
            <>
              {" · "}
              <strong className="text-foreground">
                {formatCLP(totalImporte)}
              </strong>
            </>
          )}
        </div>
        <Button
          type="button"
          size="lg"
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="h-11 px-6 text-base"
        >
          <Check className="size-5" />
          {loading ? "Guardando…" : "Guardar cambios"}
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
