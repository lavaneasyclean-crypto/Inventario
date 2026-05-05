"use client";

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
import { useState } from "react";
import type { PedidosFilter } from "@/lib/data/pedidos";

export function FiltrosPedidos({ initial }: { initial: PedidosFilter }) {
  // Estado local solo para los selects controlados (evita hidratación rara)
  const [estado, setEstado] = useState(initial.estado ?? "todos");
  const [pago, setPago] = useState(initial.pago ?? "todos");

  const algunFiltro =
    !!initial.q ||
    (initial.estado && initial.estado !== "todos") ||
    (initial.pago && initial.pago !== "todos") ||
    !!initial.desde ||
    !!initial.hasta;

  return (
    <form
      action="/pedidos"
      method="get"
      className="rounded-xl border bg-background p-4"
    >
      {/* Búsqueda principal */}
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
            placeholder="Buscar por # de pedido, nombre o RUT..."
            className="h-11 pl-9 text-base"
          />
        </div>
        <Button type="submit" size="lg" className="h-11 px-5">
          Buscar
        </Button>
      </div>

      {/* Filtros avanzados */}
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
              <SelectItem value="recibido">En proceso</SelectItem>
              <SelectItem value="listo">Listos para retirar</SelectItem>
              <SelectItem value="entregado">Entregados</SelectItem>
              <SelectItem value="anulado">Anulados</SelectItem>
            </SelectContent>
          </Select>
          <input type="hidden" name="estado" value={estado} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pago">Pago</Label>
          <Select
            value={pago}
            onValueChange={(v) => setPago((v as typeof pago) ?? "todos")}
          >
            <SelectTrigger id="pago" className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="pagado">Pagados</SelectItem>
              <SelectItem value="sin_pagar">Sin pagar</SelectItem>
            </SelectContent>
          </Select>
          <input type="hidden" name="pago" value={pago} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="desde">Recibido desde</Label>
          <Input
            id="desde"
            type="date"
            name="desde"
            defaultValue={initial.desde ?? ""}
            className="h-10"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="hasta">Recibido hasta</Label>
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
            href="/pedidos"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" /> Limpiar filtros
          </Link>
        </div>
      )}
    </form>
  );
}
