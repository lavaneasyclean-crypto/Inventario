"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AtSign,
  Building2,
  CreditCard,
  MapPin,
  Pencil,
  Phone,
  Power,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TIPO_CUENTA_LABELS } from "@/lib/types";
import type { Proveedor } from "@/lib/types";
import { EditorProveedor } from "./editor-proveedor";
import { cambiarActivoProveedor, eliminarProveedor } from "./actions";

export function ListaProveedores({
  proveedores,
}: {
  proveedores: Proveedor[];
}) {
  return (
    <div className="flex flex-col gap-3">
      {proveedores.map((p) => (
        <FilaProveedor key={p.id} proveedor={p} />
      ))}
    </div>
  );
}

function Dato({
  icono: Icono,
  children,
}: {
  icono: typeof Phone;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <Icono className="size-3.5" /> {children}
    </span>
  );
}

function FilaProveedor({ proveedor }: { proveedor: Proveedor }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [confirmBorrar, setConfirmBorrar] = useState(false);
  const [pending, setPending] = useState(false);

  const cuenta = [
    proveedor.banco,
    proveedor.tipo_cuenta ? TIPO_CUENTA_LABELS[proveedor.tipo_cuenta] : null,
    proveedor.numero_cuenta,
  ]
    .filter(Boolean)
    .join(" · ");

  const direccion = [proveedor.direccion, proveedor.comuna]
    .filter(Boolean)
    .join(", ");

  const correr = async (
    accion: () => Promise<{ ok: boolean; error?: string }>,
    exito: string,
  ) => {
    setPending(true);
    const res = await accion();
    setPending(false);
    if (!res.ok) {
      toast.error(res.error ?? "No se pudo completar la operación.");
      return false;
    }
    toast.success(exito);
    router.refresh();
    return true;
  };

  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{proveedor.nombre}</span>
            {proveedor.rut && (
              <span className="font-mono text-xs text-muted-foreground">
                {proveedor.rut}
              </span>
            )}
            {!proveedor.activo && <Badge variant="secondary">Inactivo</Badge>}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {proveedor.contacto && (
              <Dato icono={User}>{proveedor.contacto}</Dato>
            )}
            {proveedor.telefono && (
              <Dato icono={Phone}>{proveedor.telefono}</Dato>
            )}
            {proveedor.correo && <Dato icono={AtSign}>{proveedor.correo}</Dato>}
            {direccion && <Dato icono={MapPin}>{direccion}</Dato>}
            {proveedor.giro && (
              <Dato icono={Building2}>{proveedor.giro}</Dato>
            )}
          </div>

          {cuenta && (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <Dato icono={CreditCard}>{cuenta}</Dato>
              {proveedor.titular && (
                <span>
                  a nombre de {proveedor.titular}
                  {proveedor.rut_titular ? ` (${proveedor.rut_titular})` : ""}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setEditando(true)}>
          <Pencil className="size-4" /> Editar
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            correr(
              () => cambiarActivoProveedor(proveedor.id, !proveedor.activo),
              proveedor.activo ? "Proveedor desactivado" : "Proveedor activado",
            )
          }
        >
          <Power className="size-4" />
          {proveedor.activo ? "Desactivar" : "Activar"}
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

      {editando && (
        <EditorProveedor
          proveedor={proveedor}
          abierto={editando}
          onAbrir={setEditando}
        />
      )}

      <Dialog open={confirmBorrar} onOpenChange={setConfirmBorrar}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Borrar proveedor</DialogTitle>
            <DialogDescription>
              Se va a borrar “{proveedor.nombre}”. Si tiene gastos cargados la
              base no lo va a permitir: en ese caso desactivalo, así deja de
              aparecer al cargar un gasto nuevo pero los viejos siguen diciendo
              a quién se le pagó.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmBorrar(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={async () => {
                const ok = await correr(
                  () => eliminarProveedor(proveedor.id),
                  "Proveedor borrado",
                );
                if (ok) setConfirmBorrar(false);
              }}
            >
              Borrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
