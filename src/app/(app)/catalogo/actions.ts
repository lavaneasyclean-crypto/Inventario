"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fallo } from "@/lib/errores";
import type { Producto, TipoServicio } from "@/lib/types";
import { nextProductoId, PREFIX_BY_TIPO } from "@/lib/producto-id";

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

async function generarIdProducto(tipo: TipoServicio): Promise<string> {
  const prefix = PREFIX_BY_TIPO[tipo];
  const supabase = await createClient();
  const { data } = await supabase
    .from("productos")
    .select("id")
    .like("id", `${prefix}%`);
  const ids = (data ?? []).map((r) => (r as { id: string }).id);
  return nextProductoId(tipo, ids);
}

const baseSchema = z.object({
  nombre:        z.string().min(1, "Nombre requerido"),
  tipo_servicio: z.enum(TIPOS),
  precio:        z.number().int(),
  activo:        z.boolean(),
});

const createSchema = baseSchema;
const updateSchema = baseSchema;

export type CrearProductoInput = z.input<typeof createSchema>;
export type EditarProductoInput = z.input<typeof updateSchema>;
export type ProductoActionResult =
  | { ok: true; id?: string }
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
    // No bloquear la operacion principal por un fallo de auditoria
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
        error: parsed.error.issues[0]?.message ?? "Datos invalidos",
      };
    }
    const data = parsed.data;

    step = "supabase";
    const supabase = await createClient();

    let lastError: string | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      step = "generar-id";
      const id = await generarIdProducto(data.tipo_servicio);
      const fullRow = { id, ...data };

      step = "insert";
      const { error } = await supabase.from("productos").insert(fullRow);
      if (!error) {
        step = "audit";
        await logAuditoria("producto", id, "create", null, fullRow);
        revalidatePath("/catalogo");
        return { ok: true, id };
      }
      if (!error.message.toLowerCase().includes("duplicate")) {
        return fallo("crearProducto", step, error);
      }
      lastError = error.message;
    }
    return {
      ok: false,
      error: lastError ?? "No se pudo generar un ID unico",
    };
  } catch (err) {
    return fallo("crearProducto", step, err);
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
        error: parsed.error.issues[0]?.message ?? "Datos invalidos",
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
    if (error) return fallo("actualizarProducto", step, error);

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
    return fallo("actualizarProducto", step, err);
  }
}
