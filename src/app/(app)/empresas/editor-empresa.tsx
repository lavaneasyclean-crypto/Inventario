"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
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
import type { ClienteEmpresa } from "@/lib/types";
import { actualizarEmpresa, crearEmpresa } from "./actions";

const RUT_RE = /^\d{1,8}-[\dkK]$/;

function normalizeRut(raw: string): string {
  return raw.replace(/\./g, "").replace(/\s/g, "").toUpperCase();
}

export function NuevaEmpresaButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="lg"
        className="h-11 px-4 text-base"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-5" /> Nueva empresa
      </Button>
      <EmpresaDialog mode="create" open={open} onOpenChange={setOpen} />
    </>
  );
}

export function EditarEmpresaButton({ empresa }: { empresa: ClienteEmpresa }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="size-4" /> Editar datos
      </Button>
      <EmpresaDialog
        mode="edit"
        empresa={empresa}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

function EmpresaDialog({
  mode,
  empresa,
  open,
  onOpenChange,
}: {
  mode: "create" | "edit";
  empresa?: ClienteEmpresa;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rut, setRut] = useState("");
  const [nombre, setNombre] = useState("");
  const [alias, setAlias] = useState("");
  const [comuna, setComuna] = useState("");
  const [calle, setCalle] = useState("");
  const [contacto1, setContacto1] = useState("");
  const [contacto2, setContacto2] = useState("");
  const [correo, setCorreo] = useState("");
  const [activo, setActivo] = useState(true);

  // Reset al abrir. Se ajusta durante el render y no en un efecto: no hay
  // ningún sistema externo con el que sincronizar, y en un efecto React tiene
  // que pintar el diálogo con los valores viejos antes de corregirlos.
  const [abiertoPrevio, setAbiertoPrevio] = useState(open);
  if (open !== abiertoPrevio) {
    setAbiertoPrevio(open);
    if (open) {
      if (mode === "edit" && empresa) {
        setRut(empresa.rut);
        setNombre(empresa.nombre);
        setAlias(empresa.alias ?? "");
        setComuna(empresa.comuna ?? "");
        setCalle(empresa.calle ?? "");
        setContacto1(empresa.contacto_1 ?? "");
        setContacto2(empresa.contacto_2 ?? "");
        setCorreo(empresa.correo ?? "");
        setActivo(empresa.activo);
      } else {
        setRut("");
        setNombre("");
        setAlias("");
        setComuna("");
        setCalle("");
        setContacto1("");
        setContacto2("");
        setCorreo("");
        setActivo(true);
      }
      setError(null);
    }
  }

  const submit = async () => {
    setError(null);

    if (mode === "create") {
      const rutNorm = normalizeRut(rut);
      if (!RUT_RE.test(rutNorm)) {
        setError("RUT con formato inválido. Ejemplo: 76123456-7");
        return;
      }
    }
    if (!nombre.trim()) {
      setError("Nombre requerido");
      return;
    }

    setLoading(true);
    try {
      let res;
      if (mode === "create") {
        res = await crearEmpresa({
          rut: normalizeRut(rut),
          nombre: nombre.trim(),
          alias: alias.trim() || null,
          comuna: comuna.trim() || null,
          calle: calle.trim() || null,
          contacto_1: contacto1.trim() || null,
          contacto_2: contacto2.trim() || null,
          correo: correo.trim() || null,
          activo,
        });
      } else {
        res = await actualizarEmpresa(empresa!.rut, {
          nombre: nombre.trim(),
          alias: alias.trim() || null,
          comuna: comuna.trim() || null,
          calle: calle.trim() || null,
          contacto_1: contacto1.trim() || null,
          contacto_2: contacto2.trim() || null,
          correo: correo.trim() || null,
          activo,
        });
      }
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onOpenChange(false);
      if (mode === "create" && res.ok && "rut" in res && res.rut) {
        router.push(`/empresas/${encodeURIComponent(res.rut)}`);
      } else {
        router.refresh();
      }
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
            {mode === "create" ? "Nueva empresa" : `Editar ${empresa?.nombre}`}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "El RUT y el nombre son obligatorios. El alias es el nombre corto que aparecerá en los pedidos."
              : `RUT ${empresa?.rut} (no se puede cambiar).`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {mode === "create" && (
            <Field
              label="RUT"
              value={rut}
              onChange={setRut}
              placeholder="76123456-7"
              autoFocus
            />
          )}

          <Field
            label="Nombre"
            value={nombre}
            onChange={setNombre}
            autoFocus={mode === "edit"}
          />
          <Field
            label="Alias (nombre corto)"
            value={alias}
            onChange={setAlias}
            placeholder="Ej: Hostal Araucanos"
          />

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="Calle" value={calle} onChange={setCalle} />
            </div>
            <Field label="Comuna" value={comuna} onChange={setComuna} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Contacto 1"
              value={contacto1}
              onChange={setContacto1}
              type="tel"
              placeholder="+56 9..."
            />
            <Field
              label="Contacto 2"
              value={contacto2}
              onChange={setContacto2}
              type="tel"
            />
          </div>

          <Field
            label="Correo"
            value={correo}
            onChange={setCorreo}
            type="email"
          />

          <label className="mt-1 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={activo}
              onChange={(e) => setActivo(e.target.checked)}
              className="size-4"
            />
            Activa (disponible al crear pedidos empresa)
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
            {loading
              ? "Guardando…"
              : mode === "create"
                ? "Crear empresa"
                : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const id = label.toLowerCase().replace(/\W/g, "-");
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
    </div>
  );
}
