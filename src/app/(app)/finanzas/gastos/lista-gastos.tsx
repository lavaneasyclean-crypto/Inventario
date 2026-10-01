"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  FileText,
  Pencil,
  Trash2,
  Truck,
  Undo2,
} from "lucide-react";
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
import { etiquetaPeriodo } from "@/lib/finanzas";
import { formatCLP } from "@/lib/format";
import {
  CATEGORIA_GASTO_LABELS,
  FORMA_PAGO_LABELS,
  type Gasto,
} from "@/lib/types";
import { BadgeEstadoGasto } from "../badges";
import { DialogoPago } from "../dialogo-pago";
import { EditorGasto } from "./editor-gasto";
import {
  eliminarGasto,
  marcarGastoPagado,
  marcarGastoPendiente,
} from "../actions";

export function ListaGastos({
  gastos,
  hoy,
}: {
  gastos: Gasto[];
  hoy: string;
}) {
  return (
    <ul className="grid gap-2 lg:grid-cols-2">
      {gastos.map((g) => (
        <li key={g.id}>
          <FilaGasto gasto={g} hoy={hoy} />
        </li>
      ))}
    </ul>
  );
}

function FilaGasto({ gasto, hoy }: { gasto: Gasto; hoy: string }) {
  const router = useRouter();
  const [pagando, setPagando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [confirmBorrar, setConfirmBorrar] = useState(false);
  const [pending, setPending] = useState(false);

  const correr = async (
    fn: () => Promise<{ ok: boolean; error?: string }>,
    exito: string,
  ) => {
    setPending(true);
    const res = await fn();
    setPending(false);
    if (!res.ok) {
      toast.error(res.error ?? "No se pudo completar");
      return false;
    }
    toast.success(exito);
    router.refresh();
    return true;
  };

  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium">
              {CATEGORIA_GASTO_LABELS[gasto.categoria]}
            </span>
            <BadgeEstadoGasto gasto={gasto} hoy={hoy} />
          </div>
          <p className="mt-1.5 font-medium">{gasto.descripcion}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {gasto.proveedor && (
              <span className="inline-flex items-center gap-1">
                <Truck className="size-3.5" /> {gasto.proveedor}
              </span>
            )}
            {gasto.documento && (
              <span className="inline-flex items-center gap-1">
                <FileText className="size-3.5" /> {gasto.documento}
              </span>
            )}
            <span>Fecha {gasto.fecha}</span>
            {gasto.periodo && <span>Período {etiquetaPeriodo(gasto.periodo)}</span>}
            {gasto.pagado && gasto.fecha_pago && (
              <span>
                Pagado {gasto.fecha_pago}
                {gasto.forma_pago
                  ? ` · ${FORMA_PAGO_LABELS[gasto.forma_pago]}`
                  : ""}
              </span>
            )}
          </div>
          {gasto.notas && (
            <p className="mt-1.5 text-xs text-muted-foreground">{gasto.notas}</p>
          )}
        </div>
        <span className="shrink-0 font-mono text-lg font-bold tabular-nums">
          {formatCLP(gasto.monto)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {gasto.pagado ? (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              correr(
                () => marcarGastoPendiente(gasto.id),
                "El gasto volvió a quedar por pagar",
              )
            }
          >
            <Undo2 className="size-4" /> Marcar sin pagar
          </Button>
        ) : (
          <Button size="sm" disabled={pending} onClick={() => setPagando(true)}>
            <CheckCircle2 className="size-4" /> Marcar pagado
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => setEditando(true)}
        >
          <Pencil className="size-4" /> Editar
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => setConfirmBorrar(true)}
        >
          <Trash2 className="size-4" /> Borrar
        </Button>
      </div>

      <DialogoPago
        abierto={pagando}
        onAbrir={setPagando}
        titulo="Registrar el pago"
        descripcion={`${CATEGORIA_GASTO_LABELS[gasto.categoria]} — ${formatCLP(gasto.monto)}`}
        hoy={hoy}
        onConfirmar={async (datos) => {
          const ok = await correr(
            () => marcarGastoPagado(gasto.id, datos),
            "Pago registrado",
          );
          if (ok) setPagando(false);
        }}
      />

      {editando && (
        <EditorGasto
          gasto={gasto}
          abierto={editando}
          onAbrir={setEditando}
          hoy={hoy}
        />
      )}

      <Dialog open={confirmBorrar} onOpenChange={setConfirmBorrar}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Borrar el gasto?</DialogTitle>
            <DialogDescription>
              Se elimina del todo. Un gasto es una anotación nuestra, no un
              documento emitido, así que se borra en vez de anularse.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmBorrar(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={async () => {
                const ok = await correr(
                  () => eliminarGasto(gasto.id),
                  "Gasto borrado",
                );
                if (ok) setConfirmBorrar(false);
              }}
            >
              {pending ? "Borrando…" : "Sí, borrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
