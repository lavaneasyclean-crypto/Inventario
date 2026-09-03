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

import { crearPedidoEmpresa } from "./actions";

const logSilenciado = vi
  .spyOn(console, "error")
  .mockImplementation(() => undefined);
afterAll(() => logSilenciado.mockRestore());

function montar(respuestas: Record<string, RespuestaFake> = {}): SupabaseFake {
  const fake = crearSupabaseFake(respuestas);
  estado.supabase = fake;
  return fake;
}

function pedidoBase() {
  return {
    rut_empresa: "76123456-7",
    alias: "Los Andes",
    fecha: "2026-09-03T16:00:00.000Z",
    detalle: null,
    items: [
      {
        producto_empresa_id: "007",
        nombre: "Mantel rectangular",
        precio_unidad: 2500,
        cantidad: 12,
        detalle: null,
      },
    ],
  };
}

describe("crearPedidoEmpresa", () => {
  it("crea el pedido con una sola llamada atomica", async () => {
    const fake = montar({ "rpc.crear_pedido_empresa": { data: 88 } });
    const res = await crearPedidoEmpresa(pedidoBase());

    expect(res).toEqual({ ok: true, id: 88 });
    expect(fake.rpcs).toHaveLength(1);
    expect(fake.rpcs[0].funcion).toBe("crear_pedido_empresa");
    expect(fake.llamadas).toHaveLength(0);
  });

  it("no manda un id: lo asigna la secuencia", async () => {
    const fake = montar({ "rpc.crear_pedido_empresa": { data: 1 } });
    await crearPedidoEmpresa(pedidoBase());

    const { p_pedido } = fake.rpcs[0].args as {
      p_pedido: Record<string, unknown>;
    };
    expect(p_pedido).not.toHaveProperty("id");
    expect(p_pedido).toMatchObject({
      rut_empresa: "76123456-7",
      alias: "Los Andes",
      fecha: "2026-09-03T16:00:00.000Z",
    });
  });

  it("los items no llevan importe: lo calcula la funcion SQL", async () => {
    const fake = montar({ "rpc.crear_pedido_empresa": { data: 1 } });
    await crearPedidoEmpresa(pedidoBase());

    const { p_items } = fake.rpcs[0].args as {
      p_items: Record<string, unknown>[];
    };
    expect(p_items[0]).toEqual({
      producto_empresa_id: "007",
      producto_empresa_nombre: "Mantel rectangular",
      precio_unidad: 2500,
      cantidad: 12,
      detalle_prenda: null,
    });
  });

  it("deja pasar un producto sin precio acordado", async () => {
    const fake = montar({ "rpc.crear_pedido_empresa": { data: 1 } });
    const base = pedidoBase();
    const res = await crearPedidoEmpresa({
      ...base,
      items: [{ ...base.items[0], precio_unidad: null }],
    });

    expect(res.ok).toBe(true);
    const { p_items } = fake.rpcs[0].args as {
      p_items: Record<string, unknown>[];
    };
    expect(p_items[0].precio_unidad).toBeNull();
  });

  it("exige empresa, fecha y al menos un item", async () => {
    montar();
    expect(await crearPedidoEmpresa({ ...pedidoBase(), items: [] })).toEqual({
      ok: false,
      error: "Agregá al menos un item",
    });
    expect(
      await crearPedidoEmpresa({ ...pedidoBase(), rut_empresa: "" }),
    ).toEqual({ ok: false, error: "Empresa requerida" });
    expect(await crearPedidoEmpresa({ ...pedidoBase(), fecha: "" })).toEqual({
      ok: false,
      error: "Fecha requerida",
    });
  });

  it("no filtra el error crudo de la base", async () => {
    montar({
      "rpc.crear_pedido_empresa": {
        error: {
          code: "PGRST202",
          message: "Could not find the function public.crear_pedido_empresa",
        },
      },
    });
    const res = await crearPedidoEmpresa(pedidoBase());

    const error = (res as { error: string }).error;
    expect(error).toMatch(/migración/i);
    expect(error).not.toMatch(/public\.|function/i);
  });
});
