"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Download, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { vencimientoPorDefecto } from "@/lib/finanzas";
import { formatCLP } from "@/lib/format";
import type { TipoFactura } from "@/lib/types";
import { registrarFactura } from "@/app/(app)/finanzas/actions";

/**
 * Congela el consolidado en una factura.
 *
 * Los montos no se mandan: el servidor vuelve a leer las guías y rehace el
 * cálculo. Acá solo se pide lo que no puede deducir —folio, fechas, notas— y
 * se muestra el total para que la persona confirme que es el que esperaba.
 */
export function DialogoRegistrarFactura({
  abierto,
  onAbrir,
  rut,
  tipo,
  guiaIds,
  total,
  hoy,
}: {
  abierto: boolean;
  onAbrir: (v: boolean) => void;
  rut: string;
  tipo: TipoFactura;
  guiaIds: number[];
  total: number;
  hoy: string;
}) {
  const router = useRouter();
  const [folio, setFolio] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [vence, setVence] = useState(vencimientoPorDefecto(hoy));
  const [notas, setNotas] = useState("");
  const [pending, setPending] = useState(false);

  const esExpress = tipo === "express";

  const guardar = async () => {
    setPending(true);
    const res = await registrarFactura({
      rut,
      tipo,
      guiaIds,
      folio: folio || null,
      fecha,
      fecha_vence: vence || null,
      notas: notas || null,
    });
    setPending(false);

    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(
      esExpress ? "Recargo express registrado" : "Factura registrada",
      {
        description: "Queda en Finanzas › Por cobrar.",
        action: res.id
          ? {
              label: "Ver",
              onClick: () => router.push(`/finanzas/facturas/${res.id}`),
            }
          : undefined,
      },
    );
    onAbrir(false);
    router.refresh();
  };

  return (
    <Dialog open={abierto} onOpenChange={onAbrir}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {esExpress ? "Registrar el recargo express" : "Registrar la factura"}
          </DialogTitle>
          <DialogDescription>
            {esExpress
              ? "Se guarda el recargo de las guías express marcadas, como documento aparte de la factura normal."
              : "Se guarda el consolidado y queda anotado qué guías cubre, para que no se facturen dos veces."}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              {guiaIds.length} guía{guiaIds.length === 1 ? "" : "s"}
            </span>
            <span className="font-mono text-base font-bold tabular-nums">
              {formatCLP(total)}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Total con IVA. El monto definitivo lo recalcula el servidor con lo
            que diga la base en este momento.
          </p>
        </div>

        <div className="grid gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reg-folio">Folio (opcional)</Label>
            <Input
              id="reg-folio"
              value={folio}
              onChange={(e) => setFolio(e.target.value)}
              placeholder="Se completa cuando lo da el SII"
              className="h-10"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reg-fecha">Emisión</Label>
              <Input
                id="reg-fecha"
                type="date"
                value={fecha}
                onChange={(e) => {
                  setFecha(e.target.value);
                  if (e.target.value) {
                    setVence(vencimientoPorDefecto(e.target.value));
                  }
                }}
                className="h-10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reg-vence">Vence</Label>
              <Input
                id="reg-vence"
                type="date"
                value={vence}
                onChange={(e) => setVence(e.target.value)}
                className="h-10"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reg-notas">Notas (opcional)</Label>
            <Input
              id="reg-notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Ej: facturación de julio"
              className="h-10"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onAbrir(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={pending || !fecha || guiaIds.length === 0}>
            {pending ? "Registrando…" : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Recuerda registrar la facturación después de bajar el Excel.
 *
 * Son dos acciones separadas a propósito —a veces se baja la planilla solo
 * para revisarla antes de emitir— pero esa separación es justo la forma fácil
 * de que el seguimiento quede con agujeros. El aviso es persistente y no un
 * toast: el olvido pasa cuando se está apurado, y un cartel que se va solo en
 * cinco segundos no lo evita.
 */
export function AvisoSinRegistrar({
  tipo,
  onRegistrar,
  onOcultar,
}: {
  tipo: TipoFactura;
  onRegistrar: () => void;
  onOcultar: () => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-start gap-3 rounded-lg border border-sky-500/50 bg-sky-50 px-3 py-3 dark:bg-sky-950/20">
      <Download className="mt-0.5 size-4 shrink-0 text-sky-700 dark:text-sky-400" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-sky-900 dark:text-sky-200">
          Bajaste la planilla, pero esto todavía no quedó registrado.
        </p>
        <p className="mt-0.5 text-xs text-sky-900/80 dark:text-sky-300/80">
          Sin registrarlo no aparece en Finanzas, no se puede marcar como
          cobrado, y nada avisa si {tipo === "express" ? "este recargo" : "este período"}{" "}
          se vuelve a facturar.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" onClick={onRegistrar}>
          {tipo === "express" ? "Registrar recargo" : "Registrar factura"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onOcultar}
          aria-label="Ocultar el aviso"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}

/** Aviso de que alguna de las guías marcadas ya está en un documento vigente. */
export function AvisoYaFacturadas({
  facturas,
  onDesmarcar,
}: {
  facturas: Array<{ guia: number; factura: number }>;
  onDesmarcar: () => void;
}) {
  if (facturas.length === 0) return null;

  return (
    <div className="rounded border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
      <p className="font-medium">
        {facturas.length} guía{facturas.length === 1 ? "" : "s"} ya
        {facturas.length === 1 ? " está" : " están"} en una factura de este tipo:
      </p>
      <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {facturas.slice(0, 8).map(({ guia, factura }) => (
          <li key={guia}>
            #{guia} →{" "}
            <Link
              href={`/finanzas/facturas/${factura}`}
              className="underline underline-offset-2"
            >
              factura #{factura}
            </Link>
          </li>
        ))}
        {facturas.length > 8 && <li>y {facturas.length - 8} más</li>}
      </ul>
      <button
        type="button"
        onClick={onDesmarcar}
        className="mt-2 font-medium underline underline-offset-2"
      >
        Desmarcarlas
      </button>
    </div>
  );
}
