"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  claveCelda,
  itemsDesdeGrilla,
  totalesPorProducto,
} from "@/lib/bolsas";
import { hoyEnChile, mediodiaChile } from "@/lib/fecha";
import { formatCLP } from "@/lib/format";
import type {
  ClienteEmpresa,
  EmpresaBolsa,
  ProductoEmpresaAdquirido,
} from "@/lib/types";
import { crearPedidoEmpresa } from "./actions";

/**
 * Carga de una guía por bolsas: una fila por trabajador, una columna por
 * prenda. Es la planilla que estas empresas vienen llenando a mano.
 *
 * Las cantidades se guardan como texto mientras se tipea —igual que
 * InputNumero— porque una celda tiene que poder quedar vacía sin volverse
 * cero.
 */
export function GrillaBolsas({
  empresa,
  bolsas,
  productos,
}: {
  empresa: ClienteEmpresa;
  bolsas: EmpresaBolsa[];
  productos: ProductoEmpresaAdquirido[];
}) {
  const router = useRouter();
  const [fecha, setFecha] = useState(hoyEnChile);
  const [detalle, setDetalle] = useState("");
  const [celdas, setCeldas] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Para moverse con Enter hacia abajo, que es como se llena una planilla.
  const refs = useRef(new Map<string, HTMLInputElement | null>());

  const items = useMemo(() => itemsDesdeGrilla(celdas), [celdas]);
  const totales = useMemo(() => totalesPorProducto(celdas), [celdas]);

  const precioDe = useMemo(
    () => new Map(productos.map((p) => [p.producto_empresa_id, p.precio])),
    [productos],
  );

  const totalUnidades = items.reduce((s, it) => s + it.cantidad, 0);
  const neto = items.reduce((s, it) => {
    const precio = precioDe.get(it.producto_empresa_id);
    return s + (precio ?? 0) * it.cantidad;
  }, 0);
  const haySinPrecio = items.some(
    (it) => precioDe.get(it.producto_empresa_id) == null,
  );

  const setCelda = (bolsaId: number, productoId: string, valor: string) => {
    const limpio = valor.replace(/[^\d]/g, "");
    setCeldas((prev) => {
      const next = { ...prev };
      const k = claveCelda(bolsaId, productoId);
      if (limpio === "") delete next[k];
      else next[k] = limpio;
      return next;
    });
  };

  /** Enter baja a la misma columna de la fila siguiente, como en Excel. */
  const alPresionar = (
    e: React.KeyboardEvent<HTMLInputElement>,
    fila: number,
    productoId: string,
  ) => {
    if (e.key !== "Enter" && e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const salto = e.key === "ArrowUp" ? -1 : 1;
    const destino = bolsas[fila + salto];
    if (!destino) return;
    e.preventDefault();
    refs.current.get(claveCelda(destino.id, productoId))?.focus();
  };

  const guardar = async () => {
    setError(null);
    if (items.length === 0) {
      setError("La grilla está vacía: cargá al menos una prenda.");
      return;
    }

    setLoading(true);
    const res = await crearPedidoEmpresa({
      rut_empresa: empresa.rut,
      alias: empresa.alias,
      fecha: mediodiaChile(fecha),
      detalle: detalle.trim() || null,
      express: false,
      items: items.map((it) => ({
        producto_empresa_id: it.producto_empresa_id,
        nombre:
          productos.find((p) => p.producto_empresa_id === it.producto_empresa_id)
            ?.nombre ?? "(sin nombre)",
        precio_unidad: precioDe.get(it.producto_empresa_id) ?? null,
        cantidad: it.cantidad,
        detalle: null,
        bolsa_id: it.bolsa_id,
      })),
    });
    setLoading(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast.success("Guía creada");
    router.push(`/empresas/pedidos/${res.id}`);
  };

  if (bolsas.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/30 p-8 text-center">
        <p className="text-base font-medium">Falta el padrón de bolsas</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Esta empresa trabaja por bolsas pero todavía no tiene ninguna
          cargada.{" "}
          <Link
            href={`/empresas/${encodeURIComponent(empresa.rut)}`}
            className="underline"
          >
            Armá el padrón en su ficha
          </Link>{" "}
          y volvé.
        </p>
      </div>
    );
  }

  if (productos.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/30 p-8 text-center">
        <p className="text-base font-medium">Sin prendas asignadas</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {empresa.alias || empresa.nombre} no tiene productos con precio.{" "}
          <Link
            href={`/empresas/${encodeURIComponent(empresa.rut)}`}
            className="underline"
          >
            Cargalos en su ficha
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border bg-background p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fecha">Fecha del retiro</Label>
            <Input
              id="fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="h-10"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="detalle">Detalle / Notas (opcional)</Label>
            <Input
              id="detalle"
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              placeholder="Ej: Semana 1"
              className="h-10"
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-background p-4">
        <header className="mb-3">
          <h2 className="text-lg font-semibold">Grilla de bolsas</h2>
          <p className="text-xs text-muted-foreground">
            Una fila por bolsa, una columna por prenda. Enter y las flechas
            bajan a la fila siguiente. Las celdas vacías no se guardan.
          </p>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border-b bg-background px-2 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Bolsa
                </th>
                {productos.map((p) => (
                  <th
                    key={p.producto_empresa_id}
                    className="border-b px-1 py-2 text-center text-xs font-medium text-muted-foreground"
                  >
                    <span className="block max-w-20 truncate" title={p.nombre}>
                      {p.nombre}
                    </span>
                    {p.precio == null ? (
                      <span className="text-[10px] text-amber-700 dark:text-amber-400">
                        sin precio
                      </span>
                    ) : (
                      <span className="text-[10px] font-normal">
                        {formatCLP(p.precio)}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bolsas.map((b, fila) => {
                const filaTotal = productos.reduce((s, p) => {
                  const v = Number(
                    celdas[claveCelda(b.id, p.producto_empresa_id)] ?? 0,
                  );
                  return s + (Number.isFinite(v) ? v : 0);
                }, 0);
                return (
                  <tr
                    key={b.id}
                    className={filaTotal > 0 ? "bg-accent/40" : undefined}
                  >
                    <th className="sticky left-0 z-10 border-b bg-inherit px-2 py-1 text-left font-normal">
                      <span className="font-mono font-semibold">{b.codigo}</span>
                      {b.nombre && (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          {b.nombre}
                        </span>
                      )}
                    </th>
                    {productos.map((p) => {
                      const k = claveCelda(b.id, p.producto_empresa_id);
                      return (
                        <td key={k} className="border-b px-0.5 py-1">
                          <input
                            ref={(el) => {
                              refs.current.set(k, el);
                            }}
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            value={celdas[k] ?? ""}
                            onChange={(e) =>
                              setCelda(b.id, p.producto_empresa_id, e.target.value)
                            }
                            onKeyDown={(e) =>
                              alPresionar(e, fila, p.producto_empresa_id)
                            }
                            onFocus={(e) => e.currentTarget.select()}
                            aria-label={`${p.nombre} en la bolsa ${b.codigo}`}
                            className="h-9 w-14 rounded border bg-background text-center tabular-nums focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th className="sticky left-0 z-10 bg-background px-2 pt-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  Total
                </th>
                {productos.map((p) => (
                  <td
                    key={p.producto_empresa_id}
                    className="px-1 pt-2 text-center font-mono font-semibold tabular-nums"
                  >
                    {totales.get(p.producto_empresa_id) ?? 0}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Los totales de abajo tienen que coincidir con el pie de la planilla.
          Si no coinciden, algo se tipeó mal.
        </p>
      </section>

      {haySinPrecio && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Cargaste prendas que todavía no tienen precio para esta empresa. La
            guía se guarda igual, pero esas líneas no suman al total hasta que
            les pongas precio en la ficha.
          </span>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t bg-background/95 p-4 backdrop-blur sm:-mx-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          {items.length} línea{items.length === 1 ? "" : "s"} ·{" "}
          {totalUnidades} prenda{totalUnidades === 1 ? "" : "s"} ·{" "}
          <strong className="text-foreground">{formatCLP(neto)}</strong> neto
        </div>
        <Button
          type="button"
          size="lg"
          onClick={guardar}
          disabled={loading || items.length === 0}
          className="h-11 px-6 text-base"
        >
          <Save className="size-5" />
          {loading ? "Guardando…" : "Guardar guía"}
        </Button>
      </div>
    </div>
  );
}
