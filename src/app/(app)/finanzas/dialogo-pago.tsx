"use client";

import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FORMA_PAGO_LABELS, FORMAS_PAGO_REALES } from "@/lib/types";
import type { FormaPago } from "@/lib/types";

/**
 * Registrar un pago pide siempre lo mismo —cuándo y cómo— lo esté cobrando
 * una factura o pagándolo un gasto, así que el diálogo es uno solo.
 *
 * `hoy` viene de afuera, calculado en el servidor en hora de Chile: tomarlo
 * del reloj del navegador haría que a las 21:30 el pago quede con la fecha de
 * mañana.
 */
export function DialogoPago({
  abierto,
  onAbrir,
  titulo,
  descripcion,
  hoy,
  onConfirmar,
}: {
  abierto: boolean;
  onAbrir: (v: boolean) => void;
  titulo: string;
  descripcion: string;
  hoy: string;
  onConfirmar: (datos: {
    fecha_pago: string;
    forma_pago: FormaPago;
  }) => Promise<void>;
}) {
  const [fecha, setFecha] = useState(hoy);
  const [forma, setForma] = useState<FormaPago>("transferencia");
  const [pending, setPending] = useState(false);

  const confirmar = async () => {
    setPending(true);
    try {
      await onConfirmar({ fecha_pago: fecha, forma_pago: forma });
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={onAbrir}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descripcion}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fecha_pago">Fecha del pago</Label>
            <Input
              id="fecha_pago"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="h-10"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="forma_pago">Forma de pago</Label>
            <Select
              value={forma}
              onValueChange={(v) => setForma((v as FormaPago) ?? "transferencia")}
            >
              <SelectTrigger id="forma_pago" className="h-10">
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
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onAbrir(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={pending || !fecha}>
            {pending ? "Guardando…" : "Registrar pago"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
