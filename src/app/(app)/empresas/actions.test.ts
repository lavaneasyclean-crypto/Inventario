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

import { crearEmpresa, actualizarEmpresa } from "./actions";

const logSilenciado = vi
  .spyOn(console, "error")
  .mockImplementation(() => undefined);
afterAll(() => logSilenciado.mockRestore());

function montar(respuestas: Record<string, RespuestaFake> = {}): SupabaseFake {
  const fake = crearSupabaseFake(respuestas);
  estado.supabase = fake;
  return fake;
}

const empresaBase = {
  rut: "76123456-7",
  nombre: "Hotel Los Andes SpA",
  alias: "Los Andes",
  comuna: "Providencia",
  calle: "Av. Pedro de Valdivia 100",
  contacto_1: "223334444",
  contacto_2: null,
  correo: "contacto@losandes.cl",
  activo: true,
};

describe("crearEmpresa", () => {
  it("crea la empresa cuando el RUT esta libre", async () => {
    const fake = montar({ "clientes_empresa.select": { data: null } });
    const res = await crearEmpresa(empresaBase);

    expect(res).toEqual({ ok: true, rut: "76123456-7" });
    expect(fake.ultima("clientes_empresa", "insert")?.payload).toMatchObject({
      rut: "76123456-7",
      nombre: "Hotel Los Andes SpA",
      alias: "Los Andes",
      activo: true,
    });
  });

  it("normaliza puntos y pasa el DV a mayuscula", async () => {
    const fake = montar({ "clientes_empresa.select": { data: null } });
    const res = await crearEmpresa({ ...empresaBase, rut: "76.123.456-k" });

    expect(res).toEqual({ ok: true, rut: "76123456-K" });
    const payload = fake.ultima("clientes_empresa", "insert")?.payload as Record<
      string,
      unknown
    >;
    expect(payload.rut).toBe("76123456-K");
  });

  it("no permite duplicar un RUT ya cargado", async () => {
    const fake = montar({
      "clientes_empresa.select": { data: { rut: "76123456-7" } },
    });
    const res = await crearEmpresa(empresaBase);

    expect(res).toEqual({
      ok: false,
      error: "Ya existe una empresa con RUT 76123456-7",
    });
    expect(fake.ultima("clientes_empresa", "insert")).toBeUndefined();
  });

  it("guarda los opcionales vacios como null", async () => {
    const fake = montar({ "clientes_empresa.select": { data: null } });
    await crearEmpresa({
      ...empresaBase,
      alias: "",
      comuna: "",
      contacto_2: "",
      correo: "",
    });

    const payload = fake.ultima("clientes_empresa", "insert")?.payload as Record<
      string,
      unknown
    >;
    expect(payload.alias).toBeNull();
    expect(payload.comuna).toBeNull();
    expect(payload.contacto_2).toBeNull();
    expect(payload.correo).toBeNull();
  });

  it("exige nombre", async () => {
    montar({ "clientes_empresa.select": { data: null } });
    const res = await crearEmpresa({ ...empresaBase, nombre: "" });

    expect(res).toEqual({ ok: false, error: "Nombre requerido" });
  });

  it("rechaza un correo mal formado", async () => {
    montar({ "clientes_empresa.select": { data: null } });
    const res = await crearEmpresa({ ...empresaBase, correo: "contacto@" });

    expect(res).toEqual({ ok: false, error: "Correo inválido" });
  });

  it("rechaza un RUT que no se puede normalizar", async () => {
    montar();
    const res = await crearEmpresa({ ...empresaBase, rut: "no-es-un-rut" });

    expect(res).toEqual({ ok: false, error: "RUT con formato inválido" });
  });

  it("no filtra el error crudo de Postgres", async () => {
    montar({
      "clientes_empresa.select": { data: null },
      "clientes_empresa.insert": {
        error: {
          code: "23505",
          message:
            'duplicate key value violates unique constraint "clientes_empresa_pkey"',
        },
      },
    });
    const res = await crearEmpresa(empresaBase);

    const error = (res as { error: string }).error;
    expect(error).toBe("Ya existe un registro con esos datos.");
    expect(error).not.toMatch(/constraint|pkey/i);
  });
});

describe("actualizarEmpresa", () => {
  // updateSchema no lleva rut: el RUT va aparte, como identificador.
  const sinRut = {
    nombre: empresaBase.nombre,
    alias: empresaBase.alias,
    comuna: empresaBase.comuna,
    calle: empresaBase.calle,
    contacto_1: empresaBase.contacto_1,
    contacto_2: empresaBase.contacto_2,
    correo: empresaBase.correo,
    activo: empresaBase.activo,
  };

  it("actualiza filtrando por el RUT y sin tocarlo", async () => {
    const fake = montar();
    const res = await actualizarEmpresa("76123456-7", {
      ...sinRut,
      nombre: "Hotel Los Andes Limitada",
    });

    expect(res.ok).toBe(true);
    const update = fake.ultima("clientes_empresa", "update");
    expect(update?.filtros).toContainEqual({
      metodo: "eq",
      args: ["rut", "76123456-7"],
    });
    expect(update?.payload).toMatchObject({ nombre: "Hotel Los Andes Limitada" });
    expect(update?.payload).not.toHaveProperty("rut");
  });

  it("permite desactivar una empresa sin borrarla", async () => {
    const fake = montar();
    await actualizarEmpresa("76123456-7", { ...sinRut, activo: false });

    const payload = fake.ultima("clientes_empresa", "update")?.payload as Record<
      string,
      unknown
    >;
    expect(payload.activo).toBe(false);
  });
});
