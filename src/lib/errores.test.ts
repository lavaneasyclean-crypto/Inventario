import { describe, it, expect, vi, afterAll } from "vitest";
import {
  MENSAJE_GENERICO,
  MENSAJE_SIN_CONEXION,
  fallo,
  mensajeUsuario,
} from "./errores";

describe("mensajeUsuario", () => {
  it("explica los codigos de Postgres que tienen arreglo conocido", () => {
    expect(mensajeUsuario({ code: "23505", message: "duplicate key" })).toBe(
      "Ya existe un registro con esos datos.",
    );
    expect(mensajeUsuario({ code: "23503", message: "fk violation" })).toBe(
      "El registro relacionado no existe o fue eliminado.",
    );
    expect(mensajeUsuario({ code: "42501", message: "permission denied" })).toBe(
      "Tu usuario no tiene permiso para hacer esto.",
    );
  });

  it("avisa cuando falta una migracion", () => {
    expect(
      mensajeUsuario({
        code: "PGRST202",
        message: "Could not find the function public.crear_pedido",
      }),
    ).toMatch(/migración/i);
  });

  it("reconoce los fallos de red por el texto, que vienen sin codigo", () => {
    expect(mensajeUsuario(new TypeError("fetch failed"))).toBe(
      MENSAJE_SIN_CONEXION,
    );
    expect(mensajeUsuario({ message: "getaddrinfo ENOTFOUND db.supabase.co" })).toBe(
      MENSAJE_SIN_CONEXION,
    );
  });

  it("cae al generico con cualquier otra cosa", () => {
    expect(mensajeUsuario({ code: "XX999", message: "boom" })).toBe(
      MENSAJE_GENERICO,
    );
    expect(mensajeUsuario(new Error("algo raro"))).toBe(MENSAJE_GENERICO);
    expect(mensajeUsuario(null)).toBe(MENSAJE_GENERICO);
    expect(mensajeUsuario(undefined)).toBe(MENSAJE_GENERICO);
    expect(mensajeUsuario("string suelto")).toBe(MENSAJE_GENERICO);
  });

  it("nunca devuelve el texto crudo del motor", () => {
    const crudo =
      'duplicate key value violates unique constraint "pedidos_pkey"';
    const salida = mensajeUsuario({ code: "23505", message: crudo });

    expect(salida).not.toContain(crudo);
    expect(salida).not.toMatch(/constraint|pkey|violates/i);
  });
});

describe("fallo", () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  afterAll(() => log.mockRestore());

  it("devuelve el resultado que espera la UI", () => {
    log.mockClear();
    const res = fallo("crearPedido", "insert-items", {
      code: "23505",
      message: "duplicate key",
    });

    expect(res).toEqual({
      ok: false,
      error: "Ya existe un registro con esos datos.",
    });
  });

  it("deja el paso y el detalle completo en el log del servidor", () => {
    log.mockClear();
    const error = { code: "23505", message: "duplicate key" };
    fallo("crearPedido", "insert-items", error);

    expect(log).toHaveBeenCalledTimes(1);
    const [etiqueta, detalle] = log.mock.calls[0];
    expect(etiqueta).toBe("[crearPedido] paso=insert-items");
    expect(detalle).toBe(error);
  });
});
