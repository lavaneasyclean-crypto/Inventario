"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BotonGuardar } from "@/components/boton-guardar";
import { Obligatorio } from "@/components/obligatorio";
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
import { formatCLP, formatDateShort } from "@/lib/format";
import { FORMA_PAGO_LABELS } from "@/lib/types";
import type { FormaPago, PedidoAbono } from "@/lib/types";
import { eliminarAbono, registrarAbono } from "./actions";

const FORMAS = ["efectivo", "transferencia", "redcompra"] as const;

/**
 * Los pagos de un pedido.
 *
 * En el mostrador pasa seguido que dejen un abono al traer la ropa y paguen el
 * resto al retirarla. El estado del pedido no se marca a mano: lo calcula la
 * base sumando estos pagos, así que la cabecera y este detalle no se pueden
 * contradecir.
 */
export function PagosPedido({
  pedidoId,
  total,
  abonos,
  hoy,
  anulado,
}: {
  pedidoId: number;
  total: number;
  abonos: PedidoAbono[];
  hoy: string;
  anulado: boolean;
}) {
  const cobrado = abonos.reduce((s, a) => s + Number(a.monto), 0);
  const saldo = Math.max(0, total - cobrado);

  const [abierto, setAbierto] = useState(false);

  if (anulado && abonos.length === 0) return null;

  return (
    <section className="mb-6 rounded-xl border bg-background p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Pagos recibidos
        </h2>
        {!anulado && saldo > 0 && (
          <Button size="sm" onClick={() => setAbierto(true)}>
            <Plus className="size-4" /> Registrar pago
          </Button>
        )}
      </div>

      <div className="mb-3 grid grid-cols-3 gap-3 text-sm">
        <Dato etiqueta="Total" valor={formatCLP(total)} />
        <Dato etiqueta="Cobrado" valor={formatCLP(cobrado)} />
        <Dato
          etiqueta="Falta"
          valor={formatCLP(saldo)}
          destacado={saldo > 0}
        />
      </div>

      {abonos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Sin pagos registrados.
        </p>
      ) : (
        <ul className="divide-y">
          {abonos.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2 text-sm">
              <Wallet className="size-4 shrink-0 text-muted-foreground" />
              <span className="font-medium tabular-nums">
                {formatCLP(Number(a.monto))}
              </span>
              <span className="text-muted-foreground">
                {formatDateShort(a.fecha)}
                {a.forma_pago ? ` · ${FORMA_PAGO_LABELS[a.forma_pago]}` : ""}
              </span>
              {a.notas && (
                <span className="truncate text-xs italic text-muted-foreground">
                  {a.notas}
                </span>
              )}
              <BorrarAbono pedidoId={pedidoId} abonoId={a.id} />
            </li>
          ))}
        </ul>
      )}

      <DialogoPago
        abierto={abierto}
        onAbrir={setAbierto}
        pedidoId={pedidoId}
        saldo={saldo}
        hoy={hoy}
      />
    </section>
  );
}

function Dato({
  etiqueta,
  valor,
  destacado,
}: {
  etiqueta: string;
  valor: string;
  destacado?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{etiqueta}</div>
      <div
        className={`font-semibold tabular-nums ${destacado ? "text-destructive" : ""}`}
      >
        {valor}
      </div>
    </div>
  );
}

function BorrarAbono({
  pedidoId,
  abonoId,
}: {
  pedidoId: number;
  abonoId: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="ml-auto"
      aria-label="Borrar pago"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        const res = await eliminarAbono(pedidoId, abonoId);
        setPending(false);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success("Pago borrado");
        router.refresh();
      }}
    >
      <Trash2 className="size-4" />
    </Button>
  );
}

function DialogoPago({
  abierto,
  onAbrir,
  pedidoId,
  saldo,
  hoy,
}: {
  abierto: boolean;
  onAbrir: (v: boolean) => void;
  pedidoId: number;
  saldo: number;
  hoy: string;
}) {
  const router = useRouter();
  // Arranca con el saldo completo: lo normal es que paguen todo lo que falta,
  // y lo parcial es escribir otro numero encima.
  const [monto, setMonto] = useState(String(saldo));
  const [fecha, setFecha] = useState(hoy);
  const [forma, setForma] = useState<FormaPago>("efectivo");
  const [notas, setNotas] = useState("");
  const [pending, setPending] = useState(false);

  const valor = Number(monto || 0);
  const restante = saldo - valor;

  const guardar = async () => {
    setPending(true);
    const res = await registrarAbono(pedidoId, {
      fecha,
      monto: valor,
      forma_pago: forma as (typeof FORMAS)[number],
      notas: notas.trim() || null,
    });
    setPending(false);

    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(
      restante > 0
        ? `Pago registrado. Faltan ${formatCLP(restante)}.`
        : "Pedido pagado",
    );
    onAbrir(false);
    router.refresh();
  };

  return (
    <Dialog open={abierto} onOpenChange={onAbrir}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Registrar un pago</DialogTitle>
          <DialogDescription>
            Falta cobrar {formatCLP(saldo)}. Si abonan solo una parte, cambiá
            el monto.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="monto">Monto<Obligatorio /></Label>
            <InputNumero
              id="monto"
              value={monto}
              onValueChange={setMonto}
              className="h-10"
            />
            {valor > 0 && valor < saldo && (
              <p className="text-xs text-muted-foreground">
                Quedan {formatCLP(restante)} por cobrar.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fecha-pago">Fecha<Obligatorio /></Label>
            <Input
              id="fecha-pago"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="h-10"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="forma">Forma de pago</Label>
            <Select
              value={forma}
              onValueChange={(v) => setForma((v as FormaPago) ?? "efectivo")}
            >
              <SelectTrigger id="forma" className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMAS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {FORMA_PAGO_LABELS[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notas-pago">Notas (opcional)</Label>
            <Input
              id="notas-pago"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Ej: abono al dejar la ropa"
              className="h-10"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onAbrir(false)} disabled={pending}>
            Cancelar
          </Button>
          <BotonGuardar
            onClick={guardar}
            pending={pending}
            faltan={[
              valor <= 0 && "el monto",
              valor > saldo && "un monto que no supere el saldo",
            ]}
          >
            {pending ? "Guardando…" : "Registrar pago"}
          </BotonGuardar>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
