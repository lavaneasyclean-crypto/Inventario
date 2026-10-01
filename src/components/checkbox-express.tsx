"use client";

import Link from "next/link";
import { Zap } from "lucide-react";

/**
 * Marca una guía de empresa como express.
 *
 * El recargo no se elige acá: lo fija la empresa una vez y esta casilla solo
 * dice si esta guía lo paga. Si la empresa todavía no tiene recargo cargado se
 * muestra igual, deshabilitada y con el link para configurarlo, en vez de
 * esconder la opción: esconderla haría pensar que la app no soporta express.
 */
export function CheckboxExpress({
  checked,
  onChange,
  recargo,
  rutEmpresa,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  recargo: number;
  rutEmpresa?: string;
}) {
  const configurado = recargo > 0;

  return (
    <label
      className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
        !configurado
          ? "cursor-not-allowed opacity-70"
          : checked
            ? "cursor-pointer border-violet-500/60 bg-violet-50 dark:bg-violet-950/20"
            : "cursor-pointer hover:bg-accent"
      }`}
    >
      <input
        type="checkbox"
        checked={checked && configurado}
        disabled={!configurado}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Zap className="size-4 text-violet-600 dark:text-violet-400" />
          Servicio express
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {configurado ? (
            <>
              Se cobra un <strong>{recargo}% adicional</strong> sobre el precio
              base. Va en una factura aparte de la del mes.
            </>
          ) : (
            <>
              Esta empresa no tiene recargo express configurado.{" "}
              {rutEmpresa && (
                <Link
                  href={`/empresas/${encodeURIComponent(rutEmpresa)}`}
                  className="underline underline-offset-2"
                >
                  Cargalo en su ficha
                </Link>
              )}
            </>
          )}
        </span>
      </span>
    </label>
  );
}
