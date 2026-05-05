"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Producto } from "@/lib/types";

const TIPOS = [
  "lavado",
  "seco",
  "planchado",
  "manchas",
  "aplicaciones",
  "ganchos",
  "delivery",
  "pedido_especial",
  "descuento",
  "secado",
] as const;

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

const baseSchema = z.object({
  nombre:        z.string().min(1, "Nombre requerido"),
  tipo_servicio: z.enum(TIPOS),
  precio:        z.number().int(),
  activo:        z.boolean(),
});

const createSchema = baseSchema.extend({
  id: z
    .string()
    .regex(ID_RE, "ID solo letras, números, guión o guión bajo (1-40)"),
});

const updateSchema = baseSchema;

export type CrearProductoInput = z.input<typeof createSchema>;
export type EditarProductoInput = z.input<typeof updateSchema>;
export type ProductoActionResult =
  | { ok: true }
  | { ok: false; error: string };

async function logAuditoria(
  entidad: string,
  entidad_id: string,
  accion: string,
  antes: unknown,
  despues: unknown,
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("auditoria").insert({
      entidad,
      entidad_id,
      accion,
      antes,
      despues,
      user_email: user?.email ?? null,
    });
  } catch {
    // No bloquear la operación principal por un fallo de auditoría
  }
}

export async function crearProducto(
  input: CrearProductoInput,
): Promise<ProductoActionResult> {
  let step = "init";
  try {
    step = "parse";
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const data = parsed.data;

    step = "supabase";
    const supabase = await createClient();

    step = "check-exists";
    const { data: existing } = await supabase
      .from("productos")
      .select("id")
      .eq("id", data.id)
      .maybeSingle();
    if (existing) {
      return { ok: false, error: `Ya existe un producto con ID "${data.id}"` };
    }

    step = "insert";
    const { error } = await supabase.from("productos").insert(data);
    if (error) return { ok: false, error: error.message };

    step = "audit";
    await logAuditoria("producto", data.id, "create", null, data);

    revalidatePath("/catalogo");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[crearProducto] step=${step}`, err);
    return { ok: false, error: `Error inesperado en "${step}": ${msg}` };
  }
}

export async function actualizarProducto(
  id: string,
  input: EditarProductoInput,
): Promise<ProductoActionResult> {
  let step = "init";
  try {
    step = "parse";
    const parsed = updateSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const data = parsed.data;

    step = "supabase";
    const supabase = await createClient();

    step = "fetch-antes";
    const { data: antes } = await supabase
      .from("productos")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!antes) return { ok: false, error: "Producto no encontrado" };

    step = "update";
    const { error } = await supabase
      .from("productos")
      .update(data)
      .eq("id", id);
    if (error) return { ok: false, error: error.message };

    step = "audit";
    const accion =
      (antes as Producto).precio !== data.precio
        ? "cambio_precio"
        : (antes as Producto).activo !== data.activo
          ? data.activo
            ? "reactivar"
            : "desactivar"
          : "edit";
    await logAuditoria("producto", id, accion, antes, data);

    revalidatePath("/catalogo");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[actualizarProducto] step=${step}`, err);
    return { ok: false, error: `Error inesperado en "${step}": ${msg}` };
  }
}
