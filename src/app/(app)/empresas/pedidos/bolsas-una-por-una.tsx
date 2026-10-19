"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { claveCelda } from "@/lib/bolsas";
import { formatCLP } from "@/lib/format";
import type { EmpresaBolsa, ProductoEmpresaAdquirido } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * La misma grilla, una bolsa a la vez.
 *
 * En Termomin son 20 bolsas por 8 prendas. Esa tabla en un monitor se llena
 * copiando de la planilla de papel y funciona; en un teléfono hay que arrastrar
 * de costado para ver la columna y uno termina anotando la cantidad en la
 * prenda de al lado.
 *
 * Acá se trabaja como se cuenta de verdad: se agarra una bolsa, se cuentan sus
 * prendas, se pasa a la siguiente. Las cantidades se tocan con + y − porque
 * cargando de pie, con una bolsa en la mano, abrir el teclado numérico para
 * escribir "3" es peor que apretar tres veces.
 *
 * Comparte el estado con la tabla: es la misma guía vista de otra forma, no
 * otra pantalla. Lo que se carga acá se ve allá y al revés.
 */
export function BolsasUnaPorUna({
  bolsas,
  productos,
  celdas,
  setCelda,
}: {
  bolsas: EmpresaBolsa[];
  productos: ProductoEmpresaAdquirido[];
  celdas: Record<string, string>;
  setCelda: (bolsaId: number, productoId: string, valor: string) => void;
}) {
  const [i, setI] = useState(0);
  const bolsa = bolsas[i];

  if (!bolsa) return null;

  const totalDe = (b: EmpresaBolsa) =>
    productos.reduce((s, p) => {
      const v = Number(celdas[claveCelda(b.id, p.producto_empresa_id)] ?? 0);
      return s + (Number.isFinite(v) ? v : 0);
    }, 0);

  const totalBolsa = totalDe(bolsa);
  const conPrendas = bolsas.filter((b) => totalDe(b) > 0).length;

  return (
    <div className="flex flex-col gap-3">
      {/* Dónde estoy y cuánto llevo: cargando de pie, perder la cuenta de qué
          bolsa va es el error caro. */}
      <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
        <span>
          Bolsa <strong>{i + 1}</strong> de {bolsas.length}
        </span>
        <span className="text-muted-foreground">
          {conPrendas} con prendas
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Bolsa anterior"
          disabled={i === 0}
          onClick={() => setI(i - 1)}
        >
          <ChevronLeft className="size-5" />
        </Button>

        <div className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-center">
          <div className="font-mono text-xl font-semibold">{bolsa.codigo}</div>
          {bolsa.nombre && (
            <div className="truncate text-sm text-muted-foreground">
              {bolsa.nombre}
            </div>
          )}
        </div>

        <Button
          variant="outline"
          size="icon"
          aria-label="Bolsa siguiente"
          disabled={i === bolsas.length - 1}
          onClick={() => setI(i + 1)}
        >
          <ChevronRight className="size-5" />
        </Button>
      </div>

      <ul className="rounded-lg border bg-background">
        {productos.map((p) => {
          const k = claveCelda(bolsa.id, p.producto_empresa_id);
          const valor = celdas[k] ?? "";
          const n = Number(valor || 0);

          return (
            <li
              key={k}
              className="flex items-center gap-2 border-b px-3 py-2 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{p.nombre}</div>
                <div className="text-xs text-muted-foreground">
                  {p.precio == null ? (
                    <span className="text-amber-700 dark:text-amber-400">
                      sin precio
                    </span>
                  ) : (
                    formatCLP(p.precio)
                  )}
                </div>
              </div>

              <Button
                variant="outline"
                size="icon"
                aria-label={`Quitar una ${p.nombre}`}
                disabled={n <= 0}
                onClick={() =>
                  setCelda(
                    bolsa.id,
                    p.producto_empresa_id,
                    n <= 1 ? "" : String(n - 1),
                  )
                }
              >
                <Minus className="size-4" />
              </Button>

              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                aria-label={`Cantidad de ${p.nombre}`}
                value={valor}
                onChange={(e) =>
                  setCelda(bolsa.id, p.producto_empresa_id, e.target.value)
                }
                className={cn(
                  "h-10 w-14 rounded-md border bg-background text-center text-base tabular-nums",
                  n > 0 && "border-primary font-semibold",
                )}
              />

              <Button
                variant="outline"
                size="icon"
                aria-label={`Agregar una ${p.nombre}`}
                onClick={() =>
                  setCelda(bolsa.id, p.producto_empresa_id, String(n + 1))
                }
              >
                <Plus className="size-4" />
              </Button>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
        <span>Prendas en esta bolsa</span>
        <span className="font-mono text-lg font-semibold">{totalBolsa}</span>
      </div>

      {/* Saltar a cualquiera sin pasar por todas: la ropa no siempre viene
          ordenada, y las ya cargadas se marcan para no contarlas dos veces. */}
      <div className="flex flex-wrap gap-1.5">
        {bolsas.map((b, idx) => {
          const cargada = totalDe(b) > 0;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => setI(idx)}
              className={cn(
                "min-w-10 rounded-md border px-2 py-1 font-mono text-xs transition-colors",
                idx === i && "ring-2 ring-primary",
                cargada
                  ? "border-primary bg-primary/10 font-semibold"
                  : "text-muted-foreground",
              )}
            >
              {b.codigo}
            </button>
          );
        })}
      </div>
    </div>
  );
}
