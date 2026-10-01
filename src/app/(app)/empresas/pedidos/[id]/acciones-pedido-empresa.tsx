"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, Undo2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { CheckboxExpress } from "@/components/checkbox-express";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  anularPedidoEmpresa,
  desanularPedidoEmpresa,
  marcarExpress,
} from "./actions";

export function AccionesPedidoEmpresa({
  id,
  anulado,
  express,
  recargoExpress,
  rutEmpresa,
}: {
  id: number;
  anulado: boolean;
  express: boolean;
  recargoExpress: number;
  rutEmpresa?: string;
}) {
  const router = useRouter();
  const [confirmAnular, setConfirmAnular] = useState(false);
  const [pending, setPending] = useState(false);
  // Optimista: la casilla se mueve al instante y se revierte si el servidor
  // dice que no. Marcar express es el caso de "me acordé después", y esperar
  // el ida y vuelta para ver el cambio se siente roto.
  const [expressLocal, setExpressLocal] = useState(express);

  const cambiarExpress = async (v: boolean) => {
    setExpressLocal(v);
    const res = await marcarExpress(id, v);
    if (!res.ok) {
      setExpressLocal(!v);
      toast.error(res.error);
      return;
    }
    toast.success(v ? "Marcada como express" : "Ya no es express");
    router.refresh();
  };

  const handleAnular = async () => {
    setPending(true);
    const res = await anularPedidoEmpresa(id);
    setPending(false);
    if (res.ok) {
      setConfirmAnular(false);
      router.refresh();
    }
  };

  const handleDesanular = async () => {
    setPending(true);
    await desanularPedidoEmpresa(id);
    setPending(false);
    router.refresh();
  };

  if (anulado) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleDesanular}
          disabled={pending}
        >
          <Undo2 className="size-4" /> Reactivar pedido
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="mb-3">
        <CheckboxExpress
          checked={expressLocal}
          onChange={cambiarExpress}
          recargo={recargoExpress}
          rutEmpresa={rutEmpresa}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/empresas/pedidos/${id}/editar`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          <Pencil className="size-4" /> Editar items
        </Link>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirmAnular(true)}
        >
          <XCircle className="size-4" /> Anular pedido
        </Button>
      </div>

      <Dialog open={confirmAnular} onOpenChange={setConfirmAnular}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Anular el pedido #{id}?</DialogTitle>
            <DialogDescription>
              No se borra. Queda marcado como anulado y no aparece por defecto
              en la facturación. Podés reactivarlo después si fue un error.
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
              onClick={handleAnular}
              disabled={pending}
            >
              {pending ? "Anulando…" : "Sí, anular"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
