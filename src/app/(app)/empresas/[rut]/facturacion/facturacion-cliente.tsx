"use client";

import { useMemo, useState } from "react";
import {
  consolidarFacturacion,
  debeRecordarRegistro,
  type Consolidado,
} from "@/lib/facturacion";
import Link from "next/link";
import {
  AlertCircle,
  Calendar,
  FileSpreadsheet,
  Hash,
  Package,
  Pencil,
  Save,
  Zap,
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
  TipoFactura,
} from "@/lib/types";
import { toast } from "sonner";
import { exportFacturacionExcel } from "./excel-export";
import {
  AvisoSinRegistrar,
  AvisoYaFacturadas,
  DialogoRegistrarFactura,
} from "./dialogo-registrar";

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

/** En qué documento vigente ya está cada guía. */
export interface GuiaFacturadaDTO {
  id: number;
  normal: number | null;
  express: number | null;
}

export function FacturacionClient({
  empresa,
  pedidosConItems,
  filtros,
  yaFacturadas,
  hoy,
}: {
  empresa: ClienteEmpresa;
  pedidosConItems: PedidoConItems[];
  filtros: FiltrosState;
  yaFacturadas: GuiaFacturadaDTO[];
  hoy: string;
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
  const [registrando, setRegistrando] = useState<TipoFactura | null>(null);
  // Documentos cuya planilla ya se bajó en esta visita. Es lo que dispara el
  // aviso de "la bajaste pero no la registraste": bajar el Excel y olvidarse
  // de registrar deja el seguimiento con agujeros justo en los meses de
  // apuro, que son los que más importan.
  const [exportados, setExportados] = useState<Set<TipoFactura>>(new Set());
  const [avisoOculto, setAvisoOculto] = useState<Set<TipoFactura>>(new Set());

  const facturadasPorGuia = useMemo(
    () => new Map(yaFacturadas.map((f) => [f.id, f])),
    [yaFacturadas],
  );

  const pedidosVisibles = pedidosConItems;
  const totalGuias = pedidosVisibles.length;
  const guiasIncluidas = seleccionados.size;

  // Se usa la funcion de lib/facturacion en vez de repetir el calculo aca:
  // antes habia una copia inline de toda la consolidacion, asi que los tests
  // cubrian una version y la pantalla mostraba la otra.
  const facturacion = useMemo(
    () =>
      consolidarFacturacion(
        pedidosVisibles,
        seleccionados,
        empresa.recargo_express,
      ),
    [pedidosVisibles, seleccionados, empresa.recargo_express],
  );
  const { principal, express, idsExpress } = facturacion;

  const idsSeleccionados = useMemo(
    () =>
      pedidosVisibles
        .filter((p) => seleccionados.has(p.pedido.id))
        .map((p) => p.pedido.id),
    [pedidosVisibles, seleccionados],
  );

  // Choques por tipo: una guía puede estar legítimamente en la factura normal
  // y en la de recargo, pero no dos veces en la misma.
  const choques = (tipo: TipoFactura) => {
    const ids = tipo === "express" ? idsExpress : idsSeleccionados;
    return ids
      .map((id) => ({ guia: id, factura: facturadasPorGuia.get(id)?.[tipo] ?? null }))
      .filter((c): c is { guia: number; factura: number } => c.factura !== null);
  };
  const choquesNormal = choques("normal");
  const choquesExpress = choques("express");

  /**
   * Toda la selección pasa por acá. Cambiar qué guías entran invalida la
   * planilla que se bajó antes, así que el aviso de "falta registrar" se
   * borra: si no, quedaría hablando de un Excel que ya no corresponde a lo
   * que está marcado.
   */
  const cambiarSeleccion = (
    actualizar: (prev: Set<number>) => Set<number>,
  ) => {
    setSeleccionados((prev) => actualizar(prev));
    setExportados(new Set());
    setAvisoOculto(new Set());
  };

  const toggle = (id: number) => {
    cambiarSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const seleccionarTodas = () => {
    cambiarSeleccion(
      () =>
        new Set(
          pedidosVisibles
            .filter((p) => !p.pedido.anulado)
            .map((p) => p.pedido.id),
        ),
    );
  };
  const limpiarSeleccion = () => cambiarSeleccion(() => new Set());

  const desmarcar = (ids: number[]) => {
    cambiarSeleccion((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  };

  const exportar = async (tipo: TipoFactura) => {
    const consolidado = tipo === "express" ? express : principal;
    if (!consolidado) return;
    const incluidos = pedidosVisibles.filter(
      (p) =>
        seleccionados.has(p.pedido.id) &&
        (tipo === "normal" || p.pedido.express),
    );
    try {
      await exportFacturacionExcel({
        empresa,
        pedidos: incluidos,
        consolidado,
        filtros,
        tipo,
        recargoExpress: empresa.recargo_express,
      });
    } catch (err) {
      console.error("exportFacturacionExcel", err);
      toast.error("No se pudo generar el Excel. Intentá de nuevo.");
      return;
    }
    // Recién con la descarga hecha tiene sentido recordarle que falta
    // registrar; si el Excel falló, el aviso sería ruido.
    setExportados((prev) => new Set(prev).add(tipo));
  };

  const faltaRegistrar = (tipo: TipoFactura) =>
    debeRecordarRegistro({
      exportado: exportados.has(tipo),
      ocultado: avisoOculto.has(tipo),
      guiaIds: tipo === "express" ? idsExpress : idsSeleccionados,
      idsYaFacturadas: choques(tipo).map((c) => c.guia),
    });

  const ocultarAviso = (tipo: TipoFactura) =>
    setAvisoOculto((prev) => new Set(prev).add(tipo));

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
              const totalUnidades = items.reduce((s, it) => s + it.cantidad, 0);
              const totalImporte = items.reduce(
                (s, it) => s + (it.importe ?? 0),
                0,
              );
              const sinPrecio = items.some((it) => it.importe === null);
              const checked = seleccionados.has(pedido.id);
              const facturada = facturadasPorGuia.get(pedido.id);
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
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`font-mono text-base font-semibold ${pedido.anulado ? "line-through opacity-60" : ""}`}
                          >
                            #{pedido.id}
                          </span>
                          {pedido.express && (
                            <Badge className="bg-violet-600 text-white dark:bg-violet-700">
                              <Zap className="size-3" /> Express
                            </Badge>
                          )}
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

                      {facturada && (
                        <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-amber-700 dark:text-amber-400">
                          {facturada.normal && (
                            <Link
                              href={`/finanzas/facturas/${facturada.normal}`}
                              className="underline underline-offset-2"
                            >
                              Ya en factura #{facturada.normal}
                            </Link>
                          )}
                          {facturada.express && (
                            <Link
                              href={`/finanzas/facturas/${facturada.express}`}
                              className="underline underline-offset-2"
                            >
                              Recargo en #{facturada.express}
                            </Link>
                          )}
                        </div>
                      )}

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

      <TablaConsolidado
        titulo="Consolidado para facturar"
        ayuda="Todas las guías marcadas a precio base, incluidas las express."
        consolidado={principal}
        vacioTexto="Marcá al menos una guía arriba para ver el consolidado."
      >
        <AvisoYaFacturadas
          facturas={choquesNormal}
          onDesmarcar={() => desmarcar(choquesNormal.map((c) => c.guia))}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={principal.lineas.length === 0}
            onClick={() => exportar("normal")}
          >
            <FileSpreadsheet className="size-4" /> Descargar Excel
          </Button>
          <Button
            disabled={principal.lineas.length === 0 || choquesNormal.length > 0}
            onClick={() => setRegistrando("normal")}
          >
            <Save className="size-4" /> Registrar factura
          </Button>
        </div>
        {faltaRegistrar("normal") && (
          <AvisoSinRegistrar
            tipo="normal"
            onRegistrar={() => setRegistrando("normal")}
            onOcultar={() => ocultarAviso("normal")}
          />
        )}
      </TablaConsolidado>

      {express && (
        <TablaConsolidado
          titulo={`Servicio express — recargo ${empresa.recargo_express}%`}
          ayuda={`${idsExpress.length} guía${idsExpress.length === 1 ? "" : "s"} express. Este documento cobra solo el adicional: las mismas guías ya van a precio base en el consolidado de arriba.`}
          consolidado={express}
          acento
          vacioTexto=""
        >
          <AvisoYaFacturadas
            facturas={choquesExpress}
            onDesmarcar={() => desmarcar(choquesExpress.map((c) => c.guia))}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => exportar("express")}>
              <FileSpreadsheet className="size-4" /> Descargar Excel express
            </Button>
            <Button
              disabled={choquesExpress.length > 0}
              onClick={() => setRegistrando("express")}
            >
              <Save className="size-4" /> Registrar recargo express
            </Button>
          </div>
          {faltaRegistrar("express") && (
            <AvisoSinRegistrar
              tipo="express"
              onRegistrar={() => setRegistrando("express")}
              onOcultar={() => ocultarAviso("express")}
            />
          )}
        </TablaConsolidado>
      )}

      {!express && empresa.recargo_express > 0 && idsExpress.length === 0 && (
        <p className="rounded-xl border border-dashed bg-muted/30 p-4 text-center text-sm text-muted-foreground">
          Esta empresa cobra {empresa.recargo_express}% por servicio express,
          pero ninguna de las guías marcadas está marcada como express. La marca
          se pone en la ficha de cada guía.
        </p>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t bg-background/95 p-4 backdrop-blur sm:-mx-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          {guiasIncluidas} guía{guiasIncluidas === 1 ? "" : "s"} ·{" "}
          <strong className="text-foreground">
            {formatCLP(principal.total + (express?.total ?? 0))}
          </strong>{" "}
          (IVA incl.)
          {express && (
            <span className="ml-1">
              = {formatCLP(principal.total)} + {formatCLP(express.total)} express
            </span>
          )}
        </div>
      </div>

      {registrando && (
        <DialogoRegistrarFactura
          abierto
          onAbrir={(v) => !v && setRegistrando(null)}
          rut={empresa.rut}
          tipo={registrando}
          guiaIds={registrando === "express" ? idsExpress : idsSeleccionados}
          total={
            registrando === "express" ? (express?.total ?? 0) : principal.total
          }
          hoy={hoy}
        />
      )}
    </div>
  );
}

function TablaConsolidado({
  titulo,
  ayuda,
  consolidado,
  vacioTexto,
  acento = false,
  children,
}: {
  titulo: string;
  ayuda: string;
  consolidado: Consolidado;
  vacioTexto: string;
  acento?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-xl border p-4 ${
        acento
          ? "border-violet-500/40 bg-violet-50/40 dark:bg-violet-950/10"
          : "bg-background"
      }`}
    >
      <h2 className="text-lg font-semibold">{titulo}</h2>
      <p className="mb-3 text-xs text-muted-foreground">{ayuda}</p>

      {consolidado.lineas.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          {vacioTexto}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="pb-2 pr-2 font-medium">Producto</th>
                <th className="pb-2 pr-2 text-right font-medium">Cantidad</th>
                <th className="pb-2 pr-2 text-right font-medium">
                  {acento ? "Recargo unitario" : "Precio unitario"}
                </th>
                <th className="pb-2 text-right font-medium">Importe</th>
              </tr>
            </thead>
            <tbody>
              {consolidado.lineas.map((l) => (
                <tr key={l.key} className="border-b last:border-0">
                  <td className="py-2 pr-2">{l.etiqueta}</td>
                  <td className="py-2 pr-2 text-right font-mono tabular-nums">
                    {l.cantidad}
                  </td>
                  <td className="py-2 pr-2 text-right font-mono tabular-nums">
                    {l.sinPrecio ? (
                      <span className="text-amber-700 dark:text-amber-400">—</span>
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
            Hay productos sin precio. No suman al total. Cargales precio en la
            ficha de la empresa para incluirlos.
          </span>
        </div>
      )}

      {children}
    </section>
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
              type="text"
              inputMode="numeric"
              // Sin spinner ni rueda: pasar el scroll encima cambiaba el rango.
              onInput={(e) => {
                e.currentTarget.value = e.currentTarget.value.replace(/[^\d]/g, "");
              }}
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
              type="text"
              inputMode="numeric"
              // Sin spinner ni rueda: pasar el scroll encima cambiaba el rango.
              onInput={(e) => {
                e.currentTarget.value = e.currentTarget.value.replace(/[^\d]/g, "");
              }}
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
