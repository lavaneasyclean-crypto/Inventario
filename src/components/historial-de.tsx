import Link from "next/link";
import { History } from "lucide-react";
import { getHistorialDe } from "@/lib/data/auditoria";
import { esAdmin } from "@/lib/data/perfil";
import { quienLoHizo, resumenCambio } from "@/lib/historial";

/**
 * Los últimos movimientos de un pedido o una guía, en su propia ficha.
 *
 * Ahí es donde se hace la pregunta: no se entra al historial completo a
 * buscar la guía 1670, se está mirando la guía 1670 y se quiere saber quién
 * la tocó. El historial completo sirve para la otra pregunta, la de "qué
 * pasó ayer".
 *
 * Solo para admins. A ventas RLS ya le devuelve vacío (migrations/0017), pero
 * una caja vacía que nunca se llena invita a preguntar por qué: mejor no
 * mostrarla.
 */
export async function HistorialDe({
  entidad,
  id,
}: {
  entidad: string;
  id: string | number;
}) {
  if (!(await esAdmin())) return null;

  const registros = await getHistorialDe(entidad, id, 6);
  if (registros.length === 0) return null;

  return (
    <section className="mb-6 rounded-xl border bg-background p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <History className="size-4" /> Últimos cambios
        </h2>
        <Link
          href={`/historial?q=${encodeURIComponent(String(id))}`}
          className="text-xs text-muted-foreground hover:underline"
        >
          ver todo
        </Link>
      </div>
      <ul className="flex flex-col gap-2 text-sm">
        {registros.map((r) => (
          <li key={r.id} className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono text-xs text-muted-foreground">
              {new Date(r.ts).toLocaleString("es-CL", {
                timeZone: "America/Santiago",
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span className="font-medium">{quienLoHizo(r.user_email)}</span>
            <span className="text-muted-foreground">{resumenCambio(r)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
