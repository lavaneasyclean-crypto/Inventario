"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, PackageCheck, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BotonGuardar } from "@/components/boton-guardar";
import { Input } from "@/components/ui/input";
import { formatDateShort } from "@/lib/format";
import { marcarEntregaGuia, marcarPagoGuia } from "./actions";

/**
 * Cuándo se entregó y cuándo se pagó la guía.
 *
 * La entrega es el respaldo para la discusión de siempre: la empresa dice que
 * no le devolvieron la ropa. Con fecha, la conversación se termina.
 *
 * El pago es para las empresas que pagan guía por guía. En las que se facturan
 * a fin de mes el pago real vive en la factura, y por eso se muestra al lado
 * en qué factura entró: para que no queden diciendo cosas distintas.
 */
export function FechasGuia({
  id,
  fechaEntrega,
  fechaPago,
  hoy,
  facturas,
}: {
  id: number;
  fechaEntrega: string | null;
  fechaPago: string | null;
  hoy: string;
  facturas: { id: number; folio: string | null }[];
}) {
  return (
    <section className="mb-6 rounded-xl border bg-background p-4">
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
        Entrega y pago
      </h2>
      <div className="flex flex-col gap-3">
        <Fila
          icono={PackageCheck}
          etiqueta="Entregada"
          valor={fechaEntrega}
          hoy={hoy}
          vacio="Todavía no se entregó"
          guardar={(f) => marcarEntregaGuia(id, f)}
        />
        <Fila
          icono={Wallet}
          etiqueta="Pagada"
          valor={fechaPago}
          hoy={hoy}
          vacio="Sin pagar"
          guardar={(f) => marcarPagoGuia(id, f)}
          nota={
            facturas.length > 0
              ? `Esta guía ya está en la factura ${facturas
                  .map((f) => f.folio ?? `#${f.id}`)
                  .join(", ")}. Si la empresa paga por factura, el pago se
                  registra ahí.`
              : undefined
          }
        />
      </div>
    </section>
  );
}

function Fila({
  icono: Icono,
  etiqueta,
  valor,
  hoy,
  vacio,
  nota,
  guardar,
}: {
  icono: typeof PackageCheck;
  etiqueta: string;
  valor: string | null;
  hoy: string;
  vacio: string;
  nota?: string;
  guardar: (fecha: string | null) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [fecha, setFecha] = useState(hoy);
  const [pending, setPending] = useState(false);

  const correr = async (f: string | null, exito: string) => {
    setPending(true);
    const res = await guardar(f);
    setPending(false);
    if (!res.ok) {
      toast.error(res.error ?? "No se pudo guardar.");
      return;
    }
    toast.success(exito);
    setEditando(false);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Icono className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="text-sm font-medium">{etiqueta}</span>

        {valor ? (
          <>
            <span className="text-sm">{formatDateShort(valor)}</span>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => correr(null, `${etiqueta}: marca quitada`)}
            >
              <X className="size-4" /> Quitar
            </Button>
          </>
        ) : editando ? (
          <>
            <Input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="h-9 w-auto"
            />
            <BotonGuardar
              size="sm"
              pending={pending}
              faltan={[!fecha && "la fecha"]}
              onClick={() => correr(fecha, `${etiqueta} el ${fecha}`)}
            >
              <Check className="size-4" /> Guardar
            </BotonGuardar>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => setEditando(false)}
            >
              Cancelar
            </Button>
          </>
        ) : (
          <>
            <span className="text-sm text-muted-foreground">{vacio}</span>
            <Button variant="outline" size="sm" onClick={() => setEditando(true)}>
              Marcar
            </Button>
          </>
        )}
      </div>

      {nota && <p className="pl-6 text-xs text-muted-foreground">{nota}</p>}
    </div>
  );
}
