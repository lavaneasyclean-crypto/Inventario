import { describe, it, expect, vi } from "vitest";
import {
  crearSupabaseFake,
  type RespuestaFake,
  type SupabaseFake,
} from "@/lib/testing/supabase-fake";

const estado = vi.hoisted(() => ({ supabase: null as unknown }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => estado.supabase,
}));

import { searchPedidos } from "./pedidos";

function montar(respuestas: Record<string, RespuestaFake> = {}): SupabaseFake {
  const fake = crearSupabaseFake({ "pedidos.select": { data: [] }, ...respuestas });
  estado.supabase = fake;
  return fake;
}

/** El cuerpo del `.or(...)` que armó la consulta. */
function filtroOr(fake: SupabaseFake): string {
  const llamada = fake.ultima("pedidos", "select");
  const or = llamada?.filtros.find((f) => f.metodo === "or");
  return (or?.args[0] as string) ?? "";
}

describe("searchPedidos — búsqueda libre", () => {
  it("un RUT parcial busca por RUT y no solo por número de pedido", async () => {
    const fake = montar();
    await searchPedidos({ q: "201588" });

    const or = filtroOr(fake);
    // El bug: un término de solo dígitos se tomaba como número de pedido y
    // nada más, así que buscar por RUT nunca podía funcionar.
    expect(or).toContain("rut_cliente.ilike");
    expect(or).toContain("201588");
    expect(or).toContain("id.eq.201588");
  });

  it("un RUT completo sin guion tambien busca el canonico con guion", async () => {
    const fake = montar();
    await searchPedidos({ q: "201588987" });

    // En la base los RUT estan como 20158898-7: sin esto, pegar el RUT
    // entero sin guion no encontraba nada.
    expect(filtroOr(fake)).toContain("20158898-7");
  });

  it("busca por nombre cuando no parece un RUT", async () => {
    const fake = montar();
    await searchPedidos({ q: "Carolina" });

    const or = filtroOr(fake);
    expect(or).toContain("nombre_cliente.ilike");
    expect(or).toContain("Carolina");
    // Nada de id: no son digitos.
    expect(or).not.toContain("id.eq");
  });

  it("un numero sigue encontrando el pedido por su id", async () => {
    const fake = montar();
    await searchPedidos({ q: "13544" });

    expect(filtroOr(fake)).toContain("id.eq.13544");
  });

  it("no manda id.eq con algo que no entra en un bigint", async () => {
    const fake = montar();
    await searchPedidos({ q: "123456789012345678901234567890" });

    expect(filtroOr(fake)).not.toContain("id.eq");
  });

  it("sin termino no arma filtro de busqueda", async () => {
    const fake = montar();
    await searchPedidos({ q: "   " });

    expect(filtroOr(fake)).toBe("");
  });
});
