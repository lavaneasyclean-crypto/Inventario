"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fallo } from "@/lib/errores";

export type ProductoEmpresaActionResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Genera el siguiente ID secuencial global para productos_empresa.
 * Mantiene el formato de 3 dígitos del Access (001, 002, ..., 999).
 * Si se llega a 999 cae al formato libre con timestamp.
 */
async function generarIdProductoEmpresa(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.from("productos_empresa").select("id");
  let max = 0;
  for (const row of data ?? []) {
    const id = (row as { id: string }).id;
    if (/^\d+$/.test(id)) {
      const n = parseInt(id, 10);
      if (n > max) max = n;
    }
  }
  const next = max + 1;
  if (next < 1000) return String(next).padStart(3, "0");
  return `EMP${Date.now()}`;
}

const asignarSchema = z.object({
  rut_empresa:         z.string().min(1),
  producto_empresa_id: z.string().min(1),
  precio:              z.number().int().nullable(),
});

/** Asocia un producto existente del catálogo global a una empresa con su precio. */
export async function asignarProducto(
  input: z.input<typeof asignarSchema>,
): Promise<ProductoEmpresaActionResult> {
  let step = "init";
  try {
    step = "parse";
    const parsed = asignarSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }
    const data = parsed.data;

    step = "supabase";
    const supabase = await createClient();

    step = "upsert";
    const { error } = await supabase.from("empresa_productos").upsert(
      {
        rut_empresa:         data.rut_empresa,
        producto_empresa_id: data.producto_empresa_id,
        precio:              data.precio,
      },
      { onConflict: "rut_empresa,producto_empresa_id" },
    );
    if (error) return fallo("asignarProducto", step, error);

    revalidatePath(`/empresas/${data.rut_empresa}`);
    return { ok: true };
  } catch (err) {
    return fallo("asignarProducto", step, err);
  }
}

const crearYAsignarSchema = z.object({
  rut_empresa: z.string().min(1),
  nombre:      z.string().min(1, "Nombre requerido"),
  precio:      z.number().int().nullable(),
});

/** Crea un producto NUEVO en el catálogo global y lo asigna a la empresa. */
export async function crearYAsignarProducto(
  input: z.input<typeof crearYAsignarSchema>,
): Promise<ProductoEmpresaActionResult & { id?: string }> {
  let step = "init";
  try {
    step = "parse";
    const parsed = crearYAsignarSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }
    const data = parsed.data;

    step = "supabase";
    const supabase = await createClient();

    step = "generar-id";
    let id = await generarIdProductoEmpresa();

    step = "insert-producto";
    let { error: e1 } = await supabase
      .from("productos_empresa")
      .insert({ id, nombre: data.nombre, activo: true });

    // Reintenta una vez si hay colisión rara
    if (e1 && e1.message.toLowerCase().includes("duplicate")) {
      id = await generarIdProductoEmpresa();
      ({ error: e1 } = await supabase
        .from("productos_empresa")
        .insert({ id, nombre: data.nombre, activo: true }));
    }
    if (e1) return fallo("crearYAsignarProducto", step, e1);

    step = "asignar";
    const { error: e2 } = await supabase.from("empresa_productos").insert({
      rut_empresa:         data.rut_empresa,
      producto_empresa_id: id,
      precio:              data.precio,
    });
    if (e2) {
      // Rollback del producto si falla la asignación
      await supabase.from("productos_empresa").delete().eq("id", id);
      return fallo("crearYAsignarProducto", step, e2);
    }

    revalidatePath(`/empresas/${data.rut_empresa}`);
    return { ok: true, id };
  } catch (err) {
    return fallo("crearYAsignarProducto", step, err);
  }
}

const desasignarSchema = z.object({
  rut_empresa:         z.string().min(1),
  producto_empresa_id: z.string().min(1),
});

/** Quita el producto del catálogo de la empresa (no borra el producto global). */
export async function desasignarProducto(
  input: z.input<typeof desasignarSchema>,
): Promise<ProductoEmpresaActionResult> {
  let step = "init";
  try {
    step = "parse";
    const parsed = desasignarSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }
    const data = parsed.data;

    step = "supabase";
    const supabase = await createClient();

    step = "delete";
    const { error } = await supabase
      .from("empresa_productos")
      .delete()
      .eq("rut_empresa", data.rut_empresa)
      .eq("producto_empresa_id", data.producto_empresa_id);
    if (error) return fallo("desasignarProducto", step, error);

    revalidatePath(`/empresas/${data.rut_empresa}`);
    return { ok: true };
  } catch (err) {
    return fallo("desasignarProducto", step, err);
  }
}
