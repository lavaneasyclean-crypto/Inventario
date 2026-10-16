import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Rol = "admin" | "ventas";

/**
 * Quien está usando la app.
 *
 * Envuelto en `cache` de React: `getUser()` no lee una cookie, le pregunta al
 * servidor de Supabase si el token sigue siendo válido, y desde acá cada viaje
 * cuesta más de medio segundo. Sin esto, una misma pantalla lo preguntaba dos
 * veces —el layout por su lado y el rol por el suyo— y pagaba el viaje dos
 * veces. El cache dura lo que dura el request, así que no guarda nada entre
 * personas ni entre pantallas.
 */
export const getUsuarioActual = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

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
export const getRolActual = cache(async (): Promise<Rol> => {
  const user = await getUsuarioActual();
  if (!user) return "ventas";

  const supabase = await createClient();
  const { data } = await supabase
    .from("perfiles")
    .select("rol")
    .eq("id", user.id)
    .maybeSingle();

  return (data as { rol?: Rol } | null)?.rol === "admin" ? "admin" : "ventas";
});

export async function esAdmin(): Promise<boolean> {
  return (await getRolActual()) === "admin";
}
