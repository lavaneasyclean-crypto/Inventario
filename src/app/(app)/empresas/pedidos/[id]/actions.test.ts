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
vi.mock("@/lib/data/registrar-cambio-items", () => ({
  registrarCambioDeItems: vi.fn(),
}));

import { actualizarPedidoEmpresa } from "./actions";

const logSilenciado = vi
  .spyOn(console, "error")
  .mockImplementation(() => undefined);
afterAll(() => logSilenciado.mockRestore());

function montar(respuestas: Record<string, RespuestaFake> = {}): SupabaseFake {
  const fake = crearSupabaseFake(respuestas);
  estado.supabase = fake;
  return fake;
}

const VERSION = "2026-10-19T15:00:00+00:00";

const entrada = {
  version: VERSION,
  fecha: "2026-10-19T15:00:00+00:00",
  detalle: null,
  express: false,
  items: [
    {
      producto_empresa_id: "019",
      nombre: "Mantel Ovalado",
      precio_unidad: 1800,
      cantidad: 3,
      detalle: null,
    },
  ],
};

/** Como responde la base cuando la version coincide: una fila tocada. */
function versionCoincide() {
  return montar({
    "pedidos_empresa.update": { data: [{ id: 1670 }] },
    "pedidos_empresa_items.delete": { data: null },
    "pedidos_empresa_items.insert": { data: null },
  });
}

describe("actualizarPedidoEmpresa — dos personas en la misma guía", () => {
  it("guarda cuando nadie toco la guia mientras tanto", async () => {
    const fake = versionCoincide();
    const res = await actualizarPedidoEmpresa(1670, entrada);

    expect(res).toEqual({ ok: true });
    expect(fake.ultima("pedidos_empresa_items", "insert")).toBeDefined();
  });

  it("manda la version en el update, para que la base decida", async () => {
    const fake = versionCoincide();
    await actualizarPedidoEmpresa(1670, entrada);

    const filtros = fake.ultima("pedidos_empresa", "update")?.filtros ?? [];
    expect(filtros).toContainEqual({ metodo: "eq", args: ["id", 1670] });
    expect(filtros).toContainEqual({
      metodo: "eq",
      args: ["updated_at", VERSION],
    });
  });

  it("si otro guardo primero, avisa y NO borra las lineas", async () => {
    // La base no toca ninguna fila porque updated_at ya no coincide.
    const fake = montar({ "pedidos_empresa.update": { data: [] } });
    const res = await actualizarPedidoEmpresa(1670, entrada);

    expect(res.ok).toBe(false);
    expect((res as { error: string }).error).toMatch(/alguien más guardó/i);

    // Lo que de verdad importa: el conteo de la otra persona sigue ahi. Si se
    // borrara antes de chequear, el choque dejaria la guia vacia.
    expect(fake.ultima("pedidos_empresa_items", "delete")).toBeUndefined();
    expect(fake.ultima("pedidos_empresa_items", "insert")).toBeUndefined();
  });

  it("exige la version: sin ella no se guarda nada", async () => {
    const fake = montar();
    const res = await actualizarPedidoEmpresa(1670, {
      ...entrada,
      version: "",
    });

    expect(res.ok).toBe(false);
    expect(fake.llamadas).toHaveLength(0);
  });

  it("exige al menos un item", async () => {
    const fake = montar();
    const res = await actualizarPedidoEmpresa(1670, { ...entrada, items: [] });

    expect(res.ok).toBe(false);
    expect(fake.llamadas).toHaveLength(0);
  });
});

describe("actualizarPedidoEmpresa — una bolsa que ya no existe", () => {
  it("corta ANTES de borrar las lineas", async () => {
    // Estaba al reves: borraba y despues validaba, asi que una bolsa dada de
    // baja dejaba la guia vacia y el mensaje de error no decia nada de eso.
    const fake = crearSupabaseFake({
      "pedidos_empresa.update": { data: [{ id: 1670 }] },
      // El padron devuelve menos bolsas de las que se pidieron.
      "empresa_bolsas.select": { data: [] },
    });
    estado.supabase = fake;

    const res = await actualizarPedidoEmpresa(1670, {
      ...entrada,
      items: [{ ...entrada.items[0], bolsa_id: 21 }],
    });

    expect(res.ok).toBe(false);
    expect((res as { error: string }).error).toMatch(/bolsas ya no existe/i);

    // Lo que importa: el conteo sigue ahi.
    expect(fake.ultima("pedidos_empresa_items", "delete")).toBeUndefined();
    expect(fake.ultima("pedidos_empresa_items", "insert")).toBeUndefined();
  });
});
