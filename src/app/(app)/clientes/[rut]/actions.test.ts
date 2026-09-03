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

import { actualizarCliente } from "./actions";

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

const completo = {
  rut: "12345678-9",
  nombre: "Ana Pérez",
  comuna: "Ñuñoa",
  calle: "Irarrázaval 123",
  dpto: "402",
  telefono: "912345678",
  correo: "ana@example.cl",
};

describe("actualizarCliente", () => {
  it("guarda los datos filtrando por el RUT", async () => {
    const fake = montar();
    const res = await actualizarCliente(form(completo));

    expect(res).toEqual({ ok: true });
    const update = fake.ultima("clientes", "update");
    expect(update?.payload).toEqual({
      nombre: "Ana Pérez",
      comuna: "Ñuñoa",
      calle: "Irarrázaval 123",
      dpto: "402",
      telefono: "912345678",
      correo: "ana@example.cl",
    });
    expect(update?.filtros).toContainEqual({
      metodo: "eq",
      args: ["rut", "12345678-9"],
    });
  });

  it("nunca toca el RUT: es la identidad del cliente", async () => {
    const fake = montar();
    await actualizarCliente(form(completo));

    expect(fake.ultima("clientes", "update")?.payload).not.toHaveProperty("rut");
  });

  it("recorta espacios y guarda los campos vacios como null", async () => {
    const fake = montar();
    await actualizarCliente(
      form({ ...completo, nombre: "  Ana Pérez  ", dpto: "  ", telefono: "" }),
    );

    const payload = fake.ultima("clientes", "update")?.payload as Record<
      string,
      unknown
    >;
    expect(payload.nombre).toBe("Ana Pérez");
    expect(payload.dpto).toBeNull();
    expect(payload.telefono).toBeNull();
  });

  it("no deja borrar el nombre", async () => {
    const fake = montar();
    const res = await actualizarCliente(form({ ...completo, nombre: "   " }));

    expect(res).toEqual({
      ok: false,
      error: "El nombre no puede quedar vacío.",
    });
    expect(fake.ultima("clientes", "update")).toBeUndefined();
  });

  it("valida el correo", async () => {
    const fake = montar();
    const res = await actualizarCliente(form({ ...completo, correo: "ana@" }));

    expect(res).toEqual({
      ok: false,
      error: "El correo no tiene un formato válido.",
    });
    expect(fake.ultima("clientes", "update")).toBeUndefined();
  });

  it("acepta que el cliente no tenga correo", async () => {
    const fake = montar();
    const res = await actualizarCliente(form({ ...completo, correo: "" }));

    expect(res).toEqual({ ok: true });
    const payload = fake.ultima("clientes", "update")?.payload as Record<
      string,
      unknown
    >;
    expect(payload.correo).toBeNull();
  });

  it("no escribe si el formulario vino sin RUT", async () => {
    const fake = montar();
    const res = await actualizarCliente(form({ nombre: "Ana" }));

    expect(res).toEqual({
      ok: false,
      error: "No se pudo identificar al cliente.",
    });
    expect(fake.ultima("clientes", "update")).toBeUndefined();
  });

  it("avisa cuando el update falla en vez de cerrar el dialogo igual", async () => {
    montar({
      "clientes.update": {
        error: { code: "42501", message: "permission denied" },
      },
    });
    const res = await actualizarCliente(form(completo));

    expect(res.ok).toBe(false);
    expect((res as { error: string }).error).toBe(
      "Tu usuario no tiene permiso para hacer esto.",
    );
  });
});
