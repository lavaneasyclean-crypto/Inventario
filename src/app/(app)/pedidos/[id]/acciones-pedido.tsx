"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Package, Truck, Undo2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCLP } from "@/lib/format";
import type { FormaPago, Pedido } from "@/lib/types";
import { FORMA_PAGO_LABELS } from "@/lib/types";
import {
  marcarEnProceso,
  marcarEntregado,
  marcarListo,
  marcarPagado,
  marcarSinPagar,
  anularPedido,
} from "./actions";

export function AccionesPedido({ pedido }: { pedido: Pedido }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <BotonEstado pedido={pedido} />
      <BotonPago pedido={pedido} />
      {pedido.estado !== "anulado" && pedido.estado !== "entregado" && (
        <BotonAnular pedido={pedido} />
      )}
    </div>
  );
}

function BotonEstado({ pedido }: { pedido: Pedido }) {
  if (pedido.estado === "anulado") return null;

  if (pedido.estado === "recibido") {
    return (
      <form action={marcarListo}>
        <input type="hidden" name="id" value={pedido.id} />
        <Button type="submit" size="lg" className="w-full">
          <CheckCircle2 className="size-5" /> Marcar listo para retirar
        </Button>
      </form>
    );
  }

  if (pedido.estado === "listo") {
    return (
      <div className="grid gap-2 sm:col-span-1">
        <form action={marcarEntregado}>
          <input type="hidden" name="id" value={pedido.id} />
          <Button type="submit" size="lg" className="w-full">
            <Truck className="size-5" /> Marcar entregado al cliente
          </Button>
        </form>
        <form action={marcarEnProceso}>
          <input type="hidden" name="id" value={pedido.id} />
          <Button type="submit" size="sm" variant="ghost" className="w-full">
            <Undo2 className="size-4" /> Volver a "en proceso"
          </Button>
        </form>
      </div>
    );
  }

  // entregado
  return (
    <form action={marcarListo}>
      <input type="hidden" name="id" value={pedido.id} />
      <Button type="submit" size="lg" variant="outline" className="w-full">
        <Undo2 className="size-5" /> Revertir entrega
      </Button>
    </form>
  );
}

function BotonPago({ pedido }: { pedido: Pedido }) {
  const [open, setOpen] = useState(false);
  const [forma, setForma] = useState<FormaPago>("efectivo");
  const [pending, start] = useTransition();

  if (pedido.pagado) {
    return (
      <form action={marcarSinPagar}>
        <input type="hidden" name="id" value={pedido.id} />
        <Button type="submit" size="lg" variant="outline" className="w-full">
          <Undo2 className="size-5" /> Marcar como no pagado
        </Button>
      </form>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="lg" variant="default" className="w-full">
            <Package className="size-5" /> Marcar como pagado
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Confirmar pago</DialogTitle>
          <DialogDescription>
            Total a cobrar:{" "}
            <span className="font-semibold text-foreground">
              {formatCLP(pedido.total_venta)}
            </span>
          </DialogDescription>
        </DialogHeader>

        <form
          action={(fd) => {
            fd.set("forma_pago", forma);
            fd.set("total", String(pedido.total_venta));
            start(async () => {
              await marcarPagado(fd);
              setOpen(false);
            });
          }}
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="id" value={pedido.id} />

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">¿Cómo pagó?</label>
            <Select value={forma} onValueChange={(v) => setForma(v as FormaPago)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["efectivo", "transferencia", "redcompra"] as const).map((f) => (
                  <SelectItem key={f} value={f}>
                    {FORMA_PAGO_LABELS[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="submit" size="lg" disabled={pending} className="w-full">
              {pending ? "Confirmando…" : "Confirmar pago"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BotonAnular({ pedido }: { pedido: Pedido }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="lg" variant="outline" className="w-full sm:col-span-2">
            <XCircle className="size-5" /> Anular pedido
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>¿Anular el pedido #{pedido.id}?</DialogTitle>
          <DialogDescription>
            Esta acción cambia el estado a "Anulado". Los datos no se borran y
            podés revertirlo después.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <form
            action={(fd) => {
              start(async () => {
                await anularPedido(fd);
                setOpen(false);
              });
            }}
          >
            <input type="hidden" name="id" value={pedido.id} />
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Anulando…" : "Sí, anular"}
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
