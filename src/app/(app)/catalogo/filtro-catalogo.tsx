"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TipoServicio } from "@/lib/types";
import { TIPO_SERVICIO_LABELS } from "@/lib/types";

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

export function FiltroCatalogo({
  initial,
}: {
  initial: { q: string; tipo: TipoServicio | "todos"; soloActivos: boolean };
}) {
  const [tipo, setTipo] = useState<TipoServicio | "todos">(initial.tipo);
  const algunFiltro = !!initial.q || initial.tipo !== "todos" || initial.soloActivos;

  return (
    <form
      action="/catalogo"
      method="get"
      className="rounded-xl border bg-background p-4"
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            name="q"
            defaultValue={initial.q}
            placeholder="Buscar por nombre o ID del producto..."
            className="h-11 pl-9 text-base"
          />
        </div>
        <Button type="submit" size="lg" className="h-11 px-5">
          Buscar
        </Button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tipo">Tipo de servicio</Label>
          <Select
            value={tipo}
            onValueChange={(v) =>
              setTipo((v as TipoServicio | "todos") ?? "todos")
            }
          >
            <SelectTrigger id="tipo" className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {TIPOS.map((t) => (
                <SelectItem key={t} value={t}>
                  {TIPO_SERVICIO_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input type="hidden" name="tipo" value={tipo} />
        </div>

        <label className="flex items-end gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            name="soloActivos"
            value="1"
            defaultChecked={initial.soloActivos}
            className="size-4"
          />
          <span>Solo activos</span>
        </label>
      </div>

      {algunFiltro && (
        <div className="mt-3 flex items-center justify-end">
          <Link
            href="/catalogo"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" /> Limpiar filtros
          </Link>
        </div>
      )}
    </form>
  );
}
