"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORIA_GASTO_LABELS, CATEGORIAS_GASTO } from "@/lib/types";
import type { GastosFilter } from "@/lib/data/finanzas";

export function FiltrosGastos({ initial }: { initial: GastosFilter }) {
  const [categoria, setCategoria] = useState(initial.categoria ?? "todas");
  const [pago, setPago] = useState(initial.pago ?? "todos");

  const algunFiltro =
    !!initial.q ||
    (initial.categoria && initial.categoria !== "todas") ||
    (initial.pago && initial.pago !== "todos") ||
    !!initial.desde ||
    !!initial.hasta;

  return (
    <form
      action="/finanzas/gastos"
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
            defaultValue={initial.q ?? ""}
            placeholder="Buscar por descripción, proveedor o documento…"
            className="h-11 pl-9 text-base"
          />
        </div>
        <Button type="submit" size="lg" className="h-11 px-5">
          Buscar
        </Button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="categoria">Categoría</Label>
          <Select
            value={categoria}
            onValueChange={(v) => setCategoria((v as typeof categoria) ?? "todas")}
          >
            <SelectTrigger id="categoria" className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {CATEGORIAS_GASTO.map((c) => (
                <SelectItem key={c} value={c}>
                  {CATEGORIA_GASTO_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input type="hidden" name="categoria" value={categoria} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pago">Estado</Label>
          <Select
            value={pago}
            onValueChange={(v) => setPago((v as typeof pago) ?? "todos")}
          >
            <SelectTrigger id="pago" className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="pendiente">Por pagar</SelectItem>
              <SelectItem value="pagado">Pagados</SelectItem>
            </SelectContent>
          </Select>
          <input type="hidden" name="pago" value={pago} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="desde">Desde</Label>
          <Input
            id="desde"
            type="date"
            name="desde"
            defaultValue={initial.desde ?? ""}
            className="h-10"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="hasta">Hasta</Label>
          <Input
            id="hasta"
            type="date"
            name="hasta"
            defaultValue={initial.hasta ?? ""}
            className="h-10"
          />
        </div>
      </div>

      {algunFiltro && (
        <div className="mt-3 flex items-center justify-end">
          <Link
            href="/finanzas/gastos"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" /> Limpiar filtros
          </Link>
        </div>
      )}
    </form>
  );
}
