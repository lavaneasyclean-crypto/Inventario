"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FormaPago } from "@/lib/types";

async function refresh(pedidoId: number) {
  revalidatePath("/");
  revalidatePath("/pedidos");
  revalidatePath(`/pedidos/${pedidoId}`);
}

export async function marcarListo(formData: FormData) {
  const id = Number(formData.get("id"));
  const supabase = await createClient();
  await supabase.from("pedidos").update({ estado: "listo" }).eq("id", id);
  await refresh(id);
}

export async function marcarEnProceso(formData: FormData) {
  const id = Number(formData.get("id"));
  const supabase = await createClient();
  await supabase
    .from("pedidos")
    .update({ estado: "recibido", fecha_retiro: null })
    .eq("id", id);
  await refresh(id);
}

export async function marcarEntregado(formData: FormData) {
  const id = Number(formData.get("id"));
  const supabase = await createClient();
  await supabase
    .from("pedidos")
    .update({
      estado: "entregado",
      fecha_retiro: new Date().toISOString(),
    })
    .eq("id", id);
  await refresh(id);
}

export async function marcarPagado(formData: FormData) {
  const id = Number(formData.get("id"));
  const formaPago = (formData.get("forma_pago") as FormaPago) ?? "efectivo";
  const total = formData.get("total") as string;

  const supabase = await createClient();
  await supabase
    .from("pedidos")
    .update({
      pagado: true,
      forma_pago: formaPago,
      monto_abonado: total,
      fecha_pago: new Date().toISOString(),
    })
    .eq("id", id);
  await refresh(id);
}

export async function marcarSinPagar(formData: FormData) {
  const id = Number(formData.get("id"));
  const supabase = await createClient();
  await supabase
    .from("pedidos")
    .update({
      pagado: false,
      forma_pago: "no_pago",
      monto_abonado: 0,
      fecha_pago: null,
    })
    .eq("id", id);
  await refresh(id);
}

export async function anularPedido(formData: FormData) {
  const id = Number(formData.get("id"));
  const supabase = await createClient();
  await supabase.from("pedidos").update({ estado: "anulado" }).eq("id", id);
  await refresh(id);
}
