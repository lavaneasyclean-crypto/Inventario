"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Producto, TipoServicio } from "@/lib/types";
import { TIPO_SERVICIO_LABELS } from "@/lib/types";
import { Pencil, Plus } from "lucide-react";
import { actualizarProducto, crearProducto } from "./actions";

const TIPOS: TipoServicio[] = [
  "lavado",
  "seco",
  "planchado",
  "manchas",
  "aplicaciones",
  "ganchos",
  "delivery",
  "pedido_especial",
  "descuento",
  "secado",
];

export function NuevoProductoButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="lg" className="h-11 px-4 text-base" onClick={() => setOpen(true)}>
        <Plus className="size-5" /> Nuevo producto
      </Button>
      <ProductoDialog
        mode="create"
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

export function EditarProductoButton({ producto }: { producto: Producto }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-9"
        onClick={() => setOpen(true)}
      >
        <Pencil className="size-4" /> Editar
      </Button>
      <ProductoDialog
        mode="edit"
        producto={producto}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

function ProductoDialog({
  mode,
  producto,
  open,
  onOpenChange,
}: {
  mode: "create" | "edit";
  producto?: Producto;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [id, setId] = useState("");
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<TipoServicio>("lavado");
  const [precio, setPrecio] = useState<string>("0");
  const [activo, setActivo] = useState(true);

  // Reset al abrir
  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && producto) {
      setId(producto.id);
      setNombre(producto.nombre);
      setTipo(producto.tipo_servicio);
      setPrecio(String(producto.precio));
      setActivo(producto.activo);
    } else {
      setId("");
      setNombre("");
      setTipo("lavado");
      setPrecio("0");
      setActivo(true);
    }
    setError(null);
  }, [open, mode, producto]);

  const submit = async () => {
    setError(null);

    const precioNum = parseInt(precio, 10);
    if (Number.isNaN(precioNum)) {
      setError("Precio debe ser un número entero");
      return;
    }

    setLoading(true);
    try {
      let res;
      if (mode === "create") {
        res = await crearProducto({
          id: id.trim(),
          nombre: nombre.trim(),
          tipo_servicio: tipo,
          precio: precioNum,
          activo,
        });
      } else {
        res = await actualizarProducto(producto!.id, {
          nombre: nombre.trim(),
          tipo_servicio: tipo,
          precio: precioNum,
          activo,
        });
      }
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Nuevo producto" : `Editar ${producto?.nombre}`}
          </DialogTitle>
          {mode === "edit" && (
            <DialogDescription>
              ID <span className="font-mono">{producto?.id}</span> · los cambios
              quedan registrados en el historial de auditoría.
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="grid gap-3">
          {mode === "create" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="prod-id">ID del producto</Label>
              <Input
                id="prod-id"
                value={id}
                onChange={(e) => setId(e.target.value.toUpperCase())}
                placeholder="Ej: AA001, LAV001, etc."
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Letras, números, guión o guión bajo. Es la referencia interna que
                aparecerá en los pedidos.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="prod-nombre">Nombre</Label>
            <Input
              id="prod-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              autoFocus={mode === "edit"}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="prod-tipo">Tipo de servicio</Label>
              <Select
                value={tipo}
                onValueChange={(v) => setTipo((v as TipoServicio) ?? "lavado")}
              >
                <SelectTrigger id="prod-tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_SERVICIO_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="prod-precio">Precio (CLP)</Label>
              <Input
                id="prod-precio"
                type="number"
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">
                Puede ser negativo si es un descuento.
              </p>
            </div>
          </div>

          <label className="mt-1 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={activo}
              onChange={(e) => setActivo(e.target.checked)}
              className="size-4"
            />
            Activo (disponible al crear pedidos nuevos)
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={submit} disabled={loading}>
            {loading ? "Guardando…" : mode === "create" ? "Crear" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
