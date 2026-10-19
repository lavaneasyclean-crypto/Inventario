import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  diffItems,
  resumirDiff,
  type LineaComparable,
} from "@/lib/diff-items";

/**
 * Deja en el historial qué cambió en las líneas.
 *
 * El trigger de `migrations/0021` cubre las cabeceras, pero no puede con las
 * líneas: guardar las reemplaza todas, y fila por fila vería doce borrados y
 * doce altas sin poder decir qué pasó de verdad. Esto sí puede, porque corre
 * en el server action, que tiene las viejas y las nuevas a la vista.
 *
 * Se escribe **antes** de reemplazar, mientras las viejas todavía están, y
 * solo si de verdad cambió algo: un guardado donde solo se tocó la fecha no
 * deja un registro de líneas.
 *
 * Como todo el historial, no puede voltear la operación: si falla, se pierde
 * el registro y el pedido se guarda igual.
 */
export async function registrarCambioDeItems(
  entidad: "pedidos" | "pedidos_empresa",
  entidadId: number,
  antes: LineaComparable[],
  despues: LineaComparable[],
): Promise<void> {
  try {
    const cambios = diffItems(antes, despues);
    if (!cambios) return;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase.from("auditoria").insert({
      entidad,
      entidad_id: String(entidadId),
      accion: "items",
      user_email: user?.email ?? null,
      antes: {
        prendas: Object.fromEntries(
          cambios.filter((c) => c.antes !== null).map((c) => [c.linea, c.antes]),
        ),
      },
      despues: {
        prendas: Object.fromEntries(
          cambios
            .filter((c) => c.despues !== null)
            .map((c) => [c.linea, c.despues]),
        ),
        resumen: resumirDiff(cambios),
      },
    });
  } catch {
    // El historial nunca voltea la operación real.
  }
}
