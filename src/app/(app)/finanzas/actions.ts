"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fallo } from "@/lib/errores";
import { getPedidosEmpresaPorIds } from "@/lib/data/empresas";
import { consolidarExpress, consolidarPedidos } from "@/lib/facturacion";
import {
  desgloseIva,
  rangoDeFechas,
  vencimientoPorDefecto,
} from "@/lib/finanzas";
import { CATEGORIAS_GASTO, FORMAS_PAGO_REALES } from "@/lib/types";
import type { ClienteEmpresa } from "@/lib/types";

export type FinanzasResult =
  | { ok: true; id?: number }
  | { ok: false; error: string };

const FECHA = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha con formato inválido");

const FECHA_OPCIONAL = FECHA.nullable().or(z.literal("").transform(() => null));

const FORMA_PAGO = z.enum(
  FORMAS_PAGO_REALES as [(typeof FORMAS_PAGO_REALES)[number]],
);

const textoOpcional = z
  .string()
  .nullable()
  .transform((v) => (v && v.trim() ? v.trim() : null));

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
    // No bloquear la operación principal por un fallo de auditoría.
  }
}

// =========================================================
// Registrar una factura desde la pantalla de facturación
// =========================================================

const registrarSchema = z.object({
  rut: z.string().min(1, "Falta la empresa"),
  tipo: z.enum(["normal", "express"]),
  guiaIds: z.array(z.number().int().positive()).min(1, "Marcá al menos una guía"),
  folio: textoOpcional,
  fecha: FECHA,
  fecha_vence: FECHA_OPCIONAL,
  notas: textoOpcional,
});

export type RegistrarFacturaInput = z.input<typeof registrarSchema>;

/**
 * Congela el consolidado en una factura.
 *
 * El monto NO viene de la pantalla: se vuelven a leer las guías y se rehace el
 * consolidado acá. La pantalla puede tener datos de hace media hora, y una
 * factura emitida por un número que ya no es el que dice la base es un
 * problema que después nadie entiende.
 */
export async function registrarFactura(
  input: RegistrarFacturaInput,
): Promise<FinanzasResult> {
  let step = "init";
  try {
    step = "parse";
    const parsed = registrarSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const data = parsed.data;

    step = "empresa";
    const supabase = await createClient();
    const { data: empresaData } = await supabase
      .from("clientes_empresa")
      .select("*")
      .eq("rut", data.rut)
      .maybeSingle();
    if (!empresaData) return { ok: false, error: "La empresa no existe" };
    const empresa = empresaData as ClienteEmpresa;

    step = "guias";
    const pedidos = await getPedidosEmpresaPorIds(data.rut, data.guiaIds);
    if (pedidos.length !== data.guiaIds.length) {
      return {
        ok: false,
        error:
          "Alguna de las guías ya no existe, fue anulada o cambió de empresa. Volvé a cargar la pantalla.",
      };
    }

    step = "consolidar";
    const seleccion = new Set(data.guiaIds);
    const idsIncluidas =
      data.tipo === "express"
        ? pedidos.filter((p) => p.pedido.express).map((p) => p.pedido.id)
        : data.guiaIds;

    if (data.tipo === "express" && idsIncluidas.length === 0) {
      return {
        ok: false,
        error: "Ninguna de las guías marcadas es express.",
      };
    }

    const consolidado =
      data.tipo === "express"
        ? consolidarExpress(pedidos, seleccion, empresa.recargo_express)
        : consolidarPedidos(pedidos, seleccion);

    if (consolidado.lineas.length === 0) {
      return { ok: false, error: "Las guías marcadas no tienen items." };
    }
    if (data.tipo === "express" && consolidado.neto === 0) {
      return {
        ok: false,
        error:
          empresa.recargo_express <= 0
            ? "Esta empresa no tiene recargo express configurado."
            : "El recargo de estas guías da cero: no hay nada que facturar.",
      };
    }

    step = "periodo";
    const rango = rangoDeFechas(
      pedidos
        .filter((p) => idsIncluidas.includes(p.pedido.id))
        .map((p) => p.pedido.fecha),
    );

    step = "rpc";
    const { data: nuevoId, error } = await supabase.rpc("registrar_factura", {
      p_factura: {
        rut_empresa: data.rut,
        tipo: data.tipo,
        folio: data.folio,
        fecha: data.fecha,
        fecha_vence: data.fecha_vence ?? vencimientoPorDefecto(data.fecha),
        periodo_desde: rango?.desde ?? null,
        periodo_hasta: rango?.hasta ?? null,
        neto: consolidado.neto,
        iva: consolidado.iva,
        total: consolidado.total,
        notas: data.notas,
      },
      p_lineas: consolidado.lineas.map((l) => ({
        producto_empresa_id: l.producto_empresa_id,
        nombre: l.etiqueta,
        cantidad: l.cantidad,
        precio_unidad: l.precio_unidad,
        importe: l.importe,
      })),
      p_guias: idsIncluidas,
    });

    if (error) {
      // El mensaje de "ya facturadas" lo arma la función y es justamente lo
      // que la persona necesita leer, así que se deja pasar tal cual en vez
      // de caer al genérico.
      const msg = (error as { message?: string }).message ?? "";
      if (msg.includes("Ya facturadas") || msg.includes("guía")) {
        return { ok: false, error: msg.replace(/^.*?:\s*/, "") };
      }
      return fallo("registrarFactura", step, error);
    }

    revalidatePath("/finanzas");
    revalidatePath("/finanzas/facturas");
    revalidatePath(`/empresas/${data.rut}/facturacion`);
    return { ok: true, id: Number(nuevoId) };
  } catch (err) {
    return fallo("registrarFactura", step, err);
  }
}

// =========================================================
// Factura cargada a mano
// =========================================================

const facturaManualSchema = z.object({
  rut_empresa: z.string().min(1, "Elegí una empresa"),
  tipo: z.enum(["normal", "express"]),
  folio: textoOpcional,
  fecha: FECHA,
  fecha_vence: FECHA_OPCIONAL,
  neto: z.number().int().min(0, "El neto no puede ser negativo"),
  notas: textoOpcional,
});

export type FacturaManualInput = z.input<typeof facturaManualSchema>;

export async function crearFacturaManual(
  input: FacturaManualInput,
): Promise<FinanzasResult> {
  let step = "init";
  try {
    step = "parse";
    const parsed = facturaManualSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const data = parsed.data;
    const montos = desgloseIva(data.neto);

    step = "insert";
    const supabase = await createClient();
    const { data: fila, error } = await supabase
      .from("facturas")
      .insert({
        rut_empresa: data.rut_empresa,
        tipo: data.tipo,
        folio: data.folio,
        fecha: data.fecha,
        fecha_vence: data.fecha_vence ?? vencimientoPorDefecto(data.fecha),
        neto: montos.neto,
        iva: montos.iva,
        total: montos.total,
        estado: "pendiente",
        notas: data.notas,
      })
      .select("id")
      .single();

    if (error) return fallo("crearFacturaManual", step, error);

    revalidatePath("/finanzas");
    revalidatePath("/finanzas/facturas");
    return { ok: true, id: (fila as { id: number }).id };
  } catch (err) {
    return fallo("crearFacturaManual", step, err);
  }
}

// =========================================================
// Editar la cabecera de una factura
// =========================================================

const editarFacturaSchema = z.object({
  folio: textoOpcional,
  fecha: FECHA,
  fecha_vence: FECHA_OPCIONAL,
  notas: textoOpcional,
});

export type EditarFacturaInput = z.input<typeof editarFacturaSchema>;

export async function actualizarFactura(
  id: number,
  input: EditarFacturaInput,
): Promise<FinanzasResult> {
  let step = "init";
  try {
    step = "parse";
    const parsed = editarFacturaSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const data = parsed.data;

    step = "update";
    const supabase = await createClient();
    const { error } = await supabase
      .from("facturas")
      .update({
        folio: data.folio,
        fecha: data.fecha,
        fecha_vence: data.fecha_vence,
        notas: data.notas,
      })
      .eq("id", id);

    if (error) {
      if ((error as { code?: string }).code === "23505") {
        return { ok: false, error: "Ya hay otra factura con ese folio." };
      }
      return fallo("actualizarFactura", step, error);
    }

    revalidatePath("/finanzas/facturas");
    revalidatePath(`/finanzas/facturas/${id}`);
    return { ok: true, id };
  } catch (err) {
    return fallo("actualizarFactura", step, err);
  }
}

// =========================================================
// Estado de pago de una factura
// =========================================================

const pagoSchema = z.object({
  fecha_pago: FECHA,
  forma_pago: FORMA_PAGO,
});

export type PagoInput = z.input<typeof pagoSchema>;

export async function marcarFacturaPagada(
  id: number,
  input: PagoInput,
): Promise<FinanzasResult> {
  let step = "init";
  try {
    step = "parse";
    const parsed = pagoSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }

    step = "update";
    const supabase = await createClient();
    const { error } = await supabase
      .from("facturas")
      .update({
        estado: "pagada",
        fecha_pago: parsed.data.fecha_pago,
        forma_pago: parsed.data.forma_pago,
      })
      .eq("id", id)
      .eq("estado", "pendiente");

    if (error) return fallo("marcarFacturaPagada", step, error);

    await logAuditoria("factura", String(id), "pago", null, parsed.data);
    revalidatePath("/finanzas");
    revalidatePath("/finanzas/facturas");
    revalidatePath(`/finanzas/facturas/${id}`);
    return { ok: true, id };
  } catch (err) {
    return fallo("marcarFacturaPagada", step, err);
  }
}

export async function marcarFacturaPendiente(
  id: number,
): Promise<FinanzasResult> {
  const step = "update";
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("facturas")
      .update({ estado: "pendiente", fecha_pago: null, forma_pago: null })
      .eq("id", id)
      .eq("estado", "pagada");

    if (error) return fallo("marcarFacturaPendiente", step, error);

    await logAuditoria("factura", String(id), "revertir_pago", null, null);
    revalidatePath("/finanzas");
    revalidatePath("/finanzas/facturas");
    revalidatePath(`/finanzas/facturas/${id}`);
    return { ok: true, id };
  } catch (err) {
    return fallo("marcarFacturaPendiente", step, err);
  }
}

/**
 * Anular no borra: la factura sigue en el historial y sus guías quedan libres
 * para volver a facturarse. La fecha de pago se conserva si la había.
 */
export async function anularFactura(id: number): Promise<FinanzasResult> {
  const step = "update";
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("facturas")
      .update({ estado: "anulada" })
      .eq("id", id);

    if (error) return fallo("anularFactura", step, error);

    await logAuditoria("factura", String(id), "anular", null, null);
    revalidatePath("/finanzas");
    revalidatePath("/finanzas/facturas");
    revalidatePath(`/finanzas/facturas/${id}`);
    return { ok: true, id };
  } catch (err) {
    return fallo("anularFactura", step, err);
  }
}

export async function reactivarFactura(id: number): Promise<FinanzasResult> {
  let step = "leer";
  try {
    const supabase = await createClient();

    // Mientras estuvo anulada sus guías pudieron entrar en otra factura del
    // mismo tipo. Reactivarla sin mirar dejaría la guía facturada dos veces.
    const { data: guias } = await supabase
      .from("facturas_guias")
      .select("pedido_empresa_id")
      .eq("factura_id", id);
    const ids = (guias ?? []).map((g) => g.pedido_empresa_id as number);

    if (ids.length > 0) {
      step = "chequear-conflicto";
      const { data: actual } = await supabase
        .from("facturas")
        .select("tipo")
        .eq("id", id)
        .maybeSingle();
      const tipo = (actual as { tipo: string } | null)?.tipo ?? "normal";

      const { data: choques } = await supabase
        .from("facturas_guias")
        .select("pedido_empresa_id, facturas!inner(id, tipo, estado)")
        .in("pedido_empresa_id", ids)
        .neq("factura_id", id)
        .eq("facturas.tipo", tipo)
        .neq("facturas.estado", "anulada");

      if ((choques ?? []).length > 0) {
        const otras = [
          ...new Set(
            (choques as unknown as Array<{ facturas: { id: number } }>).map(
              (c) => c.facturas.id,
            ),
          ),
        ];
        return {
          ok: false,
          error: `No se puede reactivar: sus guías ya están en la factura #${otras.join(", #")}.`,
        };
      }
    }

    step = "update";
    const { error } = await supabase
      .from("facturas")
      .update({ estado: "pendiente", fecha_pago: null, forma_pago: null })
      .eq("id", id);

    if (error) return fallo("reactivarFactura", step, error);

    await logAuditoria("factura", String(id), "reactivar", null, null);
    revalidatePath("/finanzas");
    revalidatePath("/finanzas/facturas");
    revalidatePath(`/finanzas/facturas/${id}`);
    return { ok: true, id };
  } catch (err) {
    return fallo("reactivarFactura", step, err);
  }
}

// =========================================================
// Gastos
// =========================================================

const gastoSchema = z.object({
  categoria: z.enum(CATEGORIAS_GASTO as [(typeof CATEGORIAS_GASTO)[number]]),
  descripcion: z.string().min(1, "Poné una descripción"),
  proveedor: textoOpcional,
  documento: textoOpcional,
  fecha: FECHA,
  fecha_vence: FECHA_OPCIONAL,
  periodo: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "El período va como 2026-09")
    .nullable()
    .or(z.literal("").transform(() => null)),
  monto: z.number().int().min(1, "El monto tiene que ser mayor a cero"),
  notas: textoOpcional,
});

export type GastoInput = z.input<typeof gastoSchema>;

export async function crearGasto(input: GastoInput): Promise<FinanzasResult> {
  let step = "init";
  try {
    step = "parse";
    const parsed = gastoSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const data = parsed.data;

    step = "insert";
    const supabase = await createClient();
    const { data: fila, error } = await supabase
      .from("gastos")
      .insert({ ...data, pagado: false })
      .select("id")
      .single();

    if (error) return fallo("crearGasto", step, error);

    revalidatePath("/finanzas");
    revalidatePath("/finanzas/gastos");
    return { ok: true, id: (fila as { id: number }).id };
  } catch (err) {
    return fallo("crearGasto", step, err);
  }
}

export async function actualizarGasto(
  id: number,
  input: GastoInput,
): Promise<FinanzasResult> {
  let step = "init";
  try {
    step = "parse";
    const parsed = gastoSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }

    step = "update";
    const supabase = await createClient();
    const { error } = await supabase
      .from("gastos")
      .update(parsed.data)
      .eq("id", id);

    if (error) return fallo("actualizarGasto", step, error);

    revalidatePath("/finanzas");
    revalidatePath("/finanzas/gastos");
    return { ok: true, id };
  } catch (err) {
    return fallo("actualizarGasto", step, err);
  }
}

export async function eliminarGasto(id: number): Promise<FinanzasResult> {
  let step = "leer";
  try {
    const supabase = await createClient();
    const { data: antes } = await supabase
      .from("gastos")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    step = "delete";
    const { error } = await supabase.from("gastos").delete().eq("id", id);
    if (error) return fallo("eliminarGasto", step, error);

    await logAuditoria("gasto", String(id), "eliminar", antes, null);
    revalidatePath("/finanzas");
    revalidatePath("/finanzas/gastos");
    return { ok: true, id };
  } catch (err) {
    return fallo("eliminarGasto", step, err);
  }
}

export async function marcarGastoPagado(
  id: number,
  input: PagoInput,
): Promise<FinanzasResult> {
  let step = "init";
  try {
    step = "parse";
    const parsed = pagoSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }

    step = "update";
    const supabase = await createClient();
    const { error } = await supabase
      .from("gastos")
      .update({
        pagado: true,
        fecha_pago: parsed.data.fecha_pago,
        forma_pago: parsed.data.forma_pago,
      })
      .eq("id", id);

    if (error) return fallo("marcarGastoPagado", step, error);

    revalidatePath("/finanzas");
    revalidatePath("/finanzas/gastos");
    return { ok: true, id };
  } catch (err) {
    return fallo("marcarGastoPagado", step, err);
  }
}

export async function marcarGastoPendiente(
  id: number,
): Promise<FinanzasResult> {
  const step = "update";
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("gastos")
      .update({ pagado: false, fecha_pago: null, forma_pago: null })
      .eq("id", id);

    if (error) return fallo("marcarGastoPendiente", step, error);

    revalidatePath("/finanzas");
    revalidatePath("/finanzas/gastos");
    return { ok: true, id };
  } catch (err) {
    return fallo("marcarGastoPendiente", step, err);
  }
}
