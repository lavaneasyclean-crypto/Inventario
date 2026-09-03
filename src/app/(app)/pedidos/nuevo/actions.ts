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

    const ahora = new Date().toISOString();

    step = "rpc-crear-pedido";
    // crear_pedido (migrations/0006) inserta el pedido y sus items en una
    // sola transacción y deja que la secuencia asigne el id. Antes esto eran
    // tres viajes: max(id)+1, insert del pedido e insert de los items, con un
    // delete "a mano" si lo último fallaba.
    const { data: nuevoId, error } = await supabase.rpc("crear_pedido", {
      p_pedido: {
        rut_cliente:     data.rut_cliente,
        nombre_cliente:  data.nombre_cliente,
        contacto:        data.contacto,
        direccion:       data.direccion,
        estado:          "recibido",
        pagado:          data.pagado,
        forma_pago:      data.pagado ? data.forma_pago : "no_pago",
        monto_abonado:   data.pagado ? total : 0,
        total_venta:     total,
        fecha_recepcion: ahora,
        fecha_pago:      data.pagado ? ahora : null,
        fecha_entrega:   data.fecha_entrega ?? null,
        notas:           data.notas,
      },
      p_items: data.items.map((it) => ({
        producto_id:            it.producto_id,
        producto_nombre:        it.nombre,
        producto_tipo_servicio: it.tipo_servicio as TipoServicio,
        precio_unidad:          it.precio_unidad,
        cantidad:               it.cantidad,
        detalle_prenda:         it.detalle,
      })),
    });

    if (error) return { ok: false, error: error.message };

    const pedidoId = Number(nuevoId);
    if (!Number.isFinite(pedidoId) || pedidoId <= 0) {
      return { ok: false, error: "No se pudo crear el pedido (sin id)" };
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

    // Antes esto era un upsert, y como el wizard manda null en todo lo que no
    // se llenó, tipear un RUT ya existente borraba el teléfono, el correo y la
    // dirección que ya estaban guardados. Ahora se escribe solo lo que el
    // usuario efectivamente completó.
    const campos = {
      nombre:   data.nombre,
      telefono: data.telefono || null,
      correo:   data.correo || null,
      comuna:   data.comuna || null,
      calle:    data.calle || null,
      dpto:     data.dpto || null,
    };

    step = "buscar-existente";
    const { data: existente, error: eSel } = await supabase
      .from("clientes")
      .select("rut")
      .eq("rut", data.rut)
      .maybeSingle();
    if (eSel) return { ok: false, error: eSel.message };

    if (existente) {
      step = "update";
      const parche = Object.fromEntries(
        Object.entries(campos).filter(([, v]) => v !== null),
      );
      const { error } = await supabase
        .from("clientes")
        .update(parche)
        .eq("rut", data.rut);
      if (error) return { ok: false, error: error.message };
    } else {
      step = "insert";
      const { error } = await supabase
        .from("clientes")
        .insert({ rut: data.rut, ...campos });
      if (error) return { ok: false, error: error.message };
    }

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

