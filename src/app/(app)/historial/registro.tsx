import Link from "next/link";
import { FilePlus2, PencilLine, Shirt, Trash2 } from "lucide-react";
import {
  cambiosLegibles,
  etiquetaEntidad,
  quienLoHizo,
  rutaEntidad,
  type RegistroAuditoria,
} from "@/lib/historial";
import { cn } from "@/lib/utils";

/** La hora en que pasó, en hora de Chile. */
function hora(ts: string): string {
  return new Date(ts).toLocaleString("es-CL", {
    timeZone: "America/Santiago",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ESTILO = {
  alta: {
    icono: FilePlus2,
    clase: "text-emerald-700 dark:text-emerald-400",
    verbo: "creó",
  },
  baja: {
    icono: Trash2,
    clase: "text-destructive",
    verbo: "eliminó",
  },
  edicion: {
    icono: PencilLine,
    clase: "text-muted-foreground",
    verbo: "editó",
  },
  items: {
    icono: Shirt,
    clase: "text-sky-700 dark:text-sky-400",
    verbo: "cambió las prendas de",
  },
} as const;

/**
 * Un movimiento del historial.
 *
 * La línea de arriba contesta quién, qué y cuándo; la tabla de abajo, qué
 * cambió exactamente. Las dos cosas juntas porque la pregunta nunca es solo
 * una: "¿quién bajó este precio?" siempre sigue con "¿de cuánto a cuánto?".
 */
export function Registro({ reg }: { reg: RegistroAuditoria }) {
  const cambios = cambiosLegibles(reg);
  const estilo = ESTILO[reg.accion as keyof typeof ESTILO] ?? ESTILO.edicion;
  const Icono = estilo.icono;
  const ruta = rutaEntidad(reg.entidad, reg.entidad_id);
  const titulo = `${etiquetaEntidad(reg.entidad)} ${reg.entidad_id.includes("|") ? "" : `#${reg.entidad_id}`}`.trim();

  return (
    <li className="rounded-xl border bg-background p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        <Icono className={cn("size-4 shrink-0 self-center", estilo.clase)} />
        <span className="font-medium">{quienLoHizo(reg.user_email)}</span>
        <span className="text-muted-foreground">{estilo.verbo}</span>
        {ruta ? (
          <Link href={ruta} className="font-medium hover:underline">
            {titulo}
          </Link>
        ) : (
          <span className="font-medium">{titulo}</span>
        )}
        <span className="ml-auto whitespace-nowrap font-mono text-xs text-muted-foreground">
          {hora(reg.ts)}
        </span>
      </div>

      {cambios.length > 0 && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {cambios.map((c) => (
                <tr key={c.campo} className="border-t">
                  <td className="py-1 pr-3 align-top text-muted-foreground">
                    {c.campo}
                  </td>
                  {reg.accion === "edicion" || reg.accion === "items" ? (
                    <>
                      <td className="py-1 pr-2 align-top text-muted-foreground line-through decoration-muted-foreground/50">
                        {c.antes}
                      </td>
                      <td className="py-1 align-top font-medium">
                        {c.despues}
                      </td>
                    </>
                  ) : (
                    <td className="py-1 align-top font-medium" colSpan={2}>
                      {reg.accion === "baja" ? c.antes : c.despues}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </li>
  );
}
