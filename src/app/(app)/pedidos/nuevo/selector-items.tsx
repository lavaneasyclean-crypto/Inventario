"use client";

import { useMemo, useRef, useState } from "react";
import { Search, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatCLP } from "@/lib/format";
import {
  UNIDAD_PRECIO_LABELS,
  describirMedida,
  importeLinea,
  medidasQueRequiere,
  type UnidadCobro,
} from "@/lib/medidas";
import type { Producto } from "@/lib/types";
import { TIPO_SERVICIO_LABELS } from "@/lib/types";

export interface ItemDraft {
  key: string;
  producto_id: string;
  nombre: string;
  tipo_servicio: Producto["tipo_servicio"];
  unidad_cobro: UnidadCobro;
  precio_unidad: number;
  /** Piezas. La medida de cada pieza va en ancho/largo. */
  cantidad: number;
  /** Se guardan como texto: es lo que la persona va tipeando. */
  ancho: string;
  largo: string;
  detalle: string;
}

/**
 * Las medidas se tipean, así que hay que tolerar el estado intermedio ("1,",
 * vacío) y la coma decimal, que es lo natural en Chile.
 */
export function parseMedida(texto: string): number | null {
  const n = parseFloat(texto.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Importe de la línea, o null si todavía faltan medidas. */
export function importeDeItem(it: ItemDraft): number | null {
  return importeLinea({
    unidad: it.unidad_cobro,
    precioUnidad: it.precio_unidad,
    cantidad: it.cantidad,
    ancho: parseMedida(it.ancho),
    largo: parseMedida(it.largo),
  });
}

/** Los que todavía no se pueden cobrar porque les falta una medida. */
export function itemsSinMedida(items: ItemDraft[]): ItemDraft[] {
  return items.filter((it) => importeDeItem(it) === null);
}

export function SelectorItems({
  productos,
  items,
  onChange,
}: {
  productos: Producto[];
  items: ItemDraft[];
  onChange: (next: ItemDraft[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return productos;
    return productos.filter(
      (p) =>
        p.nombre.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        TIPO_SERVICIO_LABELS[p.tipo_servicio].toLowerCase().includes(q),
    );
  }, [productos, query]);
  const showDropdown = focused || query.trim().length > 0;

  const total = items.reduce((s, it) => s + (importeDeItem(it) ?? 0), 0);

  const addItem = (p: Producto) => {
    const newItem: ItemDraft = {
      key: crypto.randomUUID(),
      producto_id: p.id,
      nombre: p.nombre,
      tipo_servicio: p.tipo_servicio,
      unidad_cobro: p.unidad_cobro,
      precio_unidad: p.precio,
      cantidad: 1,
      ancho: "",
      largo: "",
      detalle: "",
    };
    onChange([...items, newItem]);
    setQuery("");
    setFocused(false);
    inputRef.current?.blur();
  };

  const updateItem = (key: string, patch: Partial<ItemDraft>) => {
    onChange(items.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  };

  const removeItem = (key: string) => {
    onChange(items.filter((it) => it.key !== key));
  };

  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-center text-sm text-muted-foreground">
          Buscá productos abajo y agregalos al pedido.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((it) => (
            <li
              key={it.key}
              className="rounded-lg border bg-background p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{it.nombre}</div>
                  <div className="text-xs text-muted-foreground">
                    {TIPO_SERVICIO_LABELS[it.tipo_servicio]} ·{" "}
                    {formatCLP(it.precio_unidad)}{" "}
                    {UNIDAD_PRECIO_LABELS[it.unidad_cobro]}
                    {describirMedida(
                      it.unidad_cobro,
                      parseMedida(it.ancho),
                      parseMedida(it.largo),
                    ) && (
                      <>
                        {" · "}
                        {describirMedida(
                          it.unidad_cobro,
                          parseMedida(it.ancho),
                          parseMedida(it.largo),
                        )}
                      </>
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

              {(() => {
                const pide = medidasQueRequiere(it.unidad_cobro);
                if (!pide.ancho && !pide.largo) return null;
                return (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {pide.ancho && (
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-muted-foreground">
                          Ancho (m)
                        </label>
                        <Input
                          inputMode="decimal"
                          value={it.ancho}
                          onChange={(e) =>
                            updateItem(it.key, { ancho: e.target.value })
                          }
                          placeholder="1,40"
                          className="h-10"
                        />
                      </div>
                    )}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        Largo (m)
                      </label>
                      <Input
                        inputMode="decimal"
                        value={it.largo}
                        onChange={(e) =>
                          updateItem(it.key, { largo: e.target.value })
                        }
                        placeholder="2,10"
                        className="h-10"
                      />
                    </div>
                  </div>
                );
              })()}

              <div className="mt-2 grid grid-cols-[100px_1fr] items-end gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    {it.unidad_cobro === "unidad" ? "Cantidad" : "Piezas"}
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
                    placeholder="Ej: manchas en cuello, no planchar..."
                    className="h-10"
                  />
                </div>
              </div>

              <div className="mt-2 flex items-baseline justify-end gap-1 text-sm">
                {importeDeItem(it) === null ? (
                  <span className="text-amber-700 dark:text-amber-400">
                    Falta la medida para calcular el precio
                  </span>
                ) : (
                  <>
                    <span className="text-muted-foreground">Importe</span>
                    <span className="font-mono font-semibold tabular-nums">
                      {formatCLP(importeDeItem(it))}
                    </span>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Buscador para agregar items — al final asi no hay que volver
          arriba despues de cargar uno. */}
      <div>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder={
              items.length === 0
                ? `Tocá para ver ${productos.length} productos...`
                : "Agregar otro item..."
            }
            className="h-11 pl-9 text-base"
          />
        </div>
        {showDropdown && (
          <ul className="mt-2 max-h-80 overflow-y-auto overflow-x-hidden rounded-lg border bg-background">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-sm text-muted-foreground">
                Sin productos para &ldquo;{query}&rdquo;.
              </li>
            ) : (
              filtered.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => addItem(p)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-accent"
                  >
                    <div>
                      <div className="font-medium">{p.nombre}</div>
                      <div className="text-xs text-muted-foreground">
                        {TIPO_SERVICIO_LABELS[p.tipo_servicio]}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm tabular-nums">
                        {formatCLP(p.precio)}
                      </span>
                      <Plus className="size-4 text-muted-foreground" />
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      {items.length > 0 && (
        <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3">
          <span className="text-sm font-medium">Total</span>
          <span className="font-mono text-lg font-semibold tabular-nums">
            {formatCLP(total)}
          </span>
        </div>
      )}
    </div>
  );
}
