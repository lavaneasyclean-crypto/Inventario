"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { TipoServicio } from "@/lib/types";

const RUT_RE = /^\d{1,8}-[\dkK]$/;

const inputSchema = z.object({
  rut_cliente:    z.string().nullable(),
  nombre_cliente: z.string().min(1, "Nombre requerido").nullable(),
  contacto:       z.string().nullable(),
  direccion:      z.string().nullable(),
  fecha_entrega:  z.string().nullable(),
  notas:          z.string().nullable(),
  pagado:         z.boolean(),
  forma_pago:     z.enum(["efectivo", "transferencia", "redcompra", "no_pago"]),
  items: z.array(z.object({
    producto_id:   z.string().min(1),
    nombre:        z.string().min(1),
    tipo_servicio: z.enum([
      "lavado","seco","planchado","manchas","aplicaciones",
      "ganchos","delivery","pedido_especial","descuento","secado",
    ]),
    precio_unidad: z.number(),
    cantidad:      z.number().int().positive("Cantidad debe ser > 0"),
    detalle:       z.string().nullable(),
  })).min(1, "Agregá al menos un item"),
});

export type CrearPedidoInput = z.input<typeof inputSchema>;
export type CrearPedidoResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

export async function crearPedido(
  input: CrearPedidoInput,
): Promise<CrearPedidoResult> {
  // step trace para que aparezca en Netlify Functions logs
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

    if (data.rut_cliente && !RUT_RE.test(data.rut_cliente)) {
      return { ok: false, error: "RUT con formato inválido" };
    }
    if (!data.rut_cliente && !data.nombre_cliente) {
      return { ok: false, error: "Indicá un cliente o un nombre" };
    }

    step = "supabase-client";
    const supabase = await createClient();

    const total = data.items.reduce(
      (s, it) => s + it.precio_unidad * it.cantidad,
      0,
    );

    step = "select-max-id";
    const { data: lastRows, error: eMax } = await supabase
      .from("pedidos")
      .select("id")
      .order("id", { ascending: false })
      .limit(1);
    if (eMax) {
      return { ok: false, error: `Error consultando último id: ${eMax.message}` };
    }
    const nextId = ((lastRows?.[0]?.id as number | undefined) ?? 0) + 1;

    step = "insert-pedido";
    const { data: pedidoRow, error: e1 } = await supabase
      .from("pedidos")
      .insert({
        id:              nextId,
        rut_cliente:     data.rut_cliente,
        nombre_cliente:  data.nombre_cliente,
        contacto:        data.contacto,
        direccion:       data.direccion,
        estado:          "recibido",
        pagado:          data.pagado,
        forma_pago:      data.pagado ? data.forma_pago : "no_pago",
        monto_abonado:   data.pagado ? total : 0,
        total_venta:     total,
        aviso_enviado:   false,
        fecha_recepcion: new Date().toISOString(),
        fecha_pago:      data.pagado ? new Date().toISOString() : null,
        fecha_entrega:   data.fecha_entrega ?? null,
        notas:           data.notas,
      })
      .select("id")
      .single();

    if (e1 || !pedidoRow) {
      return {
        ok: false,
        error: e1?.message ?? "No se pudo crear el pedido (sin detalle)",
      };
    }

    const pedidoId = pedidoRow.id as number;

    step = "insert-items";
    const { error: e2 } = await supabase.from("pedidos_items").insert(
      data.items.map((it) => ({
        pedido_id:              pedidoId,
        producto_id:            it.producto_id,
        producto_nombre:        it.nombre,
        producto_tipo_servicio: it.tipo_servicio as TipoServicio,
        precio_unidad:          it.precio_unidad,
        cantidad:               it.cantidad,
        importe:                it.precio_unidad * it.cantidad,
        detalle_prenda:         it.detalle,
      })),
    );

    if (e2) {
      await supabase.from("pedidos").delete().eq("id", pedidoId);
      return { ok: false, error: `Error guardando items: ${e2.message}` };
    }

    step = "done";
    return { ok: true, id: pedidoId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : "";
    console.error(`[crearPedido] step=${step} err=`, msg, stack);
    return {
      ok: false,
      error: `Error inesperado en el paso "${step}": ${msg}`,
    };
  }
}

const clienteSchema = z.object({
  rut:      z.string().regex(RUT_RE, "RUT con formato inválido"),
  nombre:   z.string().min(1, "Nombre requerido"),
  telefono: z.string().nullable(),
  correo:   z
    .string()
    .email("Correo inválido")
    .nullable()
    .or(z.literal("").transform(() => null)),
  comuna:   z.string().nullable(),
  calle:    z.string().nullable(),
  dpto:     z.string().nullable(),
});

export type CrearClienteInput = z.input<typeof clienteSchema>;
export type CrearClienteResult =
  | { ok: true; rut: string }
  | { ok: false; error: string };

export async function crearCliente(
  input: CrearClienteInput,
): Promise<CrearClienteResult> {
  let step = "init";
  try {
    step = "parse";
    const parsed = clienteSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const data = parsed.data;

    step = "supabase-client";
    const supabase = await createClient();

    step = "upsert";
    const { error } = await supabase.from("clientes").upsert(
      {
        rut:      data.rut,
        nombre:   data.nombre,
        telefono: data.telefono || null,
        correo:   data.correo || null,
        comuna:   data.comuna || null,
        calle:    data.calle || null,
        dpto:     data.dpto || null,
      },
      { onConflict: "rut" },
    );

    if (error) return { ok: false, error: error.message };

    step = "done";
    return { ok: true, rut: data.rut };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : "";
    console.error(`[crearCliente] step=${step} err=`, msg, stack);
    return {
      ok: false,
      error: `Error inesperado en el paso "${step}": ${msg}`,
    };
  }
}

