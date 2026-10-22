import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { crearSupabaseFake, type SupabaseFake } from "@/lib/testing/supabase-fake";

const estado = vi.hoisted(() => ({
  supabase: null as unknown,
  admin: true,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => estado.supabase,
}));
vi.mock("@/lib/data/perfil", () => ({
  esAdmin: async () => estado.admin,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { cambiarActivoEmpresa } from "./actions";

const logSilenciado = vi
  .spyOn(console, "error")
  .mockImplementation(() => undefined);
afterAll(() => logSilenciado.mockRestore());

describe("cambiarActivoEmpresa", () => {
  let fake: SupabaseFake;
  beforeEach(() => {
    fake = crearSupabaseFake({ "clientes_empresa.update": { data: null } });
    estado.supabase = fake;
    estado.admin = true;
  });

  it("un admin desactiva", async () => {
    const res = await cambiarActivoEmpresa("86667200-8", false);
    expect(res.ok).toBe(true);

    const llamada = fake.ultima("clientes_empresa", "update");
    expect(llamada?.payload).toEqual({ activo: false });
    expect(llamada?.filtros).toContainEqual({
      metodo: "eq",
      args: ["rut", "86667200-8"],
    });
  });

  it("y vuelve a activar", async () => {
    await cambiarActivoEmpresa("86667200-8", true);
    expect(fake.ultima("clientes_empresa", "update")?.payload).toEqual({
      activo: true,
    });
  });

  it("ventas NO puede, y no escribe nada", async () => {
    // Esconder el boton no alcanza: un server action se puede llamar igual.
    // La regla tiene que estar donde se ejecuta.
    estado.admin = false;
    const res = await cambiarActivoEmpresa("86667200-8", false);

    expect(res.ok).toBe(false);
    expect((res as { error: string }).error).toMatch(/permiso/i);
    expect(fake.llamadas).toHaveLength(0);
  });
});
