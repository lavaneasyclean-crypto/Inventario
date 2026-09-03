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
  it("crea el producto y lo asigna con una sola llamada atomica", async () => {
    const fake = montar({ "rpc.crear_producto_empresa": { data: "008" } });
    const res = await crearYAsignarProducto({
      rut_empresa: RUT,
      nombre: "Mantel rectangular",
      precio: 2500,
    });

    expect(res).toEqual({ ok: true, id: "008" });
    expect(fake.rpcs).toHaveLength(1);
    expect(fake.rpcs[0]).toEqual({
      funcion: "crear_producto_empresa",
      args: {
        p_rut_empresa: RUT,
        p_nombre: "Mantel rectangular",
        p_precio: 2500,
      },
    });
    // Ya no se trae el catalogo entero para numerar, ni se inserta por partes.
    expect(fake.llamadas).toHaveLength(0);
  });

  it("no numera desde la app: el id lo devuelve la base", async () => {
    const fake = montar({ "rpc.crear_producto_empresa": { data: "EMP1042" } });
    const res = await crearYAsignarProducto({
      rut_empresa: RUT,
      nombre: "Cubrecama",
      precio: null,
    });

    expect(res).toMatchObject({ id: "EMP1042" });
    expect(fake.ultima("productos_empresa", "select")).toBeUndefined();
  });

  it("deja pasar un producto sin precio acordado", async () => {
    const fake = montar({ "rpc.crear_producto_empresa": { data: "009" } });
    const res = await crearYAsignarProducto({
      rut_empresa: RUT,
      nombre: "Sabana C/E",
      precio: null,
    });

    expect(res.ok).toBe(true);
    expect(fake.rpcs[0].args.p_precio).toBeNull();
  });

  it("avisa cuando el nombre ya esta en el catalogo", async () => {
    montar({
      "rpc.crear_producto_empresa": {
        error: {
          code: "23505",
          message: 'Ya existe el producto "Sabana C/E" con id 004',
        },
      },
    });
    const res = await crearYAsignarProducto({
      rut_empresa: RUT,
      nombre: "sabana c/e",
      precio: 1000,
    });

    expect(res.ok).toBe(false);
    const error = (res as { error: string }).error;
    expect(error).toMatch(/ya existe un producto con ese nombre/i);
    // Manda a buscarlo en vez de dejar el catalogo con dos iguales.
    expect(error).toMatch(/catálogo/i);
  });

  it("exige nombre y no llega a tocar la base", async () => {
    const fake = montar();
    const res = await crearYAsignarProducto({
      rut_empresa: RUT,
      nombre: "",
      precio: 100,
    });

    expect(res).toEqual({ ok: false, error: "Nombre requerido" });
    expect(fake.rpcs).toHaveLength(0);
  });

  it("no filtra el error crudo cuando falla por otra cosa", async () => {
    montar({
      "rpc.crear_producto_empresa": {
        error: {
          code: "23503",
          message:
            'violates foreign key constraint "empresa_productos_rut_empresa_fkey"',
        },
      },
    });
    const res = await crearYAsignarProducto({
      rut_empresa: "no-existe",
      nombre: "Servilleta",
      precio: 300,
    });

    const error = (res as { error: string }).error;
    expect(error).toBe("El registro relacionado no existe o fue eliminado.");
    expect(error).not.toMatch(/constraint|fkey/i);
  });

  it("avisa si falta aplicar la migracion", async () => {
    montar({
      "rpc.crear_producto_empresa": {
        error: {
          code: "PGRST202",
          message: "Could not find the function public.crear_producto_empresa",
        },
      },
    });
    const res = await crearYAsignarProducto({
      rut_empresa: RUT,
      nombre: "Toalla",
      precio: 900,
    });

    expect((res as { error: string }).error).toMatch(/migración/i);
  });

  it("no da por creado el producto si no vuelve un id", async () => {
    montar({ "rpc.crear_producto_empresa": { data: null } });
    const res = await crearYAsignarProducto({
      rut_empresa: RUT,
      nombre: "Toalla",
      precio: 900,
    });

    expect(res.ok).toBe(false);
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
