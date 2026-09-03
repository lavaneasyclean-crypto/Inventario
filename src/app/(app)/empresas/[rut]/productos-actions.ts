"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fallo } from "@/lib/errores";

export type ProductoEmpresaActionResult =
  | { ok: true }
  | { ok: false; error: string };

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

    step = "rpc-crear-producto";
    // crear_producto_empresa (migrations/0007) numera con una secuencia, se
    // niega a repetir un nombre y crea el producto junto con su asignación en
    // una sola transacción. Antes esto eran tres viajes: traer todos los ids
    // del catálogo para sacar el máximo, insertar el producto e insertarlo en
    // la empresa, con un borrado de compensación si lo último fallaba.
    const { data: id, error } = await supabase.rpc("crear_producto_empresa", {
      p_rut_empresa: data.rut_empresa,
      p_nombre:      data.nombre,
      p_precio:      data.precio,
    });

    if (error) {
      // La función levanta unique_violation cuando el nombre ya está en el
      // catálogo. Es el único 23505 que puede salir de acá: el choque de id se
      // reintenta adentro y cualquier otro se propaga con su propio código.
      if (error.code === "23505") {
        return {
          ok: false,
          error:
            "Ya existe un producto con ese nombre en el catálogo. Buscalo en la pestaña del catálogo en vez de crearlo de nuevo.",
        };
      }
      return fallo("crearYAsignarProducto", step, error);
    }

    if (typeof id !== "string" || !id) {
      return { ok: false, error: "No se pudo crear el producto." };
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
