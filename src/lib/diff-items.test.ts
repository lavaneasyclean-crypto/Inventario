import { describe, it, expect } from "vitest";
import { diffItems, resumirDiff, type LineaComparable } from "./diff-items";

const ambo = (detalle: string | null, cantidad = 2): LineaComparable => ({
  nombre: "Ambo",
  cantidad,
  detalle,
});

describe("diffItems", () => {
  it("ve un detalle que cambio, que es el caso de todos los dias", () => {
    const c = diffItems(
      [ambo("color azul marino muy apretada tela")],
      [ambo("color azul marino muy apretada tela (prueba)")],
    );
    expect(c).toEqual([
      {
        linea: "Ambo",
        antes: "2 — color azul marino muy apretada tela",
        despues: "2 — color azul marino muy apretada tela (prueba)",
      },
    ]);
  });

  it("ve una cantidad que cambio", () => {
    const c = diffItems([ambo(null, 2)], [ambo(null, 5)]);
    expect(c).toEqual([{ linea: "Ambo", antes: "2", despues: "5" }]);
  });

  it("ve una prenda que se agrego", () => {
    const c = diffItems(
      [ambo(null)],
      [ambo(null), { nombre: "Camisa", cantidad: 1, detalle: null }],
    );
    expect(c).toEqual([{ linea: "Camisa", antes: null, despues: "1" }]);
  });

  it("ve una prenda que se saco", () => {
    const c = diffItems(
      [ambo(null), { nombre: "Camisa", cantidad: 1, detalle: null }],
      [ambo(null)],
    );
    expect(c).toEqual([{ linea: "Camisa", antes: "1", despues: null }]);
  });

  it("si no cambio nada devuelve null, no una lista vacia", () => {
    // Asi quien llama sabe que no tiene sentido escribir un registro.
    expect(diffItems([ambo("igual")], [ambo("igual")])).toBeNull();
    expect(diffItems([], [])).toBeNull();
  });

  it("no se confunde por el orden de las lineas", () => {
    const a = [ambo(null), { nombre: "Camisa", cantidad: 1, detalle: null }];
    const b = [{ nombre: "Camisa", cantidad: 1, detalle: null }, ambo(null)];
    expect(diffItems(a, b)).toBeNull();
  });

  it("en las guias por bolsa, la bolsa es parte de la identidad", () => {
    // La misma prenda en dos bolsas distintas son dos lineas distintas: si no,
    // mover tres poleras de la bolsa 21 a la 22 parece que no paso nada.
    const c = diffItems(
      [{ nombre: "Polera", cantidad: 3, bolsa: "21", detalle: null }],
      [{ nombre: "Polera", cantidad: 3, bolsa: "22", detalle: null }],
    );
    expect(c).toEqual([
      { linea: "Polera (bolsa 21)", antes: "3", despues: null },
      { linea: "Polera (bolsa 22)", antes: null, despues: "3" },
    ]);
  });

  it("junta dos lineas de la misma prenda en la misma bolsa", () => {
    const c = diffItems(
      [{ nombre: "Polera", cantidad: 2, bolsa: "21", detalle: null }],
      [
        { nombre: "Polera", cantidad: 1, bolsa: "21", detalle: null },
        { nombre: "Polera", cantidad: 1, bolsa: "21", detalle: null },
      ],
    );
    // 1 + 1 es lo mismo que 2: en la guia se leen igual.
    expect(c).toBeNull();
  });

  it("un detalle que solo cambia en espacios no es un cambio", () => {
    expect(diffItems([ambo("  azul  ")], [ambo("azul")])).toBeNull();
  });
});

describe("resumirDiff", () => {
  it("cuenta cada cosa por su nombre", () => {
    const c = [
      { linea: "A", antes: null, despues: "1" },
      { linea: "B", antes: "2", despues: "3" },
      { linea: "C", antes: "1", despues: null },
    ];
    expect(resumirDiff(c)).toBe("1 agregada, 1 cambiada, 1 quitada");
  });

  it("no nombra lo que no paso", () => {
    expect(resumirDiff([{ linea: "A", antes: "1", despues: "2" }])).toBe(
      "1 cambiada",
    );
  });
});
