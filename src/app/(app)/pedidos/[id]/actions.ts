"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { fallo } from "@/lib/errores";
import { hoyEnChile } from "@/lib/fecha";
import { importeLinea } from "@/lib/medidas";
import { registrarCambioDeItems } from "@/lib/data/registrar-cambio-items";

/**
 * Estas acciones se disparan desde botones del detalle del pedido. Antes
 * descartaban el resultado del update: si la escritura fallaba, la persona
 * veía el botón responder y creía que el pedido había quedado marcado. Ahora
 * devuelven el resultado y la UI avisa.
 */
export type AccionPedidoResult = { ok: true } | { ok: false; error: string };

const ERROR_ID = "No se pudo identificar el pedido.";

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
  // "no_pago" significa justamente que no pago: no sirve para cobrar.
  const FORMAS_COBRO = ["efectivo", "transferencia", "redcompra"] as const;
  const forma = String(formData.get("forma_pago") ?? "efectivo");
  if (!FORMAS_COBRO.includes(forma as (typeof FORMAS_COBRO)[number])) {
    return { ok: false, error: "La forma de pago no es válida." };
  }

  const total = Number(formData.get("total"));
  if (!Number.isFinite(total)) {
    return { ok: false, error: "El total del pedido no es un monto válido." };
  }

  const id = leerId(formData);
  if (id === null) return { ok: false, error: ERROR_ID };

  // Cobrar todo es registrar un abono por el saldo, no escribir el estado: el
  // estado lo deriva la base de la suma de abonos (migrations/0020). Si se
  // escribiera aca, el primer abono parcial que alguien cargue despues lo
  // recalcularia y pisaria este.
  return registrarAbono(id, {
    fecha: hoyEnChile(),
    monto: total,
    forma_pago: forma as (typeof FORMAS_COBRO)[number],
    notas: null,
    soloSaldo: true,
  });
}

export async function marcarSinPagar(
  formData: FormData,
): Promise<AccionPedidoResult> {
  const id = leerId(formData);
  if (id === null) return { ok: false, error: ERROR_ID };

  try {
    const supabase = await createClient();
    // Se borran los abonos y el trigger deja el pedido impago. Escribir
    // `pagado: false` dejando los abonos haria que la cabecera dijera una cosa
    // y el detalle de pagos otra.
    const { error } = await supabase
      .from("pedidos_abonos")
      .delete()
      .eq("pedido_id", id);
    if (error) return fallo("marcarSinPagar", "delete-abonos", error);

    await refresh(id);
    return { ok: true };
  } catch (err) {
    return fallo("marcarSinPagar", "delete-abonos", err);
  }
}

export async function anularPedido(
  formData: FormData,
): Promise<AccionPedidoResult> {
  return actualizar("anularPedido", formData, { estado: "anulado" });
}

const editarSchema = z.object({
  /**
   * El `updated_at` que tenia el pedido al abrirlo.
   *
   * Guardar borra todas las lineas y las reescribe: sin esto, dos personas
   * editando el mismo pedido terminan con que la ultima se lleva puesto el
   * trabajo de la otra sin que ninguna se entere.
   */
  version: z.string().min(1),
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

    // Con la version puesta: si no coincide no toca ninguna fila y se corta
    // aca, antes de borrar las lineas.
    step = "update-pedido";
    const { data: tocadas, error: ePed } = await supabase
      .from("pedidos")
      .update({
        fecha_entrega: data.fecha_entrega,
        notas: data.notas,
      })
      .eq("id", id)
      .eq("updated_at", data.version)
      .select("id");
    if (ePed) return fallo("actualizarPedido", step, ePed);

    if (!tocadas || tocadas.length === 0) {
      return {
        ok: false,
        error:
          "Alguien más guardó este pedido mientras lo estabas editando. " +
          "Recargá la página para ver lo que quedó.",
      };
    }

    // Antes de reemplazarlas, qué había. Es el único momento en que se
    // pueden ver las viejas y las nuevas juntas.
    step = "historial-items";
    const { data: viejas } = await supabase
      .from("pedidos_items")
      .select("producto_nombre, cantidad, detalle_prenda")
      .eq("pedido_id", id);
    await registrarCambioDeItems(
      "pedidos",
      id,
      ((viejas ?? []) as { producto_nombre: string; cantidad: number; detalle_prenda: string | null }[])
        .map((v) => ({
          nombre: v.producto_nombre,
          cantidad: v.cantidad,
          detalle: v.detalle_prenda,
        })),
      filas.map((f) => ({
        nombre: f.producto_nombre,
        cantidad: f.cantidad,
        detalle: f.detalle_prenda,
      })),
    );

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


const abonoSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha con formato inválido"),
  monto: z.number().positive("El abono tiene que ser mayor a cero"),
  forma_pago: z.enum(["efectivo", "transferencia", "redcompra"]),
  notas: z.string().nullable(),
  /** Para "cobrar todo": si ya hay algo abonado, cobra solo lo que falta. */
  soloSaldo: z.boolean().optional(),
});

export type AbonoPedidoInput = z.input<typeof abonoSchema>;

/**
 * Registra un pago recibido a cuenta de un pedido.
 *
 * No se escribe `pagado` ni `monto_abonado`: los recalcula el trigger de la
 * base a partir de la suma de abonos. Es la misma regla que en las facturas, y
 * por el mismo motivo: dos lugares decidiendo si algo esta pagado terminan
 * diciendo cosas distintas.
 */
export async function registrarAbono(
  pedidoId: number,
  input: AbonoPedidoInput,
): Promise<AccionPedidoResult> {
  let step = "init";
  try {
    step = "parse";
    const parsed = abonoSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const data = parsed.data;

    step = "leer-pedido";
    const supabase = await createClient();
    const { data: pedido } = await supabase
      .from("pedidos")
      .select("estado, total_venta, monto_abonado")
      .eq("id", pedidoId)
      .maybeSingle();
    if (!pedido) return { ok: false, error: "El pedido no existe." };

    const p = pedido as {
      estado: string;
      total_venta: number;
      monto_abonado: number;
    };
    if (p.estado === "anulado") {
      return {
        ok: false,
        error: "El pedido está anulado: no se le pueden registrar pagos.",
      };
    }

    const saldo = Math.max(0, Number(p.total_venta) - Number(p.monto_abonado));
    if (saldo <= 0) {
      return { ok: false, error: "Este pedido ya está pagado." };
    }

    const monto = data.soloSaldo ? Math.min(data.monto, saldo) : data.monto;
    if (monto > saldo) {
      return {
        ok: false,
        error: `El abono supera el saldo. Falta cobrar ${saldo.toLocaleString("es-CL")}.`,
      };
    }

    step = "insert";
    const { error } = await supabase.from("pedidos_abonos").insert({
      pedido_id: pedidoId,
      fecha: data.fecha,
      monto,
      forma_pago: data.forma_pago,
      notas: data.notas,
    });
    if (error) return fallo("registrarAbono", step, error);

    await refresh(pedidoId);
    return { ok: true };
  } catch (err) {
    return fallo("registrarAbono", step, err);
  }
}

export async function eliminarAbono(
  pedidoId: number,
  abonoId: number,
): Promise<AccionPedidoResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("pedidos_abonos")
      .delete()
      .eq("id", abonoId)
      .eq("pedido_id", pedidoId);
    if (error) return fallo("eliminarAbono", "delete", error);

    await refresh(pedidoId);
    return { ok: true };
  } catch (err) {
    return fallo("eliminarAbono", "delete", err);
  }
}
