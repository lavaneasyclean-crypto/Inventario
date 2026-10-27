"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fallo } from "@/lib/errores";
import { esAdmin } from "@/lib/data/perfil";

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
  // Porcentaje adicional por guia express. 0 = la empresa no lo cobra, que es
  // el caso de casi todas, asi que tiene default y no hay que mandarlo.
  recargo_express: z
    .number()
    .int("El recargo va en numeros enteros")
    .min(0, "El recargo no puede ser negativo")
    .max(500, "Un recargo de mas de 500% seguro es un error de tipeo")
    .default(0),
  // La ropa viene separada por bolsa de trabajador. Casi ninguna empresa
  // trabaja asi, de ahi el default.
  precios_con_iva: z.boolean().default(false),
  usa_bolsas: z.boolean().default(false),
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
      recargo_express: data.recargo_express,
      usa_bolsas: data.usa_bolsas,
      precios_con_iva: data.precios_con_iva,
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
        recargo_express: data.recargo_express,
        usa_bolsas: data.usa_bolsas,
        precios_con_iva: data.precios_con_iva,
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

/**
 * Activar o desactivar una empresa.
 *
 * Desactivar es lo que reemplaza al borrado cuando la empresa ya tiene guías:
 * deja de ofrecerse al abrir una guía nueva y queda en gris en la lista, pero
 * sus guías viejas siguen enteras.
 *
 * Solo admins. Esconder el botón no alcanza: un server action se puede llamar
 * igual, así que la regla se verifica acá, que es donde se ejecuta.
 */
export async function cambiarActivoEmpresa(
  rut: string,
  activo: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let step = "init";
  try {
    step = "permiso";
    if (!(await esAdmin())) {
      return { ok: false, error: "No tenés permiso para cambiar eso." };
    }

    step = "update";
    const supabase = await createClient();
    const { error } = await supabase
      .from("clientes_empresa")
      .update({ activo })
      .eq("rut", rut);
    if (error) return fallo("cambiarActivoEmpresa", step, error);

    revalidatePath("/empresas");
    revalidatePath(`/empresas/${rut}`);
    return { ok: true };
  } catch (err) {
    return fallo("cambiarActivoEmpresa", step, err);
  }
}
