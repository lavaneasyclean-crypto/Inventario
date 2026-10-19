"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { fallo } from "@/lib/errores";
import { importeLinea } from "@/lib/medidas";
import type { FormaPago } from "@/lib/types";

/**
 * Estas acciones se disparan desde botones del detalle del pedido. Antes
 * descartaban el resultado del update: si la escritura fallaba, la persona
 * veía el botón responder y creía que el pedido había quedado marcado. Ahora
 * devuelven el resultado y la UI avisa.
 */
export type AccionPedidoResult = { ok: true } | { ok: false; error: string };

const ERROR_ID = "No se pudo identificar el pedido.";

const FORMAS_PAGO: readonly FormaPago[] = [
  "efectivo",
  "transferencia",
  "redcompra",
  "no_pago",
];

function leerId(formData: FormData): number | null {
  const id = Number(formData.get("id"));
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function refresh(pedidoId: number) {
  revalidatePath("/");
  revalidatePath("/pedidos");
  revalidatePath(`/pedidos/${pedidoId}`);
}

/** Aplica un cambio sobre el pedido del formulario y reporta cómo salió. */
async function actualizar(
  contexto: string,
  formData: FormData,
  campos: Record<string, unknown>,
): Promise<AccionPedidoResult> {
  const id = leerId(formData);
  if (id === null) return { ok: false, error: ERROR_ID };

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("pedidos")
      .update(campos)
      .eq("id", id);
    if (error) return fallo(contexto, "update", error);

    await refresh(id);
    return { ok: true };
  } catch (err) {
    return fallo(contexto, "update", err);
  }
}

export async function marcarListo(
  formData: FormData,
): Promise<AccionPedidoResult> {
  return actualizar("marcarListo", formData, { estado: "listo" });
}

export async function marcarEnProceso(
  formData: FormData,
): Promise<AccionPedidoResult> {
  return actualizar("marcarEnProceso", formData, {
    estado: "recibido",
    fecha_retiro: null,
  });
}

export async function marcarEntregado(
  formData: FormData,
): Promise<AccionPedidoResult> {
  return actualizar("marcarEntregado", formData, {
    estado: "entregado",
    fecha_retiro: new Date().toISOString(),
  });
}

export async function marcarPagado(
  formData: FormData,
): Promise<AccionPedidoResult> {
  const forma = String(formData.get("forma_pago") ?? "efectivo") as FormaPago;
  if (!FORMAS_PAGO.includes(forma)) {
    return { ok: false, error: "La forma de pago no es válida." };
  }

  const total = Number(formData.get("total"));
  if (!Number.isFinite(total)) {
    return { ok: false, error: "El total del pedido no es un monto válido." };
  }

  return actualizar("marcarPagado", formData, {
    pagado: true,
    forma_pago: forma,
    monto_abonado: total,
    fecha_pago: new Date().toISOString(),
  });
}

export async function marcarSinPagar(
  formData: FormData,
): Promise<AccionPedidoResult> {
  return actualizar("marcarSinPagar", formData, {
    pagado: false,
    forma_pago: "no_pago",
    monto_abonado: 0,
    fecha_pago: null,
  });
}

export async function anularPedido(
  formData: FormData,
): Promise<AccionPedidoResult> {
  return actualizar("anularPedido", formData, { estado: "anulado" });
}

const editarSchema = z.object({
  fecha_entrega: z.string().nullable(),
  notas: z.string().nullable(),
  items: z
    .array(
      z.object({
        producto_id: z.string().min(1),
        nombre: z.string().min(1),
        tipo_servicio: z.enum([
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
        ]),
        unidad_cobro: z.enum(["unidad", "m2", "metro_lineal"]).default("unidad"),
        ancho: z.number().positive().nullable().default(null),
        largo: z.number().positive().nullable().default(null),
        precio_unidad: z.number(),
        cantidad: z.number().int().positive("Cantidad debe ser > 0"),
        detalle: z.string().nullable(),
      }),
    )
    .min(1, "El pedido necesita al menos un item"),
});

export type EditarPedidoInput = z.input<typeof editarSchema>;

/**
 * Edita un pedido de mostrador: sus prendas, la fecha de entrega y las notas.
 *
 * El cliente no se cambia a propósito, igual que en las guías de empresa. Un
 * pedido con el cliente equivocado no es un pedido mal escrito, es el pedido de
 * otra persona: se anula y se hace de nuevo, y así queda el rastro.
 *
 * Los items se reemplazan enteros en vez de intentar casarlos uno a uno: no
 * tienen clave natural, y adivinar cuál línea es "la misma" después de que
 * alguien cambió el producto es como se corrompen los totales.
 *
 * `total_venta` no se toca acá: lo recalcula el trigger de `pedidos_items`
 * (migrations/0002) al cambiar las líneas. El importe de cada línea sí se
 * calcula acá, con la misma fórmula que usa `crear_pedido`.
 */
export async function actualizarPedido(
  id: number,
  input: EditarPedidoInput,
): Promise<AccionPedidoResult> {
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

    step = "importes";
    const filas = [];
    for (const it of data.items) {
      const importe = importeLinea({
        unidad: it.unidad_cobro,
        precioUnidad: it.precio_unidad,
        cantidad: it.cantidad,
        ancho: it.ancho,
        largo: it.largo,
      });
      if (importe === null) {
        return { ok: false, error: `Falta la medida de "${it.nombre}"` };
      }
      filas.push({
        pedido_id: id,
        producto_id: it.producto_id,
        producto_nombre: it.nombre,
        producto_tipo_servicio: it.tipo_servicio,
        unidad_cobro: it.unidad_cobro,
        ancho: it.ancho,
        largo: it.largo,
        precio_unidad: it.precio_unidad,
        cantidad: it.cantidad,
        importe,
        detalle_prenda: it.detalle,
      });
    }

    step = "supabase";
    const supabase = await createClient();

    step = "estado";
    const { data: actual } = await supabase
      .from("pedidos")
      .select("estado")
      .eq("id", id)
      .maybeSingle();
    if (!actual) return { ok: false, error: "El pedido no existe." };
    if ((actual as { estado: string }).estado === "anulado") {
      return {
        ok: false,
        error: "El pedido está anulado. Reactivalo antes de editarlo.",
      };
    }

    step = "update-pedido";
    const { error: ePed } = await supabase
      .from("pedidos")
      .update({
        fecha_entrega: data.fecha_entrega,
        notas: data.notas,
      })
      .eq("id", id);
    if (ePed) return fallo("actualizarPedido", step, ePed);

    step = "delete-items";
    const { error: eDel } = await supabase
      .from("pedidos_items")
      .delete()
      .eq("pedido_id", id);
    if (eDel) return fallo("actualizarPedido", step, eDel);

    step = "insert-items";
    const { error: eIns } = await supabase.from("pedidos_items").insert(filas);
    if (eIns) return fallo("actualizarPedido", step, eIns);

    await refresh(id);
    return { ok: true };
  } catch (err) {
    return fallo("actualizarPedido", step, err);
  }
}
