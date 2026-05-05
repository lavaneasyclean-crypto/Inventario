import { describe, it, expect } from "vitest";
import { isValidRutFormat, normalizeRut } from "./rut";

describe("normalizeRut", () => {
  it("acepta el formato canonico tal cual", () => {
    expect(normalizeRut("12345678-9")).toBe("12345678-9");
    expect(normalizeRut("76116233-K")).toBe("76116233-K");
  });

  it("convierte k minuscula a mayuscula", () => {
    expect(normalizeRut("76116233-k")).toBe("76116233-K");
  });

  it("quita puntos", () => {
    expect(normalizeRut("12.345.678-9")).toBe("12345678-9");
    expect(normalizeRut("76.116.233-K")).toBe("76116233-K");
  });

  it("inserta el guion si vino sin el", () => {
    expect(normalizeRut("123456789")).toBe("12345678-9");
    expect(normalizeRut("76116233K")).toBe("76116233-K");
  });

  it("ignora espacios", () => {
    expect(normalizeRut(" 12345678-9 ")).toBe("12345678-9");
    expect(normalizeRut("12 345 678-9")).toBe("12345678-9");
  });

  it("devuelve null para entradas invalidas", () => {
    expect(normalizeRut("")).toBe(null);
    expect(normalizeRut("abc")).toBe(null);
    expect(normalizeRut(",0")).toBe(null);
    expect(normalizeRut("|*-")).toBe(null);
    expect(normalizeRut(null)).toBe(null);
    expect(normalizeRut(undefined)).toBe(null);
  });

  it("rechaza RUTs con DV invalido (ni digito ni K)", () => {
    expect(normalizeRut("12345678-Z")).toBe(null);
    expect(normalizeRut("12345678-A")).toBe(null);
  });

  it("rechaza si la parte numerica supera 8 digitos", () => {
    expect(normalizeRut("123456789-0")).toBe(null);
  });
});

describe("isValidRutFormat", () => {
  it("valida formato canonico", () => {
    expect(isValidRutFormat("12345678-9")).toBe(true);
    expect(isValidRutFormat("76116233-K")).toBe(true);
    expect(isValidRutFormat("1-1")).toBe(true);
  });

  it("rechaza formatos sucios", () => {
    expect(isValidRutFormat("12.345.678-9")).toBe(false);
    expect(isValidRutFormat("123456789")).toBe(false);
    expect(isValidRutFormat("76116233-k")).toBe(false);
    expect(isValidRutFormat("")).toBe(false);
    expect(isValidRutFormat(null as unknown as string)).toBe(false);
  });
});
