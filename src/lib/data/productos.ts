import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Producto } from "@/lib/types";

export async function getProductosActivos(): Promise<Producto[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("productos")
    .select("id, nombre, tipo_servicio, precio, activo")
    .eq("activo", true)
    .order("tipo_servicio", { ascending: true })
    .order("nombre", { ascending: true });
  return (data ?? []) as Producto[];
}
