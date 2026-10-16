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
  actualizarProveedor,
  crearProveedor,
  eliminarProveedor,
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

const OK = { "proveedores.insert": { data: { id: 7 } } };

describe("crearProveedor", () => {
  it("crea con lo mínimo: solo el nombre", async () => {
    const fake = montar(OK);
    const res = await crearProveedor({ nombre: "Mercado Libre" });

    expect(res).toEqual({ ok: true, id: 7 });
    const payload = fake.ultima("proveedores", "insert")?.payload as Record<
      string,
      unknown
    >;
    expect(payload.nombre).toBe("Mercado Libre");
    expect(payload.rut).toBeNull();
    expect(payload.activo).toBe(true);
  });

  it("guarda el RUT normalizado, no como lo escribieron", async () => {
    const fake = montar(OK);
    await crearProveedor({ nombre: "Juan Pérez", rut: "12.345.678-k" });

    const payload = fake.ultima("proveedores", "insert")?.payload as Record<
      string,
      unknown
    >;
    // Sin puntos y con K mayúscula: así el índice único puede comparar.
    expect(payload.rut).toBe("12345678-K");
  });

  it("normaliza también el RUT del titular de la cuenta", async () => {
    const fake = montar(OK);
    await crearProveedor({
      nombre: "Insumos del Sur",
      rut_titular: "9876543-2",
    });

    const payload = fake.ultima("proveedores", "insert")?.payload as Record<
      string,
      unknown
    >;
    expect(payload.rut_titular).toBe("9876543-2");
  });

  it("rechaza algo que no parece un RUT, sin tocar la base", async () => {
    const fake = montar(OK);
    const res = await crearProveedor({ nombre: "Alguien", rut: "no-es-rut" });

    expect(res.ok).toBe(false);
    expect((res as { error: string }).error).toMatch(/no parece un RUT/i);
    expect(fake.llamadas).toHaveLength(0);
  });

  it("exige nombre y no llega a tocar la base", async () => {
    const fake = montar(OK);
    const res = await crearProveedor({ nombre: "" });

    expect(res).toEqual({ ok: false, error: "El proveedor necesita un nombre" });
    expect(fake.llamadas).toHaveLength(0);
  });

  it("avisa cuando el nombre ya existe", async () => {
    montar({
      "proveedores.insert": {
        error: {
          code: "23505",
          message:
            'duplicate key value violates unique constraint "proveedores_nombre_uniq"',
        },
      },
    });
    const res = await crearProveedor({ nombre: "Mercado Libre" });

    expect((res as { error: string }).error).toMatch(/ya existe un proveedor con ese nombre/i);
  });

  it("cuando el repetido es el RUT, lo dice por el RUT y no por el nombre", async () => {
    montar({
      "proveedores.insert": {
        error: {
          code: "23505",
          message:
            'duplicate key value violates unique constraint "proveedores_rut_uniq"',
        },
      },
    });
    const res = await crearProveedor({
      nombre: "Juan P.",
      rut: "12345678-9",
    });

    const error = (res as { error: string }).error;
    // Mandar a corregir el campo equivocado hace perder el tiempo buscando
    // un nombre repetido que no existe.
    expect(error).toMatch(/con ese RUT/i);
    expect(error).not.toMatch(/con ese nombre/i);
  });
});

describe("actualizarProveedor", () => {
  it("guarda los datos de transferencia", async () => {
    const fake = montar({ "proveedores.update": { data: null } });
    const res = await actualizarProveedor(7, {
      nombre: "Juan Pérez",
      banco: "Banco Estado",
      tipo_cuenta: "cuenta_rut",
      numero_cuenta: "12345678",
    });

    expect(res).toEqual({ ok: true, id: 7 });
    const payload = fake.ultima("proveedores", "update")?.payload as Record<
      string,
      unknown
    >;
    expect(payload.banco).toBe("Banco Estado");
    expect(payload.tipo_cuenta).toBe("cuenta_rut");
  });

  it("deja el tipo de cuenta en null cuando no se eligió", async () => {
    const fake = montar({ "proveedores.update": { data: null } });
    await actualizarProveedor(7, { nombre: "Sin cuenta" });

    const payload = fake.ultima("proveedores", "update")?.payload as Record<
      string,
      unknown
    >;
    expect(payload.tipo_cuenta).toBeNull();
  });
});

describe("eliminarProveedor", () => {
  it("borra el que no tiene gastos", async () => {
    const fake = montar({ "proveedores.delete": { data: null } });
    const res = await eliminarProveedor(7);

    expect(res).toEqual({ ok: true, id: 7 });
    expect(fake.ultima("proveedores", "delete")).toBeDefined();
  });

  it("si tiene gastos, explica que se desactiva en vez de borrarse", async () => {
    montar({
      "proveedores.delete": {
        error: {
          code: "23503",
          message:
            'violates foreign key constraint "gastos_proveedor_id_fkey"',
        },
      },
    });
    const res = await eliminarProveedor(7);

    expect(res.ok).toBe(false);
    const error = (res as { error: string }).error;
    expect(error).toMatch(/desactivalo/i);
    // Nunca el error crudo del motor.
    expect(error).not.toMatch(/constraint|foreign key/i);
  });
});
