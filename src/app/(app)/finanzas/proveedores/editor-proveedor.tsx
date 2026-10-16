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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TIPO_CUENTA_LABELS, TIPOS_CUENTA } from "@/lib/types";
import type { Proveedor, TipoCuenta } from "@/lib/types";
import { actualizarProveedor, crearProveedor } from "./actions";

/** El Select de shadcn no acepta vacío como valor, así que el "sin dato" va con nombre. */
const SIN_CUENTA = "sin-cuenta";

function Seccion({ titulo }: { titulo: string }) {
  return (
    <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {titulo}
    </p>
  );
}

/**
 * Alta y edición de un proveedor, con un solo formulario.
 *
 * Se usa desde la lista y también desde el formulario de gasto, donde hace
 * falta poder crear uno sin perder lo que se venía escribiendo. Por eso avisa
 * con `onGuardado` en vez de navegar: quien lo abrió decide qué hacer después.
 */
export function EditorProveedor({
  proveedor,
  abierto,
  onAbrir,
  nombreInicial,
  onGuardado,
}: {
  /** Sin proveedor es un alta. */
  proveedor?: Proveedor;
  abierto: boolean;
  onAbrir: (v: boolean) => void;
  /** Lo que ya se había tipeado en el buscador que abrió este diálogo. */
  nombreInicial?: string;
  onGuardado?: (id: number, nombre: string) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const [nombre, setNombre] = useState(proveedor?.nombre ?? nombreInicial ?? "");
  const [rut, setRut] = useState(proveedor?.rut ?? "");
  const [contacto, setContacto] = useState(proveedor?.contacto ?? "");
  const [telefono, setTelefono] = useState(proveedor?.telefono ?? "");
  const [correo, setCorreo] = useState(proveedor?.correo ?? "");
  const [direccion, setDireccion] = useState(proveedor?.direccion ?? "");
  const [comuna, setComuna] = useState(proveedor?.comuna ?? "");
  const [giro, setGiro] = useState(proveedor?.giro ?? "");
  const [banco, setBanco] = useState(proveedor?.banco ?? "");
  const [tipoCuenta, setTipoCuenta] = useState<string>(
    proveedor?.tipo_cuenta ?? SIN_CUENTA,
  );
  const [numeroCuenta, setNumeroCuenta] = useState(
    proveedor?.numero_cuenta ?? "",
  );
  const [titular, setTitular] = useState(proveedor?.titular ?? "");
  const [rutTitular, setRutTitular] = useState(proveedor?.rut_titular ?? "");

  const guardar = async () => {
    setPending(true);
    const payload = {
      nombre,
      rut: rut || null,
      contacto: contacto || null,
      telefono: telefono || null,
      correo: correo || null,
      direccion: direccion || null,
      comuna: comuna || null,
      giro: giro || null,
      banco: banco || null,
      tipo_cuenta:
        tipoCuenta === SIN_CUENTA ? null : (tipoCuenta as TipoCuenta),
      numero_cuenta: numeroCuenta || null,
      titular: titular || null,
      rut_titular: rutTitular || null,
    };
    const res = proveedor
      ? await actualizarProveedor(proveedor.id, payload)
      : await crearProveedor(payload);
    setPending(false);

    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(proveedor ? "Proveedor actualizado" : "Proveedor creado");
    onAbrir(false);
    onGuardado?.(res.id ?? proveedor?.id ?? 0, nombre.trim());
    router.refresh();
  };

  return (
    <Dialog open={abierto} onOpenChange={onAbrir}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {proveedor ? "Editar proveedor" : "Nuevo proveedor"}
          </DialogTitle>
          <DialogDescription>
            Solo el nombre es obligatorio. El resto se completa cuando haga
            falta: de Mercado Libre alcanza con el nombre, de quien trae el
            detergente conviene tener el RUT y la cuenta.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-nombre">Nombre</Label>
              <Input
                id="p-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Mercado Libre"
                className="h-10"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-rut">RUT (opcional)</Label>
              <Input
                id="p-rut"
                value={rut}
                onChange={(e) => setRut(e.target.value)}
                placeholder="12345678-9"
                className="h-10"
              />
            </div>
          </div>

          <Seccion titulo="Contacto" />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-contacto">Persona de contacto</Label>
              <Input
                id="p-contacto"
                value={contacto}
                onChange={(e) => setContacto(e.target.value)}
                placeholder="Ej: Juan Pérez"
                className="h-10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-telefono">Teléfono</Label>
              <Input
                id="p-telefono"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="+56 9 1234 5678"
                className="h-10"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="p-correo">Correo</Label>
            <Input
              id="p-correo"
              type="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              className="h-10"
            />
          </div>

          <Seccion titulo="Dirección y giro" />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-direccion">Dirección</Label>
              <Input
                id="p-direccion"
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-comuna">Comuna</Label>
              <Input
                id="p-comuna"
                value={comuna}
                onChange={(e) => setComuna(e.target.value)}
                className="h-10"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="p-giro">Giro o rubro</Label>
            <Input
              id="p-giro"
              value={giro}
              onChange={(e) => setGiro(e.target.value)}
              placeholder="Ej: venta de insumos de aseo"
              className="h-10"
            />
          </div>

          <Seccion titulo="Para transferirle" />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-banco">Banco</Label>
              <Input
                id="p-banco"
                value={banco}
                onChange={(e) => setBanco(e.target.value)}
                placeholder="Ej: Banco Estado"
                className="h-10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-tipo-cuenta">Tipo de cuenta</Label>
              <Select
                value={tipoCuenta}
                onValueChange={(v) => setTipoCuenta(v ?? SIN_CUENTA)}
              >
                <SelectTrigger id="p-tipo-cuenta" className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_CUENTA}>Sin especificar</SelectItem>
                  {TIPOS_CUENTA.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_CUENTA_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="p-numero">N° de cuenta</Label>
            <Input
              id="p-numero"
              value={numeroCuenta}
              onChange={(e) => setNumeroCuenta(e.target.value)}
              className="h-10"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-titular">Titular de la cuenta</Label>
              <Input
                id="p-titular"
                value={titular}
                onChange={(e) => setTitular(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-rut-titular">RUT del titular</Label>
              <Input
                id="p-rut-titular"
                value={rutTitular}
                onChange={(e) => setRutTitular(e.target.value)}
                placeholder="12345678-9"
                className="h-10"
              />
            </div>
          </div>
          <p className="-mt-1 text-xs text-muted-foreground">
            Titular y su RUT solo hacen falta si la cuenta está a nombre de
            otra persona. Vacíos significan que la cuenta es del proveedor.
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onAbrir(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={pending || !nombre.trim()}>
            {pending ? "Guardando…" : proveedor ? "Guardar" : "Crear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


export function NuevoProveedorButton() {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Button
        size="lg"
        className="h-11 px-4 text-base"
        onClick={() => setAbierto(true)}
      >
        <Plus className="size-5" /> Nuevo proveedor
      </Button>
      {/* La key remonta el formulario en cada apertura, para que no arrastre
          lo que se tipeó y se canceló la vez anterior. */}
      {abierto && (
        <EditorProveedor
          key={String(abierto)}
          abierto={abierto}
          onAbrir={setAbierto}
        />
      )}
    </>
  );
}
