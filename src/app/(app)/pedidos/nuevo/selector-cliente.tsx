"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Search, X, UserPlus, User, Phone, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/browser";
import type { Cliente } from "@/lib/types";
import { crearCliente } from "./actions";

const RUT_RE = /^\d{1,8}-[\dkK]$/;

function normalizeRut(raw: string): string {
  return raw.replace(/\./g, "").replace(/\s/g, "").toUpperCase();
}

export function SelectorCliente({
  cliente,
  onSelect,
  onClear,
}: {
  cliente: Cliente | null;
  onSelect: (c: Cliente) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Cliente[]>([]);
  const [searching, setSearching] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (cliente) {
      setQuery("");
      setResults([]);
      return;
    }
    if (!query.trim()) {
      setResults([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const supabase = createClient();
      const term = `%${query}%`;
      const rutTerm = `%${normalizeRut(query)}%`;
      const { data } = await supabase
        .from("clientes")
        .select("rut, nombre, telefono, correo, comuna, calle, dpto")
        .or(
          `rut.ilike.${rutTerm},nombre.ilike.${term},telefono.ilike.${term}`,
        )
        .limit(8);
      setResults((data ?? []) as Cliente[]);
      setSearching(false);
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, cliente]);

  if (cliente) {
    return (
      <div className="rounded-lg border bg-background p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-medium">
              <User className="size-4 text-muted-foreground" />
              {cliente.nombre || "(sin nombre)"}
            </div>
            <div className="ml-6 mt-0.5 font-mono text-xs text-muted-foreground">
              {cliente.rut}
            </div>
            {cliente.telefono && (
              <div className="ml-6 mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Phone className="size-3" /> {cliente.telefono}
              </div>
            )}
            {(cliente.calle || cliente.comuna) && (
              <div className="ml-6 mt-0.5 text-xs text-muted-foreground">
                {[cliente.calle, cliente.dpto, cliente.comuna]
                  .filter(Boolean)
                  .join(", ")}
              </div>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X className="size-4" /> Cambiar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por RUT, nombre o teléfono..."
          className="h-11 pl-9 text-base"
          autoFocus
        />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {query && results.length > 0 && (
        <ul className="overflow-hidden rounded-lg border bg-background">
          {results.map((c) => (
            <li key={c.rut}>
              <button
                type="button"
                onClick={() => onSelect(c)}
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left transition-colors hover:bg-accent"
              >
                <span className="font-medium">{c.nombre || "(sin nombre)"}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {c.rut}
                  {c.telefono && <> · {c.telefono}</>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {query && !searching && results.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Sin resultados para &ldquo;{query}&rdquo;.
        </p>
      )}

      <Button
        type="button"
        variant="outline"
        onClick={() => setCreateOpen(true)}
        className="self-start"
      >
        <UserPlus className="size-4" /> Crear cliente nuevo
      </Button>

      <CrearClienteDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={onSelect}
        rutHint={query.match(/\d/) ? normalizeRut(query) : ""}
      />
    </div>
  );
}

function CrearClienteDialog({
  open,
  onOpenChange,
  onCreated,
  rutHint,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (c: Cliente) => void;
  rutHint: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Local form state (uncontrolled via ref-less useState)
  const [rut, setRut] = useState("");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [correo, setCorreo] = useState("");
  const [comuna, setComuna] = useState("");
  const [calle, setCalle] = useState("");
  const [dpto, setDpto] = useState("");

  useEffect(() => {
    if (open) {
      setRut(RUT_RE.test(rutHint) ? rutHint : "");
      setNombre("");
      setTelefono("");
      setCorreo("");
      setComuna("");
      setCalle("");
      setDpto("");
      setError(null);
    }
  }, [open, rutHint]);

  const handleSubmit = () => {
    setError(null);
    const rutNorm = normalizeRut(rut);
    if (!RUT_RE.test(rutNorm)) {
      setError("RUT con formato inválido. Ejemplo: 12345678-9");
      return;
    }
    if (!nombre.trim()) {
      setError("Nombre requerido");
      return;
    }
    start(async () => {
      try {
        const res = await crearCliente({
          rut: rutNorm,
          nombre: nombre.trim(),
          telefono: telefono.trim() || null,
          correo: correo.trim() || null,
          comuna: comuna.trim() || null,
          calle: calle.trim() || null,
          dpto: dpto.trim() || null,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        onCreated({
          rut: rutNorm,
          nombre: nombre.trim(),
          telefono: telefono.trim() || null,
          correo: correo.trim() || null,
          comuna: comuna.trim() || null,
          calle: calle.trim() || null,
          dpto: dpto.trim() || null,
        });
        onOpenChange(false);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`No se pudo crear el cliente: ${msg}`);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo cliente</DialogTitle>
          <DialogDescription>
            Solo el RUT y el nombre son obligatorios.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <Field label="RUT" value={rut} onChange={setRut} placeholder="12345678-9" autoFocus />
          <Field label="Nombre" value={nombre} onChange={setNombre} />
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="Calle" value={calle} onChange={setCalle} />
            </div>
            <Field label="Dpto" value={dpto} onChange={setDpto} />
          </div>
          <Field label="Comuna" value={comuna} onChange={setComuna} />
          <Field label="Teléfono" value={telefono} onChange={setTelefono} type="tel" />
          <Field label="Correo" value={correo} onChange={setCorreo} type="email" />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={pending}>
            {pending ? "Creando…" : "Crear y usar"}
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
