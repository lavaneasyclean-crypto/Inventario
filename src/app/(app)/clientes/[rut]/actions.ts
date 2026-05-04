"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function actualizarCliente(formData: FormData) {
  const rut = String(formData.get("rut") ?? "");
  if (!rut) return;

  const fields = {
    nombre:   asNullable(formData.get("nombre")),
    comuna:   asNullable(formData.get("comuna")),
    calle:    asNullable(formData.get("calle")),
    dpto:     asNullable(formData.get("dpto")),
    telefono: asNullable(formData.get("telefono")),
    correo:   asNullable(formData.get("correo")),
  };

  const supabase = await createClient();
  await supabase.from("clientes").update(fields).eq("rut", rut);

  revalidatePath(`/clientes/${rut}`);
  revalidatePath("/clientes");
}

function asNullable(v: FormDataEntryValue | null): string | null {
  if (v === null) return null;
  const s = String(v).trim();
  return s ? s : null;
}
