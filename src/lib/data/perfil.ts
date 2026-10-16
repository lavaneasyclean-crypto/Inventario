import "server-only";
import { createClient } from "@/lib/supabase/server";

export type Rol = "admin" | "ventas";

/**
 * El rol de quien está usando la app.
 *
 * Ante la duda devuelve "ventas": si la consulta falla o la fila todavía no
 * existe, lo seguro es el acceso chico. Al revés, un error de red dejaría a
 * cualquiera viendo las finanzas.
 *
 * Esto decide qué se *muestra*. Lo que se *puede leer* lo decide RLS en la
 * base (migrations/0017), que es la frontera que no se puede saltar llamando
 * a la API por fuera de la app.
 */
export async function getRolActual(): Promise<Rol> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "ventas";

  const { data } = await supabase
    .from("perfiles")
    .select("rol")
    .eq("id", user.id)
    .maybeSingle();

  return (data as { rol?: Rol } | null)?.rol === "admin" ? "admin" : "ventas";
}

export async function esAdmin(): Promise<boolean> {
  return (await getRolActual()) === "admin";
}
