"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Buscador } from "@/components/buscador";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ACCIONES, ENTIDADES_AUDITADAS } from "@/lib/historial";

/**
 * Los filtros del historial.
 *
 * Van en la URL y no en estado local para que un filtro se pueda mandar por
 * mensaje: "mirá lo que pasó con la guía 1670" es un link, no una
 * explicación de qué apretar.
 */
export function FiltrosHistorial() {
  const router = useRouter();
  const params = useSearchParams();

  const set = (clave: string, valor: string) => {
    const p = new URLSearchParams(params.toString());
    if (!valor || valor === "todas") p.delete(clave);
    else p.set(clave, valor);
    router.replace(`/historial?${p.toString()}`, { scroll: false });
  };

  const valor = (k: string) => params.get(k) ?? "";

  return (
    <div className="mb-4 rounded-xl border bg-background p-4">
      <Buscador
        defaultValue={valor("q")}
        placeholder="Número de pedido o guía, o el correo de quien lo hizo"
      />

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="entidad">Qué</Label>
          <select
            id="entidad"
            value={valor("entidad") || "todas"}
            onChange={(e) => set("entidad", e.target.value)}
            className="h-11 rounded-md border bg-background px-3 text-base"
          >
            {ENTIDADES_AUDITADAS.map((e) => (
              <option key={e.valor} value={e.valor}>
                {e.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="accion">Tipo de cambio</Label>
          <select
            id="accion"
            value={valor("accion") || "todas"}
            onChange={(e) => set("accion", e.target.value)}
            className="h-11 rounded-md border bg-background px-3 text-base"
          >
            {ACCIONES.map((a) => (
              <option key={a.valor} value={a.valor}>
                {a.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="desde">Desde</Label>
          <Input
            id="desde"
            type="date"
            value={valor("desde")}
            onChange={(e) => set("desde", e.target.value)}
            className="h-11"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="hasta">Hasta</Label>
          <Input
            id="hasta"
            type="date"
            value={valor("hasta")}
            onChange={(e) => set("hasta", e.target.value)}
            className="h-11"
          />
        </div>
      </div>
    </div>
  );
}
