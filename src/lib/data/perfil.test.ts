import { describe, it, expect, vi } from "vitest";
import {
  crearSupabaseFake,
  type RespuestaFake,
} from "@/lib/testing/supabase-fake";

const estado = vi.hoisted(() => ({
  supabase: null as unknown,
  usuario: { id: "u-1" } as { id: string } | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => estado.supabase,
}));

import { esAdmin, getRolActual } from "./perfil";

/**
 * El doble no sabe de auth, así que se le pega encima el `auth.getUser` que
 * usa el módulo. Lo que se testea es la decisión del rol, no Supabase.
 */
function montar(
  respuestas: Record<string, RespuestaFake> = {},
  usuario: { id: string } | null = { id: "u-1" },
) {
  const fake = crearSupabaseFake(respuestas) as unknown as Record<
    string,
    unknown
  >;
  fake.auth = { getUser: async () => ({ data: { user: usuario } }) };
  estado.supabase = fake;
  return fake;
}

describe("getRolActual", () => {
  it("devuelve admin cuando el perfil lo dice", async () => {
    montar({ "perfiles.select": { data: { rol: "admin" } } });
    expect(await getRolActual()).toBe("admin");
    expect(await esAdmin()).toBe(true);
  });

  it("devuelve ventas cuando el perfil lo dice", async () => {
    montar({ "perfiles.select": { data: { rol: "ventas" } } });
    expect(await getRolActual()).toBe("ventas");
    expect(await esAdmin()).toBe(false);
  });

  // Las tres de abajo son la misma regla: ante la duda, el acceso chico. Un
  // fallo de red no puede terminar mostrando las finanzas.
  it("ante un perfil que no existe, ventas", async () => {
    montar({ "perfiles.select": { data: null } });
    expect(await getRolActual()).toBe("ventas");
  });

  it("ante un error de la base, ventas", async () => {
    montar({
      "perfiles.select": { error: { code: "08006", message: "connection" } },
    });
    expect(await getRolActual()).toBe("ventas");
  });

  it("sin sesión, ventas y no se consulta la base", async () => {
    const fake = montar({}, null);
    expect(await getRolActual()).toBe("ventas");
    expect((fake.llamadas as unknown[]).length).toBe(0);
  });

  it("un rol desconocido no se interpreta como admin", async () => {
    montar({ "perfiles.select": { data: { rol: "dueño" } } });
    expect(await getRolActual()).toBe("ventas");
  });
});
