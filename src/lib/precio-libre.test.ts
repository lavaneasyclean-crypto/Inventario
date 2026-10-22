import { describe, it, expect } from "vitest";
import { tienePrecioLibre } from "./precio-libre";

describe("tienePrecioLibre", () => {
  it("precio 0 en el catálogo = el precio se pregunta al cargar", () => {
    expect(tienePrecioLibre({ precio: 0 })).toBe(true);
  });

  it("una prenda con precio de lista, no", () => {
    expect(tienePrecioLibre({ precio: 10500 })).toBe(false);
  });

  it("la base devuelve numeric como texto: igual tiene que funcionar", () => {
    expect(tienePrecioLibre({ precio: "0" as unknown as number })).toBe(true);
    expect(tienePrecioLibre({ precio: "0.00" as unknown as number })).toBe(true);
    expect(tienePrecioLibre({ precio: "4500" as unknown as number })).toBe(false);
  });

  it("sin producto, no: ante la duda el precio no se toca", () => {
    expect(tienePrecioLibre(null)).toBe(false);
    expect(tienePrecioLibre(undefined)).toBe(false);
  });
});
