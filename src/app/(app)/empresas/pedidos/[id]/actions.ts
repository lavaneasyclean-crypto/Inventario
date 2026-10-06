"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fallo } from "@/lib/errores";

export type PedidoEmpresaActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function anularPedidoEmpresa(
  id: number,
): Promise<PedidoEmpresaActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("pedidos_empresa")
      .update({ anulado: true })
      .eq("id", id);
    if (error) return fallo("anularPedidoEmpresa", "anularPedidoEmpresa", error);
    revalidatePath(`/empresas/pedidos/${id}`);
    revalidatePath("/empresas");
    return { ok: true };
  } catch (err) {
    return fallo("anularPedidoEmpresa", "anularPedidoEmpresa", err);
  }
}

export async function desanularPedidoEmpresa(
  id: number,
): Promise<PedidoEmpresaActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("pedidos_empresa")
      .update({ anulado: false })
      .eq("id", id);
    if (error) return fallo("desanularPedidoEmpresa", "desanularPedidoEmpresa", error);
    revalidatePath(`/empresas/pedidos/${id}`);
    revalidatePath("/empresas");
    return { ok: true };
  } catch (err) {
    return fallo("desanularPedidoEmpresa", "desanularPedidoEmpresa", err);
  }
}

/**
 * Marca o desmarca la guia como express sin tocar los items.
 *
 * Va aparte de la edicion completa porque el caso tipico es acordarse despues:
 * la guia ya esta cargada y hay que marcarla sin volver a pasar por el
 * formulario de items.
 */
export async function marcarExpress(
  id: number,
  express: boolean,
): Promise<PedidoEmpresaActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("pedidos_empresa")
      .update({ express })
      .eq("id", id);
    if (error) return fallo("marcarExpress", "marcarExpress", error);
    revalidatePath(`/empresas/pedidos/${id}`);
    revalidatePath("/empresas");
    return { ok: true };
  } catch (err) {
    return fallo("marcarExpress", "marcarExpress", err);
  }
}

const editarSchema = z.object({
  fecha:   z.string().min(1),
  detalle: z.string().nullable(),
  express: z.boolean().default(false),
  items: z
    .array(
      z.object({
        producto_empresa_id: z.string().min(1),
        nombre:              z.string().min(1),
        precio_unidad:       z.number().int().nullable(),
        cantidad:            z.number().int().positive(),
        detalle:             z.string().nullable(),
        bolsa_id:            z.number().int().positive().nullable().optional(),
      }),
    )
    .min(1, "Agregá al menos un item"),
});

export type EditarPedidoEmpresaInput = z.input<typeof editarSchema>;

/**
 * Reemplaza los items del pedido completamente. Estrategia simple:
 * borra todos los items existentes y los re-inserta con los nuevos datos.
 * Es seguro porque pedidos_empresa_items tiene ON DELETE CASCADE
 * implicito desde pedidos_empresa, pero acá borramos sólo los items.
 */
export async function actualizarPedidoEmpresa(
  id: number,
  input: EditarPedidoEmpresaInput,
): Promise<PedidoEmpresaActionResult> {
  let step = "init";
  try {
    step = "parse";
    const parsed = editarSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const data = parsed.data;

    step = "supabase";
    const supabase = await createClient();

    step = "update-pedido";
    const { error: ePed } = await supabase
      .from("pedidos_empresa")
      .update({
        fecha:   data.fecha,
        detalle: data.detalle,
        express: data.express,
      })
      .eq("id", id);
    if (ePed) return fallo("actualizarPedidoEmpresa", step, ePed);

    step = "delete-items";
    const { error: eDel } = await supabase
      .from("pedidos_empresa_items")
      .delete()
      .eq("pedido_empresa_id", id);
    if (eDel) return fallo("actualizarPedidoEmpresa", step, eDel);

    // El codigo de la bolsa es un snapshot: se copia del padron y no de lo que
    // mande el cliente, para que no pueda quedar desalineado del id. Es lo
    // mismo que hace `crear_pedido_empresa`, pero aca el insert es directo.
    step = "leer-bolsas";
    const bolsaIds = [
      ...new Set(
        data.items
          .map((it) => it.bolsa_id)
          .filter((b): b is number => typeof b === "number"),
      ),
    ];
    const codigoDeBolsa = new Map<number, string>();
    if (bolsaIds.length > 0) {
      const { data: filas, error: eBolsas } = await supabase
        .from("empresa_bolsas")
        .select("id, codigo")
        .in("id", bolsaIds);
      if (eBolsas) return fallo("actualizarPedidoEmpresa", step, eBolsas);
      for (const b of (filas ?? []) as Array<{ id: number; codigo: string }>) {
        codigoDeBolsa.set(b.id, b.codigo);
      }
      if (codigoDeBolsa.size !== bolsaIds.length) {
        return {
          ok: false,
          error:
            "Alguna de las bolsas ya no existe. Volvé a cargar la pantalla.",
        };
      }
    }

    step = "insert-items";
    const { error: eIns } = await supabase
      .from("pedidos_empresa_items")
      .insert(
        data.items.map((it) => ({
          pedido_empresa_id:        id,
          producto_empresa_id:      it.producto_empresa_id,
          producto_empresa_nombre:  it.nombre,
          precio_unidad:            it.precio_unidad,
          importe:
            it.precio_unidad === null ? null : it.precio_unidad * it.cantidad,
          cantidad:                 it.cantidad,
          detalle_prenda:           it.detalle,
          bolsa_id:                 it.bolsa_id ?? null,
          bolsa_codigo:
            it.bolsa_id == null ? null : codigoDeBolsa.get(it.bolsa_id) ?? null,
        })),
      );
    if (eIns) return fallo("actualizarPedidoEmpresa", step, eIns);

    revalidatePath(`/empresas/pedidos/${id}`);
    revalidatePath("/empresas");
    return { ok: true };
  } catch (err) {
    return fallo("actualizarPedidoEmpresa", step, err);
  }
}
