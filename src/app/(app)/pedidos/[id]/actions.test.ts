import { describe, it, expect, afterAll, vi } from "vitest";
import {
  crearSupabaseFake,
  type RespuestaFake,
  type SupabaseFake,
} from "@/lib/testing/supabase-fake";

const estado = vi.hoisted(() => ({ supabase: null as unknown }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => estado.supabase,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  actualizarPedido,
  anularPedido,
  marcarEnProceso,
  marcarEntregado,
  marcarListo,
  marcarPagado,
  marcarSinPagar,
} from "./actions";

const logSilenciado = vi
  .spyOn(console, "error")
  .mockImplementation(() => undefined);
afterAll(() => logSilenciado.mockRestore());

function montar(respuestas: Record<string, RespuestaFake> = {}): SupabaseFake {
  const fake = crearSupabaseFake(respuestas);
  estado.supabase = fake;
  return fake;
}

function form(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

function payloadDe(fake: SupabaseFake): Record<string, unknown> {
  return fake.ultima("pedidos", "update")?.payload as Record<string, unknown>;
}

describe("cambios de estado", () => {
  it("marcarListo deja el pedido listo y filtra por su id", async () => {
    const fake = montar();
    const res = await marcarListo(form({ id: "42" }));

    expect(res).toEqual({ ok: true });
    const update = fake.ultima("pedidos", "update");
    expect(update?.payload).toEqual({ estado: "listo" });
    expect(update?.filtros).toContainEqual({ metodo: "eq", args: ["id", 42] });
  });

  it("marcarEntregado registra la fecha de retiro", async () => {
    const fake = montar();
    const res = await marcarEntregado(form({ id: "42" }));

    expect(res).toEqual({ ok: true });
    const payload = payloadDe(fake);
    expect(payload.estado).toBe("entregado");
    expect(typeof payload.fecha_retiro).toBe("string");
  });

  it("marcarEnProceso borra la fecha de retiro al revertir", async () => {
    const fake = montar();
    await marcarEnProceso(form({ id: "42" }));

    expect(payloadDe(fake)).toEqual({
      estado: "recibido",
      fecha_retiro: null,
    });
  });

  it("anularPedido no borra: solo cambia el estado", async () => {
    const fake = montar();
    await anularPedido(form({ id: "42" }));

    expect(payloadDe(fake)).toEqual({ estado: "anulado" });
    expect(fake.ultima("pedidos", "delete")).toBeUndefined();
  });
});

describe("cobro", () => {
  it("marcarPagado registra un abono por el saldo, no escribe el estado", async () => {
    const fake = montar({
      "pedidos.select": {
        data: { estado: "recibido", total_venta: 10600, monto_abonado: 0 },
      },
      "pedidos_abonos.insert": { data: null },
    });
    const res = await marcarPagado(
      form({ id: "42", forma_pago: "transferencia", total: "10600" }),
    );

    expect(res).toEqual({ ok: true });
    // El estado de pago lo deriva el trigger de la suma de abonos: escribirlo
    // aca tambien seria tener dos fuentes para el mismo dato.
    expect(fake.ultima("pedidos", "update")).toBeUndefined();
    const abono = fake.ultima("pedidos_abonos", "insert")?.payload as Record<
      string,
      unknown
    >;
    expect(abono).toMatchObject({
      pedido_id: 42,
      monto: 10600,
      forma_pago: "transferencia",
    });
  });

  it("marcarPagado sobre un pedido con abono previo cobra solo el saldo", async () => {
    const fake = montar({
      "pedidos.select": {
        data: { estado: "recibido", total_venta: 10600, monto_abonado: 4000 },
      },
      "pedidos_abonos.insert": { data: null },
    });
    await marcarPagado(
      form({ id: "42", forma_pago: "efectivo", total: "10600" }),
    );

    const abono = fake.ultima("pedidos_abonos", "insert")?.payload as Record<
      string,
      unknown
    >;
    expect(abono.monto).toBe(6600);
  });

  it("no se cobra un pedido anulado", async () => {
    const fake = montar({
      "pedidos.select": {
        data: { estado: "anulado", total_venta: 10600, monto_abonado: 0 },
      },
    });
    const res = await marcarPagado(
      form({ id: "42", forma_pago: "efectivo", total: "10600" }),
    );

    expect(res.ok).toBe(false);
    expect(fake.ultima("pedidos_abonos", "insert")).toBeUndefined();
  });

  it("marcarPagado rechaza una forma de pago inventada", async () => {
    const fake = montar();
    const res = await marcarPagado(
      form({ id: "42", forma_pago: "bitcoin", total: "1000" }),
    );

    expect(res).toEqual({ ok: false, error: "La forma de pago no es válida." });
    expect(fake.ultima("pedidos_abonos", "insert")).toBeUndefined();
  });

  it("marcarPagado rechaza un total que no es un monto", async () => {
    const fake = montar();
    const res = await marcarPagado(
      form({ id: "42", forma_pago: "efectivo", total: "muchos" }),
    );

    expect(res).toEqual({
      ok: false,
      error: "El total del pedido no es un monto válido.",
    });
    expect(fake.ultima("pedidos", "update")).toBeUndefined();
  });

  it("marcarSinPagar borra los abonos y deja que el trigger recalcule", async () => {
    const fake = montar({ "pedidos_abonos.delete": { data: null } });
    const res = await marcarSinPagar(form({ id: "42" }));

    expect(res).toEqual({ ok: true });
    // Escribir `pagado: false` dejando los abonos haria que la cabecera
    // dijera una cosa y el detalle de pagos otra.
    expect(fake.ultima("pedidos", "update")).toBeUndefined();
    const borrado = fake.ultima("pedidos_abonos", "delete");
    expect(borrado?.filtros).toContainEqual({
      metodo: "eq",
      args: ["pedido_id", 42],
    });
  });
});

describe("errores que antes pasaban desapercibidos", () => {
  it("avisa cuando el update falla en vez de dar por hecho el cambio", async () => {
    // Esta es la regresión: antes el resultado se descartaba, el botón
    // respondía igual y el pedido quedaba sin marcar.
    montar({
      "pedidos.update": {
        error: { code: "42501", message: 'permission denied for table "pedidos"' },
      },
    });
    const res = await marcarListo(form({ id: "42" }));

    expect(res.ok).toBe(false);
    const error = (res as { error: string }).error;
    expect(error).toBe("Tu usuario no tiene permiso para hacer esto.");
    expect(error).not.toMatch(/permission denied|table/i);
  });

  it("avisa si se cayo la conexion", async () => {
    montar({ "pedidos.update": { error: { message: "fetch failed" } } });
    const res = await marcarEntregado(form({ id: "42" }));

    expect(res.ok).toBe(false);
    expect((res as { error: string }).error).toMatch(/conectar/i);
  });

  it("no intenta escribir si el formulario vino sin id", async () => {
    const fake = montar();
    const res = await marcarListo(new FormData());

    expect(res).toEqual({
      ok: false,
      error: "No se pudo identificar el pedido.",
    });
    expect(fake.ultima("pedidos", "update")).toBeUndefined();
  });

  it("rechaza un id que no es un numero de pedido", async () => {
    const fake = montar();

    expect(await marcarListo(form({ id: "abc" }))).toMatchObject({ ok: false });
    expect(await marcarListo(form({ id: "0" }))).toMatchObject({ ok: false });
    expect(await marcarListo(form({ id: "-3" }))).toMatchObject({ ok: false });
    expect(fake.ultima("pedidos", "update")).toBeUndefined();
  });
});

describe("actualizarPedido", () => {
  const itemBase = {
    producto_id: "SC014",
    nombre: "Bermuda",
    tipo_servicio: "lavado" as const,
    unidad_cobro: "unidad" as const,
    ancho: null,
    largo: null,
    precio_unidad: 2500,
    cantidad: 2,
    detalle: null,
  };

  const entrada = {
    fecha_entrega: "2026-10-25",
    notas: "Sin suavizante",
    items: [itemBase],
  };

  function montarOk(extra: Record<string, RespuestaFake> = {}) {
    return montar({
      "pedidos.select": { data: { estado: "recibido" } },
      "pedidos.update": { data: null },
      "pedidos_items.delete": { data: null },
      "pedidos_items.insert": { data: null },
      ...extra,
    });
  }

  it("reemplaza los items y calcula el importe de cada linea", async () => {
    const fake = montarOk();
    const res = await actualizarPedido(13544, entrada);

    expect(res).toEqual({ ok: true });
    // Primero borra, despues inserta: las lineas no tienen clave natural.
    expect(fake.ultima("pedidos_items", "delete")).toBeDefined();
    const filas = fake.ultima("pedidos_items", "insert")?.payload as Record<
      string,
      unknown
    >[];
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      pedido_id: 13544,
      producto_nombre: "Bermuda",
      cantidad: 2,
      importe: 5000,
    });
  });

  it("no escribe total_venta: lo recalcula el trigger de la base", async () => {
    const fake = montarOk();
    await actualizarPedido(13544, entrada);

    const payload = fake.ultima("pedidos", "update")?.payload as Record<
      string,
      unknown
    >;
    expect(payload).toEqual({
      fecha_entrega: "2026-10-25",
      notas: "Sin suavizante",
    });
  });

  it("calcula por metro cuadrado cuando corresponde", async () => {
    const fake = montarOk();
    await actualizarPedido(13544, {
      ...entrada,
      items: [
        {
          ...itemBase,
          nombre: "Alfombra",
          unidad_cobro: "m2",
          precio_unidad: 10000,
          cantidad: 1,
          ancho: 1.4,
          largo: 2.1,
        },
      ],
    });

    const filas = fake.ultima("pedidos_items", "insert")?.payload as Record<
      string,
      unknown
    >[];
    // 1,40 x 2,10 = 2,94 m2, que se cobran como 3 m2: la medida se redondea
    // hacia arriba al medio metro (redondearMedida). 3 x $10.000.
    expect(filas[0].importe).toBe(30000);
  });

  it("se niega si falta la medida, antes de borrar nada", async () => {
    const fake = montarOk();
    const res = await actualizarPedido(13544, {
      ...entrada,
      items: [{ ...itemBase, nombre: "Alfombra", unidad_cobro: "m2", ancho: null }],
    });

    expect(res.ok).toBe(false);
    expect((res as { error: string }).error).toMatch(/medida/i);
    // Lo importante: no alcanzo a borrar las lineas que ya estaban.
    expect(fake.ultima("pedidos_items", "delete")).toBeUndefined();
  });

  it("no deja editar un pedido anulado", async () => {
    const fake = montarOk({ "pedidos.select": { data: { estado: "anulado" } } });
    const res = await actualizarPedido(13544, entrada);

    expect(res.ok).toBe(false);
    expect((res as { error: string }).error).toMatch(/anulado/i);
    expect(fake.ultima("pedidos_items", "delete")).toBeUndefined();
  });

  it("avisa si el pedido no existe", async () => {
    montarOk({ "pedidos.select": { data: null } });
    const res = await actualizarPedido(99999, entrada);

    expect(res).toEqual({ ok: false, error: "El pedido no existe." });
  });

  it("exige al menos un item", async () => {
    const fake = montarOk();
    const res = await actualizarPedido(13544, { ...entrada, items: [] });

    expect(res.ok).toBe(false);
    expect(fake.llamadas).toHaveLength(0);
  });
});
