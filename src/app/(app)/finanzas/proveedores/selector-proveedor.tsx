"use client";

import { useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Proveedor } from "@/lib/types";
import { EditorProveedor } from "./editor-proveedor";

/**
 * Elige un proveedor ya cargado o crea uno sin salir del formulario.
 *
 * El alta al vuelo no es un lujo: el momento en que aparece un proveedor
 * nuevo es justo cuando se está cargando su primer gasto, y mandar a la
 * persona a otra pantalla es perder lo que venía escribiendo.
 */
export function SelectorProveedor({
  proveedores,
  valor,
  onCambio,
}: {
  proveedores: Proveedor[];
  valor: number | null;
  onCambio: (id: number | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [creando, setCreando] = useState(false);

  const elegido = proveedores.find((p) => p.id === valor) ?? null;

  const termino = query.trim().toLowerCase();
  const filtrados = !termino
    ? proveedores.slice(0, 8)
    : proveedores
        .filter((p) =>
          [p.nombre, p.rut, p.contacto]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(termino),
        )
        .slice(0, 8);

  // Si ya hay uno escrito igual, ofrecer "crear" sería invitar al duplicado:
  // el nombre es único en la base y el alta terminaría rechazada.
  const yaExiste = proveedores.some(
    (p) => p.nombre.trim().toLowerCase() === termino,
  );

  if (elegido) {
    return (
      <div className="flex flex-col gap-1.5">
        <Label>Proveedor (opcional)</Label>
        <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{elegido.nombre}</div>
            {elegido.rut && (
              <div className="font-mono text-xs text-muted-foreground">
                {elegido.rut}
              </div>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onCambio(null);
              setQuery("");
            }}
          >
            <X className="size-4" /> Cambiar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="g-proveedor">Proveedor (opcional)</Label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="g-proveedor"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar o crear…"
          className="h-10 pl-9"
        />
      </div>

      {filtrados.length > 0 && (
        <ul className="max-h-44 overflow-y-auto rounded-lg border">
          {filtrados.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  onCambio(p.id);
                  setQuery("");
                }}
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-accent"
              >
                <span className="text-sm font-medium">{p.nombre}</span>
                {(p.rut || p.contacto) && (
                  <span className="text-xs text-muted-foreground">
                    {[p.rut, p.contacto].filter(Boolean).join(" · ")}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {termino && filtrados.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Ninguno coincide con “{query.trim()}”.
        </p>
      )}

      {termino && !yaExiste && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setCreando(true)}
        >
          <Plus className="size-4" /> Crear “{query.trim()}”
        </Button>
      )}

      <EditorProveedor
        abierto={creando}
        onAbrir={setCreando}
        nombreInicial={query.trim()}
        onGuardado={(id) => {
          onCambio(id);
          setQuery("");
        }}
      />
    </div>
  );
}
