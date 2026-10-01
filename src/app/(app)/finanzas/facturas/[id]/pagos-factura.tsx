"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Plus, Trash2 } from "lucide-react";
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
import { InputNumero } from "@/components/input-numero";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saldoFactura } from "@/lib/finanzas";
import { formatCLP } from "@/lib/format";
import {
  FORMA_PAGO_LABELS,
  FORMAS_PAGO_REALES,
  type Factura,
  type FacturaAbono,
  type FormaPago,
} from "@/lib/types";
import { eliminarAbono, registrarAbono } from "../../actions";

/**
 * Los pagos de una factura.
 *
 * Una empresa rara vez paga todo de una: abona a fin de mes y el resto cuando
 * puede. Por eso la pregunta que contesta esta sección no es "¿pagó?" sino
 * "¿cuánto falta?", y el saldo va arriba de todo.
 */
export function PagosFactura({
  factura,
  abonos,
  hoy,
}: {
  factura: Factura;
  abonos: FacturaAbono[];
  hoy: string;
}) {
  const router = useRouter();
  const [abriendo, setAbriendo] = useState(false);
  const [pendiente, setPendiente] = useState<number | null>(null);

  const saldo = saldoFactura(factura);
  const anulada = factura.estado === "anulada";

  const borrar = async (abonoId: number) => {
    setPendiente(abonoId);
    const res = await eliminarAbono(abonoId, factura.id);
    setPendiente(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Pago eliminado");
    router.refresh();
  };

  return (
    <section className="rounded-xl border bg-background p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Banknote className="size-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Pagos recibidos</h2>
        </div>
        {!anulada && saldo > 0 && (
          <Button size="sm" onClick={() => setAbriendo(true)}>
            <Plus className="size-4" /> Registrar pago
          </Button>
        )}
      </header>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Cifra etiqueta="Total facturado" valor={factura.total} />
        <Cifra etiqueta="Cobrado" valor={factura.monto_pagado} />
        <Cifra
          etiqueta="Saldo"
          valor={saldo}
          resaltar={saldo > 0 ? "deuda" : "ok"}
        />
      </div>

      {abonos.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          Todavía no se registró ningún pago de esta factura.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {abonos.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-base font-semibold tabular-nums">
                    {formatCLP(a.monto)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {a.fecha}
                    {a.forma_pago
                      ? ` · ${FORMA_PAGO_LABELS[a.forma_pago]}`
                      : ""}
                  </span>
                </div>
                {a.notas && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {a.notas}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={pendiente === a.id}
                onClick={() => borrar(a.id)}
                aria-label={`Eliminar el pago de ${formatCLP(a.monto)}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {anulada && abonos.length > 0 && (
        <p className="mt-3 rounded border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
          La factura está anulada pero tiene pagos registrados. Se conservan a
          propósito: saber cuándo entró esa plata es lo que hace falta para
          devolverla o imputarla a otra factura.
        </p>
      )}

      {abriendo && (
        <DialogoAbono
          abierto={abriendo}
          onAbrir={setAbriendo}
          facturaId={factura.id}
          saldo={saldo}
          hoy={hoy}
          onGuardado={() => {
            setAbriendo(false);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}

function Cifra({
  etiqueta,
  valor,
  resaltar,
}: {
  etiqueta: string;
  valor: number;
  resaltar?: "deuda" | "ok";
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs font-medium text-muted-foreground">{etiqueta}</p>
      <p
        className={`font-mono text-xl font-semibold tabular-nums ${
          resaltar === "deuda"
            ? "text-destructive"
            : resaltar === "ok"
              ? "text-emerald-600 dark:text-emerald-500"
              : ""
        }`}
      >
        {formatCLP(valor)}
      </p>
    </div>
  );
}

function DialogoAbono({
  abierto,
  onAbrir,
  facturaId,
  saldo,
  hoy,
  onGuardado,
}: {
  abierto: boolean;
  onAbrir: (v: boolean) => void;
  facturaId: number;
  saldo: number;
  hoy: string;
  onGuardado: () => void;
}) {
  // Arranca con el saldo completo: el caso normal es que paguen todo lo que
  // falta, y el parcial es escribir otro número encima.
  const [monto, setMonto] = useState(String(saldo));
  const [fecha, setFecha] = useState(hoy);
  const [forma, setForma] = useState<FormaPago>("transferencia");
  const [notas, setNotas] = useState("");
  const [pending, setPending] = useState(false);

  const valor = Number(monto || 0);
  const excede = valor > saldo;
  const restante = saldo - valor;

  const guardar = async () => {
    setPending(true);
    const res = await registrarAbono(facturaId, {
      fecha,
      monto: valor,
      forma_pago: forma,
      notas: notas || null,
    });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(
      restante > 0
        ? `Pago registrado. Quedan ${formatCLP(restante)} por cobrar.`
        : "Factura saldada",
    );
    onGuardado();
  };

  return (
    <Dialog open={abierto} onOpenChange={onAbrir}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Registrar un pago</DialogTitle>
          <DialogDescription>
            Falta cobrar {formatCLP(saldo)}. Si pagaron solo una parte, cambiá
            el monto.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="abono-monto">Monto</Label>
            <InputNumero
              id="abono-monto"
              value={monto}
              onValueChange={setMonto}
              className="h-10"
            />
            {excede ? (
              <p className="text-xs text-destructive">
                Supera el saldo de {formatCLP(saldo)}.
              </p>
            ) : (
              valor > 0 && (
                <p className="text-xs text-muted-foreground">
                  {restante > 0
                    ? `Quedarían ${formatCLP(restante)} por cobrar.`
                    : "Con esto la factura queda saldada."}
                </p>
              )
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="abono-fecha">Fecha del pago</Label>
            <Input
              id="abono-fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="h-10"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="abono-forma">Forma de pago</Label>
            <Select
              value={forma}
              onValueChange={(v) => setForma((v as FormaPago) ?? "transferencia")}
            >
              <SelectTrigger id="abono-forma" className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMAS_PAGO_REALES.map((f) => (
                  <SelectItem key={f} value={f}>
                    {FORMA_PAGO_LABELS[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="abono-notas">Notas (opcional)</Label>
            <Input
              id="abono-notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Ej: transferencia parcial"
              className="h-10"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onAbrir(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={pending || valor <= 0 || excede || !fecha}>
            {pending ? "Guardando…" : "Registrar pago"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
