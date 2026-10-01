"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Undo2, XCircle } from "lucide-react";
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
import type { Factura } from "@/lib/types";
import {
  actualizarFactura,
  anularFactura,
  reactivarFactura,
} from "../../actions";

export function AccionesFactura({ factura }: { factura: Factura }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [confirmAnular, setConfirmAnular] = useState(false);
  const [pending, setPending] = useState(false);

  const correr = async (fn: () => Promise<{ ok: boolean; error?: string }>, exito: string) => {
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
    <>
      <div className="flex flex-wrap gap-2">
        {/* El cobro no se maneja acá: se registran pagos en la sección de
            abajo y el estado sale de la suma de esos pagos. */}
        {factura.estado !== "anulada" && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditando(true)}
              disabled={pending}
            >
              <Pencil className="size-4" /> Editar datos
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmAnular(true)}
              disabled={pending}
            >
              <XCircle className="size-4" /> Anular
            </Button>
          </>
        )}

        {factura.estado === "anulada" && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              correr(() => reactivarFactura(factura.id), "Factura reactivada")
            }
          >
            <Undo2 className="size-4" /> Reactivar
          </Button>
        )}
      </div>

      <EditarFacturaDialog
        factura={factura}
        abierto={editando}
        onAbrir={setEditando}
        onGuardado={() => {
          setEditando(false);
          router.refresh();
        }}
      />

      <Dialog open={confirmAnular} onOpenChange={setConfirmAnular}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Anular la factura?</DialogTitle>
            <DialogDescription>
              No se borra: queda en el historial marcada como anulada y sus
              guías vuelven a quedar disponibles para facturar. Usalo cuando se
              emitió una nota de crédito. Los pagos ya registrados se
              conservan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmAnular(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={async () => {
                const ok = await correr(
                  () => anularFactura(factura.id),
                  "Factura anulada",
                );
                if (ok) setConfirmAnular(false);
              }}
            >
              {pending ? "Anulando…" : "Sí, anular"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EditarFacturaDialog({
  factura,
  abierto,
  onAbrir,
  onGuardado,
}: {
  factura: Factura;
  abierto: boolean;
  onAbrir: (v: boolean) => void;
  onGuardado: () => void;
}) {
  const [folio, setFolio] = useState(factura.folio ?? "");
  const [fecha, setFecha] = useState(factura.fecha);
  const [vence, setVence] = useState(factura.fecha_vence ?? "");
  const [notas, setNotas] = useState(factura.notas ?? "");
  const [pending, setPending] = useState(false);

  const guardar = async () => {
    setPending(true);
    const res = await actualizarFactura(factura.id, {
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
    toast.success("Factura actualizada");
    onGuardado();
  };

  return (
    <Dialog open={abierto} onOpenChange={onAbrir}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Datos de la factura</DialogTitle>
          <DialogDescription>
            El folio se completa cuando vuelve del facturador electrónico. Los
            montos no se editan acá: salen de las guías que cubre.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-folio">Folio</Label>
            <Input
              id="edit-folio"
              value={folio}
              onChange={(e) => setFolio(e.target.value)}
              placeholder="Ej: 1686"
              className="h-10"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-fecha">Emisión</Label>
              <Input
                id="edit-fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-vence">Vence</Label>
              <Input
                id="edit-vence"
                type="date"
                value={vence}
                onChange={(e) => setVence(e.target.value)}
                className="h-10"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-notas">Notas</Label>
            <Input
              id="edit-notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              className="h-10"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onAbrir(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={pending || !fecha}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
