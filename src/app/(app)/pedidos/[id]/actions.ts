"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fallo } from "@/lib/errores";
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
