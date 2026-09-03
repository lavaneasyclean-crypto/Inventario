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
  it("marcarPagado guarda forma de pago, monto y fecha", async () => {
    const fake = montar();
    const res = await marcarPagado(
      form({ id: "42", forma_pago: "transferencia", total: "10600" }),
    );

    expect(res).toEqual({ ok: true });
    const payload = payloadDe(fake);
    expect(payload.pagado).toBe(true);
    expect(payload.forma_pago).toBe("transferencia");
    expect(payload.monto_abonado).toBe(10600);
    expect(typeof payload.fecha_pago).toBe("string");
  });

  it("marcarPagado rechaza una forma de pago inventada", async () => {
    const fake = montar();
    const res = await marcarPagado(
      form({ id: "42", forma_pago: "bitcoin", total: "1000" }),
    );

    expect(res).toEqual({ ok: false, error: "La forma de pago no es válida." });
    expect(fake.ultima("pedidos", "update")).toBeUndefined();
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

  it("marcarSinPagar deja el pedido sin cobrar", async () => {
    const fake = montar();
    await marcarSinPagar(form({ id: "42" }));

    expect(payloadDe(fake)).toEqual({
      pagado: false,
      forma_pago: "no_pago",
      monto_abonado: 0,
      fecha_pago: null,
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
