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

/** Todos los productos (activos e inactivos) — para la pantalla de catálogo. */
export async function getAllProductos(): Promise<Producto[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("productos")
    .select("id, nombre, tipo_servicio, precio, activo")
    .order("activo", { ascending: false })
    .order("tipo_servicio", { ascending: true })
    .order("nombre", { ascending: true });
  return (data ?? []) as Producto[];
}
