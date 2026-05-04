"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Cliente } from "@/lib/types";
import { actualizarCliente } from "./actions";

export function EditarCliente({ cliente }: { cliente: Cliente }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Pencil className="size-4" /> Editar datos
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar cliente</DialogTitle>
          <DialogDescription>
            RUT <span className="font-mono">{cliente.rut}</span> — el RUT no se
            puede cambiar.
          </DialogDescription>
        </DialogHeader>

        <form
          action={(fd) => {
            start(async () => {
              await actualizarCliente(fd);
              setOpen(false);
            });
          }}
          className="grid gap-3"
        >
          <input type="hidden" name="rut" value={cliente.rut} />

          <Field
            id="nombre"
            label="Nombre"
            defaultValue={cliente.nombre}
            autoFocus
          />
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field
                id="calle"
                label="Calle"
                defaultValue={cliente.calle}
              />
            </div>
            <Field id="dpto" label="Dpto" defaultValue={cliente.dpto} />
          </div>
          <Field id="comuna" label="Comuna" defaultValue={cliente.comuna} />
          <Field
            id="telefono"
            label="Teléfono"
            defaultValue={cliente.telefono}
            type="tel"
          />
          <Field
            id="correo"
            label="Correo"
            defaultValue={cliente.correo}
            type="email"
          />

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  defaultValue,
  type = "text",
  autoFocus,
}: {
  id: string;
  label: string;
  defaultValue: string | null;
  type?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        type={type}
        defaultValue={defaultValue ?? ""}
        autoFocus={autoFocus}
      />
    </div>
  );
}
