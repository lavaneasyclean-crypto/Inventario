"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, Plus, Search, X } from "lucide-react";
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
import type { ClienteEmpresa, ProductoEmpresa } from "@/lib/types";
import { crearPedidoEmpresa } from "./actions";

interface ItemDraft {
  key: string;
  producto_empresa_id: string;
  nombre: string;
  cantidad: number;
  detalle: string;
}

export function NuevoPedidoEmpresaForm({
  empresas,
  productos,
  empresaInicial,
}: {
  empresas: ClienteEmpresa[];
  productos: ProductoEmpresa[];
  empresaInicial: ClienteEmpresa | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [empresa, setEmpresa] = useState<ClienteEmpresa | null>(empresaInicial);
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [detalle, setDetalle] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [productoQuery, setProductoQuery] = useState("");

  const filtered = useMemo(() => {
    const q = productoQuery.trim().toLowerCase();
    if (!q) return [] as ProductoEmpresa[];
    return productos
      .filter(
        (p) =>
          p.nombre.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [productos, productoQuery]);

  const totalUnidades = items.reduce((s, it) => s + it.cantidad, 0);
  const canSubmit = !!empresa && items.length > 0 && !loading;

  const addItem = (p: ProductoEmpresa) => {
    setItems((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        producto_empresa_id: p.id,
        nombre: p.nombre,
        cantidad: 1,
        detalle: "",
      },
    ]);
    setProductoQuery("");
  };

  const updateItem = (key: string, patch: Partial<ItemDraft>) =>
    setItems((prev) =>
      prev.map((it) => (it.key === key ? { ...it, ...patch } : it)),
    );

  const removeItem = (key: string) =>
    setItems((prev) => prev.filter((it) => it.key !== key));

  const handleSubmit = async () => {
    if (!empresa) {
      setError("Elegí una empresa");
      return;
    }
    if (items.length === 0) {
      setError("Agregá al menos un item");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await crearPedidoEmpresa({
        rut_empresa: empresa.rut,
        alias: empresa.alias,
        fecha: new Date(`${fecha}T12:00:00-03:00`).toISOString(),
        detalle: detalle.trim() || null,
        items: items.map((it) => ({
          producto_empresa_id: it.producto_empresa_id,
          nombre: it.nombre,
          cantidad: it.cantidad,
          detalle: it.detalle.trim() || null,
        })),
      });
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/empresas/pedidos/${res.id}`);
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Section title="1. Empresa">
        {empresa ? (
          <div className="flex items-start justify-between gap-3 rounded-lg border bg-background p-3">
            <div className="flex items-start gap-2">
              <Building2 className="mt-0.5 size-4 text-muted-foreground" />
              <div>
                <div className="font-medium">{empresa.nombre}</div>
                {empresa.alias && empresa.alias !== empresa.nombre && (
                  <div className="text-xs text-muted-foreground">
                    Alias: {empresa.alias}
                  </div>
                )}
                <div className="font-mono text-xs text-muted-foreground">
                  {empresa.rut}
                </div>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setEmpresa(null)}>
              <X className="size-4" /> Cambiar
            </Button>
          </div>
        ) : (
          <Select
            value=""
            onValueChange={(v) => {
              const e = empresas.find((x) => x.rut === v);
              if (e) setEmpresa(e);
            }}
          >
            <SelectTrigger className="h-11">
              <SelectValue placeholder="Elegir empresa..." />
            </SelectTrigger>
            <SelectContent>
              {empresas.map((e) => (
                <SelectItem key={e.rut} value={e.rut}>
                  {e.alias || e.nombre}
                  <span className="ml-2 font-mono text-xs text-muted-foreground">
                    {e.rut}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Section>

      <Section title="2. Items">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={productoQuery}
            onChange={(e) => setProductoQuery(e.target.value)}
            placeholder="Buscar producto empresa..."
            className="h-11 pl-9 text-base"
          />
        </div>
        {productoQuery && filtered.length > 0 && (
          <ul className="mt-2 overflow-hidden rounded-lg border bg-background">
            {filtered.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => addItem(p)}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-accent"
                >
                  <div>
                    <div className="font-medium">{p.nombre}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {p.id}
                    </div>
                  </div>
                  <Plus className="size-4 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {items.length === 0 ? (
          <p className="mt-3 rounded-lg border bg-background p-6 text-center text-sm text-muted-foreground">
            Buscá productos arriba y agregalos al pedido.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {items.map((it) => (
              <li key={it.key} className="rounded-lg border bg-background p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium">{it.nombre}</div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeItem(it.key)}
                    aria-label="Quitar item"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
                <div className="mt-2 grid grid-cols-[100px_1fr] items-end gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Cantidad
                    </label>
                    <Input
                      type="number"
                      min={1}
                      value={it.cantidad}
                      onChange={(e) =>
                        updateItem(it.key, {
                          cantidad: Math.max(1, parseInt(e.target.value || "1")),
                        })
                      }
                      className="h-10"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Detalle (opcional)
                    </label>
                    <Input
                      value={it.detalle}
                      onChange={(e) =>
                        updateItem(it.key, { detalle: e.target.value })
                      }
                      className="h-10"
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="3. Detalles">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fecha">Fecha</Label>
            <Input
              id="fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="h-10"
            />
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-1.5">
          <Label htmlFor="detalle">Detalle / Notas (opcional)</Label>
          <Input
            id="detalle"
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
            placeholder="Cualquier observación sobre el pedido"
            className="h-10"
          />
        </div>
      </Section>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t bg-background/95 p-4 backdrop-blur sm:-mx-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          {items.length === 0
            ? "Sin items"
            : `${items.length} item${items.length === 1 ? "" : "s"} · ${totalUnidades} unidades`}
        </div>
        <Button
          type="button"
          size="lg"
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="h-11 px-6 text-base"
        >
          <Check className="size-5" />
          {loading ? "Creando…" : "Crear pedido"}
        </Button>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-background p-4">
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}
