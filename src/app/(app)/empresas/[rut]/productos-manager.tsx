"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Trash2,
  X,
  Search,
} from "lucide-react";
import { toast } from "sonner";
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
import { InputNumero } from "@/components/input-numero";
import { Label } from "@/components/ui/label";
import type {
  ProductoEmpresa,
  ProductoEmpresaAdquirido,
} from "@/lib/types";
import { formatCLP } from "@/lib/format";
import { moverProducto } from "@/lib/orden-productos";
import {
  asignarProducto,
  crearYAsignarProducto,
  desasignarProducto,
  reordenarProductos,
} from "./productos-actions";

export function ProductosManager({
  rut,
  productos,
  globalesDisponibles,
  ordenImporta = false,
}: {
  rut: string;
  productos: ProductoEmpresaAdquirido[];
  globalesDisponibles: ProductoEmpresa[];
  /**
   * Muestra las flechas para acomodar el orden. Solo hace falta donde ese
   * orden se nota: en la grilla de bolsas, que lo usa para sus columnas.
   */
  ordenImporta?: boolean;
}) {
  const [agregarOpen, setAgregarOpen] = useState(false);
  // Copia local para que la lista se mueva al instante. El servidor confirma
  // despues; si falla, se vuelve a lo que diga la base.
  const [orden, setOrden] = useState(productos);
  const [guardandoOrden, setGuardandoOrden] = useState(false);
  const routerOrden = useRouter();

  // La lista del servidor manda: si cambia —se agrego o borro una prenda— se
  // descarta la copia local en vez de quedar mostrando algo viejo.
  const [previas, setPrevias] = useState(productos);
  if (previas !== productos) {
    setPrevias(productos);
    setOrden(productos);
  }

  const lista = ordenImporta ? orden : productos;
  const sinPrecio = productos.filter((p) => p.precio === null).length;

  const mover = async (id: string, direccion: -1 | 1) => {
    const nueva = moverProducto(orden, id, direccion);
    if (nueva === orden) return;
    setOrden(nueva);
    setGuardandoOrden(true);
    const res = await reordenarProductos(
      rut,
      nueva.map((p) => p.producto_empresa_id),
    );
    setGuardandoOrden(false);
    if (!res.ok) {
      setOrden(productos);
      toast.error(res.error);
      return;
    }
    routerOrden.refresh();
  };

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

      {ordenImporta && productos.length > 1 && (
        <p className="mb-3 rounded border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Este orden es el de las columnas en la grilla de carga. Acomodalo
          igual que la planilla de papel: así cada columna cae donde la
          esperás y no se anota una cantidad en la prenda de al lado.
          {guardandoOrden && <span className="ml-1">Guardando…</span>}
        </p>
      )}

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
          {lista.map((p, i) => (
            <ProductoCard
              key={p.producto_empresa_id}
              rut={rut}
              producto={p}
              posicion={ordenImporta ? i + 1 : null}
              onSubir={
                ordenImporta && i > 0
                  ? () => mover(p.producto_empresa_id, -1)
                  : undefined
              }
              onBajar={
                ordenImporta && i < lista.length - 1
                  ? () => mover(p.producto_empresa_id, 1)
                  : undefined
              }
            />
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
  posicion,
  onSubir,
  onBajar,
}: {
  rut: string;
  producto: ProductoEmpresaAdquirido;
  posicion?: number | null;
  onSubir?: () => void;
  onBajar?: () => void;
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
        {(onSubir || onBajar) && (
          <div className="flex shrink-0 flex-col">
            <button
              type="button"
              onClick={onSubir}
              disabled={!onSubir}
              aria-label={`Subir ${producto.nombre}`}
              className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-25 disabled:hover:bg-transparent"
            >
              <ChevronUp className="size-4" />
            </button>
            <button
              type="button"
              onClick={onBajar}
              disabled={!onBajar}
              aria-label={`Bajar ${producto.nombre}`}
              className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-25 disabled:hover:bg-transparent"
            >
              <ChevronDown className="size-4" />
            </button>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5 font-medium">
            {posicion != null && (
              <span className="font-mono text-xs text-muted-foreground">
                {posicion}.
              </span>
            )}
            <span className="truncate">{producto.nombre}</span>
          </div>
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

  // Reset al abrir. Antes la condicion era `precio === ""`, que tambien se
  // cumple cuando la persona borra el campo a mano: el precio volvia a
  // aparecer solo y era imposible dejarlo vacio, justo lo que el texto de
  // abajo dice que se puede hacer.
  const [abiertoPrevio, setAbiertoPrevio] = useState(open);
  if (open !== abiertoPrevio) {
    setAbiertoPrevio(open);
    if (open) {
      setPrecio(producto.precio?.toString() ?? "");
      setError(null);
    }
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
            <InputNumero
              id="precio"
              value={precio}
              onValueChange={setPrecio}
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
                <InputNumero
                  id="precio-ex"
                  value={precioExistente}
                  onValueChange={setPrecioExistente}
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
              <InputNumero
                id="precio-nuevo"
                value={precio}
                onValueChange={setPrecio}
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
