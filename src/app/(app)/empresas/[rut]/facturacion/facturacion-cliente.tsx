"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Calendar,
  Download,
  FileSpreadsheet,
  Hash,
  Package,
  Pencil,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCLP, formatDate } from "@/lib/format";
import type {
  ClienteEmpresa,
  PedidoEmpresa,
  PedidoEmpresaItem,
} from "@/lib/types";
import { exportFacturacionExcel } from "./excel-export";

interface PedidoConItems {
  pedido: PedidoEmpresa;
  items: PedidoEmpresaItem[];
}

interface FiltrosState {
  modo: "fecha" | "guia";
  desde: string;
  hasta: string;
  idDesde?: number;
  idHasta?: number;
}

const IVA = 0.19;

export function FacturacionClient({
  empresa,
  pedidosConItems,
  filtros,
}: {
  empresa: ClienteEmpresa;
  pedidosConItems: PedidoConItems[];
  filtros: FiltrosState;
}) {
  // Por defecto, todos los pedidos no anulados están seleccionados
  const [seleccionados, setSeleccionados] = useState<Set<number>>(
    () =>
      new Set(
        pedidosConItems
          .filter((p) => !p.pedido.anulado)
          .map((p) => p.pedido.id),
      ),
  );

  const pedidosVisibles = pedidosConItems;
  const totalGuias = pedidosVisibles.length;
  const guiasIncluidas = seleccionados.size;

  const consolidado = useMemo(() => {
    type Linea = {
      key: string;
      nombre: string;
      cantidad: number;
      precio_unidad: number | null;
      importe: number;
      sinPrecio: boolean;
    };
    const map = new Map<string, Linea>();
    for (const { pedido, items } of pedidosVisibles) {
      if (!seleccionados.has(pedido.id)) continue;
      for (const it of items) {
        const key = `${it.producto_empresa_id ?? "_"}|${it.producto_empresa_nombre}`;
        const cur = map.get(key);
        if (cur) {
          cur.cantidad += it.cantidad;
          if (it.precio_unidad !== null) {
            cur.importe += it.precio_unidad * it.cantidad;
          } else {
            cur.sinPrecio = true;
          }
        } else {
          map.set(key, {
            key,
            nombre: it.producto_empresa_nombre,
            cantidad: it.cantidad,
            precio_unidad: it.precio_unidad,
            importe:
              it.precio_unidad === null
                ? 0
                : it.precio_unidad * it.cantidad,
            sinPrecio: it.precio_unidad === null,
          });
        }
      }
    }
    const lineas = Array.from(map.values()).sort((a, b) =>
      a.nombre.localeCompare(b.nombre, "es"),
    );
    const neto = lineas.reduce((s, l) => s + l.importe, 0);
    const iva = Math.round(neto * IVA);
    const total = neto + iva;
    return { lineas, neto, iva, total };
  }, [pedidosVisibles, seleccionados]);

  const toggle = (id: number) => {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const seleccionarTodas = () => {
    setSeleccionados(
      new Set(
        pedidosVisibles
          .filter((p) => !p.pedido.anulado)
          .map((p) => p.pedido.id),
      ),
    );
  };
  const limpiarSeleccion = () => setSeleccionados(new Set());

  const handleExport = () => {
    const incluidos = pedidosVisibles.filter((p) =>
      seleccionados.has(p.pedido.id),
    );
    exportFacturacionExcel({
      empresa,
      pedidos: incluidos,
      consolidado,
      filtros,
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <FiltrosForm initial={filtros} rut={empresa.rut} />

      <section className="rounded-xl border bg-background p-4">
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Pedidos del rango</h2>
            <p className="text-xs text-muted-foreground">
              {totalGuias === 0
                ? "Sin pedidos para este rango."
                : `${guiasIncluidas} de ${totalGuias} guía${totalGuias === 1 ? "" : "s"} marcadas para facturar`}
            </p>
          </div>
          {totalGuias > 0 && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={seleccionarTodas}>
                Marcar todas
              </Button>
              <Button variant="outline" size="sm" onClick={limpiarSeleccion}>
                Desmarcar todas
              </Button>
            </div>
          )}
        </header>

        {totalGuias === 0 ? (
          <p className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            No hay pedidos en este rango. Cambiá el filtro de arriba.
          </p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {pedidosVisibles.map(({ pedido, items }) => {
              const totalUnidades = items.reduce(
                (s, it) => s + it.cantidad,
                0,
              );
              const totalImporte = items.reduce(
                (s, it) => s + (it.importe ?? 0),
                0,
              );
              const sinPrecio = items.some((it) => it.importe === null);
              const checked = seleccionados.has(pedido.id);
              return (
                <li
                  key={pedido.id}
                  className={`rounded-lg border p-3 ${
                    pedido.anulado
                      ? "border-destructive/30 bg-destructive/5"
                      : "bg-background"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(pedido.id)}
                      className="mt-1 size-4"
                      aria-label={`Incluir guía ${pedido.id}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="flex items-baseline gap-2">
                          <span
                            className={`font-mono text-base font-semibold ${pedido.anulado ? "line-through opacity-60" : ""}`}
                          >
                            #{pedido.id}
                          </span>
                          {pedido.anulado && (
                            <Badge variant="destructive" className="text-xs">
                              Anulado
                            </Badge>
                          )}
                          {sinPrecio && !pedido.anulado && (
                            <Badge variant="secondary" className="text-xs">
                              Items sin precio
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(pedido.fecha)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <Package className="size-3.5" />
                        <span>
                          {items.length} item{items.length === 1 ? "" : "s"} ·{" "}
                          {totalUnidades} unidades
                        </span>
                        <span className="ml-auto font-mono font-medium tabular-nums text-foreground">
                          {formatCLP(totalImporte)}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-xs">
                        <Link
                          href={`/empresas/pedidos/${pedido.id}`}
                          className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                        >
                          Ver detalle
                        </Link>
                        {!pedido.anulado && (
                          <>
                            <span className="text-muted-foreground">·</span>
                            <Link
                              href={`/empresas/pedidos/${pedido.id}/editar`}
                              className="inline-flex items-center gap-1 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                            >
                              <Pencil className="size-3" /> Editar
                            </Link>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-xl border bg-background p-4">
        <h2 className="mb-3 text-lg font-semibold">Consolidado para facturar</h2>
        {consolidado.lineas.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            Marcá al menos una guía arriba para ver el consolidado.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-2 font-medium">Producto</th>
                  <th className="pb-2 pr-2 text-right font-medium">Cantidad</th>
                  <th className="pb-2 pr-2 text-right font-medium">
                    Precio unitario
                  </th>
                  <th className="pb-2 text-right font-medium">Importe</th>
                </tr>
              </thead>
              <tbody>
                {consolidado.lineas.map((l) => (
                  <tr key={l.key} className="border-b last:border-0">
                    <td className="py-2 pr-2">{l.nombre}</td>
                    <td className="py-2 pr-2 text-right font-mono tabular-nums">
                      {l.cantidad}
                    </td>
                    <td className="py-2 pr-2 text-right font-mono tabular-nums">
                      {l.sinPrecio ? (
                        <span className="text-amber-700 dark:text-amber-400">
                          —
                        </span>
                      ) : (
                        formatCLP(l.precio_unidad ?? 0)
                      )}
                    </td>
                    <td className="py-2 text-right font-mono font-semibold tabular-nums">
                      {formatCLP(l.importe)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="pt-3 pr-2 text-right text-muted-foreground">
                    TOTAL NETO
                  </td>
                  <td className="pt-3 text-right font-mono tabular-nums">
                    {formatCLP(consolidado.neto)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={3} className="pr-2 text-right text-muted-foreground">
                    IVA 19%
                  </td>
                  <td className="text-right font-mono tabular-nums">
                    {formatCLP(consolidado.iva)}
                  </td>
                </tr>
                <tr className="border-t">
                  <td colSpan={3} className="pt-2 pr-2 text-right text-base font-semibold">
                    TOTAL
                  </td>
                  <td className="pt-2 text-right font-mono text-base font-bold tabular-nums">
                    {formatCLP(consolidado.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {consolidado.lineas.some((l) => l.sinPrecio) && (
          <div className="mt-3 flex items-start gap-2 rounded border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Hay productos sin precio. No suman al total. Cargales precio en
              la ficha de la empresa para incluirlos.
            </span>
          </div>
        )}
      </section>

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t bg-background/95 p-4 backdrop-blur sm:-mx-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          {guiasIncluidas} guía{guiasIncluidas === 1 ? "" : "s"} ·{" "}
          <strong className="text-foreground">{formatCLP(consolidado.total)}</strong>{" "}
          (IVA incl.)
        </div>
        <Button
          type="button"
          size="lg"
          disabled={consolidado.lineas.length === 0}
          onClick={handleExport}
          className="h-11 px-6 text-base"
        >
          <FileSpreadsheet className="size-5" />
          Descargar Excel
        </Button>
      </div>
    </div>
  );
}

function FiltrosForm({
  initial,
  rut,
}: {
  initial: FiltrosState;
  rut: string;
}) {
  const [modo, setModo] = useState<"fecha" | "guia">(initial.modo);

  return (
    <form
      action={`/empresas/${encodeURIComponent(rut)}/facturacion`}
      method="get"
      className="rounded-xl border bg-background p-4"
    >
      <div className="mb-3 flex gap-2">
        <button
          type="button"
          onClick={() => setModo("fecha")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${modo === "fecha" ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-accent"}`}
        >
          <Calendar className="size-4" /> Por rango de fechas
        </button>
        <button
          type="button"
          onClick={() => setModo("guia")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${modo === "guia" ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-accent"}`}
        >
          <Hash className="size-4" /> Por rango de guías
        </button>
      </div>

      <input type="hidden" name="modo" value={modo} />

      {modo === "fecha" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="desde">Desde</Label>
            <Input
              id="desde"
              type="date"
              name="desde"
              defaultValue={initial.desde}
              className="h-10"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hasta">Hasta</Label>
            <Input
              id="hasta"
              type="date"
              name="hasta"
              defaultValue={initial.hasta}
              className="h-10"
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="idDesde">Guía desde N°</Label>
            <Input
              id="idDesde"
              type="number"
              name="idDesde"
              defaultValue={initial.idDesde ?? ""}
              placeholder="Ej: 1170"
              className="h-10"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="idHasta">Guía hasta N°</Label>
            <Input
              id="idHasta"
              type="number"
              name="idHasta"
              defaultValue={initial.idHasta ?? ""}
              placeholder="Ej: 1200"
              className="h-10"
            />
          </div>
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <Button type="submit" size="sm">
          Aplicar filtros
        </Button>
      </div>
    </form>
  );
}
