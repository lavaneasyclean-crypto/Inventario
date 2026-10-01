"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
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
import { periodoDeFecha, vencimientoPorDefecto } from "@/lib/finanzas";
import { CATEGORIA_GASTO_LABELS, CATEGORIAS_GASTO } from "@/lib/types";
import type { CategoriaGasto, Gasto } from "@/lib/types";
import { actualizarGasto, crearGasto } from "../actions";

/**
 * Un solo formulario para alta y edición: los campos son los mismos y tener
 * dos copias garantiza que se despeguen.
 */
export function EditorGasto({
  gasto,
  abierto,
  onAbrir,
  hoy,
}: {
  /** Sin gasto es un alta. */
  gasto?: Gasto;
  abierto: boolean;
  onAbrir: (v: boolean) => void;
  hoy: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const [categoria, setCategoria] = useState<CategoriaGasto>(
    gasto?.categoria ?? "luz",
  );
  const [descripcion, setDescripcion] = useState(gasto?.descripcion ?? "");
  const [proveedor, setProveedor] = useState(gasto?.proveedor ?? "");
  const [documento, setDocumento] = useState(gasto?.documento ?? "");
  const [fecha, setFecha] = useState(gasto?.fecha ?? hoy);
  const [vence, setVence] = useState(
    gasto?.fecha_vence ?? vencimientoPorDefecto(hoy, 15),
  );
  const [periodo, setPeriodo] = useState(
    gasto?.periodo ?? periodoDeFecha(hoy),
  );
  const [monto, setMonto] = useState(gasto ? String(gasto.monto) : "");
  const [notas, setNotas] = useState(gasto?.notas ?? "");

  const guardar = async () => {
    setPending(true);
    const payload = {
      categoria,
      descripcion,
      proveedor: proveedor || null,
      documento: documento || null,
      fecha,
      fecha_vence: vence || null,
      periodo: periodo || null,
      monto: Number(monto || 0),
      notas: notas || null,
    };
    const res = gasto
      ? await actualizarGasto(gasto.id, payload)
      : await crearGasto(payload);
    setPending(false);

    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(gasto ? "Gasto actualizado" : "Gasto registrado");
    onAbrir(false);
    router.refresh();
  };

  return (
    <Dialog open={abierto} onOpenChange={onAbrir}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{gasto ? "Editar gasto" : "Nuevo gasto"}</DialogTitle>
          <DialogDescription>
            Luz, agua, insumos, sueldos: todo lo que hay que pagar. Se anota
            primero y se marca pagado cuando se paga.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="categoria">Categoría</Label>
              <Select
                value={categoria}
                onValueChange={(v) =>
                  setCategoria((v as CategoriaGasto) ?? "otros")
                }
              >
                <SelectTrigger id="categoria" className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS_GASTO.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORIA_GASTO_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="monto">Monto</Label>
              <InputNumero
                id="monto"
                value={monto}
                onValueChange={setMonto}
                placeholder="0"
                className="h-10"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="descripcion">Descripción</Label>
            <Input
              id="descripcion"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej: Boleta de luz local Pastor Fernández"
              className="h-10"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="proveedor">Proveedor (opcional)</Label>
              <Input
                id="proveedor"
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
                placeholder="Ej: Enel"
                className="h-10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="documento">N° documento (opcional)</Label>
              <Input
                id="documento"
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                placeholder="Boleta o factura"
                className="h-10"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="g-fecha">Fecha</Label>
              <Input
                id="g-fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="g-vence">Vence</Label>
              <Input
                id="g-vence"
                type="date"
                value={vence}
                onChange={(e) => setVence(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="g-periodo">Período</Label>
              <Input
                id="g-periodo"
                type="month"
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
                className="h-10"
              />
            </div>
          </div>
          <p className="-mt-1 text-xs text-muted-foreground">
            El período es el mes del consumo, no el de la boleta: la luz de
            septiembre llega en octubre.
          </p>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="g-notas">Notas (opcional)</Label>
            <Input
              id="g-notas"
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
          <Button
            onClick={guardar}
            disabled={pending || !descripcion.trim() || Number(monto || 0) <= 0}
          >
            {pending ? "Guardando…" : gasto ? "Guardar" : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NuevoGastoButton({ hoy }: { hoy: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Button size="lg" className="h-11 px-4 text-base" onClick={() => setAbierto(true)}>
        <Plus className="size-5" /> Nuevo gasto
      </Button>
      {/* La key remonta el formulario en cada apertura, para que no arrastre
          lo que se tipeó y se canceló la vez anterior. */}
      {abierto && (
        <EditorGasto
          key={String(abierto)}
          abierto={abierto}
          onAbrir={setAbierto}
          hoy={hoy}
        />
      )}
    </>
  );
}
