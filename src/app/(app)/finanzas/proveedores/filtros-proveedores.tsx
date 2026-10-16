"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Buscador } from "@/components/buscador";

export function FiltrosProveedores({ inicial }: { inicial: string }) {
  return (
    <form
      action="/finanzas/proveedores"
      method="get"
      className="rounded-xl border bg-background p-4"
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <Buscador
          defaultValue={inicial}
          placeholder="Buscar por nombre, RUT, contacto o teléfono…"
        />
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
