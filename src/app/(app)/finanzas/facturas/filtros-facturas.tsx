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
import type { FacturasFilter } from "@/lib/data/finanzas";

export function FiltrosFacturas({ initial }: { initial: FacturasFilter }) {
  const [estado, setEstado] = useState(initial.estado ?? "todos");
  const [tipo, setTipo] = useState(initial.tipo ?? "todos");

  const algunFiltro =
    !!initial.q ||
    !!initial.rut ||
    (initial.estado && initial.estado !== "todos") ||
    (initial.tipo && initial.tipo !== "todos") ||
    !!initial.desde ||
    !!initial.hasta;

  return (
    <form
      action="/finanzas/facturas"
      method="get"
      className="rounded-xl border bg-background p-4"
    >
      {/* Se llega aca desde la ficha de una empresa con ?rut=. Sin esto, el
          primer uso del buscador perdia ese filtro sin avisar. */}
      {initial.rut && <input type="hidden" name="rut" value={initial.rut} />}

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
            placeholder="Buscar por folio o empresa…"
            className="h-11 pl-9 text-base"
          />
        </div>
        <Button type="submit" size="lg" className="h-11 px-5">
          Buscar
        </Button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="estado">Estado</Label>
          <Select
            value={estado}
            onValueChange={(v) => setEstado((v as typeof estado) ?? "todos")}
          >
            <SelectTrigger id="estado" className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="pendiente">Por cobrar</SelectItem>
              <SelectItem value="pagada">Pagadas</SelectItem>
              <SelectItem value="anulada">Anuladas</SelectItem>
            </SelectContent>
          </Select>
          <input type="hidden" name="estado" value={estado} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tipo">Documento</Label>
          <Select
            value={tipo}
            onValueChange={(v) => setTipo((v as typeof tipo) ?? "todos")}
          >
            <SelectTrigger id="tipo" className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="normal">Factura normal</SelectItem>
              <SelectItem value="express">Recargo express</SelectItem>
            </SelectContent>
          </Select>
          <input type="hidden" name="tipo" value={tipo} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="desde">Emitida desde</Label>
          <Input
            id="desde"
            type="date"
            name="desde"
            defaultValue={initial.desde ?? ""}
            className="h-10"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="hasta">Emitida hasta</Label>
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
            href="/finanzas/facturas"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" /> Limpiar filtros
          </Link>
        </div>
      )}
    </form>
  );
}
