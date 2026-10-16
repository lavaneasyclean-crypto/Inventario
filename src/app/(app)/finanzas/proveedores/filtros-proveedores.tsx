"use client";

import Link from "next/link";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function FiltrosProveedores({ inicial }: { inicial: string }) {
  return (
    <form
      action="/finanzas/proveedores"
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
            defaultValue={inicial}
            placeholder="Buscar por nombre, RUT, contacto o teléfono…"
            className="h-11 pl-9 text-base"
          />
        </div>
        <Button type="submit" size="lg" className="h-11 px-5">
          Buscar
        </Button>
      </div>

      {inicial && (
        <div className="mt-3 flex justify-end">
          <Link
            href="/finanzas/proveedores"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" /> Limpiar búsqueda
          </Link>
        </div>
      )}
    </form>
  );
}
