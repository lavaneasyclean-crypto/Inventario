import "server-only";
import { createClient } from "@/lib/supabase/server";
import { esFechaValida, finDeDiaChile, inicioDeDiaChile } from "@/lib/fecha";
import type { RegistroAuditoria } from "@/lib/historial";

/**
 * Leer el historial.
 *
 * No hace falta gatear por rol acá: `migrations/0017` dejó el SELECT de
 * `auditoria` solo para admins, así que a cualquier otro le vuelve vacío
 * aunque llame a la API por fuera de la app. El `notFound()` del layout es
 * para que la pantalla no exista, no para proteger los datos.
 */

/** Cuántos se traen de una. El historial crece para siempre; esto no. */
const TOPE = 200;

export interface HistorialFiltro {
  /** Texto libre: por ahora el id de lo que cambió o el correo de quién. */
  q?: string;
  /** Nombre de tabla, o "todas". */
  entidad?: string;
  accion?: string;
  desde?: string;
  hasta?: string;
}

export async function getHistorial(
  filtro: HistorialFiltro = {},
): Promise<RegistroAuditoria[]> {
  const supabase = await createClient();

  let q = supabase
    .from("auditoria")
    .select("id, ts, user_email, entidad, entidad_id, accion, antes, despues")
    .order("ts", { ascending: false })
    .limit(TOPE);

  if (filtro.entidad && filtro.entidad !== "todas") {
    q = q.eq("entidad", filtro.entidad);
  }
  if (filtro.accion && filtro.accion !== "todas") {
    q = q.eq("accion", filtro.accion);
  }
  if (esFechaValida(filtro.desde)) q = q.gte("ts", inicioDeDiaChile(filtro.desde));
  if (esFechaValida(filtro.hasta)) q = q.lte("ts", finDeDiaChile(filtro.hasta));

  const termino = filtro.q?.trim();
  if (termino) {
    // Dos preguntas distintas con la misma caja: "qué le pasó al pedido
    // 13543" y "qué tocó fulano". El id va exacto porque buscar "154" por
    // contenido devuelve el 1540, el 2154 y el 1543, que no es lo que nadie
    // quiso preguntar.
    const esc = termino.replace(/[,()]/g, " ");
    q = q.or(`entidad_id.eq.${esc},user_email.ilike.*${esc}*`);
  }

  const { data, error } = await q;
  if (error) {
    console.error("getHistorial", error);
    return [];
  }
  return (data ?? []) as unknown as RegistroAuditoria[];
}

/**
 * El historial de una cosa puntual, para mostrarlo en su propia pantalla.
 *
 * Corto a propósito: en la ficha de un pedido interesan los últimos
 * movimientos, no la biografía completa.
 */
export async function getHistorialDe(
  entidad: string,
  entidadId: string | number,
  limite = 8,
): Promise<RegistroAuditoria[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("auditoria")
    .select("id, ts, user_email, entidad, entidad_id, accion, antes, despues")
    .eq("entidad", entidad)
    .eq("entidad_id", String(entidadId))
    .order("ts", { ascending: false })
    .limit(limite);

  return (data ?? []) as unknown as RegistroAuditoria[];
}
