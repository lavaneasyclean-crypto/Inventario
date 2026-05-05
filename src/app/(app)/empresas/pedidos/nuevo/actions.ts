"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  rut_empresa: z.string().min(1, "Empresa requerida"),
  alias:       z.string().nullable(),
  fecha:       z.string().min(1, "Fecha requerida"),
  detalle:     z.string().nullable(),
  items: z
    .array(
      z.object({
        producto_empresa_id: z.string().min(1),
        nombre:              z.string().min(1),
        precio_unidad:       z.number().int().nullable(),
        cantidad:            z.number().int().positive("Cantidad > 0"),
        detalle:             z.string().nullable(),
      }),
    )
    .min(1, "Agregá al menos un item"),
});

export type CrearPedidoEmpresaInput = z.input<typeof inputSchema>;
export type CrearPedidoEmpresaResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

export async function crearPedidoEmpresa(
  input: CrearPedidoEmpresaInput,
): Promise<CrearPedidoEmpresaResult> {
  let step = "init";
  try {
    step = "parse";
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const data = parsed.data;

    step = "supabase";
    const supabase = await createClient();

    step = "next-id";
    const { data: lastRows } = await supabase
      .from("pedidos_empresa")
      .select("id")
      .order("id", { ascending: false })
      .limit(1);
    const nextId = ((lastRows?.[0]?.id as number | undefined) ?? 0) + 1;

    step = "insert-pedido";
    const { data: pedidoRow, error: e1 } = await supabase
      .from("pedidos_empresa")
      .insert({
        id:          nextId,
        rut_empresa: data.rut_empresa,
        alias:       data.alias,
        fecha:       data.fecha,
        detalle:     data.detalle,
      })
      .select("id")
      .single();

    if (e1 || !pedidoRow) {
      return {
        ok: false,
        error: e1?.message ?? "No se pudo crear el pedido",
      };
    }
    const pedidoId = pedidoRow.id as number;

    step = "insert-items";
    const { error: e2 } = await supabase.from("pedidos_empresa_items").insert(
      data.items.map((it) => ({
        pedido_empresa_id:        pedidoId,
        producto_empresa_id:      it.producto_empresa_id,
        producto_empresa_nombre:  it.nombre,
        precio_unidad:            it.precio_unidad,
        importe:
          it.precio_unidad === null ? null : it.precio_unidad * it.cantidad,
        cantidad:                 it.cantidad,
        detalle_prenda:           it.detalle,
      })),
    );
    if (e2) {
      await supabase.from("pedidos_empresa").delete().eq("id", pedidoId);
      return { ok: false, error: `Error guardando items: ${e2.message}` };
    }

    return { ok: true, id: pedidoId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[crearPedidoEmpresa] step=${step}`, err);
    return { ok: false, error: `Error en "${step}": ${msg}` };
  }
}
