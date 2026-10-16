"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fallo } from "@/lib/errores";
import { normalizeRut } from "@/lib/rut";
import { TIPOS_CUENTA } from "@/lib/types";

export type ProveedorResult =
  | { ok: true; id?: number }
  | { ok: false; error: string };

const textoOpcional = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : null));

/**
 * El RUT se guarda normalizado —sin puntos, con guión, K mayúscula— para que
 * el índice único lo pueda comparar: "12.345.678-k" y "123456789" son el mismo
 * proveedor y tienen que chocar entre sí.
 */
const RUT_OPCIONAL = z
  .string()
  .nullable()
  .optional()
  .transform((v, ctx) => {
    if (!v || !v.trim()) return null;
    const normalizado = normalizeRut(v);
    if (!normalizado) {
      ctx.addIssue({
        code: "custom",
        message: `"${v.trim()}" no parece un RUT. Va como 12345678-9.`,
      });
      return null;
    }
    return normalizado;
  });

const proveedorSchema = z.object({
  nombre: z.string().min(1, "El proveedor necesita un nombre"),
  rut: RUT_OPCIONAL,
  contacto: textoOpcional,
  telefono: textoOpcional,
  correo: textoOpcional,
  direccion: textoOpcional,
  comuna: textoOpcional,
  giro: textoOpcional,
  banco: textoOpcional,
  tipo_cuenta: z
    .enum(TIPOS_CUENTA as [(typeof TIPOS_CUENTA)[number]])
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  numero_cuenta: textoOpcional,
  titular: textoOpcional,
  rut_titular: RUT_OPCIONAL,
});

export type ProveedorInput = z.input<typeof proveedorSchema>;

/**
 * Los dos índices únicos de la tabla dan el mismo código, así que hay que
 * mirar cuál se violó: si no, un RUT repetido se reporta como nombre repetido
 * y la persona corrige el campo equivocado.
 */
function mensajeDuplicado(error: unknown): string {
  const texto = String(
    (error as { message?: unknown })?.message ?? "",
  ).toLowerCase();
  if (texto.includes("proveedores_rut_uniq")) {
    return "Ya hay un proveedor cargado con ese RUT. Buscalo en la lista en vez de crear otro.";
  }
  return "Ya existe un proveedor con ese nombre.";
}

function revalidar() {
  revalidatePath("/finanzas/proveedores");
  revalidatePath("/finanzas/gastos");
}

export async function crearProveedor(
  input: ProveedorInput,
): Promise<ProveedorResult> {
  let step = "init";
  try {
    step = "parse";
    const parsed = proveedorSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }

    step = "insert";
    const supabase = await createClient();
    const { data: fila, error } = await supabase
      .from("proveedores")
      .insert({ ...parsed.data, activo: true })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        return { ok: false, error: mensajeDuplicado(error) };
      }
      return fallo("crearProveedor", step, error);
    }

    revalidar();
    return { ok: true, id: (fila as { id: number }).id };
  } catch (err) {
    return fallo("crearProveedor", step, err);
  }
}

export async function actualizarProveedor(
  id: number,
  input: ProveedorInput,
): Promise<ProveedorResult> {
  let step = "init";
  try {
    step = "parse";
    const parsed = proveedorSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }

    step = "update";
    const supabase = await createClient();
    const { error } = await supabase
      .from("proveedores")
      .update(parsed.data)
      .eq("id", id);

    if (error) {
      if (error.code === "23505") {
        return { ok: false, error: mensajeDuplicado(error) };
      }
      return fallo("actualizarProveedor", step, error);
    }

    revalidar();
    return { ok: true, id };
  } catch (err) {
    return fallo("actualizarProveedor", step, err);
  }
}

/**
 * Desactivar es lo que reemplaza al borrado cuando el proveedor ya tiene
 * gastos: deja de ofrecerse al cargar uno nuevo, pero los viejos siguen
 * diciendo a quién se le pagó.
 */
export async function cambiarActivoProveedor(
  id: number,
  activo: boolean,
): Promise<ProveedorResult> {
  let step = "init";
  try {
    step = "update";
    const supabase = await createClient();
    const { error } = await supabase
      .from("proveedores")
      .update({ activo })
      .eq("id", id);

    if (error) return fallo("cambiarActivoProveedor", step, error);

    revalidar();
    return { ok: true, id };
  } catch (err) {
    return fallo("cambiarActivoProveedor", step, err);
  }
}

export async function eliminarProveedor(
  id: number,
): Promise<ProveedorResult> {
  let step = "init";
  try {
    step = "delete";
    const supabase = await createClient();
    const { error } = await supabase.from("proveedores").delete().eq("id", id);

    if (error) {
      // 23503: la foreign key de gastos lo impide a propósito.
      if (error.code === "23503") {
        return {
          ok: false,
          error:
            "Este proveedor tiene gastos cargados, así que no se puede borrar sin dejarlos huérfanos. Desactivalo y deja de aparecer al cargar un gasto nuevo.",
        };
      }
      return fallo("eliminarProveedor", step, error);
    }

    revalidar();
    return { ok: true, id };
  } catch (err) {
    return fallo("eliminarProveedor", step, err);
  }
}
