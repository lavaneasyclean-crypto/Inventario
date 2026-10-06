import { describe, it, expect } from "vitest";
import { enGrupos, traerTodas } from "./paginado";

/** Simula PostgREST: corta en 1000 filas por consulta. */
function fuente(total: number) {
  const llamadas: Array<[number, number]> = [];
  const pedir = async (desde: number, hasta: number) => {
    llamadas.push([desde, hasta]);
    const fin = Math.min(hasta + 1, total);
    const data = desde >= total ? [] : Array.from({ length: fin - desde }, (_, i) => desde + i);
    return { data, error: null };
  };
  return { pedir, llamadas };
}

describe("traerTodas", () => {
  it("trae mas de mil filas, que es donde PostgREST cortaba", async () => {
    // El caso real: Acacias con 8.514 lineas devolvia 1.000.
    const f = fuente(8514);
    const filas = await traerTodas(f.pedir);
    expect(filas).toHaveLength(8514);
    expect(filas[0]).toBe(0);
    expect(filas[8513]).toBe(8513);
  });

  it("una sola pagina cuando entra todo", async () => {
    const f = fuente(42);
    expect(await traerTodas(f.pedir)).toHaveLength(42);
    expect(f.llamadas).toHaveLength(1);
  });

  it("no pide una pagina de mas cuando la ultima viene incompleta", async () => {
    const f = fuente(1500);
    await traerTodas(f.pedir);
    expect(f.llamadas).toEqual([[0, 999], [1000, 1999]]);
  });

  it("con exactamente mil pide una mas para saber que no hay nada", async () => {
    // No se puede distinguir "mil justas" de "hay mas" sin preguntar.
    const f = fuente(1000);
    expect(await traerTodas(f.pedir)).toHaveLength(1000);
    expect(f.llamadas).toHaveLength(2);
  });

  it("sin filas devuelve vacio", async () => {
    expect(await traerTodas(fuente(0).pedir)).toEqual([]);
  });

  it("propaga el error en vez de devolver lo que alcanzo a llegar", async () => {
    // Devolver datos parciales como completos es lo que hacia el codigo
    // anterior: una factura corta no se distingue de una correcta.
    let n = 0;
    await expect(
      traerTodas(async (desde, hasta) => {
        if (n++ === 1) return { data: null, error: { message: "se cayo" } };
        return {
          data: Array.from({ length: 1000 }, (_, i) => desde + i),
          error: null,
        };
      }),
    ).rejects.toEqual({ message: "se cayo" });
  });

  it("data en null se trata como pagina vacia y corta", async () => {
    const filas = await traerTodas<number>(async () => ({ data: null, error: null }));
    expect(filas).toEqual([]);
  });
});

describe("enGrupos", () => {
  it("parte la lista para no armar una URL de kilometros", () => {
    const g = enGrupos(Array.from({ length: 1200 }, (_, i) => i));
    expect(g.map((x) => x.length)).toEqual([500, 500, 200]);
  });

  it("una lista corta queda en un solo grupo", () => {
    expect(enGrupos([1, 2, 3])).toEqual([[1, 2, 3]]);
  });

  it("sin items no hay grupos", () => {
    expect(enGrupos([])).toEqual([]);
  });

  it("respeta un tamano a medida", () => {
    expect(enGrupos([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
