"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Producto, TipoServicio } from "@/lib/types";

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

// Prefijos según el patrón histórico del Access:
//   Lavado / Secado: SC (servicio completo)
//   Lavado en seco:  LES
//   Planchado:       PL
//   Resto:           AA
const PREFIX_BY_TIPO: Record<TipoServicio, string> = {
  lavado:          "SC",
  secado:          "SC",
  seco:            "LES",
  planchado:       "PL",
  manchas:         "AA",
  aplicaciones:    "AA",
  ganchos:         "AA",
  delivery:        "AA",
  pedido_especial: "AA",
  descuento:       "AA",
};

async function generarIdProducto(tipo: TipoServicio): Promise<string> {
  const prefix = PREFIX_BY_TIPO[tipo];
  const supabase = await createClient();
  const { data } = await supabase
    .from("productos")
    .select("id")
    .like("id", `${prefix}%`);

  let max = 0;
  for (const row of data ?? []) {
    const id = (row as { id: string }).id;
    const numPart = id.slice(prefix.length);
    if (/^\d+$/.test(numPart)) {
      const n = parseInt(numPart, 10);
      if (n > max) max = n;
    }
  }
  const next = max + 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

const baseSchema = z.object({
  nombre:        z.string().min(1, "Nombre requerido"),
  tipo_servicio: z.enum(TIPOS),
  precio:        z.number().int(),
  activo:        z.boolean(),
});

const createSchema = baseSchema; // ID se genera automáticamente
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

    // Reintenta una vez si hay colisión (poco probable pero posible si dos
    // productos se crean al mismo tiempo).
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
      // Si fue colisión de id (raro), reintenta. Sino, fallar.
      if (!error.message.toLowerCase().includes("duplicate")) {
        return { ok: false, error: error.message };
      }
      lastError = error.message;
    }
    return {
      ok: false,
      error: lastError ?? "No se pudo generar un ID único",
    };
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
