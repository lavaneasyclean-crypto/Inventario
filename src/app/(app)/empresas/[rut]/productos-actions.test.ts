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
  asignarProducto,
  crearYAsignarProducto,
  desasignarProducto,
} from "./productos-actions";

const logSilenciado = vi
  .spyOn(console, "error")
  .mockImplementation(() => undefined);
afterAll(() => logSilenciado.mockRestore());

function montar(respuestas: Record<string, RespuestaFake> = {}): SupabaseFake {
  const fake = crearSupabaseFake(respuestas);
  estado.supabase = fake;
  return fake;
}

const RUT = "76123456-7";

describe("asignarProducto — un producto ya existente del catalogo", () => {
  it("asocia el producto a la empresa con su precio", async () => {
    const fake = montar();
    const res = await asignarProducto({
      rut_empresa: RUT,
      producto_empresa_id: "007",
      precio: 4500,
    });

    expect(res).toEqual({ ok: true });
    const upsert = fake.ultima("empresa_productos", "upsert");
    expect(upsert?.payload).toEqual({
      rut_empresa: RUT,
      producto_empresa_id: "007",
      precio: 4500,
    });
  });

  it("reasignar el mismo producto actualiza el precio en vez de duplicar", async () => {
    const fake = montar();
    await asignarProducto({
      rut_empresa: RUT,
      producto_empresa_id: "007",
      precio: 5000,
    });

    expect(fake.ultima("empresa_productos", "upsert")?.opciones).toEqual({
      onConflict: "rut_empresa,producto_empresa_id",
    });
  });

  it("acepta precio nulo: el producto queda sin tarifa acordada", async () => {
    const fake = montar();
    const res = await asignarProducto({
      rut_empresa: RUT,
      producto_empresa_id: "007",
      precio: null,
    });

    expect(res).toEqual({ ok: true });
    const payload = fake.ultima("empresa_productos", "upsert")?.payload as Record<
      string,
      unknown
    >;
    expect(payload.precio).toBeNull();
  });

  it("no filtra el error crudo si el producto no existe", async () => {
    montar({
      "empresa_productos.upsert": {
        error: {
          code: "23503",
          message:
            'insert or update on table "empresa_productos" violates foreign key constraint',
        },
      },
    });
    const res = await asignarProducto({
      rut_empresa: RUT,
      producto_empresa_id: "999",
      precio: 100,
    });

    const error = (res as { error: string }).error;
    expect(error).toBe("El registro relacionado no existe o fue eliminado.");
    expect(error).not.toMatch(/constraint|foreign key/i);
  });
});

describe("crearYAsignarProducto — producto nuevo del catalogo", () => {
  it("crea el producto y lo asigna a la empresa", async () => {
    const fake = montar({
      "productos_empresa.select": { data: [{ id: "001" }, { id: "007" }] },
    });
    const res = await crearYAsignarProducto({
      rut_empresa: RUT,
      nombre: "Mantel rectangular",
      precio: 2500,
    });

    expect(res).toEqual({ ok: true, id: "008" });
    expect(fake.ultima("productos_empresa", "insert")?.payload).toEqual({
      id: "008",
      nombre: "Mantel rectangular",
      activo: true,
    });
    expect(fake.ultima("empresa_productos", "insert")?.payload).toEqual({
      rut_empresa: RUT,
      producto_empresa_id: "008",
      precio: 2500,
    });
  });

  it("numera con tres digitos arrancando del 001", async () => {
    montar({ "productos_empresa.select": { data: [] } });
    const res = await crearYAsignarProducto({
      rut_empresa: RUT,
      nombre: "Sabana C/E",
      precio: null,
    });

    expect(res).toMatchObject({ ok: true, id: "001" });
  });

  it("ignora los ids que no son numericos al buscar el siguiente", async () => {
    montar({
      "productos_empresa.select": {
        data: [{ id: "012" }, { id: "EMP1700000000000" }, { id: "003" }],
      },
    });
    const res = await crearYAsignarProducto({
      rut_empresa: RUT,
      nombre: "Toalla",
      precio: 900,
    });

    expect(res).toMatchObject({ id: "013" });
  });

  it("pasado el 999 cambia a un id con timestamp", async () => {
    montar({ "productos_empresa.select": { data: [{ id: "999" }] } });
    const res = await crearYAsignarProducto({
      rut_empresa: RUT,
      nombre: "Cubrecama",
      precio: 3000,
    });

    expect((res as { id: string }).id).toMatch(/^EMP\d+$/);
  });

  it("exige nombre", async () => {
    const fake = montar({ "productos_empresa.select": { data: [] } });
    const res = await crearYAsignarProducto({
      rut_empresa: RUT,
      nombre: "",
      precio: 100,
    });

    expect(res).toEqual({ ok: false, error: "Nombre requerido" });
    expect(fake.ultima("productos_empresa", "insert")).toBeUndefined();
  });

  it("si la asignacion falla borra el producto que acababa de crear", async () => {
    const fake = montar({
      "productos_empresa.select": { data: [{ id: "004" }] },
      "empresa_productos.insert": {
        error: { code: "23503", message: "foreign key violation" },
      },
    });
    const res = await crearYAsignarProducto({
      rut_empresa: "no-existe",
      nombre: "Servilleta",
      precio: 300,
    });

    expect(res.ok).toBe(false);
    const borrado = fake.ultima("productos_empresa", "delete");
    expect(borrado?.filtros).toContainEqual({ metodo: "eq", args: ["id", "005"] });
  });

  it("si falla la creacion del producto no intenta asignarlo", async () => {
    const fake = montar({
      "productos_empresa.select": { data: [] },
      "productos_empresa.insert": {
        error: { code: "23505", message: "duplicate key" },
      },
    });
    const res = await crearYAsignarProducto({
      rut_empresa: RUT,
      nombre: "Repetido",
      precio: 100,
    });

    expect(res.ok).toBe(false);
    expect(fake.ultima("empresa_productos", "insert")).toBeUndefined();
  });
});

describe("desasignarProducto", () => {
  it("borra solo el vinculo con esa empresa", async () => {
    const fake = montar();
    const res = await desasignarProducto({
      rut_empresa: RUT,
      producto_empresa_id: "007",
    });

    expect(res).toEqual({ ok: true });
    const borrado = fake.ultima("empresa_productos", "delete");
    expect(borrado?.filtros).toEqual([
      { metodo: "eq", args: ["rut_empresa", RUT] },
      { metodo: "eq", args: ["producto_empresa_id", "007"] },
    ]);
    // El producto global no se toca: lo pueden estar usando otras empresas.
    expect(fake.ultima("productos_empresa", "delete")).toBeUndefined();
  });

  it("no filtra el error crudo", async () => {
    montar({
      "empresa_productos.delete": {
        error: { code: "42501", message: 'permission denied for table "..."' },
      },
    });
    const res = await desasignarProducto({
      rut_empresa: RUT,
      producto_empresa_id: "007",
    });

    expect((res as { error: string }).error).toBe(
      "Tu usuario no tiene permiso para hacer esto.",
    );
  });
});
