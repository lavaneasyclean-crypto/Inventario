"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, X, Search } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import type {
  ProductoEmpresa,
  ProductoEmpresaAdquirido,
} from "@/lib/types";
import { formatCLP } from "@/lib/format";
import {
  asignarProducto,
  crearYAsignarProducto,
  desasignarProducto,
} from "./productos-actions";

export function ProductosManager({
  rut,
  productos,
  globalesDisponibles,
}: {
  rut: string;
  productos: ProductoEmpresaAdquirido[];
  globalesDisponibles: ProductoEmpresa[];
}) {
  const [agregarOpen, setAgregarOpen] = useState(false);

  const sinPrecio = productos.filter((p) => p.precio === null).length;

  return (
    <section className="rounded-xl border bg-background p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Productos de la empresa</h2>
          <p className="text-xs text-muted-foreground">
            Solo estos aparecen al crear pedidos. Cada uno con su precio para
            facturación.
          </p>
        </div>
        <Button size="sm" onClick={() => setAgregarOpen(true)}>
          <Plus className="size-4" /> Agregar producto
        </Button>
      </header>

      {sinPrecio > 0 && (
        <div className="mb-3 rounded border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
          Hay {sinPrecio} producto{sinPrecio === 1 ? "" : "s"} sin precio
          asignado. Hacé click para completarlo.
        </div>
      )}

      {productos.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          Esta empresa todavía no tiene productos. Agregá los que use para
          facturarle.
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {productos.map((p) => (
            <ProductoCard key={p.producto_empresa_id} rut={rut} producto={p} />
          ))}
        </ul>
      )}

      <AgregarProductoDialog
        open={agregarOpen}
        onOpenChange={setAgregarOpen}
        rut={rut}
        globalesDisponibles={globalesDisponibles}
      />
    </section>
  );
}

function ProductoCard({
  rut,
  producto,
}: {
  rut: string;
  producto: ProductoEmpresaAdquirido;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const handleRemove = () => {
    start(async () => {
      const res = await desasignarProducto({
        rut_empresa: rut,
        producto_empresa_id: producto.producto_empresa_id,
      });
      if (res.ok) {
        setConfirmRemove(false);
        router.refresh();
      }
    });
  };

  return (
    <li className="rounded-lg border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium">{producto.nombre}</div>
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="mt-1 text-left font-mono text-base font-semibold tabular-nums hover:underline"
          >
            {producto.precio === null ? (
              <span className="text-amber-700 dark:text-amber-400">
                Sin precio
              </span>
            ) : (
              formatCLP(producto.precio)
            )}
          </button>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setEditOpen(true)}
            aria-label="Editar precio"
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setConfirmRemove(true)}
            aria-label="Quitar producto"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <EditarPrecioDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        rut={rut}
        producto={producto}
      />

      <Dialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Quitar &ldquo;{producto.nombre}&rdquo;?</DialogTitle>
            <DialogDescription>
              No aparecerá más al crear pedidos para esta empresa. El producto
              sigue existiendo en el catálogo global y los pedidos antiguos no
              se modifican.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmRemove(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemove}
              disabled={pending}
            >
              {pending ? "Quitando…" : "Sí, quitar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}

function EditarPrecioDialog({
  open,
  onOpenChange,
  rut,
  producto,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rut: string;
  producto: ProductoEmpresaAdquirido;
}) {
  const router = useRouter();
  const [precio, setPrecio] = useState(producto.precio?.toString() ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-init when open changes
  if (open && precio === "" && producto.precio !== null) {
    setPrecio(producto.precio.toString());
  }

  const submit = async () => {
    setError(null);
    const trimmed = precio.trim();
    const precioNum = trimmed === "" ? null : parseInt(trimmed, 10);
    if (precioNum !== null && Number.isNaN(precioNum)) {
      setError("Precio debe ser un número entero o vacío");
      return;
    }
    setLoading(true);
    try {
      const res = await asignarProducto({
        rut_empresa: rut,
        producto_empresa_id: producto.producto_empresa_id,
        precio: precioNum,
      });
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Precio de {producto.nombre}</DialogTitle>
          <DialogDescription>
            Solo afecta a esta empresa. Los pedidos pasados conservan su
            precio histórico.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="precio">Precio (CLP)</Label>
            <Input
              id="precio"
              type="number"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              placeholder="0"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Dejar vacío si no querés definir precio todavía.
            </p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button onClick={submit} disabled={loading}>
            {loading ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AgregarProductoDialog({
  open,
  onOpenChange,
  rut,
  globalesDisponibles,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rut: string;
  globalesDisponibles: ProductoEmpresa[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"existente" | "nuevo">("existente");
  const [query, setQuery] = useState("");

  // Estado para "nuevo"
  const [nombre, setNombre] = useState("");
  const [precio, setPrecio] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estado para "existente"
  const [seleccionado, setSeleccionado] = useState<ProductoEmpresa | null>(null);
  const [precioExistente, setPrecioExistente] = useState("");

  if (!open && (nombre || precio || seleccionado || precioExistente || query)) {
    setTimeout(() => {
      setNombre("");
      setPrecio("");
      setSeleccionado(null);
      setPrecioExistente("");
      setQuery("");
      setError(null);
    }, 200);
  }

  const filtered = !query
    ? globalesDisponibles.slice(0, 10)
    : globalesDisponibles
        .filter((p) =>
          (p.nombre + " " + p.id).toLowerCase().includes(query.toLowerCase()),
        )
        .slice(0, 10);

  const submitExistente = async () => {
    setError(null);
    if (!seleccionado) {
      setError("Elegí un producto");
      return;
    }
    const trimmed = precioExistente.trim();
    const precioNum = trimmed === "" ? null : parseInt(trimmed, 10);
    if (precioNum !== null && Number.isNaN(precioNum)) {
      setError("Precio inválido");
      return;
    }
    setLoading(true);
    try {
      const res = await asignarProducto({
        rut_empresa: rut,
        producto_empresa_id: seleccionado.id,
        precio: precioNum,
      });
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const submitNuevo = async () => {
    setError(null);
    if (!nombre.trim()) {
      setError("Nombre requerido");
      return;
    }
    const trimmed = precio.trim();
    const precioNum = trimmed === "" ? null : parseInt(trimmed, 10);
    if (precioNum !== null && Number.isNaN(precioNum)) {
      setError("Precio inválido");
      return;
    }
    setLoading(true);
    try {
      const res = await crearYAsignarProducto({
        rut_empresa: rut,
        nombre: nombre.trim(),
        precio: precioNum,
      });
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar producto a la empresa</DialogTitle>
          <DialogDescription>
            Elegí uno del catálogo global o creá uno nuevo.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => setTab("existente")}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              tab === "existente" ? "bg-background shadow-sm" : "text-muted-foreground"
            }`}
          >
            Del catálogo
          </button>
          <button
            type="button"
            onClick={() => setTab("nuevo")}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              tab === "nuevo" ? "bg-background shadow-sm" : "text-muted-foreground"
            }`}
          >
            Crear nuevo
          </button>
        </div>

        {tab === "existente" ? (
          <div className="grid gap-3">
            {seleccionado ? (
              <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
                <div>
                  <div className="font-medium">{seleccionado.nombre}</div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {seleccionado.id}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSeleccionado(null)}
                >
                  <X className="size-4" /> Cambiar
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar en el catálogo..."
                    className="pl-9"
                    autoFocus
                  />
                </div>
                {globalesDisponibles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Esta empresa ya tiene asignados todos los productos del
                    catálogo global. Si querés uno distinto, creá uno nuevo en
                    la otra solapa.
                  </p>
                ) : filtered.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Sin resultados. Probá &ldquo;Crear nuevo&rdquo;.
                  </p>
                ) : (
                  <ul className="max-h-64 overflow-y-auto rounded-lg border">
                    {filtered.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setSeleccionado(p)}
                          className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-accent"
                        >
                          <span className="font-medium">{p.nombre}</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {p.id}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {seleccionado && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="precio-ex">Precio para esta empresa (opcional)</Label>
                <Input
                  id="precio-ex"
                  type="number"
                  value={precioExistente}
                  onChange={(e) => setPrecioExistente(e.target.value)}
                  placeholder="0"
                  autoFocus
                />
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button
                onClick={submitExistente}
                disabled={loading || !seleccionado}
              >
                {loading ? "Guardando…" : "Agregar"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nombre">Nombre</Label>
              <Input
                id="nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Sábanas C/E, Mantel rectangular..."
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Es el nombre que aparecerá en los pedidos y la facturación.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="precio-nuevo">Precio (opcional)</Label>
              <Input
                id="precio-nuevo"
                type="number"
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
                placeholder="0"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button onClick={submitNuevo} disabled={loading}>
                {loading ? "Creando…" : "Crear y agregar"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
