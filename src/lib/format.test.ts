import { describe, it, expect } from "vitest";
import { formatCLP, formatDate, formatDateShort, diasDesde } from "./format";

describe("formatCLP", () => {
  it("formatea numeros como CLP", () => {
    expect(formatCLP(1500)).toMatch(/\$/);
    expect(formatCLP(1500)).toContain("1.500");
    expect(formatCLP(186600)).toContain("186.600");
  });

  it("acepta strings numericos", () => {
    expect(formatCLP("1500")).toContain("1.500");
    expect(formatCLP("0")).toContain("0");
  });

  it("devuelve dash para null/undefined", () => {
    expect(formatCLP(null)).toBe("—");
    expect(formatCLP(undefined)).toBe("—");
  });

  it("devuelve dash para NaN o strings no numericos", () => {
    expect(formatCLP("abc")).toBe("—");
  });

  it("maneja negativos (descuentos)", () => {
    const out = formatCLP(-3500);
    expect(out).toContain("3.500");
    expect(out).toMatch(/-/);
  });

  it("no muestra decimales (CLP es entero)", () => {
    expect(formatCLP(1500.99)).not.toContain(",");
  });
});

describe("formatDate", () => {
  it("formatea ISO strings con dia y hora", () => {
    const out = formatDate("2026-02-21T11:13:00-03:00");
    expect(out).toMatch(/feb/i);
    expect(out).toMatch(/21/);
  });

  it("acepta Date", () => {
    // Mediodia hora Chile para que el dia no cambie entre TZs
    const out = formatDate(new Date("2026-04-15T15:00:00Z"));
    expect(out).toMatch(/abr/i);
  });

  it("devuelve dash para null/undefined/invalid", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("nada")).toBe("—");
  });
});

describe("formatDateShort", () => {
  it("solo dia y mes", () => {
    // Mediodia hora Chile -> el dia es estable independiente del TZ del runner
    const out = formatDateShort("2026-04-15T12:00:00-03:00");
    expect(out).toMatch(/abr/i);
    expect(out).toMatch(/15/);
    expect(out).not.toMatch(/:/); // sin hora
  });

  it("vacios", () => {
    expect(formatDateShort(null)).toBe("—");
  });
});

describe("diasDesde", () => {
  it("calcula diferencia en dias", () => {
    const hace3 = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    expect(diasDesde(hace3)).toBe(3);
  });

  it("devuelve 0 para vacios", () => {
    expect(diasDesde(null)).toBe(0);
    expect(diasDesde(undefined)).toBe(0);
    expect(diasDesde("nada")).toBe(0);
  });
});
