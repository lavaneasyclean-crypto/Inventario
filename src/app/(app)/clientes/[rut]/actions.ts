"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fallo } from "@/lib/errores";

/**
 * Antes esto descartaba el resultado del update: si la escritura fallaba, el
 * diálogo se cerraba igual y la persona creía que había guardado.
 */
export type ActualizarClienteResult = { ok: true } | { ok: false; error: string };

const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function actualizarCliente(
  formData: FormData,
): Promise<ActualizarClienteResult> {
  const rut = String(formData.get("rut") ?? "").trim();
  if (!rut) return { ok: false, error: "No se pudo identificar al cliente." };

  const nombre = asNullable(formData.get("nombre"));
  if (!nombre) return { ok: false, error: "El nombre no puede quedar vacío." };

  const correo = asNullable(formData.get("correo"));
  if (correo && !CORREO_RE.test(correo)) {
    return { ok: false, error: "El correo no tiene un formato válido." };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("clientes")
      .update({
        nombre,
        comuna:   asNullable(formData.get("comuna")),
        calle:    asNullable(formData.get("calle")),
        dpto:     asNullable(formData.get("dpto")),
        telefono: asNullable(formData.get("telefono")),
        correo,
      })
      .eq("rut", rut);
    if (error) return fallo("actualizarCliente", "update", error);

    revalidatePath(`/clientes/${rut}`);
    revalidatePath("/clientes");
    return { ok: true };
  } catch (err) {
    return fallo("actualizarCliente", "update", err);
  }
}

function asNullable(v: FormDataEntryValue | null): string | null {
  if (v === null) return null;
  const s = String(v).trim();
  return s ? s : null;
}
