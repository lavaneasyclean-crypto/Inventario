"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MapPin, Package, Phone, Power } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatDateShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EmpresaResultado } from "@/lib/data/empresas";
import { cambiarActivoEmpresa } from "./actions";

/**
 * Una empresa en la lista.
 *
 * Una empresa inactiva se muestra en gris en vez de desaparecer. Esconderla
 * dejaba a quien la buscaba pensando que se había borrado; verla apagada dice
 * lo que de verdad pasa: existe, no se está trabajando con ella.
 *
 * Para quien no es admin además no se puede abrir: es el "no se puede elegir"
 * que se pidió. El admin sí entra, porque es quien la tiene que reactivar, y
 * tiene el botón acá mismo sin pasar por el diálogo de Editar —que es donde
 * estaba escondida la casilla y por eso no la encontraba nadie.
 */
export function TarjetaEmpresa({
  empresa: e,
  admin,
}: {
  empresa: EmpresaResultado;
  admin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activo, setActivo] = useState(e.activo);

  const alternar = () => {
    startTransition(async () => {
      const res = await cambiarActivoEmpresa(e.rut, !activo);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setActivo(!activo);
      toast.success(activo ? "Empresa desactivada" : "Empresa activada");
      router.refresh();
    });
  };

  const contenido = (
    <>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{e.nombre}</span>
          {!activo && (
            <span className="rounded border border-amber-500/40 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
              inactiva
            </span>
          )}
        </div>
        {e.alias && e.alias !== e.nombre && (
          <div className="text-xs text-muted-foreground">Alias: {e.alias}</div>
        )}
        <div className="font-mono text-xs text-muted-foreground">{e.rut}</div>
      </div>
      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        {e.contacto_1 && (
          <span className="flex items-center gap-1">
            <Phone className="size-3" /> {e.contacto_1}
          </span>
        )}
        {e.comuna && (
          <span className="flex items-center gap-1">
            <MapPin className="size-3" /> {e.comuna}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 font-medium">
          <Package className="size-3" /> {e.pedidos_count} pedido
          {e.pedidos_count === 1 ? "" : "s"}
        </span>
        {e.ultimo_pedido && (
          <span className="text-muted-foreground">
            Último: {formatDateShort(e.ultimo_pedido)}
          </span>
        )}
      </div>
    </>
  );

  // Apagada y sin permiso: se ve, no se entra.
  const inerte = !activo && !admin;
  const clases = cn(
    "flex h-full flex-col gap-2 rounded-lg border bg-background p-4 transition-colors",
    inerte
      ? "cursor-not-allowed opacity-55"
      : "hover:bg-accent",
  );

  return (
    <div className="flex h-full flex-col">
      {inerte ? (
        <div className={clases} aria-disabled title="Empresa inactiva">
          {contenido}
        </div>
      ) : (
        <Link href={`/empresas/${encodeURIComponent(e.rut)}`} className={clases}>
          {contenido}
        </Link>
      )}

      {admin && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 self-start text-xs"
          disabled={pending}
          onClick={alternar}
        >
          <Power className="size-3.5" />
          {activo ? "Desactivar" : "Activar"}
        </Button>
      )}
    </div>
  );
}
