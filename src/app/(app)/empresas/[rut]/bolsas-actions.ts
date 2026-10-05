"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fallo } from "@/lib/errores";
import { normalizarCodigoBolsa } from "@/lib/bolsas";

export type BolsaActionResult =
  | { ok: true; id?: number; creadas?: number }
  | { ok: false; error: string };

const codigoSchema = z
  .string()
  .min(1, "La bolsa necesita un número o un nombre")
  .max(40, "El código es demasiado largo");

const bolsaSchema = z.object({
  codigo: codigoSchema,
  nombre: z
    .string()
    .nullable()
    .transform((v) => (v && v.trim() ? v.trim() : null)),
});

export type BolsaInput = z.input<typeof bolsaSchema>;

function esDuplicado(error: unknown): boolean {
  return (error as { code?: string })?.code === "23505";
}

export async function crearBolsa(
  rut: string,
  input: BolsaInput,
): Promise<BolsaActionResult> {
  let step = "parse";
  try {
    const parsed = bolsaSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const codigo = normalizarCodigoBolsa(parsed.data.codigo);
    if (!codigo) {
      return { ok: false, error: "La bolsa necesita un número o un nombre" };
    }

    step = "insert";
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("empresa_bolsas")
      .insert({ rut_empresa: rut, codigo, nombre: parsed.data.nombre })
      .select("id")
      .single();

    if (error) {
      if (esDuplicado(error)) {
        return { ok: false, error: `La bolsa ${codigo} ya está en el padrón.` };
      }
      return fallo("crearBolsa", step, error);
    }

    revalidatePath(`/empresas/${rut}`);
    return { ok: true, id: (data as { id: number }).id };
  } catch (err) {
    return fallo("crearBolsa", step, err);
  }
}

export async function actualizarBolsa(
  id: number,
  rut: string,
  input: BolsaInput,
): Promise<BolsaActionResult> {
  let step = "parse";
  try {
    const parsed = bolsaSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const codigo = normalizarCodigoBolsa(parsed.data.codigo);
    if (!codigo) {
      return { ok: false, error: "La bolsa necesita un número o un nombre" };
    }

    step = "update";
    const supabase = await createClient();
    const { error } = await supabase
      .from("empresa_bolsas")
      .update({ codigo, nombre: parsed.data.nombre })
      .eq("id", id);

    if (error) {
      if (esDuplicado(error)) {
        return { ok: false, error: `La bolsa ${codigo} ya está en el padrón.` };
      }
      return fallo("actualizarBolsa", step, error);
    }

    revalidatePath(`/empresas/${rut}`);
    return { ok: true, id };
  } catch (err) {
    return fallo("actualizarBolsa", step, err);
  }
}

/**
 * Da de baja una bolsa sin borrarla.
 *
 * Borrarla dejaría las guías viejas con el id en null. El código snapshot las
 * salva, pero el cruce para un reclamo —"falta una polera de la bolsa 7"— se
 * pierde. Si el trabajador se fue, la bolsa deja de aparecer en la grilla y
 * nada más.
 */
export async function desactivarBolsa(
  id: number,
  rut: string,
  activo: boolean,
): Promise<BolsaActionResult> {
  const step = "update";
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("empresa_bolsas")
      .update({ activo })
      .eq("id", id);
    if (error) return fallo("desactivarBolsa", step, error);

    revalidatePath(`/empresas/${rut}`);
    return { ok: true, id };
  } catch (err) {
    return fallo("desactivarBolsa", step, err);
  }
}

const rangoSchema = z.object({
  desde: z.number().int().min(1, "El rango arranca en 1"),
  hasta: z.number().int().min(1),
});

export type RangoInput = z.input<typeof rangoSchema>;

/**
 * Carga un rango de bolsas numeradas de una vez.
 *
 * Armar un padrón de 32 bolsas de a una es media hora de clicks. Las que ya
 * existen se saltean, así que ampliar el rango más adelante no rompe nada.
 */
export async function crearRangoDeBolsas(
  rut: string,
  input: RangoInput,
): Promise<BolsaActionResult> {
  let step = "parse";
  try {
    const parsed = rangoSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const { desde, hasta } = parsed.data;
    if (hasta < desde) {
      return { ok: false, error: "El final del rango va después del inicio." };
    }
    if (hasta - desde + 1 > 200) {
      return { ok: false, error: "Son demasiadas bolsas de una vez (máximo 200)." };
    }

    step = "leer-existentes";
    const supabase = await createClient();
    const { data: existentes } = await supabase
      .from("empresa_bolsas")
      .select("codigo")
      .eq("rut_empresa", rut);
    const yaEstan = new Set(
      (existentes ?? []).map((b) => (b as { codigo: string }).codigo),
    );

    const nuevas = [];
    for (let n = desde; n <= hasta; n++) {
      const codigo = String(n);
      if (yaEstan.has(codigo)) continue;
      nuevas.push({ rut_empresa: rut, codigo, nombre: null });
    }

    if (nuevas.length === 0) {
      return { ok: false, error: "Todas esas bolsas ya están en el padrón." };
    }

    step = "insert";
    const { error } = await supabase.from("empresa_bolsas").insert(nuevas);
    if (error) return fallo("crearRangoDeBolsas", step, error);

    revalidatePath(`/empresas/${rut}`);
    return { ok: true, creadas: nuevas.length };
  } catch (err) {
    return fallo("crearRangoDeBolsas", step, err);
  }
}
