"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fallo } from "@/lib/errores";

const RUT_RE = /^\d{1,8}-[\dkK]$/;

const baseSchema = z.object({
  nombre:     z.string().min(1, "Nombre requerido"),
  alias:      z.string().nullable(),
  comuna:     z.string().nullable(),
  calle:      z.string().nullable(),
  contacto_1: z.string().nullable(),
  contacto_2: z.string().nullable(),
  correo:     z
    .string()
    .email("Correo inválido")
    .nullable()
    .or(z.literal("").transform(() => null)),
  activo:     z.boolean(),
});

const createSchema = baseSchema.extend({
  rut: z.string().regex(RUT_RE, "RUT con formato inválido"),
});

const updateSchema = baseSchema;

export type CrearEmpresaInput = z.input<typeof createSchema>;
export type EditarEmpresaInput = z.input<typeof updateSchema>;
export type EmpresaActionResult =
  | { ok: true; rut?: string }
  | { ok: false; error: string };

function normalizeRut(raw: string): string {
  return raw.replace(/\./g, "").replace(/\s/g, "").toUpperCase();
}

export async function crearEmpresa(
  input: CrearEmpresaInput,
): Promise<EmpresaActionResult> {
  let step = "init";
  try {
    step = "normalize-rut";
    const rutNorm = normalizeRut(input.rut);

    step = "parse";
    const parsed = createSchema.safeParse({ ...input, rut: rutNorm });
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
      .from("clientes_empresa")
      .select("rut")
      .eq("rut", data.rut)
      .maybeSingle();
    if (existing) {
      return {
        ok: false,
        error: `Ya existe una empresa con RUT ${data.rut}`,
      };
    }

    step = "insert";
    const { error } = await supabase.from("clientes_empresa").insert({
      rut:        data.rut,
      nombre:     data.nombre,
      alias:      data.alias || null,
      comuna:     data.comuna || null,
      calle:      data.calle || null,
      contacto_1: data.contacto_1 || null,
      contacto_2: data.contacto_2 || null,
      correo:     data.correo || null,
      activo:     data.activo,
    });
    if (error) return fallo("crearEmpresa", step, error);

    revalidatePath("/empresas");
    return { ok: true, rut: data.rut };
  } catch (err) {
    return fallo("crearEmpresa", step, err);
  }
}

export async function actualizarEmpresa(
  rut: string,
  input: EditarEmpresaInput,
): Promise<EmpresaActionResult> {
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

    step = "update";
    const { error } = await supabase
      .from("clientes_empresa")
      .update({
        nombre:     data.nombre,
        alias:      data.alias || null,
        comuna:     data.comuna || null,
        calle:      data.calle || null,
        contacto_1: data.contacto_1 || null,
        contacto_2: data.contacto_2 || null,
        correo:     data.correo || null,
        activo:     data.activo,
      })
      .eq("rut", rut);

    if (error) return fallo("actualizarEmpresa", step, error);

    revalidatePath("/empresas");
    revalidatePath(`/empresas/${rut}`);
    return { ok: true };
  } catch (err) {
    return fallo("actualizarEmpresa", step, err);
  }
}
