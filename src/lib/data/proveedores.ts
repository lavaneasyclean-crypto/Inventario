import "server-only";
import { createClient } from "@/lib/supabase/server";
import { filtroContiene } from "@/lib/postgrest";
import type { Proveedor } from "@/lib/types";

const LIMITE = 300;

/**
 * A quién le pagamos.
 *
 * Los inactivos se traen aparte y no al vuelo: un proveedor se desactiva
 * cuando se deja de trabajar con él, pero sus gastos viejos tienen que seguir
 * mostrando su nombre. Por eso nunca se borra desde acá.
 */
export async function getProveedores(
  opciones: { incluirInactivos?: boolean } = {},
): Promise<Proveedor[]> {
  const supabase = await createClient();

  let q = supabase
    .from("proveedores")
    .select("*")
    .order("nombre", { ascending: true })
    .limit(LIMITE);

  if (!opciones.incluirInactivos) q = q.eq("activo", true);

  const { data } = await q;
  return (data ?? []) as Proveedor[];
}

export async function getProveedor(id: number): Promise<Proveedor | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("proveedores")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as Proveedor | null) ?? null;
}

/**
 * Busca por cualquiera de los datos que alguien recordaría: el nombre, el RUT,
 * con quién se habla o el teléfono. El RUT se busca tal cual está escrito,
 * porque se guarda ya normalizado por `normalizeRut`.
 */
export async function searchProveedores(
  termino: string,
  opciones: { incluirInactivos?: boolean } = {},
): Promise<Proveedor[]> {
  const supabase = await createClient();

  let q = supabase
    .from("proveedores")
    .select("*")
    .order("nombre", { ascending: true })
    .limit(LIMITE);

  if (!opciones.incluirInactivos) q = q.eq("activo", true);

  const t = termino.trim();
  if (t) {
    q = q.or(filtroContiene(["nombre", "rut", "contacto", "telefono"], t));
  }

  const { data } = await q;
  return (data ?? []) as Proveedor[];
}

/** Los ids cuyo nombre contiene el término, para filtrar gastos por proveedor. */
export async function idsProveedoresQueCoinciden(
  termino: string,
): Promise<number[]> {
  const t = termino.trim();
  if (!t) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("proveedores")
    .select("id")
    .or(filtroContiene(["nombre", "rut", "contacto"], t))
    .limit(LIMITE);

  return ((data ?? []) as { id: number }[]).map((r) => r.id);
}
