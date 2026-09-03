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

    step = "rpc-crear-pedido-empresa";
    // crear_pedido_empresa (migrations/0006) hace pedido + items en una sola
    // transacción y deja que la secuencia asigne el id.
    const { data: nuevoId, error } = await supabase.rpc(
      "crear_pedido_empresa",
      {
        p_pedido: {
          rut_empresa: data.rut_empresa,
          alias:       data.alias,
          fecha:       data.fecha,
          detalle:     data.detalle,
        },
        p_items: data.items.map((it) => ({
          producto_empresa_id:     it.producto_empresa_id,
          producto_empresa_nombre: it.nombre,
          precio_unidad:           it.precio_unidad,
          cantidad:                it.cantidad,
          detalle_prenda:          it.detalle,
        })),
      },
    );

    if (error) return { ok: false, error: error.message };

    const pedidoId = Number(nuevoId);
    if (!Number.isFinite(pedidoId) || pedidoId <= 0) {
      return { ok: false, error: "No se pudo crear el pedido (sin id)" };
    }

    return { ok: true, id: pedidoId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[crearPedidoEmpresa] step=${step}`, err);
    return { ok: false, error: `Error en "${step}": ${msg}` };
  }
}
