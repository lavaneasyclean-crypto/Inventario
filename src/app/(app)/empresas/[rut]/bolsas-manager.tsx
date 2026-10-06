"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EyeOff, Package2, Pencil, Plus, Rows3 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { InputNumero } from "@/components/input-numero";
import { Label } from "@/components/ui/label";
import type { EmpresaBolsa } from "@/lib/types";
import {
  actualizarBolsa,
  crearBolsa,
  crearRangoDeBolsas,
  desactivarBolsa,
} from "./bolsas-actions";

/**
 * El padrón de bolsas de una empresa.
 *
 * Son las mismas todas las semanas —cada bolsa es de un trabajador— así que
 * esto se arma una vez y después la carga de la guía es solo tipear
 * cantidades en la grilla.
 */
export function BolsasManager({
  rut,
  bolsas,
}: {
  rut: string;
  bolsas: EmpresaBolsa[];
}) {
  const router = useRouter();
  const [creando, setCreando] = useState(false);
  const [rango, setRango] = useState(false);
  const [editando, setEditando] = useState<EmpresaBolsa | null>(null);
  const [pendiente, setPendiente] = useState<number | null>(null);

  const activas = bolsas.filter((b) => b.activo);
  const inactivas = bolsas.filter((b) => !b.activo);

  const alternar = async (b: EmpresaBolsa) => {
    setPendiente(b.id);
    const res = await desactivarBolsa(b.id, rut, !b.activo);
    setPendiente(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(b.activo ? `Bolsa ${b.codigo} dada de baja` : `Bolsa ${b.codigo} reactivada`);
    router.refresh();
  };

  return (
    <section className="rounded-xl border bg-background p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Package2 className="size-5 text-muted-foreground" />
          <div>
            <h2 className="text-lg font-semibold">
              Padrón de bolsas{" "}
              <span className="text-base font-normal text-muted-foreground">
                ({activas.length})
              </span>
            </h2>
            <p className="text-xs text-muted-foreground">
              Una fila por bolsa en la grilla de carga. El código puede ser un
              número o un nombre.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setRango(true)}>
            <Rows3 className="size-4" /> Cargar rango
          </Button>
          <Button size="sm" onClick={() => setCreando(true)}>
            <Plus className="size-4" /> Agregar
          </Button>
        </div>
      </header>

      {activas.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          Sin bolsas todavía. Usá <strong>Cargar rango</strong> para crear de la
          1 a la 32 de una vez, y después agregá a mano las que van por nombre.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {activas.map((b) => (
            <li
              key={b.id}
              className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
            >
              <span className="font-mono font-semibold">{b.codigo}</span>
              {b.nombre && (
                <span className="text-xs text-muted-foreground">{b.nombre}</span>
              )}
              <button
                type="button"
                onClick={() => setEditando(b)}
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Editar la bolsa ${b.codigo}`}
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                type="button"
                disabled={pendiente === b.id}
                onClick={() => alternar(b)}
                className="text-muted-foreground hover:text-destructive"
                aria-label={`Dar de baja la bolsa ${b.codigo}`}
              >
                <EyeOff className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {inactivas.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            {inactivas.length} dada{inactivas.length === 1 ? "" : "s"} de baja
          </summary>
          <ul className="mt-2 flex flex-wrap gap-2">
            {inactivas.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  disabled={pendiente === b.id}
                  onClick={() => alternar(b)}
                  className="inline-flex items-center gap-2 rounded-lg border border-dashed px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
                >
                  <span className="font-mono">{b.codigo}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    Reactivar
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {creando && (
        <EditorBolsa
          rut={rut}
          abierto={creando}
          onAbrir={setCreando}
          onGuardado={() => {
            setCreando(false);
            router.refresh();
          }}
        />
      )}

      {editando && (
        <EditorBolsa
          rut={rut}
          bolsa={editando}
          abierto
          onAbrir={(v) => !v && setEditando(null)}
          onGuardado={() => {
            setEditando(null);
            router.refresh();
          }}
        />
      )}

      <DialogoRango
        rut={rut}
        abierto={rango}
        onAbrir={setRango}
        onGuardado={() => {
          setRango(false);
          router.refresh();
        }}
      />
    </section>
  );
}

function EditorBolsa({
  rut,
  bolsa,
  abierto,
  onAbrir,
  onGuardado,
}: {
  rut: string;
  bolsa?: EmpresaBolsa;
  abierto: boolean;
  onAbrir: (v: boolean) => void;
  onGuardado: () => void;
}) {
  const [codigo, setCodigo] = useState(bolsa?.codigo ?? "");
  const [nombre, setNombre] = useState(bolsa?.nombre ?? "");
  const [pending, setPending] = useState(false);

  const guardar = async () => {
    setPending(true);
    const payload = { codigo, nombre: nombre || null };
    const res = bolsa
      ? await actualizarBolsa(bolsa.id, rut, payload)
      : await crearBolsa(rut, payload);
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(bolsa ? "Bolsa actualizada" : "Bolsa agregada");
    onGuardado();
  };

  return (
    <Dialog open={abierto} onOpenChange={onAbrir}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{bolsa ? "Editar bolsa" : "Nueva bolsa"}</DialogTitle>
          <DialogDescription>
            El código es lo que identifica la bolsa en la grilla y en la hoja de
            devolución.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bolsa-codigo">Número o nombre</Label>
            <Input
              id="bolsa-codigo"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="Ej: 7, o Nicolás"
              className="h-10"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bolsa-nombre">Trabajador (opcional)</Label>
            <Input
              id="bolsa-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Para saber de quién es"
              className="h-10"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onAbrir(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={pending || !codigo.trim()}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoRango({
  rut,
  abierto,
  onAbrir,
  onGuardado,
}: {
  rut: string;
  abierto: boolean;
  onAbrir: (v: boolean) => void;
  onGuardado: () => void;
}) {
  const [desde, setDesde] = useState("1");
  const [hasta, setHasta] = useState("32");
  const [pending, setPending] = useState(false);

  const guardar = async () => {
    setPending(true);
    const res = await crearRangoDeBolsas(rut, {
      desde: Number(desde || 0),
      hasta: Number(hasta || 0),
    });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`${res.creadas} bolsa${res.creadas === 1 ? "" : "s"} creada${res.creadas === 1 ? "" : "s"}`);
    onGuardado();
  };

  return (
    <Dialog open={abierto} onOpenChange={onAbrir}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Cargar un rango</DialogTitle>
          <DialogDescription>
            Crea las bolsas numeradas de una vez. Las que ya existen se
            saltean, así que podés ampliar el rango más adelante sin problema.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rango-desde">Desde</Label>
            <InputNumero
              id="rango-desde"
              value={desde}
              onValueChange={setDesde}
              className="h-10"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rango-hasta">Hasta</Label>
            <InputNumero
              id="rango-hasta"
              value={hasta}
              onValueChange={setHasta}
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
            disabled={pending || !desde || !hasta || Number(hasta) < Number(desde)}
          >
            {pending ? "Creando…" : "Crear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
