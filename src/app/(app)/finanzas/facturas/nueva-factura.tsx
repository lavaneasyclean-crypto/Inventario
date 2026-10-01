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
import { desgloseIva, vencimientoPorDefecto } from "@/lib/finanzas";
import { formatCLP } from "@/lib/format";
import type { ClienteEmpresa, TipoFactura } from "@/lib/types";
import { crearFacturaManual } from "../actions";

type Empresa = Pick<ClienteEmpresa, "rut" | "nombre" | "alias">;

/**
 * Alta manual, para las facturas que no salen de las guías: un ajuste, un
 * servicio suelto, o una factura vieja que se quiere dejar registrada. Las del
 * mes normal se registran desde la pantalla de facturación de la empresa, que
 * además deja anotado qué guías cubren.
 */
export function NuevaFacturaButton({
  empresas,
  hoy,
}: {
  empresas: Empresa[];
  hoy: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pending, setPending] = useState(false);

  const [rut, setRut] = useState("");
  const [tipo, setTipo] = useState<TipoFactura>("normal");
  const [folio, setFolio] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [vence, setVence] = useState(vencimientoPorDefecto(hoy));
  const [neto, setNeto] = useState("");
  const [notas, setNotas] = useState("");

  const montos = desgloseIva(Number(neto || 0));

  const reiniciar = () => {
    setRut("");
    setTipo("normal");
    setFolio("");
    setFecha(hoy);
    setVence(vencimientoPorDefecto(hoy));
    setNeto("");
    setNotas("");
  };

  const guardar = async () => {
    setPending(true);
    const res = await crearFacturaManual({
      rut_empresa: rut,
      tipo,
      folio: folio || null,
      fecha,
      fecha_vence: vence || null,
      neto: Number(neto || 0),
      notas: notas || null,
    });
    setPending(false);

    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Factura registrada");
    setAbierto(false);
    reiniciar();
    router.refresh();
  };

  return (
    <>
      <Button size="lg" className="h-11 px-4 text-base" onClick={() => setAbierto(true)}>
        <Plus className="size-5" /> Factura a mano
      </Button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar factura a mano</DialogTitle>
            <DialogDescription>
              Para las que no salen de las guías del mes. Si es la facturación
              de un período, conviene registrarla desde la ficha de la empresa:
              ahí queda anotado qué guías cubre.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="empresa">Empresa</Label>
              <Select value={rut} onValueChange={(v) => setRut(v ?? "")}>
                <SelectTrigger id="empresa" className="h-10">
                  <SelectValue placeholder="Elegí una empresa" />
                </SelectTrigger>
                <SelectContent>
                  {empresas.map((e) => (
                    <SelectItem key={e.rut} value={e.rut}>
                      {e.alias || e.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tipo-doc">Documento</Label>
                <Select
                  value={tipo}
                  onValueChange={(v) => setTipo((v as TipoFactura) ?? "normal")}
                >
                  <SelectTrigger id="tipo-doc" className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Factura normal</SelectItem>
                    <SelectItem value="express">Recargo express</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="folio">Folio (opcional)</Label>
                <Input
                  id="folio"
                  value={folio}
                  onChange={(e) => setFolio(e.target.value)}
                  placeholder="Ej: 1686"
                  className="h-10"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="f-emision">Emisión</Label>
                <Input
                  id="f-emision"
                  type="date"
                  value={fecha}
                  onChange={(e) => {
                    setFecha(e.target.value);
                    if (e.target.value) setVence(vencimientoPorDefecto(e.target.value));
                  }}
                  className="h-10"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="f-vence">Vence</Label>
                <Input
                  id="f-vence"
                  type="date"
                  value={vence}
                  onChange={(e) => setVence(e.target.value)}
                  className="h-10"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="neto">Monto neto (sin IVA)</Label>
              <InputNumero
                id="neto"
                value={neto}
                onValueChange={setNeto}
                placeholder="0"
                className="h-10"
              />
              <p className="text-xs text-muted-foreground">
                IVA {formatCLP(montos.iva)} · Total{" "}
                <strong className="text-foreground">
                  {formatCLP(montos.total)}
                </strong>
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notas">Notas (opcional)</Label>
              <Input
                id="notas"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Ej: ajuste de julio"
                className="h-10"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button
              onClick={guardar}
              disabled={pending || !rut || !fecha || Number(neto || 0) <= 0}
            >
              {pending ? "Guardando…" : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
